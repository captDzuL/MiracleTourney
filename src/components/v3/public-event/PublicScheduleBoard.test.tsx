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
});
