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
