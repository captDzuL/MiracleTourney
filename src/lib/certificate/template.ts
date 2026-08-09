export interface CertificateData {
  eventName: string;
  gameName: string;
  teamName: string;
  accentColor: string;
  characterArtUrl: string | null;
  certId: string;
  date: string;
  eventSlug: string;
  baseUrl: string;
}

type CertificateTheme = {
  id: "flashpeak" | "kuroko";
  eyebrow: string;
  slogan: string;
  mantra: string;
  leftMotto: string;
  rightMotto: string;
  footerLabel: string;
  motifClass: string;
  emblemSvg: string;
  heroSvg: string;
  glow: string;
  accentSoft: string;
  accentStrong: string;
};

function xorshift32(seed: number) {
  let x = seed || 1;
  return () => {
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

function seedFromString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(31, h) + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h) || 1;
}

function hexToRgb(hex: string) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
    : { r: 37, g: 99, b: 235 };
}

function withAlpha(hex: string, alpha: number) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function darken(hex: string, factor = 0.24): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgb(${Math.round(r * factor)}, ${Math.round(g * factor)}, ${Math.round(b * factor)})`;
}

function brighten(hex: string, factor = 0.32): string {
  const { r, g, b } = hexToRgb(hex);
  const mix = (value: number) => Math.round(value + (255 - value) * factor);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

function inferTheme(data: CertificateData): CertificateTheme["id"] {
  const source = `${data.gameName} ${data.eventSlug}`.toLowerCase();
  return source.includes("kuroko") ? "kuroko" : "flashpeak";
}

function splitTeamName(teamName: string): string[] {
  const clean = teamName.trim().replace(/\s+/g, " ");
  if (!clean) return ["CHAMPION"];

  const words = clean.split(" ");
  if (words.length === 1) return words;
  if (words.length === 2) return words;

  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= 14 || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function getForegroundTeamFontSize(teamName: string, lineCount: number) {
  if (lineCount >= 5) return 82;
  if (lineCount === 4) return 98;
  if (teamName.length >= 26) return 120;
  if (teamName.length >= 20) return 134;
  return 152;
}

function getBackgroundTeamFontSize(teamName: string) {
  if (teamName.length >= 26) return 220;
  if (teamName.length >= 18) return 255;
  return 290;
}

function buildParticles(eventSlug: string, accentColor: string): string {
  const rng = xorshift32(seedFromString(eventSlug));
  const accentRgb = hexToRgb(accentColor);
  const palette = [
    `rgba(255,255,255,0.08)`,
    `rgba(255,255,255,0.18)`,
    `rgba(${accentRgb.r},${accentRgb.g},${accentRgb.b},0.28)`,
    `rgba(${accentRgb.r},${accentRgb.g},${accentRgb.b},0.16)`,
  ];
  const out: string[] = [];
  for (let i = 0; i < 44; i++) {
    const x = rng() * 1080;
    const y = rng() * 1920;
    const w = 2 + rng() * 4.5;
    const h = 14 + rng() * 42;
    const rot = rng() * 360;
    const op = 0.2 + rng() * 0.5;
    const col = palette[Math.floor(rng() * palette.length)];
    out.push(
      `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="${(w / 2).toFixed(1)}" fill="${col}" opacity="${op.toFixed(2)}" transform="rotate(${rot.toFixed(1)},${x.toFixed(1)},${y.toFixed(1)})"/>`,
    );
  }
  return out.join("");
}

function buildTheme(themeId: CertificateTheme["id"], accentColor: string): CertificateTheme {
  const accentSoft = brighten(accentColor, 0.46);
  const accentStrong = darken(accentColor, 0.22);
  const commonGlow = `0 0 26px ${withAlpha(accentColor, 0.34)}, 0 0 78px ${withAlpha(accentColor, 0.18)}`;

  if (themeId === "kuroko") {
    return {
      id: "kuroko",
      eyebrow: "Built by Miracle",
      slogan: "Court of Miracles",
      mantra: "Precision. Rhythm. Legacy.",
      leftMotto: "Read the Play",
      rightMotto: "Rule the Court",
      footerLabel: "Miracle Championship Series",
      motifClass: "kuroko-emblem",
      glow: commonGlow,
      accentSoft,
      accentStrong,
      emblemSvg: `
        <svg class="theme-emblem kuroko-emblem" viewBox="0 0 320 320" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <circle cx="160" cy="160" r="118" fill="none" stroke="${withAlpha(accentColor, 0.30)}" stroke-width="2"/>
          <circle cx="160" cy="160" r="96" fill="none" stroke="${withAlpha(accentColor, 0.46)}" stroke-width="4"/>
          <circle cx="160" cy="160" r="72" fill="none" stroke="${withAlpha(accentColor, 0.22)}" stroke-width="16"/>
          <path d="M88 160h144M160 88v144" stroke="${withAlpha(accentColor, 0.64)}" stroke-width="6" stroke-linecap="round"/>
          <circle cx="160" cy="160" r="18" fill="${withAlpha(accentColor, 0.72)}"/>
        </svg>`,
      heroSvg: `
        <svg class="hero-illustration" viewBox="0 0 680 820" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <defs>
            <linearGradient id="kurokoJersey" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="${accentSoft}"/>
              <stop offset="100%" stop-color="${accentStrong}"/>
            </linearGradient>
            <radialGradient id="kurokoGlow" cx="50%" cy="28%" r="70%">
              <stop offset="0%" stop-color="${withAlpha(accentColor, 0.64)}"/>
              <stop offset="100%" stop-color="${withAlpha(accentColor, 0)}"/>
            </radialGradient>
          </defs>
          <rect width="680" height="820" fill="url(#kurokoGlow)"/>
          <path d="M170 720c22-148 86-250 190-304 52-26 84-72 96-136 40 10 78 44 100 90 32 64 46 140 54 258l-440 92Z" fill="${withAlpha("#020617", 0.78)}"/>
          <path d="M254 742c24-150 84-238 176-290 30-18 56-42 76-74 58 52 98 146 118 278l-370 86Z" fill="url(#kurokoJersey)"/>
          <circle cx="402" cy="220" r="94" fill="${withAlpha("#e2e8f0", 0.96)}"/>
          <path d="M332 220c8-66 58-118 128-128-10 80 14 126 60 162-92 32-188 18-188-34Z" fill="${withAlpha("#0f172a", 0.98)}"/>
          <path d="M374 238c24-18 56-28 92-28 20 0 36 3 50 8-14 26-40 48-74 62-34 14-62 14-88 0 2-18 10-30 20-42Z" fill="${withAlpha("#0f172a", 0.88)}"/>
          <path d="M422 170c18 20 46 34 82 42-8-42-26-82-50-108-36 4-74 26-98 56 24-2 46 2 66 10Z" fill="${withAlpha("#f8fafc", 0.72)}"/>
          <path d="M228 430c-58 50-92 98-122 178l84 42c20-64 56-110 108-154l-70-66Z" fill="${withAlpha("#0f172a", 0.96)}"/>
          <path d="M430 462c72 14 126 66 176 156l-70 48c-52-70-92-112-154-134l48-70Z" fill="${withAlpha("#1e293b", 0.94)}"/>
          <circle cx="588" cy="206" r="58" fill="none" stroke="${withAlpha(accentColor, 0.48)}" stroke-width="10"/>
          <path d="M588 148v116M530 206h116" stroke="${withAlpha(accentColor, 0.42)}" stroke-width="6" stroke-linecap="round"/>
          <circle cx="588" cy="206" r="16" fill="${withAlpha(accentColor, 0.68)}"/>
        </svg>`,
    };
  }

  return {
    id: "flashpeak",
    eyebrow: "Built by Miracle",
    slogan: "Peak Performance",
    mantra: "Velocity. Pressure. Legacy.",
    leftMotto: "Built to Clutch",
    rightMotto: "Born to Peak",
    footerLabel: "Miracle Championship Series",
    motifClass: "flash-emblem",
    glow: commonGlow,
    accentSoft,
    accentStrong,
    emblemSvg: `
      <svg class="theme-emblem flash-emblem" viewBox="0 0 320 320" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M160 38L88 158h58l-22 124 108-150h-66l30-94Z" fill="${withAlpha(accentColor, 0.74)}"/>
        <path d="M160 18L78 166h50l-20 136 134-180h-72l24-104Z" fill="none" stroke="${withAlpha(accentColor, 0.34)}" stroke-width="8" stroke-linejoin="round"/>
      </svg>`,
    heroSvg: `
      <svg class="hero-illustration" viewBox="0 0 680 820" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs>
          <linearGradient id="flashJacket" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="${accentSoft}"/>
            <stop offset="100%" stop-color="${accentStrong}"/>
          </linearGradient>
          <radialGradient id="flashGlow" cx="50%" cy="20%" r="72%">
            <stop offset="0%" stop-color="${withAlpha(accentColor, 0.62)}"/>
            <stop offset="100%" stop-color="${withAlpha(accentColor, 0)}"/>
          </radialGradient>
        </defs>
        <rect width="680" height="820" fill="url(#flashGlow)"/>
        <path d="M170 726c16-136 58-226 132-302 54-56 80-114 84-186 70 22 130 76 174 156 42 78 66 190 74 332H170Z" fill="${withAlpha("#020617", 0.78)}"/>
        <path d="M214 756c20-138 62-228 138-294 42-36 70-82 84-138 72 38 130 122 170 250l-392 182Z" fill="url(#flashJacket)"/>
        <path d="M366 156c-52 26-90 72-108 124 22 52 68 86 124 100 56-16 98-54 118-108-20-46-66-94-134-116Z" fill="${withAlpha("#f8fafc", 0.86)}"/>
        <path d="M282 286c26-76 82-132 152-150 34 18 62 54 82 96-26 42-76 76-134 90-44-8-78-18-100-36Z" fill="${withAlpha("#0f172a", 0.98)}"/>
        <path d="M346 210l-34 94h56l-18 90 86-126h-50l26-58Z" fill="${withAlpha(accentColor, 0.84)}"/>
        <path d="M168 444c-60 66-100 136-132 234l92 26c16-84 50-146 96-210l-56-50Z" fill="${withAlpha("#111827", 0.98)}"/>
        <path d="M482 462c64 34 110 90 154 192l-88 30c-30-88-68-138-126-186l60-36Z" fill="${withAlpha("#111827", 0.96)}"/>
        <path d="M560 120l-34 62h32l-18 68 68-94h-40l18-36Z" fill="${withAlpha(accentColor, 0.76)}"/>
      </svg>`,
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function buildCertificateHtml(data: CertificateData): Promise<string> {
  const themeId = inferTheme(data);
  const theme = buildTheme(themeId, data.accentColor);
  const teamLines = splitTeamName(data.teamName);
  const fgFontSize = getForegroundTeamFontSize(data.teamName, teamLines.length);
  const bgFontSize = getBackgroundTeamFontSize(data.teamName);
  const teamLinesHtml = teamLines.map((line) => `<span>${escapeHtml(line)}</span>`).join("");
  const bgTeamName = escapeHtml(data.teamName.toUpperCase());
  const particles = buildParticles(data.eventSlug, data.accentColor);
  const grain = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='220' height='220' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;700;800;900&family=Roboto+Condensed:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet"/>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: 1080px; height: 1920px; overflow: hidden; }
body {
  width: 1080px;
  height: 1920px;
  position: relative;
  overflow: hidden;
  color: #f8fafc;
  background:
    radial-gradient(circle at 20% 0%, ${withAlpha(data.accentColor, 0.20)} 0%, rgba(3, 7, 18, 0) 34%),
    radial-gradient(circle at 80% 20%, ${withAlpha(theme.accentSoft, 0.18)} 0%, rgba(2, 6, 23, 0) 24%),
    linear-gradient(180deg, #f7f2e5 0%, #efe7d4 34%, #0f172a 34.2%, #020617 100%);
  font-family: "Inter", sans-serif;
}
body::before {
  content: "";
  position: absolute;
  inset: 0;
  background: ${grain};
  opacity: 0.08;
  mix-blend-mode: multiply;
}
.poster-shell {
  position: relative;
  width: 1080px;
  height: 1920px;
  overflow: hidden;
}
.poster-shell::before {
  content: "";
  position: absolute;
  inset: 24px;
  border: 1px solid ${withAlpha(data.accentColor, 0.34)};
  pointer-events: none;
}
.poster-shell::after {
  content: "";
  position: absolute;
  inset: 48px;
  border: 1px solid ${withAlpha(data.accentColor, 0.14)};
  pointer-events: none;
}
.top-band {
  position: absolute;
  top: 0;
  left: 0;
  width: 1080px;
  height: 1018px;
  background:
    linear-gradient(135deg, ${withAlpha(theme.accentSoft, 0.44)} 0%, ${withAlpha(data.accentColor, 0.14)} 28%, rgba(255,255,255,0) 28.5%),
    radial-gradient(circle at 50% 10%, ${withAlpha(data.accentColor, 0.16)} 0%, rgba(255,255,255,0) 56%);
}
.top-band::after {
  content: "";
  position: absolute;
  left: -120px;
  bottom: -120px;
  width: 1320px;
  height: 280px;
  background: linear-gradient(98deg, rgba(1, 5, 15, 0) 10%, rgba(1, 5, 15, 0.96) 46%, rgba(1, 5, 15, 1) 100%);
  transform: rotate(-10deg);
}
.miracle-wordmark {
  position: absolute;
  top: 88px;
  left: 72px;
  z-index: 5;
  color: ${theme.accentStrong};
  text-transform: uppercase;
}
.miracle-wordmark .eyebrow {
  display: block;
  font-size: 18px;
  letter-spacing: 7px;
  font-weight: 700;
  color: ${withAlpha("#0f172a", 0.72)};
}
.miracle-wordmark .brand {
  display: block;
  margin-top: 8px;
  font-family: "Bebas Neue", sans-serif;
  font-size: 88px;
  line-height: 0.92;
  letter-spacing: 3px;
}
.miracle-wordmark .subbrand {
  display: block;
  margin-top: 6px;
  font-size: 21px;
  letter-spacing: 5px;
  font-weight: 800;
}
.corner-copy {
  position: absolute;
  top: 96px;
  right: 74px;
  z-index: 5;
  text-align: right;
  color: ${withAlpha("#0f172a", 0.68)};
  text-transform: uppercase;
  font-weight: 700;
  letter-spacing: 4px;
  font-size: 15px;
  line-height: 1.5;
}
.bg-team-name {
  position: absolute;
  top: 250px;
  left: 32px;
  width: 1180px;
  z-index: 1;
  font-family: "Bebas Neue", sans-serif;
  font-size: ${bgFontSize}px;
  line-height: 0.8;
  letter-spacing: 4px;
  text-transform: uppercase;
  color: ${withAlpha(data.accentColor, 0.13)};
  transform: rotate(-6deg);
  text-shadow: 0 0 26px ${withAlpha(data.accentColor, 0.08)};
}
.champions-lockup {
  position: absolute;
  top: 332px;
  left: 74px;
  width: 610px;
  z-index: 6;
}
.champions-label {
  display: inline-flex;
  padding: 12px 18px 10px;
  border: 1px solid ${withAlpha(data.accentColor, 0.32)};
  background: rgba(255,255,255,0.56);
  color: ${theme.accentStrong};
  text-transform: uppercase;
  font-size: 16px;
  font-weight: 800;
  letter-spacing: 6px;
}
.champions-title {
  margin-top: 28px;
  font-family: "Bebas Neue", sans-serif;
  font-size: 238px;
  line-height: 0.85;
  letter-spacing: 4px;
  color: #0f172a;
  text-shadow: ${theme.glow};
}
.team-lockup {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-family: "Bebas Neue", sans-serif;
  font-size: ${fgFontSize}px;
  line-height: 0.9;
  letter-spacing: 3px;
  color: #f8fafc;
  text-shadow: 0 0 28px ${withAlpha(data.accentColor, 0.30)};
}
.tagline-ribbon {
  margin-top: 28px;
  display: inline-flex;
  align-items: center;
  gap: 14px;
  padding: 12px 20px;
  border-radius: 999px;
  background: rgba(2, 6, 23, 0.88);
  border: 1px solid ${withAlpha(data.accentColor, 0.30)};
  color: #f8fafc;
  font-size: 17px;
  letter-spacing: 4px;
  text-transform: uppercase;
}
.tagline-ribbon::before,
.tagline-ribbon::after {
  content: "";
  width: 36px;
  height: 2px;
  background: linear-gradient(90deg, rgba(255,255,255,0), ${withAlpha(data.accentColor, 0.66)}, rgba(255,255,255,0));
}
.hero-zone {
  position: absolute;
  right: 0;
  bottom: 382px;
  width: 760px;
  height: 930px;
  z-index: 4;
}
.hero-halo {
  position: absolute;
  right: 86px;
  top: 140px;
  width: 420px;
  height: 420px;
  border-radius: 50%;
  background: radial-gradient(circle, ${withAlpha(data.accentColor, 0.36)} 0%, ${withAlpha(data.accentColor, 0.08)} 44%, rgba(255,255,255,0) 72%);
  filter: blur(4px);
}
.hero-grid {
  position: absolute;
  inset: 140px 66px 48px 120px;
  border: 1px solid ${withAlpha(data.accentColor, 0.18)};
  background:
    linear-gradient(transparent 94%, ${withAlpha(data.accentColor, 0.08)} 94%),
    linear-gradient(90deg, transparent 94%, ${withAlpha(data.accentColor, 0.08)} 94%);
  background-size: 100% 48px, 48px 100%;
  transform: skewY(-6deg);
}
.hero-illustration {
  position: absolute;
  right: 10px;
  bottom: 0;
  width: 680px;
  height: 820px;
  filter: drop-shadow(0 36px 60px rgba(2, 6, 23, 0.5));
}
.center-emblem {
  position: absolute;
  left: 50%;
  top: 1024px;
  z-index: 5;
  transform: translateX(-50%);
  width: 320px;
  height: 320px;
}
.theme-emblem {
  width: 100%;
  height: 100%;
}
.theme-copy {
  position: absolute;
  top: 1168px;
  left: 74px;
  z-index: 6;
  width: 320px;
  text-transform: uppercase;
}
.theme-copy.right {
  left: auto;
  right: 74px;
  text-align: right;
}
.theme-copy .heading {
  display: block;
  font-family: "Bebas Neue", sans-serif;
  font-size: 58px;
  line-height: 0.95;
  font-weight: 800;
  letter-spacing: 2px;
  color: #e2e8f0;
  text-shadow: 0 0 18px ${withAlpha(data.accentColor, 0.18)};
}
.theme-copy .divider {
  display: block;
  width: 210px;
  height: 1px;
  margin-top: 18px;
  background: linear-gradient(90deg, ${withAlpha(data.accentColor, 0.72)}, rgba(255,255,255,0));
}
.theme-copy.right .divider {
  margin-left: auto;
  background: linear-gradient(90deg, rgba(255,255,255,0), ${withAlpha(data.accentColor, 0.72)});
}
.theme-copy .accent {
  display: inline-block;
  margin-top: 12px;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 7px;
  color: ${withAlpha("#e2e8f0", 0.60)};
}
.bottom-card {
  position: absolute;
  left: 48px;
  right: 48px;
  bottom: 124px;
  z-index: 8;
  display: grid;
  grid-template-columns: 1.2fr 1fr 1.15fr;
  gap: 22px;
  padding: 34px 34px 28px;
  background: linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(244,240,232,0.94) 100%);
  border: 2px solid ${withAlpha(data.accentColor, 0.30)};
  box-shadow: 0 22px 60px rgba(2, 6, 23, 0.28);
}
.bottom-card::before {
  content: "";
  position: absolute;
  inset: 10px;
  border: 1px solid ${withAlpha(data.accentColor, 0.18)};
}
.meta-block {
  position: relative;
  z-index: 1;
}
.meta-label {
  display: block;
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 4px;
  text-transform: uppercase;
  color: ${withAlpha("#0f172a", 0.56)};
}
.meta-value {
  display: block;
  margin-top: 10px;
  font-family: "Bebas Neue", sans-serif;
  font-size: 42px;
  line-height: 0.95;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: #0f172a;
}
.meta-subvalue {
  display: block;
  margin-top: 10px;
  font-size: 16px;
  letter-spacing: 3px;
  text-transform: uppercase;
  color: ${withAlpha("#0f172a", 0.64)};
}
.rank-badge {
  position: relative;
  z-index: 1;
  align-self: center;
  justify-self: center;
  width: 220px;
  height: 220px;
  border-radius: 50%;
  border: 2px solid ${withAlpha(data.accentColor, 0.28)};
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  background: radial-gradient(circle, ${withAlpha(data.accentColor, 0.14)} 0%, rgba(255,255,255,0.24) 72%);
}
.rank-badge .rank {
  font-family: "Bebas Neue", sans-serif;
  font-size: 104px;
  line-height: 0.9;
  color: ${theme.accentStrong};
}
.rank-badge .caption {
  margin-top: 8px;
  font-size: 14px;
  font-weight: 800;
  letter-spacing: 4px;
  text-transform: uppercase;
  color: ${withAlpha("#0f172a", 0.68)};
}
.footer-strip {
  position: absolute;
  left: 52px;
  right: 52px;
  bottom: 28px;
  z-index: 9;
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: #dbe4f0;
}
.footer-strip .cert {
  font-size: 14px;
  font-weight: 800;
  letter-spacing: 4px;
  text-transform: uppercase;
}
.footer-strip .cert strong {
  display: block;
  margin-top: 8px;
  font-size: 28px;
  font-family: "Bebas Neue", sans-serif;
  letter-spacing: 3px;
}
.footer-strip .mantra {
  text-align: center;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 4px;
  text-transform: uppercase;
}
.footer-strip .miracle-footer {
  text-align: right;
  font-size: 14px;
  font-weight: 800;
  letter-spacing: 4px;
  text-transform: uppercase;
}
.footer-strip .miracle-footer strong {
  display: block;
  margin-top: 8px;
  font-family: "Bebas Neue", sans-serif;
  font-size: 42px;
  letter-spacing: 3px;
}
.particles {
  position: absolute;
  inset: 0;
  z-index: 3;
  pointer-events: none;
}
</style>
</head>
<body data-theme="${theme.id}">
  <div class="poster-shell">
    <div class="top-band"></div>
    <svg class="particles" viewBox="0 0 1080 1920" xmlns="http://www.w3.org/2000/svg">${particles}</svg>

    <div class="miracle-wordmark">
      <span class="eyebrow">${escapeHtml(theme.eyebrow)}</span>
      <span class="brand">Miracle</span>
      <span class="subbrand">Championship Series</span>
    </div>

    <div class="corner-copy">
      <div>${escapeHtml(data.gameName)}</div>
      <div>${escapeHtml(theme.slogan)}</div>
      <div>${escapeHtml(data.date)}</div>
    </div>

    <div class="bg-team-name" data-team-name="${escapeHtml(data.teamName)}">${bgTeamName}</div>

    <div class="champions-lockup">
      <div class="champions-label">Champions</div>
      <div class="champions-title">CHAMPIONS</div>
      <div class="team-lockup">${teamLinesHtml}</div>
      <div class="tagline-ribbon">${escapeHtml(theme.mantra)}</div>
    </div>

    <div class="hero-zone">
      <div class="hero-halo"></div>
      <div class="hero-grid"></div>
      ${theme.heroSvg}
    </div>

    <div class="center-emblem">${theme.emblemSvg}</div>

    <div class="theme-copy">
      <span class="heading">${escapeHtml(theme.leftMotto)}</span>
      <span class="divider"></span>
      <span class="accent">Miracle Edge</span>
    </div>

    <div class="theme-copy right">
      <span class="heading">${escapeHtml(theme.rightMotto)}</span>
      <span class="divider"></span>
      <span class="accent">${escapeHtml(theme.slogan)}</span>
    </div>

    <div class="bottom-card">
      <div class="meta-block">
        <span class="meta-label">Tournament</span>
        <span class="meta-value">${escapeHtml(data.eventName)}</span>
        <span class="meta-subvalue">${escapeHtml(data.gameName)}</span>
      </div>

      <div class="rank-badge">
        <span class="rank">#1</span>
        <span class="caption">Grand Champion</span>
      </div>

      <div class="meta-block" style="text-align: right;">
        <span class="meta-label">Date</span>
        <span class="meta-value">${escapeHtml(data.date)}</span>
        <span class="meta-subvalue">${escapeHtml(theme.footerLabel)}</span>
      </div>
    </div>

    <div class="footer-strip">
      <div class="cert">
        Certificate ID
        <strong>${escapeHtml(data.certId)}</strong>
      </div>
      <div class="mantra">${escapeHtml(theme.mantra)}</div>
      <div class="miracle-footer">
        ${escapeHtml(theme.footerLabel)}
        <strong>Miracle</strong>
      </div>
    </div>
  </div>
</body>
</html>`;
}
