// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import QRCode from "qrcode";
import {
  buildMiracleV3CertificateHtml, getMiracleV3CertificateFingerprint,
  MIRACLE_V3_CERTIFICATE_TYPES, MIRACLE_V3_SAFE_ZONES,
  type MiracleV3CertificateData,
} from "./miracle-v3";

export const fixture: MiracleV3CertificateData = {
  eventId: "event-1", eventName: "Miracle Cup", gameId: "game-flashpeak", gameName: "Flashpeak",
  certificateId: "cert-1", certificateType: "champion", version: 2, templateVersion: "miracle-v3",
  recipientId: "team-1", recipientName: "Garuda Nova", recipientKind: "team",
  teamId: "team-1", teamName: "Garuda Nova", teamLogoUrl: "https://assets.example/team.png",
  characterArtUrl: "https://assets.example/hero.png", issueDate: "2026-09-05",
  verificationCode: "verify-123", verificationBaseUrl: "https://miracle-league.fun",
  branding: { cyan: "#49d1ec", violet: "#aa8bff", cream: "#f6dfb1" },
};
const documentFor = async (data = fixture, editorPreview = false) => new DOMParser().parseFromString(await buildMiracleV3CertificateHtml(data, { editorPreview }), "text/html");

describe("Miracle V3 certificate contract", () => {
  it.each([".", "..", "../verify-1", "a/b", "a\\b", "%2e%2e", "a?b", "a#b", " verify-1", "verify-1 ", "", "a".repeat(129)])("rejects path-special or malformed verification code %s", async verificationCode => {
    await expect(buildMiracleV3CertificateHtml({ ...fixture, verificationCode })).rejects.toThrow("Invalid verification code");
    expect(() => getMiracleV3CertificateFingerprint({ ...fixture, verificationCode })).toThrow("Invalid verification code");
  });
  it.each(["verify-123", "a_B-9", "-Ab_", "Z".repeat(128)])("preserves opaque verification code %s as one route segment", async verificationCode => {
    const doc = await documentFor({ ...fixture, verificationCode });
    const href = doc.querySelector('[data-zone="qrVerification"] a')!.getAttribute("href")!;
    const resolved = new URL(href);
    expect(resolved.origin).toBe("https://miracle-league.fun");
    expect(resolved.pathname).toBe(`/certificates/verify/${verificationCode}`);
    expect(resolved.search).toBe(""); expect(resolved.hash).toBe("");
  });
  it.each([
    ["champion", "Champion", "team"], ["runner_up", "Runner-up", "team"], ["third_place", "Third Place", "team"],
    ["mvp", "MVP of Tournament", "player"], ["top_scorer", "Top Scorer", "player"],
    ["top_defender", "Top Defender", "player"], ["top_assist", "Top Assist", "player"],
  ] as const)("renders %s with the correct recipient and hero", async (certificateType, label, recipientKind) => {
    const doc = await documentFor({ ...fixture, certificateType, recipientKind });
    expect(doc.querySelector('[data-zone="award"]')?.textContent).toContain(label);
    expect(doc.querySelector('[data-zone="recipient"]')?.textContent).toContain("Garuda Nova");
    expect(doc.querySelector('[data-zone="hero"] img')?.getAttribute("src")).toBe(recipientKind === "team" ? "https://assets.example/team.png" : "https://assets.example/hero.png");
    expect(doc.querySelectorAll('[data-role="character-art"]').length).toBe(recipientKind === "team" ? 0 : 1);
    expect(doc.querySelectorAll('[data-zone="secondaryBadge"] img').length).toBe(recipientKind === "team" ? 0 : 1);
    expect(MIRACLE_V3_CERTIFICATE_TYPES).toContain(certificateType);
  });
  it("fixes every protected zone inside the portrait canvas without overlaps", async () => {
    const doc = await documentFor();
    const root = doc.querySelector<HTMLElement>("main")!;
    expect(root.dataset.certificateCanvas).toBe("1080x1920");
    expect(root.style.width).toBe("1080px"); expect(root.style.height).toBe("1920px");
    expect(Object.keys(MIRACLE_V3_SAFE_ZONES).sort()).toEqual(["award", "certificateId", "hero", "identity", "issueDate", "qrVerification", "recipient", "secondaryBadge"].sort());
    const zones = Object.values(MIRACLE_V3_SAFE_ZONES);
    expect(Object.isFrozen(MIRACLE_V3_SAFE_ZONES)).toBe(true);
    for (const [name, zone] of Object.entries(MIRACLE_V3_SAFE_ZONES)) {
      expect(Object.isFrozen(zone)).toBe(true);
      expect(zone.x).toBeGreaterThanOrEqual(0); expect(zone.y).toBeGreaterThanOrEqual(0);
      expect(zone.x + zone.width).toBeLessThanOrEqual(1080); expect(zone.y + zone.height).toBeLessThanOrEqual(1920);
      const element = doc.querySelector<HTMLElement>(`[data-zone="${name}"]`)!;
      expect(element.style.left).toBe(`${zone.x}px`); expect(element.style.top).toBe(`${zone.y}px`);
    }
    for (let i = 0; i < zones.length; i++) for (let j = i + 1; j < zones.length; j++) {
      const a = zones[i], b = zones[j];
      expect(a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y).toBe(false);
    }
  });
  it("applies approved asset coordinates relative to the fixed zone and excludes editor guides from output", async () => {
    const doc = await documentFor({ ...fixture, assetPlacement: { assetKind: "team_logo_hero", x: 320, y: 700, width: 500, height: 500 } });
    const hero = doc.querySelector<HTMLElement>('[data-role="team-logo"]')!;
    expect(hero.style.left).toBe("16px");
    expect(hero.style.top).toBe("12px");
    expect(hero.style.width).toBe("500px");
    expect(doc.querySelector("[data-editor-guide]")).toBeNull();
  });
  it("rejects out-of-zone or non-finite placement at the render boundary", async () => {
    await expect(buildMiracleV3CertificateHtml({ ...fixture, assetPlacement: { assetKind: "team_logo_hero", x: 0, y: 700, width: 500, height: 500 } })).rejects.toThrow("Invalid certificate asset placement");
    expect(() => getMiracleV3CertificateFingerprint({ ...fixture, assetPlacement: { assetKind: "team_logo_hero", x: Number.NaN, y: 700, width: 500, height: 500 } })).toThrow("Invalid certificate asset placement");
  });
  it("embeds the QR for the immutable verification code", async () => {
    const doc = await documentFor();
    const target = "https://miracle-league.fun/certificates/verify/verify-123";
    expect(doc.querySelector('[data-zone="qrVerification"] a')?.getAttribute("href")).toBe(target);
    expect(doc.querySelector('[data-role="verification-qr"]')?.getAttribute("src")).toBe(await QRCode.toDataURL(target, { width: 200, margin: 4, errorCorrectionLevel: "M" }));
  });
  it.each(["javascript:alert(1)", "data:image/svg+xml,<svg onload=alert(1)>", "//evil.example/a.png", "file:///secret", "/api/private", "/logo/../../api/private", "https://user:pass@example.com/a.png"])("rejects unsafe assets %s without shifting the hero", async (url) => {
    const doc = await documentFor({ ...fixture, certificateType: "mvp", recipientKind: "player", characterArtUrl: url, teamLogoUrl: url });
    expect(doc.querySelector('[data-role="character-art"]')).toBeNull();
    expect(doc.querySelector('[data-role="hero-fallback"]')).not.toBeNull();
    expect([...doc.images].some(img => img.getAttribute("src") === url)).toBe(false);
  });
  it.each(["https://assets.example/opaque.jpg", "/logo/miracle-symbol.svg", "/character-art/roster/striker/Orion.png"])("accepts approved image sources %s", async (url) => {
    const doc = await documentFor({ ...fixture, teamLogoUrl: url });
    expect(doc.querySelector('[data-zone="hero"] img')?.getAttribute("src")).toContain(url);
  });
  it("escapes names and clamps long text within protected zones", async () => {
    const name = '<script>alert("x")</script> ' + "VeryLongName".repeat(80);
    const doc = await documentFor({ ...fixture, eventName: name, teamName: name, recipientName: name });
    expect(doc.scripts).toHaveLength(0);
    for (const zone of ["identity", "recipient"]) {
      const element = doc.querySelector<HTMLElement>(`[data-zone="${zone}"]`)!;
      expect(element.textContent).toContain(name);
      expect(element.style.overflow).toBe("hidden");
    }
    expect(doc.querySelector("style")?.textContent).toContain("overflow-wrap:anywhere");
  });
  it("renders guides only for explicit editor previews", async () => {
    expect((await documentFor()).querySelector('[data-editor-guide]')).toBeNull();
    expect((await documentFor(fixture, true)).querySelectorAll('[data-editor-guide]')).toHaveLength(8);
  });
  it("normalizes key order, Unicode and whitespace deterministically and includes version and visual inputs", async () => {
    const reordered = Object.fromEntries(Object.entries(fixture).reverse()) as unknown as MiracleV3CertificateData;
    const hash = getMiracleV3CertificateFingerprint(fixture);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(getMiracleV3CertificateFingerprint(reordered)).toBe(hash);
    expect(getMiracleV3CertificateFingerprint({ ...fixture, recipientName: "  Garuda   Nova  " })).toBe(hash);
    for (const changes of [{ version: 3 }, { teamLogoUrl: "https://assets.example/new.png" }, { certificateType: "runner_up" as const }, { issueDate: "2026-09-06" }]) {
      expect(getMiracleV3CertificateFingerprint({ ...fixture, ...changes })).not.toBe(hash);
    }
    const individual = { ...fixture, certificateType: "mvp" as const, recipientKind: "player" as const, characterArtUrl: null };
    expect((await documentFor(individual)).querySelector('[data-role="hero-fallback"]')).not.toBeNull();
    expect(await buildMiracleV3CertificateHtml(individual)).toBe(await buildMiracleV3CertificateHtml(individual));
  });
  it("rejects invalid identity, palette, version, kind and verification origins", async () => {
    for (const changes of [{ version: 0 }, { recipientId: "" }, { recipientKind: "player" as const }, { verificationBaseUrl: "javascript:alert(1)" }, { branding: { ...fixture.branding, cyan: "red;}</style><script>" } }]) {
      await expect(buildMiracleV3CertificateHtml({ ...fixture, ...changes })).rejects.toThrow();
    }
  });
});
