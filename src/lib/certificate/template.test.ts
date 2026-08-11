import { describe, expect, it } from "vitest";

import { buildCertificateHtml } from "./template";

const baseData = {
  eventName: "Miracle Fast Tour",
  gameId: "game-flashpeak",
  gameName: "Flashpeak",
  teamName: "Quantum Vanguard",
  accentColor: "#16a34a",
  characterArtUrl: null,
  certId: "FL-2026-00001",
  date: "9 Agustus 2026",
  eventSlug: "miracle-league",
  baseUrl: "https://miracle-tourney.vercel.app",
};

describe("buildCertificateHtml", () => {
  it("renders Miracle branding and uses the team name as the oversized background word", async () => {
    const html = await buildCertificateHtml(baseData);

    expect(html).toContain("Built by Miracle");
    expect(html).toContain("Miracle Championship Series");
    expect(html).toContain('class="bg-team-name" data-team-name="Quantum Vanguard"');
    expect(html).not.toContain(">FLASHPEAK<");
  });

  it("renders a Flashpeak-specific poster skin", async () => {
    const html = await buildCertificateHtml(baseData);

    expect(html).toContain('data-theme="flashpeak"');
    expect(html).toContain("Peak Performance");
    expect(html).toContain("flash-emblem");
    expect(html).toContain("Built to Clutch");
    expect(html).toContain("Born to Peak");
    expect(html).not.toContain('class="theme-copy"><span class="heading">Miracle Fast Tour</span>');
  });

  it("renders a Kuroko-specific poster skin from the game registry id, not the display name", async () => {
    const html = await buildCertificateHtml({
      ...baseData,
      eventName: "Summer Invitational",
      gameId: "game-kuroko",
      gameName: "Summer Invitational Feature Game",
      teamName: "Rakuzan",
      accentColor: "#0369a1",
      certId: "KU-2026-00002",
      eventSlug: "summer-invitational",
    });

    expect(html).toContain('data-theme="kuroko"');
    expect(html).toContain("Court of Miracles");
    expect(html).toContain("kuroko-emblem");
    expect(html).toContain("Read the Play");
    expect(html).toContain("Rule the Court");
    expect(html).not.toContain('class="theme-copy"><span class="heading">Summer Invitational</span>');
  });

  it("renders newly onboarded game themes from the registry instead of falling back to legacy skins", async () => {
    const valorantHtml = await buildCertificateHtml({
      ...baseData,
      gameId: "game-valorant",
      gameName: "Valorant",
      teamName: "Phantom Protocol",
      certId: "VLR-2026-00003",
      eventSlug: "valorant-open",
      accentColor: "#dc2626",
    });

    const dotaHtml = await buildCertificateHtml({
      ...baseData,
      gameId: "game-dota2",
      gameName: "DOTA 2",
      teamName: "Ancient Breakers",
      certId: "D2-2026-00004",
      eventSlug: "ancient-series",
      accentColor: "#b91c1c",
    });

    expect(valorantHtml).toContain('data-theme="valorant"');
    expect(valorantHtml).toContain("Hold the Site");
    expect(valorantHtml).not.toContain('data-theme="flashpeak"');

    expect(dotaHtml).toContain('data-theme="dota2"');
    expect(dotaHtml).toContain("Break the Ancient");
    expect(dotaHtml).not.toContain('data-theme="kuroko"');
  });

  it("keeps every word of long team names in the foreground lockup", async () => {
    const html = await buildCertificateHtml({
      ...baseData,
      teamName: "Alpha Beta Gamma Delta Epsilon Zeta Eta",
    });

    expect(html).toContain(">Eta<");
  });

  it("does not reintroduce legacy character art overlays in poster mode", async () => {
    const html = await buildCertificateHtml({
      ...baseData,
      characterArtUrl: "https://example.com/team-art.png",
    });

    expect(html).not.toContain("external-art");
    expect(html).not.toContain("team-art.png");
  });
});
