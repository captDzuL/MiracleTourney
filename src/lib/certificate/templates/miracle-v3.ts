import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import QRCode from "qrcode";
import { MIRACLE_V3_BRANDING, MIRACLE_V3_CERTIFICATE_TYPES, MIRACLE_V3_SAFE_ZONES, type MiracleV3CertificateData, type MiracleV3CertificateType } from "./miracle-v3-contract";
import { getMiracleV3EditorialCopy } from "./miracle-v3-editorial-copy";
import { EDITORIAL_DECORATION, editorialStyles } from "./miracle-v3-editorial-styles";
import { monogramInitials, recipientNameFontSize } from "./miracle-v3-editorial-text";
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

const LOGO_WORDMARK_ON_DARK = /#F6DFB1/gi;
const LOGO_WORDMARK_ON_CREAM = "#09111e";
/** Team logo default box, used when the studio supplies no hero placement. */
const DEFAULT_TEAM_LOGO_BOX = Object.freeze({ x: 360, y: 748, width: 560, height: 540 });
/** The diamond frame is a bit larger than the smaller side of the logo box; the logo sits inside its inscribed square. */
const FRAME_DIAGONAL_RATIO = 1.1;
const LOGO_INSET_PERCENT = 11;

function embeddedAssets() {
  // The horizontal logo has a cream wordmark made for dark backgrounds; the editorial header is cream, so draw it dark.
  const logo = readFileSync(path.join(process.cwd(), "public/logo/miracle-horizontal.svg"), "utf8").replace(LOGO_WORDMARK_ON_DARK, LOGO_WORDMARK_ON_CREAM);
  // Resolve through the installed package link at runtime so Next.js does not
  // try to parse the binary font as a JavaScript module during server bundling.
  const font = readFileSync(path.join(process.cwd(), "node_modules", "@fontsource", "montserrat", "files", "montserrat-latin-800-normal.woff2"));
  return { logo: `data:image/svg+xml;base64,${Buffer.from(logo, "utf8").toString("base64")}`, font: font.toString("base64") };
}

type Box = { x: number; y: number; width: number; height: number };
type Zone = typeof MIRACLE_V3_SAFE_ZONES[keyof typeof MIRACLE_V3_SAFE_ZONES];

/** Absolute box inside a zone, in zone-relative pixels. */
const boxStyle = (box: Box, zone: Zone, extra = "") =>
  ` style="position:absolute;left:${box.x - zone.x}px;top:${box.y - zone.y}px;width:${box.width}px;height:${box.height}px;object-fit:contain${extra}"`;

/** Diamond frame centred on the team logo box; its inscribed square is where the logo is drawn. */
function diamondFrame(box: Box, zone: Zone): string {
  const side = Math.round(Math.min(box.width, box.height) * FRAME_DIAGONAL_RATIO / Math.SQRT2);
  const left = Math.round(box.x - zone.x + box.width / 2 - side / 2);
  const top = Math.round(box.y - zone.y + box.height / 2 - side / 2);
  return `<div data-role="hero-frame" aria-hidden="true" style="left:${left}px;top:${top}px;width:${side}px;height:${side}px;transform:rotate(45deg)"></div>`;
}

/** Team emblem drawn from the team initials, used when there is no usable team logo. */
const initialsEmblem = (initials: string, label: string, style: string) =>
  `<svg data-role="hero-fallback" aria-label="${escape(label)}" viewBox="0 0 600 600" xmlns="http://www.w3.org/2000/svg"${style}><g font-family="Montserrat,sans-serif" font-weight="800" font-size="280" text-anchor="middle" letter-spacing="-8"><text x="326" y="420" fill="#aa8bff" fill-opacity=".28">${escape(initials)}</text><text x="300" y="398" fill="#49d1ec">${escape(initials)}</text></g></svg>`;

export async function buildMiracleV3CertificateHtml(data: MiracleV3CertificateData, options: { editorPreview?: boolean } = {}): Promise<string> {
  const m = getMiracleV3CertificateManifest(data);
  const fingerprint = getMiracleV3CertificateFingerprint(data);
  const assets = embeddedAssets();
  const copy = getMiracleV3EditorialCopy(m.certificateType);
  const isTeam = teamType(m.certificateType);
  const verificationUrl = `${m.verificationBaseUrl}/certificates/verify/${encodeURIComponent(m.verificationCode)}`;
  const qr = await QRCode.toDataURL(verificationUrl, { width: 200, margin: 4, errorCorrectionLevel: "M" });
  const zoneStyle = (zone: Zone) => `position:absolute;left:${zone.x}px;top:${zone.y}px;width:${zone.width}px;height:${zone.height}px;overflow:hidden`;
  const zone = (name: keyof typeof MIRACLE_V3_SAFE_ZONES, body: string) => `<section data-zone="${name}" style="${zoneStyle(MIRACLE_V3_SAFE_ZONES[name])}">${body}</section>`;
  const heroZone = MIRACLE_V3_SAFE_ZONES.hero;
  const heroKind = isTeam ? "team_logo_hero" : "character_art";
  const heroPlacement = m.assetPlacements.find((candidate) => candidate.assetKind === heroKind);
  const teamLogoBox: Box = heroPlacement ?? DEFAULT_TEAM_LOGO_BOX;
  // Team logos are inset so the whole logo stays inside the diamond frame; character art keeps its box as is.
  const heroStyle = isTeam ? boxStyle(teamLogoBox, heroZone, `;padding:${LOGO_INSET_PERCENT}%`) : heroPlacement ? boxStyle(heroPlacement, heroZone) : "";
  const hexEmblem = `<svg data-role="hero-fallback" aria-label="Miracle award emblem" viewBox="0 0 600 600" xmlns="http://www.w3.org/2000/svg"><path d="M300 30 560 180 560 420 300 570 40 420 40 180Z" fill="#151a24" stroke="#aa8bff" stroke-width="3"/><path d="M150 420V180L300 310 450 180V420" fill="none" stroke="#49d1ec" stroke-width="48"/><circle cx="300" cy="300" r="270" fill="none" stroke="#f6dfb1" stroke-dasharray="${12 + parseInt(fingerprint.slice(0, 2), 16) % 24} 28"/></svg>`;
  const teamInitials = monogramInitials(m.teamName);
  const fallback = isTeam ? initialsEmblem(teamInitials, `${m.teamName} emblem`, heroStyle) : hexEmblem;
  const hero = isTeam ? m.teamLogoUrl : m.characterArtUrl;
  const heroImage = hero ? `<img data-role="${isTeam ? "team-logo" : "character-art"}" src="${escape(hero)}" alt="${escape(isTeam ? m.teamName : m.recipientName)}"${heroStyle}/>` : fallback;
  const badgePlacement = m.assetPlacements.find((candidate) => candidate.assetKind === "team_logo_badge");
  const badgeStyle = badgePlacement ? boxStyle(badgePlacement, MIRACLE_V3_SAFE_ZONES.secondaryBadge) : "";
  const badge = m.teamLogoUrl
    ? `<img src="${escape(m.teamLogoUrl)}" alt="${escape(m.teamName)} team logo"${badgeStyle}/>`
    : `<span class="initials-tile" aria-hidden="true">${escape(teamInitials)}</span>`;
  const nameSize = recipientNameFontSize(m.recipientName);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escape(labels[m.certificateType])} · ${escape(m.recipientName)}</title>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; font-src data:; base-uri 'none'; form-action 'none'">
<style>
${editorialStyles(assets.font)}
</style></head><body><main data-certificate-canvas="1080x1920" data-template-version="miracle-v3" data-certificate-type="${m.certificateType}" data-fingerprint="${fingerprint}" style="width:1080px;height:1920px">
${EDITORIAL_DECORATION}
${zone("identity", `<div class="brand"><img src="${assets.logo}" alt="Miracle"/></div><div class="lockup"><div class="monogram" aria-hidden="true">${escape(monogramInitials(m.eventName))}</div><p class="event clamp">${escape(m.eventName)}</p><p class="game clamp">${escape(m.gameName)}</p></div>`)}
${zone("award", `<p class="eyebrow clamp">${escape(copy.eyebrow)}</p><h1 class="mega" aria-label="${escape(labels[m.certificateType])}">${escape(copy.megaLines[0])}<span>${escape(copy.megaLines[1])}</span></h1><p class="motto clamp">${escape(copy.motto)}</p>`)}
${zone("hero", (isTeam ? diamondFrame(teamLogoBox, heroZone) : "") + heroImage + (hero ? `<template data-hero-fallback>${fallback}</template>` : ""))}
${zone("secondaryBadge", isTeam ? "" : `${badge}<div class="team-line"><small>Team</small><p class="team clamp">${escape(m.teamName)}</p></div>`)}
${zone("recipient", `<div><p class="label">${escape(copy.recipientLabel)}</p><h2 class="recipient clamp" style="font-size:${nameSize}px">${escape(m.recipientName)}</h2></div><div class="rank"><b>${escape(copy.rank)}</b><span>${escape(copy.rankLabel)}</span></div>`)}
${zone("issueDate", `<p class="foot-label">Issued by Miracle</p><p class="meta issued clamp">${escape(m.issueDate)}</p>`)}
${zone("certificateId", `<p class="foot-label">Certificate ID · Version ${m.version}</p><p class="meta clamp">${escape(m.certificateId)}</p>`)}
${zone("qrVerification", `<a href="${escape(verificationUrl)}"><img data-role="verification-qr" src="${qr}" alt="Verify certificate"/>Verify authenticity</a>`)}
${options.editorPreview === true ? Object.entries(MIRACLE_V3_SAFE_ZONES).map(([name, rectangle]) => `<aside data-editor-guide="${name}" style="${zoneStyle(rectangle)};z-index:10;border:2px dashed #49d1ec;color:#11151d;background:#49d1ec18;pointer-events:none"><span style="background:#49d1ec;font-size:18px">${name}</span></aside>`).join("") : ""}
</main></body></html>`;
}
