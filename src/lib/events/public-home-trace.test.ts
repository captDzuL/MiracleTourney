import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("safe homepage featured trace", () => {
  it("emits no featured diagnostics unless the homepage trace flag is enabled", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const { createFeaturedTrace } = await import("./public-home-trace");
    vi.stubEnv("PUBLIC_V3_HOME_DISCOVERY_TRACE", "0");
    const trace = createFeaturedTrace();
    trace.mark("transaction_start");
    trace.fail(Object.assign(new Error("secret-message"), { code: "P2028", meta: { password: "secret-meta" } }));
    expect(info).not.toHaveBeenCalled();
  });

  it.each([
    ["P2028", "transaction_error"], ["P2024", "pool_timeout"], ["P1001", "connection_error"],
    ["P1002", "connection_error"], ["P1017", "connection_error"], ["P2034", "transaction_conflict"],
    ["P9999", "unknown_error"],
  ])("allows only a fixed class for %s without retaining hostile error fields", async (code, expected) => {
    vi.stubEnv("PUBLIC_V3_HOME_DISCOVERY_TRACE", "1");
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const { createFeaturedTrace } = await import("./public-home-trace");
    const trace = createFeaturedTrace();
    trace.mark("event_read_start");
    trace.fail(Object.assign(new Error("secret-message"), { code, meta: { password: "secret-meta" } }));
    const lines = info.mock.calls.map(([line]) => String(line));
    expect(lines.some((line) => new RegExp(`^\\[public-v3-featured\\] failure stage=event_read_start class=${expected} ms=\\d{1,5}$`).test(line))).toBe(true);
    expect(lines.join(" ")).not.toMatch(/secret-message|secret-meta|P2028|P2024|P1001|P1002|P1017|P2034|P9999/);
  });

  it("labels projection TypeError and known validation without trusting arbitrary names", async () => {
    vi.stubEnv("PUBLIC_V3_HOME_DISCOVERY_TRACE", "1");
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const { createFeaturedTrace } = await import("./public-home-trace");
    const projection = createFeaturedTrace();
    projection.mark("projection_start");
    projection.fail(new TypeError("private-data"));
    const validation = createFeaturedTrace();
    validation.mark("event_read_start");
    validation.fail({ name: "PrismaClientValidationError", message: "private-data" });
    expect(info.mock.calls.map(([line]) => String(line)).filter((line) => line.includes(" failure "))).toEqual([
      expect.stringMatching(/stage=projection_start class=projection_error/),
      expect.stringMatching(/stage=event_read_start class=validation_error/),
    ]);
    expect(info.mock.calls.flat().join(" ")).not.toContain("private-data");
  });

  it("does not let a throwing logger change the original error", async () => {
    vi.stubEnv("PUBLIC_V3_HOME_DISCOVERY_TRACE", "1");
    vi.spyOn(console, "info").mockImplementation(() => { throw new Error("logger failed"); });
    const { createFeaturedTrace } = await import("./public-home-trace");
    const trace = createFeaturedTrace();
    const original = Object.assign(new Error("original"), { code: "P2028" });
    trace.mark("transaction_start");
    expect(trace.fail(original)).toBe(original);
  });
});
