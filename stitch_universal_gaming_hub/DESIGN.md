---
name: Kinetic League System
colors:
  surface: '#faf8ff'
  surface-dim: '#d8d9e6'
  surface-bright: '#faf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f3ff'
  surface-container: '#ecedfa'
  surface-container-high: '#e6e7f4'
  surface-container-highest: '#e1e2ee'
  on-surface: '#191b24'
  on-surface-variant: '#424656'
  inverse-surface: '#2e303a'
  inverse-on-surface: '#eff0fd'
  outline: '#727687'
  outline-variant: '#c2c6d8'
  surface-tint: '#0054d6'
  primary: '#0050cb'
  on-primary: '#ffffff'
  primary-container: '#0066ff'
  on-primary-container: '#f8f7ff'
  inverse-primary: '#b3c5ff'
  secondary: '#5b5f61'
  on-secondary: '#ffffff'
  secondary-container: '#e0e3e6'
  on-secondary-container: '#626567'
  tertiary: '#a33200'
  on-tertiary: '#ffffff'
  tertiary-container: '#cc4204'
  on-tertiary-container: '#fff6f4'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dae1ff'
  primary-fixed-dim: '#b3c5ff'
  on-primary-fixed: '#001849'
  on-primary-fixed-variant: '#003fa4'
  secondary-fixed: '#e0e3e6'
  secondary-fixed-dim: '#c4c7ca'
  on-secondary-fixed: '#191c1e'
  on-secondary-fixed-variant: '#44474a'
  tertiary-fixed: '#ffdbd0'
  tertiary-fixed-dim: '#ffb59d'
  on-tertiary-fixed: '#390c00'
  on-tertiary-fixed-variant: '#832600'
  background: '#faf8ff'
  on-background: '#191b24'
  surface-variant: '#e1e2ee'
  kuroko-orange: '#FF8A00'
  kuroko-blue: '#0047AB'
  flashpeak-green: '#22C55E'
  live-red: '#EF4444'
  surface-card: '#FFFFFF'
typography:
  headline-xl:
    fontFamily: Plus Jakarta Sans
    fontSize: 48px
    fontWeight: '800'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-caps:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
  stat-value:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: '700'
    lineHeight: 24px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  container-max: 1280px
  gutter: 24px
  margin-mobile: 16px
  stack-sm: 8px
  stack-md: 16px
  stack-lg: 32px
---

## Brand & Style

The design system is built on a **Gamer Modern** aesthetic that balances high-energy competition with professional accessibility. It moves away from the traditional "dark mode and neon" gamer tropes, instead opting for a bright, vibrant, and inclusive environment that appeals to players of all ages.

The style is characterized by **Minimalism mixed with subtle Tactile elements**. It uses generous white space, bold typography, and soft-shadowed layers to create a sense of depth and quality. The interface should feel "bouncy" and optimistic—evoking the thrill of a sports tournament rather than the intensity of a military simulation.

Key visual principles:
- **Clarity over Clutter:** Information-dense tournament brackets and leaderboards are given breathing room.
- **Friendly Professionalism:** Rounded corners and approachable fonts soften the competitive edge.
- **Vibrant Energy:** High-saturation accent colors are used strategically against clean backgrounds to guide the eye toward primary actions and live status indicators.

## Colors

The palette is anchored by **Energetic Blue**, a professional yet spirited hue that serves as the primary brand driver. The background is predominantly white and near-white to maintain an "all-ages" friendly atmosphere.

- **Primary (Energetic Blue):** Used for primary buttons, active states, and brand-level iconography.
- **Secondary (Cool Gray):** Used for subtle backgrounds, inactive tabs, and structural borders to maintain a clean look.
- **Named Colors (Game-Specific):**
    - **Kuroko orange/blue:** Applied as accents within the Kuroko-specific event pages and roster badges.
    - **Flashpeak green:** Applied to Flashpeak event markers and success states.
- **Functional Colors:** A vibrant Red is reserved exclusively for "Live Now" indicators and critical destructive actions.

Color should be used to differentiate game modes instantly—Flashpeak events lean into green accents, while Kuroko events utilize the orange/blue duality.

## Typography

The typography system prioritizes **readability and hierarchy**.

1.  **Headlines (Plus Jakarta Sans):** Chosen for its geometric but friendly curves. Use bold and extra-bold weights for tournament titles and section headers to create a "Gamer Modern" impact.
2.  **Body (Inter):** A systematic, utilitarian sans-serif used for all long-form text, descriptions, and registration forms to ensure maximum legibility.
3.  **Labels & Stats (JetBrains Mono):** A technical, monospaced font used for data-heavy elements like scores, player statistics, and metadata labels. This adds a subtle "tech/gaming" feel without compromising clarity.

Mobile adjustments are critical: `headline-xl` should scale down significantly to avoid orphans, while body text remains consistent at 16px for touch-target legibility.

## Layout & Spacing

This design system utilizes a **Fluid Grid** with fixed maximum widths for desktop to ensure tournament brackets remain readable.

- **Desktop (12 columns):** 24px gutters, 1280px max-width. Brackets and leaderboards should use the full width, while administrative forms should be centered in a 6-8 column container.
- **Tablet (8 columns):** 24px gutters. Content reflows vertically; leaderboards may introduce horizontal scrolling for deep data columns.
- **Mobile (4 columns):** 16px margins. Information is stacked. Tabbed navigation is preferred for switching between "Bracket," "Standings," and "Stats."

Spacing rhythm follows a strict 8px base unit. Components like cards and list items use `stack-md` (16px) for internal padding to maintain an airy, approachable feel.

## Elevation & Depth

Visual hierarchy is achieved through **Tonal Layers** and **Ambient Shadows**. Instead of harsh black shadows, this design system uses soft, diffused shadows with a slight blue tint (`#0066FF` at 4-8% opacity) to keep the UI feeling "clean" and "vibrant."

- **Level 0 (Background):** `#F5F7FA` (Cool Gray). Used for the base canvas.
- **Level 1 (Cards/Containers):** White background with a 12px blur, 4% opacity shadow. Used for event cards and team lists.
- **Level 2 (Interactive/Floating):** White background with a 20px blur, 8% opacity shadow. Used for dropdowns, modals, and hovered card states.

This approach creates a clear distinction between the "playing field" (background) and the "interactive pieces" (cards).

## Shapes

The shape language is consistently **Rounded**, reinforcing the friendly and accessible brand personality.

- **Standard Elements (Buttons, Inputs):** 0.5rem (8px) radius.
- **Cards & Brackets:** 1rem (16px) radius.
- **Avatar & Game Icons:** Use "Squircle" or fully circular shapes to add variety and a soft feel.
- **Live Badges:** Use a "Pill" shape (fully rounded sides) to make them stand out as distinct status indicators.

Avoid sharp corners entirely to ensure the "all-ages" gaming aesthetic is maintained throughout the platform.

## Components

### Buttons
- **Primary:** Solid Energetic Blue, white text, 8px radius. High-contrast shadow on hover.
- **Secondary:** White background, thin Cool Gray border, Energetic Blue text.
- **Game-Specific:** On event pages, buttons can adopt `kuroko-orange` or `flashpeak-green` as their primary fill to reinforce game identity.

### Cards (Event/Team)
Cards are the primary container. They must have a 16px border-radius, white background, and the Level 1 ambient shadow. Use a vertical stack for mobile and a horizontal layout for desktop participants list.

### Stats & Leaderboards
Use a zebra-stripe pattern for lists using `secondary_color_hex` for even rows. The "Rank" column should be highlighted with bold typography or a subtle background circle for the top 3 positions (Gold, Silver, Bronze accents).

### Brackets
Connecting lines in brackets should be 2px thick, using a medium gray. The "Winner" path should transition to Energetic Blue to clearly show the tournament progression.

### Inputs
Input fields should have a 1px border (`#D1D5DB`) that thickens and turns Blue on focus. Use `body-md` for placeholder text to ensure the forms feel professional and easy to navigate for team captains.

### Live Indicator
A pill-shaped badge with a pulsing `live-red` dot. Text should be "LIVE" in `label-caps` typography.