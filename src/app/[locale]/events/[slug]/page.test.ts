import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(path.resolve(__dirname, "page.tsx"), "utf8");

describe("localized adaptive event routing contract", () => {
  it("keeps slug redirects ahead of adaptive renderer selection", () => {
    expect(source.indexOf("getPublicEventSlugRedirect")).toBeLessThan(source.indexOf("getAdaptivePublicEventView(slug, viewer)"));
    expect(source).toContain("permanentRedirect");
  });

  it("gates registration composition and keeps lifecycle fallback", () => {
    expect(source).toContain('isFeatureEnabled("adaptive_public_event_v3")');
    expect(source).toContain('["Published", "Registration Closed"].includes(event.status)');
    expect(source).toContain("shouldUseAdaptiveRegistrationRenderer");
    expect(source).toContain("return renderEventDetailPage");
  });

  it("keeps personalized view state outside public metadata", () => {
    const metadataSection = source.slice(source.indexOf("export async function generateMetadata"), source.indexOf("async function getAdaptiveCopy"));
    expect(metadataSection).toContain("getAdaptivePublicEventView(slug, null)");
    expect(metadataSection).not.toContain("getSessionUser");
    expect(metadataSection).toContain("adaptive.event.posterUrl ?? adaptive.event.logoUrl");
  });
});