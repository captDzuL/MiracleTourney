import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const files = [
  "src/app/sitemap.ts",
  "src/app/home-page-content.tsx",
  "src/app/events/page.tsx",
  "src/app/captain/page.tsx",
  "src/app/events/[slug]/event-detail-page.tsx",
  "src/app/events/[slug]/bracket/bracket-page-content.tsx",
  "src/app/events/[slug]/leaderboards/leaderboards-page.tsx",
  "src/app/events/[slug]/participants/participants-page.tsx",
  "src/app/events/[slug]/standings/standings-page.tsx",
  "src/app/[locale]/events/[slug]/page.tsx",
  "src/app/[locale]/events/[slug]/bracket/page.tsx",
  "src/app/[locale]/events/[slug]/leaderboards/page.tsx",
  "src/app/[locale]/events/[slug]/participants/page.tsx",
  "src/app/[locale]/events/[slug]/standings/page.tsx",
  "src/app/[locale]/organizer/events/[eventId]/layout.tsx",
  "src/app/[locale]/organizer/events/[eventId]/overview/page.tsx",
  "src/app/admin/page.tsx",
];

describe("event read callers import from events module", () => {
  it("routes event read queries through @/modules/events instead of legacy repository", () => {
    for (const relativePath of files) {
      const source = fs.readFileSync(path.resolve(process.cwd(), relativePath), "utf8");
      expect(source).toContain("@/modules/events");
    }
  });
});
