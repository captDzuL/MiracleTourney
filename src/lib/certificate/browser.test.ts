import { describe, expect, it } from "vitest";

import { resolveLaunchStrategy } from "./browser";

describe("resolveLaunchStrategy", () => {
  it("uses the named local browser channel when PLAYWRIGHT_CHANNEL is set", () => {
    expect(resolveLaunchStrategy({ PLAYWRIGHT_CHANNEL: "msedge" })).toBe("channel");
  });

  it("prefers an explicit channel over serverless detection", () => {
    // A developer running against a Vercel-shaped env locally should still get their own browser.
    expect(resolveLaunchStrategy({ PLAYWRIGHT_CHANNEL: "msedge", VERCEL: "1" })).toBe("channel");
  });

  it("uses the Lambda chromium pack on Vercel", () => {
    expect(resolveLaunchStrategy({ VERCEL: "1" })).toBe("lambda");
  });

  it("uses the Lambda chromium pack on raw AWS Lambda", () => {
    expect(resolveLaunchStrategy({ AWS_LAMBDA_FUNCTION_NAME: "cert-renderer" })).toBe("lambda");
  });

  it("falls back to a locally installed playwright browser", () => {
    expect(resolveLaunchStrategy({})).toBe("local");
  });

  it("ignores an empty PLAYWRIGHT_CHANNEL", () => {
    // An unset-but-declared env var arrives as "" and must not select a nameless channel.
    expect(resolveLaunchStrategy({ PLAYWRIGHT_CHANNEL: "" })).toBe("local");
  });
});
