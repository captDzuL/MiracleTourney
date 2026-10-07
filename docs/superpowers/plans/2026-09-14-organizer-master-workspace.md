# Miracle V3 Organizer Master Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mengubah Organizer/Admin Workspace menjadi satu pengalaman event-first yang setara dengan mockup final, lengkap dengan registrasi, impor, pembayaran, QRIS, Match Control, statistik pemain, Penyelesaian, dan Premium Certificate Studio.

**Architecture:** Satu composition flag memilih shell V3 tanpa mengubah otorisasi atau engine turnamen. Shell membaca ringkasan event yang kecil; setiap route membaca data domainnya sendiri dan memakai service/repository authoritative yang sudah ada. Admin serta organizer berbagi route operasi `/[locale]/organizer/events/[eventId]`, sedangkan server actions tetap memeriksa role, ownership, version, dan event scope pada setiap write.

**Tech Stack:** Next.js App Router, React 19, TypeScript, next-intl, Prisma/PostgreSQL, Tailwind/CSS tokens, Vitest, Playwright, ExcelJS, csv-parse, Vercel Blob, pnpm.

## Global Constraints

- [ ] Kerjakan hanya di worktree `E:\dev\MiracleTourney-gitnative\.worktrees\miracle-ui-release-1.0-full` pada branch `feature/ui/release/1.0`.
- [ ] Jangan memodifikasi atau stage file untracked `2026-09-14-release-1.0-verification.md` sampai seluruh release gate benar-benar selesai.
- [ ] Gunakan `.superpowers/brainstorm/1049-1789394661/content/organizer-master-shell-v3.html` sebagai kontrak komposisi/interaksi, ditambah mockup Match Day, result/stats, completion, dan certificate yang sudah ada di `public/`.
- [ ] Terapkan TDD: tulis test yang gagal karena behavior yang hilang, jalankan untuk membuktikan failure, implementasikan minimum, lalu jalankan kembali hingga hijau.
- [ ] Jangan meng-copy prototype sebagai monolit atau iframe; pecah menjadi komponen React yang teruji dan gunakan data authoritative.
- [ ] Jangan menduplikasi tournament engine, score writer, Completion service, atau certificate generator. Buat adapter/composition baru di atas boundary yang sudah ada.
- [ ] Semua copy UI wajib melalui `next-intl`; `/id` sepenuhnya Indonesia dan `/en` sepenuhnya Inggris.
- [ ] `organizer_master_shell_v3` default off menjadi rollback composition. Capability flags lama tetap independen.
- [ ] Jangan menjalankan migration production, deploy production, atau mengaktifkan flag production dalam implementasi ini.
- [ ] Gunakan commit kecil per task dan jangan membawa `.claude/`, report/trace Playwright sementara, screenshot preview ad-hoc, atau folder `previews`.

---

## Task 1: Kunci kontrak shell, navigasi, locale, dan rollback flag

**Files:**
- Modify: `src/lib/feature-flags.ts`
- Modify: `src/lib/feature-flags.test.ts`
- Create: `src/lib/organizer/workspace-types.ts`
- Create: `src/lib/organizer/workspace-navigation.ts`
- Create: `src/lib/organizer/workspace-navigation.test.ts`
- Modify: `messages/id.json`
- Modify: `messages/en.json`
- Create: `src/lib/i18n/organizer-workspace-parity.test.ts`

- [ ] Tambahkan test gagal bahwa `organizer_master_shell_v3` dikenal, default `false`, dan hanya aktif saat `FEATURE_FLAG_ORGANIZER_MASTER_SHELL_V3=true`.
- [ ] Definisikan kontrak shared shell:

```ts
export type OrganizerEventSection =
  | "overview" | "registration" | "participants" | "competition"
  | "schedule" | "match-control" | "completion"
  | "announcements" | "settings";

export type OrganizerWorkspaceSummary = {
  event: { id: string; title: string; game: string; format: string };
  lifecycle: "draft" | "registration" | "drawing" | "ongoing" | "finished";
  publication: "private" | "published" | "completed";
  role: "organizer" | "admin" | "platform_admin";
  capabilities: Record<OrganizerEventSection, boolean>;
  badges: Partial<Record<OrganizerEventSection, number>>;
  blockers: OrganizerWorkspaceBlocker[];
  updatedAt: string;
};
```

- [ ] Buat `buildOrganizerEventNavigation(locale, eventId, summary, pathname)` yang menghasilkan link route nyata; tidak ada hash interception di luar create/edit wizard.
- [ ] Tambahkan namespace `organizerMaster` yang lengkap dan berbentuk sama di `id.json`/`en.json`; standarkan "Kontrol Pertandingan", "Penyelesaian", dan "Studio Sertifikat Premium" pada ID.
- [ ] Tulis parity test yang membandingkan key tree ID/EN dan menolak placeholder/replacement character `�` di namespace baru.
- [ ] Jalankan failure test, implementasikan kontrak, lalu jalankan:

```powershell
pnpm exec vitest run src/lib/feature-flags.test.ts src/lib/organizer/workspace-navigation.test.ts src/lib/i18n/organizer-workspace-parity.test.ts
```

Expected: seluruh test hijau; flag tetap off tanpa env override; navigation href membawa locale dan eventId yang benar.

- [ ] Commit:

```powershell
git add src/lib/feature-flags.ts src/lib/feature-flags.test.ts src/lib/organizer messages/id.json messages/en.json src/lib/i18n/organizer-workspace-parity.test.ts
git commit -m "feat(organizer): define master workspace contract"
```

## Task 2: Bangun read model ringkas dan master shell bersama

**Files:**
- Create: `src/lib/organizer/workspace-read.ts`
- Create: `src/lib/organizer/workspace-read.test.ts`
- Create: `src/components/v3/organizer/OrganizerMasterShell.tsx`
- Create: `src/components/v3/organizer/OrganizerEventRail.tsx`
- Create: `src/components/v3/organizer/OrganizerEventHeader.tsx`
- Create: `src/components/v3/organizer/ContextualGuide.tsx`
- Create: `src/components/v3/organizer/OrganizerMasterShell.test.tsx`
- Modify: `src/app/[locale]/organizer/events/[eventId]/layout.tsx`
- Modify: `src/components/v3/EventWorkspaceShell.tsx`

- [ ] Tulis reader tests untuk organizer owner, non-owner, admin, platform admin, badges, blockers, dan event tidak ditemukan.
- [ ] Implementasikan `readOrganizerWorkspaceSummary(eventId, actor)` sebagai query kecil; jangan memuat semua match, roster, import rows, certificates, atau audit log ke layout.
- [ ] Tulis component tests untuk rail desktop, drawer mobile, current route, role label, lifecycle badge, localized update time, and disabled/hidden capability states.
- [ ] Implementasikan `OrganizerMasterShell`; pertahankan `EventWorkspaceShell` hanya sebagai flag-off rollback dan setup wrapper sampai migrasi route selesai.
- [ ] Batasi setup wizard ke `/events/new` dan `/events/[eventId]/edit`; hapus `preventDefault` yang membuat cross-route links hanya mengganti hash.
- [ ] Implementasikan guide non-modal yang dapat ditutup dan dibuka kembali. Simpan dismissal di localStorage dengan key `miracle:organizer-guide:<eventId>:<lifecycle>:v1`.
- [ ] Pastikan loading/error route mempertahankan shell context dan tidak jatuh ke halaman admin global.
- [ ] Jalankan:

```powershell
pnpm exec vitest run src/lib/organizer/workspace-read.test.ts src/components/v3/organizer/OrganizerMasterShell.test.tsx src/app/[locale]/organizer/events/[eventId]/layout.test.tsx
```

Expected: owner/admin mendapat shell yang sama; non-owner ditolak; link antar-route bernavigasi nyata; guide tidak memblokir konten.

- [ ] Commit:

```powershell
git add src/lib/organizer/workspace-read.ts src/lib/organizer/workspace-read.test.ts src/components/v3/organizer src/app/[locale]/organizer/events/[eventId]/layout.tsx src/components/v3/EventWorkspaceShell.tsx
git commit -m "feat(organizer): add shared event master shell"
```

## Task 3: Ganti Organizer Command Center dan hubungkan admin ke canonical workspace

**Files:**
- Modify: `src/app/[locale]/organizer/page.tsx`
- Modify: `src/app/[locale]/organizer/page.test.tsx`
- Create: `src/components/v3/organizer/OrganizerCommandCenter.tsx`
- Create: `src/components/v3/organizer/OrganizerEventCard.tsx`
- Modify: `src/app/[locale]/admin/page.tsx`
- Modify: `src/app/[locale]/admin/page.test.ts`
- Modify: `src/app/[locale]/organizer/events/[eventId]/overview/page.tsx`
- Modify: `src/app/[locale]/organizer/events/[eventId]/overview/page.test.tsx`

- [ ] Tulis tests bahwa CTA utama mengikuti lifecycle: draft→edit, registration/drawing→registration/competition, ongoing→match-control, finished→completion.
- [ ] Port header, event selector, counts, attention queue, and event cards dari prototype memakai Montserrat dan token Miracle V3.
- [ ] Ganti game ID mentah dengan display label authoritative dan bersihkan copy campuran/replacement character.
- [ ] Ubah link event pada admin page menuju `/${locale}/organizer/events/${eventId}/overview`; jangan membuat salinan route admin per operasi.
- [ ] Bangun Overview sebagai ringkasan event: lifecycle, readiness, peserta, jadwal berikutnya, publication, blockers, and next useful action. Jangan embed `AdminWorkspace`.
- [ ] Pastikan feature flag off mempertahankan halaman lama sebagai rollback, dan flag on tidak mengubah otorisasi.
- [ ] Jalankan:

```powershell
pnpm exec vitest run src/app/[locale]/organizer/page.test.tsx src/app/[locale]/admin/page.test.ts src/app/[locale]/organizer/events/[eventId]/overview/page.test.tsx
```

Expected: semua lifecycle menuju layar yang benar; admin dan organizer memakai event shell yang sama.

- [ ] Commit:

```powershell
git add src/app/[locale]/organizer/page.tsx src/app/[locale]/organizer/page.test.tsx src/components/v3/organizer/OrganizerCommandCenter.tsx src/components/v3/organizer/OrganizerEventCard.tsx src/app/[locale]/admin/page.tsx src/app/[locale]/admin/page.test.ts src/app/[locale]/organizer/events/[eventId]/overview
git commit -m "feat(organizer): ship event-first command center"
```

## Task 4: Tambahkan pengaturan pembayaran QRIS per event

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260914090000_add_event_payment_settings/migration.sql`
- Create: `src/lib/registration/event-payment-settings.ts`
- Create: `src/lib/registration/event-payment-settings.test.ts`
- Modify: `src/lib/registration/captain-repository.ts`
- Modify: `src/lib/registration/captain-registration.test.ts`

- [ ] Tulis schema/reader tests gagal untuk pengaturan event published, draft tersembunyi dari captain, fallback global, organizer non-owner, dan stale version.
- [ ] Tambahkan model berikut beserta back-relations Event/User dan index yang diperlukan:

```prisma
model EventPaymentSettings {
  id            String    @id @default(cuid())
  eventId       String    @unique
  event         Event     @relation(fields: [eventId], references: [id], onDelete: Cascade)
  qrisImageUrl  String?
  instructions  String?
  status        String    @default("draft")
  version       Int       @default(0)
  publishedAt   DateTime?
  updatedById   String?
  updatedBy     User?     @relation(fields: [updatedById], references: [id], onDelete: SetNull)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
}
```

- [ ] Implementasikan `getPublishedPaymentSettingsForEvent(eventId)` dengan prioritas event published lalu legacy global fallback.
- [ ] Implementasikan save-draft dan publish dengan ownership check dan CAS `version`; organizer write tidak boleh menyentuh `PaymentSettings` global.
- [ ] Tambahkan migration review test dan verifikasi SQL hanya membuat tabel/index/foreign keys baru tanpa mengubah data historis.
- [ ] Jalankan:

```powershell
pnpm exec prisma validate
pnpm exec vitest run src/lib/registration/event-payment-settings.test.ts src/lib/registration/captain-registration.test.ts src/lib/completion/schema-contract.test.ts
```

Expected: schema valid; event QRIS terisolasi; captain tidak melihat draft; global fallback masih kompatibel.

- [ ] Commit:

```powershell
git add prisma/schema.prisma prisma/migrations/20260914090000_add_event_payment_settings src/lib/registration/event-payment-settings.ts src/lib/registration/event-payment-settings.test.ts src/lib/registration/captain-repository.ts src/lib/registration/captain-registration.test.ts
git commit -m "feat(registration): scope payment settings per event"
```

## Task 5: Ekstrak action dan reader Registrasi yang event-local

**Files:**
- Create: `src/lib/registration/organizer-workspace-read.ts`
- Create: `src/lib/registration/organizer-workspace-read.test.ts`
- Create: `src/lib/actions/registration-v3-actions.ts`
- Create: `src/lib/actions/registration-v3-actions.test.ts`
- Modify: `src/lib/actions.ts`
- Modify: `src/lib/platform/repository.ts`
- Modify: `src/lib/platform/repository.test.ts`

- [ ] Tulis tests untuk queue filters/pagination, import history, payment review, event QRIS, ownership, safe localized return URL, and revalidation targets.
- [ ] Ekstrak adapter V3 dari action lama menjadi kontrak event-local:

```ts
previewEventRegistrationImportAction(formData: FormData): Promise<ActionResult>
commitEventRegistrationImportAction(formData: FormData): Promise<ActionResult>
approveEventPaymentAction(formData: FormData): Promise<ActionResult>
rejectEventPaymentAction(formData: FormData): Promise<ActionResult>
saveEventQrisDraftAction(formData: FormData): Promise<ActionResult>
publishEventQrisAction(formData: FormData): Promise<ActionResult>
```

- [ ] Setiap action wajib menerima dan memvalidasi `eventId`, memanggil `assertUserCanManageEvent`, membaca target record untuk memastikan event match, dan mengembalikan localized typed feedback tanpa redirect ke `/admin`.
- [ ] Pertahankan action lama sebagai adapter rollback; jangan membuat dua implementasi parser/import/payment.
- [ ] Gunakan pending/version precondition pada payment approval/rejection dan QRIS publication agar competing writer tidak overwrite.
- [ ] Pastikan logs tidak mencetak proof URL, QRIS blob URL, mapping row PII, atau secret.
- [ ] Jalankan:

```powershell
pnpm exec vitest run src/lib/registration/organizer-workspace-read.test.ts src/lib/actions/registration-v3-actions.test.ts src/lib/platform/repository.test.ts src/lib/actions.test.ts
```

Expected: seluruh write event-scoped, stale mutation ditolak bersih, adapter lama tetap lulus.

- [ ] Commit:

```powershell
git add src/lib/registration/organizer-workspace-read.ts src/lib/registration/organizer-workspace-read.test.ts src/lib/actions/registration-v3-actions.ts src/lib/actions/registration-v3-actions.test.ts src/lib/actions.ts src/lib/platform/repository.ts src/lib/platform/repository.test.ts
git commit -m "refactor(registration): expose event-local organizer actions"
```

## Task 6: Implementasikan Registrasi, impor XLSX/CSV, pembayaran, dan QRIS UI

**Files:**
- Modify: `src/app/[locale]/organizer/events/[eventId]/registration/page.tsx`
- Modify: `src/app/[locale]/organizer/events/[eventId]/registration/page.test.ts`
- Create: `src/app/[locale]/organizer/events/[eventId]/participants/page.tsx`
- Create: `src/app/[locale]/organizer/events/[eventId]/participants/page.test.tsx`
- Create: `src/components/v3/organizer/registration/RegistrationWorkspace.tsx`
- Create: `src/components/v3/organizer/registration/RegistrationQueuePanel.tsx`
- Create: `src/components/v3/organizer/registration/RegistrationImportPanel.tsx`
- Create: `src/components/v3/organizer/registration/PaymentReviewPanel.tsx`
- Create: `src/components/v3/organizer/registration/EventQrisPanel.tsx`
- Create: `src/components/v3/organizer/registration/registration-workspace.test.tsx`

- [ ] Tulis route tests yang membuktikan `searchParams` diteruskan dan `view=queue|import|payments|qris`, `status`, `source`, `q`, dan `page` dipertahankan.
- [ ] Hapus render `AdminWorkspace` dari route Registrasi dan render hanya focused `RegistrationWorkspace` di dalam master shell.
- [ ] Queue: tampilkan status, source, kapasitas, accepted count, search, filter, pagination, roster review, and event-local actions.
- [ ] Import: implementasikan drop zone + file input, XLSX/CSV label, 5 MB/500 row limits, mapping, preview valid/problem rows, selected commit, expired batch feedback, and history.
- [ ] Payments: implementasikan queue, proof zoom/dialog, metadata, approve, reject with required reason, saved/pending feedback, and audit label.
- [ ] QRIS: implementasikan image upload/replace, preview, instructions, draft state, explicit publish, current version, and published captain-facing status.
- [ ] Participants: buat team/roster directory focused dengan search, filter, pagination, and roster dialog; jangan tampilkan payment proof pada route publik atau participant directory.
- [ ] Jalankan:

```powershell
pnpm exec vitest run src/app/[locale]/organizer/events/[eventId]/registration/page.test.ts src/app/[locale]/organizer/events/[eventId]/participants/page.test.tsx src/components/v3/organizer/registration/registration-workspace.test.tsx src/lib/imports/registration-intake.test.ts src/lib/imports/registration-import-commit.test.ts
```

Expected: semua view bekerja lewat URL, impor dan payment mutations memakai event scope, tidak ada global AdminWorkspace.

- [ ] Commit:

```powershell
git add src/app/[locale]/organizer/events/[eventId]/registration src/app/[locale]/organizer/events/[eventId]/participants src/components/v3/organizer/registration
git commit -m "feat(organizer): complete v3 registration workspace"
```

## Task 7: Susun ulang Competition, Schedule, dan Match Control tanpa mengganti engine

**Files:**
- Modify: `src/components/v3/competition/CompetitionWorkspace.tsx`
- Modify: `src/components/v3/competition/workspace.test.tsx`
- Create: `src/components/v3/organizer/match-control/MatchControlWorkspace.tsx`
- Create: `src/components/v3/organizer/match-control/MatchQueue.tsx`
- Create: `src/components/v3/organizer/match-control/SelectedMatchPanel.tsx`
- Create: `src/components/v3/organizer/match-control/FormatContextPanel.tsx`
- Create: `src/components/v3/organizer/match-control/match-control.test.tsx`
- Modify: `src/app/[locale]/organizer/events/[eventId]/competition/page.tsx`
- Modify: `src/app/[locale]/organizer/events/[eventId]/schedule/page.tsx`
- Modify: `src/app/[locale]/organizer/events/[eventId]/match-control/page.tsx`

- [ ] Tulis tests untuk empat format, lifecycle locks, action-item badges, group/matchday filter, "needs result", selected match, and bounded lists.
- [ ] Pertahankan `competition-v3-actions.ts`, drawing/schedule operation versions, and `workspace-read.ts` sebagai authoritative boundary.
- [ ] Ubah Competition menjadi phase/drawing/standings workspace; jangan ulang semua match cards dan audit sections di setiap tab.
- [ ] Ubah Schedule menjadi fixture/time/room/publication workspace dengan round/group filters dan delayed/locked states.
- [ ] Ubah Match Control menjadi operational queue: live/next/needs-result/readiness/incident filters, selected match side panel, and route to match detail.
- [ ] Untuk Group + Playoffs tampilkan group selector, matchday, compact standings, qualification context, lalu playoff phase. Untuk League jangan tampilkan fabricated Grand Final.
- [ ] Pastikan horizontal overflow hanya di inner table/bracket canvas dan document tetap bounded.
- [ ] Jalankan:

```powershell
pnpm exec vitest run src/components/v3/competition/workspace.test.tsx src/components/v3/organizer/match-control/match-control.test.tsx src/lib/competition/workspace-page.test.tsx src/lib/competition/workspace-read.test.ts
pnpm exec playwright test tests/e2e/v3-matchday.spec.ts --project=chromium --fail-on-flaky-tests
```

Expected: format-aware UI hijau dan 10 Match Day E2E lulus tanpa flaky retry.

- [ ] Commit:

```powershell
git add src/components/v3/competition src/components/v3/organizer/match-control src/app/[locale]/organizer/events/[eventId]/competition src/app/[locale]/organizer/events/[eventId]/schedule src/app/[locale]/organizer/events/[eventId]/match-control
git commit -m "feat(organizer): compose format-aware match control"
```

## Task 8: Satukan hasil pertandingan dan statistik pemain di detail match

**Files:**
- Modify: `src/app/[locale]/organizer/events/[eventId]/matches/[matchId]/page.tsx`
- Create: `src/components/v3/organizer/matches/MatchResultStatisticsWorkspace.tsx`
- Create: `src/components/v3/organizer/matches/MatchGameScoreForm.tsx`
- Create: `src/components/v3/organizer/matches/PlayerStatisticsForm.tsx`
- Create: `src/components/v3/organizer/matches/StatSubmissionReview.tsx`
- Create: `src/components/v3/organizer/matches/match-result-statistics.test.tsx`
- Create: `src/lib/actions/player-stats-v3-actions.ts`
- Create: `src/lib/actions/player-stats-v3-actions.test.ts`
- Modify: `src/lib/player-stats/form.ts`
- Modify: `src/lib/player-stats/form.test.ts`
- Modify: `src/lib/platform/repository.ts`
- Modify: `src/lib/platform/repository.test.ts`

- [ ] Tulis tests untuk `view=result|statistics|history`, BO1/BO3/BO5 MatchGame ordering, score correction, stat input, captain pending/approve/reject, and organizer direct write.
- [ ] Reuse existing score/result actions and impact preview; do not write a second result engine.
- [ ] Render per-game score rows from MatchGame order and official aggregate result with status/version feedback.
- [ ] Render player fields `scores[]`, `goal`, `assist`, `passing`, and `defense` with the same parser and validation for captain and organizer.
- [ ] Validate score `0.0-10.0`, maximum one decimal, blank→`null`; parser score array remains separate from numeric-stat merger.
- [ ] Implement event-local player-stat action adapters and retain legacy `goals`/`assists` reader fallback without summing aliases.
- [ ] Fix review concurrency: approval/rejection transaction must update only `status="pending"`; if affected row count is zero, return conflict and refresh rather than writing `PlayerStat`.
- [ ] Add regression tests for competing reviewers, stale submission, rejection note, no partial writes, and organizer overwrite audit metadata.
- [ ] Jalankan:

```powershell
pnpm exec vitest run src/components/v3/organizer/matches/match-result-statistics.test.tsx src/lib/actions/player-stats-v3-actions.test.ts src/lib/player-stats/form.test.ts src/lib/platform/repository.test.ts src/lib/actions.test.ts
pnpm exec playwright test tests/e2e/admin-player-stats.spec.ts tests/e2e/v3-matchday.spec.ts --project=chromium --fail-on-flaky-tests
```

Expected: skor dan statistik lengkap dapat dioperasikan dari shell V3; captain data tidak published sebelum approval; no race partial write.

- [ ] Commit:

```powershell
git add src/app/[locale]/organizer/events/[eventId]/matches src/components/v3/organizer/matches src/lib/actions/player-stats-v3-actions.ts src/lib/actions/player-stats-v3-actions.test.ts src/lib/player-stats src/lib/platform/repository.ts src/lib/platform/repository.test.ts
git commit -m "feat(organizer): integrate match results and player stats"
```

## Task 9: Masukkan Completion dan Certificate Studio ke master shell

**Files:**
- Modify: `src/lib/completion/workspace.ts`
- Modify: `src/lib/completion/workspace.test.ts`
- Modify: `src/components/v3/completion/CompletionWorkspace.tsx`
- Modify: `src/components/v3/completion/completion.test.tsx`
- Modify: `src/app/[locale]/organizer/events/[eventId]/completion/page.tsx`
- Modify: `src/app/[locale]/organizer/events/[eventId]/completion/page.test.tsx`
- Modify: `src/lib/certificate/studio-repository.ts`
- Modify: `src/lib/certificate/studio-repository.test.ts`
- Modify: `src/lib/certificate/service.ts`
- Modify: `src/lib/certificate/service.test.ts`
- Modify: `src/components/v3/certificates/CertificateStudio.tsx`
- Modify: `src/components/v3/certificates/certificate-studio.test.tsx`
- Modify: `src/app/[locale]/organizer/events/[eventId]/certificates/page.tsx`

- [ ] Tulis tests bahwa Completion selalu dapat dibuka untuk melihat blockers, tetapi complete/publish actions tetap locked sampai ready.
- [ ] Ganti hard-coded `/organizer`/`legacy-match-day` href pada Completion dan certificate readers dengan locale-aware canonical event routes.
- [ ] Integrasikan readiness, podium, MVP, Top Scorer, Top Defender, Top Assist, certificate readiness, and final publication sesuai authoritative services.
- [ ] Pastikan award choice tidak berubah otomatis saat leaderboard berubah; organizer harus menyimpan keputusan eksplisit.
- [ ] Tambahkan direct shell navigation Completion→Certificate Studio→Completion dan published certificate link state.
- [ ] Port semua copy studio ke namespace locale dan pertahankan tujuh certificate types, asset placement, versioning, generation, and safe set publication.
- [ ] Jalankan:

```powershell
pnpm exec vitest run src/lib/completion/workspace.test.ts src/components/v3/completion/completion.test.tsx src/app/[locale]/organizer/events/[eventId]/completion/page.test.tsx src/lib/certificate/studio-repository.test.ts src/lib/certificate/service.test.ts src/components/v3/certificates/certificate-studio.test.tsx
pnpm exec playwright test tests/e2e/organizer-v3-completion.spec.ts tests/e2e/organizer-v3-certificates.spec.ts --project=chromium --fail-on-flaky-tests
```

Expected: Completion dan seluruh certificate flow reachable dari shell; lock/version semantics tetap lulus.

- [ ] Commit:

```powershell
git add src/lib/completion src/components/v3/completion src/app/[locale]/organizer/events/[eventId]/completion src/lib/certificate src/components/v3/certificates src/app/[locale]/organizer/events/[eventId]/certificates
git commit -m "feat(organizer): integrate completion and certificates"
```

## Task 10: Tambahkan Pengumuman, Pengaturan, dan polish Certificate Studio

**Files:**
- Create: `src/app/[locale]/organizer/events/[eventId]/announcements/page.tsx`
- Create: `src/app/[locale]/organizer/events/[eventId]/announcements/page.test.tsx`
- Create: `src/app/[locale]/organizer/events/[eventId]/settings/page.tsx`
- Create: `src/app/[locale]/organizer/events/[eventId]/settings/page.test.tsx`
- Create: `src/components/v3/organizer/OrganizerAnnouncements.tsx`
- Create: `src/components/v3/organizer/OrganizerSettings.tsx`
- Modify: `src/components/v3/certificates/CertificateStudio.tsx`
- Modify: `src/components/v3/certificates/certificate-studio.test.tsx`

- [ ] Pindahkan announcements UI yang tersebar ke route utility sendiri dengan existing authoritative actions and audit trail.
- [ ] Buat Settings sebagai pintu ke edit event, publication state, organizer contact, and safe operational preferences; jangan duplikasi wizard fields.
- [ ] Compact Certificate Studio setelah functional integration: sticky preview di desktop, recipient selector tetap terlihat, asset/placement panels collapsible, primary actions sticky/bounded, no repeated event banner.
- [ ] Tambahkan geometry test pada 1440x900 bahwa header studio, recipient selector, and primary generation action dapat dicapai tanpa nested document overflow; preview tetap usable pada 390px.
- [ ] Pastikan compaction tidak menyembunyikan readiness/error/version/publication status.
- [ ] Jalankan:

```powershell
pnpm exec vitest run src/app/[locale]/organizer/events/[eventId]/announcements/page.test.tsx src/app/[locale]/organizer/events/[eventId]/settings/page.test.tsx src/components/v3/certificates/certificate-studio.test.tsx
```

Expected: utilities berada di shell yang sama; Certificate Studio lebih pendek tanpa kehilangan kontrol atau status.

- [ ] Commit:

```powershell
git add src/app/[locale]/organizer/events/[eventId]/announcements src/app/[locale]/organizer/events/[eventId]/settings src/components/v3/organizer/OrganizerAnnouncements.tsx src/components/v3/organizer/OrganizerSettings.tsx src/components/v3/certificates/CertificateStudio.tsx src/components/v3/certificates/certificate-studio.test.tsx
git commit -m "feat(organizer): finish workspace utilities and studio layout"
```

## Task 11: Verifikasi locale, accessibility, responsive parity, dan rollback

**Files:**
- Create: `tests/e2e/v3-organizer-master-workspace.spec.ts`
- Create: `tests/e2e/v3-organizer-registration-operations.spec.ts`
- Create: `tests/e2e/v3-organizer-visual.spec.ts`
- Create: `tests/e2e/v3-organizer-visual.spec.ts-snapshots/`
- Modify: `tests/e2e/v3-organizer-lifecycle.spec.ts`
- Modify: `tests/e2e/admin-event-management.spec.ts`
- Modify: `playwright.config.ts`
- Modify: `scripts/e2e-ci.mjs`

- [ ] Seed isolated events for draft, registration, drawing, ongoing, and finished plus four competition formats; never use production DB or shared event names.
- [ ] Cover full organizer journey: login→select event→registration queue→CSV/XLSX preview/commit→payment approve/reject→QRIS publish→drawing/schedule→Match Control→score→stat review→Completion→seven certificates→publication.
- [ ] Cover admin entry into the same event workspace and organizer denial for another organizer's event.
- [ ] Cover flag on/off rollback and capability flag disabled states.
- [ ] Add ID/EN assertions over nav, headings, actions, validation, dialogs, and feedback; reject known mixed-language strings.
- [ ] Add keyboard/focus/Escape/reduced-motion tests and `aria-sort`/dialog landmark assertions.
- [ ] Capture reviewed production-route baselines at 360, 390, 768, 1024, and 1440. Assert `scrollWidth <= clientWidth`; tables/brackets may scroll only inside bounded containers.
- [ ] Do not mask volatile failures by increasing timeout. Normalize test clocks/data and wait for authoritative saved state.
- [ ] Jalankan focused E2E:

```powershell
pnpm test:e2e:prepare
pnpm exec playwright test tests/e2e/v3-organizer-master-workspace.spec.ts tests/e2e/v3-organizer-registration-operations.spec.ts tests/e2e/v3-organizer-lifecycle.spec.ts tests/e2e/admin-event-management.spec.ts tests/e2e/admin-player-stats.spec.ts tests/e2e/organizer-v3-completion.spec.ts tests/e2e/organizer-v3-certificates.spec.ts --project=chromium --fail-on-flaky-tests
pnpm exec playwright test tests/e2e/v3-organizer-visual.spec.ts --project=chromium --fail-on-flaky-tests
```

Expected: seluruh journey, locale, roles, viewport, and visual baselines hijau tanpa flaky retry.

- [ ] Commit:

```powershell
git add tests/e2e/v3-organizer-master-workspace.spec.ts tests/e2e/v3-organizer-registration-operations.spec.ts tests/e2e/v3-organizer-visual.spec.ts tests/e2e/v3-organizer-visual.spec.ts-snapshots tests/e2e/v3-organizer-lifecycle.spec.ts tests/e2e/admin-event-management.spec.ts playwright.config.ts scripts/e2e-ci.mjs
git commit -m "test(organizer): cover master workspace end to end"
```

## Task 12: Jalankan release gates dan integrasikan ke laporan Release 1.0

**Files:**
- Modify: `docs/superpowers/specs/2026-09-14-organizer-master-workspace-design.md` only if implementation reveals an approved contract correction
- Modify: `docs/superpowers/plans/2026-09-14-organizer-master-workspace.md` checkbox state only
- Modify: `2026-09-14-release-1.0-verification.md` only after collecting fresh evidence

- [ ] Review migration `EventPaymentSettings`, deploy order, constraints, indexes, fallback, and rollback owner. Run `prisma migrate status` only against Delicate/preview; do not run production migration.
- [ ] Confirm CI secrets by presence only, preview/production DB are not swapped, and E2E preflight rejects production Neon host.
- [ ] Run final local gates from a clean test DB:

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

Expected: setiap command exit 0; E2E CI profile lulus dengan `--fail-on-flaky-tests`; dashboard/performance smoke yang required tidak boleh dihitung lulus bila skipped.

- [ ] Jalankan `superpowers:requesting-code-review` untuk scope organizer dan perbaiki setiap finding P0/P1/P2 yang terkonfirmasi.
- [ ] Push normal tanpa force hanya setelah worktree bersih dan semua gate lokal hijau.
- [ ] Tunggu seluruh GitHub Actions hijau; rerun hanya setelah code fix atau bukti infra failure.
- [ ] Verifikasi preview non-production untuk organizer, admin shared shell, registration import/payment/QRIS, four competition formats, score/stats, Completion, certificates, ID/EN, mobile/desktop, and feature-flag rollback.
- [ ] Baru kemudian perbarui `2026-09-14-release-1.0-verification.md` dengan commit final, merge map, command/count/duration, CI URL, migration/flag state, preview evidence, and factual `READY` or `BLOCKED` decision.
- [ ] Commit report separately:

```powershell
git add 2026-09-14-release-1.0-verification.md docs/superpowers/plans/2026-09-14-organizer-master-workspace.md
git commit -m "docs(release): verify organizer master workspace"
```

## Plan self-review checklist

- [ ] Every approved prototype area maps to a production route, reader, action, and test.
- [ ] Registration explicitly covers XLSX/CSV import, payment proof verification, and event-scoped QRIS.
- [ ] Match detail explicitly covers score per game and player stats `scores`, `goal`, `assist`, `passing`, `defense`.
- [ ] Completion explicitly covers readiness, four individual awards, seven certificates, and publication.
- [ ] Organizer/admin share one canonical workspace while every write retains server authorization.
- [ ] ID/EN parity, non-forcing guide, responsive geometry, accessibility, feature rollback, migration safety, and CI are testable acceptance gates.
- [ ] No step depends on placeholder copy, unspecified file, or an unreviewed production mutation.
