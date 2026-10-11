# Keputusan: cadangan data demo (PR 0.5)

Dokumen ini hanya keputusan. Kode belum diubah. Perubahan kodenya ada di PR 0.6.

## Ringkasan

Kalau database error, `repository.ts` diam-diam memakai data demo di 21 tempat. Beranda juga begitu: setelah 2 detik tanpa jawaban, beranda menampilkan event demo.

Cadangan ini bukan mode yang dipilih. Ini `try/catch` yang menelan semua error, tanpa log.

Keputusan: hapus semua cadangan data demo dari kode produksi. Error database diteruskan, dan pengunjung melihat halaman error yang ramah. Beranda menampilkan daftar kosong.

## Kenapa dihapus

1. **Pengunjung bisa melihat event palsu.** Data demo berisi event seperti "Flashpeak Champions 32" dan "Kuroko Street Rival Summer Cup". Kalau database lambat atau mati, event itu muncul di beranda dan halaman event. Halaman event itu hanya bisa dibuka selama database mati. Setelah database pulih, halamannya hilang.
2. **Data palsu tersimpan di cache.** Empat pembaca ber-cache (`getPublicEventBySlug`, `getTeamsForEvent`, `getMatchesForEvent`, `_getLeaderboardForEvent`) menaruh cadangan di dalam fungsi yang di-cache. Hasil data demo ikut tersimpan 30 sampai 60 detik. Data palsu bisa tetap muncul setelah database pulih.
3. **Penyimpanan bisa tampak berhasil padahal gagal.** `updateEventBrandAssets` menelan error database. Admin mengira logo sudah tersimpan, padahal tidak ada yang berubah.
4. **Pesan error menyesatkan.** Di `updateEventPublicInfo`, `updateTeamLogo`, dan `updateCaptainTeamLogo`, error database berubah jadi pesan "Not authorized".
5. **Bug kode ikut tertelan.** `catch {}` kosong menangkap apa saja, termasuk `TypeError`. Bug jadi tampak seperti "database mati" dan tidak ada yang tahu.

## Daftar 21 tempat

Nomor baris dari commit `61b9392`. Setelah file berubah, nomor baris bergeser.

### Pembaca (17 tempat)

| Fungsi | Baris | Di dalam cache? |
|---|---|---|
| `getEventsByIds` | 460 | tidak |
| `getPublicEvents` | 656 | tidak |
| `getEventBySlug` | 742 | tidak |
| `getPublicEventBySlug` | 760 | ya |
| `listEventVisualAssets` | 845 | tidak |
| `getTeamsForEvent` | 957 | ya |
| `getTeamsForEvents` | 981 | tidak |
| `getTeamCountsForEvents` | 1004 | tidak |
| `getPlayersForTeam` | 1063 | tidak |
| `getPlayersForTeams` | 1077 | tidak |
| `getPlayersForEvent` | 1087 | tidak |
| `getMatchesForEvent` | 1105 | ya |
| `_getLeaderboardForEvent` (dua tempat) | 1332, 1341 | ya |
| `getLeaderboardForEvent` | 1370 | tidak |
| `getBracketPreview` | 1404 | tidak |
| `getPublicVisibleBracketPreview` | 1433 | tidak |

### Penulis (4 tempat)

| Fungsi | Baris | Yang terjadi sekarang saat database error |
|---|---|---|
| `updateEventPublicInfo` | 640 | Jatuh ke data demo, lalu melempar "Not authorized". |
| `updateTeamLogo` | 1028 | Sama. |
| `updateCaptainTeamLogo` | 1049 | Sama. |
| `updateEventBrandAssets` | 4074 | Error ditelan. Tidak ada yang tersimpan, tidak ada pesan. |

### Di luar repository.ts (1 tempat)

`src/app/home-page-content.tsx` mengimpor `getPublicEvents` dari `demo-store` langsung. Kalau `getPublicEvents` belum menjawab dalam 2 detik, atau melempar error, beranda memakai event demo.

## Apa yang bergantung pada data demo

| Yang bergantung | Dampak | Keputusan |
|---|---|---|
| Test smoke `/id` dan `/id/organizer` tanpa database | Hanya butuh halaman tampil, bukan event tertentu. | Seharusnya aman kalau beranda tetap tampil dengan daftar kosong. Belum dibuktikan: PR 0.6 harus menjalankan `pnpm test:e2e:smoke` tanpa database sebelum merge. |
| `public-visual-v2.smoke.spec.ts` | Mengandalkan data demo ("smoke environment runs without a database"). | Sudah diabaikan di `playwright.smoke.config.ts`. Biarkan. Catat sebagai utang. |
| `demo-store.test.ts`, `engine.test.ts`, `team-import.test.ts`, `bracket/page.test.ts` | Memakai logika bracket di `demo-store.ts` sebagai bahan test. | Pertahankan `demo-store.ts` sebagai file khusus test. |
| 4 test di `repository.test.ts` ("public demo fallback reads", baris 2465 sampai 2528) | Menguji bahwa cadangan data demo bekerja. | Ganti dengan test bahwa error diteruskan. |
| Developer yang menjalankan `pnpm dev` tanpa database | Tidak lagi melihat data demo. | `README.developer.md` sudah menyuruh `pnpm db:seed`. Tidak perlu ubah. |
| `docs/superpowers/**` | Rencana lama yang menyebut demo store. | Biarkan, itu catatan sejarah. |

## Pengganti yang diputuskan

1. **Pembaca.** Hapus `try/catch`. Error naik ke halaman dan tercatat di log server. Tidak ada log tambahan: Next.js dan Vercel sudah mencatatnya.
2. **Penulis.** Hapus jalur data demo. Error database naik ke action, yang sudah memakai `toSafeActionMessage` dengan pesan umum. Pesan "Not authorized" hanya datang dari pengecekan izin.
3. **Beranda.**
   - Hapus batas 2 detik dan impor `demo-store`.
   - Kalau `getPublicEvents` melempar error, tulis `console.warn` dan tampilkan daftar kosong dengan pesan `noEvents` yang sudah ada.
   - Alasan menghapus batas waktu: tanpa data demo, daftar kosong karena database baru bangun dari tidur akan tampak seperti "tidak ada event". Lebih baik menunggu jawaban asli.
4. **Halaman error.** Sekarang hanya 4 halaman organizer yang punya `error.tsx`. Tidak ada `global-error.tsx`. Tambahkan:
   - `src/app/[locale]/error.tsx` untuk rute yang punya locale.
   - `src/app/error.tsx` untuk rute tanpa locale (`/events`, `/captain`, `/login`, `/register`, `/admin`, `/organizer`).
   - `src/app/global-error.tsx` sebagai pengaman terakhir.
5. **Cache.** Setelah cadangan dihapus, error tidak lagi disimpan di cache, karena `unstable_cache` tidak menyimpan hasil yang melempar error.
6. **`demo-store.ts`.** Tidak dihapus. Tambahkan komentar "hanya untuk test". Aturan ESLint di PR 0.8 melarang kode produksi mengimpornya. Pemindahannya ke folder test dibahas setelah Fase 3.

### Teks halaman error

Mengikuti aturan Bahasa Lazim: kata sehari-hari, fakta dulu, dua kalimat.

| | Indonesia | Inggris |
|---|---|---|
| Judul | Halaman ini bermasalah | This page has a problem |
| Isi | Data belum bisa dimuat. Coba lagi sebentar lagi. | We could not load the data. Please try again soon. |
| Tombol | Coba lagi | Try again |

Teks ini ditaruh di `messages/id.json` dan `messages/en.json`.

## Langkah PR 0.6

1. Tulis test dulu (merah):
   - Pembaca meneruskan error database (satu test tiap fungsi yang ada di daftar).
   - Penulis meneruskan error database dan tidak jatuh ke "Not authorized".
   - `updateEventBrandAssets` melempar error.
   - Beranda menampilkan daftar kosong saat `getPublicEvents` melempar error.
2. Hapus 21 cadangan di `repository.ts` dan baris `import * as demoStore`.
3. Ubah `home-page-content.tsx` sesuai bagian "Pengganti".
4. Tambah tiga file halaman error dan teks id/en.
5. Ganti 4 test "public demo fallback reads".
6. Tambah komentar "hanya untuk test" di `demo-store.ts`.
7. Jalankan lima pengecekan biasa, termasuk `pnpm test:e2e:smoke` dan `pnpm build`. Smoke harus lolos tanpa database.

## Risiko dan cara memantau

- **Halaman publik yang tadinya "selalu tampil" bisa menampilkan halaman error saat database bermasalah.** Ini disengaja. Sebelumnya pengunjung melihat data palsu.
- **Cold start Neon.** Database yang baru bangun bisa menjawab lambat. Tanpa batas 2 detik, beranda menunggu lebih lama, tetapi menampilkan data asli.
- **Pantau setelah deploy.** Lihat log error Prisma di halaman publik selama beberapa hari sebelum lanjut ke Fase 1. Kalau banyak, itu masalah database yang tadinya tertutup, bukan masalah PR ini.
- **Rollback.** PR 0.6 berdiri sendiri, jadi cukup di-revert.
