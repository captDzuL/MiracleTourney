import type { CertificateData } from "@/lib/certificate/template-types";
export type { CertificateData } from "@/lib/certificate/template-types";
import { escapeHtml, getBackgroundTeamFontSize, getForegroundTeamFontSize, splitTeamName } from "@/lib/certificate/template-text";
import { buildParticles, buildTheme, inferTheme, withAlpha } from "@/lib/certificate/template-theme";

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
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;700;800&display=swap" rel="stylesheet"/>
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
.mvp-portrait-img {
  position: absolute;
  right: 10px;
  bottom: 0;
  width: 680px;
  height: 820px;
  object-fit: contain;
  object-position: bottom;
  filter: drop-shadow(0 36px 60px rgba(2, 6, 23, 0.5));
}
.mvp-badge {
  position: absolute;
  right: 96px;
  top: 96px;
  z-index: 7;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
}
.mvp-badge .mvp-tag {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 10px 18px 9px;
  background: #0f172a;
  border: 1px solid ${withAlpha(data.accentColor, 0.5)};
  color: ${theme.accentSoft};
  text-transform: uppercase;
  font-size: 15px;
  font-weight: 800;
  letter-spacing: 5px;
}
.mvp-badge .mvp-name {
  font-family: "Bebas Neue", sans-serif;
  font-size: 56px;
  line-height: 0.9;
  color: #f8fafc;
  text-shadow: 0 0 20px ${withAlpha(data.accentColor, 0.35)};
  text-align: right;
}
.mvp-badge .mvp-role {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 3px;
  text-transform: uppercase;
  color: rgba(248, 250, 252, 0.72);
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
  <div class="poster-shell" data-certificate-canvas="1080x1920">
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
      ${data.mvpArtUrl ? `<img class="mvp-portrait-img" src="${escapeHtml(data.mvpArtUrl)}" alt="${escapeHtml(data.mvpName ?? "Match MVP")}"/>` : theme.heroSvg}
      ${
        data.mvpArtUrl && data.mvpName
          ? `<div class="mvp-badge">
              <span class="mvp-tag">Match Ace</span>
              <span class="mvp-name">${escapeHtml(data.mvpName)}</span>
              ${data.mvpRoleLabel ? `<span class="mvp-role">${escapeHtml(data.mvpRoleLabel)}</span>` : ""}
            </div>`
          : ""
      }
    </div>

    ${data.mvpArtUrl ? "" : `<div class="center-emblem">${theme.emblemSvg}</div>`}

    <div class="theme-copy">
      <span class="heading">${escapeHtml(theme.leftMotto)}</span>
      <span class="divider"></span>
      <span class="accent">Miracle Edge</span>
    </div>

    ${
      data.mvpArtUrl
        ? ""
        : `<div class="theme-copy right">
      <span class="heading">${escapeHtml(theme.rightMotto)}</span>
      <span class="divider"></span>
      <span class="accent">${escapeHtml(theme.slogan)}</span>
    </div>`
    }

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
