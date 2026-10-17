# Variabel environment

Sumber kebenarannya adalah [`.env.example`](../../.env.example). Tabel ini merangkum fungsinya. Jangan menaruh nilai rahasia di repo.

## Wajib

| Variabel | Fungsi |
|---|---|
| `DATABASE_URL` | Alamat database untuk aplikasi (di Neon: alamat pooler). |
| `DIRECT_URL` | Alamat langsung ke database, dipakai Prisma untuk migrasi. |
| `JWT_SECRET` | Kunci untuk menandatangani sesi login. |

## Alamat situs

| Variabel | Fungsi |
|---|---|
| `NEXT_PUBLIC_BASE_URL` | Alamat utama situs untuk metadata, `sitemap.xml`, `robots.txt`, dan sertifikat. Isi dengan domain produksi. |
| `NEXT_PUBLIC_APP_URL` | Alamat dasar untuk tautan di email reset password. Samakan dengan `NEXT_PUBLIC_BASE_URL`. |

## Email reset password

| Variabel | Fungsi |
|---|---|
| `FEATURE_FLAG_EMAIL_PASSWORD_RESET` | `true` mengirim email lewat Resend. Biarkan `false` di Preview Vercel, karena Preview memakai nama variabel Resend yang sama dengan produksi. |
| `RESEND_API_KEY` | Kunci dari resend.com. Tanpa kunci, email hanya dicatat di log. |
| `RESEND_FROM_EMAIL` | Alamat pengirim. Pakai domain yang sudah diverifikasi di Resend. |

## Sertifikat

| Variabel | Fungsi |
|---|---|
| `PLAYWRIGHT_CHANNEL` | Lokal saja: pakai browser yang sudah terpasang (misalnya `msedge`). |
| `CHROMIUM_PACK_URL` | Vercel: alamat paket Chromium. Versinya harus sama dengan `@sparticuz/chromium-min` di `package.json`. Memori fungsi Vercel minimal 1769 MB. |
| `BLOB_READ_WRITE_TOKEN` | Kalau ada, unggahan dan sertifikat masuk ke Vercel Blob. Kalau kosong, file ditulis ke folder `public/` (hanya untuk lokal). |

## Seed

| Variabel | Fungsi |
|---|---|
| `SEED_ADMIN_PASSWORD` | Password akun admin hasil seed. |
| `SEED_ORGANIZER_PASSWORD` | Password akun organizer hasil seed. |
| `SEED_CAPTAIN_PASSWORD` | Password akun captain hasil seed. |
| `SEED_PLAYER_PASSWORD` | Password 14 akun pemain solo hasil seed (`solo-player-NN@miraclefc.gg`). |

Kalau kosong, semuanya memakai `Miracle2026!`.

## Test browser

| Variabel | Fungsi |
|---|---|
| `NEON_PROD_HOST` | Nama host produksi. Dipakai sebagai daftar tolak supaya test tidak menyentuh produksi. |
| `E2E_DATABASE_RESET_ALLOWED` | `true` hanya saat Anda sengaja mereset database uji. |

## Tautan footer (opsional)

`NEXT_PUBLIC_MIRACLE_INSTAGRAM_URL`, `NEXT_PUBLIC_MIRACLE_DISCORD_URL`, `NEXT_PUBLIC_MIRACLE_WHATSAPP_URL`.

## Flag fitur

Flag dibaca dari `FEATURE_FLAG_<NAMA>` (huruf besar) dan hanya aktif kalau nilainya persis `true`. Daftar lengkap, nilai di produksi, dan artinya ada di [matriks flag](../operations/v3-feature-flag-matrix.md).

| Flag | Fungsi singkat |
|---|---|
| `UI_V3_FOUNDATION` | Tampilan V3 untuk halaman publik dan panel. |
| `PUBLIC_DISCOVERY_V3` | Beranda dan daftar event V3. |
| `ADAPTIVE_PUBLIC_EVENT_V3` | Halaman event V3 yang berubah menurut fase. |
| `ORGANIZER_MASTER_SHELL_V3` | Kerangka panel organizer V3. |
| `ORGANIZER_WORKSPACE_V3` | Ruang kerja organizer V3. |
| `REGISTRATION_WORKSPACE_V3` | Pendaftaran dan peserta V3. |
| `COMPETITION_OPERATIONS_V3` | Jalannya pertandingan V3. |
| `COMPLETION_WORKSPACE_V3` | Penutupan turnamen dan sertifikat V3. |
| `PUBLIC_VISUAL_V2` | Tampilan publik V2 (jalur mundur). |
| `EMAIL_PASSWORD_RESET` | Kirim email reset password. |

Di produksi delapan flag V3 sudah `true`. Kalau mati semuanya, aplikasi menampilkan tampilan lama.
