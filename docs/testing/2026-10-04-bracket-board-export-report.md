# Bracket Social V3 board and PNG export

Implemented the shared V3 board and two PNG routes. Public PNG reads only `readPublicSocialBracket`; organizer preview PNG reads `readOrganizerSocialBracket` (which enforces event ownership) and always applies the draft preview watermark. Both routes accept only `locale` and an existing, bounded round key such as `single:3`; invalid options return 400. Oversized full exports return 413 with guidance to select a round.

The board uses compact 120 px match cards with separate team rows, logo or initials fallback, explicit source-ID SVG connections, localized status/winner labels, games and schedule details, a bounded mobile round picker, and fetch-based PNG controls with preparing, error, and retry states. Grand finals are placed after their source finals, 1-based slots are normalized, and downstream cards center on source pairs. The official champion uses a cream panel and final score. Appearance background, position, and overlay apply to the live board and PNG.

The PNG renderer uses the same markup, layout and CSS as the board. It escapes model text, inlines decoded images from trusted local folders or an allowlisted Vercel Blob host, verifies public DNS and pins the resolved address for remote fetches, blocks Chromium network requests, waits for fonts and image decode, and substitutes initials when an image fails. Files are read under a realpath-contained public root. Export dimensions are capped at 16,000 px per side and 64 million pixels. The Next build trace includes the CSS and Montserrat 400/600/800 font files.

Verification:

- Focused board/layout/export/API tests: 20 passed in 6 files, including red-to-green coverage for topology, selected rounds, assets, and route boundaries.
- TypeScript: passed. ESLint on changed implementation files: passed. `git diff --check`: exit 0 (Windows line-ending notices only).
- Next production build: exit 0, including both PNG routes. Page generation logged the existing missing `DATABASE_URL` warning; no live database was used.
- Real Edge screenshots from the shared dev-only bracket fixture: [full public](artifacts/bracket-social-v3/full-public.png) 1110x908, [selected final](artifacts/bracket-social-v3/final-public.png) 480x494, [draft preview](artifacts/bracket-social-v3/draft-preview.png) 1110x908. All three were opened and visually inspected; the final-round header and champion fit within the PNG.

No database migrations or seeds were executed. The root task is separately verifying the live browser UI and integrated organizer flow.

Mobile browser review follow-up: the 390 px header now uses a two-column grid for a 40 px logo and the event copy, with the preview badge on its own row. Match team names increased to 13 px, while status and details increased to 10 px; fixed 120 px card geometry remains. The root task is rechecking the live 390 px screenshot.

Reviewer/browser follow-up: the cream champion card now sits directly below the verified terminal elimination final in that round's column, and the header names the official champion. League fixtures do not produce a fabricated final score. Delayed and postponed matches have separate localized labels. Real Edge PNGs were regenerated and visually inspected after this change: the full export keeps the champion adjacent to its final, and the selected final remains 480x494. The scoped tests (20/20), TypeScript, and implementation ESLint passed. A new production build was deferred while the root task's development server used `.next`; the preceding build passed before this markup/CSS follow-up.
