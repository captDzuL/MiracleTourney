// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SocialBracketModel } from "@/lib/bracket/types";
import { SocialBracketBoard } from "./SocialBracketBoard";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const model: SocialBracketModel = {
  event: { id: "e", slug: "cup", name: "Cup", logoUrl: null, format: "single_elimination", status: "ongoing" }, locale: "en", appearance: { backgroundUrl: null, positionX: 50, positionY: 50, overlay: 35 }, preview: false, champion: null,
  matches: [{ id: "m", roundKey: "final", roundLabel: "Final", round: 1, slot: 0, bracket: "upper", home: { team: null, label: "TBD", sourceMatchId: null, outcome: null }, away: { team: null, label: "TBD", sourceMatchId: null, outcome: null }, homeScore: null, awayScore: null, winnerTeamId: null, status: "scheduled", bestOf: 1, schedule: null, games: [] }],
};
afterEach(() => vi.restoreAllMocks());
describe("bracket download control", () => {
  it("shows initials when an allowed logo cannot load", async () => {
    const withLogo = { ...model, matches: [{ ...model.matches[0], home: { ...model.matches[0].home, team: { id: "a", name: "Alpha", initials: "AL", logoUrl: "/team-logos/missing.png" } } }] };
    const container = document.createElement("div"); document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => root.render(<SocialBracketBoard model={withLogo} />));
    const image = container.querySelector<HTMLImageElement>("img[data-team-logo]")!;
    await act(async () => image.dispatchEvent(new Event("error")));
    expect(image.hidden).toBe(true);
    expect(container.textContent).toContain("AL");
    await act(async () => root.unmount()); container.remove();
  });
  it("shows a useful retry message for oversized full PNG", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 413, json: async () => ({ code: "too_large" }) }));
    const container = document.createElement("div"); document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => root.render(<SocialBracketBoard model={model} />));
    const button = [...container.querySelectorAll("button")].find((node) => node.textContent?.includes("Download full PNG"))!;
    await act(async () => { button.click(); });
    expect(container.textContent).toContain("Choose a round");
    expect(button.disabled).toBe(false);
    await act(async () => root.unmount()); container.remove();
  });
});
