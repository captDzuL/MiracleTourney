import { beforeEach, describe, expect, it, vi } from "vitest";

const { getPublicEventBySlug } = vi.hoisted(() => ({ getPublicEventBySlug: vi.fn() }));

vi.mock("@/lib/platform/repository", () => ({ getPublicEventBySlug }));

import { readEventForMetadata } from "./public-event-metadata";

describe("readEventForMetadata", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns the event", async () => {
    getPublicEventBySlug.mockResolvedValue({ id: "event-1", slug: "open-cup" });

    await expect(readEventForMetadata("open-cup")).resolves.toEqual({ id: "event-1", slug: "open-cup" });
    expect(getPublicEventBySlug).toHaveBeenCalledWith("open-cup");
  });

  it("returns null for an unknown event", async () => {
    getPublicEventBySlug.mockResolvedValue(null);

    await expect(readEventForMetadata("missing")).resolves.toBeNull();
  });

  it("returns null when the read fails, so the page body can report the failure inside the layout", async () => {
    getPublicEventBySlug.mockRejectedValue(new Error("database unavailable"));

    await expect(readEventForMetadata("open-cup")).resolves.toBeNull();
  });
});
