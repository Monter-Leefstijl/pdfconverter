import { describe, it, expect } from "vitest";
import { convertFile } from "./testClient";

describe("HTML → PDF conversion", () => {
  it("converts examples/html.html to PDF", async () => {
    const { res, body } = await convertFile("examples/html.html");

    expect(res.status, "status code").toBe(200);
    const contentType = res.headers.get("content-type") ?? "";
    expect(contentType).toContain("application/pdf");

    // Basic sanity check: non-empty PDF-like output
    expect(body.length).toBeGreaterThan(100);
    expect(body.subarray(0, 4).toString()).toBe("%PDF");
  });
});
