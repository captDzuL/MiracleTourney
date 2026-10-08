import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

Object.assign(globalThis, { React });

const { notFound, resolveEventPreviewToken, renderEventDetailPage, setRequestLocale, isFeatureEnabled, projectPreviewPublicV3Event } = vi.hoisted(() => ({
  notFound: vi.fn(),
  resolveEventPreviewToken: vi.fn(),
  renderEventDetailPage: vi.fn(),
  setRequestLocale: vi.fn(),
  isFeatureEnabled: vi.fn(),
  projectPreviewPublicV3Event: vi.fn(),
}));

vi.mock("next/navigation", () => ({ notFound }));
vi.mock("next-intl/server", () => ({
  setRequestLocale,
  getTranslations: vi.fn().mockResolvedValue((key: string) => ({
    bannerTitle: "Private preview",
    bannerDescription: "Only people with this link can view this draft.",
  })[key] ?? key),
}));
vi.mock("@/lib/events/preview-token", () => ({ resolveEventPreviewToken }));
vi.mock("@/app/events/[slug]/event-detail-page", () => ({ renderEventDetailPage }));
vi.mock("@/lib/events/event-revision", () => ({ resolveEventRevisionPreviewToken: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/events/public-v3-read", () => ({ projectPreviewPublicV3Event }));
vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled }));
vi.mock("@/components/v3/public-event/PublicV3EventPage", () => ({
  PublicV3EventPage: ({ view, readOnly }: { view: { identity: { title: string } }; readOnly?: boolean }) => (
    <section data-v3-page data-read-only={String(Boolean(readOnly))}>{view.identity.title}</section>
  ),
}));

import PreviewEventPage, { dynamic, metadata, revalidate } from "./page";

describe("private event preview route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isFeatureEnabled.mockReturnValue(false);
    notFound.mockImplementation(() => { throw new Error("NEXT_NOT_FOUND"); });
  });

  it("renders the Draft with the V3 public event page when the adaptive public event flag is on", async () => {
    const event = { id: "event-1", slug: "miracle-open", status: "Draft", name: "Miracle Open" };
    resolveEventPreviewToken.mockResolvedValue({ id: "preview-1", event });
    isFeatureEnabled.mockImplementation((flag: string) => flag === "adaptive_public_event_v3");
    projectPreviewPublicV3Event.mockReturnValue({ identity: { title: "Miracle Open" } });

    const page = await PreviewEventPage({
      params: Promise.resolve({ locale: "id", token: "a".repeat(64) }),
    });
    const markup = renderToStaticMarkup(page);

    expect(projectPreviewPublicV3Event).toHaveBeenCalledWith(event);
    expect(renderEventDetailPage).not.toHaveBeenCalled();
    expect(markup).toContain("Private preview");
    expect(markup).toContain('data-v3-page="true" data-read-only="true"');
    expect(markup).toContain("Miracle Open");
  });

  it("renders the validated Draft through the shared public event view with a persistent banner", async () => {
    const event = { id: "event-1", slug: "miracle-open", status: "Draft", name: "Miracle Open" };
    resolveEventPreviewToken.mockResolvedValue({ id: "preview-1", event });
    renderEventDetailPage.mockResolvedValue(<section>Shared public event view</section>);

    const page = await PreviewEventPage({
      params: Promise.resolve({ locale: "en", token: "a".repeat(64) }),
    });
    const markup = renderToStaticMarkup(page);

    expect(setRequestLocale).toHaveBeenCalledWith("en");
    expect(resolveEventPreviewToken).toHaveBeenCalledWith("a".repeat(64));
    expect(renderEventDetailPage).toHaveBeenCalledWith("miracle-open", "en", event, { readOnly: true });
    expect(markup).toContain("Private preview");
    expect(markup).toContain("Shared public event view");
    expect(markup).not.toContain("Edit event");
  });

  it("returns not found for invalid, expired, revoked, or replaced links", async () => {
    resolveEventPreviewToken.mockResolvedValue(null);

    await expect(PreviewEventPage({
      params: Promise.resolve({ locale: "id", token: "invalid" }),
    })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(renderEventDetailPage).not.toHaveBeenCalled();
  });

  it("is dynamic, uncached, non-indexable, and sends no referrer", () => {
    expect(dynamic).toBe("force-dynamic");
    expect(revalidate).toBe(0);
    expect(metadata).toMatchObject({
      robots: { index: false, follow: false, nocache: true },
      referrer: "no-referrer",
    });
  });
});