import { describe, expect, it } from "vitest";

import { buildRegistrationPreview, suggestRegistrationMapping } from "./registration-intake";

describe("captain identity in registration imports", () => {
  it("maps captain IGN/UID and player IGN/UID columns", () => {
    const mapping = suggestRegistrationMapping([
      "Nama Tim", "Captain IGN", "Captain UID", "Kontak Kapten", "Kapten juga pemain",
      "Player 1 IGN", "Player 1 UID",
    ], { maxRosterSize: 5 });

    expect(mapping.columns).toMatchObject({
      teamName: 0,
      captainIgn: 1,
      captainUid: 2,
      captainContact: 3,
      captainIsPlayer: 4,
    });
    expect(mapping.players[0]).toEqual({ nickname: 5, displayName: 6 });
  });

  it("counts a captain-player once and rejects duplicate roster UIDs", () => {
    const preview = buildRegistrationPreview({
      event: { id: "event-1", name: "MFL", slug: "mfl", participantCap: 16, bracketLocked: false, maxRosterSize: 5, minRosterSize: 2 },
      existingTeams: [],
      existingUsers: [],
      rows: [{ sourceRow: 2, cells: ["Alpha", "ALP", "Kirana", "1001", "0812345678", "ya", "Kirana", "1001", "Bima", "1001"] }],
      mapping: {
        columns: { teamName: 0, teamTag: 1, captainIgn: 2, captainUid: 3, captainContact: 4, captainIsPlayer: 5 },
        players: [{ nickname: 6, displayName: 7 }, { nickname: 8, displayName: 9 }],
      },
    });

    expect(preview.items[0]).toMatchObject({ status: "error" });
    expect(preview.items[0]?.errors?.join(" ")).toContain("UID");
  });
});
