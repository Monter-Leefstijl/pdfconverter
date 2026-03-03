import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { convertFile } from "./testClient";

const numbersPathEnv =
  process.env.TEST_NUMBERS_PATH ?? "examples/spreadsheet.numbers";
const numbersPath = resolve(process.cwd(), numbersPathEnv);

describe("Numbers → XLSX conversion", () => {
  if (!existsSync(numbersPath)) {
    it.skip(
      "converts a .numbers file to XLSX (requires TEST_NUMBERS_PATH or examples/spreadsheet.numbers)",
      () => {
        // skipped when no sample file is available
      },
    );
    return;
  }

  it("converts a .numbers file to XLSX when a sample is available", async () => {
    // Use the configured path relative to CWD to keep convertFile logic simple
    const relativePath =
      process.env.TEST_NUMBERS_PATH ?? "examples/spreadsheet.numbers";
    const { res, body } = await convertFile(relativePath, {
      output: "xlsx",
    });

    expect(res.status, "status code").toBe(200);
    const contentType = res.headers.get("content-type") ?? "";
    expect(contentType).toContain(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );

    expect(body.length).toBeGreaterThan(100);
  });
});

