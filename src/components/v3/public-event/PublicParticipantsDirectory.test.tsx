import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PublicParticipantsDirectory } from "./PublicParticipantsDirectory";

describe("PublicParticipantsDirectory", () => {
  it("provides team and roster search, roster status filtering, pagination, and roster details", () => {
    const html = renderToStaticMarkup(<PublicParticipantsDirectory locale="id" teams={[
      { id: "a", name: "Garuda Nova", tag: "GNV", captain: "Nadia", players: [{ id: "p1", nickname: "Nyx", displayName: "Nadia", position: "Forward" }] },
      { id: "b", name: "Orbit", tag: "ORB", captain: "Raka", players: [] },
    ]} />);

    expect(html).toContain('type="search"');
    expect(html).toContain('name="roster-status"');
    expect(html).toContain("Roster lengkap");
    expect(html).toContain("Lihat roster");
    expect(html).toContain('aria-label="Paginasi peserta"');
  });
});
