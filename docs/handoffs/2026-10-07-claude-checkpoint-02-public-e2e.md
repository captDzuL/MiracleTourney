# Claude handoff — checkpoint 2: hasil E2E publik dan kendala tersisa

Status: **E2E publik belum lulus. Tidak production-ready.** Dokumen ini meneruskan checkpoint 1, bukan mengganti kegagalan menjadi pass.

## Kandidat dan batas kerja

- Branch sumber: `codex/v3-controlled-production-readiness`; target PR: `feature/ui/release/1.0`.
- Baseline release: `0c828b5ec7900a30a927d4ac9e775eaf21ebb939`.
- SHA yang benar-benar diuji: `944bd6cb7c323ee849226a47b6e90b3a682814d0`. Executable source: `dbb48f06107bb3eef5a5ba47af33f6493cd1f5bf`; perbedaannya hanya dokumen checkpoint 1. Commit yang memuat handoff ini juga dokumentasi saja, bukan rerun pada SHA baru.
- Worktree: `E:/dev/MiracleTourney-gitnative/.worktrees/codex-public-event-overview`. Jangan menyentuh checkout integration atau pekerjaan task lain.
- Perubahan owner pada `docs/operations/2026-10-03-public-home-pressure-rca.md` tetap di luar commit, hash SHA256 `861E4072B8ADB9CF3BC4A324BB7303A3C21E17A10C117DB777A1AAD711295404`. Jangan edit/discard/reset/stash.
- Brief, laporan, ledger, dan artifact mentah berada di lokasi privat/ignored. Jangan force-add credential, environment file, key, trace, screenshot, archive DB, raw logs, atau PII.

## Bukti Phase A

| Pemeriksaan | Hasil aktual pada SHA yang diuji |
| --- | --- |
| Delicate preflight | Direct/pooler cocok branch testing/neondb/TLS; catalog 50 tabel/545 kolom/156 index/525 constraint/10 enum/1 trigger/1 function; 37 applied ledger cocok Git LF; empat fixture tersedia; snapshot activity 0 active/0 idle-in-transaction |
| Required persistence migration case | 1/1 pass, exit 0, 3.019 ms menurut laporan pelaksana; tidak diulang |
| TypeScript | Exit 0, 8.321 ms |
| ESLint seluruh project | Exit 0, 19.954 ms, nol warning/error |
| Diff check | Exit 0, 110 ms |
| Public E2E invocation | Exit 1, command wall 331.270 ms; berhenti pada selection pertama `db-main` |
| Selection `db-main` | 22 dieksekusi: **21 pass, 1 fail, 0 skipped, 0 flaky**; Playwright duration 323.275,957 ms |
| Remaining public selection | **32 kasus NOT RUN**; bukan 54/54 pass |
| Supplemental browser | **3 kasus NOT RUN** |
| Build dan pressure/load | **NOT RUN**; belum ada p95 beban kandidat ini |

Runner yang dijalankan sekali: `pnpm test:e2e:public-v3`, workers 1, retries 0, fail-on-flaky, `PUBLIC_V3_NO_RESET=1`. Tidak ada retry, reset/reseed, migrasi ulang, atau perubahan schema. Kendala izin jaringan pada preflight awal diselesaikan sebelum tes melalui izin terbatasi, bukan suite retry.

Controller membaca sendiri artifact `test-results/public-v3/evidence.json` dan `db-main.json`: SHA/status/selection dan stats 21/1/0/0 cocok laporan. JSON required DB case di path awal tidak lagi tersedia saat pemeriksaan controller; angka 1/1 dan durasinya adalah bukti laporan pelaksana, bukan artifact yang controller berhasil membaca ulang. Pelaksana mengonfirmasi JSON sempat dibaca setelah Vitest, lalu output directory bersama `test-results` dibersihkan oleh Playwright saat setup; hasil tetap ada pada command transcript dan laporan tersanitasi, bukan salinan JSON terpisah. Jangan menjalankan tes ulang hanya untuk membuat ulang artifact.

## RCA terarah — tes registrasi memakai kontrak lama

Gagal: `tests/e2e/v3-adaptive-public-registration.spec.ts:209`, case “upcoming, closed, full, English, and mobile states remain accessible”, assertion line 214. Tes mencari tombol disabled “Pendaftaran ditutup”; element tidak ada setelah locator deadline 5 detik. Halaman berhasil menampilkan V3 `PHASE 02 / DRAWING`. Angka 5.000 ms adalah batas pencarian element, **bukan HTTP 500 atau bukti masalah performa**.

Bukti source yang dibaca controller:

- `src/lib/events/public-v3-read.ts:69`: `Registration Closed` secara eksplisit menjadi mode `drawing`.
- `src/lib/events/public-v3-read.test.ts:125`: event legacy tanpa CompetitionPhase tetap menjadi compatible drawing yang belum published, seeds kosong dan slot TBD.
- Test pada line 451 secara eksplisit memastikan closed legacy registration menjadi drawing **tanpa memanggil registration projection**.
- Fixture gagal dibuat sendiri oleh adaptive test sebagai `Registration Closed`, tanpa CompetitionPhase. Ini bukan salah satu dari empat fixture Flashpeak yang dipulihkan. Jangan mengubah fixture global/DB supaya assertion lama cocok.

Kesimpulan controller: assertion browser tertinggal dari kontrak V3 yang sudah eksplisit pada reader dan unit tests. Tidak ada bukti untuk mengembalikan produk ke registrasi hanya demi tes. Perbaikan yang tepat harus memeriksa drawing belum published dan tidak tersedianya akses registrasi, sambil mempertahankan pemeriksaan upcoming/full/English/mobile. Assertion full/English/mobile setelah line 214 **belum tercapai dalam case gagal ini**.

Belum ada patch atau bukti GREEN untuk perbaikan tersebut. Jangan menghapus case, melonggarkan timeout, menghitung assertion yang tidak tercapai sebagai pass, atau menyebut seluruh 54 kasus selesai.

## Cleanup dan bukti yang tidak perlu diulang

Laporan terminal mencatat cleanup hanya data sintetis milik invocation ini: residual event/user/team masing-masing 0; process milik test berhenti; port 3100–3102 bebas. Empat fixture global dan DB hasil pemulihan tidak di-reset. Checkpoint 1 memuat archive/hash/recovery evidence; jangan mengulang export atau pemulihan yang sudah accepted.

Fresh whole-branch **source** review pada release..944bd6c: implemented preparation spec PASS dan source quality PASS; tidak ada established P0/P1/P2 dalam lingkup review. Catalog JSON diperiksa dengan pin/count/union, bukan klaim setiap entry dibaca manual. Ini **bukan** operational release approval: E2E gagal dan performance/Preview/CI belum lengkap.

## Vercel dan production tetap terpisah

- Automatic Preview SHA 944bd6c: deployment `dpl_9QAzNTxtM3xCp99uRR63u3smBZLt`, metadata `READY`, URL `https://miracle-tourney-a692sc4oz-miracle25.vercel.app`. Browser/runtime/error scan **belum diverifikasi**; tidak menonaktifkan protection.
- Fresh authenticated read-only project check: Node 24.x, production branch `master`, live build override masih `if [ "$VERCEL_ENV" = "production" ]; then pnpm prisma migrate deploy; fi && pnpm build`. Usulan build-only `pnpm vercel-build` **belum diterapkan/read-back**. Source build-only contract tidak menghapus override provider.
- GitHub CI deferred oleh owner. Checkpoint memakai `[skip ci]`; tidak ada fresh CI pass, perubahan workflow, atau branch-protection bypass.
- Tidak ada production migration/deployment/settings/env/flag/write-pause/restore/merge atau paid resource pada fase ini. Merge PR bukan izin cutover.
- Backup mingguan tetap PAUSED. RPO ≤1 jam/RTO ≤30 menit merupakan target, bukan hasil layanan yang terbukti. Fresh cutover backup dan keputusan recovery tetap diperlukan; artifact app lama tidak otomatis kompatibel setelah migration.
- Admin V3 dan fitur tambahan deferred.

## Langkah lanjut tanpa berputar ulang

1. Perbaiki hanya kontrak browser yang terbukti tertinggal melalui Sol High, fresh reviewer, focused regression. Catat dampak SHA; jangan memakai hasil SHA lama sebagai kelulusan kandidat baru tanpa analisis cakupan.
2. Tentukan kelanjutan tes secara eksplisit sebelum rerun suite gagal. Tidak memulai otomatis full 54/CI/seed/reset. Pertahankan case count dan gate fail-closed.
3. Setelah functional gate lengkap, lanjut satu build dan pressure runner: 11 skenario/520 request terukur +11 initial samples. p95 tiap skenario <3 detik dan nol HTTP/content/timeout failures; hanya initial >3 detik yang warning.
4. Push checkpoint performa + handoff, kemudian final review/evidence + handoff/push. Buat/reuse Draft PR ke release; jangan tandai production READY jika bukti belum lengkap.

Private resume: `.superpowers/sdd/2026-10-06-v3-controlled-production-readiness/task-14-remaining-gates-report.md`, `progress.md`, `final-source-review.md`. Gunakan Sol High untuk debugging/review, Luna untuk pekerjaan mekanis. Source writer serial; jangan mengulang backup/recovery atau tes berat yang sudah accepted hanya karena commit dokumentasi.
