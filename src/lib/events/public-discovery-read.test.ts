import { describe, expect, it, vi } from "vitest";

import { loadPublicDiscovery } from "./public-discovery-read";

describe("public discovery honest loading", () => {
  it("returns database entries when the read completes", async () => {
    const entries = [{ event: { id: "event" } }];
    await expect(loadPublicDiscovery(async () => entries as never, 100)).resolves.toEqual({
      entries,
      loadState: "ready",
    });
  });

  it("returns an error state and logs server-side on database failure", async () => {
    const error = new Error("database unavailable");
    const logger = vi.fn();
    await expect(loadPublicDiscovery(async () => { throw error; }, 100, logger)).resolves.toEqual({
      entries: [],
      loadState: "error",
    });
    expect(logger).toHaveBeenCalledWith("Public discovery events unavailable", { error });
  });

  it("times out without substituting demo events", async () => {
    vi.useFakeTimers();
    const logger = vi.fn();
    const pending = loadPublicDiscovery(() => new Promise(() => undefined), 2000, logger);
    await vi.advanceTimersByTimeAsync(2000);
    await expect(pending).resolves.toEqual({ entries: [], loadState: "error" });
    expect(logger).toHaveBeenCalledWith(
      "Public discovery events unavailable",
      expect.objectContaining({ error: expect.objectContaining({ message: "Public event read timed out" }) }),
    );
    vi.useRealTimers();
  });
});
