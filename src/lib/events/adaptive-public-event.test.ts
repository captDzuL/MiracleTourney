import { describe, expect, it } from "vitest";

import {
  buildRegistrationCta,
  describeTournamentFormat,
  getRegistrationAvailability,
  normalizeOrganizerContact,
} from "./adaptive-public-event";

describe("adaptive public registration availability", () => {
  const opensAt = new Date("2026-09-11T02:00:00.000Z");
  const closesAt = new Date("2026-09-17T16:59:00.000Z");

  it("uses inclusive opening and exclusive closing boundaries", () => {
    expect(getRegistrationAvailability({ status: "Published", opensAt, closesAt, occupiedSlots: 1, participantCap: 16, now: opensAt })).toBe("open");
    expect(getRegistrationAvailability({ status: "Published", opensAt, closesAt, occupiedSlots: 1, participantCap: 16, now: closesAt })).toBe("closed");
  });

  it("distinguishes upcoming, full, closed, and legacy events", () => {
    expect(getRegistrationAvailability({ status: "Published", opensAt, closesAt, occupiedSlots: 0, participantCap: 16, now: new Date("2026-09-10T00:00:00Z") })).toBe("upcoming");
    expect(getRegistrationAvailability({ status: "Published", opensAt, closesAt, occupiedSlots: 16, participantCap: 16, now: new Date("2026-09-12T00:00:00Z") })).toBe("full");
    expect(getRegistrationAvailability({ status: "Registration Closed", opensAt, closesAt, occupiedSlots: 0, participantCap: 16, now: new Date("2026-09-12T00:00:00Z") })).toBe("closed");
    expect(getRegistrationAvailability({ status: "Published", opensAt: null, closesAt, occupiedSlots: 0, participantCap: 16, now: new Date("2026-09-12T00:00:00Z") })).toBe("legacy");
    expect(getRegistrationAvailability({ status: "Ongoing", opensAt, closesAt, occupiedSlots: 0, participantCap: 16, now: new Date("2026-09-12T00:00:00Z") })).toBe("legacy");
  });
});

describe("adaptive public registration CTA", () => {
  const href = "/id/captain?tab=registration&eventId=event-1";

  it.each([
    ["anonymous", "open", "login"],
    ["eligible_without_team", "open", "start"],
    ["eligible_with_team", "open", "start"],
    ["draft_incomplete", "open", "continue"],
    ["pending_payment", "closed", "continue"],
    ["pending_review", "full", "status"],
    ["rejected", "closed", "continue"],
    ["approved", "closed", "status"],
    ["expired", "open", "start"],
    ["wrong_role", "open", "disabled"],
  ] as const)("maps %s during %s to %s", (state, availability, kind) => {
    expect(buildRegistrationCta({ state, availability, href }).kind).toBe(kind);
  });

  it.each([
    ["anonymous", "upcoming", "registration_upcoming"],
    ["anonymous", "closed", "registration_closed"],
    ["anonymous", "full", "registration_full"],
    ["expired", "closed", "registration_closed"],
  ] as const)("disables %s when %s", (state, availability, reason) => {
    expect(buildRegistrationCta({ state, availability, href })).toMatchObject({ kind: "disabled", reason });
  });
});

describe("organizer contact normalization", () => {
  it("normalizes WhatsApp, email, and Instagram", () => {
    expect(normalizeOrganizerContact("WhatsApp", "+62 812-3456-7890")).toBe("https://wa.me/6281234567890");
    expect(normalizeOrganizerContact("Email", "hello@miracle.id")).toBe("mailto:hello@miracle.id");
    expect(normalizeOrganizerContact("Instagram", "@miracle.tourney")).toBe("https://instagram.com/miracle.tourney");
  });

  it("keeps unknown channels as display-only text", () => {
    expect(normalizeOrganizerContact("Discord", "miracle.gg")).toBeNull();
  });
});

describe("format descriptions", () => {
  it("includes BO and third-place only when enabled", () => {
    expect(describeTournamentFormat({
      version: 1,
      kind: "single_elimination",
      bestOf: { earlyRounds: 1, semifinals: 3, thirdPlace: 1, final: 5 },
      thirdPlace: "required",
    })).toEqual({
      label: "Single Elimination",
      details: ["Early rounds BO1", "Semifinals BO3", "Final BO5", "Third-place match BO1"],
    });
  });

  it("describes group qualification and playoff structure", () => {
    expect(describeTournamentFormat({
      version: 1,
      kind: "group_playoffs",
      groupCount: 4,
      qualifiersPerGroup: 2,
      groupStage: { legs: 1, points: { win: 3, draw: 1, loss: 0 }, tiebreakers: ["head_to_head"] },
      playoffs: {
        version: 1,
        kind: "single_elimination",
        bestOf: { earlyRounds: 1, semifinals: 3, thirdPlace: 1, final: 5 },
        thirdPlace: "none",
        avoidImmediateGroupRematches: true,
      },
    })).toMatchObject({
      label: "Group + Playoffs",
      details: expect.arrayContaining(["4 groups", "Top 2 qualify from each group", "Single-elimination playoffs"]),
    });
  });
});