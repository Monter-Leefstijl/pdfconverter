import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const BASE_URL =
  process.env.PDFCONVERTER_BASE_URL ?? "http://localhost:1337";

export async function getHealthcheck() {
  const res = await fetch(`${BASE_URL}/healthcheck`);
  const bodyText = await res.text();

  let json: unknown = null;
  try {
    json = JSON.parse(bodyText);
  } catch {
    // ignore, assertions can handle null/invalid JSON
  }

  return { res, json };
}

type ConvertOptions = {
  output?: string;
  type?: string;
};

export async function convertFile(
  relativePath: string,
  options: ConvertOptions = {},
) {
  const absolutePath = resolve(process.cwd(), relativePath);
  const buffer = readFileSync(absolutePath);
  const fileName = absolutePath.split("/").pop() ?? "input";

  const form = new FormData();

  // Node 22 provides File via undici
  const file = new File([buffer], fileName);
  form.append("input", file);

  if (options.output) {
    form.append("output", options.output);
  }

  if (options.type) {
    form.append("type", options.type);
  }

  const res = await fetch(`${BASE_URL}/`, {
    method: "POST",
    body: form,
  });

  const arrayBuffer = await res.arrayBuffer();
  const body = Buffer.from(arrayBuffer);

  return { res, body };
}

