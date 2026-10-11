# Arsitektur kode Miracle

Dokumen ini menjelaskan susunan kode, arah panggilan antar bagian, dan aturan impor yang dijaga ESLint. Isinya menggambarkan keadaan **sekarang** dan **tujuan** dari refactor di `docs/refactor/PLAN.md`. Bagian yang belum terjadi diberi tanda "tujuan".

## Lapisan dan arah panggilan

```
Halaman dan komponen (src/app, src/components)
        |  tampil, kirim form
        v
Server action ("use server")
        |  cek sesi dan izin, cek isian, simpan, refresh cache
        v
Repository (akses data)
        |
        v
Prisma  ->  PostgreSQL
```

Aturan dasarnya satu arah: lapisan atas boleh memanggil lapisan di bawahnya, tidak sebaliknya.

- **Halaman** (server component) boleh membaca data lewat fungsi baca di repository. Mereka menerima data lewat props ke komponen.
- **Komponen** tidak membaca database. Mereka menerima data lewat props dan mengirim form ke server action.
- **Server action** adalah satu-satunya tempat yang mengubah data atas permintaan pengguna. Tiap action memeriksa sesi dan izin lebih dulu, lalu menyimpan, lalu memanggil `revalidatePath` atau `revalidateTag`.
- **Repository** adalah satu-satunya tempat yang memakai Prisma untuk data pertandingan, tim, pendaftaran, dan sejenisnya.

Catatan jujur: pembagian ini belum bersih. Sekitar 35 file di `src/lib` masih memakai Prisma langsung (misalnya `events/*-read.ts`, `certificate/*`, `completion/prisma-adapter.ts`). Itu masuk Fase 4 di `PLAN.md`.

## Susunan folder sekarang

| Folder | Isi |
|---|---|
| `src/app` | Halaman, route handler, `error.tsx`, `sitemap.ts`. Ada dua pohon: `src/app/[locale]/...` (yang dipakai pengunjung) dan `src/app/...` tanpa locale. Middleware mengalihkan jalur tanpa locale ke `/[locale]/...`. |
| `src/components` | Komponen: `admin`, `panel`, `public-v2`, `registration`, `v3`. |
| `src/lib/platform` | `repository.ts` (4.300 baris, akan dipecah), `db.ts` (klien Prisma), `config.ts` (daftar game dan mode), `types.ts`, `demo-store.ts` (hanya untuk test). |
| `src/lib/actions.ts` | Modul server action lama, 53 action. Akan dipecah di Fase 3. |
| `src/lib/actions/*-actions.ts` | Server action yang lebih baru, satu file per bidang (`event-v3-actions`, `registration-v3-actions`, dan seterusnya). **Tempat action baru.** |
| `src/lib/<bidang>` | `auth`, `bracket`, `certificate`, `competition`, `completion`, `events`, `imports`, `player-stats`, `registration`, `tournament`, dan lainnya. Logika per bidang. |

## Susunan folder tujuan

Dari `PLAN.md`:

```
src/lib/platform/shared/        pengecekan izin, transaksi, pengubah data, konstanta, tag cache (tanpa "use server")
src/lib/actions/shared/         pengecekan sesi, redirect, kode upload (tanpa "use server")
src/lib/<bidang>/repository.ts  akses data satu bidang
src/lib/<bidang>/actions.ts     "use server" satu bidang
```

Bidang: `platform`, `events`, `teams`, `bracket`, `registration`, `imports`, `stats`, `certificate`, `identity`.

Urutan antar bidang: shared, platform, events, teams, bracket, registration, imports, stats, certificate, identity. Bidang di belakang boleh mengimpor bidang di depannya, tidak sebaliknya. Contoh nyata: `bracket` memanggil `getTeamsForEvent`, jadi `bracket` ada di belakang `teams`.

## Aturan impor yang dijaga ESLint

Aturan ini aktif sebagai **error**. Definisinya di `eslint.import-rules.mjs`. File yang sudah melanggar sebelum aturan dibuat ada di `eslint.import-baseline.mjs`.

| Kode | Aturan | Alasan |
|---|---|---|
| R1 | Kode produksi tidak boleh mengimpor `demo-store`. | Aplikasi tidak lagi memakai data demo saat database gagal. File itu hanya bahan test. |
| R2 | Jangan impor `@/lib/actions` (modul lama). | Modul itu akan dihapus di Fase 3. Action baru ditaruh di `src/lib/actions/<nama>-actions.ts`. |
| R3 | Komponen di `src/components` tidak boleh mengimpor nilai dari `@/lib/platform/repository`. Impor tipe (`import type`) boleh. | Komponen menerima data lewat props. |
| R4 | `src/app` dan `src/components` tidak boleh mengimpor `@/lib/platform/db` (Prisma). | Akses data lewat `src/lib`. |
| R5 | `src/lib` tidak boleh mengimpor `@/app/**` atau `@/components/**`. | Logika tidak boleh bergantung pada tampilan. |

File test dikecualikan dari semua aturan.

### Daftar pengecualian

Saat aturan dibuat, 15 file sudah melanggar (16 pelanggaran, karena satu route handler melanggar R2 dan R4): R2 ada 14 file, R4 ada 1 file, R5 ada 1 file. R1 dan R3 bersih.

Daftar itu **hanya boleh mengecil**. Memperbaiki impornya, lalu hapus file dari daftar. Jangan menambah file ke daftar supaya impor baru lolos. Kalau aturan menghalangi pekerjaan yang masuk akal, bicarakan aturannya.

### Batas aturan

- Impor dinamis (`import("...")`) tidak dijangkau aturan bawaan ESLint. Satu kasus yang diketahui: `registration-v3-actions.ts` mengimpor `@/lib/actions` secara dinamis untuk menghindari lingkaran. Itu dibereskan di PR 1.5.
- Aturan hanya mengenali alamat yang persis sama. `@/lib/actions` terdeteksi, tetapi `../actions` dari folder lain tidak.
- Aturan tidak membekukan `@/lib/platform/repository`. Selama Fase 2, 65 file masih mengimpornya dan kode baru butuh file itu. Pembekuan dipikirkan lagi setelah bidang-bidangnya terpisah.

## Server action

- File server action diawali `"use server"`. File seperti itu **hanya boleh mengekspor fungsi `async`** (dan tipe). Konstanta, kelas, dan `export ... from` tidak boleh.
- Tempat mengubah cache: `revalidatePath` dan `revalidateTag` dipanggil di action, bukan di repository. Tag yang dipakai: `events`, `teams`, `stats`.
- Daftar lengkap action dan halaman yang di-refresh ada di `src/lib/revalidation-map.test.ts`. Mengubah panggilan revalidate tanpa mengubah tabel itu membuat test gagal.
- Kode berat dimuat saat dibutuhkan: `@vercel/blob` dan pembuatan sertifikat dipanggil lewat `import()` di dalam fungsi, supaya tidak ikut dimuat di setiap halaman. `src/lib/server-action-bundle.test.ts` menjaganya.

## Error dan data kosong

- Database gagal: error diteruskan. Pengunjung melihat `src/app/[locale]/error.tsx` (dua bahasa), atau `src/app/global-error.tsx` kalau layout utama yang gagal. Tidak ada data demo (lihat `docs/refactor/demo-fallback-decision.md`).
- Daftar kosong dan gagal dimuat harus dibedakan di tampilan. "Belum ada event" tidak boleh muncul untuk error database.
- `generateMetadata` di halaman event memakai `readEventForMetadata`, yang tidak melempar error. Isi halaman yang melaporkan kegagalannya, supaya `error.tsx` bisa menangkapnya.
- Sitemap (`src/app/sitemap.ts`) dibuat setiap permintaan dan gagal dengan HTTP 500 kalau database mati.
- Masih ada pembaca yang menelan error dan mengembalikan nilai kosong: `getEventRoundConfigs`, `getMatchGames`, `getMatchGamesForEvent`. Dicatat di `demo-fallback-decision.md`.

## Pengaman otomatis

| Pengaman | Menjaga apa |
|---|---|
| `pnpm lint` (`tsc`) dan `eslint` | Tipe dan aturan impor di atas. |
| `pnpm test:unit` | Logika, termasuk `revalidation-map.test.ts` dan `server-action-bundle.test.ts`. |
| `pnpm test:coverage` | Ukuran coverage (tanpa batas minimum). |
| Job CI `Production build` | `next build` lolos tanpa database. |
| Job CI `Database tests` | Transaksi pendaftaran dengan Postgres asli (`repository.db.test.ts`). |
| Job CI `Schema drift` | Skema Prisma sama dengan hasil migrasi. |
| `pnpm test:e2e:smoke` | Halaman publik tampil tanpa database. Dijalankan manual, tidak di CI. |

Catatan database: ada indeks unik parsial di `TeamRegistrationRequest` (captain ganda, nama dan tag tim) yang dibuat lewat SQL migrasi dan **tidak ada di `schema.prisma`**. Jangan jalankan `prisma db push` ke database yang penting.

## Menambah fitur selama refactor

1. Action baru: buat atau tambah di `src/lib/actions/<nama>-actions.ts`, jangan di `src/lib/actions.ts`.
2. Fungsi data baru: taruh di `src/lib/<bidang>`. Jangan menambah fungsi ke `repository.ts` kalau bidangnya sudah punya folder sendiri.
3. Kalau sebuah bidang sudah dipindahkan ke modulnya, perubahan baru untuk bidang itu hanya di modul barunya.
4. Action yang memanggil `revalidatePath` atau `revalidateTag`: tambahkan barisnya di tabel `revalidation-map.test.ts`.
5. Teks untuk pengguna: ikuti aturan Bahasa Lazim (kata sehari-hari, kalimat pendek).
