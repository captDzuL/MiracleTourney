import React from "react";

/*
 * Background art for the two role cards on the sign-up page.
 *
 * Both are built from the two slabs of the Miracle mark (cyan left, violet right, cut on the diagonal),
 * so they say something about the product instead of about a number: a captain holds the whole mark
 * together, a player is one slab that the draw still has to fit into a team. Nothing here depends on
 * the team size. Purely decorative, so everything is hidden from assistive technology.
 */

const CREAM = "#F6DFB1";

/** The slabs, in the coordinates of public/logo/miracle-symbol.svg. */
const CYAN_SLAB = "130,54 223,126 195,148 165,123 165,205 130,180";
const VIOLET_SLAB = "315,54 315,180 280,205 280,123 223,167 195,148";

/** Puts the mark in the upper right of the card, large enough to be cropped a little. */
const PLACE = "translate(-38 -30) scale(1.2)";

const svgProps = {
  "aria-hidden": true,
  focusable: false,
  viewBox: "0 14 360 340",
  preserveAspectRatio: "xMaxYMin slice",
  className: "absolute inset-0 h-full w-full",
} as const;

/** Fine diagonal lines at the angle of the mark's cuts, and a halftone for the solid slabs. */
function Textures({ id, tint }: { id: string; tint: string }) {
  return (
    <defs>
      <pattern id={`${id}-hatch`} width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(38)">
        <line x1="0" y1="0" x2="0" y2="16" stroke={tint} strokeOpacity="0.1" strokeWidth="1" />
      </pattern>
      <pattern id={`${id}-dots`} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(38)">
        <circle cx="3.5" cy="3.5" r="1" fill={tint} fillOpacity="0.45" />
      </pattern>
    </defs>
  );
}

/** Captain: the whole mark, with one cream point at its centre that every corner is tied to. */
export function CaptainArt() {
  const hub = { x: 223, y: 148 };
  const corners = [[130, 54], [315, 54], [130, 180], [315, 180], [165, 205], [280, 205]];
  return (
    <svg {...svgProps}>
      <defs>
        <linearGradient id="rc-cap-cyan" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#00C8EE" stopOpacity="0.55" />
          <stop offset="1" stopColor="#008BEA" stopOpacity="0.16" />
        </linearGradient>
        <linearGradient id="rc-cap-violet" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#B83CF0" stopOpacity="0.5" />
          <stop offset="1" stopColor="#5927DF" stopOpacity="0.14" />
        </linearGradient>
        <radialGradient id="rc-cap-glow">
          <stop offset="0" stopColor={CREAM} stopOpacity="0.55" />
          <stop offset="1" stopColor={CREAM} stopOpacity="0" />
        </radialGradient>
      </defs>
      <Textures id="rc-cap" tint="#5BE3FF" />
      <rect x="0" y="14" width="360" height="340" fill="url(#rc-cap-hatch)" />
      <g transform={PLACE}>
        <polygon points={CYAN_SLAB} fill="url(#rc-cap-cyan)" />
        <polygon points={CYAN_SLAB} fill="url(#rc-cap-dots)" />
        <polygon points={CYAN_SLAB} fill="none" stroke="#5BE3FF" strokeWidth="1.8" strokeLinejoin="miter" />
        <polygon points={VIOLET_SLAB} fill="url(#rc-cap-violet)" />
        <polygon points={VIOLET_SLAB} fill="url(#rc-cap-dots)" />
        <polygon points={VIOLET_SLAB} fill="none" stroke="#D58BFF" strokeWidth="1.8" strokeLinejoin="miter" />
        {/* Everything is tied to the centre */}
        <g stroke={CREAM} strokeOpacity="0.5" strokeWidth="1.1">
          {corners.map(([x, y]) => <line key={`${x}-${y}`} x1={hub.x} y1={hub.y} x2={x} y2={y} />)}
        </g>
        <g fill={CREAM}>
          {corners.map(([x, y]) => <rect key={`${x}-${y}`} x={x - 3.5} y={y - 3.5} width="7" height="7" transform={`rotate(45 ${x} ${y})`} />)}
        </g>
        <circle cx={hub.x} cy={hub.y} r="26" fill="url(#rc-cap-glow)" />
        <rect x={hub.x - 7} y={hub.y - 7} width="14" height="14" transform={`rotate(45 ${hub.x} ${hub.y})`} fill={CREAM} />
        <rect x={hub.x - 12} y={hub.y - 12} width="24" height="24" transform={`rotate(45 ${hub.x} ${hub.y})`} fill="none" stroke={CREAM} strokeOpacity="0.6" strokeWidth="1.2" />
      </g>
    </svg>
  );
}

/** Player: one violet slab, drawn out of place, and the empty outline of the half that is still to be found. */
export function PlayerArt() {
  return (
    <svg {...svgProps}>
      <defs>
        <linearGradient id="rc-ply-violet" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#B83CF0" stopOpacity="0.7" />
          <stop offset="1" stopColor="#5927DF" stopOpacity="0.22" />
        </linearGradient>
        <radialGradient id="rc-ply-glow" cx="0.7" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#D58BFF" stopOpacity="0.35" />
          <stop offset="1" stopColor="#D58BFF" stopOpacity="0" />
        </radialGradient>
      </defs>
      <Textures id="rc-ply" tint="#D58BFF" />
      <rect x="0" y="14" width="360" height="340" fill="url(#rc-ply-hatch)" />
      <g transform={PLACE}>
        {/* The half that is still missing */}
        <polygon points={CYAN_SLAB} fill="none" stroke="#5BE3FF" strokeOpacity="0.55" strokeWidth="1.6" strokeDasharray="5 6" strokeLinejoin="miter" />
        {/* The player, lifted a little out of the mark */}
        <g transform="translate(9 -9)">
          <ellipse cx="260" cy="130" rx="110" ry="100" fill="url(#rc-ply-glow)" />
          <polygon points={VIOLET_SLAB} fill="url(#rc-ply-violet)" />
          <polygon points={VIOLET_SLAB} fill="url(#rc-ply-dots)" />
          <polygon points={VIOLET_SLAB} fill="none" stroke="#D58BFF" strokeWidth="2" strokeLinejoin="miter" />
          <polyline points="223,167 195,148" fill="none" stroke={CREAM} strokeWidth="2.4" strokeLinecap="round" />
        </g>
        {/* The seam it will close: a cream mark on the joint, with a guide to the other slab */}
        <line x1="195" y1="148" x2="211" y2="136" stroke={CREAM} strokeOpacity="0.8" strokeWidth="1.4" strokeDasharray="2 5" strokeLinecap="round" />
        <rect x="190.5" y="143.5" width="9" height="9" transform="rotate(45 195 148)" fill="none" stroke={CREAM} strokeWidth="1.6" />
      </g>
    </svg>
  );
}
