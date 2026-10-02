import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(path.resolve(__dirname, "page.tsx"), "utf8");

describe("localized adaptive event routing contract", () => {
  it("keeps slug redirects ahead of adaptive renderer selection", () => {
    expect(source.indexOf("getPublicEventSlugRedirect")).toBeLessThan(source.indexOf("readPublicV3Event(slug, viewer)"));
    expect(source).toContain("permanentRedirect");
  });

  it("uses the normalized V3 composition for every public lifecycle and keeps rollback", () => {
    expect(source).toContain('isFeatureEnabled("adaptive_public_event_v3")');
    expect(source).toContain('["Published", "Registration Closed", "Ongoing", "Finished"].includes(event.status)');
    expect(source).toContain("readPublicV3Event");
    expect(source).toContain("<PublicV3EventPage");
    expect(source).not.toContain("shouldUseAdaptiveRegistrationRenderer");
    expect(source).toContain("return renderEventDetailPage");
  });

  it("keeps personalized view state outside public metadata", () => {
    const metadataSection = source.slice(source.indexOf("export async function generateMetadata"), source.indexOf("export default async function LocalizedEventDetailPage"));
    expect(metadataSection).toContain("readPublicV3Event(slug, null)");
    expect(metadataSection).not.toContain("getSessionUser");
    expect(metadataSection).toContain("view.identity.poster.eventUrl");
  });
});
