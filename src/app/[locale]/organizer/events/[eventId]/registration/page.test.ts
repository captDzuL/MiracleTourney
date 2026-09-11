import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("organizer registration route", () => {
  it("renders the same production control center scoped to the event", () => {
    const source = readFileSync(join(process.cwd(), "src/app/[locale]/organizer/events/[eventId]/registration/page.tsx"), "utf8");
    expect(source).toContain("AdminPage");
    expect(source).toContain('phase: "registration"');
    expect(source).toContain("activeEventId: eventId");
  });
});
