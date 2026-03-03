import { describe, it, expect } from "vitest";
import { convertFile } from "./testClient";

describe("Markdown → PDF conversion", () => {
  it("converts examples/markdown.md to PDF using Pandoc", async () => {
    const { res, body } = await convertFile("examples/markdown.md");

    expect(res.status, "status code").toBe(200);
    const contentType = res.headers.get("content-type") ?? "";
    expect(contentType).toContain("application/pdf");

    expect(body.length).toBeGreaterThan(100);
    const text = body.toString("latin1");
    expect(text.includes("%PDF")).toBe(true);
  });
});

describe("Word → PDF conversion", () => {
  it("converts examples/word.docx to PDF using LibreOffice", async () => {
    const { res, body } = await convertFile("examples/word.docx");

    expect(res.status, "status code").toBe(200);
    const contentType = res.headers.get("content-type") ?? "";
    expect(contentType).toContain("application/pdf");

    expect(body.length).toBeGreaterThan(100);
    const text = body.toString("latin1");
    expect(text.includes("%PDF")).toBe(true);
  });
});

