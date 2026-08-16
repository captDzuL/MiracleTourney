# Miracle League Developer README

Panduan ini untuk developer yang melanjutkan branch `codex/miracle-mvp`. README publik tetap fokus ke pengguna produk; file ini berisi setup, arsitektur, role, data demo, dan checklist teknis.

---

## Stack

- Next.js 15 App Router
- React 19
- TypeScript
- Tailwind CSS 4
- Prisma 6
- Neon Postgres
- Vercel Blob untuk upload permanen di production
- Vitest untuk unit/regression test
- Playwright untuk E2E dan smoke test

---

## Setup Lokal

1. Install dependency:

```bash
pnpm install
```

2. Copy environment:

```bash
cp .env.example .env
```

3. Isi minimal env berikut:

```bash
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...
JWT_SECRET=...
```

4. Jalankan migrasi ke database target:

```bash
pnpm prisma migrate deploy
```

5. Seed demo data:

```bash
pnpm db:seed
```

6. Jalankan app:

```bash
pnpm dev
```

Jika Windows menahan file Prisma saat `pnpm dev` atau `pnpm install`, hentikan proses `node`/Next.js yang masih berjalan, lalu jalankan ulang. Error yang biasa muncul adalah `EPERM: operation not permitted, rename ... .prisma/client`.

---

## Environment

Wajib:

| Variable | Fungsi |
| --- | --- |
| `DATABASE_URL` | Pooler URL Neon untuk runtime Prisma |
| `DIRECT_URL` | Direct URL Neon untuk Prisma CLI/migration |
| `JWT_SECRET` | Secret untuk signing session JWT |

Opsional tapi disarankan:

| Variable | Fungsi |
| --- | --- |
| `BLOB_READ_WRITE_TOKEN` | Menyimpan upload logo, background, team logo, dan sertifikat ke Vercel Blob |
| `SEED_ADMIN_PASSWORD` | Override password seed platform admin |
| `SEED_CAPTAIN_PASSWORD` | Override password seed captain |
| `SEED_ORGANIZER_PASSWORD` | Override password seed organizer |

Default seed password saat env kosong adalah `Miracle2026!`.

---

## Seeded Users

Seed membuat user demo berikut:

| Role | Email | Keterangan |
| --- | --- | --- |
| `platform_admin` | `admin@miraclefc.gg` | Akses penuh semua event dan organizer |
| `captain` | `captain@miraclefc.gg` | Captain demo |
| `organizer` | `organizer-a@miraclefc.gg` | Flashpeak Organizer |
| `organizer` | `organizer-b@miraclefc.gg` | Mobile Legends Organizer |

Organizer demo punya masing-masing dua event:

- Flashpeak: satu event finished 32 cap dan satu event ongoing 64 cap.
- Mobile Legends: satu event finished 16 cap dan satu event ongoing 32 cap.

Finished demo event sudah berisi peserta, match result, leaderboard, dan champion certificate proof.

---

## Role Model dan Ownership

Role aktif:

- `platform_admin`: bisa melihat dan mengubah semua event.
- `organizer`: hanya bisa melihat dan mengubah event dengan `Event.organizerUserId` miliknya.
- `captain`: mengelola tim/roster dan submit statistik untuk timnya.
- `admin`: legacy compatibility, diperlakukan seperti platform admin di beberapa guard.

Ownership utama ada di `Event.organizerUserId`, dengan metadata publik:

- `Event.organizerName`
- `Event.organizerVerified`

Semua action organizer/admin harus melewati guard server-side. Jangan mengandalkan UI hiding saja.

Guard utama:

- `assertUserCanManageEvent(user, eventId)` di `src/lib/platform/repository.ts`
- `requireAdminSession()` di `src/lib/actions.ts`
- `updateTeamLogo(user, teamId, logoUrl)` untuk memastikan team logo hanya bisa diubah pemilik event atau platform admin

---

## Area Produk

### Public Arena

File utama:

- `src/app/home-page-content.tsx`
- `src/app/events/page.tsx`
- `src/app/events/[slug]/event-detail-page.tsx`
- `src/app/events/[slug]/bracket/bracket-page-content.tsx`
- `src/app/events/[slug]/participants/participants-page.tsx`
- `src/app/events/[slug]/standings/standings-page.tsx`
- `src/app/events/[slug]/leaderboards/leaderboards-page.tsx`

Public UI membaca:

- `Event.logoUrl`
- `Event.gameImageUrl`
- default game background dari `src/lib/platform/config.ts`
- `Event.prizePoolLabel`
- `Event.registrationFeeLabel`
- `Event.registrationUrl`
- organizer metadata
- team logo dari `Team.logoUrl`

### Organizer Dashboard

File utama:

- `src/app/admin/page.tsx`
- `src/app/admin/admin-flow.ts`
- `src/components/dashboard-loading.tsx`
- loading route files di `src/app/**/loading.tsx`

Fase dashboard:

- Prepare: create event, status, stream, public listing settings, brand assets.
- Import: CSV import, imported team view, captain credentials.
- Run: match day, BO config, result input.
- Review: stat approval/rejection, certificate settings.

### Captain Dashboard

File utama:

- `src/app/captain/page.tsx`
- `src/app/captain/stats/page.tsx`
- `src/app/captain/settings/page.tsx`

Captain bisa:

- melihat event/tim terkait,
- mengelola roster,
- submit statistik match,
- mengganti password.

---

## Branding dan Upload

Event branding:

- `Event.logoUrl`: logo event.
- `Event.gameImageUrl`: background event.
- default background per game: `src/lib/platform/config.ts`.

Team branding:

- `Team.logoUrl`: logo tim.
- fallback UI: initials dari `Team.logoText`.

Upload handler ada di `src/lib/actions.ts`:

- `adminUploadEventLogoAction`
- `adminUploadEventBackgroundAction`
- `adminUploadTeamLogoAction`
- `adminUploadCharacterArtAction`

Jika `BLOB_READ_WRITE_TOKEN` ada, upload masuk ke Vercel Blob. Jika tidak ada, upload jatuh ke local public folder untuk development.

---

## Database dan Migration

Migration penting:

- `20260812150000_baseline`: baseline schema sebelum multi-organizer.
- `20260812160000_multi_organizer`: event ownership dan migrasi `admin` lama ke `platform_admin`.
- `20260814171500_add_team_logo_url`: field `Team.logoUrl`.

Perintah umum:

```bash
pnpm prisma migrate deploy
pnpm prisma generate
pnpm db:seed
```

Untuk production/Vercel, pastikan migration sudah jalan sebelum deploy app yang membaca field baru.

---

## Testing

Unit dan regression:

```bash
pnpm test
```

Type-check:

```bash
pnpm lint
```

Production build:

```bash
pnpm build
```

E2E:

```bash
pnpm test:e2e
pnpm test:e2e:smoke
```

Dashboard performance smoke:

```bash
pnpm test:dashboard:perf
```

Pre-pitch checklist:

- `docs/testing/pre-pitch-verification.md`

---

## Test Coverage yang Wajib Dijaga

Saat mengubah organizer/admin flow, minimal jaga area berikut:

- Organizer tidak melihat event organizer lain.
- Organizer tidak bisa direct POST action untuk event organizer lain.
- Platform admin tetap bisa mengelola semua event.
- Platform admin bisa membuat draft event untuk organizer tertentu.
- Event baru dari organizer otomatis punya `organizerUserId`.
- Public pages tetap render tanpa login.
- Captain auth, roster, dan stat submission tetap jalan.
- Upload invalid file type/spoofed image ditolak.
- Optional public listing fields boleh kosong tanpa merusak card/detail.

Test terkait:

- `src/lib/actions.test.ts`
- `src/lib/platform/repository.test.ts`
- `src/lib/auth/session.test.ts`
- `src/app/admin/page.test.ts`
- `src/app/events/page.test.ts`
- `src/app/events/[slug]/bracket/page.test.ts`
- `tests/e2e/*.spec.ts`

---

## Branch dan Release Notes

Branch `codex/miracle-mvp` membawa paket besar:

- multi-organizer event ownership,
- public event marketplace,
- event detail hub,
- organizer dashboard phase flow,
- public listing settings,
- event/team branding upload,
- demo organizer data,
- captain stat review workflow,
- loading skeleton untuk admin/captain,
- server-side ownership hardening,
- regression tests untuk admin, organizer, captain, public pages, auth, dan route bundle boundaries.

Sebelum merge ke `main`, jalankan:

```bash
pnpm test
pnpm lint
pnpm build
```

Untuk perubahan UI, jalankan detector desain pada file yang diubah jika tersedia:

```bash
node .agents/skills/impeccable/scripts/detect.mjs --json <file>
```

---

## Known Follow-Ups

Belum termasuk di v1:

- co-organizer per event,
- permission staff granular,
- captain self-upload logo team,
- payment automation,
- payout automation,
- crop editor untuk asset upload,
- organizer payout/reporting dashboard.
