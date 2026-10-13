import React from "react";

/*
 * Background art for the two role cards on the sign-up page.
 *
 * Both draw from the Miracle mark: flat slabs with diagonal cuts, cyan on one side and violet on the
 * other, a cream accent, and the pitch lines used on the Flashpeak background. The numbers are the
 * point of each card: a captain leads five players, a player starts as one.
 * Purely decorative, so everything is hidden from assistive technology.
 */

const CREAM = "#F6DFB1";

const svgProps = {
  "aria-hidden": true,
  focusable: false,
  viewBox: "0 14 360 340",
  preserveAspectRatio: "xMaxYMin slice",
  className: "absolute inset-0 h-full w-full",
} as const;

/** The "5": a stem and a bowl, built from cut corners instead of curves. */
const FIVE = "205,40 325,40 325,70 237,70 234,110 270,102 312,116 338,150 338,200 312,234 270,248 205,248 205,216 262,216 296,198 304,172 294,152 262,146 205,150";

/** The "1": a flag that falls away to the left, and a straight stem. */
const ONE = "206,92 258,40 296,40 296,248 256,248 256,92 206,128";

/** Captain: a faceted 5, cut by a cream armband. */
export function CaptainArt() {
  return (
    <svg {...svgProps}>
      <defs>
        <linearGradient id="rc-cap-fill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#00C8EE" stopOpacity="0.34" />
          <stop offset="1" stopColor="#008BEA" stopOpacity="0.08" />
        </linearGradient>
        <linearGradient id="rc-cap-edge" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5BE3FF" />
          <stop offset="1" stopColor="#008BEA" />
        </linearGradient>
        <clipPath id="rc-cap-clip"><polygon points={FIVE} /></clipPath>
      </defs>
      {/* Pitch lines */}
      <g fill="none" stroke="#5BE3FF" strokeOpacity="0.14" strokeWidth="2">
        <circle cx="262" cy="144" r="92" />
        <line x1="262" y1="0" x2="262" y2="270" />
        <circle cx="262" cy="144" r="5" fill="#5BE3FF" fillOpacity="0.2" />
      </g>
      {/* The 5 */}
      <polygon points={FIVE} fill="url(#rc-cap-fill)" stroke="url(#rc-cap-edge)" strokeWidth="2.5" strokeLinejoin="miter" />
      {/* The armband: a diagonal band that only shows where it crosses the number, plus its edges outside */}
      <g>
        <polygon points="150,270 198,270 372,96 372,48" fill={CREAM} fillOpacity="0.1" />
        <g clipPath="url(#rc-cap-clip)">
          <polygon points="150,270 198,270 372,96 372,48" fill={CREAM} fillOpacity="0.88" />
          <g stroke="#0B1424" strokeWidth="5" strokeOpacity="0.55">
            <line x1="236" y1="190" x2="250" y2="176" />
            <line x1="254" y1="172" x2="268" y2="158" />
            <line x1="272" y1="154" x2="286" y2="140" />
          </g>
        </g>
        <line x1="150" y1="270" x2="372" y2="48" stroke={CREAM} strokeOpacity="0.5" strokeWidth="1.5" />
        <line x1="198" y1="270" x2="372" y2="96" stroke={CREAM} strokeOpacity="0.5" strokeWidth="1.5" />
      </g>
      {/* Four teammates behind the captain */}
      <g fill="#5BE3FF" fillOpacity="0.55">
        <rect x="52" y="48" width="8" height="8" transform="rotate(45 56 52)" />
        <rect x="96" y="30" width="8" height="8" transform="rotate(45 100 34)" />
        <rect x="132" y="62" width="8" height="8" transform="rotate(45 136 66)" />
        <rect x="84" y="84" width="8" height="8" transform="rotate(45 88 88)" />
      </g>
      <rect x="170" y="44" width="12" height="12" transform="rotate(45 176 50)" fill={CREAM} />
    </svg>
  );
}

/** Player: a violet 1, and one cream dot on its way into a slot while the rest still wait. */
export function PlayerArt() {
  return (
    <svg {...svgProps}>
      <defs>
        <linearGradient id="rc-ply-fill" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#B83CF0" stopOpacity="0.36" />
          <stop offset="1" stopColor="#5927DF" stopOpacity="0.08" />
        </linearGradient>
        <linearGradient id="rc-ply-edge" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#D58BFF" />
          <stop offset="1" stopColor="#5927DF" />
        </linearGradient>
        <radialGradient id="rc-ply-glow">
          <stop offset="0" stopColor={CREAM} stopOpacity="0.5" />
          <stop offset="1" stopColor={CREAM} stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* Pitch lines */}
      <g fill="none" stroke="#D58BFF" strokeOpacity="0.14" strokeWidth="2">
        <circle cx="262" cy="144" r="92" />
        <line x1="262" y1="0" x2="262" y2="270" />
        <circle cx="262" cy="144" r="5" fill="#D58BFF" fillOpacity="0.2" />
      </g>
      {/* The 1 */}
      <polygon points={ONE} fill="url(#rc-ply-fill)" stroke="url(#rc-ply-edge)" strokeWidth="2.5" strokeLinejoin="miter" />
      {/* The empty slot inside the 1 */}
      <rect x="266" y="58" width="16" height="16" transform="rotate(45 274 66)" fill="none" stroke={CREAM} strokeWidth="2" />
      {/* Everyone else still waiting to be drawn */}
      <g fill="none" stroke="#D58BFF" strokeOpacity="0.5" strokeWidth="2">
        <circle cx="62" cy="96" r="7" />
        <circle cx="134" cy="52" r="7" />
        <circle cx="176" cy="150" r="7" />
        <circle cx="40" cy="128" r="7" />
      </g>
      {/* The route of the one player that is moving */}
      <path d="M92 156 C 130 124, 192 98, 262 70" fill="none" stroke={CREAM} strokeOpacity="0.85" strokeWidth="2.5" strokeDasharray="3 9" strokeLinecap="round" />
      <circle cx="92" cy="156" r="34" fill="url(#rc-ply-glow)" />
      <circle cx="92" cy="156" r="10" fill={CREAM} />
      <circle cx="92" cy="156" r="17" fill="none" stroke={CREAM} strokeOpacity="0.55" strokeWidth="1.5" />
    </svg>
  );
}
