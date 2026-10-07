# Miracle Public V3 Production Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menjadikan mockup final Public V3 sebagai tampilan produksi untuk Homepage, Event Center, seluruh fase halaman event, dan detail routes tanpa kehilangan data/event lama.

**Architecture:** Satu normalized public-event read model menjadi batas antara data kompetisi dan presentasi. Event dengan graph V3 memakai data authoritative; event lama diproyeksikan secara jujur ke kontrak compatible, sehingga flag V3 tidak pernah jatuh kembali ke UI lama hanya karena bentuk datanya. Semua halaman memakai visual system ter-scoped yang dipindahkan dari mockup final, sedangkan feature flag tetap menjadi rollback operasional.

**Tech Stack:** Next.js App Router, React, TypeScript, Prisma/PostgreSQL, Vitest, Playwright, CSS lokal, pnpm.

## Global Constraints

- [ ] Kerjakan hanya di worktree `E:\dev\MiracleTourney-gitnative\.worktrees\miracle-ui-release-1.0-full` pada branch `feature/ui/release/1.0`.
- [ ] Gunakan `public/miracle-public-v3-final-mockup.html` dan `public/mockup-public-v3/styles.css` sebagai sumber visual yang disetujui; database tetap sumber isi dan status.
- [ ] Saat `public_discovery_v3` aktif, jangan gunakan fallback UI `public_visual_v2` akibat data lama/tidak lengkap.
- [ ] Jangan mengarang drawing, jadwal, award, certificate, atau statistik. Tampilkan `TBD`/belum dipublikasikan secara eksplisit.
- [ ] Pertahankan rollback lewat feature flag; jangan deploy production atau mengaktifkan flag production.
- [ ] Jangan commit `.claude/`, Playwright report, trace sementara, screenshot preview ad-hoc, atau folder `previews` mockup.
- [ ] Terapkan TDD: tulis test gagal, jalankan dan pastikan gagal karena alasan yang benar, implementasi minimum, lalu jalankan kembali sampai hijau.
- [ ] Commit kecil setelah setiap task; jangan mencampur perubahan user yang tidak terkait.

---

## Task 1: Pulihkan baseline release yang hijau

**Files:**
- Modify: `src/lib/competition/workspace-read.ts`
- Modify: `src/lib/competition/workspace-read.test.ts`
- Modify: `2026-09-14-release-1.0-verification.md` (hanya setelah semua gate selesai)

- [ ] Review perubahan lokal untuk memastikan hanya opsi transaksi read workspace yang dibatasi: isolation `RepeatableRead`, `maxWait: 5000`, `timeout: 20000`.
- [ ] Pastikan unit test memverifikasi opsi transaksi diteruskan tanpa mengubah hasil baca atau retry semantics.
- [ ] Jalankan focused unit test:

```powershell
pnpm exec vitest run src/lib/competition/workspace-read.test.ts
```

Expected: 13 test lulus.

- [ ] Reset database test Neon Delicate dengan prosedur E2E yang sudah tersedia, lalu jalankan Match Day saja:

```powershell
pnpm test:e2e:prepare
pnpm exec playwright test tests/e2e/v3-matchday.spec.ts --project=chromium --fail-on-flaky-tests
```

Expected: 10/10 lulus, tidak ada retry atau flaky test.

- [ ] Jika masih gagal, simpan trace/log dan lanjutkan systematic debugging; jangan menambah timeout tanpa bukti bottleneck baru.
- [ ] Commit hanya dua file baseline:

```powershell
git add src/lib/competition/workspace-read.ts src/lib/competition/workspace-read.test.ts
git commit -m "fix(competition): bound workspace read transactions"
```

## Task 2: Normalisasi data public event authoritative dan compatible

**Files:**
- Create: `src/lib/events/public-v3-types.ts`
- Create: `src/lib/events/public-v3-read.ts`
- Create: `src/lib/events/public-v3-read.test.ts`
- Modify: `src/lib/events/public-registration.ts`
- Modify: `src/lib/events/public-drawing.ts`
- Modify: `src/lib/events/public-ongoing.ts`
- Modify: `src/lib/events/public-finished.ts`

- [ ] Tulis test untuk event V3 penuh, event legacy tanpa `CompetitionPhase`, missing publication, dan slug tidak ditemukan.
- [ ] Definisikan kontrak normalized berikut dan union lifecycle `registration | drawing | ongoing | finished`:

```ts
export type PublicV3DataSource = "authoritative" | "compatible";

export async function readPublicV3Event(
  slug: string,
  viewer: PublicViewer,
  now?: Date,
): Promise<PublicV3EventViewModel | null>;

export function projectCompatiblePublicV3Event(
  input: CompatiblePublicEventInput,
): PublicV3EventViewModel;
```

- [ ] Shared identity harus memuat slug, title, game, organizer/trust, status explanation, facts, CTA, dan contextual navigation.
- [ ] Authoritative readers tetap menang jika graph V3 tersedia. Compatible projection hanya menggunakan data event/registrasi/match yang benar-benar ada.
- [ ] Compatible bracket/drawing yang belum resmi harus berupa slot `TBD`; compatible awards/certificate hanya muncul bila sudah dipublikasikan.
- [ ] Pastikan legacy aliases statistik hanya dibaca sesuai kontrak sebelumnya dan tidak mengubah `blocks`/`tackles` menjadi defense.
- [ ] Jalankan test gagal terlebih dahulu, implementasikan boundary, lalu jalankan:

```powershell
pnpm exec vitest run src/lib/events/public-v3-read.test.ts src/lib/events/public-registration.test.ts src/lib/events/public-drawing.test.ts src/lib/events/public-ongoing.test.ts src/lib/events/public-finished.test.ts
```

Expected: semua test hijau, tanpa fixture/demo fallback.

- [ ] Commit:

```powershell
git add src/lib/events/public-v3-types.ts src/lib/events/public-v3-read.ts src/lib/events/public-v3-read.test.ts src/lib/events/public-registration.ts src/lib/events/public-drawing.ts src/lib/events/public-ongoing.ts src/lib/events/public-finished.ts
git commit -m "feat(public): normalize v3 event lifecycle data"
```

## Task 3: Jadikan seed E2E representatif untuk event V3

**Files:**
- Modify: `prisma/seed.ts`
- Create: `tests/e2e/public-v3-seeded-events.spec.ts`

- [ ] Tulis E2E yang membuka `flashpeak-rising-64` dengan flag V3 dan mengharapkan marker `data-public-v3-event`, `data-public-source="authoritative"`, serta tidak menemukan `.public-visual-v2`.
- [ ] Jalankan test dan verifikasi gagal karena event seed belum memiliki graph kompetisi V3.
- [ ] Perluas seed melalui competition operations resmi: buat phase, publish drawing, publish schedule, dan set state match hidup untuk `flashpeak-rising-64`.
- [ ] Gunakan namespace/id deterministik yang aman diulang; jangan menulis langsung state turunan yang seharusnya dibentuk operation layer.
- [ ] Tambahkan fixture minimal untuk fase registration, drawing, ongoing, dan finished agar route lifecycle bisa dites dari database nyata.
- [ ] Jalankan:

```powershell
pnpm test:e2e:prepare
pnpm exec playwright test tests/e2e/public-v3-seeded-events.spec.ts --project=chromium
```

Expected: semua seeded event memakai V3; tidak ada legacy renderer saat flag aktif.

- [ ] Commit:

```powershell
git add prisma/seed.ts tests/e2e/public-v3-seeded-events.spec.ts
git commit -m "test(public): seed authoritative v3 event lifecycle"
```

## Task 4: Port visual system mockup final ke komponen produksi

**Files:**
- Create: `src/styles/miracle-public-v3.css`
- Modify: `src/app/globals.css`
- Create: `src/components/v3/public-discovery/PublicV3Frame.tsx`
- Create: `src/components/v3/public-discovery/EventPosterStage.tsx`
- Create: `src/components/v3/public-discovery/PublicV3Primitives.tsx`
- Create: `src/components/v3/public-discovery/PublicV3Primitives.test.tsx`

- [ ] Inventaris token, tipografi, grid, border, pattern, CTA, tab, card, table, bracket, dan responsive rules dari CSS mockup. Salin nilai yang relevan, bukan struktur demo atau data statisnya.
- [ ] Scope seluruh style produksi di bawah `.miracle-public-v3` dengan nama `.mpv3-*` agar halaman admin/legacy tidak berubah.
- [ ] Buat `PublicV3Frame` dengan content width 1220px, shell/header yang konsisten, dan landmark semantik.
- [ ] Buat primitives untuk eyebrow, status badge, CTA, fact strip, section heading, count, tab/filter, empty state, dan compact event identity.
- [ ] Buat `EventPosterStage` dengan urutan sumber asset: poster event valid, asset karakter Flashpeak lokal, lalu branded typographic fallback.
- [ ] Tulis component test untuk prioritas poster, alt text, CTA keyboard focus, dan truthful fallback.
- [ ] Hilangkan layout fact strip yang memakai absolute positioning; gunakan grid/flex flow sehingga CTA dan facts tidak overlap.
- [ ] Jalankan:

```powershell
pnpm exec vitest run src/components/v3/public-discovery/PublicV3Primitives.test.tsx
pnpm lint
```

Expected: component tests dan lint hijau.

- [ ] Commit:

```powershell
git add src/styles/miracle-public-v3.css src/app/globals.css src/components/v3/public-discovery/PublicV3Frame.tsx src/components/v3/public-discovery/EventPosterStage.tsx src/components/v3/public-discovery/PublicV3Primitives.tsx src/components/v3/public-discovery/PublicV3Primitives.test.tsx
git commit -m "feat(public): port final v3 visual system"
```

## Task 5: Bangun ulang Homepage sesuai mockup final

**Files:**
- Modify: `src/app/home-page-content.tsx`
- Modify: `src/components/v3/public-discovery/PublicDiscoveryV3.tsx`
- Create: `src/components/v3/public-discovery/FeaturedEventHero.tsx`
- Create: `src/components/v3/public-discovery/EventPulse.tsx`
- Create: `src/components/v3/public-discovery/PublicDiscoveryShortcuts.tsx`
- Create: `src/components/v3/public-discovery/HomePublicV3.test.tsx`

- [ ] Tulis test struktur Homepage untuk urutan: featured hero, live/phase highlight, Event Pulse, lima shortcut, event lain, dan arsip selesai.
- [ ] Ubah `HomePageContent` agar setelah pemilihan featured event deterministik ia membaca detail normalized melalui `readPublicV3Event`.
- [ ] Implementasikan hero dua kolom mockup: informasi status/pertandingan dan CTA di kiri, poster stage kuat di kanan, facts berada di flow bawah.
- [ ] Untuk ongoing tampilkan skor resmi/live match jika tersedia; untuk drawing/registration/finished tampilkan aksi fase yang relevan tanpa mengarang pertandingan.
- [ ] Tambahkan shortcut Overview, Peserta, Jadwal, Bracket, dan Leaderboard pada hero/navigation sesuai relevansi format.
- [ ] Event Pulse menampilkan pertandingan hidup, next match, atau status fase paling penting. Empty/error state harus jujur dan log server-side.
- [ ] Event lain tetap tampak sebagai kategori Berlangsung, Akan Datang/Registrasi, dan Selesai, dengan CTA menuju `/[locale]/events`.
- [ ] Pastikan ID/EN tidak memakai copy hard-coded yang salah locale.
- [ ] Jalankan:

```powershell
pnpm exec vitest run src/components/v3/public-discovery/HomePublicV3.test.tsx
pnpm exec playwright test tests/e2e/v3-public-discovery.spec.ts --project=chromium
```

Expected: homepage V3 terisi dari database, hierarchy sesuai mockup, dan tidak overlap.

- [ ] Commit:

```powershell
git add src/app/home-page-content.tsx src/components/v3/public-discovery/PublicDiscoveryV3.tsx src/components/v3/public-discovery/FeaturedEventHero.tsx src/components/v3/public-discovery/EventPulse.tsx src/components/v3/public-discovery/PublicDiscoveryShortcuts.tsx src/components/v3/public-discovery/HomePublicV3.test.tsx
git commit -m "feat(public): ship final v3 homepage composition"
```

## Task 6: Bangun ulang Event Center sesuai mockup final

**Files:**
- Modify: `src/app/[locale]/events/page.tsx`
- Create: `src/components/v3/public-discovery/EventDirectory.tsx`
- Create: `src/components/v3/public-discovery/EventDirectoryCard.tsx`
- Create: `src/components/v3/public-discovery/EventDirectory.test.tsx`
- Modify: `src/lib/events/public-discovery-read.ts`
- Modify: `src/lib/events/public-discovery-read.test.ts`

- [ ] Tulis test URL filter untuk game/status, status counts, selected state, empty state, dan ordering deterministik.
- [ ] Render editorial heading dan count strip seperti mockup, bukan daftar dashboard generik.
- [ ] Gunakan card grid dengan poster/brand field, status/game eyebrow, tanggal, kapasitas, format, dan CTA; jangan gunakan full-width row sebagai layout utama.
- [ ] Kelompokkan primary/ongoing, upcoming/registration/drawing, dan finished archive. Semua kelompok harus mudah dipindai tanpa menyembunyikan event lain.
- [ ] Pertahankan query URL untuk filter sehingga back/forward dan link share berfungsi.
- [ ] Pastikan database lambat/gagal menghasilkan error state yang jujur, bukan event demo.
- [ ] Jalankan:

```powershell
pnpm exec vitest run src/components/v3/public-discovery/EventDirectory.test.tsx src/lib/events/public-discovery-read.test.ts
pnpm exec playwright test tests/e2e/v3-public-discovery.spec.ts --project=chromium
```

Expected: Event Center berbentuk grid editorial, filter dan counts benar, no demo fallback.

- [ ] Commit:

```powershell
git add src/app/[locale]/events/page.tsx src/components/v3/public-discovery/EventDirectory.tsx src/components/v3/public-discovery/EventDirectoryCard.tsx src/components/v3/public-discovery/EventDirectory.test.tsx src/lib/events/public-discovery-read.ts src/lib/events/public-discovery-read.test.ts
git commit -m "feat(public): ship final v3 event center"
```

## Task 7: Satukan adaptive event overview untuk semua event dan fase

**Files:**
- Modify: `src/app/[locale]/events/[slug]/page.tsx`
- Create: `src/components/v3/public-event/PublicV3EventPage.tsx`
- Create: `src/components/v3/public-event/PublicV3EventHero.tsx`
- Create: `src/components/v3/public-event/PublicV3EventNavigation.tsx`
- Create: `src/components/v3/public-event/lifecycle/RegistrationOverview.tsx`
- Create: `src/components/v3/public-event/lifecycle/DrawingOverview.tsx`
- Create: `src/components/v3/public-event/lifecycle/OngoingOverview.tsx`
- Create: `src/components/v3/public-event/lifecycle/FinishedOverview.tsx`
- Create: `src/components/v3/public-event/PublicV3EventPage.test.tsx`
- Modify: `tests/e2e/v3-public-event-lifecycle.spec.ts`
- Modify: `tests/e2e/v3-adaptive-public-registration.spec.ts`

- [ ] Tulis route/component tests yang membuktikan flag-on selalu memakai `PublicV3EventPage` untuk authoritative dan compatible event; legacy renderer hanya boleh muncul saat flag-off.
- [ ] Hero mengikuti mockup: fase/status jelas, identitas besar, organizer trust, CTA fase, facts, dan poster/visual field.
- [ ] Navigation konsisten: Overview, Peserta, Jadwal, Bracket, Leaderboard; sembunyikan link yang tidak relevan untuk format/fase, bukan membuat data palsu.
- [ ] Registration menampilkan deadline, kapasitas, biaya, roster, peserta diterima, agenda, serta template bracket seluruhnya TBD.
- [ ] Drawing menampilkan drawing resmi yang dipublikasikan, future slot TBD, dan schedule hanya bila dipublikasikan.
- [ ] Ongoing memakai read model Match Day yang ada untuk live match, next match, schedule change, hasil resmi, bracket/standings, dan statistik published.
- [ ] Finished menampilkan champion, podium, final journey, final bracket/standings, MVP Tournament, Top Scorer, Top Defender, Top Assist, serta tautan certificate yang benar-benar published.
- [ ] Group + Playoffs memadukan standings grup dan playoff bracket; League tidak mengarang Grand Final.
- [ ] Jalankan:

```powershell
pnpm exec vitest run src/components/v3/public-event/PublicV3EventPage.test.tsx
pnpm exec playwright test tests/e2e/v3-public-event-lifecycle.spec.ts tests/e2e/v3-adaptive-public-registration.spec.ts tests/e2e/public-v3-seeded-events.spec.ts --project=chromium
```

Expected: empat fase dan event lama tampil di shell V3; lifecycle content sesuai publication state.

- [ ] Commit:

```powershell
git add src/app/[locale]/events/[slug]/page.tsx src/components/v3/public-event tests/e2e/v3-public-event-lifecycle.spec.ts tests/e2e/v3-adaptive-public-registration.spec.ts
git commit -m "feat(public): unify adaptive v3 event experience"
```

## Task 8: Terapkan visual final pada seluruh detail routes

**Files:**
- Create: `src/components/v3/public-event/PublicV3DetailShell.tsx`
- Modify: `src/app/[locale]/events/[slug]/participants/page.tsx`
- Modify: `src/app/[locale]/events/[slug]/schedule/page.tsx`
- Modify: `src/app/[locale]/events/[slug]/bracket/page.tsx`
- Modify: `src/app/[locale]/events/[slug]/leaderboards/page.tsx`
- Create: `src/components/v3/public-event/PublicV3DetailShell.test.tsx`
- Modify: relevant existing component tests under `src/components/v3/`

- [ ] Tulis tests bahwa semua detail route memakai compact event identity, phase-aware nav yang sama, dan tidak merender legacy shell ketika flag aktif.
- [ ] Participants: search team/roster, status filter, pagination, dan roster dialog dalam card/table styling mockup.
- [ ] Schedule: fixture/result cards, round filter, waktu WIB, status publikasi, dan link detail match.
- [ ] Bracket: format-aware tree/standings, registration template TBD, published drawing, serta horizontal canvas yang bounded pada mobile tanpa document overflow.
- [ ] Leaderboards: search/team/position filter dan sortable `game | score | goal | assist | passing | defense`; header toggle ascending/descending, tie-break nickname A-Z, default score desc lalu game desc lalu nickname.
- [ ] Game dihitung dari score numerik valid; score rata-rata ditampilkan satu desimal. Captain submission tetap tidak masuk sebelum approval.
- [ ] Awards/certificate tidak berubah otomatis dari leaderboard; organizer tetap pemilih MVP.
- [ ] Jalankan focused unit tests dan lifecycle E2E:

```powershell
pnpm exec vitest run src/components/v3/public-event/PublicV3DetailShell.test.tsx
pnpm exec playwright test tests/e2e/v3-public-event-lifecycle.spec.ts --project=chromium
```

Expected: semua route konsisten secara visual dan behavior, termasuk sorting enam parameter.

- [ ] Commit:

```powershell
git add src/components/v3/public-event/PublicV3DetailShell.tsx src/components/v3/public-event/PublicV3DetailShell.test.tsx src/app/[locale]/events/[slug]/participants/page.tsx src/app/[locale]/events/[slug]/schedule/page.tsx src/app/[locale]/events/[slug]/bracket/page.tsx src/app/[locale]/events/[slug]/leaderboards/page.tsx
git commit -m "feat(public): align event detail routes with final v3"
```

## Task 9: Tambahkan visual regression dan geometry gates

**Files:**
- Create: `tests/e2e/v3-public-visual.spec.ts`
- Create: `tests/e2e/v3-public-visual.spec.ts-snapshots/`
- Modify: `playwright.config.ts`
- Modify: `scripts/e2e-ci.mjs`

- [ ] Tambahkan screenshot assertions untuk tujuh pengalaman: Homepage, Event Center, registration, drawing, ongoing, finished, serta satu detail route representatif.
- [ ] Ambil baseline pada viewport 360, 390, 768, 1024, dan 1440; total minimum 35 gambar yang direview terhadap mockup final.
- [ ] Nonaktifkan/normalisasi animasi, waktu, dan data volatile agar screenshot deterministik; jangan menyembunyikan konten produk untuk meloloskan diff.
- [ ] Tambahkan geometry assertions: `scrollWidth <= clientWidth`, fact strip tidak overlap CTA, hero tidak memotong nav, bracket hanya overflow di canvas internal.
- [ ] Tambahkan keyboard traversal, visible focus, reduced motion, dan ID/EN smoke ke suite yang sama atau lifecycle suite.
- [ ] Masukkan visual profile ke `scripts/e2e-ci.mjs` sehingga CI menguji baseline Linux yang disimpan.
- [ ] Generate baseline sekali, inspeksi manual, lalu jalankan ulang tanpa update snapshots:

```powershell
pnpm exec playwright test tests/e2e/v3-public-visual.spec.ts --project=chromium --update-snapshots
pnpm exec playwright test tests/e2e/v3-public-visual.spec.ts --project=chromium --fail-on-flaky-tests
```

Expected: 35+ snapshot assertions dan geometry/accessibility checks hijau tanpa retry.

- [ ] Commit hanya baseline yang direview dan test/config; jangan commit report sementara:

```powershell
git add tests/e2e/v3-public-visual.spec.ts tests/e2e/v3-public-visual.spec.ts-snapshots playwright.config.ts scripts/e2e-ci.mjs
git commit -m "test(public): lock final v3 visual parity"
```

## Task 10: Jalankan seluruh release gates, CI, preview, dan finalisasi laporan

**Files:**
- Modify: `2026-09-14-release-1.0-verification.md`

- [ ] Pastikan working tree hanya berisi perubahan yang dimaksud dan jalankan gate berikut berurutan, catat durasi/count setiap command:

```powershell
pnpm install --frozen-lockfile
pnpm exec prisma validate
pnpm lint
pnpm exec eslint . --quiet
pnpm test
pnpm test:e2e:smoke
pnpm test:pressure:smoke
pnpm test:e2e:preflight
pnpm test:e2e:prepare
pnpm test:e2e:ci
pnpm audit --audit-level moderate
pnpm build
git diff --check
```

Expected: semuanya exit 0 dan `test:e2e:ci` tidak memiliki flaky retry. Jika satu gate merah, release tetap BLOCKED.

- [ ] Review migration Completion/Match Day, urutan deploy, constraint/index, dan jalankan `prisma migrate status` hanya pada Delicate/preview; jangan menjalankan migration production.
- [ ] Verifikasi preflight menolak production Neon host dan reset/seed hanya memakai `.env.test`.
- [ ] Periksa keberadaan CI secrets tanpa mencetak nilainya; pastikan `JWT_SECRET` production bukan placeholder dan koneksi production/preview tidak tertukar.
- [ ] Ambil row count production secara read-only untuk Event, Match, registration, PlayerStat, dan certificate tanpa menyimpan data pribadi.
- [ ] Catat nilai dan owner rollback untuk `public_discovery_v3` serta `public_visual_v2`; rollback UI dilakukan dengan flag, bukan membalik migration.
- [ ] Jalankan review diff terakhir untuk correctness, security, responsive layout, publication rules, dan compatibility. Perbaiki temuan, lalu ulangi gate terdampak.
- [ ] Push branch secara normal tanpa force:

```powershell
git push origin feature/ui/release/1.0
```

- [ ] Tunggu GitHub Actions run yang berasal dari commit final. Rerun hanya setelah perubahan kode atau bukti kegagalan infrastruktur.
- [ ] Verifikasi preview non-production: organizer Match Day, completion/certificate, Homepage, Event Center, empat fase event, participants, schedule, bracket, leaderboard, serta performance smoke. Hasil skipped bukan lulus.
- [ ] Perbarui `2026-09-14-release-1.0-verification.md` dengan commit final, merge map, setiap test beserta durasi/count, CI URL, migration/flag status, checklist pre-deployment, dan keputusan `READY` atau `BLOCKED`.
- [ ] Commit dan push laporan final hanya setelah statusnya faktual:

```powershell
git add 2026-09-14-release-1.0-verification.md
git commit -m "docs(release): finalize release 1.0 verification"
git push origin feature/ui/release/1.0
```

Expected final state: branch bersih, seluruh gate lokal dan CI hijau tanpa flaky, preview non-production terverifikasi, laporan menyatakan `READY`. Production deployment dan aktivasi flag tetap di luar scope.

## Definition of Done

- [ ] Homepage production secara visual dan hierarki setara mockup final, bukan interpretasi generik.
- [ ] Event lain terlihat jelas di Homepage dan Event Center.
- [ ] Semua event memakai presentation V3 saat flag aktif, termasuk data lama melalui compatible projection.
- [ ] Registration, drawing, ongoing, finished, participants, schedule, bracket, dan leaderboard memenuhi kontrak data/publikasi.
- [ ] Sorting leaderboard mencakup game, score, goal, assist, passing, dan defense.
- [ ] Lima viewport tidak memiliki document overflow atau overlap.
- [ ] Unit, regression, pressure, E2E, visual regression, build, audit, CI, dan preview semuanya hijau tanpa flaky.
- [ ] Laporan release tersimpan dan keputusan kesiapan tidak melebih-lebihkan bukti.
