# Ukuran awal refactor (PR 0.1)

Angka di bawah diukur sebelum refactor dimulai, di commit `d7d0541` (2026-10-10). Semuanya bisa diulang dengan perintah di bagian "Cara mengulang". Pakai angka ini sebagai pembanding di akhir tiap fase (lihat `PLAN.md`).

## Lingkungan

| Item | Nilai |
|---|---|
| Sistem operasi | Windows 11 Pro |
| Node | 24.18.1 |
| pnpm | 11.18.0 di laptop, 10 di CI |
| Next.js | 15.5.25 (sesuai lockfile) |
| Vitest | 4.1.11 |
| Pasang paket | `pnpm install --frozen-lockfile`, 16 detik, lockfile tidak berubah |

Waktu di bawah diukur sekali di laptop ini. Pakai sebagai gambaran kasar, bukan target.

## Hasil pengecekan

| Perintah | Hasil | Waktu |
|---|---|---|
| `pnpm lint` (`tsc --noEmit`) | lolos | 21 detik |
| `pnpm exec eslint . --quiet` | lolos | 37 detik |
| `pnpm test:unit` | 263 file lolos, 2 dilewati. 2.904 test lolos, 6 dilewati. | 53 detik |
| `pnpm build` | lolos | 76 detik |

Peringatan build yang sudah ada sebelum refactor:
- `jose` memakai `CompressionStream`, yang tidak didukung runtime Edge (2 peringatan).
- Peringatan "multiple lockfiles" muncul karena build jalan dari git worktree.

## Coverage

Coverage adalah persentase kode yang dijalankan oleh test. Diukur dengan v8 untuk seluruh `src`, tanpa file test.

| Ukuran | Nilai |
|---|---|
| Statements | 79,81% (12.154 dari 15.228) |
| Branches | 71,75% (11.201 dari 15.611) |
| Functions | 79,07% (2.970 dari 3.756) |
| Lines | 82,68% (9.949 dari 12.032) |

File yang akan dipecah:

| File | Lines | Branches | Functions |
|---|---|---|---|
| `src/lib/platform/repository.ts` | 61,38% | 55,84% | 56,56% |
| `src/lib/actions.ts` | 77,94% | 74,71% | 82,97% |
| `src/lib/platform/demo-store.ts` | 69,02% | 51,55% | 68,31% |

`repository.ts` paling besar dan coverage-nya paling rendah. Sekitar 43% fungsinya tidak dijalankan test mana pun. Kalau fungsi itu dipindah, hanya `tsc` yang menjaga. Karena itu tiap PR Fase 2 menutup celah test potongannya sebelum memindahkan.

## Build

Ukuran tiap rute ada di `baseline-build-routes.txt`. Isinya salinan asli dari output `next build`. Ringkasannya:

| Item | Nilai |
|---|---|
| JS yang dimuat pertama kali, dipakai semua rute (First Load JS) | 102 kB |
| Middleware | 51,4 kB |
| `.next/static` | 3,0 MB |
| `.next/server` | 17,8 MB |
| Baris di tabel rute | 120 |

Build memakai nilai contoh untuk `DATABASE_URL`, `DIRECT_URL`, dan `JWT_SECRET`. Jadi build tidak menyentuh database mana pun.

## Ukuran file yang akan dipecah

| File | Baris | Isi |
|---|---|---|
| `src/lib/platform/repository.ts` | 4.460 | 118 fungsi, 143 export |
| `src/lib/actions.ts` | 1.993 | 53 action |
| `src/lib/platform/repository.test.ts` | 3.037 | |
| `src/lib/actions.test.ts` | 2.638 | |

## Cara mengulang

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm exec eslint . --quiet
JWT_SECRET="$(openssl rand -base64 32)" pnpm test:unit
JWT_SECRET="$(openssl rand -base64 32)" pnpm test:coverage
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/unused \
DIRECT_URL=postgresql://postgres:postgres@127.0.0.1:5432/unused \
JWT_SECRET="$(openssl rand -base64 32)" pnpm build
```

Tabel rute diambil dari bagian `Route (app)` di output `pnpm build`.
