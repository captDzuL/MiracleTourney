# Miracle League

Miracle League adalah platform turnamen komunitas untuk beberapa game. Organizer menjalankan event dari pendaftaran tim sampai hasil akhir. Peserta melihat jadwal, bracket, klasemen, dan sertifikat di satu tempat. Situs tersedia dalam Bahasa Indonesia dan Inggris.

Situs publik: [miracle-league.fun](https://miracle-league.fun)

---

## Untuk siapa

| Peran | Yang bisa dilakukan |
|---|---|
| Pengunjung | Melihat event, jadwal, bracket, klasemen, leaderboard, dan peserta. Memeriksa keaslian sertifikat. |
| Captain | Mendaftarkan tim, mengisi roster, membayar biaya pendaftaran, meminta ganti pemain, dan mengirim statistik pertandingan. |
| Organizer | Membuat dan mengelola event miliknya: pengaturan, pendaftaran, pembayaran, jadwal, hasil pertandingan, dan sertifikat. |
| Platform admin | Mengelola semua event dan organizer, dan membantu urusan operasional. |

Organizer tidak bisa melihat atau mengubah event organizer lain.

---

## Fitur utama

- **Daftar event** dengan filter game dan status, lengkap dengan hadiah, biaya, venue, dan slot peserta.
- **Pendaftaran tim** dengan biaya (QRIS dan bukti bayar), tinjauan oleh organizer, dan impor pendaftaran dari file Excel atau CSV.
- **Format turnamen** yang bisa diatur: gugur satu kali, gugur ganda, liga, atau grup lalu gugur, dengan BO1, BO3, dan BO5.
- **Jadwal, bracket, klasemen, dan leaderboard** yang ikut berubah saat hasil pertandingan masuk.
- **Ganti pemain** setelah drawing lewat permintaan yang disetujui organizer.
- **Statistik pemain**: captain mengirim, organizer menyetujui atau menolak, lalu tampil di leaderboard.
- **Sertifikat** untuk juara, runner-up, peringkat ketiga, MVP, dan penghargaan pemain (pencetak poin, bertahan, assist), dengan kode verifikasi publik.
- **Reset password lewat email** untuk captain dan organizer.

---

## Alur penggunaan

1. Organizer membuat event, mengatur format, jadwal, biaya, dan tampilan, lalu menerbitkannya.
2. Captain membuat akun, mendaftarkan tim, mengisi roster, dan mengirim bukti bayar bila event berbiaya.
3. Organizer menyetujui pendaftaran, lalu menutup pendaftaran dan membuat drawing.
4. Organizer mengisi hasil pertandingan. Bracket dan klasemen terbarui sendiri.
5. Captain mengirim statistik, organizer menyetujuinya.
6. Organizer menutup turnamen. Juara, penghargaan, dan sertifikat terbit.

---

## Halaman penting

Semua alamat di bawah diawali bahasa: `/id` atau `/en`. Alamat tanpa bahasa dialihkan otomatis.

| Alamat | Fungsi |
|---|---|
| `/` | Beranda |
| `/events` | Daftar event |
| `/events/[slug]` | Detail event |
| `/events/[slug]/participants` | Peserta |
| `/events/[slug]/schedule` | Jadwal |
| `/events/[slug]/bracket` | Bracket |
| `/events/[slug]/standings` | Klasemen |
| `/events/[slug]/leaderboards` | Leaderboard pemain |
| `/events/[slug]/register` | Pendaftaran tim |
| `/certificates/verify/[kode]` | Periksa keaslian sertifikat |
| `/login`, `/register`, `/forgot-password` | Masuk, daftar, lupa password |
| `/captain`, `/captain/stats`, `/captain/settings` | Dashboard captain |
| `/organizer` | Daftar event organizer |
| `/organizer/events/[id]/...` | Ruang kerja satu event: ringkasan, pendaftaran, peserta, jadwal, kontrol pertandingan, penutupan, sertifikat, pengaturan |
| `/admin` | Dashboard platform admin |

---

## Teknologi

Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS 4, Prisma 6 dengan PostgreSQL, next-intl, Vercel dan Vercel Blob, Resend untuk email, Vitest untuk test unit, dan Playwright untuk test browser.

---

## Mulai cepat

Butuh Node 24, pnpm 10, dan PostgreSQL 18.

```bash
pnpm install
cp .env.example .env        # isi DATABASE_URL, DIRECT_URL, JWT_SECRET
pnpm prisma migrate deploy
pnpm db:seed:test
pnpm dev
```

Buka `http://localhost:3000`. Langkah lengkap, akun hasil seed, dan masalah yang sering muncul ada di [docs/development/setup.md](docs/development/setup.md).

**Jangan jalankan seed di database produksi.**

---

## Variabel environment

Wajib: `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`. Sisanya opsional dan dikelompokkan menurut fungsi: alamat situs, email, sertifikat, seed, dan flag fitur. Daftar lengkap ada di [`.env.example`](.env.example) dan dijelaskan di [docs/development/environment.md](docs/development/environment.md).

---

## Perintah penting

| Perintah | Fungsi |
|---|---|
| `pnpm dev` | Jalankan server development |
| `pnpm build` | Build produksi |
| `pnpm lint` | Cek tipe dengan `tsc` |
| `pnpm exec eslint .` | Aturan kode dan aturan impor |
| `pnpm test:unit` | Test unit |
| `pnpm test:coverage` | Test unit dengan laporan coverage |
| `pnpm test:e2e:smoke` | Cek cepat halaman publik di browser |
| `pnpm test:e2e` | Test browser penuh (butuh database uji) |
| `pnpm db:seed:test` | Isi akun uji |
| `pnpm db:seed` | Isi data contoh lengkap |

---

## Arsitektur

Halaman dan komponen menampilkan data. Perubahan data hanya lewat server action di `src/lib/actions/<bidang>-actions.ts`. Akses database ada di file repository tiap bidang (`src/lib/<bidang>/repository.ts`). ESLint menjaga arah ini. Penjelasan lengkap, termasuk aturan impor dan aturan server action, ada di [docs/architecture.md](docs/architecture.md).

---

## Test dan CI

CI di GitHub menjalankan: cek tipe, ESLint, test unit, build produksi, test database dengan Postgres 18, pengecekan migrasi baru, dan pengecekan skema Prisma terhadap migrasi.

Test browser (Playwright) **tidak** dijalankan di CI. Jalankan sendiri sebelum rilis. Caranya ada di [docs/testing/v3-e2e-and-preview.md](docs/testing/v3-e2e-and-preview.md).

---

## Rilis dan migrasi database

Build Vercel **tidak** menjalankan migrasi. Kalau PR menambah migrasi, CI memberi peringatan, dan build produksi gagal selama migrasinya belum terpasang di database produksi. Pasang dulu dengan `pnpm prisma migrate deploy` memakai `DIRECT_URL` produksi, lalu deploy. Langkah rilis, rollback, dan pemulihan ada di folder [docs/operations](docs/operations).

---

## Aturan berkontribusi

- Kode produksi tidak memakai data demo. Kalau database gagal, tampilkan error, jangan data palsu.
- Teks untuk pengguna memakai Bahasa Indonesia sehari-hari: kata biasa, kalimat pendek, satu istilah untuk satu hal.
- File server action diawali `"use server"` dan hanya mengekspor fungsi `async`. Taruh di `src/lib/actions/<bidang>-actions.ts`.
- Action yang memanggil `revalidatePath` atau `revalidateTag` perlu satu baris di `src/lib/revalidation-map.test.ts`.
- Daftar pengecualian ESLint (`eslint.import-baseline.mjs`) hanya boleh mengecil.
- Jalankan `pnpm lint`, `pnpm exec eslint .`, dan `pnpm test:unit` sebelum membuka PR.

---

## Dokumentasi lain

| Dokumen | Isi |
|---|---|
| [docs/architecture.md](docs/architecture.md) | Susunan kode dan aturan |
| [docs/development](docs/development) | Setup lokal, variabel environment, unggah gambar |
| [docs/operations](docs/operations) | Rilis, flag fitur, pemulihan, keamanan, observabilitas |
| [docs/testing](docs/testing) | Test browser dan pengecekan sebelum presentasi |
| [docs/refactor/PLAN.md](docs/refactor/PLAN.md) | Catatan refactor dan keputusan |

---

## Status

Alur lengkap sudah berjalan: dari pendaftaran sampai sertifikat. Tampilan V3 dan tampilan lama ada berdampingan dan diatur lewat flag fitur (lihat [matriks flag](docs/operations/v3-feature-flag-matrix.md)). Tampilan lama dipertahankan sebagai jalur mundur sampai peralihan dinyatakan stabil. Belum ada: co-organizer per event, izin staf yang rinci, pembayaran otomatis, dan pembayaran hadiah otomatis.
