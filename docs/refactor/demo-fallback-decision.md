# Keputusan: cadangan data demo (PR 0.5)

Dokumen ini hanya keputusan. Kode belum diubah. Perubahan kodenya ada di PR 0.6.

## Ringkasan

Kalau database error, `repository.ts` diam-diam memakai data demo di 21 tempat. Beranda juga begitu: setelah 2 detik tanpa jawaban, beranda menampilkan event demo.

Cadangan ini bukan mode yang dipilih. Ini `try/catch` yang menelan semua error, tanpa log.

Keputusan: hapus semua cadangan data demo dari kode produksi. Error database diteruskan, dan pengunjung melihat halaman error yang ramah. Beranda jalur lama menampilkan pesan error yang sama dengan beranda V3. Daftar kosong hanya untuk kasus benar-benar tidak ada event.

## Kenapa dihapus

1. **Pengunjung bisa melihat event palsu.** Data demo berisi event seperti "Flashpeak Champions 32" dan "Kuroko Street Rival Summer Cup". Kalau database lambat atau mati, event itu muncul di beranda jalur lama dan di halaman event. Halaman event itu hanya bisa dibuka selama database mati. Setelah database pulih, halamannya hilang.
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

Ini hanya terjadi di **jalur beranda lama**. Flag `public_discovery_v3` bernilai `true` di Prod dan Preview (catatan `docs/operations/v3-feature-flag-matrix.md`, 2026-10-07). Beranda produksi memakai jalur V3, yang tidak memakai data demo dan sudah punya status error sendiri (`loadState: "error"`). Jalur lama jalan kalau flag mati: default di kode, pengembangan lokal, dan test smoke.

**Belum dipastikan:** halaman event publik (`bracket`, `participants`, `leaderboards`, `schedule`, detail, daftar) masih memanggil pembaca yang punya cadangan. Jalur mana yang aktif di produksi untuk halaman itu belum diperiksa. PR 0.6 harus memeriksanya sebelum klaim "pengunjung melihat event palsu" dianggap benar untuk produksi.

## Apa yang bergantung pada data demo

| Yang bergantung | Dampak | Keputusan |
|---|---|---|
| Test smoke `/id` dan `/id/organizer` tanpa database | Hanya butuh halaman tampil, bukan event tertentu. Smoke memakai beranda jalur lama (flag `public_discovery_v3` mati). | Seharusnya aman kalau beranda tetap tampil dengan pesan error. Belum dibuktikan: PR 0.6 harus menjalankan `pnpm test:e2e:smoke` tanpa database sebelum merge. |
| `public-visual-v2.smoke.spec.ts` | Mengandalkan data demo ("smoke environment runs without a database"). | Sudah diabaikan di `playwright.smoke.config.ts`. Biarkan. Catat sebagai utang. |
| `demo-store.test.ts`, `engine.test.ts`, `team-import.test.ts`, `bracket/page.test.ts` | Memakai logika bracket di `demo-store.ts` sebagai bahan test. | Pertahankan `demo-store.ts` sebagai file khusus test. |
| 4 test di `repository.test.ts` ("public demo fallback reads", baris 2465 sampai 2528) | Menguji bahwa cadangan data demo bekerja. | Ganti dengan test bahwa error diteruskan. |
| Developer yang menjalankan `pnpm dev` tanpa database | Tidak lagi melihat data demo. | `README.developer.md` sudah menyuruh `pnpm db:seed`. Tidak perlu ubah. |
| `docs/superpowers/**` | Rencana lama yang menyebut demo store. | Biarkan, itu catatan sejarah. |

## Pengganti yang diputuskan

1. **Pembaca.** Hapus `try/catch`. Error naik ke halaman dan tercatat di log server. Tidak ada log tambahan: Next.js dan Vercel sudah mencatatnya.
2. **Penulis.** Hapus jalur data demo. Error database naik ke action, yang sudah memakai `toSafeActionMessage` dengan pesan umum. Pesan "Not authorized" hanya datang dari pengecekan izin.
3. **Beranda jalur lama.**
   - Hapus batas 2 detik dan impor `demo-store`.
   - Kalau `getPublicEvents` melempar error, tulis `console.warn` dan tampilkan **pesan error**, bukan `noEvents`. `noEvents` berbunyi "Belum ada event publik untuk game ini." Kalimat itu salah kalau penyebabnya database error.
   - Pesan error memakai kalimat yang **sudah ada** di beranda V3 (`home-copy.ts`), dengan tombol "Coba lagi" dan `role="alert"`. Pesan kosong dan pesan error harus terpisah, seperti di V3.
   - Alasan menghapus batas waktu: tanpa data demo, batas 2 detik akan menampilkan pesan error padahal database hanya baru bangun dari tidur. Lebih baik menunggu jawaban asli.
   - Beranda V3 tidak diubah.
4. **Halaman error.** Sekarang hanya 4 halaman organizer yang punya `error.tsx`. Tidak ada `global-error.tsx`. Tambahkan:
   - `src/app/[locale]/error.tsx` untuk semua rute yang punya locale.
   - `src/app/global-error.tsx` sebagai pengaman terakhir.
   - `src/app/error.tsx` **tidak perlu**: middleware mengalihkan semua jalur tanpa locale ke `/[locale]/...`.
5. **Cache.** Setelah cadangan dihapus, error tidak lagi disimpan di cache, karena `unstable_cache` tidak menyimpan hasil yang melempar error.
6. **`demo-store.ts`.** Tidak dihapus. Tambahkan komentar "hanya untuk test". Aturan ESLint di PR 0.8 melarang kode produksi mengimpornya. Pemindahannya ke folder test dibahas setelah Fase 3.

### Teks halaman error

Tidak ada daftar tunggal semua pesan error di proyek ini. Pesan tersebar di tiga tempat: daftar `SAFE_ACTION_MESSAGES` di `src/lib/security/public-error.ts`, kunci di `messages/*.json`, dan teks di `src/components/v3/**/*-copy.ts`. Karena itu teks baru dibuat sesedikit mungkin dan memakai kalimat yang sudah ada.

| | Indonesia | Inggris | Sumber |
|---|---|---|---|
| Isi (beranda lama dan halaman error) | Data event belum dapat dimuat. Coba lagi beberapa saat. | Event data is temporarily unavailable. Please try again shortly. | Sudah ada: `home-copy.ts`, kunci `error`. |
| Tombol | Coba lagi | Try again | Sudah ada: `directory-copy.ts`, kunci `retry`. |
| Judul halaman error | Halaman ini bermasalah | This page has a problem | **Baru.** Satu-satunya teks baru. |

Teks baru ditaruh di `messages/id.json` dan `messages/en.json`. Untuk beranda lama, tambahkan kunci `home.loadError` berisi kalimat "Isi" di atas.

**Catatan kata.** Kalimat yang sudah ada memakai "belum dapat". Aturan Bahasa Lazim lebih suka "belum bisa". Untuk konsisten ("satu hal, satu kata"), PR 0.6 memakai kata yang sudah ada. Mengganti "dapat" menjadi "bisa" di seluruh aplikasi adalah pekerjaan terpisah.

## Langkah PR 0.6

1. Tulis test dulu (merah):
   - Pembaca meneruskan error database (satu test tiap fungsi yang ada di daftar).
   - Penulis meneruskan error database dan tidak jatuh ke "Not authorized".
   - `updateEventBrandAssets` melempar error.
   - Beranda jalur lama menampilkan pesan error (bukan `noEvents`) saat `getPublicEvents` melempar error.
2. Hapus 21 cadangan di `repository.ts` dan baris `import * as demoStore`.
3. Ubah `home-page-content.tsx` sesuai bagian "Pengganti". Sebelum itu, periksa jalur halaman event publik yang aktif di produksi (lihat "Belum dipastikan").
4. Tambah tiga file halaman error dan teks id/en.
5. Ganti 4 test "public demo fallback reads".
6. Tambah komentar "hanya untuk test" di `demo-store.ts`.
7. Jalankan lima pengecekan biasa, termasuk `pnpm test:e2e:smoke` dan `pnpm build`. Smoke harus lolos tanpa database.

## Risiko dan cara memantau

- **Halaman publik yang tadinya "selalu tampil" bisa menampilkan halaman error saat database bermasalah.** Ini disengaja. Sebelumnya pengunjung melihat data palsu.
- **Cold start Neon.** Database yang baru bangun bisa menjawab lambat. Tanpa batas 2 detik, beranda menunggu lebih lama, tetapi menampilkan data asli.
- **Pantau setelah deploy.** Lihat log error Prisma di halaman publik selama beberapa hari sebelum lanjut ke Fase 1. Kalau banyak, itu masalah database yang tadinya tertutup, bukan masalah PR ini.
- **Rollback.** PR 0.6 berdiri sendiri, jadi cukup di-revert.

## Hasil PR 0.6

Dikerjakan sesuai keputusan di atas. Yang berbeda dari rencana atau baru ditemukan:

1. **Halaman event publik memang terdampak.** Semua enam halaman event (`bracket`, `leaderboards`, detail, `participants`, `schedule`, `standings`) memanggil `getPublicEventBySlug`, jadi klaim "pengunjung melihat event palsu" benar untuk jalur produksi.
2. **`generateMetadata` menjatuhkan seluruh halaman.** Error yang dilempar di `generateMetadata` tidak tertangkap `error.tsx` segmen itu, dan berakhir di `global-error` tanpa navigasi. Sebelum PR ini, cadangan data demo menutupi masalah tersebut. Perbaikannya: fungsi `readEventForMetadata` mengembalikan `null` kalau pembacaan gagal. Isi halaman lalu membaca event yang sama dan gagal di dalam layout, sehingga `[locale]/error.tsx` yang menangkap.
3. **Tidak ada `src/app/error.tsx`.** Lihat bagian "Pengganti" butir 4.
4. **Beranda jalur lama** memakai fungsi baru `loadHomepageEvents` (`src/lib/events/homepage-events-read.ts`). Hasilnya `{ events, failed }`, jadi daftar kosong dan gagal tidak tertukar. Kedua tampilan jalur lama (V2 dan polos) menampilkan `home.loadError`.
5. **Teks.** Teks halaman error memakai kalimat umum "Data belum dapat dimuat. Coba lagi beberapa saat." Beranda memakai kalimat yang sama dengan V3 ("Data event belum dapat dimuat..."). Teks baru: `errorPage.title`, `errorPage.description`, `errorPage.retry`, `home.loadError`, `home.retry` (id dan en).

6. **Salinan data demo yang tidak memakai `demoStore`.** Review independen menemukan `event-detail-page.tsx` punya dua event palsu yang ditulis langsung di kode ("miracle-league" dan "kuroko-summer-cup"). Pencarian `demoStore` tidak menemukannya. Keduanya dihapus, begitu juga `.catch(() => [])` untuk tim, bracket, dan leaderboard di halaman itu, yang membuat turnamen kosong tampak seperti nyata.
7. **Daftar event jalur lama.** `src/app/events/page.tsx` memakai `getCachedPublicEvents().catch(() => [])`. Setelah cadangan dihapus, baris itu jadi menampilkan "tidak ada event" saat database gagal. Catch-nya dihapus, sehingga halaman error yang tampil.
8. **`global-error.tsx` memuat `globals.css` sendiri**, karena file itu menggantikan layout root dan tidak mewarisi gayanya.

### Cara dibuktikan

- Test baru `repository-database-errors.test.ts` (23 test): 14 pembaca, 3 titik di leaderboard, 4 penulis, dan satu test bahwa kegagalan tidak diingat. Semuanya merah sebelum kode diubah.
- Smoke test tanpa database: 24 lolos.
- Mode produksi tanpa database, dibuka di browser sungguhan: halaman event menampilkan "Halaman ini bermasalah" dengan tombol "Coba lagi" dan navigasi atas tetap ada (id dan en). Beranda menampilkan pesan error dengan `role="alert"` dan tidak ada event demo.
- Status HTTP halaman event saat database mati adalah 500. Itu disengaja: pengunjung dan mesin pencari sebaiknya tahu ini gangguan, bukan halaman kosong yang normal.

### Temuan yang belum ditangani

Dari review independen, belum diubah dan sengaja ditunda:
- `getAllPublicEvents` (sitemap) mengembalikan daftar kosong saat database gagal. Crawler akan melihat sitemap tanpa event. Sebaiknya melempar error supaya crawler menerima 5xx.
- Beranda jalur lama memakai `.catch(() => [])` untuk tim dan bracket event unggulan. Dibiarkan: daftar event tetap benar, dan bagian itu hanya pelengkap.
- Teks di `global-error.tsx` ditulis ulang dengan tangan dan bisa menyimpang dari `messages/id.json`. Layout root tidak punya penyedia terjemahan, jadi teks tetap statis.

Ada pembaca lain yang juga menelan error database dan mengembalikan nilai kosong, **tanpa** data demo: `getAllPublicEvents` (sitemap), `getEventRoundConfigs`, `getMatchGames`, dan `getMatchGamesForEvent`. Dua yang pertama juga di-cache. Kasusnya sama dengan beranda kosong tadi: "kosong" bisa berarti "database gagal". Tidak diubah di PR ini supaya cakupannya tetap satu masalah. Dicatat sebagai pekerjaan lanjutan.

`public-visual-v2.smoke.spec.ts` masih mengandalkan data demo dan masih diabaikan oleh `playwright.smoke.config.ts`. Perlu diputuskan: pakai data seed, atau dihapus.
