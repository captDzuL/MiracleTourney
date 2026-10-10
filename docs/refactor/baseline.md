# Baseline refactor (PR 0.1)

Diukur sebelum refactor dimulai, pada commit `d7d0541` (2026-10-10). Semua angka bisa direproduksi dengan perintah di bagian bawah. Pakai angka ini sebagai pembanding di akhir tiap fase (lihat `PLAN.md`).

## Lingkungan

| Item | Nilai |
|---|---|
| OS | Windows 11 Pro |
| Node | 24.18.1 |
| pnpm | 11.18.0 lokal (CI memakai 10) |
| Next.js | 15.5.25 (terpasang dari lockfile) |
| Vitest | 4.1.11 |
| Install | `pnpm install --frozen-lockfile`, 16 detik, lockfile tidak berubah |

Waktu di bawah adalah satu kali ukur di mesin lokal, hanya untuk perbandingan kasar, bukan target.

## Hasil gate

| Langkah | Hasil | Waktu |
|---|---|---|
| `pnpm lint` (`tsc --noEmit`) | lolos | 21 detik |
| `pnpm exec eslint . --quiet` | lolos | 37 detik |
| `pnpm test:unit` | 263 file lolos + 2 dilewati; 2.904 test lolos + 6 dilewati | 53 detik |
| `pnpm build` | lolos | 76 detik |

Peringatan build yang sudah ada (bukan regresi): `jose` memakai `CompressionStream` yang tidak didukung runtime Edge (2 peringatan); peringatan "multiple lockfiles" hanya muncul karena build dijalankan dari git worktree.

## Coverage (v8, seluruh `src`, tanpa file test)

| Metrik | Nilai |
|---|---|
| Statements | 79,81% (12.154 / 15.228) |
| Branches | 71,75% (11.201 / 15.611) |
| Functions | 79,07% (2.970 / 3.756) |
| Lines | 82,68% (9.949 / 12.032) |

File yang akan dipecah:

| File | Lines | Branches | Functions |
|---|---|---|---|
| `src/lib/platform/repository.ts` | 61,38% | 55,84% | 56,56% |
| `src/lib/actions.ts` | 77,94% | 74,71% | 82,97% |
| `src/lib/platform/demo-store.ts` | 69,02% | 51,55% | 68,31% |

`repository.ts` adalah file dengan coverage terendah dari ketiganya, padahal paling besar. Sekitar 43% fungsinya tidak dieksekusi oleh test mana pun. Pemindahan di Fase 2 untuk bagian itu tidak punya jaring pengaman selain `tsc`, jadi prioritaskan PR 0.3 dan 0.4 untuk fungsi yang tidak tercakup sebelum slice yang memuatnya dipindah.

## Build

Ukuran per rute ada di `baseline-build-routes.txt` (output asli `next build`). Ringkasan:

| Item | Nilai |
|---|---|
| First Load JS bersama semua rute | 102 kB |
| Middleware | 51,4 kB |
| `.next/static` | 3,0 MB |
| `.next/server` | 17,8 MB |
| Jumlah baris tabel rute | 120 |

Build memakai nilai placeholder untuk `DATABASE_URL`, `DIRECT_URL`, dan `JWT_SECRET`, sehingga tidak menyentuh database mana pun.

## Ukuran target refactor

| File | Baris | Export |
|---|---|---|
| `src/lib/platform/repository.ts` | 4.460 | 118 fungsi, 143 export |
| `src/lib/actions.ts` | 1.993 | 53 action |
| `src/lib/platform/repository.test.ts` | 3.037 | |
| `src/lib/actions.test.ts` | 2.638 | |

## Cara mereproduksi

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

Tabel rute diambil dari bagian `Route (app)` pada output `pnpm build`.
