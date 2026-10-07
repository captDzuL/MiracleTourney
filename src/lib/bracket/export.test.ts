import { describe, expect, it, vi } from "vitest";
import type { SocialBracketModel } from "./types";
import { getBracketExportDimensions, renderSocialBracketPng, sanitizeBracketAssetUrl } from "./export";

const model: SocialBracketModel = {
  event: { id: "e", slug: "cup", name: "<img src=x onerror=alert(1)>", logoUrl: null, format: "single_elimination", status: "completed" },
  locale: "en", appearance: { backgroundUrl: null, positionX: 50, positionY: 50, overlay: 35 }, preview: false,
  champion: { id: "a", name: "Alpha", initials: "AL", logoUrl: null },
  matches: [{ id: "m", roundKey: "final", roundLabel: "Final", round: 1, slot: 0, bracket: "upper", home: { team: { id: "a", name: "Alpha", initials: "AL", logoUrl: null }, label: "Alpha", sourceMatchId: null, outcome: null }, away: { team: null, label: "TBD", sourceMatchId: null, outcome: null }, homeScore: 2, awayScore: 0, winnerTeamId: "a", status: "completed", bestOf: 3, schedule: null, games: [] }],
};

describe("bracket PNG export", () => {
  it("rejects unsafe assets and caps oversized canvases", () => {
    expect(sanitizeBracketAssetUrl("http://127.0.0.1/private")).toBeNull();
    expect(sanitizeBracketAssetUrl("https://example.com/a.png")).toBeNull();
    expect(sanitizeBracketAssetUrl("https://store.public.blob.vercel-storage.com/a.png")).toBe("https://store.public.blob.vercel-storage.com/a.png");
    expect(sanitizeBracketAssetUrl("/bracket-backgrounds/art.png")).toBe("/bracket-backgrounds/art.png");
    expect(sanitizeBracketAssetUrl("/team-logos/logo.webp")).toBe("/team-logos/logo.webp");
    expect(sanitizeBracketAssetUrl("/logo/miracle-preview.png")).toBe("/logo/miracle-preview.png");
    expect(sanitizeBracketAssetUrl("/bracket-backgrounds/../private.png")).toBeNull();
    expect(() => getBracketExportDimensions(Array.from({ length: 120 }, (_, i) => `r-${i}`), 100)).toThrow(/round/i);
  });

  it("inlines a validated local artwork file into the PNG instead of issuing browser requests", async () => {
    let html = "";
    const page = { setViewportSize: vi.fn(), setContent: vi.fn(async (value: string) => { html = value; }), evaluate: vi.fn(), route: vi.fn(), screenshot: vi.fn().mockResolvedValue(Buffer.from("png")), close: vi.fn() };
    const browser = { newPage: vi.fn().mockResolvedValue(page), close: vi.fn() };
    await renderSocialBracketPng({ ...model, appearance: { ...model.appearance, backgroundUrl: "/logo/miracle-preview.png" } }, undefined, { launchBrowser: async () => browser as never });
    expect(html).toContain("data:image/png;base64,");
    expect(html).not.toContain("url('/logo/miracle-preview.png')");
  });

  it("renders escaped board HTML with selected round and waits for screenshot assets", async () => {
    let html = "";
    const screenshot = vi.fn().mockResolvedValue(Buffer.from("png"));
    const page = { setViewportSize: vi.fn(), setContent: vi.fn(async (value: string) => { html = value; }), evaluate: vi.fn(), route: vi.fn(), screenshot, close: vi.fn() };
    const browser = { newPage: vi.fn().mockResolvedValue(page), close: vi.fn() };
    const png = await renderSocialBracketPng(model, "final", { launchBrowser: async () => browser as never });
    expect(png.toString()).toBe("png");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).not.toContain("<img src=x onerror=alert(1)>");
    expect(html).toContain("CHAMPION");
    expect(html).toContain("2-0");
    expect(html).toContain("Single elimination");
    expect(html).toContain("LIVE");
    expect(html).toContain("Winner");
    expect(html).not.toContain("<details");
    expect(html).not.toContain("Download PNG");
    expect(page.evaluate).toHaveBeenCalled();
    const viewport = page.setViewportSize.mock.calls[0][0];
    expect(viewport.width).toBeLessThan(600);
    expect(viewport.height).toBeLessThan(620);
    expect(screenshot).toHaveBeenCalledWith({ type: "png", fullPage: false });
  });
});
