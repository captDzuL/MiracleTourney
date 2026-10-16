// Colours, particles and theme building for the certificate.
// Moved out of template.ts without changes (refactor Phase 4, 4d-cert).

import type { CertificateData } from "@/lib/certificate/template-types";
import { getGameCertificateThemeId } from "@/lib/platform/config";

export type CertificateTheme = {
  id: "flashpeak" | "kuroko" | "mlbb" | "hok" | "valorant" | "dota2";
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

export function xorshift32(seed: number) {
  let x = seed || 1;
  return () => {
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

export function seedFromString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(31, h) + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h) || 1;
}

export function hexToRgb(hex: string) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
    : { r: 37, g: 99, b: 235 };
}

export function withAlpha(hex: string, alpha: number) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function darken(hex: string, factor = 0.24): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgb(${Math.round(r * factor)}, ${Math.round(g * factor)}, ${Math.round(b * factor)})`;
}

export function brighten(hex: string, factor = 0.32): string {
  const { r, g, b } = hexToRgb(hex);
  const mix = (value: number) => Math.round(value + (255 - value) * factor);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

export function inferTheme(data: CertificateData): CertificateTheme["id"] {
  return getGameCertificateThemeId(data.gameId);
}

export function buildParticles(eventSlug: string, accentColor: string): string {
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

export function buildTheme(themeId: CertificateTheme["id"], accentColor: string): CertificateTheme {
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

  if (themeId === "mlbb") {
    return {
      id: "mlbb",
      eyebrow: "Built by Miracle",
      slogan: "Land of Legends",
      mantra: "Macro. Pressure. Finish.",
      leftMotto: "Own the Lane",
      rightMotto: "Close the Lord",
      footerLabel: "Miracle Multi-Game Series",
      motifClass: "mlbb-emblem",
      glow: commonGlow,
      accentSoft,
      accentStrong,
      emblemSvg: `
        <svg class="theme-emblem mlbb-emblem" viewBox="0 0 320 320" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M160 34 256 90v140l-96 56-96-56V90l96-56Z" fill="none" stroke="${withAlpha(accentColor, 0.46)}" stroke-width="8"/>
          <path d="M102 116h116M102 160h116M102 204h116" stroke="${withAlpha(accentColor, 0.28)}" stroke-width="8" stroke-linecap="round"/>
          <circle cx="160" cy="160" r="24" fill="${withAlpha(accentColor, 0.72)}"/>
        </svg>`,
      heroSvg: `
        <svg class="hero-illustration" viewBox="0 0 680 820" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <defs>
            <linearGradient id="mlbbArmor" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="${accentSoft}"/>
              <stop offset="100%" stop-color="${accentStrong}"/>
            </linearGradient>
          </defs>
          <rect width="680" height="820" fill="none"/>
          <circle cx="472" cy="250" r="150" fill="${withAlpha(accentColor, 0.18)}"/>
          <path d="M180 736c42-170 110-282 204-334 52-28 94-88 128-180 56 42 96 110 122 204 24 84 30 170 26 280l-480 30Z" fill="${withAlpha("#020617", 0.78)}"/>
          <path d="M252 742c30-146 92-236 182-294 44-28 80-78 112-154 78 68 122 186 124 342l-418 106Z" fill="url(#mlbbArmor)"/>
          <circle cx="418" cy="218" r="86" fill="${withAlpha("#f8fafc", 0.92)}"/>
          <path d="M338 220c16-52 62-104 130-128 42 24 68 58 86 104-28 36-86 70-140 84-34-10-58-28-76-60Z" fill="${withAlpha("#0f172a", 0.96)}"/>
          <path d="M514 150 610 226 550 314l-88-70Z" fill="${withAlpha(accentColor, 0.82)}"/>
        </svg>`,
    };
  }

  if (themeId === "hok") {
    return {
      id: "hok",
      eyebrow: "Built by Miracle",
      slogan: "Crown the Rift",
      mantra: "Discipline. Tempo. Triumph.",
      leftMotto: "Seize the Clash",
      rightMotto: "Guard the Throne",
      footerLabel: "Miracle Multi-Game Series",
      motifClass: "hok-emblem",
      glow: commonGlow,
      accentSoft,
      accentStrong,
      emblemSvg: `
        <svg class="theme-emblem hok-emblem" viewBox="0 0 320 320" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M76 112 110 56l50 36 50-36 34 56-24 118H100L76 112Z" fill="none" stroke="${withAlpha(accentColor, 0.44)}" stroke-width="8" stroke-linejoin="round"/>
          <path d="M122 118h76l-10 68h-56l-10-68Z" fill="${withAlpha(accentColor, 0.20)}"/>
          <circle cx="160" cy="210" r="18" fill="${withAlpha(accentColor, 0.70)}"/>
        </svg>`,
      heroSvg: `
        <svg class="hero-illustration" viewBox="0 0 680 820" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <defs>
            <linearGradient id="hokArmor" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="${accentSoft}"/>
              <stop offset="100%" stop-color="${accentStrong}"/>
            </linearGradient>
          </defs>
          <circle cx="468" cy="236" r="140" fill="${withAlpha(accentColor, 0.20)}"/>
          <path d="M172 740c18-140 68-236 156-300 52-38 92-102 122-194 70 30 130 102 168 200 36 92 48 184 52 284l-498 10Z" fill="${withAlpha("#111827", 0.82)}"/>
          <path d="M242 756c24-138 80-228 166-290 42-30 78-80 110-150 76 54 132 172 152 318l-428 122Z" fill="url(#hokArmor)"/>
          <circle cx="410" cy="210" r="84" fill="${withAlpha("#fef3c7", 0.90)}"/>
          <path d="M334 220c24-58 74-108 140-130 34 20 58 56 80 102-30 40-80 72-132 86-42-6-74-26-88-58Z" fill="${withAlpha("#431407", 0.92)}"/>
          <path d="M522 128 600 190 560 318 488 264Z" fill="${withAlpha("#f8fafc", 0.18)}" stroke="${withAlpha(accentColor, 0.50)}" stroke-width="8"/>
        </svg>`,
    };
  }

  if (themeId === "valorant") {
    return {
      id: "valorant",
      eyebrow: "Built by Miracle",
      slogan: "Tactical Supremacy",
      mantra: "Info. Aim. Conversion.",
      leftMotto: "Hold the Site",
      rightMotto: "Own the Clutch",
      footerLabel: "Miracle Multi-Game Series",
      motifClass: "valorant-emblem",
      glow: commonGlow,
      accentSoft,
      accentStrong,
      emblemSvg: `
        <svg class="theme-emblem valorant-emblem" viewBox="0 0 320 320" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M70 82 156 244l42-64 52 64 20-18L186 82l-30 44-26-44Z" fill="${withAlpha(accentColor, 0.76)}"/>
          <path d="M78 248h166" stroke="${withAlpha(accentColor, 0.32)}" stroke-width="10" stroke-linecap="round"/>
        </svg>`,
      heroSvg: `
        <svg class="hero-illustration" viewBox="0 0 680 820" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <defs>
            <linearGradient id="valorantJacket" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="${accentSoft}"/>
              <stop offset="100%" stop-color="${accentStrong}"/>
            </linearGradient>
          </defs>
          <rect width="680" height="820" fill="none"/>
          <path d="M180 734c12-150 48-240 120-314 62-64 102-144 128-250 84 28 146 84 188 176 36 80 52 178 48 344l-484 44Z" fill="${withAlpha("#030712", 0.82)}"/>
          <path d="M242 752c10-138 54-224 130-292 54-48 88-112 112-194 76 26 144 122 188 272l-430 214Z" fill="url(#valorantJacket)"/>
          <circle cx="396" cy="208" r="84" fill="${withAlpha("#f8fafc", 0.92)}"/>
          <path d="M332 208c26-58 66-96 130-126 36 12 74 56 98 110-34 34-88 66-138 80-42-2-76-24-90-64Z" fill="${withAlpha("#111827", 0.96)}"/>
          <path d="M168 480 308 430 286 522 170 580Z" fill="${withAlpha(accentColor, 0.80)}"/>
        </svg>`,
    };
  }

  if (themeId === "dota2") {
    return {
      id: "dota2",
      eyebrow: "Built by Miracle",
      slogan: "Ancient Ascension",
      mantra: "Vision. Farming. Siege.",
      leftMotto: "Break the Ancient",
      rightMotto: "Scale to Win",
      footerLabel: "Miracle Multi-Game Series",
      motifClass: "dota2-emblem",
      glow: commonGlow,
      accentSoft,
      accentStrong,
      emblemSvg: `
        <svg class="theme-emblem dota2-emblem" viewBox="0 0 320 320" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <rect x="76" y="76" width="168" height="168" rx="18" fill="none" stroke="${withAlpha(accentColor, 0.42)}" stroke-width="10"/>
          <path d="M110 118 210 218M210 118l-44 44M110 202l44-44" stroke="${withAlpha(accentColor, 0.74)}" stroke-width="14" stroke-linecap="round"/>
        </svg>`,
      heroSvg: `
        <svg class="hero-illustration" viewBox="0 0 680 820" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <defs>
            <linearGradient id="dotaArmor" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="${accentSoft}"/>
              <stop offset="100%" stop-color="${accentStrong}"/>
            </linearGradient>
          </defs>
          <rect width="680" height="820" fill="none"/>
          <circle cx="470" cy="232" r="148" fill="${withAlpha(accentColor, 0.18)}"/>
          <path d="M174 744c24-154 82-250 176-316 56-40 98-110 126-208 78 34 136 110 176 218 32 86 42 172 40 276l-518 30Z" fill="${withAlpha("#111827", 0.84)}"/>
          <path d="M230 756c30-142 92-232 178-294 48-34 84-88 112-168 70 52 126 166 160 318l-450 144Z" fill="url(#dotaArmor)"/>
          <circle cx="412" cy="214" r="84" fill="${withAlpha("#fee2e2", 0.90)}"/>
          <path d="M336 218c22-54 70-102 138-130 34 22 62 60 82 104-26 40-80 72-136 88-40-8-70-28-84-62Z" fill="${withAlpha("#1c1917", 0.94)}"/>
          <path d="M530 126 614 224 560 320 492 246Z" fill="${withAlpha(accentColor, 0.78)}"/>
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
