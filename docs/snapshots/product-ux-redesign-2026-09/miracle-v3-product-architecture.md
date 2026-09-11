# Miracle V3 Product Architecture

Date: 5 September 2026  
Status: Approved-design consolidation for implementation planning  
Primary user priority: Organizer, Public, Captain

## Product principles

1. An organizer must always know the next useful action.
2. Draft event data autosaves and can be previewed through a private no-login preview link.
3. Public information lives at one stable event URL and adapts from registration through completion.
4. Official match scores move the competition immediately; player statistics use a separate draft, review, and publication lifecycle.
5. Standings, brackets, qualification, schedules, podiums, awards, and certificates are derived outputs. Users do not edit derived values directly.
6. Miracle uses Montserrat, dark default surfaces, thin borders, the official logo, and no more than three chromatic brand colors: cyan, violet, and cream.
7. Status is never communicated by color alone. Every state includes copy, iconography, or a badge label.
8. Organizer identity and contact information live in a dedicated profile surface and appear as a compact trust block on public events.
9. Desktop and mobile are equal acceptance targets.

## Canonical design references

- public/miracle-organizer-v3-contextual-mockup.html
- public/miracle-organizer-v3-workspace-mockup.html
- public/miracle-organizer-v3-registration-mockup.html
- public/miracle-captain-v3-direct-registration-mockup.html
- public/miracle-captain-v3-match-day-mockup.html
- public/miracle-organizer-v3-match-control-mockup.html
- public/miracle-organizer-v3-result-stats-mockup.html
- public/miracle-organizer-v3-multiformat-create-event-mockup.html
- public/miracle-organizer-v3-format-aware-match-day-mockup.html
- public/miracle-organizer-v3-group-matchday-mockup.html
- public/miracle-organizer-v3-tournament-completion-mockup.html
- public/miracle-organizer-v3-certificate-studio-mockup.html
- public/miracle-public-v3-adaptive-event-page-mockup.html

## Sitemap

### Public

| Route | Purpose | Lifecycle behavior |
|---|---|---|
| /[locale] | Homepage and event discovery | Featured and active events |
| /[locale]/events | Searchable event directory | Registration, live, and completed filters |
| /[locale]/events/[slug] | Adaptive Event Page | Registration information, live event center, or final recap |
| /[locale]/events/[slug]/participants | Teams and rosters | Available after publication |
| /[locale]/events/[slug]/schedule | Fixtures and official results | Format-aware, grouped by round/matchday |
| /[locale]/events/[slug]/bracket | Elimination tree | Shown for elimination or playoff phases |
| /[locale]/events/[slug]/standings | League or group standings | Shown when standings exist |
| /[locale]/events/[slug]/leaderboards | Published player statistics | Never exposes draft statistics |
| /[locale]/events/[slug]/awards | Final individual awards | Available after completion |
| /[locale]/events/[slug]/certificates | Published certificate index | Available after certificate generation |
| /[locale]/certificates/[certificateId] | Verifiable certificate | Public, immutable version with correction history |

No separate Live Match Center or Final Recap route exists. Those are states of /events/[slug].

### Authentication

| Route | Purpose |
|---|---|
| /[locale]/login | Role-aware sign in |
| /[locale]/register | Captain or organizer account registration |
| /[locale]/forgot-password | Reset request |
| /[locale]/forgot-password/reset | Password replacement |

### Organizer

| Route | Purpose |
|---|---|
| /[locale]/organizer | Organizer home, event portfolio, urgent actions |
| /[locale]/organizer/profile | Organization name and supported contact channels |
| /[locale]/organizer/events/new | Contextual create-event workspace with autosave and preview |
| /[locale]/organizer/events/[eventId] | Event overview and lifecycle status |
| /[locale]/organizer/events/[eventId]/setup | Information, branding, registration window, format configuration |
| /[locale]/organizer/events/[eventId]/registration | Direct registrations, payment review, import batches |
| /[locale]/organizer/events/[eventId]/participants | Approved teams, rosters, eligibility |
| /[locale]/organizer/events/[eventId]/competition | Groups, league table settings, bracket generation, seeding |
| /[locale]/organizer/events/[eventId]/schedule | Generated fixtures, rooms, duration, buffers, locks |
| /[locale]/organizer/events/[eventId]/match-control | Readiness, delays, live operations, priority queue |
| /[locale]/organizer/events/[eventId]/matches/[matchId] | Official Result & Player Stats Desk |
| /[locale]/organizer/events/[eventId]/completion | Readiness gates, podium, awards, certificate generation |
| /[locale]/organizer/events/[eventId]/publication | Event preview, public versions, announcements |
| /preview/events/[previewToken] | Private no-login draft preview | Revocable, read-only, excluded from indexing |

An organizer may run multiple overlapping events for the same game. No schedule collision blocks event creation; warnings are event-local unless a future premium resource calendar is added.

### Captain

| Route | Purpose |
|---|---|
| /[locale]/captain | Next action, active registration, next match |
| /[locale]/captain/teams | Reusable team drafts and roster management |
| /[locale]/captain/registrations | Direct registration, payment, review status |
| /[locale]/captain/matches | Matchday queue, ready status, check-in history |
| /[locale]/captain/matches/[matchId] | Match instructions and captain submission |
| /[locale]/captain/stats | Player-stat drafts and returned submissions |
| /[locale]/captain/settings | Account and password |

Captain readiness supports both self check-in and organizer-marked ready after an in-person roll call.

### Platform administration

| Route | Purpose |
|---|---|
| /[locale]/admin | Platform health and cross-organizer operations |
| /[locale]/admin/users | User access and deactivation |
| /[locale]/admin/organizers | Verification and plan controls |
| /[locale]/admin/payments | Platform-level payment configuration |
| /[locale]/admin/events | Exceptional moderation and support |

Event operations belong to organizer routes. The current /admin event workflow remains available behind a migration flag until organizer routes reach parity.

## Lifecycle state matrix

| Event state | Organizer focus | Captain focus | Public focus |
|---|---|---|---|
| Draft | Complete required information and preview | None | Private preview token only |
| Published | Monitor registration and payments | Register team and roster | Event information and registration CTA |
| Registration Closed | Finalize participants and competition structure | Review acceptance and schedule | Participant list and upcoming schedule |
| Ongoing | Match Control, official results, schedule impact | Readiness and next match | Live match, next fixture, results, bracket/standings |
| Finished | Completion, awards, certificates, corrections | Final stats and certificates | Final recap at the same event URL |

## Tournament formats in V3 release one

### Head-to-Head Elimination

- Single Elimination.
- Double Elimination with Upper and Lower Brackets.
- Best-of configuration per round.
- Single Elimination generates a Third Place Match when two semifinals exist.
- Double Elimination derives third place from the Lower Bracket Final loser.

### League / Round-Robin

- Single or double round-robin.
- Pure final standings.
- Configurable points and ordered tiebreakers.
- Champion, runner-up, and third place come from locked standings.

### Group + Playoffs

- Round-robin groups.
- Configurable group count and Top N qualification.
- Single or Double Elimination playoffs.
- Seeding avoids immediate same-group rematches when the selected preset permits.

Battle Royale Points, Match Point, Swiss, FFA, heats, score trial, and time trial remain outside release one.

## Design tokens

### Typography

- Family: Montserrat.
- Body: 400 or 500.
- Labels and controls: 600.
- Headings: 700 or 800.
- Championship certificate display: 900.
- Minimum public body size: 14 px.
- Minimum operator dense-table size: 12 px.
- Body line height: 1.6.
- Heading line height: 1.1 to 1.25.

### Color

Chromatic brand colors:

| Token | Value | Use |
|---|---:|---|
| --color-brand-cyan | #49D1EC | Information, focus, qualified state |
| --color-brand-violet | #AA8BFF | Primary emphasis, selected state |
| --color-brand-cream | #F6DFB1 | Achievement, warning, premium emphasis |

Neutral dark theme:

| Token | Value |
|---|---:|
| --color-bg | #09111E |
| --color-surface | #101B2B |
| --color-surface-subtle | #0C1523 |
| --color-surface-selected | #1C293E |
| --color-border | #29374A |
| --color-text | #F3EFE7 |
| --color-text-muted | #AAB7C9 |

The light theme uses neutral replacements only. Semantic status combines one brand color with text and icon; it does not introduce more chromatic colors.

### Spacing and shape

- Spacing scale: 4, 8, 12, 16, 24, 32, 48, 64 px.
- Control heights: 36 px compact, 40 px default, 48 px prominent.
- Radius: 8 px controls, 12 px cards, 16 px major panels.
- Border: 1 px neutral rule.
- Content widths: 1220 px public, 1500 px operator workspace.
- Operator sidebar: 220 px.
- Breakpoints: 620 px mobile, 980 px compact desktop, 1100 px workspace collapse.

### Theme behavior

- Dark is the initial theme.
- Organizer and captain expose dark, light, and system modes.
- Theme preference persists under the existing panel-theme storage contract.
- Public pages render dark by default. A public theme control may reuse the same tokens without changing information hierarchy.

## Component system

### Foundations

- BrandLogo: symbol or horizontal lockup, accessible alt text.
- Button: primary, secondary, ghost, destructive-by-copy.
- IconButton.
- Badge: neutral, info, selected, warning.
- Surface: card, panel, inset panel.
- Divider.
- Tooltip.
- EmptyState.
- Skeleton.
- Dialog and Drawer.
- Toast.
- Pagination with 10, 25, and 50 rows.
- DataTable with keyboard navigation and horizontal table containment.
- ThemeControl.

### Navigation and layout

- PublicShell.
- OperatorShell.
- EventWorkspaceShell.
- RoleNavigation.
- EventContextHeader.
- LifecycleTabs.
- WorkspaceSidebar.
- MobileActionBar.
- Footer with Miracle copyright and organizer/social contacts.

### Event creation and registration

- AutosaveIndicator.
- ContextualFieldGroup.
- EventPreviewPane.
- PreviewLinkControl.
- FormatSelector.
- FormatSummary.
- RegistrationWindowFields.
- RegistrationSourceTabs.
- RegistrationImportStepper.
- ImportMappingTable.
- ImportReviewTable.
- RegistrationStatusCard.
- PaymentProofPanel.
- OrganizerProfileCard.

### Competition operations

- ActionQueue.
- MatchCard.
- MatchStatusBadge.
- ReadinessControl.
- ScheduleGeneratorPanel.
- ScheduleImpactPreview.
- BracketView.
- GroupSelector.
- MatchdaySelector.
- StandingsTable.
- QualificationCutline.
- ResultEditor.
- SeriesScoreEditor.
- PlayerStatsDraftTable.
- EvidenceDrawer.
- AuditTimeline.

### Completion and public output

- CompletionGateList.
- Podium.
- AwardDecisionPanel.
- CertificateStudio.
- CertificatePreview.
- SafeZoneOverlay.
- AdaptiveEventHero.
- LiveMatchFeature.
- RecentResultFeed.
- ChampionJourney.
- PublicRecap.
- VerifiedOrganizerCard.

## Existing-to-V3 mapping

| Existing implementation | V3 destination |
|---|---|
| src/components/shell.tsx | PublicShell and shared BrandLogo/Footer |
| src/components/panel/PanelShell.tsx | OperatorShell |
| src/components/panel/PanelThemeToggle.tsx | ThemeControl, preserving storage behavior |
| src/app/globals.css public-visual-v2 scope | Tokenized V3 public and operator scopes |
| src/components/public-v2/PublicEventDetailV2.tsx | AdaptiveEventPage composition |
| src/app/events/[slug]/event-detail-page.tsx | Lifecycle view-model loader |
| Existing participant/bracket/standings/leaderboards routes | Retained detail destinations |
| src/app/admin/page.tsx | Split into organizer event routes and platform-admin routes |
| src/app/captain/page.tsx | Split into captain overview, teams, registrations, and matches |
| src/lib/actions.ts | Split only as each V3 domain is migrated |
| src/lib/platform/repository.ts | Split only as each V3 domain is migrated |
| src/lib/tournament/engine.ts | Extended with format-specific pure engines |
| prisma/schema.prisma Certificate one-to-one relation | Multi-recipient, versioned certificate records |
| public HTML mockups | Visual acceptance references only |

## Data gaps that implementation must close

1. Structured event registration start/end, start date, timezone default WIB, optional venue address.
2. Organizer profile and contact channels.
3. Autosaved event draft and revocable preview token.
4. Format configuration, competition phases, groups, group memberships, seeds, and tiebreakers.
5. Match scheduling fields: planned start, estimated duration, room, buffer, rest constraints, manual lock, and revision.
6. Match readiness, organizer roll-call readiness, incidents, priority actions, and audit records.
7. Official-result versioning and downstream impact records.
8. Completion state, podium records, award definitions, candidates, decisions, and audit history.
9. Multiple certificates per event with recipient type, award type, asset references, version, and public verification.
10. Public event revisions and announcement records.

## Implementation sequence

1. V3 design foundation and shells.
2. Organizer information architecture, profile, event draft, preview, and registration workspace.
3. Competition domain and multi-format creation.
4. Captain registration and Match Day surfaces.
5. Organizer scheduling, Match Control, official results, and statistics.
6. Completion, awards, and certificate generation.
7. Adaptive public Event Page and retained detail routes.
8. Migration cleanup after feature-flag parity and production verification.

Each stage ships behind an explicit feature flag, preserves existing behavior until parity, and has a rollback path that disables the V3 route or composition without deleting data.


## Foundation implementation notes

The first implementation slice intentionally translates the HTML mockups into a shared production shell rather than copying their page-specific chrome.

- Public navigation becomes desktop navigation at 620 px. Operator navigation keeps the drawer until 980 px so dense controls retain useful width. Event workspaces collapse at 1100 px.
- Public, organizer, captain, and platform-admin states share one locale-aware navigation system. Links are filtered by the signed-in role and active state is derived from the longest matching route.
- The official horizontal Miracle SVG is the shell lockup. The symbol variant remains available for compact compositions; decorative mockup wordmarks are not recreated in CSS.
- The footer always renders `Copyright © Miracle` and the platform description. Social links render only after official contact URLs are configured, avoiding placeholder or invented destinations.
- Dark is applied before paint and is the default for the public and operator token scopes. Operator light, dark, and system choices continue to use the existing saved theme contract.
- Keyboard focus, skip navigation, drawer focus containment, Escape-to-close, focus return, and body scroll locking are production accessibility requirements even where the static mockups do not illustrate them.
- The browser foundation smoke suite uses the database-free organizer route as the shared operator canvas, then supplies organizer, captain, and platform-admin session responses to verify role-specific shell navigation. Authenticated page data remains covered by the existing seeded end-to-end suite.

These differences preserve the approved hierarchy, Montserrat typography, logo-led three-color palette, borders, and dark visual direction while making the shell reusable and accessible.
