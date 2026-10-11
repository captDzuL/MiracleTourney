import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAllPublicEvents } = vi.hoisted(() => ({ getAllPublicEvents: vi.fn() }));

vi.mock("@/lib/platform/repository", () => ({ getAllPublicEvents }));

import sitemap, { dynamic } from "./sitemap";

const BASE_URL = "https://miracle-league.fun";

describe("sitemap", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("lists the fixed pages and four pages for every public event", async () => {
    getAllPublicEvents.mockResolvedValue([{ slug: "open-cup", updatedAt: new Date("2026-10-01T00:00:00.000Z") }]);

    const urls = (await sitemap()).map((entry) => entry.url);

    expect(urls).toEqual([
      `${BASE_URL}/id`,
      `${BASE_URL}/en`,
      `${BASE_URL}/id/events`,
      `${BASE_URL}/en/events`,
      `${BASE_URL}/id/events/open-cup`,
      `${BASE_URL}/en/events/open-cup`,
      `${BASE_URL}/id/events/open-cup/bracket`,
      `${BASE_URL}/id/events/open-cup/participants`,
    ]);
  });

  it("fails when the events cannot be read, instead of answering with a sitemap that has no events", async () => {
    getAllPublicEvents.mockRejectedValue(new Error("database unavailable"));

    await expect(sitemap()).rejects.toThrow("database unavailable");
  });

  it("is built on every request, so a build without a database does not freeze an empty sitemap", () => {
    expect(dynamic).toBe("force-dynamic");
  });
});
