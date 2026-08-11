# Premium Collectible Esports Championship Card

## Purpose

This document defines a reusable design specification for a premium collectible esports championship card in a `9:16` portrait format, optimized for Instagram Story and TikTok. The visual target is a hybrid of:

- `Valorant Champion Card`
- `CS2 Major Trophy Reveal`
- `Streetwear Poster`

The result should feel elite, ceremonial, sharp, and highly shareable rather than cute, casual, or overly noisy.

## Important Note On Typography Precision

All font names, font sizes, spacing values, stroke widths, glow strengths, and layout proportions in this document are **approximations inferred from the reference look** rather than exact measurements from an original source image. Use them as art-direction guidance, not as strict forensic reconstruction.

## 1. Claude-Optimized Image Generation Prompt

### Primary Prompt Template

```text
Create a premium vertical esports championship collectible card in 9:16 format, designed like a luxury social poster for Instagram Story and TikTok.

Visual style: a fusion of Valorant champion card energy, CS2 Major trophy reveal drama, and high-end streetwear poster design.

Subject and composition:
- central heroic championship emblem or trophy silhouette
- optional abstract player-card framing, but no visible full character portrait unless explicitly requested
- strong vertical composition with a dominant center axis
- layered title typography, premium tournament branding, and ceremonial winner-card attitude
- clean hierarchy with one focal point, not cluttered

Art direction:
- premium metallic surfaces, chrome, brushed steel, black glass, lacquer, carbon fiber, reflective foil accents
- intense but controlled lighting, rim glow, spotlight bloom, edge highlights, cinematic contrast
- angular esports geometry mixed with fashion-poster negative space
- sparse confetti, floating dust, tiny particle sparks, subtle shards, restrained celebratory energy
- luxury print textures, halftone traces, embossed details, micro-lines, faint grunge, anti-counterfeit style overlays

Typography look:
- bold uppercase display headline
- condensed tournament text
- smaller premium metadata lines
- slogan line with emotional momentum
- typography should feel sharp, modern, expensive, and readable on mobile

Mood:
- victorious, exclusive, ceremonial, dangerous, elite, aspirational
- not playful, not cartoonish, not generic gaming banner

Color system:
- dark base with controlled high-contrast accents
- dominant charcoal, black, gunmetal, silver, platinum
- accent color chosen from team palette or tournament palette
- selective glow only on key edges and headline accents

Layout:
- top zone for championship label or series label
- upper-mid zone for main title or team identity
- center zone for emblem or trophy focal point
- lower-mid zone for slogan or championship statement
- bottom zone for metadata, tournament date, region, seed, division, or limited-edition card details

Output qualities:
- hyper-detailed
- premium finishing
- polished mobile-first poster composition
- readable at first glance on a phone screen
- visually consistent, professional, collectible, and luxury

Text variables to include if requested:
- TEAM_NAME: {{TEAM_NAME}}
- EVENT_NAME: {{EVENT_NAME}}
- DATE_LINE: {{DATE_LINE}}
- REGION: {{REGION}}
- TAGLINE: {{TAGLINE}}
- EDITION_LINE: {{EDITION_LINE}}

Avoid overcrowding. Preserve strong hierarchy. Make it feel like an exclusive championship drop card, not a flyer.
```

### Prompt Add-On For Team-Specific Variants

```text
Use {{PRIMARY_ACCENT}} as the dominant accent color and {{SECONDARY_ACCENT}} as the support accent. Integrate subtle identity cues inspired by the team without relying on official logos unless explicitly provided. Keep the emblem abstract, premium, and original-looking.
```

### Prompt Add-On For Trophy-Centered Variants

```text
Make the central emblem read more like a ceremonial trophy reveal: glowing silhouette, layered reflective surfaces, dramatic backlight, prestige framing, restrained confetti, and a premium finals-night atmosphere.
```

## 2. Complete Visual Direction

### Core Aesthetic

The card should sit between three worlds:

- `Esports prestige`: explosive energy, tournament legitimacy, top-tier competitive aura
- `Luxury object`: metallic finish, edge-lit materials, collector-edition feel
- `Streetwear campaign poster`: graphic confidence, fashionable spacing, bold typography, premium attitude

### Emotional Tone

Target emotions:

- victory
- exclusivity
- ambition
- intimidation
- ceremonial prestige

Avoid:

- playful anime poster chaos
- meme-like gaming visuals
- overfilled UI panels
- scrapbook layering
- cheap neon overload

### Visual Density

Use a **controlled-dense** composition:

- rich detail when zoomed in
- clear focal read when viewed small
- multiple layers of finish
- only one primary hero object
- typography must not compete equally with every decorative element

### Shape Language

Preferred forms:

- angular cuts
- beveled frames
- elongated vertical panels
- shield-like silhouettes
- chamfered borders
- slim diagonal streaks

Avoid:

- rounded toy-like panels
- bubbly shapes
- soft card-game fantasy ornaments

## 3. Typography Recommendations

## Typography Disclaimer

The font families below are **recommended approximations** chosen to recreate the inferred visual style. Exact fonts used in any prior image are unknown unless separately identified from source files.

### Font Role System

Use a maximum of `3` font roles:

1. `Display headline`
2. `Condensed support / tournament text`
3. `Microcopy / metadata`

### Recommended Font Families

#### Display Headline

Use one of:

- `Druk Wide`
- `Monument Extended`
- `Bebas Neue Pro`
- `Anton` as a more accessible fallback

Visual use:

- all caps
- high tracking control
- strong weight
- short phrases only

Approximate size on `1080x1920`:

- `110-180 px`

Suggested styling:

- color: `#F3F4F6`, `#FFFFFF`, or metallic silver gradient
- subtle outer glow in accent color at `10-20%` opacity
- optional 1-3 px inner shadow or dark edge for readability
- occasional chrome foil treatment for one key word only

#### Condensed Support Text

Use one of:

- `DIN Condensed`
- `Tungsten`
- `Oswald`
- `Roboto Condensed`

Approximate size:

- `34-72 px`

Use for:

- event name
- championship stage
- city or region
- edition markers
- subheaders

Suggested styling:

- uppercase
- slightly wider tracking than the headline
- flat white, silver, or muted accent
- minimal glow

#### Metadata / Microcopy

Use one of:

- `Space Grotesk`
- `Inter`
- `Helvetica Now Text`
- `Suisse Int'l` style equivalent

Approximate size:

- `18-34 px`

Use for:

- dates
- division
- seed
- edition number
- tag IDs
- secondary copy

Suggested styling:

- medium or semibold weight
- tighter line spacing
- reduced opacity where necessary
- often placed in compact blocks or separated by dividers

### Hierarchy Rules

- `Headline`: 100% dominance
- `Tournament/Event line`: 45-60% of headline visual weight
- `Tagline`: 40-55% of headline visual weight
- `Metadata`: 15-30% of headline visual weight

### Tracking And Spacing

- display headline tracking: `-1% to +2%`
- condensed support text tracking: `+4% to +10%`
- metadata tracking: `+2% to +8%`
- vertical spacing between major text groups: `2.5% to 4%` of canvas height

### Glow, Stroke, And Effects

- use glow only on one headline, one emblem edge, and one accent line
- keep glow soft, not nightclub neon
- preferred glow colors: accent color at low opacity, icy white, pale gold, cold cyan depending on palette
- optional stroke: `1-2 px` dark stroke for readability over high-contrast highlights
- optional bevel or embossed illusion on metallic titles

## 4. Layout Grid With Percentages

Base canvas:

- `1080 x 1920`
- portrait `9:16`

Safe zone:

- left/right padding: `6%`
- top padding: `5%`
- bottom padding: `6%`

### Vertical Zone Map

#### Zone A: Header Strip

- height: `8%`
- purpose: series label, rarity tag, championship stamp, season marker

#### Zone B: Upper Identity Block

- height: `16%`
- purpose: team name, champion title, event category

#### Zone C: Hero Emblem / Trophy Stage

- height: `31%`
- purpose: main focal object, emblem, trophy silhouette, reflective centerpiece

#### Zone D: Statement / Tagline Block

- height: `12%`
- purpose: emotional line, slogan, winner statement

#### Zone E: Support Details

- height: `15%`
- purpose: tournament name, date, region, circuit, record, limited-edition data

#### Zone F: Footer Finish

- height: `10%`
- purpose: serial, insignia, decorative line, lockup, social-ready closing detail

Remaining `8%` is distributed across inter-zone breathing space, visual overlap, and lighting spill.

### Horizontal Structure

- central content spine: `56-64%` width
- side ambient detail lanes: `18-22%` total per side combined
- hero object centered at `50%` width
- optional asymmetry can push secondary accents up to `8%` off center

### Alignment Rules

- major hero object: center aligned
- title block: center aligned or slightly offset
- metadata: center aligned or split symmetric pair
- never mix too many alignment systems in one card

## 5. Background, Emblem, Confetti, Textures, Lighting

### Background

Preferred background stack:

1. deep charcoal to black gradient base
2. subtle spotlight bloom from center or upper center
3. faint steel or carbon-fiber texture
4. optional geometric frame overlays at low opacity
5. tiny print-noise layer for anti-flatness

Recommended colors:

- `#08090B`
- `#101317`
- `#1B1F24`
- `#BFC7D5`
- accent color overlays as needed

### Emblem / Trophy

The center object should feel collectible and ceremonial:

- abstract shield, crest, insignia, or trophy silhouette
- reflective metal, glass, or enamel finish
- layered construction with outer rim, core plate, and accent highlights
- edge lighting more important than internal detail
- should read cleanly at small mobile size

Do not make it:

- too logo-dependent
- too detailed to read
- too fantasy-medieval unless intentionally requested

### Confetti And Particles

Use confetti sparingly:

- concentrated near upper thirds or around light beams
- mostly metallic slivers, micro-rectangles, foil dust, reflective shards
- avoid birthday-party density

Particle intensity:

- `10-20%` decorative strength relative to the hero object

### Surface Textures

Recommended texture stack:

- micro scratches
- brushed metal grain
- faint halftone
- anti-counterfeit linework
- soft film grain
- limited embossed borders

These should remain subtle. The viewer should feel premium finish before consciously noticing texture.

### Lighting

Preferred lighting model:

- one main spotlight
- one rear halo or bloom
- narrow rim lights on emblem edges
- one accent-color glow lane
- limited top flare or side flare

Avoid:

- rainbow lighting
- multiple competing light temperatures
- large lens flares covering type

## 6. Microcopy And Tagline Library

Use short lines that sound ceremonial, aspirational, and competitive.

### Championship Labels

- `CHAMPIONS`
- `GRAND FINALIST`
- `MAJOR WINNER`
- `ELITE SERIES`
- `LEGACY EDITION`
- `TROPHY REVEAL`
- `LIMITED DROP`

### Hero Statements

- `NO ZONE CAN STOP OUR DRIVE`
- `BUILT FOR THE FINAL ROUND`
- `EVERY CLUTCH LED HERE`
- `FORGED UNDER STAGE LIGHTS`
- `ONLY THE SHARPEST SURVIVE`
- `PRESSURE MADE THIS`
- `PLAY THE DECISIVE MOMENT`
- `RAISED FOR THE MAIN STAGE`

### Premium Metadata Phrases

- `OFFICIAL CHAMPIONSHIP CARD`
- `FOUNDERS SERIES`
- `COLLECTOR RELEASE`
- `STAGE VERIFIED`
- `LIMITED VISUAL EDITION`
- `TOURNAMENT ARCHIVE DROP`
- `CEREMONIAL RELEASE FRAME`

### Footer Fragments

- `SERIES 01`
- `EDITION A`
- `FINALS NIGHT`
- `REGION LOCK`
- `VERIFIED DROP`
- `ARCHIVE FRAME`

## 7. Reusable Variables

Use the following tokens in prompts, layouts, or production templates:

```text
{{TEAM_NAME}}
{{EVENT_NAME}}
{{DATE_LINE}}
{{REGION}}
{{TAGLINE}}
{{EDITION_LINE}}
{{PRIMARY_ACCENT}}
{{SECONDARY_ACCENT}}
{{CARD_TIER}}
{{SERIAL_CODE}}
{{SEASON_MARKER}}
{{RESULT_LINE}}
```

### Example Variable Usage

```text
TEAM_NAME: FLASHPEAK
EVENT_NAME: ASIA INVITATIONAL FINALS
DATE_LINE: AUGUST 2026
REGION: APAC
TAGLINE: NO ZONE CAN STOP OUR DRIVE
EDITION_LINE: COLLECTOR RELEASE // SERIES 01
PRIMARY_ACCENT: ELECTRIC RED
SECONDARY_ACCENT: PLATINUM SILVER
CARD_TIER: CHAMPION EDITION
SERIAL_CODE: FP-26-001
SEASON_MARKER: SEASON V
RESULT_LINE: FIRST SEED // TITLE SECURED
```

## 8. Negative Prompt And Consistency Rules

### Negative Prompt

```text
Avoid: cluttered flyer layout, low-resolution text, cartoon UI, cheap neon overload, random sci-fi interface spam, soft toy-like shapes, overexposed lens flare, muddy contrast, unreadable typography, too many logos, busy background, thick confetti storm, childish color palette, meme energy, casual streamer thumbnail look, generic mobile game ad style, distorted lettering, duplicated details, off-center hero object without purpose, washed-out metallics, inconsistent perspective.
```

### Consistency Rules

1. Keep exactly `one` dominant hero object.
2. Limit accent colors to `1 primary + 1 support`.
3. Use at most `3` font roles.
4. Preserve a strong top-to-bottom read in under `2 seconds`.
5. Keep confetti subordinate to the emblem and typography.
6. Do not let texture obscure legibility.
7. If a slogan is used, keep it short and poster-like.
8. If multiple text blocks exist, separate them by scale, weight, or brightness.
9. Maintain premium restraint; energy should come from contrast and finish, not from crowding.
10. Every variant should still feel like part of the same collectible series.

## 9. Export Recommendations

### Master Working Size

- preferred: `2160 x 3840`
- delivery aspect ratio: `9:16`

### Social Delivery Size

- standard output: `1080 x 1920`

### Format Recommendations

- `PNG` for final delivery
- high-quality `JPG` only if file size matters
- preserve crisp text edges and metallic gradients

### Readability Checks

Before exporting, confirm:

- headline readable at phone size
- emblem identifiable at arm's length
- bottom metadata not too small
- glow does not wash out type
- contrast survives Instagram/TikTok compression

### Versioning Recommendations

Export at least `3` variants:

1. `Clean master`
2. `Confetti enhanced`
3. `Typography emphasis`

### Platform Notes

- leave a little breathing room near top and bottom UI-sensitive areas
- avoid placing key text too close to Story reply bars or TikTok interface zones
- test one darker version and one brighter metallic version for compression resilience

## 10. Series Construction Rules For Future Variants

To build a consistent collectible series:

- keep the same zone structure across releases
- rotate only accent color, tagline, team variable, event variable, and emblem motif
- reuse one background logic and one typography system
- reserve one signature effect for the series, such as a platinum rim glow or anti-counterfeit footer strip
- keep edition labels standardized for continuity

## 11. Short Production Summary

If recreating this style quickly, prioritize in this order:

1. strong center emblem or trophy reveal
2. premium dark metallic background
3. one bold display headline
4. one emotional slogan
5. restrained celebratory particles
6. subtle collector-grade finishing textures

The overall goal is not maximum complexity. The goal is **prestige with control**.
