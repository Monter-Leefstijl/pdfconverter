import { describe, it, expect } from "vitest";
import { convertFile } from "./testClient";

describe("Error handling and output formats", () => {
  it("returns 415 for unsupported/unknown input type", async () => {
    const { res } = await convertFile("LICENSE");

    expect(res.status, "status code").toBe(415);
  });

  it("returns 415 when using non-LibreOffice input with non-default output", async () => {
    const { res } = await convertFile("examples/html.html", {
      output: "xlsx",
    });

    expect(res.status, "status code").toBe(415);
  });

  it("returns 415 when using unsupported output format with LibreOffice input", async () => {
    const { res } = await convertFile("examples/word.docx", {
      output: "foo",
    });

    expect(res.status, "status code").toBe(415);
  });
});

