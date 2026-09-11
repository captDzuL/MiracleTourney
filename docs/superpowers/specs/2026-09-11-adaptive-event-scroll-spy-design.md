# Adaptive Public Event Scroll-Spy Design

Date: 11 September 2026
Status: approved direction, awaiting implementation
Scope: Adaptive Public Event V3 registration composition only

## Problem

The contextual links Ringkasan, Peserta, Persyaratan, and Organizer are plain anchors. Clicking one scrolls the page, but every link keeps the same visual treatment and the destination card has no arrival feedback. Users cannot tell which section is active.

## Interaction design

- Keep the four existing sections and hash destinations: `#summary`, `#participants`, `#requirements`, and `#organizer`.
- Make the contextual navigation sticky below the global header while the event content is being read.
- Indicate the active link with cyan text, a violet underline, and `aria-current="location"`. The state must not depend on color alone.
- Clicking a link updates the URL hash, scrolls the destination below the sticky navigation, and applies a short cyan border/ring highlight to the destination.
- While scrolling manually, the active link follows the section nearest the upper reading boundary. Initial state comes from a valid URL hash and otherwise defaults to Ringkasan.
- Hash navigation continues to work with browser back/forward and direct deep links.
- Respect `prefers-reduced-motion`: use immediate scrolling and no highlight animation when reduced motion is requested.

## Component boundaries

Create a focused client component, `PublicEventSectionNav`, which owns active-section state, hash navigation, IntersectionObserver behavior, keyboard-safe links, and focus-independent visual feedback. `AdaptiveRegistrationEventPage` remains the server composition and passes localized labels to the client component.

Each destination receives shared scroll-margin and highlight hooks. `RegistrationOverview` owns Ringkasan, Peserta, and Persyaratan targets. `OrganizerPublicCard` owns the Organizer target. No business data or registration state moves into the client component.

## Responsive behavior

The navigation remains horizontally scrollable on narrow screens without increasing document width. The active item scrolls into view when necessary. Every link remains at least 44 pixels high. Sticky positioning must not cover the destination heading or the mobile registration CTA.

## Accessibility

- Preserve semantic `<nav>` and real anchor links.
- Use `aria-current="location"` on exactly one active link.
- Keep visible keyboard focus independent from active styling.
- Do not move keyboard focus merely because the user scrolls.
- Provide clear text labels in Indonesian and English through the existing `adaptiveEvent` namespace.

## Verification

- Component tests cover default state, click selection, valid initial hash, observer-driven active state, and reduced-motion behavior.
- Route/component coverage verifies all four destination IDs remain present.
- Browser coverage verifies click-to-section, active indicator, deep linking, back/forward hash behavior, and no horizontal overflow at 360 pixels.
- Run focused Vitest, TypeScript, adaptive Playwright, and `git diff --check` through `.env.test` only.

## Non-goals

This change does not turn the page into hidden tab panels, change event data, alter CTA rules, or modify the legacy, Ongoing, Finished, or private-preview renderers.
