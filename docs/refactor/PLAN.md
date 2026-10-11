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
   - Jadi penghapusan jadi PR sendiri di Fase 0 (PR 0.5 dan 0.6). PR itu harus selesai dan diamati sebelum kode dipindah.
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

## Fase 4: Nanti, di luar rencana ini

Putuskan setelah Fase 3:
- Pisahkan logika ke `service.ts`, mulai dari `adminPreviewRegistrationImportAction`.
- Buat antarmuka repository.
- Pecah `admin-workspace.tsx`, `captain/page.tsx`, dan `public-v3-read.ts`.
- Gabungkan pemakaian Prisma langsung di sekitar 35 file `src/lib`.

## Waktu dan titik evaluasi

37 PR: Fase 0 ada 8, Fase 1 ada 5, Fase 2 ada 14, Fase 3 ada 10. Satu PR per sesi pendek. PR berat (B) satu per sesi.

Titik evaluasi:
- Akhir Fase 0: data demo sudah hilang di produksi tanpa masalah.
- Akhir Fase 1: folder bersama sudah stabil.
- Akhir Fase 2: `repository.ts` sudah habis.

## Cara cek hasil

Tiap PR: lima perintah di "Aturan tiap PR". Jumlah test tidak boleh turun. Ringkasan perubahan (`git diff --stat -M`) harus menunjukkan file yang dipindah, bukan ditulis ulang.

Tiap akhir fase: bandingkan ukuran bundle dan waktu build dengan `baseline.md`.

Setelah PR 0.6 di-deploy: pantau log error database di halaman publik sebelum lanjut ke Fase 1.

## Daftar kemajuan

Fase 0:
- [x] 0.1
- [x] 0.2
- [x] 0.3
- [x] 0.4
- [x] 0.5
- [ ] 0.6
- [ ] 0.7
- [ ] 0.8

Fase 1:
- [ ] 1.1
- [ ] 1.2
- [ ] 1.3
- [ ] 1.4
- [ ] 1.5

Fase 2:
- [ ] 2.1
- [ ] 2.2
- [ ] 2.3
- [ ] 2.4
- [ ] 2.5
- [ ] 2.6
- [ ] 2.7
- [ ] 2.8
- [ ] 2.9
- [ ] 2.10
- [ ] 2.11
- [ ] 2.12
- [ ] 2.13
- [ ] 2.14

Fase 3:
- [ ] 3.0
- [ ] 3.1
- [ ] 3.2
- [ ] 3.3
- [ ] 3.4
- [ ] 3.5
- [ ] 3.6
- [ ] 3.7
- [ ] 3.8
- [ ] 3.9

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
5. Email kembar saat daftar memberi pesan "Email ini sudah terdaftar. Coba login." Pesan itu dan pesan roster terkunci masuk daftar pesan aman (`SAFE_ACTION_MESSAGES`), supaya sampai ke pengguna.

**PR 0.4 selesai.** File `repository.db.test.ts` menjalankan empat test dengan Postgres asli: balapan slot di `registerTeam`, nama tim sama dan captain ganda di `createTeamRegistrationRequest`, dan batas slot di `approveTeamRegistrationRequest`. Test dilewati kalau `REGISTRATION_TEST_DATABASE_URL` tidak ada. Test menolak database yang bukan lokal, yang namanya tidak mengandung "test", atau yang host-nya diganti lewat parameter URL, karena kode yang dites ikut mengubah baris kedaluwarsa lain di database itu. Job CI `database-tests` menjalankannya di Postgres 18 sementara. Cara menjalankan di laptop ada di komentar paling atas file test.

Temuan dari PR 0.4:
- **Dua lapis pengaman.** Transaksi (klaim `competitionVersion` di baris event, ditambah Serializable) menjaga jumlah slot. Indeks unik parsial di `TeamRegistrationRequest` menahan captain ganda dan nama atau tag tim yang sama. Indeks itu dibuat lewat SQL migrasi dan **tidak ada di `schema.prisma`**. Jangan jalankan `prisma db push` ke database yang penting, karena indeks itu bisa hilang.
- **Isolation bukan satu-satunya penjaga slot.** Kalau Serializable diganti ReadCommitted, test slot tetap lolos, karena klaim di baris event sudah membuat transaksi antre. Pengamannya berlapis, bukan satu.
- **Test dicek dengan mutasi.** Test gagal kalau pengecekan slot di `registerTeam` atau persetujuan dihapus, kalau klaim versi event dihapus, atau kalau jalur permintaan bayar ikut menaikkan versi event. Dijalankan 20 kali berturut-turut tanpa gagal.
- **Belum tertangkap oleh test database:** pemetaan error P2002 ke pesan yang jelas. Postgres melaporkan bentrok insert di Serializable sebagai kegagalan serialisasi, jadi jalur itu jarang terpicu. Pemetaannya dijaga test dengan mock.

**Dua fungsi dihapus:** `createCaptainWithTeam` dan `createCaptainWithPendingPayment` tidak dipanggil dari kode produksi sejak commit `37626cd` (30 Agustus), saat form daftar berubah jadi hanya membuat akun. Alurnya sekarang dua langkah: buat akun, lalu isi form tim di halaman daftar event. Kedua fungsi bisa dipulihkan dari git (commit `37626cd^`). Perbaikan nomor 1, 4, dan 5 di atas hanya berefek di `createTeamRegistrationRequest` dan `createCaptainAccount`.

**Belum diperbaiki, hanya dicatat:** pesan "Tag atau nama tim sudah digunakan di event ini." tidak ada di daftar pesan aman. Pengguna yang kena duplikat nama tim di `captainRegisterTeamAction` melihat pesan umum "Gagal mendaftarkan tim."

**Belum dites di `setMatchResult`:** jalur sukses Single Elimination yang membuat baris pertandingan dari bracket proyeksi. Tutup di PR 2.5 sebelum dipindah.

**Test yang kadang gagal:** `tests/performance/organizer-readers.test.ts` ("runs scripts/load-test.mjs ...") pernah kena batas waktu 5 detik saat jalan bersama coverage. Run ulang lolos.
