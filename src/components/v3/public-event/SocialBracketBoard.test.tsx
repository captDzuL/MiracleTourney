// @vitest-environment jsdom
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SocialBracketModel } from "@/lib/bracket/types";
import { SocialBracketBoard } from "./SocialBracketBoard";
import { buildBracketLayout } from "@/lib/bracket/layout";
import { renderBracketCanvasHtml } from "@/lib/bracket/markup";

const team = (id: string, name: string, logoUrl: string | null = null) => ({ id, name, logoUrl, initials: name.slice(0, 2).toUpperCase() });
const slot = (id: string, name: string, sourceMatchId: string | null = null, logoUrl: string | null = null) => ({ team: team(id, name, logoUrl), label: name, sourceMatchId, outcome: sourceMatchId ? "winner" as const : null });
const fixture: SocialBracketModel = {
  event: { id: "event-1", slug: "cup", name: "Cup & Crown", logoUrl: null, format: "single_elimination", status: "ongoing" }, locale: "id",
  appearance: { backgroundUrl: null, positionX: 50, positionY: 50, overlay: 35 }, preview: false,
  champion: team("a", "Alpha"),
  matches: [
    { id: "semi", roundKey: "semi", roundLabel: "Semifinal", round: 1, slot: 0, bracket: "upper", home: slot("a", "Alpha", null, "https://store.public.blob.vercel-storage.com/a.png"), away: slot("b", "Beta"), homeScore: 2, awayScore: 1, winnerTeamId: "a", status: "completed", bestOf: 3, schedule: "2026-10-04T10:00:00.000Z", games: [{ number: 1, homeScore: 1, awayScore: 0 }] },
    { id: "final", roundKey: "final", roundLabel: "Final", round: 2, slot: 0, bracket: "upper", home: slot("a", "Alpha", "semi"), away: { team: null, label: "Winner of other semi", sourceMatchId: "missing", outcome: "winner" }, homeScore: 1, awayScore: null, winnerTeamId: null, status: "live", bestOf: 5, schedule: null, games: [] },
  ],
};

describe("SocialBracketBoard", () => {
  it("renders distinct team rows, logo fallback, waiting source and official champion", () => {
    const html = renderToStaticMarkup(<SocialBracketBoard model={fixture} exportHref="/api/events/cup/bracket.png?locale=id" />);
    expect(html).toContain("Alpha");
    expect(html).toContain("Beta");
    expect(html).toContain("Winner of other semi");
    expect(html).toContain("JUARA TURNAMEN");
    expect(html).toContain("Sistem gugur");
    expect(html).not.toContain("Hasil final 2-1");
    expect(html).toContain("LIVE");
    expect(html).toContain("data-team-initials");
    expect(html).toContain("data-team-logo");
    expect(html).toContain('data-match-id="semi"');
    expect(html).toContain('data-match-id="final"');
    expect(html).toContain("Game 1");
    expect(html).toContain('class="sb-round-selector"');
    expect(html).toContain("sb-mobile-scroll");
  });

  it("draws only existing explicit source IDs, including cross bracket references", () => {
    const layout = buildBracketLayout(fixture.matches);
    expect(layout.edges).toEqual([{ sourceId: "semi", targetId: "final", outcome: "winner", targetSlot: "home" }]);
  });

  it("uses saved artwork and overlay coordinates in the board", () => {
    const themed = { ...fixture, appearance: { backgroundUrl: "https://store.public.blob.vercel-storage.com/bg.png", positionX: 25, positionY: 75, overlay: 40 } };
    const html = renderToStaticMarkup(<SocialBracketBoard model={themed} />);
    expect(html).toContain("background-position:25% 75%");
    expect(html).toContain("bg.png");
  });

  it("localizes organizer preview header, format and status", () => {
    const preview = { ...fixture, preview: true, event: { ...fixture.event, format: "Single Elimination", status: "Finished" } };
    const html = renderToStaticMarkup(<SocialBracketBoard model={preview} />);
    expect(html).toContain("PRATINJAU BRACKET");
    expect(html).toContain("Sistem gugur");
    expect(html).toContain("Selesai");
  });

  it("anchors the champion by the final column and summarizes the official winner in the header", () => {
    const complete = { ...fixture, matches: fixture.matches.map((match) => match.id === "final" ? { ...match, status: "completed" as const, winnerTeamId: "a", homeScore: 3, awayScore: 1 } : match) };
    const html = renderToStaticMarkup(<SocialBracketBoard model={complete} />);
    expect(html).toContain("JUARA RESMI");
    expect(html).toContain('class="sb-champion" style="left:338px;');
    expect(html).toContain("Hasil final 3-1");
  });
  it("keeps a selected final champion fully within its canvas at 390px", () => {
    const complete = { ...fixture, matches: fixture.matches.map((match) => match.id === "final" ? { ...match, status: "completed" as const, winnerTeamId: "a", homeScore: 3, awayScore: 1 } : match) };
    const host = document.createElement("div");
    host.innerHTML = renderBracketCanvasHtml(complete, "final");
    const canvas = host.querySelector<HTMLElement>("[data-bracket-canvas]")!;
    const champion = host.querySelector<HTMLElement>(".sb-champion")!;
    const canvasWidth = Number.parseFloat(canvas.style.width);
    const panelWidth = Number.parseFloat(champion.style.width);
    expect(Number.isFinite(panelWidth)).toBe(true);
    expect(Number.parseFloat(champion.style.left) + panelWidth).toBeLessThanOrEqual(canvasWidth);
    expect(panelWidth).toBeLessThanOrEqual(272);
    expect(canvasWidth).toBeLessThanOrEqual(390 - 2 * 16 - 2 * 4);
  });

  it("does not present a league fixture score as a final result", () => {
    const league = { ...fixture, event: { ...fixture.event, format: "round_robin" }, matches: [fixture.matches[0]] };
    const html = renderToStaticMarkup(<SocialBracketBoard model={league} />);
    expect(html).toContain("JUARA TURNAMEN");
    expect(html).not.toContain("Hasil final");
  });

  it("localizes delayed and postponed matches distinctly", () => {
    const delayed = { ...fixture, matches: fixture.matches.map((match, index) => ({ ...match, status: index === 0 ? "delayed" as const : "postponed" as const })) };
    const html = renderToStaticMarkup(<SocialBracketBoard model={delayed} />);
    expect(html).toContain("TERTUNDA");
    expect(html).toContain("DITUNDA");
  });

  it("hides download controls from the export canvas", () => {
    const html = renderToStaticMarkup(<SocialBracketBoard model={fixture} showControls={false} />);
    expect(html).not.toContain("Unduh PNG");
    expect(html).toContain("JUARA TURNAMEN");
  });
});
