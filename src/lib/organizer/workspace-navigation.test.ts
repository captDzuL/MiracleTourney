import { describe, expect, it } from "vitest";

import { buildOrganizerEventNavigation } from "./workspace-navigation";
import type { OrganizerEventSection, OrganizerWorkspaceSummary } from "./workspace-types";

const sections: OrganizerEventSection[] = [
  "overview",
  "registration",
  "participants",
  "competition",
  "schedule",
  "match-control",
  "completion",
  "announcements",
  "settings",
];

const summary: OrganizerWorkspaceSummary = {
  event: { id: "event 42", title: "Flash Peak", game: "Arena", format: "Single Elimination" },
  lifecycle: "ongoing",
  publication: "published",
  role: "organizer",
  capabilities: Object.fromEntries(sections.map(section => [section, true])) as Record<OrganizerEventSection, boolean>,
  badges: { registration: 12, participants: 12, "match-control": 2, completion: 3 },
  blockers: [],
  updatedAt: "2026-09-14T10:00:00.000Z",
};

describe("buildOrganizerEventNavigation", () => {
  it("builds locale-aware real routes for every enabled event section", () => {
    const navigation = buildOrganizerEventNavigation(
      "id",
      summary.event.id,
      summary,
      "/id/organizer/events/event%2042/registration?view=queue",
    );

    expect(navigation.map(item => item.section)).toEqual(sections);
    expect(navigation.map(item => item.href)).toEqual(sections.map(section =>
      `/id/organizer/events/event%2042/${section}`,
    ));
    expect(navigation.every(item => !item.href.includes("#"))).toBe(true);
    expect(navigation.find(item => item.section === "registration")?.active).toBe(true);
    expect(navigation.find(item => item.section === "match-control")?.badge).toBe(2);
  });

  it("uses the Indonesian product terms required by the master workspace", () => {
    const navigation = buildOrganizerEventNavigation("id", "event-1", summary, "/id/organizer/events/event-1/overview");
    expect(navigation.find(item => item.section === "match-control")?.label).toBe("Kontrol Pertandingan");
    expect(navigation.find(item => item.section === "completion")?.label).toBe("Penyelesaian");
  });

  it("hides sections that are not capabilities of the current workspace", () => {
    const navigation = buildOrganizerEventNavigation("en", "event-1", {
      ...summary,
      capabilities: { ...summary.capabilities, settings: false },
    }, "/en/organizer/events/event-1/settings");

    expect(navigation.map(item => item.section)).not.toContain("settings");
    expect(navigation.map(item => item.href)).not.toContain("/en/organizer/events/event-1/settings");
  });
});
