import { queue, QueueObject } from "async";
import {
  ChildProcess,
  ChildProcessWithoutNullStreams,
  spawn,
  execSync,
} from "child_process";
import chardet from "chardet";
import crypto from "crypto";
import express from "express";
import morgan from "morgan";
import multer, { MulterError } from "multer";
import puppeteer, {
  Browser, ProtocolError,
  PuppeteerError,
  TimeoutError as PuppeteerTimeoutError,
} from "puppeteer";
import _ from "lodash";
import * as fs from "node:fs";
import * as path from "node:path";

const settings = {
  // Port for the webserver
  webserverPort: process.env.WEBSERVER_PORT ?? 8080,
  // Path to the Chrome executable
  chromeExecutablePath:
      process.env.CHROME_EXECUTABLE_PATH ?? "/usr/bin/chromium-browser",
  // Path to the LibreOffice executable
  libreofficeExecutablePath:
      process.env.LIBREOFFICE_EXECUTABLE_PATH ?? "/usr/bin/libreoffice",
  // Path to the unoserver executable
  unoserverExecutablePath:
      process.env.UNOSERVER_EXECUTABLE_PATH ?? "/usr/bin/unoserver",
  // Path to the unoconvert executable
  unoconvertExecutablePath:
      process.env.UNOCONVERT_EXECUTABLE_PATH ?? "/usr/bin/unoconvert",
  // Max time in milliseconds to wait for unoserver to launch
  unoserverLaunchTimeout: process.env.UNOSERVER_LAUNCH_TIMEOUT ?? 30 * 1000, // 30 seconds,
  // Path to the Pandoc executable
  pandocExecutablePath:
      process.env.PANDOC_EXECUTABLE_PATH ?? "/usr/bin/pandoc",
  // Max time in milliseconds to wait for the browser to launch
  chromeLaunchTimeout: process.env.CHROME_LAUNCH_TIMEOUT ?? 30 * 1000, // 30 seconds
  // Interval in milliseconds to restart the browser
  chromeRestartInterval:
      process.env.CHROME_RESTART_INTERVAL ?? 24 * 60 * 60 * 1000, // 1 day
  // Max time in milliseconds to spend rendering a PDF
  pdfRenderTimeout: process.env.PDF_RENDER_TIMEOUT ?? 2.5 * 60 * 1000, // 2.5 minutes
  // Max size of each uploaded file
  maxFileSize: process.env.MAX_FILE_SIZE ?? 128 * 1024 * 1024, // 128 MB
  // Max number of concurrent jobs
  maxConcurrentJobs: process.env.MAX_CONCURRENT_JOBS ?? 6,
  // Max number of jobs in the queue
  maxQueuedJobs: process.env.MAX_QUEUED_JOBS ?? 128,
  // Max number of resources that can be uploaded
  maxResourceCount: process.env.MAX_RESOURCE_COUNT ?? 16,
  // Max number of times processes can be restarted within 60 seconds before giving up
  maxRestarts: process.env.MAX_RESTARTS ?? 3,
  // Interval in milliseconds to wait before restarting subprocesses
  restartDelay: process.env.RESTART_DELAY ?? 5000, // 5 seconds
};

type Health = {
  browser: "healthy" | "unhealthy";
  webserver: "healthy" | "unhealthy";
  pandoc: "healthy" | "unhealthy";
  jobQueue: "healthy" | "unhealthy";
  unoservers: Record<number, "healthy" | "unhealthy">;
};

type ConversionJob = () => Promise<void>;
type ConversionResult = {
  output: Buffer;
  mimeType: string;
};

/**
 * Keeps track of references to a value and cleans up when the reference count reaches zero.
 */
class RefCounted<T> {
  private count = 0;

  private markedForCollection = false;
  private collected = false;

  constructor(
      private readonly value: T,
      private readonly collect: (value: T) => void,
  ) {}

  get(): T {
    this.count += 1;

    return this.value;
  }

  release(): void {
    this.count -= 1;

    if (this.count <= 0 && this.markedForCollection && !this.collected) {
      this.collect(this.value);
      this.collected = true;
    }
  }

  markForCollection(): void {
    if (this.count <= 0 && !this.collected) {
      this.collect(this.value);
      this.collected = true;
    }

    // Signal the class to clean up when the reference count reaches zero
    this.markedForCollection = true;
  }

  isMarkedForCollection(): boolean {
    return this.markedForCollection;
  }
}

/**
 * Error thrown when a media type is not supported.
 */
class MediaTypeError extends Error {}

/**
 * Error thrown when conversion using LibreOffice failed.
 */
class UnoconvertError extends Error {}

/**
 * Error thrown when conversion using LibreOffice timed out.
 */
class UnoconvertTimeoutError extends Error {}

/**
 * Error thrown when conversion using Pandoc failed.
 */
class PandocError extends Error {}

/**
 * Error thrown when conversion using Pandoc timed out.
 */
class PandocTimeoutError extends Error {}

/**
 * Error thrown when the maximum number of restarts is exceeded.
 */
class MaxRestartsExceededError extends Error {}

/**
 * Manages the lifecycle of and communication to a LibreOffice (unoserver) instance.
 */
class Unoserver {
  private unoserverProcess?: ChildProcess;
  private ppidFile: string;
  private userInstallationDir: string;
  private timesRestarted = 0;
  private available = false;

  constructor(private readonly port: number) {
    const randomID = crypto.randomBytes(20).toString("hex");

    this.ppidFile = `/tmp/libreoffice-unoserver-${this.port}.pid.txt`;
    this.userInstallationDir = `/tmp/libreoffice-unoserver-${this.port}-${randomID}`;
  }

  isAvailable() {
    return this.available;
  }

  async start(): Promise<void> {
    if (this.timesRestarted > Number(settings.maxRestarts)) {
      throw new MaxRestartsExceededError(`Failed to start LibreOffice on port ${this.port} after ${this.timesRestarted - 1} attempts.`);
    }

    console.log(
        `[${new Date().toUTCString()}] Starting LibreOffice instance on port ${this.port}.`,
    );

    this.timesRestarted += 1;

    try {
      await this.spawnUnoserverProcess();

      console.log(
          `[${new Date().toUTCString()}] LibreOffice instance on port ${this.port} started.`,
      );

      health.unoservers[this.port] = "healthy";
      this.available = true;

      const resetRestartedCounterTimeout = setTimeout(() => {
        this.timesRestarted = 0;
      }, Number(settings.restartDelay) * Number(settings.maxRestarts) * 2);

      this.unoserverProcess?.on("exit", async () => {
        // Clear the reset timeout
        clearTimeout(resetRestartedCounterTimeout);
        // Mark the unoserver as unhealthy while it is restarting
        health.unoservers[this.port] = "unhealthy";
        // Mark the unoserver as unavailable while it is restarting
        this.available = false;

        console.log(
            `[${new Date().toUTCString()}] LibreOffice with port ${this.port} disconnected. Restarting after 5 seconds.`,
        );

        // Ensure associated LibreOffice process is killed
        try {
          const ppid = Number(fs.readFileSync(this.ppidFile));

          console.log(
              `[${new Date().toUTCString()}] Killing LibreOffice process with PPID ${ppid}.`,
          );

          execSync(`pkill -9 -P ${ppid}`);
        } catch (error) {
          console.log(
              `[${new Date().toUTCString()}] Failed to kill LibreOffice process (${error}).`,
          );
        }

        // Ensure the user installation directory is removed
        try {
          console.log(
              `[${new Date().toUTCString()}] Removing user installation directory for LibreOffice on port ${this.port}.`,
          );

          fs.rmSync(this.userInstallationDir, { recursive: true });
        } catch (error) {
          console.log(
              `[${new Date().toUTCString()}] Failed to remove user installation directory for LibreOffice on port ${this.port} (${error}).`,
          );
        }

        await new Promise((resolve) => setTimeout(resolve, Number(settings.restartDelay)));
        await this.start();
      });
    } catch (e) {
      console.log(
          `[${new Date().toUTCString()}] Failed to start LibreOffice on port ${this.port} (${e}). Retrying after 5 seconds.`,
      );

      await new Promise((resolve) => setTimeout(resolve, Number(settings.restartDelay)));
      await this.start();
    }
  }

  async convert(input: Buffer): Promise<Buffer> {
    // Mark the unoserver as unavailable while the conversion is in progress
    this.available = false;

    try {
      const unoconvertProcess = await this.spawnUnoconvertProcess();

      return await new Promise((resolve, reject) => {
        let outData = Buffer.alloc(128, "");
        let errData = Buffer.alloc(128, "");

        const timeoutHandler = setTimeout(() => {
          unoconvertProcess.kill("SIGKILL");
          this.unoserverProcess?.kill("SIGKILL");

          reject(new UnoconvertTimeoutError("unoconvert process timed out"));
        }, Number(settings.pdfRenderTimeout));

        unoconvertProcess.on("close", (code) => {
          clearTimeout(timeoutHandler);

          if (code === 0) {
            resolve(outData);
          } else {
            reject(
                new UnoconvertError(
                    `unoconvert process exited with code ${code}: ${errData.toString()}`,
                ),
            );
          }
        });

        // Read the output and error pipes 'outData' and 'errData'
        unoconvertProcess.stdout.on(
            "data",
            (data) => (outData = Buffer.concat([outData, data])),
        );
        unoconvertProcess.stderr.on(
            "data",
            (data) => (errData = Buffer.concat([errData, data])),
        );

        // Write the input to the input pipe
        unoconvertProcess.stdin.write(input);

        // Close the input pipe to start the conversion
        unoconvertProcess.stdin.end();
      });
    } finally {
      // Mark the unoserver as available again
      this.available = true;
    }
  }

  private async spawnUnoserverProcess() {
    const renderTimeout = Math.floor(Number(settings.pdfRenderTimeout) / 1000);
    const unoPort = this.port + 255;
    const args = [
      "--port",
      this.port.toString(),
      "--uno-port",
      unoPort.toString(),
      "--executable",
      settings.libreofficeExecutablePath,
      "--libreoffice-pid-file",
      this.ppidFile,
      "--user-installation",
      this.userInstallationDir,
      "--conversion-timeout",
      renderTimeout.toString(),
    ];

    // Remove the existing PID file, if it exists
    try {
      fs.unlinkSync(this.ppidFile);
    } catch {}

    const watcherPromise = new Promise<void>((resolve, reject) => {
      const watcher = fs.watch("/tmp");

      let pidFileCreated = false;
      let temporaryDirectoryCreated = false;

      const timeoutHandler = setTimeout(() => {
        watcher.close();
        reject(
            new Error(
                "Timeout while waiting for PID file and temporary directory to be created",
            ),
        );
      }, Number(settings.unoserverLaunchTimeout));

      watcher.on("change", (eventType, filename) => {
        if (
            eventType === "rename" &&
            filename === path.basename(this.ppidFile)
        ) {
          pidFileCreated = true;
        }

        if (
            eventType === "rename" &&
            filename === path.basename(this.userInstallationDir)
        ) {
          temporaryDirectoryCreated = true;
        }

        if (pidFileCreated && temporaryDirectoryCreated) {
          watcher.close();
          clearTimeout(timeoutHandler);
          resolve();
        }
      });
    });

    this.unoserverProcess = await new Promise((resolve, reject) => {
      // Start the process with ignored pipes
      // @see https://ask.libreoffice.org/t/the-conversion-of-docx-files-to-pdf-gets-stuck-after-reaching-a-certain-amount/102627
      const process = spawn(settings.unoserverExecutablePath, args, {
        stdio: "ignore",
      });

      process.on("error", () => {
        reject(
            new Error(`Failed to spawn LibreOffice process on port ${this.port}`),
        );
      });

      process.on("spawn", async () => {
        try {
          await watcherPromise;
          resolve(process);
        } catch (e) {
          reject(e);
        }
      });
    });
  }

  private async spawnUnoconvertProcess(): Promise<ChildProcessWithoutNullStreams> {
    const args = [
      "--port",
      this.port.toString(),
      "--convert-to",
      "pdf",
      "-", // Input from stdin
      "-", // Output to stdout
    ];

    const process = spawn(settings.unoconvertExecutablePath, args, {
      stdio: "pipe",
    });

    return new Promise((resolve, reject) => {
      process.on("error", async () => {
        reject(new UnoconvertError(`Failed to spawn unoconvert process`));
      });

      process.on("spawn", () => {
        resolve(process);
      });
    });
  }
}

/**
 * Manages the lifecycle of and communication to a Chromium browser instance.
 */
class ChromiumBrowser {
  private browserProcess?: RefCounted<Browser>;
  private restartInterval?: NodeJS.Timeout;
  private timesRestarted = 0;

  async start() {
    if (this.timesRestarted > Number(settings.maxRestarts)) {
      throw new MaxRestartsExceededError(`Failed to start headless browser after ${this.timesRestarted - 1} attempts.`);
    }

    console.log(`[${new Date().toUTCString()}] Starting headless browser.`);
    this.timesRestarted += 1;

    const oldBrowserProcess = this.browserProcess;

    try {
      // Launch the browser
      const newBrowserInstance = new RefCounted(
          await puppeteer.launch({
            timeout: Number(settings.chromeLaunchTimeout),
            headless: true,
            executablePath: settings.chromeExecutablePath,
            args: [
              "--disable-features=site-per-process",
              "--disable-translate",
              "--no-experiments",
              "--disable-breakpad",
              "--disable-extensions",
              "--disable-plugins",
              "--disable-infobars",
              "--disable-gpu",
              "--disable-setuid-sandbox",
              "--disable-dev-shm-usage",
              "--disable-session-crashed-bubble",
              "--disable-accelerated-2d-canvas",
              "--noerrdialogs",
            ],
          }),
          // Optional cleanup function, called when garbage collection is triggered.
          (browser) => {
            browser.close();
            ChromiumBrowser.cleanupBrowserData(browser);
          },
      );

      health.browser = "healthy";

      const resetRestartedCounterTimeout = setTimeout(() => {
          this.timesRestarted = 0;
      }, Number(settings.restartDelay) * Number(settings.maxRestarts) * 2);

      console.log(`[${new Date().toUTCString()}] Headless browser started.`);

      try {
        newBrowserInstance.get().on("disconnected", async () => {
          clearTimeout(resetRestartedCounterTimeout);

          if (newBrowserInstance.isMarkedForCollection()) {
            // If the browser instance is marked for collection, we do not restart it
            return;
          }

          try {
            ChromiumBrowser.cleanupBrowserData(newBrowserInstance.get());
          } finally {
            newBrowserInstance.release();
          }

          health.browser = "unhealthy";

          console.log(
              `[${new Date().toUTCString()}] Headless browser disconnected unexpectedly. Restarting after 5 seconds.`,
          );

          await new Promise((resolve) => setTimeout(resolve, Number(settings.restartDelay)));
          await this.start();
        });
      } finally {
        newBrowserInstance.release();
      }

      this.browserProcess = newBrowserInstance;
    } catch (error) {
      console.log(
          `[${new Date().toUTCString()}] Failed to start headless browser (${error}). Retrying after 5 seconds.`,
      );

      await new Promise((resolve) => setTimeout(resolve, Number(settings.restartDelay)));
      await this.start();
    } finally {
      oldBrowserProcess?.markForCollection();
    }

    if (!this.restartInterval) {
      // Restart the browser periodically
      this.restartInterval = setInterval(async () => {
        await this.start();
      }, Number(settings.chromeRestartInterval));
    }
  }

  async convert(input: Buffer, resources: Express.Multer.File[]): Promise<Buffer> {
    if (!this.browserProcess) {
      throw new Error("No available browser instance");
    }

    const browser = this.browserProcess?.get();

    try {
      const host = `http://${crypto.randomBytes(16).toString("hex")}/`;
      const page = await browser.newPage();
      const encoding = chardet.detect(input)?.toLowerCase() || "utf-8";

      try {
        page.setDefaultTimeout(Number(settings.pdfRenderTimeout));

        await Promise.all([
          page.setRequestInterception(true),
          page.setOfflineMode(true),
          page.setJavaScriptEnabled(false),
          page.setCacheEnabled(false),
        ]);

        page.on("request", (request) => {
          if (request.url() === host) {
            // Respond with the input HTML if the request is for the host
            request.respond({
              status: 200,
              contentType: `text/html;charset=${encoding}`,
              body: input,
              headers: { "Access-Control-Allow-Origin": host },
            });

            return;
          }

          if (request.initiator()?.url !== host) {
            // Additional origin check to prevent requests from other origins
            request.abort();
            return;
          }

          for (const resource of resources) {
            // Look for the resource in the uploaded files
            if (request.url() === host + resource.originalname) {
              request.respond({
                status: 200,
                contentType: resource.mimetype,
                body: resource.buffer,
                headers: { "Access-Control-Allow-Origin": host },
              });
              return;
            }
          }

          request.continue();
        });

        await page.goto(host, { waitUntil: "load" });

        return await page.pdf({
          format: "A4",
          timeout: Number(settings.pdfRenderTimeout),
        });
      } finally {
        page.close().catch(() => {
          console.log("[${new Date().toUTCString()}] Failed to close page.");
        });
      }
    } finally {
      this.browserProcess?.release();
    }
  }

  private static cleanupBrowserData(browser: Browser) {
    const spawnArgs = browser.process()?.spawnargs;
    if (!spawnArgs) {
      return;
    }

    for (const spawnArg of spawnArgs) {
      if (spawnArg.indexOf("--user-data-dir=") === 0) {
        const chromeTmpDataDir = spawnArg.replace("--user-data-dir=", "");
        try {
          console.log(
              `[${new Date().toUTCString()}] Removing temporary browser data directory.`,
          );

          if (
              fs.existsSync(chromeTmpDataDir) &&
              fs.lstatSync(chromeTmpDataDir).isDirectory() &&
              chromeTmpDataDir.startsWith("/tmp/")
          ) {
            fs.rmSync(chromeTmpDataDir, { recursive: true });
          }
        } catch (e) {
          console.log(
              `[${new Date().toUTCString()}] Failed to remove temporary browser data directory (${e}).`,
          );
        }
      }
    }
  }
}

/**
 * Manages communication to a Pandoc executable.
 */
class Pandoc {
  static extensionToPandocType: Record<string, string> = {
    '.md': 'markdown',
    '.markdown': 'markdown',
    '.mkd': 'markdown',
    '.txt': 'markdown',
    '.rst': 'rst',
    '.tex': 'latex',
    '.epub': 'epub',
    '.json': 'json',
    '.ipynb': 'ipynb',
    '.csv': 'csv',
    '.tsv': 'tsv',
    '.xml': 'xml',
  };

  static mimeToPandocType: Record<string, string> = {
    'text/markdown': 'markdown',
    'text/x-rst': 'rst',
    'application/epub+zip': 'epub',
    'application/json': 'json',
    'application/vnd.jupyter': 'ipynb',
    'text/csv': 'csv',
    'text/tab-separated-values': 'tsv',
    'application/xml': 'xml',
    'text/xml': 'xml',
  };

  async start(): Promise<void> {
    console.log(`[${new Date().toUTCString()}] Checking Pandoc executable.`);

    return new Promise((resolve, reject) => {
      fs.access(settings.pandocExecutablePath, fs.constants.X_OK, (err) => {
        if (!err) {
          console.log(`[${new Date().toUTCString()}] Pandoc executable found.`);

          health.pandoc = "healthy";
          resolve();
        } else {
          console.log(`[${new Date().toUTCString()}] Pandoc executable not found.`);

          reject();
        }
      });
    });
  }

  async convert(input: Buffer, from: string): Promise<Buffer> {
    const pandocProcess = await this.spawnPandocProcess(from);

    return await new Promise((resolve, reject) => {
      let outData = Buffer.alloc(128, "");
      let errData = Buffer.alloc(128, "");

      const timeoutHandler = setTimeout(() => {
        pandocProcess.kill("SIGKILL");

        reject(new PandocTimeoutError("Pandoc process timed out"));
      }, Number(settings.pdfRenderTimeout));

      pandocProcess.on("close", (code) => {
        clearTimeout(timeoutHandler);

        if (code === 0) {
          resolve(outData);
        } else {
          reject(
            new PandocError(
              `Pandoc process exited with code ${code}: ${errData.toString()}`,
            ),
          );
        }
      });

      // Read the output and error pipes 'outData' and 'errData'
      pandocProcess.stdout.on(
          "data",
          (data) => (outData = Buffer.concat([outData, data])),
      );
      pandocProcess.stderr.on(
          "data",
          (data) => (errData = Buffer.concat([errData, data])),
      );

      // Determine the encoding of the input buffer
      const encoding = chardet.detect(input)?.toLowerCase() || "utf-8";

      if (encoding !== "utf-8") {
        // Transform the input to UTF-8 if it is not already (see https://pandoc.org/MANUAL.html#character-encoding).
        // TODO
      }

      // Write the input to the input pipe
      pandocProcess.stdin.write(input);

      // Close the input pipe to start the conversion
      pandocProcess.stdin.end();
    });
  }

  /**
   * Tries to determine the given file's input type for use with Pandoc.
   *
   * @see https://pandoc.org/MANUAL.html#general-options
   */
  determineType(input: Express.Multer.File): string | undefined {
    const mimeToPandocType: Record<string, string> = {
      'text/markdown': 'markdown',
      'text/x-rst': 'rst',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
      'text/html': 'html',
      'application/vnd.oasis.opendocument.text': 'odt',
      'application/epub+zip': 'epub',
      'application/msword': 'doc',
      'application/json': 'json',
      'application/vnd.jupyter': 'ipynb',
      'application/vnd.ms-powerpoint': 'pptx',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
      'text/csv': 'csv',
      'text/tab-separated-values': 'tsv',
      'application/xml': 'xml',
      'text/xml': 'xml',
    };

    if (input.mimetype && mimeToPandocType[input.mimetype]) {
      return mimeToPandocType[input.mimetype];
    }

    const extensionToPandocType: Record<string, string> = {
      '.md': 'markdown',
      '.markdown': 'markdown',
      '.mkd': 'markdown',
      '.txt': 'markdown',
      '.rst': 'rst',
      '.tex': 'latex',
      '.docx': 'docx',
      '.html': 'html',
      '.htm': 'html',
      '.odt': 'odt',
      '.epub': 'epub',
      '.doc': 'doc',
      '.org': 'org',
      '.json': 'json',
      '.ipynb': 'ipynb',
      '.pptx': 'pptx',
      '.csv': 'csv',
      '.tsv': 'tsv',
      '.xml': 'xml',
    };

    const ext = path.extname(input.originalname).toLowerCase();

    if (ext && extensionToPandocType[ext]) {
      return extensionToPandocType[ext];
    }

    console.log(
      `[${new Date().toUTCString()}] Failed to determine file type.`,
    );

    return undefined;
  }

  private async spawnPandocProcess(from: string): Promise<ChildProcessWithoutNullStreams> {
    const args = [
      "--from",
      from,
      "--to",
      "pdf",
      "--out",
      "-",
      "--pdf-engine",
      "xelatex"
    ];

    const process = spawn(settings.pandocExecutablePath, args, {
      stdio: "pipe",
    });

    return new Promise((resolve, reject) => {
      process.on("error", async () => {
        reject(new PandocError(`Failed to spawn Pandoc process`));
      });

      process.on("spawn", () => {
        resolve(process);
      });
    });
  }
}

const unoserverPorts = _.range(2003, 2003 + Number(settings.maxConcurrentJobs));

let browserInstance: ChromiumBrowser;
let pandocInstance: Pandoc;
let unoserverInstances: Unoserver[] = [];
let webserverInstance: express.Express;
let jobQueue: QueueObject<ConversionJob>;

const health: Health = {
  browser: "unhealthy",
  pandoc: "unhealthy",
  unoservers: unoserverPorts.reduce(
      (acc: Record<number, "healthy" | "unhealthy">, port: number) => {
        acc[port] = "unhealthy";
        return acc;
      },
      {},
  ),
  webserver: "unhealthy",
  jobQueue: "unhealthy",
};

const uploadHandler = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: Number(settings.maxFileSize),
    fields: 1,
  },
}).fields([
  { name: "input", maxCount: 1 },
  { name: "resources", maxCount: Number(settings.maxResourceCount) },
]);

async function main() {
  // Initialize the webserver
  await initWebserver();

  webserverInstance.options("/healthcheck", (req, res) => {
    res.setHeader("Allow", "GET").status(204).send();
  });

  webserverInstance.get("/healthcheck", (req, res) => {
    const healthy =
        health.browser === "healthy" // The browser must be healthy
        && health.webserver === "healthy" // The webserver must be healthy
        && health.pandoc === "healthy" // Pandoc must be healthy
        && health.jobQueue === "healthy" // The jobqueue must be healthy
        && Object.values(health.unoservers).some( // At least one unoserver must be healthy
            (status) => status === "healthy"
        );

    const statusCode = healthy ? 200 : 503;

    res.status(statusCode).json({ health }).send();
  });

  try {
    // Initialize the other required services
    await Promise.all([initBrowser(), initJobQueue(), initUnoservers(), initPandoc()]);
  } catch (error) {
    console.log(`[${new Date().toUTCString()}] Failed to start services (${error}).`);
    process.exit(1);
  }

  webserverInstance.options("/", (req, res) => {
    res
        .setHeader("Accept", "multipart/form-data")
        .setHeader("Allow", "POST")
        .status(204)
        .send();
  });

  try {
    webserverInstance.post(
        "/",
        (req, res, next) => {
          uploadHandler(req, res, (error) => {
            if (error instanceof MulterError) {
              console.log(
                  `[${new Date().toUTCString()}] Multer error while uploading (${error}).`,
              );

              // Bad request
              res.status(400).send();
            } else if (error) {
              console.log(
                  `[${new Date().toUTCString()}] Unknown error while uploading (${error}).`,
              );

              // Internal server error
              res.status(500).send();
            } else {
              next();
            }
          });
        },
        (req, res) => {
          const conversionJob = createConversionJob(req, res);

          try {
            pushConversionJob(conversionJob);
          } catch (error) {
            console.log(`[${new Date().toUTCString()}] Job queue full.`);

            // Service unavailable
            res.status(503).send();
          }
        },
    );
  } catch (error) {
    console.log(`[${new Date().toUTCString()}] Unknown exception (${error}).`);
  }
}

function pushConversionJob(conversionJob: ConversionJob) {
  if (jobQueue.length() < Number(settings.maxQueuedJobs)) {
    // There is still room in the job queue
    jobQueue.push(conversionJob);
  } else {
    // Server is overloaded
    throw new Error("Job queue full");
  }
}

function createConversionJob(req: express.Request, res: express.Response) {
  return async () => {
    try {
      await handleConversionJob(req, res);
    } catch (error) {
      console.log(`[${new Date().toUTCString()}] Conversion job failed.`);
      console.error(error);
    }
  };
}

async function handleConversionJob(req: express.Request, res: express.Response) {
  // TypeScript doesn't recognize the Multer fields
  // @ts-ignore
  const input = (req.files?.input ?? []) as Express.Multer.File[];
  // @ts-ignore
  const resources = (req.files?.resources ?? []) as Express.Multer.File[];
  // @ts-ignore
  const type = req.body?.type;

  if (
    !Array.isArray(input) ||
    input.length !== 1 ||
    !Array.isArray(resources) ||
    resources.length > Number(settings.maxResourceCount) ||
    (type !== undefined && typeof type !== 'string' && !(type instanceof String))
  ) {
    // Bad request
    res.status(400).send();
    return;
  }

  try {
    const conversionResult = await convert(input[0], resources, type);

    const output = conversionResult.output;
    const mimeType = conversionResult.mimeType;

    res.setHeader("Content-Type", mimeType).status(200).send(output);
  } catch (error) {
    console.log(
        `[${new Date().toUTCString()}] Failed to generate PDF (${error}).`,
    );

    if (
        error instanceof PuppeteerTimeoutError ||
        error instanceof UnoconvertTimeoutError ||
        error instanceof PandocTimeoutError
    ) {
      // Gateway timeout
      res.status(504).send();
    } else if (
        error instanceof PuppeteerError  ||
        error instanceof ProtocolError ||
        error instanceof UnoconvertError ||
        error instanceof PandocError
    ) {
      // Bad gateway
      res.status(502).send();
    } else if (error instanceof MediaTypeError) {
      // Unsupported media type
      res.status(415).send();
    } else {
      // Internal server error
      res.status(500).send();
    }
  }
}

/**
 * Initializes the webserver with Express.
 *
 * @see https://expressjs.com/
 */
async function initWebserver() {
  console.log(
      `[${new Date().toUTCString()}] Starting webserver on port ${
          settings.webserverPort
      }.`,
  );

  try {
    webserverInstance = express();

    webserverInstance.use(
        morgan(
            "[:date[web]] :method :url :status :res[content-length] - :response-time ms",
        ),
    );

    const server = webserverInstance.listen(settings.webserverPort, () => {
      health.webserver = "healthy";
      console.log(
          `[${new Date().toUTCString()}] Webserver is listening on port ${
              settings.webserverPort
          }.`,
      );
    });

    // Set the request timeout to the render timeout plus an additional five seconds to account for handling
    // the request itself.
    server.setTimeout(Number(settings.pdfRenderTimeout) + 5 * 1000);
  } catch (error) {
    console.log(
        `[${new Date().toUTCString()}] Failed to start webserver (${error}). Retrying after 5 seconds.`,
    );

    await new Promise((resolve) => setTimeout(resolve, 5000));
    await initWebserver();
  }
}

/**
 * Initializes the job queue.
 *
 * @see https://caolan.github.io/async/v3/docs.html#queue
 */
async function initJobQueue() {
  console.log(`[${new Date().toUTCString()}] Starting job queue.`);

  jobQueue = queue(async (job, callback) => {
    await job();
    callback();
  }, Number(settings.maxConcurrentJobs));

  health.jobQueue = "healthy";
  console.log(`[${new Date().toUTCString()}] Job queue started.`);
}

/**
 * Initializes the LibreOffice unoserver instances.
 *
 * @see https://github.com/unoconv/unoserver
 */
async function initUnoservers() {
  console.log(
      `[${new Date().toUTCString()}] Starting ${settings.maxConcurrentJobs} LibreOffice instances.`,
  );

  for (const port of unoserverPorts) {
    const unoserverInstance = new Unoserver(port);
    unoserverInstances.push(unoserverInstance);
  }

  const promises = unoserverInstances.map((unoserverInstance) => unoserverInstance.start());
  await Promise.any(promises);

  Promise.all(promises).then(() => {
    console.log(
        `[${new Date().toUTCString()}] All ${settings.maxConcurrentJobs} LibreOffice instances started.`,
    );
  });
}

/**
 * Initializes the Chromium browser instance.
 *
 * @see https://pptr.dev/
 */
async function initBrowser() {
  browserInstance = new ChromiumBrowser();
  await browserInstance.start();
}

/**
 * Initializes Pandoc.
 *
 * @see https://pandoc.org/
 */
async function initPandoc() {
  pandocInstance = new Pandoc();
  await pandocInstance.start();
}

/**
 * Converts the given input file and resources to a PDF using an appropriate converter.
 */
async function convert(
    input: Express.Multer.File,
    resources: Express.Multer.File[],
    type?: string,
): Promise<ConversionResult> {
  switch (input.mimetype) {
    case "text/html":
    case "application/xhtml+xml":
      return await convertChrome(input, resources);
    case "application/msword": // .doc, .dot
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document": // .docx
    case "application/vnd.ms-excel": // .xls, .xlt, .xla
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": // .xlsx
    case "application/vnd.ms-powerpoint": // .ppt, .pot, .pps, .ppa
    case "application/vnd.openxmlformats-officedocument.presentationml.presentation": // .pptx
    case "application/vnd.oasis.opendocument.presentation": // .odp
    case "application/vnd.oasis.opendocument.spreadsheet": // .ods
    case "application/vnd.oasis.opendocument.text": // .odt
      return await convertLibreOffice(input);
    case "application/pdf": // .pdf
      return convertIdentity(input);
    default:
      // Fallback to using Pandoc
      return await convertPandoc(input, type);
  }
}

/**
 * Converts the given HTML to a PDF using Chromium.
 *
 * This converter supports files with the following MIME types:
 *
 * - text/html
 * - application/xhtml+xml
 *
 * @see https://pptr.dev/
 */
async function convertChrome(
    input: Express.Multer.File,
    resources: Express.Multer.File[],
): Promise<ConversionResult> {
  return {
    output: await browserInstance.convert(input.buffer, resources),
    mimeType: "application/pdf"
  };
}

/**
 * Converts the given document to a PDF using LibreOffice.
 *
 * This converter supports files with the following MIME types:
 *
 * - application/msword
 * - application/vnd.openxmlformats-officedocument.wordprocessingml.document
 * - application/vnd.ms-excel
 * - application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
 * - application/vnd.ms-powerpoint
 * - application/vnd.openxmlformats-officedocument.presentationml.presentation
 * - application/vnd.oasis.opendocument.presentation
 * - application/vnd.oasis.opendocument.spreadsheet
 * - application/vnd.oasis.opendocument.text
 *
 * @see https://www.libreoffice.org/
 */
async function convertLibreOffice(
    input: Express.Multer.File,
): Promise<ConversionResult> {
  for (const unoserverInstance of unoserverInstances) {
    if (unoserverInstance.isAvailable()) {
      return {
        output: await unoserverInstance.convert(input.buffer),
        mimeType: "application/pdf",
      };
    }
  }

  throw new Error("No available unoserver instances");
}

/**
 * Converts the given file to a PDF using Pandoc, or throws a MediaTypeError if the input
 * type could not be determined or is not supported.
 *
 * @see https://pandoc.org/
 */
async function convertPandoc(
    input: Express.Multer.File,
    type?: string,
): Promise<ConversionResult> {
  const inputType = type || pandocInstance.determineType(input);

  if (!inputType) {
    // Unsupported media type
    throw new MediaTypeError(`Unsupported media type: ${input.mimetype}`);
  }

  return {
    output: await pandocInstance.convert(input.buffer, inputType),
    mimeType: "application/pdf"
  };
}

/**
 * "Converts" the given PDF to a PDF.
 *
 * This converter supports files with the following MIME types:
 *
 * - application/pdf
 */
function convertIdentity(input: Express.Multer.File): ConversionResult {
  return {
    output: input.buffer,
    mimeType: "application/pdf",
  };
}

(async function () {
  await main();
})();
