# Rollout turnamen solo

Status: disiapkan 14 Oktober 2026, bersama PR F. Dokumen ini tidak mengubah apa pun di produksi. Semua langkah bertanda **pemilik** dikerjakan manusia.

Fitur ini hidup di balik satu flag: `solo_tournament_v1` (`FEATURE_FLAG_SOLO_TOURNAMENT_V1`, bawaan `false`). Rancangan: `docs/handoff/2026-10-12-solo-tournament/`. Tabel semua flag: `docs/operations/v3-feature-flag-matrix.md`.

## Apa yang berubah saat flag hidup atau mati

| Tempat | Flag mati | Flag hidup |
| --- | --- | --- |
| `/register` | Langsung form kapten | Dua kartu: Kapten atau Pemain |
| Wizard event organizer | Tidak ada pilihan Solo | Pilihan Tim atau Solo (hanya game yang punya aturan solo) |
| `/events/[slug]/register` untuk event solo | 404 | Form daftar solo, antrean, bayar |
| `/player/*` | 404 | Area pemain |
| Tombol di halaman event solo | Tombol mati "Pendaftaran belum tersedia" | "Daftar solo" |
| Tab Acak tim di Registrasi organizer | Tidak ada | Tutup pendaftaran, acak, tukar, kunci |
| Tim yang sudah dikunci | Tetap tim biasa | Tim biasa |
| Event tim lama | Tidak berubah | Tidak berubah |

## Urutan wajib

Build produksi di Vercel tidak menjalankan migrasi, dan menolak build kalau ada folder di `prisma/migrations` yang belum tercatat di `_prisma_migrations` produksi (`scripts/migration-ledger.mjs`). Jadi migrasi dulu, baru gabung dan deploy.

1. **Pemilik**: terapkan migrasi solo ke database produksi, berurutan. Pilih salah satu:
   - Neon SQL Editor: jalankan isi tiap `migration.sql` sesuai urutan di bawah, lalu catat di `_prisma_migrations`.
   - `pnpm exec prisma migrate deploy` dengan `DIRECT_URL` produksi (mencatat sendiri).

   | Urutan | Folder | Isi | Aman diulang |
   | --- | --- | --- | --- |
   | 1 | `20261013000000_add_solo_tournament` | Tabel `PlayerProfile`, `SoloRegistration`, `SoloDraw`, `SoloDrawAssignment`; kolom `Event.entryMode`, `Event.activeSoloDrawId`, `Player.userId` | Ya |
   | 2 | `20261014000000_solo_assignment_fk_cascade` | Kunci asing penempatan jadi `ON DELETE CASCADE` | Ya |
   | 3 | `20261015000000_solo_fk_indexes` | Tiga indeks untuk `approvedById`, `createdById`, `lockedById` | Ya |

   Semuanya tambahan saja: kode lama tetap jalan di database baru, tanpa backfill. Tiap berkas memakai `lock_timeout` 5 detik, jadi kalau ada transaksi panjang yang menahan tabel, migrasi gagal cepat dan bisa diulang.
2. Gabungkan PR C, D, E, F ke `rehearsal/solo-tournament`, lalu `rehearsal/solo-tournament` ke `main`, dengan flag **mati**. Cek build produksi lolos (gerbang ledger).
3. **Pratinjau atau staging**: nyalakan `FEATURE_FLAG_SOLO_TOURNAMENT_V1=true` (butuh deploy ulang). Jalankan satu event uji sungguhan dari daftar sampai tim terkunci. Pakai email uji, bukan email pemain asli.
4. **Produksi**: nyalakan flag, buat satu event kecil dengan satu organizer tepercaya. Awasi log, jumlah antrean, dan refund. Email "slot terbuka" memakai Resend: `RESEND_API_KEY` dan `RESEND_FROM_EMAIL` harus terisi di produksi, kalau tidak pemain naik dari antrean tanpa kabar.
5. Setelah satu event selesai bersih, flag dinyalakan umum.

## Yang perlu diawasi di event pertama

- Pemain `approved` yang tidak masuk tim: daftarnya muncul sebelum pendaftaran ditutup. Refund manual lalu tandai "sudah refund".
- Antrean: pemain antrean tidak bayar. Kalau ada yang naik, mereka dapat email dan batas bayar 24 jam.
- Jumlah tim yang jadi dibanding jumlah tim di event. Panel "Siap diacak" memperingatkan kalau kurang.
- Kapten hasil acak: mereka tidak bisa menambah atau menghapus pemain. Perubahan lewat "ajukan ganti roster".
- Ganti password sekarang mengakhiri sesi di perangkat lain (kapten, pemain, dan organizer).

## Rollback

Matikan flag dan deploy ulang. Tidak ada migrasi balik, tabel baru dibiarkan. Tim yang sudah dikunci tetap tim biasa. Event solo yang sudah dibuat tetap ada, tombol daftarnya mati. Pemain tetap bisa masuk, tetapi `/player` tidak bisa dibuka sampai flag hidup lagi.

## Pengujian

| Perintah | Mencakup |
| --- | --- |
| `pnpm test` | Tes unit. Tes database nyata jalan kalau `SOLO_TEST_DATABASE_URL` diisi (harus localhost, semua migrasi sudah diterapkan) |
| `pnpm test:e2e:prepare` lalu `pnpm exec playwright test tests/e2e/solo-tournament.spec.ts` | Jalur utama solo, dari akun baru sampai tim terkunci, kapten hasil acak, kompetisi, lima lebar layar |
| `pnpm exec playwright test --config playwright.legacy.config.ts tests/e2e-legacy/solo-flag-off.spec.ts` | Flag mati: tidak ada pilihan Pemain, halaman solo dan `/player` 404 |
| `pnpm test:e2e:ci` | Semua profil, termasuk dua di atas |

Seed E2E (`pnpm db:seed`) membuat event `flashpeak-solo-cup` (2 tim: 2 kiper dan 8 pemain lapangan, Rp25.000, QRIS terbit) dan 14 akun `solo-player-01@miraclefc.gg` sampai `solo-player-14@miraclefc.gg`. Password dari `SEED_PLAYER_PASSWORD`. Seed ini hanya untuk database lokal dan database uji.
