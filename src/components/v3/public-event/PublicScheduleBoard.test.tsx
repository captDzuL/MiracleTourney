import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PublicScheduleBoard } from "./PublicScheduleBoard";

describe("PublicScheduleBoard", () => {
  it("renders a round filter, WIB timestamps, results, and expandable match detail", () => {
    const html = renderToStaticMarkup(<PublicScheduleBoard locale="id" timezone="Asia/Jakarta" matches={[
      { id: "m1", roundLabel: "Semifinal", home: "Garuda", away: "Orbit", status: "completed", homeScore: 2, awayScore: 1, start: "2026-09-14T01:00:00Z", room: "Arena A", bestOf: 3 },
    ]} />);

    expect(html).toContain('name="round"');
    expect(html).toContain("WIB");
    expect(html).toContain("2 – 1");
    expect(html).toContain("Detail pertandingan");
    expect(html).toContain("BO3");
  });

  it("shows an honest unpublished state instead of fixture data", () => {
    const html = renderToStaticMarkup(<PublicScheduleBoard locale="en" timezone="Asia/Jakarta" matches={[]} unpublished />);
    expect(html).toContain("The organizer has not published the schedule yet");
  });

  it("localizes every published match status in Indonesian and English", () => {
    const matches = [
      { id: "scheduled", roundLabel: "R1", home: "Alpha", away: "Beta", status: "scheduled" as const, homeScore: null, awayScore: null, start: null, room: null, bestOf: 1 },
      { id: "delayed", roundLabel: "R1", home: "Alpha", away: "Beta", status: "delayed" as const, homeScore: null, awayScore: null, start: null, room: null, bestOf: 1 },
      { id: "postponed", roundLabel: "R1", home: "Alpha", away: "Beta", status: "postponed" as const, homeScore: null, awayScore: null, start: null, room: null, bestOf: 1 },
      { id: "live", roundLabel: "R1", home: "Alpha", away: "Beta", status: "live" as const, homeScore: 1, awayScore: 0, start: null, room: null, bestOf: 1 },
      { id: "completed", roundLabel: "R1", home: "Alpha", away: "Beta", status: "completed" as const, homeScore: 2, awayScore: 1, start: null, room: null, bestOf: 1 },
    ];
    const indonesian = renderToStaticMarkup(<PublicScheduleBoard locale="id" timezone="Asia/Jakarta" matches={matches} presentation="v3" />);
    const english = renderToStaticMarkup(<PublicScheduleBoard locale="en" timezone="Asia/Jakarta" matches={matches} presentation="v3" />);

    for (const label of ["Dijadwalkan", "Tertunda", "Ditunda", "Sedang berlangsung", "Selesai"]) expect(indonesian).toContain(label);
    for (const label of ["Scheduled", "Delayed", "Postponed", "Live", "Completed"]) expect(english).toContain(label);
    for (const raw of ["scheduled", "delayed", "postponed"]) {
      expect(indonesian).not.toContain(`>${raw}<`);
      expect(english).not.toContain(`>${raw}<`);
    }
  });

  it("preserves the legacy status expression when the V3 presentation is disabled", () => {
    const matches = [
      { id: "scheduled", roundLabel: "R1", home: "Alpha", away: "Beta", status: "scheduled" as const, homeScore: null, awayScore: null, start: null, room: null, bestOf: 1 },
      { id: "delayed", roundLabel: "R1", home: "Alpha", away: "Beta", status: "delayed" as const, homeScore: null, awayScore: null, start: null, room: null, bestOf: 1 },
      { id: "postponed", roundLabel: "R1", home: "Alpha", away: "Beta", status: "postponed" as const, homeScore: null, awayScore: null, start: null, room: null, bestOf: 1 },
      { id: "live", roundLabel: "R1", home: "Alpha", away: "Beta", status: "live" as const, homeScore: 1, awayScore: 0, start: null, room: null, bestOf: 1 },
      { id: "completed", roundLabel: "R1", home: "Alpha", away: "Beta", status: "completed" as const, homeScore: 2, awayScore: 1, start: null, room: null, bestOf: 1 },
    ];
    const indonesian = renderToStaticMarkup(<PublicScheduleBoard locale="id" timezone="Asia/Jakarta" matches={matches} />);
    const english = renderToStaticMarkup(<PublicScheduleBoard locale="en" timezone="Asia/Jakarta" matches={matches} />);

    for (const label of ["scheduled", "delayed", "postponed", "Live", "Selesai"]) expect(indonesian).toContain(label);
    for (const label of ["scheduled", "delayed", "postponed", "Live", "Completed"]) expect(english).toContain(label);
    expect(indonesian).not.toContain("Dijadwalkan");
    expect(english).not.toContain("Scheduled");
  });
});
