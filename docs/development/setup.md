# Setup lokal

Panduan menjalankan Miracle di komputer sendiri.

## Yang dibutuhkan

- Node 24
- pnpm 10 (CI memakai versi ini)
- PostgreSQL 18 (CI memakai versi ini). Boleh lewat Docker atau database Neon khusus development.

## Langkah

1. Pasang dependency:

```bash
pnpm install
```

2. Salin file env, lalu isi `DATABASE_URL`, `DIRECT_URL`, dan `JWT_SECRET`:

```bash
cp .env.example .env
```

3. Pasang semua migrasi ke database target:

```bash
pnpm prisma migrate deploy
```

4. Isi data awal. `db:seed:test` membuat tiga akun uji (admin, organizer, captain). `db:seed` membuat data contoh yang lebih lengkap.

```bash
pnpm db:seed:test
```

5. Jalankan aplikasi, lalu buka `http://localhost:3000`:

```bash
pnpm dev
```

## Akun hasil seed

Password awalnya `Miracle2026!`. Ganti lewat `SEED_ADMIN_PASSWORD`, `SEED_ORGANIZER_PASSWORD`, atau `SEED_CAPTAIN_PASSWORD` di `.env` sebelum seed.

| Peran | Email (`db:seed:test`) |
|---|---|
| Platform admin | `test-admin@miraclefc.gg` |
| Organizer | `test-organizer@miraclefc.gg` |
| Captain | `test-captain@miraclefc.gg` |

`pnpm db:seed` (tanpa `:test`) membuat akun lain, misalnya `admin@miraclefc.gg` dan `captain@miraclefc.gg`, lengkap dengan event contoh. Seed ini juga membuat 14 akun pemain `solo-player-01@miraclefc.gg` sampai `solo-player-14@miraclefc.gg` (password dari `SEED_PLAYER_PASSWORD`) dan event solo `flashpeak-solo-cup` (2 tim, tanpa pendaftaran awal) untuk fitur turnamen solo. Rancangan fitur: `docs/handoff/2026-10-12-solo-tournament/`, rollout: `docs/operations/solo-tournament-rollout.md`.

**Jangan jalankan seed di database produksi.**

## Sertifikat di komputer lokal

Sertifikat dibuat dengan Chromium tanpa tampilan. Kalau belum pasang Chromium lewat Playwright, arahkan ke browser yang sudah ada. Di Windows:

```powershell
$env:PLAYWRIGHT_CHANNEL="msedge"
```

## Masalah yang sering muncul

- **Windows menahan file Prisma** (`EPERM: operation not permitted, rename ... .prisma/client`) saat `pnpm dev` atau `pnpm install`. Hentikan proses `node` yang masih jalan, lalu ulangi.
- **Build gagal karena migrasi belum terpasang.** Itu hanya terjadi di build produksi Vercel. Lihat [migrasi database](../operations/v3-cutover-runbook.md).

## Menjalankan test

| Perintah | Isi |
|---|---|
| `pnpm lint` | Cek tipe (`tsc --noEmit`) |
| `pnpm exec eslint .` | Aturan kode dan aturan impor |
| `pnpm test:unit` | Test unit |
| `pnpm test:coverage` | Test unit dengan laporan coverage |
| `pnpm build` | Build produksi |
| `pnpm test:e2e:smoke` | Cek cepat halaman publik di browser, tanpa database |
| `pnpm test:e2e` | Test browser penuh, butuh database uji (lihat [e2e](../testing/v3-e2e-and-preview.md)) |

Test database (`src/lib/platform/repository.db.test.ts`) butuh Postgres sungguhan. CI menjalankannya, lokal tidak otomatis.
