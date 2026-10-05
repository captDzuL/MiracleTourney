import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PublicParticipantRoster } from "./PublicParticipantRoster";

const player = { id: "p1", displayName: "UID-123", nickname: "Player11", position: "Forward" };

describe("PublicParticipantRoster", () => {
  it("renders every player with labeled UID, IGN, then position in document order", () => {
    const html = renderToStaticMarkup(<PublicParticipantRoster players={[player, { ...player, id: "p2", displayName: "UID-456", nickname: "Player22" }]} locale="id" />);
    expect(html.match(/<li\b/g)).toHaveLength(2);
    expect(html).toMatch(/<dt[^>]*>UID<\/dt>[\s\S]*<dd[^>]*>UID-123<\/dd>[\s\S]*<dt[^>]*>IGN<\/dt>[\s\S]*<dd[^>]*>Player11<\/dd>[\s\S]*<dt[^>]*>Posisi<\/dt>[\s\S]*<dd[^>]*>Forward<\/dd>/);
    expect(html.indexOf("UID-123")).toBeLessThan(html.indexOf("Player11"));
    expect(html.indexOf("Player11")).toBeLessThan(html.indexOf("Forward"));
    expect(html).toContain("UID-456");
  });

  it.each(["", "   "])("shows an unavailable UID for blank value %j without substituting IGN", (displayName) => {
    const html = renderToStaticMarkup(<PublicParticipantRoster players={[{ ...player, displayName }]} locale="id" />);
    expect(html).toContain("UID belum tersedia");
    expect(html).toContain("Player11");
    expect(html).not.toContain("<dd>Player11</dd><dt>IGN");
  });

  it.each(["", "   ", "Unassigned", " unASSIGNED "])("omits unassigned position %j", (position) => {
    const html = renderToStaticMarkup(<PublicParticipantRoster players={[{ ...player, position }]} locale="id" />);
    expect(html).not.toContain("Posisi");
    expect(html).not.toContain("Unassigned");
    expect(html).toContain("Player11");
  });

  it("uses English position and unavailable-UID copy", () => {
    const html = renderToStaticMarkup(<PublicParticipantRoster players={[{ ...player, displayName: " " }]} locale="en" />);
    expect(html).toContain("UID unavailable");
    expect(html).toContain("Position");
    expect(html).not.toContain("Posisi");
  });
});
