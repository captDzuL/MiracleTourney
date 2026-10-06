# Miracle V3 Controlled Production Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menyiapkan satu kandidat gabungan V3 yang terverifikasi secara lokal, memiliki backup/recovery yang cocok dengan migrasinya, dan dapat diserahkan ke Dzul untuk keputusan production terkontrol.

**Architecture:** Gabungkan perubahan release terbaru dan perbaikan publik yang sudah dipush pada satu kandidat; jangan menilai dua branch terpisah sebagai satu aplikasi teruji. Pisahkan build, migrasi database, dan pengalihan traffic. Gunakan jalur backup terenkripsi serta rehearsal PostgreSQL lokal yang sudah direview, lalu verifikasi flow dan performa pada database testing yang eksklusif.

**Tech Stack:** Next.js 15, Prisma 6, PostgreSQL 18.6, pnpm, Vitest, Playwright, age, Neon, Vercel, Windows PowerShell.

## Global Constraints

- Dzul menyetujui persiapan Task 1–5 pada 6 Oktober 2026 dengan instruksi tambahan: baseline harus `feature/ui/release/1.0` terbaru. Task 6 production tetap memerlukan keputusan terpisah.
- GitHub Actions, konfigurasi CI, rerun CI, dan dua shard seluruh aplikasi tetap di luar pelaksanaan ini. Pemeriksaan status run yang sudah ada boleh read-only untuk koordinasi DB.
- Jangan melewati required checks/branch protection. CI yang belum diverifikasi tetap dicatat sebagai gap, bukan dianggap hijau oleh hasil lokal.
- Dzul sebagai owner adalah PIC dan pengambil keputusan merge, perubahan setting production, write-pause, migrasi, deploy, rollback, serta restore production.
- Orchestrator, implementator keamanan/migrasi, dan reviewer: fresh GPT-6 Sol High. Inventaris dan ringkasan mekanis: GPT-6 Luna. Dispatch `fork_turns: "none"` dengan brief/report. Implementasi kode serial, review spec dan kualitas sebelum task diterima.
- Tidak ada resource cloud berbayar baru. Backup di `E:/MiracleBackups`, kunci existing tetap; tidak membaca kunci/clipboard/vault ke chat dan tidak meregenerasi kunci.
- Jangan menyentuh checkout integration atau perubahan RCA milik task lain; jangan stash/discard/reset otomatis.
- Tidak ada reset/reseed database. Fixture sintetis hanya pada target testing terverifikasi; cleanup hanya ID yang benar-benar dibuat run tersebut.
- Database recovery berisi salinan data production: owner-only ACL, loopback/SCRAM, bukan target E2E, bukan artifact Git/CI; provider email/Blob tidak dipanggil dari salinan ini.
- Tests serial `workers: 1`, `retries: 0`, `--fail-on-flaky-tests`. Required skipped/flaky/timeout/HTTP error/konten fallback tetap gagal.
- Latensi sampel awal >3 detik adalah warning yang sudah diterima. Load p95 harus <3 detik per skenario; request deadline 10 detik; zero request/content failures. Jangan menyebut satu sampel awal sebagai p95.
- RPO ≤1 jam dan RTO ≤30 menit tetap target, bukan janji dari waktu restore lokal. Backup mingguan tetap PAUSED dan tidak memenuhi RPO satu jam sendirian.
- Migrasi admin V3 dan fitur tambahan ditunda. Legacy admin perlu tetap berfungsi, bukan didesain ulang dalam rencana ini.
- Kegagalan: simpan evidence, diagnosis dahulu; tidak otomatis mengulang suite/export/migrasi atau mengendurkan assertion. Fix harus memiliki regression test dan review.

---

## Baseline yang benar-benar diketahui

Pemeriksaan repo saat penulisan: branch `codex/public-event-overview-v3`, HEAD `2ba1dc4c6fb9c2058174e63d511a9792ee74c04b`; source fix `156cc3d56fedfecad6145543336b5c5f790c84a0`. Hanya dirty tracked file adalah `docs/operations/2026-10-03-public-home-pressure-rca.md`, milik pekerjaan lain.

Fetched release terakhir `b6e64f715002b9bb12fc328148dbdb5d573f3aa4`. PR #47 dan #48 sudah merged secara eksternal; jangan reuse PR merged sebagai wadah follow-up. Release terbaru menambah `20261004000000_event_bracket_appearance`; jumlah chain yang diharapkan dari ref tersebut 37, tetapi ledger aktual wajib diverifikasi.

Sudah terbukti pada checkpoint sebelumnya: reader 31/31; login/signup kembali ke event 2/2; smoke tanpa DB 18/18; scoped lint/typecheck; build lokal 90,108 detik; review source fix tanpa finding. Bukti ini bukan verifikasi kandidat gabungan terbaru.

Belum lulus: rangkaian lifecycle tiga kasus (0 pass/1 fail/2 skip), full lane publik terbaru, pressure kandidat gabungan, Preview kandidat gabungan, dan rehearsal migrasi bracket tambahan. Tabel Event hilang sementara pada testing bersamaan dengan run CI lain yang mempunyai reset phase; atribusi endpoint/waktu reset belum lengkap. Tidak ada bukti tabel production terhapus.

Backup terakhir yang terbukti: `E:/MiracleBackups/miracle-neondb-2026-10-05T01-23-48-741Z.age`, SHA-256 `dc30ddf3ae4bb98dacd9d68e293b26cef5a3818664364c405c01d578cf1d7f5b`. Rehearsal dua DB membuktikan 17 applied +19 pending menjadi 36 applied, 0 pending/unfinished, lalu no-op. Itu tidak mencakup tambahan bracket.

Vercel terakhir diperiksa 6 Oktober 00.04 WIB: production branch `master`, override `if [ "$VERCEL_ENV" = "production" ]; then pnpm prisma migrate deploy; fi && pnpm build`. Repo menyediakan `pnpm vercel-build` tanpa migrasi. Setting live harus dibaca ulang, bukan diasumsikan masih sama.

## Peta file dan evidence

| Area | File | Tanggung jawab |
|---|---|---|
| Kandidat | `src/lib/events/public-v3-read.ts` dan `.test.ts`; `tests/e2e/v3-adaptive-public-registration.spec.ts`; `tests/e2e/v3-public-event-lifecycle.spec.ts` | Pertahankan source fix yang sudah direview |
| Build | `scripts/vercel-build.mjs`, `src/vercel-build.test.ts`, `package.json` | Build tanpa migrasi; Preview tidak memakai production DB |
| Migrasi tambahan | `prisma/migrations/20261004000000_event_bracket_appearance/migration.sql`, `prisma/schema.prisma` | Struktur bracket dari release; jangan rewrite applied migration |
| Recovery guard | `scripts/operations/local-rehearsal-core.mjs`, `scripts/operations/local-rehearsal-runner.mjs` | Validasi migrasi tambahan, checkpoint dan no-op |
| Recovery tests | `tests/operations/local-rehearsal-core.test.mjs`, `tests/operations/local-rehearsal-runner.test.mjs`, `tests/operations/local-rehearsal-sql-fixture.mjs`, `tests/operations/local-rehearsal-pg-fixture.test.ps1` | Penolakan schema/constraint salah, proof memakai PG nyata sintetis |
| Backup | `scripts/operations/local-backup-preflight.mjs`, `local-backup.mjs`, `local-backup-verify.mjs` pada folder yang sama | Reuse jalur reviewed; bukan rewrite/regenerate key |
| Verifikasi publik | `scripts/public-v3-ci.mjs`, `scripts/public-v3-pressure.mjs`, `src/public-v3-ci.test.ts` | Runner lokal dan JSON evidence, bukan perubahan GitHub Actions |
| Bracket | `src/lib/bracket/*.test.ts`; route tests di `src/app/api/organizer/events/[eventId]/bracket-appearance/route.test.ts` dan kedua `bracket.png/route.test.ts` | Otorisasi, appearance, render/export dari release |
| Runbook | `docs/operations/2026-10-03-v3-migration-preflight.md`, `docs/operations/local-encrypted-backup.md` | Compatibility, cutover dan recovery decision tree |
| Evidence baru | `.superpowers/sdd/2026-10-06-v3-controlled-production-readiness/` | `progress.md`, brief/report per task, `candidate.json`, `checks.json`, `handoff.md`; ignored, tanpa secret/PII |
| Handoff publik | `docs/testing/2026-10-06-v3-controlled-production-readiness.md` | Ringkasan aman yang boleh masuk PR |

Tidak perlu membuat subsystem baru. Perubahan kode hanya untuk gap yang benar-benar dibuktikan atau postcheck migrasi baru.

## Task 1 — Satukan kandidat dan pastikan tidak ada pemakai DB yang bentrok

**Files:** Buat evidence `candidate.json`, `progress.md`, dan `task-1-report.md`; source hanya jika konflik nyata perlu resolusi. Preserve dirty RCA.

**Interface:** `candidate.json` berisi `sourceSha`, `releaseSha`, `candidateSha`, `migrationNames`, `testDatabaseExclusive`, `settingsReadAt`; tanpa connection string.

- [ ] Rekam status/HEAD dan fetched release, lalu refresh remote read-only setelah pelaksanaan disetujui:

```powershell
git status --short
git fetch origin feature/ui/release/1.0
git rev-parse HEAD
git rev-parse origin/feature/ui/release/1.0
git diff --name-status HEAD origin/feature/ui/release/1.0
git merge-tree --write-tree HEAD origin/feature/ui/release/1.0
```

- [ ] Instruksi Dzul mengubah arah integrasi: gunakan fresh `origin/feature/ui/release/1.0` sebagai BASE, buat branch `codex/v3-controlled-production-readiness` dari BASE di worktree terisolasi yang ada bila switch aman, lalu cherry-pick source fix `156cc3d56fedfecad6145543336b5c5f790c84a0` yang belum tercakup. Jangan merge branch lama sebagai baseline. Jika switch menyentuh dirty RCA, berhenti sebelum overwrite dan gunakan worktree terisolasi yang disetujui tanpa memindahkan/menghapus perubahan task lain. Jangan reset/stash/discard; jika fix sudah ada, buktikan dan jangan cherry-pick duplikat. Periksa keempat file fix dan migrasi bracket ikut dalam kandidat.
- [ ] Inventaris seluruh SQL migration dari tree kandidat; bandingkan dengan chain lama dan applied ledger. Jangan hardcode 37 sebagai hasil.
- [ ] Satu pemeriksaan status read-only CI yang sudah ada dan koordinasi task lokal. Pastikan tidak ada reset/mutation/test lain di Delicate sepanjang run; terminal CI saja tidak membuktikan semua pemakai lain berhenti. Jika eksklusivitas belum dapat dibuktikan, laporkan kendala sebelum E2E, jangan membatalkan CI tanpa izin.
- [ ] Inspeksi host `.env.test` secara memory-only; pasangan harus Delicate pooled/direct, DB `neondb`, TLS; tolak production Sparkling Night. Jangan print values/password dan jangan mengganti `.env` testing diam-diam.
- [ ] Jalankan preflight read-only + fixture check sekali pada target tersebut. Bila fixture hilang, hentikan; tidak seed otomatis.
- [ ] Simpan SHA gabungan dan hasil review integrasi; commit integrasi hanya file yang dimiliki task.

**Lulus:** Satu tree kandidat jelas, semua delta diketahui, test DB eksklusif dan fixture tersedia. Jika blocked, task tanpa DB tetap boleh lanjut.

## Task 2 — Pastikan build tidak otomatis memigrasikan production

**Files:** Reuse `scripts/vercel-build.mjs`, `src/vercel-build.test.ts`, `package.json`; catat inspeksi dalam `task-2-report.md` dan runbook.

**Interfaces:** Pertahankan `runVercelBuild(env, runCommand): number`; satu invocation `pnpm exec next build`, tidak ada migrate/seed/reset. Setting yang disarankan `pnpm vercel-build`.

- [ ] Baca setting Vercel read-only, rekam build override, production branch, project ID, dan waktu. Jangan dump konfigurasi/env mentah.
- [ ] Jalankan kontrak existing, termasuk assertion ini:

```typescript
const run = vi.fn(() => ({ status: 0 }));
expect(runVercelBuild({ VERCEL_ENV: 'production' }, run)).toBe(0);
expect(run.mock.calls).toEqual([['pnpm', ['exec', 'next', 'build']]]);
```

```powershell
pnpm exec vitest run src/vercel-build.test.ts
```

- [ ] Jika tree gabungan merusak kontrak, tulis reproducer RED dahulu, fix minimal, ulang file ini sampai GREEN, dan fresh review. Jangan menambah migrate conditional baru.
- [ ] Siapkan perubahan override menjadi `pnpm vercel-build` beserta old/new value untuk keputusan Dzul. Jangan mengubah production branch `master` ke `main`/release sebagai jalan pintas: perubahan tersebut bisa memicu release yang tidak dimaksudkan.
- [ ] Jelaskan target jalur production yang benar dan kompatibilitas env sebelum memilih build/promotion. Preview dengan DB test tidak otomatis menjadi artifact production yang benar.
- [ ] Commit jika ada source fix; laporan harus membedakan repo PASS dari setting live APPLIED/PENDING.

**Lulus persiapan:** Build contract PASS dan perubahan setting jelas. **Lulus cutover:** setelah otorisasi setting diterapkan dan read-back membuktikan tidak ada auto-migration.

## Task 3 — Perluas guard bracket, buat backup baru dan rehearse chain kandidat

**Files:** Modify recovery core/runner dan tests pada peta file; reuse backup CLI. Update `task-3-report.md` dan runbook.

**Interfaces:** `buildCandidatePostcheckSql(): string` menambahkan Boolean `bracketAppearanceTable`, `bracketAppearanceDefaults`, `bracketAppearanceConstraints`; `assessCandidate(value)` menolak setiap nilai selain `true`, termasuk missing. Jangan ubah guard sumber/checkpoint atau menganggap manifest lama cocok dengan data baru.

- [ ] Tambahkan regression test pada good fixture existing, berikut failure matrix, sebelum implementation:

```javascript
const bracketKeys = ['bracketAppearanceTable', 'bracketAppearanceDefaults',
  'bracketAppearanceConstraints'];
// `good` adalah fixture existing yang memiliki semua certificate/security/ledger fields.
const ready = { ...good, bracketAppearanceTable: true,
  bracketAppearanceDefaults: true, bracketAppearanceConstraints: true };
assert.equal(assessCandidate(ready).status, 'CANDIDATE_READY');
for (const key of bracketKeys) {
  assert.throws(() => assessCandidate({ ...ready, [key]: false }), /POSTCHECK_FAILED/);
  const missing = { ...ready };
  delete missing[key];
  assert.throws(() => assessCandidate(missing), /POSTCHECK_FAILED/);
}
```

- [ ] Jalankan `node --test tests/operations/local-rehearsal-core.test.mjs`; expected RED untuk postcheck baru. Implementasikan validasi exact relation/column types/nullability/defaults 50/50/35, unique `eventId` yang valid nonpartial dan FK ke `Event.id` dengan delete/update cascade. Jangan mengecek nama index saja.
- [ ] Perluas fixture PostgreSQL sintetis: missing table, wrong default, nonunique/partial/wrong-column index, wrong FK/delete rule harus ditolak. Update runner mocks agar field tidak hilang dari parsing/evidence. Semua transaksi fixture rollback atau gunakan cluster sintetis yang dimiliki tes.
- [ ] Jalankan Node recovery tests dan fixture PG nyata yang sudah tersedia; expected semua required cases PASS. Fresh Sol review spec/kualitas; commit guard sebelum menyentuh data asli.
- [ ] Verifikasi ulang source project `steep-tree-47893196`, branch `br-rough-mountain-azfdh3db`, direct Sparkling Night, `neondb`, TLS verify-full, applied ledger, ACL/reparse/disk/tools/key receipt. Jika baseline produksi berubah, jangan edit manifest/pin atau melewati guard; diagnosis perubahan dahulu.
- [ ] Setelah pelaksanaan backup disetujui, jalankan preflight lalu satu export baru read-only dengan CLI reviewed:

```powershell
node scripts/operations/local-backup-preflight.mjs
node scripts/operations/local-backup.mjs
```

Export hanya jika preflight exit 0. Jalankan terpisah agar tidak lanjut ketika gagal. Catat path baru dari output aman, hash/bytes/waktu dan checkpoint satu snapshot; bukan menggunakan glob/"file terbaru" untuk memilih input.

- [ ] Gunakan **exact absolute archive path yang dihasilkan export sukses** sebagai satu argv untuk `scripts/operations/local-backup-verify.mjs`, lalu `scripts/operations/local-rehearsal-runner.mjs`. Controller menetapkan path di brief sebelum invocation. Guard harus menolak collision/path salah. Jalankan sekali; jangan memakai kembali archive lama hanya untuk menghasilkan PASS ketika source sudah drift.
- [ ] Cocokkan baseline kedua restore dengan checkpoint; pada `migration_candidate` jalankan chain lengkap, verifikasi 0 pending/unfinished dan bracket/certificate/session/reset/rate-limit constraints; ulang migrate sekali sebagai planned no-op, bukan retry kegagalan.
- [ ] Simpan durasi/ledger/integrity/SQL synthetic proof, stop exact owned server dan cek listener/pid. Retain sensitive owner-only data tanpa menghapusnya. Catat locale/extensions equivalence dan production RTO sebagai unproven bila belum terbukti.

**Lulus:** Backup baru authenticated, dua restore matched, chain kandidat lengkap + no-op PASS, postcheck bracket PASS, cluster stopped. Backup ini untuk readiness; backup cutover terpisah tetap diperlukan jika jeda/perubahan data membuat RPO tidak cukup.

## Task 4 — Verifikasi lokal sekali pada kandidat yang dibekukan

**Files:** Source/read/security/bracket tests existing; `scripts/public-v3-ci.mjs`, `scripts/public-v3-pressure.mjs`; evidence JSON dan `task-4-report.md`. Tidak mengubah workflow CI.

**Interfaces:** `PUBLIC_PHASES`, `validateReport(report, expected)`, `assertSameSelectedCases(listReport, runReport)` tetap fail-closed. `PUBLIC_V3_HEAD_SHA` diisi actual frozen SHA oleh controller; E2E loader tetap hanya menerima `.env.test`.

- [ ] Setelah Task 1–3 source final, freeze SHA. Set SHA evidence lewat environment proses, bukan mengganti source. Catat hash config/selection agar count tidak bisa berkurang diam-diam.
- [ ] Jalankan frozen-lockfile install, Prisma validate, TypeScript, lint dan unit secara terpisah; capture redacted count/duration/exit:

```powershell
pnpm install --frozen-lockfile
pnpm exec prisma validate
pnpm exec tsc --noEmit
pnpm exec eslint . --max-warnings=0
pnpm exec vitest run
pnpm audit --prod
git diff --check
```

Untuk validate/build, environment child harus diisolasi dari root production `.env`; tidak melakukan koneksi/write production. Optional skipped tests perlu daftar dan alasan; required skipped tetap blocked. Audit tidak boleh diabaikan demi deadline.

- [ ] Fresh bracket tests dari release: `pnpm exec vitest run src/lib/bracket`; tiga route tests pada peta file termasuk cross-organizer denial, public exposure, URL/input/MIME dan export. Simpan filter exact paths, jangan kehilangan tests karena glob PowerShell.
- [ ] Preflight eksklusivitas/fixture sekali lagi tepat sebelum DB-backed run. List selection dan simpan manifest. Lane existing 54 publik tetap lokal, bukan GitHub Actions:

```powershell
pnpm test:e2e:public-v3
```

Runner ini tidak melakukan prepare/reset; global setup memakai `PUBLIC_V3_NO_RESET=1`. Default-nya baseline 54, bukan alasan menghapus kasus bracket baru jika manifest memang bertambah. Jangan mengganti menjadi `test:e2e:full`.

- [ ] Setelah lane selesai, jalankan satu production-mode load test lokal:

```powershell
pnpm exec node scripts/public-v3-pressure.mjs
```

Runner melakukan build dan load serial pada DB testing, bukan production, bukan Next dev benchmark. Kontrak sekarang 11 route scenarios, 520 load requests +11 initial samples; expected all completed/0 failures/p95 <3000ms. Rekam initial latency warning terpisah.

- [ ] Verifikasi sensitive delta dengan existing password-reset/authorization/completion/certificate tests. Untuk browser organizer journey/certificates, reuse bukti terdahulu hanya bila SHA serta dependency/delta impact jelas; jika delta menyentuh flow, pilih related cases existing dan list exact IDs dahulu, `workers=1/retries=0`. Tidak mengklaim seluruh aplikasi teruji hanya dari 54 kasus publik.
- [ ] Kasus gagal: simpan failure, server/DB correlation dan fixture identities aman; hentikan remaining dependent phases. Targeted rerun hanya setelah diagnosis dan fix. Bila source berubah, freeze SHA baru, rerun affected coverage dan smoke/load yang terdampak; jangan menempelkan bukti SHA lama ke kandidat baru. Full rerun perlu alasan yang spesifik, bukan otomatis.
- [ ] Review laporan independen, checksums, no skip/flaky dan stop semua owned app server. Commit source fix jika diperlukan sebelum membuat freeze baru.

**Lulus:** Build production-mode lokal, functional delta, manifest lengkap dan strict load PASS pada satu kandidat. CI belum dijalankan tetap gap terpisah, bukan blocker lokal yang disembunyikan atau otomatis dipicu.

## Task 5 — Preview dan paket review untuk Dzul

**Files:** Buat `docs/testing/2026-10-06-v3-controlled-production-readiness.md`; update runbook; buat private `handoff.md` dan PR body file tanpa PII.

- [ ] Fresh Sol whole-delta review terhadap release target, mencakup source fix/integrasi/bracket/recovery/build; semua P0/P1/P2 ditutup atau status blocked. Spec review dan quality review harus eksplisit.
- [ ] Setelah publikasi diotorisasi, push normal; CI tetap deferred. Jangan mengubah workflow, meminta bypass protection, atau menyatakan skipped check = success. Jika commit memakai `[skip ci]`, jelaskan required check mungkin tetap Pending dan dapat menghalangi merge.
- [ ] Jika laporan tracked menghasilkan commit dokumentasi setelah source freeze, catat `testedSourceSha` dan `publishedSha` terpisah serta buktikan diff hanya dokumentasi; jangan mengklaim SHA berbeda sebagai SHA yang dites. Preview harus diperiksa pada `publishedSha`. Perubahan executable/config/schema/lockfile setelah freeze membatalkan equivalence dan memerlukan verifikasi affected scope pada freeze baru.
- [ ] Cari deployment Preview actual frozen SHA dan tunggu READY secara terbatasi. Gunakan Preview DB yang sudah diketahui terisolasi, bukan produksi; proof host efektif hanya redacted equality/identity. Jangan mengubah protection, memakai token expired, atau menganggap halaman login Vercel adalah halaman aplikasi.
- [ ] Browser desktop/mobile ID/EN: home, discovery, event registration/drawing/ongoing/finished, bracket/background/export, leaderboard, login/loading/redirect; gunakan akun sintetis test dan provider yang disetujui. Periksa unauthorized roles. Tidak memakai real-user production writes sebagai test.
- [ ] Scan Runtime Logs bounded pada window verifikasi, laporkan jumlah/cap/time window serta safe codes; 0 records dari scan terbatas bukan jaminan tidak ada error sepanjang waktu.
- [ ] Buat follow-up PR baru ke `feature/ui/release/1.0` jika tidak ada PR open yang sesuai; PR #47 sudah merged. Lampirkan PR ke chat. Ready-for-review hanya bila bukti lokal/Preview/review lulus; readiness/merge dibedakan dari outstanding checks/deployment approval.
- [ ] Handoff harus berisi actual SHA, link PR/Preview, pass/fail/skip counts, p95 setiap route, backup hash/path/time, rehearsal chain counts/durasi, setting APPLIED/PENDING, accepted cold warning, CI deferred, admin deferred dan keputusan Dzul.

**Lulus:** Dzul dapat mengecek satu kandidat dan evidence yang tepat. Belum berarti production sudah live atau semua release gate awal terpenuhi.

## Task 6 — Rundown production, hanya setelah keputusan terpisah

**Files:** Runbook dan decision record. Tidak dijalankan sebagai efek samping persetujuan rencana persiapan.

1. Dzul menerima bukti kandidat dan gap/risiko yang masih terbuka; memilih waktu cutover dan jalur branch/deployment. Release branch bukan otomatis production (`master` adalah setting terakhir).
2. Terapkan override build-only yang disetujui; read-back dan buktikan tidak memigrasikan DB. Pilih build/artifact dengan konfigurasi production yang benar; jangan promote artifact DB testing begitu saja.
3. Hentikan semua penulisan lewat mekanisme yang benar-benar tersedia: bukan hanya banner/UI, tetapi server actions/API, job dan writer lain. Jika tidak ada cara memastikan write-pause, cutover berhenti sampai jalur itu disetujui dan diuji.
4. Buat fresh encrypted backup di source terverifikasi dan autentikasi archive. Catat timestamp/RPO dan ledger terakhir setelah writer berhenti. Jangan mengandalkan export readiness lama bila data berubah.
5. Jalankan **hanya chain migrasi yang direhearse** pada exact production direct target setelah otorisasi eksplisit; cek ledger/postchecks. Failure DDL tidak otomatis retry, reset, seed, down-migrate atau deploy aplikasi lama.
6. Deploy/publish exact approved source dengan production env dan database yang cocok. Tunggu READY, cek health minimum dan public read-only smoke; lalu controlled synthetic writes yang diotorisasi sebelum membuka write umum.
7. Buka write setelah checklist berhasil; pantau error/auth/reset/completion/certificate dan latensi pada window awal. Catat real recovery clock bila ada insiden, bukan mengklaim local restore memenuhi RTO.
8. Jika gagal sebelum migrasi: tetap pada deployment/DB lama. Jika gagal setelah migrasi: pertahankan write-pause; pilih fix-forward atau compatible app dengan Dzul. App-only rollback ke artifact lama tidak didukung untuk certificate/reset. Jika restore dipilih, perlu otorisasi terpisah, target restore terisolasi, validation dan reconciliation data sesudah checkpoint sebelum switchover.

Vercel rollback mengembalikan deployment/build, bukan restore external DB; karena schema lokal menunjukkan inkompatibilitas, rollback aplikasi saja tidak boleh dianggap recovery aman. [Vercel Instant Rollback](https://vercel.com/docs/instant-rollback).

Restore archive memakai pipeline yang sudah direview dan transaksi tunggal/no-owner/no-acl; stdin pg_restore tidak perlu filename `-`. [PostgreSQL 18 pg_restore](https://www.postgresql.org/docs/18/app-pgrestore.html).

## Rundown dan checkpoint untuk dicek sekarang

Estimasi adalah anggaran kerja setelah persetujuan, bukan SLA. Target persiapan sekitar 2–4 jam jika akses/DB eksklusif tersedia dan tidak muncul failure; Preview queue atau fix baru dapat memperpanjangnya. Eksekusi production belum termasuk.

| Urutan | Anggaran | Yang Dzul terima |
|---|---|---|
| 1. Kandidat dan DB exclusivity | 10–20 menit | SHA gabungan, delta/migration list, status DB aman dipakai |
| 2. Build safety dan setting inspection | 10–20 menit | Old/new setting, build tanpa migrasi, status applied/pending |
| 3. Backup baru dan rehearsal chain terbaru | 25–45 menit jika guard/tests tidak bermasalah | Archive/hash, restore/migration/no-op/integrity actual |
| 4. Local functional + pressure | 45–90 menit sebagai anggaran awal | Manifest/count/exit/durasi, p95/load errors, failure yang spesifik bila ada |
| 5. Preview + review + PR handoff | 20–40 menit di luar queue/fix | Link kandidat yang bisa dibuka dan daftar keputusan production |
| 6. Production cutover | Jadwal ditentukan setelah gate/keputusan | Backup cutover, migration validation, deployment READY, live smoke |

- Checkpoint sekitar menit 30: kandidat dan setting sudah jelas, atau blocker akses disebutkan.
- Checkpoint menit 90: daftar gate PASS/FAIL/BLOCKED beserta bukti, test yang sedang berjalan dan sisa scope. Jangan melaporkan persentase tanpa denominator.
- Tidak ada janji "ini last test". Satu planned run lokal; jika gagal, diagnosis dahulu dan jelaskan biaya/scope verifikasi berikutnya.

### Hal yang perlu Dzul cek pada rencana ini

- [ ] Urutan kandidat → build safety → backup/rehearsal → local functional/load → Preview/review diterima.
- [ ] GitHub Actions tetap ditunda; outstanding required checks tidak di-bypass.
- [ ] Cold initial latency warning dan admin UI deferred tetap diterima; error, fallback, auth leakage dan load failure tidak diterima.
- [ ] Keputusan production terpisah setelah bukti diterima; write-pause dan backup segar masuk jadwal cutover.

### Self-review rencana

Spec coverage: source fix yang belum masuk release, drift bracket, auto-migration setting, source/backup authenticity, recovery consistency, shared-test isolation, local gates, strict load, Preview, review/PR, compatible recovery dan owner decision tercakup. Tidak menambah CI wave atau resource berbayar.

Type consistency: field bracket Boolean sama di runner/core/tests/report; migration count diambil dari candidate ledger; SHA report sama dengan actual tested tree. Placeholder scan: tidak ada langkah yang mengizinkan bypass guard atau menggunakan nilai credential buatan; exact archive path wajib dicatat dari hasil export sebelum invocation.

Skill yang dipakai: using-superpowers dan writing-plans untuk susunan task/evidence; deployments-cicd dan neon-postgres untuk pemisahan build/migrasi/recovery. Persiapan Task 1–5 disetujui; approval bukan deployment/migration production.

## Addendum — owner-approved strict lint cleanup, 6 October 2026

Dzul memilih membersihkan seluruh warning sebelum tes final. Baseline acceptance dan lint suppression bukan solusi yang dipilih. Tambahan ini adalah bagian Task4: pertahankan tampilan, authorization, URL policy, loading/fallback, dan kontrak eksternal; bukan migrasi UI admin. Implementasi tetap serial, dengan review per deliverable. Tidak diperlukan backup/rehearsal baru karena cleanup ini tidak mengubah Prisma, SQL, atau kode operasi.

## Task 7 — Remove unused bindings without changing behavior (Task4A)

**Files:** Only the bindings diagnosed by the 20 `@typescript-eslint/no-unused-vars` warnings in the existing Task4 report. Do not modify native image or hook behavior in this task. Report privately to `task-7-report.md`.

**Interfaces:** Existing exported signatures, DTO fields, authentication and ownership behavior remain unchanged. No ESLint configuration, rule disable, renamed-to-underscore suppression, or ignore patterns.

- [ ] Reproduce the unused-binding diagnostic with the installed ESLint API and save file/line/message inventory privately. Treat lint as the regression test for trivial pure unused declarations; do not add source-string tests.
- [ ] Remove unused import specifiers and pure unused local declarations. If an unused binding's initializer has side effects, retain the expression; if destructuring or function parameters are part of a public contract, preserve the contract. Escalate ambiguous behavior rather than silently deleting it.
- [ ] Verify the affected files with ESLint: zero unused-binding warnings and zero errors; expected image/hook warnings remain until their serial tasks.
- [ ] Run focused existing tests for touched auth/repository/player-stat/event behavior and TypeScript; capture exact commands/counts/durations/results, self-review, commit only owned paths, and independent spec/quality review.

## Task 8 — Correct hook lifecycles (Task4B)

**Files:** `src/components/v3/events/EventDraftForm.tsx`, `src/components/v3/organizer/OrganizerMasterShell.tsx`, and their existing/new behavior tests. Report privately to `task-8-report.md`.

**Interfaces:** Stable wizard steps; 500ms autosave and revision/idempotency semantics retained. `editable=false` must cancel a pending autosave. Drawer cleanup removes inert and restores overflow/focus on the exact nodes captured at effect setup.

- [ ] Add behavior regression proving a pending edit does not save after the form becomes non-editable before the timer fires. Watch RED on existing code; keep action/network behavior isolated from real databases.
- [ ] Move immutable step IDs to module scope instead of adding a changing array dependency. Include `editable` in the autosave effect dependency list without broad refactoring.
- [ ] Capture background/main/trigger nodes when the open-drawer effect begins; cleanup uses those captured nodes. Test close/unmount cleanup, body overflow, inert and appropriate focus restoration using real components with only external dependencies mocked.
- [ ] Run focused existing form/shell tests and scoped ESLint; self-review and scoped commit, then independent spec/quality review. No whole E2E lane yet.

## Task 9 — Replace native image warnings with compatible image rendering (Task4C)

**Files:** The 28 native image sites listed by installed ESLint, plus focused image behavior tests. Existing shared image components may be reused; a new abstraction is allowed only if it materially preserves a repeated native-image contract. Report privately to `task-9-report.md`.

**Interfaces:** Preserve CSS dimensions/crop/aspect ratios, intrinsic certificate/character proportions, alt text, eager/lazy policy, ref/error handlers, fallback and pre-hydration failure detection. Arbitrary already-approved external URLs, SVG, blob/data local previews, and private proof/QRIS URLs must not become server-side optimizer fetches merely to satisfy lint.

- [ ] Inventory exact native sites and characterize current output: fixed avatars/logos, poster fill, intrinsic certificate/character images, proof/QRIS dialogs and upload previews. Check installed Next15 image behavior and official image documentation; no framework upgrade, wildcard optimizer allowlist or global unoptimized setting.
- [ ] Reproduce strict ESLint RED for the native-image quality contract before conversion. Add real consumer compatibility tests for source/ref/error/loading semantics, intrinsic sizing and existing poster fallback; mark already-correct native behavior as characterization, not fabricated RED. Any new nontrivial intrinsic-sizing behavior requires meaningful behavioral RED/GREEN. Do not mock next/image into an img and then claim production compatibility from that mock alone, or assert only internal Next attributes to force a failure.
- [ ] Use `next/image` with appropriate explicit dimensions or `fill`/`sizes`. Use per-image `unoptimized` where preserving direct delivery is necessary for user-generated/private/dynamic previews; record that this cleanup does not claim an image performance improvement. Local assets may use the optimizer only where URL, geometry and failure checks remain equivalent.
- [ ] Run focused real rendering/component behavior tests, scoped ESLint and TypeScript. Review React boundaries, hook rules, accessibility and source handling; self-review and commit exact owned files, then fresh independent spec/quality review.
- [ ] After all three tasks pass review, freeze new SHA and resume Task4: strict ESLint `--max-warnings=0`, full unit once, one 54-case public local lane and one build/load run. Select additional related organizer form/drawer/image browser checks because this cleanup touches those flows; keep shared Delicate serial and do not reset/reseed. CI remains deferred and no production setting/migration/deploy/merge is authorized.

## Task 10 — Patch the newly published sharp security advisory (Task4D)

**Files:** `package.json`, `pnpm-workspace.yaml`, generated `pnpm-lock.yaml`, and one narrow real consumer regression. Read private `task-10-sharp-security-brief.md` for the source-phase execution and exact preservation constraints; report to `task-10-sharp-security-report.md`.

**Interfaces:** Preserve real PNG/SVG decoding, certificate and bracket outputs, Next image consumers, and Windows/Linux optional binary resolution. No framework upgrade, global SVG disable, schema/operations change, or severity waiver.

- [ ] Diagnose the actual installed root/Next `sharp@0.35.4` paths against HIGH GHSA-wq5f-xc86-pv6w, newly published to GitHub's database October6. Record conditions/limits honestly; this is not evidence of actual compromise.
- [ ] Write meaningful RED against the installed vulnerable version, then pin patched `0.35.5` narrowly in direct dependency and workspace override and generate the matching lockfile without unrelated upgrades. Verify real resolved consumers and bounded SVG-to-PNG/PNG metadata behavior, not only source-text version assertions.
- [ ] Focused tests, TypeScript, scoped lint, frozen install and production audit must pass; self-review and exact-file commit followed by fresh independent spec/quality review. No full suite, browser, DB, build/load or provider action in this source phase.
- [ ] Freeze the reviewed new SHA and resume the still-unrun heavy Task4 gates. The successful zero-warning cleanup is retained; do not reset/reseed, repeat backup/rehearsal, trigger CI or apply production settings. Final whole-delta review requires a scoped addendum for this dependency change.
