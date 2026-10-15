// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import QRCode from "qrcode";
import {
  buildMiracleV3CertificateHtml, getMiracleV3CertificateFingerprint,
  MIRACLE_V3_CERTIFICATE_TYPES, MIRACLE_V3_SAFE_ZONES,
  type MiracleV3CertificateData,
} from "./miracle-v3";
import { getMiracleV3EditorialCopy } from "./miracle-v3-editorial-copy";

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
    const copy = getMiracleV3EditorialCopy(certificateType);
    const award = doc.querySelector('[data-zone="award"]')!;
    expect(award.textContent).toContain(copy.eyebrow);
    expect(award.textContent).toContain(copy.motto);
    expect([...award.querySelectorAll("h1, h1 span")].map((line) => line.firstChild?.textContent)).toEqual([copy.megaLines[0], copy.megaLines[1]]);
    expect(award.querySelector("h1")?.getAttribute("aria-label")).toBe(label);
    expect(doc.querySelector("main")?.getAttribute("data-certificate-type")).toBe(certificateType);
    expect(doc.querySelector('[data-zone="recipient"]')?.textContent).toContain(copy.recipientLabel);
    expect(doc.querySelector('[data-zone="recipient"]')?.textContent).toContain(copy.rank);
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
  it("positions individual hero and team badge independently", async () => {
    const doc = await documentFor({
      ...fixture, certificateType: "mvp", recipientKind: "player",
      assetPlacements: [
        { assetKind: "character_art", x: 320, y: 700, width: 500, height: 500 },
        { assetKind: "team_logo_badge", x: 70, y: 1050, width: 150, height: 150 },
      ],
    });
    expect(doc.querySelector<HTMLElement>('[data-role="character-art"]')?.style.left).toBe("16px");
    expect(doc.querySelector<HTMLElement>('[data-zone="secondaryBadge"] img')?.style.left).toBe("6px");
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
  it("accepts only inert raster data URLs produced from verified owned local assets", async () => {
    const embedded = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
    const doc = await documentFor({ ...fixture, teamLogoUrl: embedded });
    expect(doc.querySelector('[data-role="team-logo"]')?.getAttribute("src")).toBe(embedded);

    for (const unsafe of [
      "data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+PC9zdmc+",
      "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
      "data:image/png;base64,not-valid-base64%%",
    ]) {
      expect((await documentFor({ ...fixture, teamLogoUrl: unsafe })).querySelector('[data-role="team-logo"]')).toBeNull();
    }
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
  it("shows the Miracle logo, issuer, certificate id, issue date and QR link on every type", async () => {
    for (const certificateType of MIRACLE_V3_CERTIFICATE_TYPES) {
      const recipientKind = ["champion", "runner_up", "third_place"].includes(certificateType) ? "team" : "player";
      const doc = await documentFor({ ...fixture, certificateType, recipientKind });
      expect(doc.querySelector('[data-zone="identity"] img[alt="Miracle"]')?.getAttribute("src")).toMatch(/^data:image\/svg\+xml;base64,/);
      expect(doc.querySelector('[data-zone="issueDate"]')?.textContent).toContain("Issued by Miracle");
      expect(doc.querySelector('[data-zone="issueDate"]')?.textContent).toContain("2026-09-05");
      expect(doc.querySelector('[data-zone="certificateId"]')?.textContent).toContain("cert-1");
      expect(doc.querySelector('[data-role="verification-qr"]')).not.toBeNull();
    }
  });
  it("draws the event monogram from the event name inside the identity zone, escaped", async () => {
    const doc = await documentFor({ ...fixture, eventName: "Flash Peak Championship" });
    expect(doc.querySelector('[data-zone="identity"] .monogram')?.textContent).toBe("FP");
    const hostile = await documentFor({ ...fixture, eventName: '<img src=x onerror=alert(1)> Cup' });
    expect(hostile.querySelector('[data-zone="identity"] .monogram')?.textContent).toMatch(/^[\p{L}\p{N}]{1,2}$/u);
    expect(hostile.querySelectorAll("img[onerror]")).toHaveLength(0);
  });
  it("frames the team logo in a diamond centred on its placement and keeps the logo box as supplied", async () => {
    const doc = await documentFor({ ...fixture, assetPlacement: { assetKind: "team_logo_hero", x: 360, y: 748, width: 560, height: 540 } });
    const frame = doc.querySelector<HTMLElement>('[data-zone="hero"] [data-role="hero-frame"]')!;
    expect(frame.style.transform).toBe("rotate(45deg)");
    const side = parseInt(frame.style.width, 10);
    expect(parseInt(frame.style.left, 10) + side / 2).toBeCloseTo(56 + 280, 0);
    expect(parseInt(frame.style.top, 10) + side / 2).toBeCloseTo(60 + 270, 0);
    expect(frame.querySelector("img")).toBeNull();
    expect(doc.querySelectorAll('[data-zone="hero"] img')).toHaveLength(1);
    expect(doc.querySelector<HTMLElement>('[data-role="team-logo"]')?.style.left).toBe("56px");
    expect((await documentFor({ ...fixture, certificateType: "mvp", recipientKind: "player" })).querySelector('[data-role="hero-frame"]')).toBeNull();
  });
  it("uses the default logo box and a team-initials emblem when the studio sets no placement or the logo is missing", async () => {
    const doc = await documentFor({ ...fixture, teamLogoUrl: null, teamName: "Garuda Nova" });
    const emblem = doc.querySelector<SVGElement>('[data-zone="hero"] [data-role="hero-fallback"]')!;
    expect(emblem.textContent).toContain("GN");
    expect(emblem.getAttribute("style")).toContain("left:56px;top:60px;width:560px;height:540px");
    const withLogo = await documentFor(fixture);
    expect(withLogo.querySelector("template[data-hero-fallback]")?.innerHTML ?? "").toContain("GN");
  });
  it("keeps 60-character and unicode names escaped, clamped and sized down inside their zones", async () => {
    const long = "A".repeat(60);
    const emoji = "🔥🔥 Naga Api 🐉 日本語チーム";
    for (const name of [long, emoji]) {
      const doc = await documentFor({ ...fixture, recipientName: name, teamName: name, eventName: name });
      const recipient = doc.querySelector<HTMLElement>('[data-zone="recipient"] .recipient')!;
      expect(recipient.textContent).toBe(name);
      expect(recipient.className).toContain("clamp");
      expect(parseInt(recipient.style.fontSize, 10)).toBeLessThan(58);
      expect(doc.querySelector<HTMLElement>('[data-zone="recipient"]')!.style.overflow).toBe("hidden");
      expect(doc.querySelector<HTMLElement>('[data-zone="identity"]')!.style.overflow).toBe("hidden");
    }
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
