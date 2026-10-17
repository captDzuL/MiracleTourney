import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("public event registration CTA", () => {
  it("uses the native event-specific registration route in both visual versions", () => {
    const detail = readFileSync(join(process.cwd(), "src/app/events/[slug]/event-detail-page.tsx"), "utf8");
    const v2 = readFileSync(join(process.cwd(), "src/components/public-v2/PublicEventDetailV2.tsx"), "utf8");
    expect(detail).toContain("/events/${event.slug}/register");
    expect(v2).toContain("/events/${event.slug}/register");
    expect(v2).not.toContain("href={event.registrationUrl}");
  });
});

describe("public event registration CTA for a solo event", () => {
  it("is gated on the solo flag in both visual versions of the detail page", () => {
    const detail = readFileSync(join(process.cwd(), "src/app/events/[slug]/event-detail-page.tsx"), "utf8");
    const v2 = readFileSync(join(process.cwd(), "src/components/public-v2/PublicEventDetailV2.tsx"), "utf8");
    expect(detail).toContain('const registrationOpen = event.entryMode !== "solo" || isFeatureEnabled("solo_tournament_v1");');
    expect(detail).toMatch(/event\.status === "Published" && registrationOpen \?/);
    expect(detail).toContain("registrationOpen={registrationOpen}");
    expect(v2).toMatch(/event\.status === "Published" && registrationOpen \?/);
  });
});
