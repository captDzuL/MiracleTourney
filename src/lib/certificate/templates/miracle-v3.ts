import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import QRCode from "qrcode";
import { MIRACLE_V3_BRANDING, MIRACLE_V3_CERTIFICATE_TYPES, MIRACLE_V3_SAFE_ZONES, type MiracleV3CertificateData, type MiracleV3CertificateType } from "./miracle-v3-contract";
export { MIRACLE_V3_BRANDING, MIRACLE_V3_CERTIFICATE_TYPES, MIRACLE_V3_SAFE_ZONES, type MiracleV3CertificateData, type MiracleV3CertificateType } from "./miracle-v3-contract";
const labels: Record<MiracleV3CertificateType, string> = {
  champion: "Champion", runner_up: "Runner-up", third_place: "Third Place", mvp: "MVP of Tournament",
  top_scorer: "Top Scorer", top_defender: "Top Defender", top_assist: "Top Assist",
};
const text = (value: string) => value.normalize("NFC").trim().replace(/\s+/g, " ");
const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const teamType = (type: MiracleV3CertificateType) => ["champion", "runner_up", "third_place"].includes(type);

/** Local asset paths are restricted to repository-owned visual directories. */
function assetUrl(value: string | null, origin: string): string | null {
  if (!value) return null;
  const source = value.trim();
  if (/[\u0000-\u0020\\]/.test(source)) return null;
  try {
    if (source.startsWith("data:")) {
      const embedded = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(source);
      if (!embedded || embedded[2].length % 4 !== 0
        || Buffer.from(embedded[2], "base64").toString("base64") !== embedded[2]) return null;
      return source;
    }
    if (source.startsWith("/")) {
      if (!/^\/(logo|character-art|uploads|team-logos|certificate-assets)\//.test(source)) return null;
      const decoded = decodeURIComponent(source);
      if (decoded.includes("..") || decoded.includes("\\") || /[\u0000-\u001f]/.test(decoded)) return null;
    } else if (!source.startsWith("https://")) return null;
    const url = new URL(source, origin);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.href;
  } catch { return null; }
}

/** Ordered normalized values only: no clock, filesystem or network-derived identity. */
export function getMiracleV3CertificateManifest(data: MiracleV3CertificateData) {
  // Opaque ASCII URL-safe token: preserve bytes, never trim or normalize identity.
  if (typeof data.verificationCode !== "string" || data.verificationCode.length < 1 || data.verificationCode.length > 128 || /[^A-Za-z0-9_-]/.test(data.verificationCode)) {
    throw new Error("Invalid verification code: use 1-128 ASCII letters, digits, underscores or hyphens");
  }
  if (!MIRACLE_V3_CERTIFICATE_TYPES.includes(data.certificateType)) throw new Error("Invalid certificate type");
  if (!Number.isSafeInteger(data.version) || data.version < 1) throw new Error("Invalid certificate version");
  if (data.templateVersion !== "miracle-v3") throw new Error("Unsupported template version");
  if (data.recipientKind !== (teamType(data.certificateType) ? "team" : "player")) throw new Error("Invalid recipient kind");
  for (const value of [data.eventId, data.eventName, data.gameId, data.gameName, data.certificateId, data.recipientId, data.recipientName, data.teamId, data.teamName, data.verificationCode, data.issueDate]) {
    if (typeof value !== "string" || !text(value)) throw new Error("Missing certificate identity");
  }
  const base = new URL(data.verificationBaseUrl);
  if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash || base.pathname !== "/") throw new Error("Invalid verification origin");
  for (const key of ["cyan", "violet", "cream"] as const) {
    if (data.branding[key].toLowerCase() !== MIRACLE_V3_BRANDING[key]) throw new Error("Unapproved certificate palette");
  }
  const requestedPlacements = data.assetPlacements ?? (data.assetPlacement ? [data.assetPlacement] : []);
  if (requestedPlacements.length > 2 || new Set(requestedPlacements.map((row) => row.assetKind)).size !== requestedPlacements.length) {
    throw new Error("Invalid certificate asset placement");
  }
  const assetPlacements = [];
  for (const placement of requestedPlacements) {

    const values = [placement.x, placement.y, placement.width, placement.height];
    const expectedKind = teamType(data.certificateType) ? "team_logo_hero" : placement.assetKind;
    const zone = expectedKind === "team_logo_badge" ? MIRACLE_V3_SAFE_ZONES.secondaryBadge : MIRACLE_V3_SAFE_ZONES.hero;
    if (!values.every(Number.isFinite) || placement.width <= 0 || placement.height <= 0
      || (teamType(data.certificateType) && placement.assetKind !== "team_logo_hero")
      || (!teamType(data.certificateType) && !["character_art", "team_logo_badge"].includes(placement.assetKind))
      || placement.x < zone.x || placement.y < zone.y
      || placement.x + placement.width > zone.x + zone.width
      || placement.y + placement.height > zone.y + zone.height) throw new Error("Invalid certificate asset placement");
    assetPlacements.push({
      assetKind: placement.assetKind,
      x: placement.x,
      y: placement.y,
      width: placement.width,
      height: placement.height,
    });
  }
  return {
    eventId: text(data.eventId), eventName: text(data.eventName), gameId: text(data.gameId), gameName: text(data.gameName),
    certificateId: text(data.certificateId), certificateType: data.certificateType, version: data.version, templateVersion: data.templateVersion,
    recipientId: text(data.recipientId), recipientName: text(data.recipientName), recipientKind: data.recipientKind,
    teamId: text(data.teamId), teamName: text(data.teamName), teamLogoUrl: assetUrl(data.teamLogoUrl, base.origin),
    characterArtUrl: teamType(data.certificateType) ? null : assetUrl(data.characterArtUrl, base.origin),
    issueDate: text(data.issueDate), verificationCode: data.verificationCode, verificationBaseUrl: base.origin,
    branding: MIRACLE_V3_BRANDING, assetPlacement: assetPlacements[0] ?? null, assetPlacements,
  };
}

export function getMiracleV3CertificateFingerprint(data: MiracleV3CertificateData): string {
  return createHash("sha256").update(JSON.stringify(getMiracleV3CertificateManifest(data)), "utf8").digest("hex");
}

function embeddedAssets() {
  const logo = readFileSync(path.join(process.cwd(), "public/logo/miracle-horizontal.svg"));
  // Resolve through the installed package link at runtime so Next.js does not
  // try to parse the binary font as a JavaScript module during server bundling.
  const font = readFileSync(path.join(process.cwd(), "node_modules", "@fontsource", "montserrat", "files", "montserrat-latin-800-normal.woff2"));
  return { logo: `data:image/svg+xml;base64,${logo.toString("base64")}`, font: font.toString("base64") };
}

export async function buildMiracleV3CertificateHtml(data: MiracleV3CertificateData, options: { editorPreview?: boolean } = {}): Promise<string> {
  const m = getMiracleV3CertificateManifest(data);
  const fingerprint = getMiracleV3CertificateFingerprint(data);
  const assets = embeddedAssets();
  const verificationUrl = `${m.verificationBaseUrl}/certificates/verify/${encodeURIComponent(m.verificationCode)}`;
  const qr = await QRCode.toDataURL(verificationUrl, { width: 200, margin: 4, errorCorrectionLevel: "M" });
  const zoneStyle = (zone: typeof MIRACLE_V3_SAFE_ZONES[keyof typeof MIRACLE_V3_SAFE_ZONES]) => `position:absolute;left:${zone.x}px;top:${zone.y}px;width:${zone.width}px;height:${zone.height}px;overflow:hidden`;
  const zone = (name: keyof typeof MIRACLE_V3_SAFE_ZONES, body: string) => `<section data-zone="${name}" style="${zoneStyle(MIRACLE_V3_SAFE_ZONES[name])}">${body}</section>`;
  const fallback = `<svg data-role="hero-fallback" aria-label="Miracle award emblem" viewBox="0 0 600 600" xmlns="http://www.w3.org/2000/svg"><path d="M300 30 560 180 560 420 300 570 40 420 40 180Z" fill="#151a24" stroke="#aa8bff" stroke-width="3"/><path d="M150 420V180L300 310 450 180V420" fill="none" stroke="#49d1ec" stroke-width="48"/><circle cx="300" cy="300" r="270" fill="none" stroke="#f6dfb1" stroke-dasharray="${12 + parseInt(fingerprint.slice(0, 2), 16) % 24} 28"/></svg>`;
  const hero = teamType(m.certificateType) ? m.teamLogoUrl : m.characterArtUrl;
  const placementStyle = (kind: "team_logo_hero" | "team_logo_badge" | "character_art", zoneName: "hero" | "secondaryBadge") => {
    const placement = m.assetPlacements.find((candidate) => candidate.assetKind === kind);
    if (!placement || placement.assetKind !== kind) return "";
    const base = MIRACLE_V3_SAFE_ZONES[zoneName];
    return ` style="position:absolute;left:${placement.x - base.x}px;top:${placement.y - base.y}px;width:${placement.width}px;height:${placement.height}px;object-fit:contain"`;
  };
  const heroKind = teamType(m.certificateType) ? "team_logo_hero" : "character_art";
  const heroImage = hero ? `<img data-role="${teamType(m.certificateType) ? "team-logo" : "character-art"}" src="${escape(hero)}" alt="${escape(teamType(m.certificateType) ? m.teamName : m.recipientName)}"${placementStyle(heroKind, "hero")}/>` : fallback;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escape(labels[m.certificateType])} · ${escape(m.recipientName)}</title>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; font-src data:; base-uri 'none'; form-action 'none'">
<style>
@font-face{font-family:Montserrat;src:url(data:font/woff2;base64,${assets.font}) format('woff2');font-weight:800;font-style:normal;font-display:block}
*{box-sizing:border-box}html,body{margin:0;width:1080px;height:1920px}body{font-family:Montserrat,sans-serif;color:#f6dfb1;background:#11151d;font-weight:800}
main{position:relative;overflow:hidden;background:linear-gradient(155deg,transparent 40%,#aa8bff18 65%,transparent 85%),#11151d}
main:before{content:"";position:absolute;inset:0 0 auto;height:336px;background:#f3efe7;border-bottom:8px solid #49d1ec}
main:after{content:"";position:absolute;left:64px;right:64px;top:1376px;height:2px;background:linear-gradient(90deg,#49d1ec,#aa8bff)}
section{z-index:1;overflow-wrap:anywhere}h1,h2,p{margin:0}h1{font-size:82px;line-height:1.04;letter-spacing:-3px;color:#f3efe7;margin-top:24px;max-width:900px}
.eyebrow{font-size:20px;letter-spacing:5px;text-transform:uppercase;color:#49d1ec}.clamp{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden;overflow-wrap:anywhere}
[data-zone=identity]{color:#11151d;display:grid;grid-template-columns:340px 1fr;align-items:center;gap:48px}[data-zone=identity] img{width:320px;padding:20px;background:#11151d;border-radius:8px}
.event{font-size:32px;line-height:1.2}.game{font-size:20px;margin-top:16px;color:#374151}
[data-zone=hero]{display:flex;align-items:center;justify-content:center;background:radial-gradient(ellipse,#aa8bff15,transparent 70%)}[data-zone=hero] img,[data-zone=hero] svg{width:90%;height:90%;object-fit:contain}
[data-zone=secondaryBadge] img{display:block;width:152px;height:152px;object-fit:contain;background:#f3efe7;padding:12px;border-radius:12px}.team{font-size:20px;line-height:1.2;margin-top:16px;-webkit-line-clamp:3}
[data-zone=recipient]{color:#f3efe7}.recipient{font-size:52px;line-height:1.15;margin-top:18px;-webkit-line-clamp:2}.label{font-size:18px;text-transform:uppercase;letter-spacing:3px;color:#aa8bff}
.meta{font-size:22px;line-height:1.3;margin-top:8px;-webkit-line-clamp:2}[data-zone=qrVerification]{text-align:center}[data-zone=qrVerification] img{display:block;width:200px;height:200px;margin:auto}[data-zone=qrVerification] a{color:#f6dfb1;font-size:14px;text-decoration:none}
</style></head><body><main data-certificate-canvas="1080x1920" data-template-version="miracle-v3" data-fingerprint="${fingerprint}" style="width:1080px;height:1920px">
${zone("identity", `<img src="${assets.logo}" alt="Miracle"/><div><p class="event clamp">${escape(m.eventName)}</p><p class="game clamp">${escape(m.gameName)}</p></div>`)}
${zone("award", `<p class="eyebrow">Miracle Championship Series</p><h1 class="clamp">${escape(labels[m.certificateType])}</h1>`)}
${zone("hero", heroImage + (hero ? `<template data-hero-fallback>${fallback}</template>` : ""))}
${zone("secondaryBadge", teamType(m.certificateType) ? "" : `${m.teamLogoUrl ? `<img src="${escape(m.teamLogoUrl)}" alt="${escape(m.teamName)} team logo"${placementStyle("team_logo_badge", "secondaryBadge")}/>` : `<span class="label">Miracle Team</span>`}<p class="team clamp">${escape(m.teamName)}</p>`)}
${zone("recipient", `<p class="label">Presented to · ${m.recipientKind === "team" ? "Team" : "Individual award"}</p><h2 class="recipient clamp">${escape(m.recipientName)}</h2>`)}
${zone("issueDate", `<p class="label">Issued by Miracle</p><p class="meta clamp">${escape(m.issueDate)}</p>`)}
${zone("certificateId", `<p class="label">Certificate ID · Version ${m.version}</p><p class="meta clamp">${escape(m.certificateId)}</p>`)}
${zone("qrVerification", `<a href="${escape(verificationUrl)}"><img data-role="verification-qr" src="${qr}" alt="Verify certificate"/>Verify authenticity</a>`)}
${options.editorPreview === true ? Object.entries(MIRACLE_V3_SAFE_ZONES).map(([name, rectangle]) => `<aside data-editor-guide="${name}" style="${zoneStyle(rectangle)};z-index:10;border:2px dashed #49d1ec;color:#11151d;background:#49d1ec18;pointer-events:none"><span style="background:#49d1ec;font-size:18px">${name}</span></aside>`).join("") : ""}
</main></body></html>`;
}
