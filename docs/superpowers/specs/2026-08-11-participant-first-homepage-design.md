# Participant-First Homepage Design

## Job and audience

The homepage serves prospective participants who arrive curious but not yet ready to register. They need to see that Miracle League has a working tournament experience, with browsable events, brackets, participants, standings, and player leaderboards.

## Outcome and proof

The primary outcome is deeper exploration of a demo/public event. The homepage should make the next click obvious within a few seconds and prove the product is more than a signup form by exposing the public tournament surfaces directly.

## Selected direction

Use a participant-first demo lobby:
- Lead with a concrete event showcase instead of a general slogan.
- Make the primary call to action "View Demo Event" / "Lihat Demo Event".
- Provide direct shortcuts to event detail, bracket, participants, leaderboard, and standings where applicable.
- Demote registration to contextual copy so the homepage does not imply in-app captain signup is the main launch path.

## Scope and boundaries

Target: `src/app/home-page-content.tsx` and homepage translations in `messages/id.json` and `messages/en.json`.

Keep existing event data, localization, routing, `GameArt`, and event card behavior. Do not add new dependencies, new backend data, or a full rebrand. This pass is about clarity, hierarchy, and click paths.

## States and ranges

The homepage must still handle zero public events. With at least one event, the first filtered event becomes the demo showcase. Event card CTAs continue to adapt by status: live/ongoing events point to bracket or stream, finished events point to standings, and published events point to detail.

## Interaction and layout

The hero should include a focused event preview, status, game mode, date, team capacity, and explicit CTAs. Below it, quick links should expose the public surfaces a participant can inspect. Filters and the event card grid remain available for scanning other events.

## Constraints

All homepage copy remains localized in Indonesian and English. Text must stay readable on mobile. Buttons must name actions directly. The design must not make "Register Your Team" the dominant homepage action.
