# Rencana Refactor Miracle

## Tujuan

Dua file kode terlalu besar:
- `src/lib/platform/repository.ts`: 4.460 baris, 118 fungsi.
- `src/lib/actions.ts`: 1.993 baris, 53 action.

Rencana ini memecahnya jadi modul per bidang. Modul artinya kelompok kode untuk satu bidang, misalnya event, tim, atau sertifikat. Cara kerja aplikasi tidak boleh berubah. Satu pengecualian disengaja: PR 0.6 (lihat bawah).

Rencana awal punya 49 PR. Setelah kode diperiksa, angkanya jadi 37 PR. Beberapa angka di rencana awal sudah usang, dan beberapa hal belum dihitung.

## Keputusan yang sudah diambil

1. Folder tujuannya `src/lib/<bidang>`, bukan `src/modules`. Folder `src/lib` sudah punya bidang sendiri (`events`, `registration`, `bracket`, `certificate`, dan lainnya). Folder baru akan menambah satu susunan lagi.
2. Branch lama `origin/fix/modular-build-and-test-stability` hanya dipakai sebagai contoh. Branch itu tertinggal 511 commit dari `main`.
3. Data demo (`demoStore`) dihapus dulu, sebelum `repository.ts` dipecah.

## Temuan yang mengubah rencana

Urutannya dari yang paling berisiko.

1. **Angka di rencana awal usang.**
   - `repository.ts`: 4.460 baris (rencana awal: 3.001) dan 118 fungsi (rencana awal: 91).
   - `actions.ts`: 1.993 baris dan 53 action (rencana awal: 1.726 baris dan 44 action).
   - `repository.test.ts`: 3.037 baris. `actions.test.ts`: 2.638 baris.
   - File yang memakai `repository.ts`: 115 (64 bukan file test). Rencana awal menulis 22.
2. **Sebagian rencana awal terpotong.** Fase 1 (1.3 sampai 1.6) dan Fase 2 (2.1 sampai 2.18) tidak ikut terkirim. Fase 2 di bawah disusun ulang dari hasil pemeriksaan kode.
3. **Data demo bertentangan dengan janji "tanpa ubah cara kerja".**
   - `repository.ts` memakai data demo sebagai cadangan di 21 tempat. Kalau database error, halaman menampilkan data demo.
   - Menghapusnya mengubah hasil di produksi: halaman publik tidak lagi menampilkan data demo.
   - Jadi penghapusan jadi PR sendiri di Fase 0 (PR 0.5 dan 0.6). PR itu dikerjakan lebih dulu, sebelum kode dipindah.
4. **Banyak fungsi dipakai lintas bidang, dan belum punya tempat.** Fungsi-fungsi ini harus pindah lebih dulu ke folder bersama.
   - Pengecekan izin: `assertUserCanManageEvent` (dipakai sekitar 20 tempat), `assertUserCanManageTeam`, `assertUserCanReviewStatSubmission`.
   - Pembantu transaksi: `runSerializableRegistrationTransaction` (11 tempat), `assertEventRosterMutable`, `assertNewRegistrationWindowOpen`, `expireStaleRegistrationRequests`.
   - Pengubah bentuk data: `mapEvent` (sekitar 20 tempat), `mapTeam` (13 tempat).
   - Cache dengan tag `teams` dipakai bersama oleh pembaca tim, pertandingan, dan pengaturan babak.
   - Di `actions.ts`: `requireAdminSession` (30 tempat), `requireCaptainSession`, `assertWorkspaceEventAction`, `actionEntityId` (sekitar 50 tempat), `redirectToRequestedLocale`, dan seluruh kode upload gambar.
5. **Beberapa fungsi tidak masuk ke bidang mana pun di rencana awal.** Contohnya pengaturan game dan mode, profil platform dan organizer, pengaturan pembayaran global, gambar visual event, pengaturan babak, stream, dan daftar event publik. Dua fungsi yang menyentuh tiga bidang sekaligus (`createCaptainWithTeam` dan `createCaptainWithPendingPayment`) sudah dihapus karena tidak terpakai (lihat catatan di bawah).
6. **Test bisa memanggil database asli tanpa ketahuan.**
   - 47 file test me-mock `@/lib/platform/repository`.
   - Kalau sebuah file pindah ke alamat impor baru, tetapi mock-nya masih di alamat lama, mock tidak lagi menahan panggilan. Test lalu memanggil Prisma sungguhan.
   - Aturannya: semua file tetap mengimpor lewat file perantara (`export *` di `repository.ts`) sampai satu sapuan di akhir. Sapuan itu mengganti alamat impor dan mock sekaligus, lewat skrip, per folder.
7. **Pengaman lama lemah.**
   - `pnpm lint` hanya menjalankan `tsc --noEmit`. ESLint jalan terpisah di CI dengan `--quiet`.
   - CI tidak menjalankan `next build`, test e2e, ataupun coverage.
   - Tidak ada pengaturan coverage. Paket `@vitest/coverage-v8` harus dipasang dulu.
   - Test e2e smoke (3 file) tidak menyentuh fungsi di `repository.ts`, jadi bukan pengaman utama.
   - `server-action-bundle.test.ts` hanya membaca `./actions.ts`. Kalau file itu pindah, test gagal atau lolos tanpa mengecek apa-apa.
8. **Aturan ESLint berlevel `warn` tidak kelihatan.** CI memakai `--quiet`. Pakai `no-restricted-imports` bawaan ESLint dengan level `error`, plus daftar pengecualian yang terus mengecil. Tidak perlu paket baru.
9. **Test repository memakai mock, bukan database.** Tiga transaksi Serializable untuk pendaftaran dan 16 pemakaian `$transaction` tidak pernah dites dengan database asli. CI sudah punya Postgres 18 (job `schema-drift`), jadi test database bisa ditambah di sana.
10. **Sebagian fungsi sudah dites.** `registerTeam`, `commitRegistrationImportBatch`, dan `adminWriteMatchPlayerStats` sudah dites cukup dalam. Celah yang tersisa lebih kecil dari perkiraan, jadi PR 0.3 cukup satu.
11. **File ini sering berubah.** `repository.ts` berubah 11 kali dan `actions.ts` 7 kali dalam 100 commit terakhir (7 hari). `HANDOFF.md` juga menandai rilis 1.0 sebagai BLOCKED. Refactor yang lama akan bertabrakan dengan kerja fitur.
    - Kerjakan lewat PR kecil dan cepat di-merge.
    - Rebase tiap hari.
    - Setelah satu bidang dipindah, perubahan baru untuk bidang itu hanya boleh di modul barunya.
12. **Fase 3 melanggar aturannya sendiri.** Aturan 1 melarang ubah logika, tetapi tiap PR Fase 3 juga memisahkan `service.ts`. Pemisahan itu dipindah ke Fase 4 (opsional).
13. **Pola `"use server"` per file sudah terbukti.** Ada 14 file `src/lib/actions/*-v3-actions.ts` yang memakainya. Jadi "spike" 3.0 cukup berupa pengecekan `next build`. Satu batasan: file `"use server"` hanya boleh mengekspor fungsi `async`. Enam fungsi pembungkus di akhir `actions.ts` (baris 1975 sampai 1993) harus tetap ada. `export ... from` tidak boleh dipakai.
14. **Sudah ada saling-impor yang melingkar.** `actions.ts` dan `registration-v3-actions.ts` saling mengimpor (sekarang ditutupi dengan `import()` dinamis). Fungsi `uploadImageAsset` diimpor dari `@/lib/actions` oleh 3 file di `src/lib` dan 1 route. Memindahkan kode upload di Fase 1 sekaligus memutus lingkaran ini.
15. **Di luar cakupan rencana ini:** `admin-workspace.tsx` (2.245 baris), `captain/page.tsx` (1.147 baris), `public-v3-read.ts` (1.319 baris), `certificate/template.ts` (957 baris), sekitar 35 file di `src/lib` yang memakai Prisma langsung, dan dua file akses data lain (`registration/captain-repository.ts`, `platform/stat-recording-repository.ts`). Semuanya masuk Fase 4.

## Susunan folder tujuan

```
src/lib/platform/shared/         # pengecekan izin, transaksi, pengubah data, konstanta, tag cache (tanpa "use server")
src/lib/actions/shared/          # pengecekan sesi, redirect, actionEntityId, kode upload (tanpa "use server")
src/lib/<bidang>/repository.ts   # akses data (asalnya dari repository.ts)
src/lib/<bidang>/actions.ts      # "use server" (asalnya dari actions.ts)
src/lib/platform/repository.ts   # file perantara `export *`, dihapus di akhir Fase 2
```

Daftar bidang:
- `platform`: pengaturan game, profil, pengaturan pembayaran.
- `events`: event, gambar visual, daftar publik, stream.
- `teams`: tim dan pemain.
- `bracket`: pertandingan, klasemen, pengaturan babak, game per pertandingan.
- `registration`: permintaan daftar, draft, review, pembayaran.
- `imports`: impor tim.
- `stats`: statistik pemain (folder `player-stats`).
- `certificate`: sertifikat.
- `identity`: user, password, akun captain.

Folder yang sudah ada dipakai lagi. Hanya `teams` dan `identity` yang baru.

Urutan antar bidang: shared, platform, events, teams, bracket, registration, imports, stats, certificate, identity. Bidang di belakang boleh mengimpor bidang di depannya, tidak sebaliknya. Contohnya: `bracket` memanggil `getTeamsForEvent`, `stats` memanggil `getPlayersForTeams`, dan `imports` memanggil `isEventBracketLocked`.

## Aturan tiap PR

1. Satu PR memindahkan satu potongan. Isinya pindah kode dan ubah impor. Logika tidak berubah.
2. Pindahkan kode dengan skrip, bukan ditulis ulang.
3. Sebelum push, jalankan lima perintah ini sampai lolos:
   - `pnpm lint`
   - `pnpm exec eslint . --quiet`
   - `pnpm test`
   - `pnpm build`
   - `pnpm test:e2e:smoke`
4. Test ikut pindah ke samping modulnya di PR yang sama.
5. Dua PR tidak boleh mengubah file sumber yang sama bersamaan. Merge satu per satu.
6. Tiap PR dikerjakan dengan agen ECC:
   - `ecc:tdd-guide` untuk menutup celah test.
   - `ecc:refactor-cleaner` atau `code-simplifier` untuk memindahkan kode.
   - `ecc:code-reviewer` dan `ecc:typescript-reviewer` setelahnya.
   - `ecc:security-reviewer` wajib untuk PR izin, identitas/password, dan upload.
   - `ecc:database-reviewer` wajib untuk PR transaksi.
7. Centang daftar di bawah, di PR yang bersangkutan.

## Fase 0: Pengaman dan keputusan (8 PR)

| PR | Isi | Beban |
|---|---|---|
| 0.1 | Ukuran awal: hasil `tsc`, eslint, test, `next build`, ukuran bundle, dan coverage. Tulis di `baseline.md`. Simpan rencana ini. | S |
| 0.2 | Pengaman: `server-action-bundle.test.ts` membaca semua file `"use server"`, bukan satu file. Tambah job `next build` di CI. | S |
| 0.3 | Test pengunci: tutup celah test untuk sign up captain, pendaftaran berbayar, dan hasil pertandingan versi lama. | S |
| 0.4 | Test dengan database asli untuk tiga transaksi Serializable pendaftaran. Jalan di job Postgres CI. Dilewati kalau tidak ada database (ikuti `persistence-migration.integration.test.ts`). | B |
| 0.5 | Keputusan data demo, bagian 1: catat 21 tempatnya dan `home-page-content.tsx`. Hasilnya ada di `demo-fallback-decision.md`. Tentukan penggantinya: error diteruskan dan dicatat di log, lalu pastikan rute publik punya `error.tsx`. Hanya dokumen. | S |
| 0.6 | Keputusan data demo, bagian 2: hapus cadangan data demo, hapus atau pindahkan `demo-store.ts`, perbarui test. Ini satu-satunya PR yang mengubah cara kerja dengan sengaja. Deploy dan amati dulu sebelum Fase 1. | B |
| 0.7 | Test berbentuk tabel: tiap action yang memanggil `revalidatePath` atau `revalidateTag` (43 dan 24 panggilan di `actions.ts`) punya pengecekan. | S |
| 0.8 | Tulis `docs/architecture.md` (susunan folder, arah impor, aturan API publik). Pasang `no-restricted-imports` berlevel `error` dengan daftar pengecualian. | S |

Beban: R = ringan, S = sedang, B = berat.

## Fase 1: Folder bersama (5 PR)

| PR | Isi | Beban |
|---|---|---|
| 1.1 | `platform/shared`: konstanta, include, pengubah data, tag cache. | S |
| 1.2 | `platform/shared/authz`: tiga pengecekan `assertUserCan*`. Wajib review keamanan. | S |
| 1.3 | `platform/shared/tx`: `runSerializableRegistrationTransaction`, pengecekan jendela dan roster, `expireStaleRegistrationRequests`. | S |
| 1.4 | `actions/shared`: `requireAdminSession`, `requireCaptainSession`, `assertWorkspaceEventAction`, `redirectToRequestedLocale`, `actionEntityId`. Tanpa `"use server"`. | S |
| 1.5 | `actions/shared/uploads`: kode `uploadImageAsset`, cek gambar, dan konstanta `MAX_*`. Fungsi `uploadImageAsset` yang `async` tetap di `actions.ts` sampai Fase 3. Memutus lingkaran impor dengan `registration-v3-actions`. | S |

`AppError` dan `ActionResult` ditunda. Pemindahan kode tidak butuh keduanya.

## Fase 2: Pecah repository.ts (14 PR)

Tiap PR melakukan empat hal:
1. Tutup celah test untuk fungsi di potongan itu (lihat `repository-uncovered-functions.txt`).
2. Pindahkan fungsi ke `<bidang>/repository.ts`.
3. Tambah `export *` di file perantara.
4. Pindahkan bagian `repository.test.ts` yang terkait.

| PR | Bidang | Isi utama | Beban |
|---|---|---|---|
| 2.1 | platform | pengaturan game dan mode, profil platform dan organizer, pengaturan pembayaran | R |
| 2.2 | events | baca dan ubah event, daftar publik, stream, siklus status | S |
| 2.3 | events | gambar visual, gambar merek dan sertifikat | S |
| 2.4 | teams | tim, pemain, captain tampilan, logo | S |
| 2.5 | bracket | pertandingan, kunci bracket, klasemen, `setMatchResult` | S |
| 2.6 | bracket | pengaturan babak, game per pertandingan | S |
| 2.7 | registration | `registerTeam`, permintaan daftar, draft, bukti bayar | B |
| 2.8 | registration | setuju atau tolak, review pembayaran, pengaturan pembayaran event | S |
| 2.9 | imports | snapshot, preview batch, riwayat, `commitRegistrationImportBatch` | B |
| 2.10 | stats | konteks form, pembaca, leaderboard | S |
| 2.11 | stats | `upsertStatSubmission`, setuju atau tolak, `adminWriteMatchPlayerStats` | B |
| 2.12 | certificate | semua fungsi sertifikat | R |
| 2.13 | identity | user, password, `createCaptainAccount` | S |
| 2.14 | sapuan | Hapus file perantara. Ganti impor dan `vi.mock` di 115 file lewat skrip, dibagi per folder (2 sampai 3 PR). | B |

Risiko: impor melingkar antar modul. Aturannya: modul belakang boleh mengimpor modul depan. Kalau ada lingkaran, pindahkan fungsi bersama ke modul depan atau ke `platform/shared`.

## Fase 3: Pecah actions.ts (10 PR)

| PR | Isi | Beban |
|---|---|---|
| 3.0 | Cek `next build` dengan satu action contoh per modul. Polanya sudah terbukti oleh `*-v3-actions.ts`. | R |
| 3.1 | identity: sign up, login, ganti dan reset password, nonaktifkan user, tetapkan captain | S |
| 3.2 | events: buat, status, arsip, stream, info publik, warna aksen, gambar karakter | S |
| 3.3 | events: logo dan gambar visual (8 action). Ubah `EventVisualAssetsPanel` dan `EventDraftForm`. | S |
| 3.4 | registration: daftar, draft, bukti bayar, pengaturan bayar, setuju atau tolak, 6 fungsi pembungkus V3 | S |
| 3.5 | imports: CSV, preview, commit | S |
| 3.6 | teams: logo, tambah dan ubah pemain, captain tampilan, hapus tim | S |
| 3.7 | bracket dan stats: hasil pertandingan, pengaturan babak, game per pertandingan, kirim dan setujui statistik. Pembuatan sertifikat tetap dimuat saat dibutuhkan. | S |
| 3.8 | certificate: `adminRegenerateCertificate`. Hapus `lib/actions.ts`. Ubah 24 file pengimpor dan 8 `vi.mock("@/lib/actions")`. | S |
| 3.9 | Pecah `actions.test.ts`. Evaluasi: build penuh, e2e, bandingkan ukuran bundle dan waktu build dengan `baseline.md`. | S |

## Fase 4: Perbaikan dan perapian (dikerjakan setelah Fase 3)

Bagian 1 (perbaikan perilaku) dan bagian 2 (pindah murni) sudah dikerjakan, lihat catatan di bawah. Yang tidak dikerjakan dan alasannya:
- Pisahkan logika ke `service.ts`, mulai dari `adminPreviewRegistrationImportAction`: mengubah bentuk kode, bukan memindah. Tunggu ada alasan fitur.
- Buat antarmuka repository: belum ada pemakai kedua yang membutuhkannya.
- Rapikan sisa akses Prisma langsung di `src/lib` (sekitar 22 file): lihat "Akses Prisma" di bawah.

## Waktu dan titik evaluasi

37 PR: Fase 0 ada 8, Fase 1 ada 5, Fase 2 ada 14, Fase 3 ada 10. Satu PR per sesi pendek. PR berat (B) satu per sesi.

Titik evaluasi:
- Akhir Fase 0: semua pengaman terpasang dan data demo sudah hilang (dicek lewat CI, test, dan browser).
- Akhir Fase 1: folder bersama sudah stabil.
- Akhir Fase 2: `repository.ts` sudah habis.

## Cara cek hasil

Tiap PR: lima perintah di "Aturan tiap PR". Jumlah test tidak boleh turun. Ringkasan perubahan (`git diff --stat -M`) harus menunjukkan file yang dipindah, bukan ditulis ulang.

Tiap akhir fase: bandingkan ukuran bundle dan waktu build dengan `baseline.md`.

Setelah deploy ke produksi, lihat log error database di halaman publik. Itu pemeriksaan biasa, bukan syarat untuk memulai Fase 1.

## Daftar kemajuan

Fase 0:
- [x] 0.1
- [x] 0.2
- [x] 0.3
- [x] 0.4
- [x] 0.5
- [x] 0.6
- [x] 0.7
- [x] 0.8

Fase 1:
- [x] 1.1
- [x] 1.2
- [x] 1.3
- [x] 1.4
- [x] 1.5

Fase 2:
- [x] 2.1
- [x] 2.2
- [x] 2.3
- [x] 2.4
- [x] 2.5
- [x] 2.6
- [x] 2.7
- [x] 2.8
- [x] 2.9
- [x] 2.10
- [x] 2.11
- [x] 2.12
- [x] 2.13
- [x] 2.14

Fase 3:
- [x] 3.0
- [x] 3.1
- [x] 3.2
- [x] 3.3
- [x] 3.4
- [x] 3.5
- [x] 3.6
- [x] 3.7
- [x] 3.8
- [x] 3.9

## Catatan dari pengerjaan

**PR 0.3 selesai.** Dua file test baru: `repository-captain-signup.test.ts` dan `repository-registration-edges.test.ts`. Isinya:
- `createCaptainAccount`, `createCaptainWithTeam`, `createCaptainWithPendingPayment` (dua yang terakhir sudah dihapus, lihat bawah).
- Jalur draft dan semua pengecekan di `createTeamRegistrationRequest`.
- Jalur simpan hasil pertandingan versi lama di `setMatchResult`, termasuk cabang Single Elimination tanpa baris pertandingan.

Dua file ini dibuat terpisah supaya `repository.test.ts` (3.037 baris) tidak makin panjang.

**Celah test lain dikerjakan tepat sebelum fungsinya dipindah.**
- Sekarang 123 dari 297 fungsi di `repository.ts` belum dijalankan test mana pun. Daftarnya ada di `repository-uncovered-functions.txt`.
- Banyak di antaranya pembaca sederhana yang memakai data demo. Bagian itu berubah di PR 0.6.
- Karena itu tiap PR Fase 2 menutup celah potongannya sendiri. Tidak ada satu PR besar di depan.

**Lima kebiasaan aneh dari PR 0.3: sudah diperbaiki.** Perbaikannya terpisah dari pemindahan kode, jadi test di Fase 2 tidak perlu berubah.
1. Pendaftaran berbayar tidak mengecek roster terkunci. Sekarang `createTeamRegistrationRequest` membaca kunci roster di dalam transaksi. Keduanya hanya membaca, tidak menaikkan `competitionVersion`, karena permintaan daftar belum mengubah roster. Penilaian awal terlalu keras: alur aplikasi lewat `registerTeam` dulu, yang sudah mengecek kunci, dan persetujuan juga mengecek ulang. Yang tersisa hanya celah kecil di antara dua langkah itu.
2. `createTeamRegistrationRequest` sekarang menjalankan semua pengecekan dan penyimpanan dalam satu transaksi Serializable, dengan ulang otomatis saat bentrok (P2034). Penilaian awal terlalu keras: database sudah menahan duplikat lewat indeks unik parsial (lihat PR 0.4), jadi bahayanya lebih kecil dari yang ditulis.
3. `setMatchResult` tidak lagi mencatat pemenang untuk skor seri (`winnerTeamId` kosong). Klasemen dihitung dari skor, jadi tidak terpengaruh.
4. `createCaptainWithTeam` memakai 2 huruf pertama tag untuk `logoText`, sama seperti jalur lain. Fungsi ini lalu dihapus (lihat bawah).
5. Email kembar saat daftar memberi pesan "Email ini sudah terdaftar. Coba login." Pesan itu dilempar sebagai `UserFacingError` (kebiasaan baru dari `main`, lihat `src/lib/security/public-error.ts`), jadi sampai ke pengguna tanpa masuk daftar pesan aman.

**PR 1.1 selesai.** Konstanta, pembantu pemetaan, dan tag cache pindah ke `src/lib/platform/shared/`:
- `constants.ts`: status event publik, batas pembaca organizer, status permintaan daftar, masa berlaku pembayaran 24 jam, pesan roster terkunci, dan `CACHE_TAGS` (baru: `events`, `teams`, `stats`).
- `mappers.ts`: `mapEvent`, `mapTeam`, `mapPlayer`, `mapMatch`, `mapUser`, `mapTeamRegistrationRequest`, `mapPaymentSettings`, `mapEventVisualAsset`, serta dua set `include` Prisma.

Dipindah dengan skrip berbasis AST, bukan disalin tangan, lalu dibuktikan: 23 dari 23 deklarasi identik dengan aslinya (selain kata `export`), tidak ada yang tersisa di `repository.ts`. `repository.ts` turun dari 4.329 ke sekitar 4.090 baris dan tetap mengekspor `mapEvent` dan `eventPublicInclude` (dipakai `event-revision.ts` dan `preview-token.ts`). Satu-satunya perubahan lain: enam penanda `tags: ["..."]` memakai `CACHE_TAGS`. Server action tetap memakai teks biasa di `revalidateTag("...")`, supaya tabel revalidasi tidak berubah; `shared/constants.test.ts` memastikan setiap teks itu adalah salah satu tag di `CACHE_TAGS`.

Aturan pemindahan yang berlaku untuk PR 1.2 sampai 1.5 dan seterusnya: pindahkan dengan skrip, buktikan identik, jangan ubah logika.

**PR 1.2 sampai 1.5 selesai. Fase 1 selesai.** Semua dipindah dengan skrip AST dan dibuktikan identik dengan aslinya (1.2: 3 dari 3 deklarasi, 1.3: 10 dari 10, 1.4: 5 dari 5, 1.5: 17 dari 17). Test baru dicek dengan perusakan sengaja.
- **1.2** `platform/shared/authz.ts`: `assertUserCanManageEvent`, `assertUserCanReviewStatSubmission`, `assertUserCanManageTeam` (21 test). `repository.ts` mengekspornya ulang, jadi pemanggil dan mock tidak berubah.
- **1.3** `platform/shared/tx.ts`: `runSerializableRegistrationTransaction` (3 kali coba saat P2034), pengecekan jendela pendaftaran, kunci roster, `expireStaleRegistrationRequests` dan `deleteExpiredRequestTeamCopies` (33 test).
- **1.4** `actions/shared`: `session.ts` (`requireAdminSession`, `requireCaptainSession`, `assertWorkspaceEventAction`), `request.ts` (`actionEntityId`, `redirectToRequestedLocale`), `limits.ts`, `ids.ts`. Semuanya modul biasa tanpa `"use server"`.
- **1.5** `actions/shared/uploads.ts`: seluruh kode upload gambar. Lingkaran impor dengan `registration-v3-actions` putus: tiga file di `src/lib/actions` dan satu route kini mengimpor dari `@/lib/actions/shared/uploads`, bukan dari `@/lib/actions`. Daftar pengecualian ESLint mengecil dari 15 ke 13 file (R2 tinggal 11).

**Perubahan perilaku yang disengaja di Fase 1 (commit terpisah `24f4baa`).** Saat PR 1.5, `uploadImageAsset` ternyata terdaftar sebagai server action: `actions.ts` mengekspornya sebagai fungsi `async`. Fungsi ini tidak mengecek sesi dan menerima `folder` serta `entityId` dari pemanggil. Jadi browser bisa memanggilnya langsung. Dicek di hasil build: 96 action terdaftar, setelah ekspor dihapus tinggal 95. Tidak ada kode aplikasi yang memanggilnya dari browser, jadi tidak ada fitur yang berubah. Kalau ingin dikembalikan, cukup revert commit itu. `guards.test.ts` kini menjaga daftar ekspor `actions.ts`: hanya fungsi `async` dan tipe, dan tidak ada pembantu bersama.

**Temuan review keamanan (sudah ada sebelum refactor, belum diperbaiki karena di luar cakupan "pindah saja").**
1. `requireAdminSession` versi lama tidak mengecek `mustChangePassword`.
2. Organizer selalu lolos `assertWorkspaceEventAction`. Pengecekan kepemilikan event yang sebenarnya ada di `assertUserCanManageEvent`, jadi setiap action organizer wajib memanggilnya.
3. Parameter `folder` di `uploadImageAsset` tidak divalidasi terhadap daftar yang diizinkan.
Masuk Fase 4.

**Fase 4, bagian 2: pindah murni (tanpa ubah perilaku).**

*Pecah file besar.* Dipindah dengan skrip AST seperti sebelumnya. Tiap deklarasi dicek identik dengan aslinya, dan tidak ada yang hilang atau dobel.
- `admin/admin-workspace.tsx` (2.212 baris) jadi 373 baris + 7 file di `admin/workspace/` (satu per tahap: `shared`, `header`, `prepare-event-phase`, `import-registration-phase`, `payment-workspace-phase`, `run-match-day-phase`, `review-publish-phase`). Terbesar 465 baris.
- `captain/page.tsx` (1.162 baris) jadi 156 baris + 6 file di `captain/dashboard/`. Terbesar 561 baris.
- `events/public-v3-read.ts` (1.319 baris) jadi 101 baris + 9 file di `events/public-v3/` (`basics`, `parts`, `identity`, `updates`, `registration`, `phases`, `authoritative`, `compat`, `normalize`), disusun menurut lapisan ketergantungan. Daftar ekspor `public-v3-read.ts` sama persis (6 nama, dicek dengan compiler).
- `certificate/template.ts` (957 baris) jadi 568 baris + `template-types`, `template-text`, `template-theme`. `buildCertificateHtml` sendiri 560 baris dan tetap satu fungsi.
- Test yang membaca `admin-workspace.tsx` sebagai teks (`admin/page.test.ts`, `player-score-forms.test.ts`) sekarang membaca gabungan file barunya.

*Pecah file test besar.*
- `platform/repository.test.ts` (3.232 baris, 159 test) jadi 11 file `*.scenarios.test.ts`, satu di folder tiap modul repository. `actions.test.ts` (2.830 baris, 194 test) jadi 9 file di `lib/actions/` (`identity`, `captain`, `event`, `event-visual`, `match`, `import`, `payment`, `team`, `revalidation`). Jumlah test sama persis sebelum dan sesudah (159 dan 194). Tiap file membawa salinan blok tiruan yang dipakainya, lalu bagian yang tidak terpakai dibuang otomatis.
- Dua grup test ternyata bergantung pada sisa tiruan dari test sebelumnya di file yang sama (tiruan transaksi dan sesi login yang tertinggal). Di file terpisah itu gagal, jadi tiap grup kini mengatur sendiri tiruannya. Itu temuan kecil tentang kerapuhan file besar yang lama.

*Akses Prisma.* Action tidak lagi memakai Prisma langsung. Empat belas panggilan dipindah menjadi fungsi kecil di repository bidangnya (`getEventArchiveInfo`, `deleteEvent`, `markEventFinished`, `isEventOpenForCaptainLogin`, `findCaptainTeamRef`, `getTeamForDeletion`, `deleteTeam`, `findCaptainRegistrationRequestRef`, `getUserRoleRef`, `deactivateUser`, `getFinalWinnerTeamId`, dan tiga untuk memasang captain), masing-masing dengan test. Aturan ESLint **R6** menjaganya: file di `src/lib/actions/` tidak boleh mengimpor `@/lib/platform/db`. Satu pengecualian di daftar: `competition-v3-actions.ts` menyerahkan klien Prisma ke modul kompetisi, supaya modul itu bisa dites dengan klien tiruan.

Sisa sekitar 22 file di `src/lib` yang memakai Prisma langsung (`*-read.ts`, `completion/prisma-adapter.ts`, `rate-limit.ts`, `password-reset.ts`, `roster-change-*.ts`, dan sejenisnya) sengaja tidak dipindah. Itu modul akses data per fitur, bukan pelanggaran lapisan. Memindahkannya ke repository bidang berarti menulis ulang, bukan memindah. Yang dijaga: halaman dan komponen (R4) dan action (R6) tidak boleh memakai Prisma.

**Fase 4, bagian 1: perbaikan perilaku.** Berbeda dari Fase 0 sampai 3, ini SENGAJA mengubah perilaku, jadi dibuat di PR sendiri (satu commit per perbaikan, tiap perbaikan dengan test dan dicek dengan perusakan sengaja).

Perbaikan keamanan:
1. `requireAdminSession` (dipakai 30 action lama) tidak mengecek `mustChangePassword`. Organizer yang masih memakai password sementara kini dialihkan ke halaman ganti password, seperti di halaman organizer dan action V3.
2. `uploadImageAsset` menerima `folder` apa saja. Sekarang hanya 11 folder yang dikenal (`UPLOAD_FOLDERS`), dicek di tipe dan saat jalan. Satu test memeriksa bahwa semua folder yang dipakai kode ada di daftar.
3. Impor CSV lama (`importTeams`) memakai `upsert` pada email captain: kalau email di CSV milik akun lain, termasuk admin, password akun itu ditimpa dengan password sementara yang bisa dibaca organizer lewat daftar kredensial. Itu jalan pengambilalihan akun. Sekarang akun yang sudah ada tidak pernah ditimpa: captain lama dipakai ulang apa adanya, dan akun non-captain ditolak ("Email kapten sudah dipakai akun non-captain."), sama seperti jalur impor yang baru.
4. `getPaymentRegistrationRequestsForAdmin` membersihkan permintaan kedaluwarsa (menulis ke database) sebelum mengecek peran. Cek peran sekarang di depan.
5. Pengaturan QRIS global (satu baris untuk seluruh platform) bisa diubah organizer lewat `adminUpdatePaymentSettingsAction`. Sekarang hanya admin platform, dan formnya disembunyikan dari organizer. Organizer tetap memakai QRIS per event.
6. `adminAssignCaptainAction` membiarkan organizer memasang akun captain mana pun ke timnya, dan daftar semua captain (nama, email) dikirim ke halaman organizer. Sekarang organizer hanya melihat dan bisa memasang captain yang sudah punya tim atau pendaftaran di event miliknya. Admin platform tetap melihat semua.

Perbaikan kebenaran data:
7. `createOrUpdateCaptainDraftTeam`: cari lalu tulis kini dalam satu transaksi Serializable (dengan ulang saat bentrok), dan nama atau tag kosong ditolak.
8. `saveRegistrationImportPreviewBatch`: profil dan batch ditulis dalam satu transaksi, jadi batch yang gagal tidak meninggalkan profil.
9. `updateEventStream`: baca, tulis, dan baca ulang dalam satu transaksi. Link tanpa `https://` kini memberi pesan yang bisa dibaca, bukan `TypeError`.
10. `getMatchWithRosterAndStats` tidak lagi menelan semua error sebagai "tidak ada konteks skor". Hanya dua pesan yang memang berarti itu ("Completed match not found." dan "Completed MatchGame rows are required...") yang ditelan. Error database sampai ke pemanggil.
11. `getEventRoundConfigs` dan `getMatchGamesForEvent` tidak lagi mengembalikan hasil kosong saat database gagal.
12. `captainSaveDraftTeamAction`: pesan zod mentah berbahasa Inggris diganti pesan yang bisa dibaca, dan error tak terduga masuk log server.
13. `adminSaveMatchPlayerStatsAction`: error tidak lagi dilempar mentah ke halaman error. Admin dikembalikan ke halaman pertandingan dengan pesan, error tak terduga masuk log, dan cek event dilakukan sebelum cek tim.

Sengaja TIDAK diubah:
- `getModeForEvent` tidak mengecek bahwa mode itu milik game event. Menambah cek berarti halaman publik bisa gagal total kalau ada data lama yang tidak cocok. Lebih buruk dari kebiasaan sekarang.
- `updatePaymentSettings` mengubah `undefined` jadi `null`. Itu cara admin mengosongkan kolom lewat form, jadi memang disengaja.
- `getBracketSlotCount` bertipe minimal 8, padahal hasilnya bisa 2 atau 4 untuk tim sedikit. Hanya salah tipe; mengubah hasilnya mengubah ukuran bracket.
- Email yang sama di dua baris CSV: tidak lagi merusak password (poin 3), jadi dibiarkan.
- Organizer bisa menebak apakah sebuah email sudah terdaftar lewat pesan impor ("Email kapten sudah dipakai akun non-captain"). Kebocoran kecil dan sudah ada di jalur impor baru. Dicatat.
- Saat flag `organizer_workspace_v3` mati, `adminUpdateEventStatusAction` membiarkan organizer menerbitkan event miliknya tanpa cek kesiapan terbit. Itu aturan produk, bukan celah akses. Dicatat.
- `public-visual-v2.smoke.spec.ts` masih bergantung data demo dan masih diabaikan. Perlu keputusan: data seed atau dihapus.

Audit kepemilikan: satu agen keamanan menelusuri semua 52 action. Selain butir 5 dan 6 di atas, tidak ada jalan bagi organizer untuk membaca atau mengubah event, tim, pertandingan, statistik, atau permintaan bayar milik organizer lain.

**Fase 3 selesai (3.0 sampai 3.9).** `src/lib/actions.ts` (1.759 baris, 52 action) sudah habis dan dihapus. Isinya pindah ke 8 file `"use server"` di `src/lib/actions/`, dipindah dengan skrip AST seperti di Fase 1 dan 2:

| PR | File | Isi |
|---|---|---|
| 3.1 | `identity-actions.ts` | daftar captain, login, ganti dan reset password, nonaktifkan user, tetapkan captain |
| 3.2 | `event-actions.ts` | buat, status, arsip, stream, info publik, warna aksen, gambar karakter |
| 3.3 | `event-visual-actions.ts` | logo dan gambar visual event |
| 3.4 | `registration-actions.ts` | daftar tim, draft, bukti bayar, pengaturan bayar, setuju atau tolak, 6 fungsi pembungkus V3 |
| 3.5 | `import-actions.ts` | impor CSV, preview, commit |
| 3.6 | `team-actions.ts` | logo tim, pemain, captain tampilan, hapus tim |
| 3.7 | `match-actions.ts` | hasil pertandingan, pengaturan babak, game per pertandingan, statistik |
| 3.8 | `certificate-actions.ts` | buat ulang sertifikat |

Satu modul biasa baru: `actions/shared/schemas.ts` (`isHttpUrl` dan `optionalPublicUrlSchema`, dipakai event dan registration). Bukan file `"use server"`, jadi tidak jadi pintu untuk browser.

Cara membuktikannya sama seperti sebelumnya: semua deklarasi yang dipindah identik dengan aslinya (selain impor), ke-52 nama action yang diekspor masih ada tepat satu kali, dan tidak ada nama yang bertambah. Fungsi bantu (`uploadEventLogo`, `uploadEventVisual`, `requestPasswordResetActionImpl`, `generateCertificateForFinalMatch`, dan sebagainya) tetap privat di file-nya. Jumlah server action di hasil build tetap 95. Ukuran bundle per rute sama dengan sebelum Fase 3 (selisih paling besar 1 byte), JS bersama 102 kB, Middleware 51,4 kB.

**Pengecekan 3.0.** Tidak dibuat PR sendiri: `next build` lolos dengan 8 file baru dan 95 action terdaftar, jadi pola per file terbukti.

**Sapuan pengimpor.** Semua file pengimpor `@/lib/actions` (halaman, komponen klien, test) diganti per nama lewat skrip, termasuk pemecahan `vi.mock`. Seluruh test dijalankan dengan klien Prisma yang melempar error kalau disentuh: tidak ada akses baru ke Prisma asli.

**Aturan ESLint R2 dihapus.** Aturan itu melarang impor `@/lib/actions`. Modulnya sudah tidak ada, jadi TypeScript yang menolaknya. Daftar pengecualian ESLint tinggal 2 file (R4 satu, R5 satu).

**Test baru dan penyesuaian.**
- Dua action yang tidak punya test perilaku sama sekali sekarang punya: `captainSaveDraftTeamAction` (40 test) dan `adminSaveMatchPlayerStatsAction` (51 test). Dicek dengan perusakan sengaja: 5 dari 5 tertangkap.
- `actions-server-contract.test.ts` kini memeriksa semua file `"use server"` di `src/lib/actions`, bukan hanya `actions.ts`.
- `guards.test.ts` menjaga daftar ekspor 8 file baru: hanya fungsi `async` dan tipe, tepat 52 action, tanpa pembantu bersama.
- Pembaca file sumber di `player-score-forms.test.ts` dan `security-smoke.test.ts` diarahkan ke file baru.

**Kebiasaan aneh yang ditemukan test baru (tidak diubah, sudah ada sebelum refactor).** Masuk Fase 4:
- `captainSaveDraftTeamAction`: kalau isian nama atau tag kosong, captain melihat pesan zod mentah berbahasa Inggris ("Invalid input: expected string, received null") di URL. Error tak terduga ditutup jadi "Gagal menyimpan draft tim." tanpa log di server, jadi operator tidak pernah melihatnya (beda dengan `captainRegisterTeamAction`).
- `adminSaveMatchPlayerStatsAction`: error tidak dialihkan ke halaman, tapi dilempar mentah (`ZodError`, "Team is not part of this match", dan seterusnya). Cek tim jalan sebelum cek event, jadi tim yang salah menutupi event yang salah. Action tidak mengecek status pertandingan sendiri. Form tanpa kolom `stat_` tetap menulis `stats: {}`, dan nilai kosong dihitung 0. Pengalihan sukses selalu ke `/admin?...`, juga untuk organizer, dan mengabaikan `locale`.

**Risiko saat deploy.** ID server action di Next dihitung dari file dan nama fungsinya. Halaman yang masih terbuka di browser pengunjung saat deploy memanggil ID lama, dan Next menjawab "Failed to find Server Action" sampai halaman dimuat ulang. Ini terjadi di setiap deploy yang memindahkan action, dan tidak bisa dihindari. Sebaiknya deploy di jam sepi.

**Fase 2 selesai (2.1 sampai 2.14).** `src/lib/platform/repository.ts` (3.945 baris) sudah habis dan dihapus. Isinya pindah ke 13 modul, dipindah dengan skrip AST seperti di Fase 1:

| PR | Modul | Baris |
|---|---|---|
| 2.1 | `platform/settings-repository.ts` | 101 |
| 2.2 | `events/repository.ts` | 510 |
| 2.3 | `events/visual-repository.ts` | 153 |
| 2.4 | `teams/repository.ts` | 211 |
| 2.5 | `bracket/repository.ts` | 322 |
| 2.6 | `bracket/rounds-repository.ts` | 171 |
| 2.7 | `registration/repository.ts` | 499 |
| 2.8 | `registration/review-repository.ts` | 253 |
| 2.9 | `imports/repository.ts` | 623 |
| 2.10 | `player-stats/repository.ts` | 315 |
| 2.11 | `player-stats/write-repository.ts` | 499 |
| 2.12 | `certificate/repository.ts` | 250 |
| 2.13 | `identity/repository.ts` | 108 |

Setiap pemindahan dibuktikan begini: semua deklarasi yang dipindah identik dengan aslinya (selain kata `export`), dan daftar ekspor `repository.ts` sebelum dan sesudah pindah persis sama (dicek dengan compiler). Jadi tidak ada kode yang berubah dan tidak ada nama yang hilang. Modul belakang hanya mengimpor modul depan. Tidak ada impor melingkar yang dievaluasi saat dimuat (diperiksa reviewer).

Pembantu yang tadinya privat (misalnya `getBracketRoundLabel`, `generateCaptainEmail`) sekarang diekspor dari modulnya supaya bisa dites dan dipakai modul lain. Tidak ada file `"use server"` yang mengekspor ulang satu pun. Jumlah server action tetap 95 (dicek di hasil build).

**Celah test ditutup.** Dari 140 fungsi bernama di 13 modul, 44 belum dijalankan test mana pun. Sekarang semuanya dijalankan: 318 test baru di 11 file `repository.test.ts` (satu per modul yang punya celah). Pernyataan yang tercakup di 13 modul itu 87,7%. Test dicek dengan perusakan sengaja: 11 dari 11 perusakan di fungsi yang dites tertangkap.

**Sapuan (2.14).** 130 file pengimpor diganti lewat skrip: impor dan `vi.mock` dipecah per modul. Lima kasus dikerjakan tangan (`bracket/page.test.ts`, `organizer-workspace-read.test.ts`, `repository.db.test.ts`, `roster-change.integration.test.ts`, skrip `generate-certificate.ts`). Dicek bahwa mock tidak diam-diam jatuh ke Prisma asli: seluruh test dijalankan dengan klien Prisma yang melempar error kalau disentuh. Hasil sebelum dan sesudah sapuan sama. Satu penyesuaian: tiga test yang mock `next/cache` perlu `unstable_cache`, karena modul asli kini ikut dimuat lewat impor tidak langsung.

Aturan ESLint R3 sekarang menjaga 13 modul baru (komponen tidak boleh mengimpor nilainya).

**Kebiasaan aneh yang ditemukan test baru (tidak diubah, sudah ada sebelum refactor).** Masuk Fase 4:
- `getPaymentRegistrationRequestsForAdmin` membersihkan permintaan kedaluwarsa sebelum cek peran, jadi pemanggil yang tidak berhak tetap memicu tulis ke database sebelum ditolak.
- `createOrUpdateCaptainDraftTeam` tanpa transaksi dan tanpa validasi: cari lalu buat, bisa menghasilkan dua draft kalau dua permintaan datang bersamaan.
- `saveRegistrationImportPreviewBatch` membuat profil dan batch tanpa transaksi: kalau batch gagal, profil tertinggal.
- `updateEventStream` menulis lalu membaca ulang tanpa transaksi. URL YouTube tanpa `https://` melempar `TypeError`.
- `getModeForEvent` tidak mengecek bahwa mode itu milik game event.
- `updatePaymentSettings` mengubah `undefined` jadi `null`, jadi update sebagian menghapus kolom yang tidak dikirim.
- `getMatchWithRosterAndStats` menelan semua error dari `getPlayerStatFormContext` jadi `scoreGameNumbers: null`.
- `getBracketSlotCount` bertipe minimal 8, tapi untuk 4 tim atau kurang hasilnya 4 atau 2.
- `generateCaptainEmail` tidak membuang duplikat email yang ditulis sendiri.

**Fase 0 diperiksa ulang di atas `main` (2026-10-12).** Sejak rehearsal dibuat, `main` menambah 12 commit (fitur ganti roster, pin event unggulan di beranda, `UserFacingError`, job CI `New migrations`, dan lainnya). Penggabungan percobaan menghasilkan 5 konflik, semuanya sudah dibereskan:
- `repository.ts` (4 tempat): `main` menambah filter `removedAt: null` di tiga pembaca pemain yang masih punya cadangan data demo. Hasilnya menggabungkan keduanya: tanpa cadangan, dengan filter. Fungsi `createTeamRegistrationRequest` versi transaksi kita memakai `UserFacingError` seperti konvensi `main`.
- `ci.yml` dan `e2e-ci.test.ts`: job `build` dan `database-tests` kita hidup berdampingan dengan job `new-migrations` dari `main`.
- `public-error.test.ts`: kedua pihak membuat file dengan nama yang sama. Dipakai versi `main`; dua tambahan kita di daftar pesan aman tidak diperlukan lagi.
- `repository.test.ts`: blok test baru `main` dipertahankan.

Hasil setelah digabung: `tsc`, eslint (kode baru dari `main` tidak melanggar aturan impor), 3.348 test unit, `pnpm build` tanpa database, 24 test smoke, dan 4 test database (5 kali berturut-turut, dengan 40 migrasi termasuk milik `main`) semuanya lolos. Satu test gagal dan memang dirancang untuk itu: tabel revalidasi kini mencatat 3 fungsi baru dari fitur ganti roster (`captainRequestRosterChangeAction`, `captainCancelRosterChangeAction`, `refreshRosters`). Ukuran setelah Fase 0 ada di `baseline.md`.

**PR 0.8 selesai. Fase 0 selesai.** Dua hal:
- `docs/architecture.md`: lapisan dan arah panggilan, susunan folder sekarang dan tujuan, aturan impor, aturan server action, penanganan error, pengaman otomatis, dan cara menambah fitur selama refactor.
- Aturan impor ESLint (`no-restricted-imports`, level `error`, tanpa paket baru): R1 `demo-store` terlarang di kode produksi, R2 jangan impor `@/lib/actions`, R3 komponen tidak mengimpor nilai dari repository, R4 halaman dan komponen tidak memakai Prisma langsung, R5 `src/lib` tidak mengimpor halaman atau komponen. Definisi di `eslint.import-rules.mjs`, daftar pengecualian di `eslint.import-baseline.mjs` (15 file, hanya boleh mengecil). ESLint hanya menyimpan satu pengaturan `no-restricted-imports` per file, jadi modul itu membuat satu blok konfigurasi per kombinasi aturan, dibaca dari daftar file saat ESLint mulai. Folder seperti `[locale]` di-escape karena dianggap pola glob.
- `src/eslint-import-rules.test.ts` (15 test) menjaga aturan itu: tiap aturan menandai pelanggaran baru, impor yang diizinkan lolos, pengecualian hanya berlaku untuk aturan yang tertulis, dan daftar pengecualian tidak berisi file yang sudah hilang.

Yang tidak dibekukan: `@/lib/platform/repository` (65 file mengimpornya). Selama Fase 2 kode baru masih membutuhkannya. Pembekuan dipikirkan lagi di PR 2.14. Impor dinamis (`import()`) tidak dijangkau aturan bawaan ESLint.

**PR 0.7 selesai.** Dua lapis test untuk `revalidatePath` dan `revalidateTag`:
- `src/lib/revalidation-map.test.ts`: tabel 60 fungsi dengan 112 panggilan di 11 file `"use server"`. Tabel dihasilkan dari pemindaian kode (TypeScript compiler), dikunci dengan nama fungsi. Memindahkan action ke file lain tetap lolos. Menghapus, menambah, atau mengubah satu panggilan membuat test gagal. Aturan Fase 3: kalau perubahan itu disengaja, ubah tabelnya di PR yang sama.
- Delapan baris test perilaku di `actions.test.ts` untuk action yang tadinya tidak punya test sama sekali: `adminAssignCaptainAction`, `adminDeactivateUserAction`, `adminArchiveEventAction`, `adminDeleteTeamAction`, `adminRejectStatAction`, `adminSetAccentColorAction`, `adminRegenerateCertificateAction`, `captainSetDisplayCaptainAction`. Tiap baris memeriksa daftar panggilan yang tepat setelah action sukses.

Dicek dengan perusakan sengaja: menghapus panggilan, mengganti halaman, atau membuat panggilan tidak pernah jalan. Yang terakhir hanya tertangkap test perilaku, sehingga kedua lapis memang saling melengkapi.

Belum ada test perilaku untuk sekitar 24 fungsi lain yang merevalidasi (misalnya `captainSaveDraftTeamAction`, `adminSaveMatchPlayerStatsAction`, `adminActivateEventVisualAction`, dan fungsi di `src/lib/actions/*`). Kodenya dijaga tabel statis. Tambahkan test perilakunya di PR Fase 3 yang memindahkan action itu, tepat sebelum dipindah.

**PR 0.6 selesai.** Cadangan data demo dihapus dari 21 tempat di `repository.ts` dan dari beranda jalur lama. Error database sekarang diteruskan ke halaman error yang ramah (`[locale]/error.tsx`, `global-error.tsx`). Hasil dan temuan ada di bagian "Hasil PR 0.6" di `demo-fallback-decision.md`. Dua temuan penting: error di `generateMetadata` menjatuhkan seluruh halaman (diperbaiki dengan `readEventForMetadata`), dan ada empat pembaca lain yang menelan error dengan nilai kosong (belum ditangani).

**PR 0.4 selesai.** File `repository.db.test.ts` menjalankan empat test dengan Postgres asli: balapan slot di `registerTeam`, nama tim sama dan captain ganda di `createTeamRegistrationRequest`, dan batas slot di `approveTeamRegistrationRequest`. Test dilewati kalau `REGISTRATION_TEST_DATABASE_URL` tidak ada. Test menolak database yang bukan lokal, yang namanya tidak mengandung "test", atau yang host-nya diganti lewat parameter URL, karena kode yang dites ikut mengubah baris kedaluwarsa lain di database itu. Job CI `database-tests` menjalankannya di Postgres 18 sementara. Cara menjalankan di laptop ada di komentar paling atas file test.

Temuan dari PR 0.4:
- **Dua lapis pengaman.** Transaksi (klaim `competitionVersion` di baris event, ditambah Serializable) menjaga jumlah slot. Indeks unik parsial di `TeamRegistrationRequest` menahan captain ganda dan nama atau tag tim yang sama. Indeks itu dibuat lewat SQL migrasi dan **tidak ada di `schema.prisma`**. Jangan jalankan `prisma db push` ke database yang penting, karena indeks itu bisa hilang.
- **Isolation bukan satu-satunya penjaga slot.** Kalau Serializable diganti ReadCommitted, test slot tetap lolos, karena klaim di baris event sudah membuat transaksi antre. Pengamannya berlapis, bukan satu.
- **Test dicek dengan mutasi.** Test gagal kalau pengecekan slot di `registerTeam` atau persetujuan dihapus, kalau klaim versi event dihapus, atau kalau jalur permintaan bayar ikut menaikkan versi event. Dijalankan 20 kali berturut-turut tanpa gagal.
- **Belum tertangkap oleh test database:** pemetaan error P2002 ke pesan yang jelas. Postgres melaporkan bentrok insert di Serializable sebagai kegagalan serialisasi, jadi jalur itu jarang terpicu. Pemetaannya dijaga test dengan mock.

**Dua fungsi dihapus:** `createCaptainWithTeam` dan `createCaptainWithPendingPayment` tidak dipanggil dari kode produksi sejak commit `37626cd` (30 Agustus), saat form daftar berubah jadi hanya membuat akun. Alurnya sekarang dua langkah: buat akun, lalu isi form tim di halaman daftar event. Kedua fungsi bisa dipulihkan dari git (commit `37626cd^`). Perbaikan nomor 1, 4, dan 5 di atas hanya berefek di `createTeamRegistrationRequest` dan `createCaptainAccount`.

**Belum dites di `setMatchResult`:** jalur sukses Single Elimination yang membuat baris pertandingan dari bracket proyeksi. Tutup di PR 2.5 sebelum dipindah.

**Test yang kadang gagal:** `tests/performance/organizer-readers.test.ts` ("runs scripts/load-test.mjs ...") pernah kena batas waktu 5 detik saat jalan bersama coverage. Run ulang lolos.
