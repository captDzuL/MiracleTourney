import { describe, expect, it, vi } from "vitest";

import type { Event } from "@/lib/platform/types";

import { loadHomepageEvents } from "./homepage-events-read";

const event = { id: "event-1", slug: "open-cup", name: "Open Cup" } as Event;

describe("loadHomepageEvents", () => {
  it("returns the events and no failure", async () => {
    const logger = vi.fn();

    await expect(loadHomepageEvents(async () => [event], logger)).resolves.toEqual({ events: [event], failed: false });
    expect(logger).not.toHaveBeenCalled();
  });

  it("keeps a real empty list apart from a failure", async () => {
    await expect(loadHomepageEvents(async () => [], vi.fn())).resolves.toEqual({ events: [], failed: false });
  });

  it("reports a failure and logs it, without made-up events", async () => {
    const error = new Error("database unavailable");
    const logger = vi.fn();

    await expect(loadHomepageEvents(async () => { throw error; }, logger)).resolves.toEqual({ events: [], failed: true });
    expect(logger).toHaveBeenCalledWith("Homepage public events unavailable", error);
  });

  it("waits for a slow database instead of giving up after a short time", async () => {
    vi.useFakeTimers();
    try {
      const slow = new Promise<Event[]>((resolve) => setTimeout(() => resolve([event]), 10_000));
      const result = loadHomepageEvents(() => slow, vi.fn());
      await vi.advanceTimersByTimeAsync(10_000);

      await expect(result).resolves.toEqual({ events: [event], failed: false });
    } finally {
      vi.useRealTimers();
    }
  });
});
