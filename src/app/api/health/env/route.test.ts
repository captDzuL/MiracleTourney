import { afterEach, describe, expect, it } from "vitest";

import { GET } from "./route";

const ORIGINAL_ENV = process.env;
const DEFAULT_SECRET = "miracle-tourney-jwt-secret-change-in-production-32chars-min";
const TEST_SECRET = "unit-test-secret-with-32-characters!!";

describe("environment health API", () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("reports when JWT_SECRET is missing without exposing secret values", async () => {
    delete process.env.JWT_SECRET;
    process.env.VERCEL_ENV = "production";

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      jwtSecret: {
        status: "missing",
        isConfigured: false,
        length: 0,
      },
      vercelEnv: "production",
    });
    expect(JSON.stringify(body)).not.toContain("JWT_SECRET");
  });

  it("reports when JWT_SECRET still uses the rejected default value", async () => {
    process.env.JWT_SECRET = DEFAULT_SECRET;

    const response = await GET();
    const body = await response.json();

    expect(body.jwtSecret).toEqual({
      status: "default",
      isConfigured: false,
      length: DEFAULT_SECRET.length,
    });
  });

  it("reports configured JWT_SECRET length without exposing its value", async () => {
    process.env.JWT_SECRET = TEST_SECRET;

    const response = await GET();
    const body = await response.json();

    expect(body.jwtSecret).toEqual({
      status: "set",
      isConfigured: true,
      length: TEST_SECRET.length,
    });
    expect(JSON.stringify(body)).not.toContain("unit-test-secret");
    expect(response.headers.get("Cache-Control")).toBe("no-store, max-age=0");
  });
});
