import { describe, expect, it } from "vitest";

import { buildCertificateHtml } from "./template";

const baseData = {
  eventName: "Miracle Fast Tour",
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

  it("renders a Kuroko-specific poster skin", async () => {
    const html = await buildCertificateHtml({
      ...baseData,
      eventName: "Kuroko Street Rival Summer Cup",
      gameName: "Kuroko no Basket Street Rival",
      teamName: "Rakuzan",
      accentColor: "#0369a1",
      certId: "KU-2026-00002",
      eventSlug: "kuroko-summer-cup",
    });

    expect(html).toContain('data-theme="kuroko"');
    expect(html).toContain("Court of Miracles");
    expect(html).toContain("kuroko-emblem");
    expect(html).toContain("Read the Play");
    expect(html).toContain("Rule the Court");
    expect(html).not.toContain('class="theme-copy"><span class="heading">Kuroko Street Rival Summer Cup</span>');
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
