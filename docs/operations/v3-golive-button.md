# Tombol Go-live V3 (otomatis) — 7 Oktober 2026

Status: **sudah ditulis dan diuji dengan data palsu; belum pernah dijalankan ke produksi.**
Isi file ini hanya cara memakainya. Tidak ada yang berubah di produksi sampai kamu menekan
tombolnya dan menyetujuinya.

## Apa yang dilakukan tombol ini

Workflow GitHub `V3 go-live` (`.github/workflows/go-live.yml`), dijalankan manual dari tab
**Actions**:

1. **Preflight, hanya baca.** Vercel harus sudah aman (build command tanpa migrasi, semua
   flag V3 Production = `false`), database yang dituju harus benar-benar host produksi, dan
   branch Neon produksi harus ada.
2. **Latihan deploy di Preview** untuk commit yang sama, sebelum apa pun diubah. Kalau
   panggilan deploy atau build-nya gagal, berhenti di sini dan tidak ada yang berubah.
3. **Checkpoint Neon.** Membuat branch anak dari produksi (salinan data saat itu, tanpa
   compute).
4. **Migrasi.** `prisma migrate deploy` (dilewati bila sudah terpasang semua), lalu cek:
   jumlah migrasi terpasang sama dengan folder `prisma/migrations` (38), tidak ada drift
   skema, dan struktur fisik database sama dengan contoh yang dibangun dari migrasi di
   PostgreSQL 18 (dua perbedaan yang sudah diketahui diizinkan).
5. **Deploy produksi dengan semua flag V3 mati**, lalu cek halaman utama dan halaman
   daftar event (`/`, `/events`, `/id/events`, `/en/events`).
6. **Nyalakan flag bertahap** (5 langkah, urutan di `v3-feature-flag-matrix.md`). Tiap
   langkah: ubah flag Production jadi `true`, deploy ulang, cek halaman. Kalau gagal, flag
   langkah itu **otomatis dimatikan lagi**, deploy ulang, dan proses berhenti; langkah
   sebelumnya tetap menyala.
7. Menampilkan nilai akhir flag.

Yang **tidak** dilakukan (dan tidak perlu): mengubah cabang produksi Vercel. Deploy produksi
dibuat lewat API dengan SHA commit, jadi cabang produksi `master` boleh dibiarkan dan
merge ke `main` tidak memicu deploy produksi. Yang juga tidak dilakukan: menyalakan
`email_password_reset`, menghapus branch checkpoint, atau menjeda penulisan (itu
tugasmu, lihat "Sebelum menekan tombol").

## Persiapan sekali saja (kamu, di GitHub)

1. Pakai **Environment** bernama `production` (Settings → Environments; buat bila belum
   ada). Aktifkan **Required reviewers** dan pilih dirimu, supaya setiap run menunggu
   persetujuanmu. Nama ini harus sama persis dengan `environment:` di `go-live.yml`;
   bila berbeda, GitHub membuat environment baru tanpa secrets dan tanpa reviewer.
2. Di environment itu, tambahkan **secrets** (jangan tempel di chat):
   - `PROD_DIRECT_URL`: `DIRECT_URL` database produksi (host `ep-sparkling-night-…`).
   - `NEON_API_KEY`: key Neon yang boleh membuat branch di project `steep-tree-47893196`.
   - `VERCEL_TOKEN`: token Vercel yang boleh mengubah env variable dan membuat deployment.
   - `NEON_PROD_HOST`: boleh sama dengan yang sudah dipakai CI (host produksi).
3. GitHub hanya menampilkan tombol "Run workflow" untuk workflow yang **file-nya sudah ada
   di branch default (`main`)**. Jadi `go-live.yml` harus masuk ke `main` lebih dulu
   (merge terpisah; file ini tidak berbahaya karena hanya jalan manual). Saat menjalankan,
   pilih branch rilis di kotak "Use workflow from". Tombol selalu men-deploy **commit
   ujung branch yang kamu pilih**, tidak ada kolom untuk memilih commit lain.

## Cara memakai

1. **Dry-run dulu** (pilihan bawaan): Actions → V3 go-live → Run workflow, mode `dry-run`.
   Hanya membaca. Di log akan muncul kalimat konfirmasi yang dibutuhkan, mis.
   `GO-LIVE 1a2b3c4d`. Semua langkah harus hijau.
2. **Sebelum menekan tombol live:** umumkan jendela waktu, minta organizer berhenti
   mengisi data, dan pastikan kamu sudah membaca `v3-incident-restore-runbook.md`.
3. Run workflow lagi: mode `go-live`, isi kolom `confirm` dengan kalimat tadi, centang
   `writes_paused`. Setujui di halaman run (reviewer).
4. Tunggu sampai selesai. Log bisa dibagikan, tidak ada rahasia di dalamnya.

## Kalau gagal

- Gagal sebelum langkah "Checkpoint": tidak ada yang berubah.
- Gagal saat migrasi: berhenti, **tidak ada deploy**. Ada branch checkpoint di Neon.
  Jangan jalankan ulang tanpa membaca errornya; hubungi saya dengan log-nya.
- Gagal saat menyalakan flag: flag langkah itu sudah mati lagi otomatis; langkah
  sebelumnya tetap menyala. Aplikasi tetap melayani.
- Pesan "rollback failed": matikan flag yang disebut di Vercel lalu Redeploy sendiri.
- Data rusak: pakai `v3-incident-restore-runbook.md` (restore ke branch baru).

## Batasan yang jujur

- Bagian yang bicara dengan Vercel dan Neon (membuat deployment, mengubah env, membuat
  branch) diuji dengan respons palsu dan dengan pembacaan nyata; **penulisan nyata belum
  pernah dicoba**. Karena itu ada latihan deploy di Preview sebelum migrasi. Pembuatan
  branch Neon dan perubahan env baru terbukti saat run live.
- Selama migrasi sampai deploy baru selesai, kode produksi lama masih melayani database
  yang sudah dimigrasi. Itu jendela pendek yang diperkirakan; jeda penulisan mengurangi
  dampaknya. Menjalankan di jam sepi.
- Cek halaman hanya memastikan HTTP 200 dan tidak ada "Application error". Itu bukan
  pengganti pemeriksaan manual halaman organizer setelah tiap langkah.
