# Monter PDF Converter

[![Docker pulls](https://img.shields.io/docker/pulls/monterleefstijl/pdfconverter?style=flat&logo=docker&logoColor=white)](https://hub.docker.com/r/monterleefstijl/pdfconverter)

Monter PDF Converter is a simple, developer-friendly API for converting various document formats into high-quality PDF 
files. It is designed to handle multiple *concurrent* jobs, and ensures high-availability with health checks and automatic
restarts.

It is used in production by [Monter Leefstijl](https://www.monterleefstijl.nl/).

## Chromium and LibreOffice

Monter PDF Converter uses **Chromium** and **LibreOffice** to convert to PDFs to faithfully reproduce the formatting and
layout of the original documents.

- **Chromium**: For converting HTML files, Chromium is well-suited because it accurately renders HTML, CSS, and 
  JavaScript, and supports modern web standards, ensuring that styles, fonts and other elements are preserved.
- **LibreOffice**: For conversion from Word, Excel, PowerPoint and other document formats, LibreOffice is well-suited
  because of its ability to produce clean, high-quality PDFs with proper formatting and layout.

## Key features

- **High-quality PDFs**: Uses Chromium (for HTML) and LibreOffice (for other documents) to produce high-quality PDFs.
- **Multi-format support**: Converts HTML, DOCX, PPTX, XLSX, and other document formats to PDF.
- **Fast and concurrent**: Handles multiple conversion jobs concurrently and queues additional jobs.
- **Health checks**: Provides a health check endpoint to monitor the service status.
- **High-availability**: Ensures high-availability by automatically restarting child services (i.e. Chromium and LibreOffice) in case of failure.
- **Highly configurable**: Allows customization of various settings through environment variables.
- **Lightweight**: The entire source code is under 1000 LOC.

## Endpoints

The following endpoints are available:

- `POST /`: Convert a document to PDF.
- `GET /healthcheck`: Check the health of the service.

### `POST /`: Convert a document to PDF

```shell
curl --location 'http://localhost:8080' \
  --form 'input=@"index.html"' \
  --form 'resources=@"dog.jpg"' \
  --form 'resources=@"cat.jpg"'
```

#### Request

The endpoint accept a `multipart/form-data` request with the following fields:

- `input` (*required*): The document to convert.
- `resources` (*optional*): Additional resources for conversion from `.html` and `.xhtml` to PDF.

The `input` field should contain a document with one of the following MIME-types:

- `text/html`: `.html` files;
- `application/xhtml+xml`: `.xhtml` files;
- `application/msword`: `.doc` and `.dot` files;
- `application/vnd.openxmlformats-officedocument.wordprocessingml.document`: `.docx` files;
- `application/vnd.ms-excel`: `.xls`, `.xlt` and `.xla` files;
- `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`: `.xlsx` files;
- `application/vnd.ms-powerpoint`: `.ppt`, `.pot`, `.pps` and `.ppa` files;
- `application/vnd.openxmlformats-officedocument.presentationml.presentation`: `.pptx` files.
- `application/vnd.oasis.opendocument.presentation`: `.odp` files.
- `application/vnd.oasis.opendocument.spreadsheet`: `.ods` files.
- `application/vnd.oasis.opendocument.text`: `.odt` files.
- `application/pdf`: `.pdf` files.

The `resources` field can contain additional resources for conversion from `.html` and `.xhtml` that cannot be embedded in
the file itself. For example, if the file contains an image tag referencing `dog.jpg`, it may be included as a resource
to have it be displayed in the PDF.

#### Response

- `200 OK`: The document is successfully converted to a PDF. The response will contain the PDF file with content-type
  `application/pdf`.
- `400 Bad Request`: The request is invalid (e.g. missing required `input` field).
- `413 Payload Too Large`: The document is too large to be processed.
- `415 Unsupported Media Type`: The document type is not supported.
- `502 Bad Gateway`: The conversion failed in LibreOffice or Chromium.
- `503 Service Unavailable`: The request is denied because the job queue is full.
- `504 Gateway Timeout`: The conversion took too long to complete.

### `GET /healthcheck`: Check the health of the service

```shell
curl --location 'http://localhost:8080/healthcheck'
```

#### Request

The endpoint accepts a `GET` request with no parameters.

#### Response

- `200 OK`: The service is healthy.
- `503 Service Unavailable`: The service is unhealthy.

```json
{
    "health": {
        "browser": "healthy",
        "unoservers": {
            "2003": "healthy",
            "2004": "healthy",
            "2005": "healthy",
            "2006": "healthy",
            "2007": "healthy",
            "2008": "healthy",
            "2009": "healthy",
            "2010": "healthy",
            "2011": "healthy",
            "2012": "healthy",
            "2013": "healthy",
            "2014": "healthy"
        },
        "webserver": "healthy",
        "jobQueue": "healthy"
    }
}
```

## Settings

Below is a table of environment variables that can be used to configure the service.

| Name                          | Description                                                                                          | Default value               |
|-------------------------------|------------------------------------------------------------------------------------------------------|-----------------------------|
| `WEBSERVER_PORT`              | The port the web server listens on.                                                                  | `8080`                      |
| `CHROME_EXECUTABLE_PATH`      | The path to the Chrome executable.                                                                   | `/usr/bin/chromium-browser` |
| `LIBREOFFICE_EXECUTABLE_PATH` | The path to the LibreOffice executable.                                                              | `/usr/bin/libreoffice`      |
| `UNOSERVER_EXECUTABLE_PATH`   | The path to the Unoserver executable.                                                                | `/usr/bin/unoserver`        |
| `UNOCONVERT_EXECUTABLE_PATH`  | The path to the Unoconvert executable.                                                               | `/usr/bin/unoconvert`       |
| `UNOSERVER_LAUNCH_TIMEOUT`    | The maximum time to wait in milliseconds for unoserver to launch.                                    | `30000` (30 seconds)        |
| `CHROME_LAUNCH_TIMEOUT`       | The maximum time to wait in milliseconds for Chrome to launch.                                       | `30000` (30 seconds)        |
| `CHROME_RESTART_INTERVAL`     | The interval in milliseconds to restart the browser.                                                 | `86400000` (1 day)          |
| `PDF_RENDER_TIMEOUT`          | The maximum time to spend rendering a single PDF.                                                    | `150000` (2.5 minutes)      |
| `MAX_FILE_SIZE`               | The maximum size in bytes for each uploaded file.                                                    | `134217728` (128 MB)        |
| `MAX_CONCURRENT_JOBS`         | The maximum number of concurrent jobs. Settings this to a high value may cause unexpected behaviour. | `6`                         | 
| `MAX_QUEUED_JOBS`             | The maximum number of jobs in the queue.                                                             | `128`                       |
| `MAX_RESOURCE_COUNT`          | The maximum number of resources (e.g. images) that can be uploaded.                                  | `16`                        |
| `MAX_RESTARTS`                | The maximum number of times processes can be restarted within 60 seconds before giving up.           | `3`                         |
| `RESTART_DELAY`               | The interval in milliseconds to wait before restarting subprocesses.                                 | `5000` (5 seconds)          |

## Installation

> [!IMPORTANT]
> It is not recommended to expose Monter PDF Converter to the world directly, unless you take proper precautions (such as sandboxing or using a separate server).

1.  Follow [this guide](https://docs.docker.com/engine/install/) to install Docker on your machine.
2.  Follow [this guide](https://docs.docker.com/compose/install/) to install Docker Compose on your machine.
3.  Create a `docker-compose.yaml` file with the following content:

    ```yaml
    name: pdfconverter
    services:
      pdfconverter:
        image: monterleefstijl/pdfconverter:latest
        healthcheck:
          test: ["CMD", "curl", "--fail", "http://localhost:8080/healthcheck"]
          interval: 60s
          timeout: 10s
          retries: 3
          start_period: 10s
        ports:
          - "8080:8080"
        # Required for rootless Docker
        cap_add:
          - SYS_ADMIN
        tmpfs:
          - /tmp:size=512M
        restart: always
    ```

5.  Start the service by running the following command:

    ```bash
    docker compose up -d
    ```

6.  The service is now running on port `8080` (to change the port, configure the port mapping in the
    `docker-compose.yaml` file).

## Contributing

Contributions are welcome! Please submit a pull request or open an issue to discuss any changes.

## License

This project is licensed under the MIT License. See the [LICENSE](https://github.com/Monter-Leefstijl/pdfconverter/blob/main/LICENSE) file for details.

## Contact

For any questions or support, please open an issue on GitHub.

## Alternatives

For comparison, consider exploring these alternatives:

- [Gotenberg](https://github.com/gotenberg/gotenberg): More comphrensive API, but without native support for concurrent jobs.
- [wkhtmltopdf](https://github.com/wkhtmltopdf/wkhtmltopdf): Command-line tool to convert HTML to PDF using WebKit.
- [puppeteer-html-to-pdf-converter](https://github.com/fritsvt/puppeteer-html-to-pdf-converter): Simple API for converting from HTML to PDF.
