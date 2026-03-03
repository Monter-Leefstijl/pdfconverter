import { describe, it, expect } from "vitest";
import { getHealthcheck } from "./testClient";

describe("/healthcheck", () => {
  it("returns 200 and a health object", async () => {
    const { res, json } = await getHealthcheck();

    expect(res.status, "status code").toBe(200);
    expect(res.headers.get("content-type") ?? "").toContain("application/json");

    expect(json && typeof json === "object").toBe(true);
    // Basic structural checks
    const health = (json as any).health;
    expect(health && typeof health === "object").toBe(true);
    expect(typeof health.browser).toBe("string");
    expect(typeof health.webserver).toBe("string");
    expect(typeof health.pandoc).toBe("string");
    expect(typeof health.jobQueue).toBe("string");
    expect(health.unoservers && typeof health.unoservers).toBe("object");
  });
});

