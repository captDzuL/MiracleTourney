import { beforeEach, describe, expect, it, vi } from "vitest";

const boundary = vi.hoisted(() => ({
  eventFindUnique: vi.fn(),
  eventFindFirst: vi.fn(),
  eventAnnouncementFindMany: vi.fn(),
  getPublicEventBySlug: vi.fn(),
  adaptiveEnabled: true,
}));

vi.mock("next-intl/server", () => ({ setRequestLocale: () => {} }));
vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled: () => boundary.adaptiveEnabled }));
vi.mock("@/lib/platform/repository", () => ({
  getPublicEventBySlug: boundary.getPublicEventBySlug,
  getPublicEventSlugRedirect: async () => null,
}));
vi.mock("@/lib/platform/db", () => ({
  prisma: {
    event: { findUnique: boundary.eventFindUnique, findFirst: boundary.eventFindFirst },
    eventAnnouncement: { findMany: boundary.eventAnnouncementFindMany },
  },
}));

import { generateMetadata } from "./page";

const event = {
  id: "event-1",
  slug: "finished-cup",
  status: "Finished",
  name: "Finished Cup",
  description: "Official results",
  logoUrl: "/logo.png",
  gameImageUrl: "/game.png",
  activeVisualAsset: { status: "approved", url: "/published-poster.png" },
};

beforeEach(() => {
  vi.clearAllMocks();
  boundary.adaptiveEnabled = true;
  boundary.getPublicEventBySlug.mockResolvedValue(event);
  boundary.eventFindUnique.mockResolvedValue(event);
  boundary.eventFindFirst.mockResolvedValue(null);
  boundary.eventAnnouncementFindMany.mockResolvedValue([]);
});

describe("public event detail metadata", () => {
  it("uses the approved public poster without loading the full Finished projection", async () => {
    const metadata = await generateMetadata({ params: Promise.resolve({ locale: "id", slug: "finished-cup" }) });

    expect(metadata.openGraph?.images).toEqual([{ url: "/published-poster.png", width: 1200, height: 630, alt: "Finished Cup" }]);
    expect(metadata.twitter?.images).toEqual(["/published-poster.png"]);
    expect(boundary.eventFindUnique).not.toHaveBeenCalled();
    expect(boundary.eventFindFirst).not.toHaveBeenCalled();
    expect(boundary.eventAnnouncementFindMany).not.toHaveBeenCalled();
  });

  it("does not expose an unapproved poster and retains the public image fallback", async () => {
    boundary.getPublicEventBySlug.mockResolvedValue({
      ...event,
      activeVisualAsset: { status: "ready_for_review", url: "/private-poster.png" },
    });

    const metadata = await generateMetadata({ params: Promise.resolve({ locale: "en", slug: "finished-cup" }) });

    expect(metadata.openGraph?.images).toEqual([{ url: "/game.png", width: 1200, height: 630, alt: "Finished Cup" }]);
    expect(metadata.twitter?.images).toEqual(["/game.png"]);
    expect(boundary.eventFindUnique).not.toHaveBeenCalled();
    expect(boundary.eventFindFirst).not.toHaveBeenCalled();
    expect(boundary.eventAnnouncementFindMany).not.toHaveBeenCalled();
  });

  it("retains the legacy image choice while the adaptive flag is disabled", async () => {
    boundary.adaptiveEnabled = false;

    const metadata = await generateMetadata({ params: Promise.resolve({ locale: "id", slug: "finished-cup" }) });

    expect(metadata.openGraph?.images).toEqual([{ url: "/logo.png", width: 1200, height: 630, alt: "Finished Cup" }]);
    expect(boundary.eventFindUnique).not.toHaveBeenCalled();
  });
});
