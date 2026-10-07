# Miracle Public V3 — final connected mockup

Date: 12 September 2026
Status: Interactive mockup ready for visual review; not a production implementation.

## Entry point

Open `public/miracle-public-v3-final-mockup.html` directly, or serve `public` with a local static server. All fonts, artwork, styles, and scripts are local. The entry point defaults to Home / Ongoing.

The toolbar above the actual site is a review tool. Its four choices are Registration, Published Drawing, Ongoing, and Finished. All fixture data is illustrative; the toolbar does not alter real events.

## Accepted direction

- One primary event is the expected near-term operating model.
- Homepage leads with a strong event hero and a sense of an active competition.
- Other events remain visible as upcoming or finished entries; the primary event is the only event presented as active.
- The permanent Event Page is the hybrid event center: useful previews with deeper participant, schedule, bracket, and leaderboard views.
- Bracket structure is visible during registration, with every team slot showing TBD and no match scores.
- Organizer retains authority over official seeding and drawing publication.
- Registration order must not implicitly become competitive seeding.
- Statistics appear only once reviewed and published; before that the leaderboard explains why it is empty.

## Connected screens

| Mockup route | Intended production destination | Design purpose |
| --- | --- | --- |
| `#home/live` | `/[locale]` | Single-event hero, score highlight, event pulse, four discovery shortcuts, small archive entry |
| `#events/live` | `/[locale]/events` | Current event, upcoming events, and finished-event archive with status filtering |
| `#event/live` | `/[locale]/events/[slug]` | Shared identity, lifecycle composition, live/result module, upcoming matches, bracket and leaderboard previews, organizer context |
| `#participants/live` | `/[locale]/events/[slug]/participants` | Alphabetical team grid, search including roster names, status filtering, pagination, public roster dialog |
| `#schedule/live` | `/[locale]/events/[slug]/schedule` | Fixtures and official results, round filter, WIB times, match details |
| `#bracket/live` | `/[locale]/events/[slug]/bracket` | Connected tree, focused sections or full 32-team view, match details, official publication context |
| `#leaderboard/live` | `/[locale]/events/[slug]/leaderboards` | Top scorer/assist/save views, leading-player cards, rank table, position/team/search filters |

Replace `live` with `registration`, `drawing`, or `finished` to review another lifecycle state. Browser history and direct links preserve screen and phase.

## Lifecycle behavior

Registration leads with the registration deadline, available slots, fee, roster requirements, and entry action. The bracket is a capacity-based visual template rather than a projection of current registrants. Agenda dates are available; assigned fixtures are not. Participants show accepted public team identities. The leaderboard is empty without assigning artificial zero-score ranks.

Published Drawing represents the gap between registration closing and kickoff. The public sees the organizer's published bracket and schedule, while future-round slots remain TBD. This is a review state, not a new public URL.

Ongoing leads with the current series, next fixtures, schedule notices, and official recent results. Score updates and reviewed player statistics are distinct. The leaderboard explicitly explains the current match has not been added yet.

Finished leads with the champion and podium, final results, completed bracket, and four individual awards: MVP of Tournament, Top Scorer, Top Defender, and Top Assist. Each award links to its own public certificate preview. The full final leaderboard remains a dedicated destination. Finished has no upcoming-match claims.

## Visual system

Montserrat 400/600/800; existing Miracle SVG; dark surfaces; cyan, violet, and cream interface colors. Existing Flashpeak character assets are composed into an event poster visual. Brand identity and event information remain prominent while dense public data is placed on calmer surfaces.

Desktop uses a 1220px content area. Event identity is full on the overview and compact on detail screens. A sticky event navigation bar retains access to every public view. Tables and bracket canvases scroll within bounded regions on mobile; they must not increase document width. Team cards use two columns on phones. Dialogs use native modal behavior and Escape, and all control groups expose selected states.

## Fixture and interaction boundaries

The illustrative event is MFL S3, 32-team Single Elimination, 18–20 September, with a 24/32 registration state. BO1 applies to the first two rounds, BO3 to quarterfinals and semifinals, BO5 to the final, and BO3 to third place.

Event-status filtering, participant search, pagination, roster dialogs, match details, phase switching, bracket area switching, sharing the local link, and page navigation are implemented as prototype interactions.

Login, payment/registration, streaming, organizer contact, prior-event archive, and certificates open clearly labeled previews. They do not call production services. Organizer drawing controls are described but not implemented in this public mockup.

The current production generator still infers seeds from team creation order. Changing that behavior requires explicit persisted seed/drawing state and organizer publication controls. This mockup does not change that generator or existing matches.

League, Double Elimination, and Group + Playoffs are not separate fixtures in this artifact. Their later integration must expose only relevant public sections; Group + Playoffs needs both group standings and a playoff bracket. The current deliverable establishes the agreed public experience using the primary football event example.

## Verification

`scripts/verify-public-v3-final-mockup.cjs` exercises all seven screens in all four lifecycle states at 1440, 768, 390, and 360 pixels. It checks document overflow, image loading, headings, event filtering, registration placeholder visibility, pre-match leaderboard emptiness, and the connected interactions. Desktop and mobile captures are saved under `public/mockup-public-v3/previews`.

Existing mockups remain available for historical comparison. This connected mockup is the proposed final public direction for review.
