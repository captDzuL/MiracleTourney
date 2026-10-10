# Plan Refactor Tech Debt Miracle (revisi, berbasis audit kode)

## Context

Plan awal (Fase 0–3, 49 PR) memecah `src/lib/platform/repository.ts` dan `src/lib/actions.ts` menjadi modul per domain tanpa mengubah perilaku. Arah besarnya benar: facade dulu, test ikut pindah, satu slice per PR. Tapi audit kode menemukan beberapa asumsi yang sudah usang atau belum dihitung. Dokumen ini berisi daftar concern (jawaban untuk "any concern?") dan plan yang sudah dikoreksi. Setelah disetujui, langkah pertama adalah menyimpannya ke repo sebagai `docs/refactor/PLAN.md` dengan checklist.

Keputusan user: (1) struktur konsolidasi ke `src/lib/<domain>`, bukan `src/modules`; (2) branch lama `origin/fix/modular-build-and-test-stability` hanya jadi referensi; (3) fallback `demoStore` diputuskan dan dihapus dulu sebelum repository dipecah.

## Concern (urut dari yang paling berisiko)

1. **Angka di plan usang.** `repository.ts` 4.460 baris (plan: 3.001), 118 fungsi + 143 export (plan: 91). `actions.ts` 1.993 baris, 53 action (plan: 1.726 / 44). `repository.test.ts` 3.037 baris, `actions.test.ts` 2.638 baris (plan: 1.399 / 1.736). Importer repository: 115 file (64 non-test), bukan 22. Estimasi beban per PR harus dihitung ulang.
2. **Paste plan terpotong.** Fase 1 (1.3–1.6) dan Fase 2 (2.1–2.18) tidak ada di teks yang dikirim, jadi tidak bisa direview. Fase 2 di bawah saya susun ulang dari hasil audit.
3. **"Tanpa mengubah perilaku" bertabrakan dengan keputusan demoStore.** Fallback demo adalah try/catch di 22 titik (events, teams, players, matches, bracket, satu di certificates), bukan mode. Registration, imports, stats, identity tidak memakainya. Menghapusnya mengubah perilaku produksi (saat DB error, halaman publik tidak lagi menampilkan data demo). Karena itu dipisah jadi PR sendiri di Fase 0 dan harus mendarat sebelum ekstraksi.
4. **Helper lintas domain belum punya rumah.** Perlu lapisan shared dulu sebelum domain mana pun dipindah:
   - `assertUserCanManageEvent` (~20 call site), `assertUserCanManageTeam`, `assertUserCanReviewStatSubmission`. Ini kode otorisasi.
   - `runSerializableRegistrationTransaction` (11 site), `assertEventRosterMutable`, `assertNewRegistrationWindowOpen`, `expireStaleRegistrationRequests`.
   - Mapper (`mapEvent` ~20 site, `mapTeam` 13) dan konstanta include.
   - Tag cache `teams` dipakai bersama oleh reader team, match, dan round-config.
   - Di `actions.ts`: `requireAdminSession` (30 pakai), `requireCaptainSession`, `assertWorkspaceEventAction`, `actionEntityId` (~50), `redirectToRequestedLocale`, dan seluruh pipeline upload gambar dipakai lintas domain.
5. **Domain di plan tidak mencakup semuanya.** Yang belum punya tempat: config game/mode, profil platform dan organizer, payment settings global, visual assets event (AI pipeline), round config + match games, discovery/sitemap feed, stream, serta `createCaptainWithTeam` dan `createCaptainWithPendingPayment` yang menyilang identity, teams, registration.
6. **Layout ketiga.** `src/lib` sudah punya folder domain (`events`, `registration`, `imports`, `bracket`, `certificate`, `tournament`, `player-stats`) dan `src/lib/actions/*-v3-actions.ts`. Menambah `src/modules` dan `src/shared` membuat tiga layout hidup bersamaan. Sudah diputuskan: pakai `src/lib/<domain>`.
7. **Mock test akan diam-diam lolos ke Prisma asli.** 47 file me-mock `@/lib/platform/repository` dan `actions.test.ts` memakai daftar named export (~44). Kalau satu consumer pindah import ke path modul baru sementara mock masih di path facade, mock tidak lagi mencegat dan test memanggil Prisma sungguhan. Aturan: consumer tetap impor facade sampai sapuan akhir; sapuan akhir memakai codemod yang mengubah import dan `vi.mock` dalam satu PR per direktori.
8. **Gate regresi lemah.** `pnpm lint` hanya `tsc --noEmit`; ESLint jalan terpisah di CI dengan `--quiet`. CI tidak menjalankan `next build`, e2e, maupun coverage. Tidak ada konfigurasi coverage sama sekali, jadi "coverage" di baseline 0.1 butuh `@vitest/coverage-v8` dulu. Smoke e2e (3 spec, jalan di `next dev`) tidak menyentuh fungsi repository, jadi bukan pengaman utama. `server-action-bundle.test.ts` hanya mencocokkan string di `./actions.ts` dan akan gagal (ENOENT) atau lolos kosong saat file dipindah.
9. **ESLint boundaries `warn` tidak terlihat.** CI memakai `eslint --quiet`, jadi warning tersembunyi. Plugin boundaries juga belum terpasang. Pakai `no-restricted-imports` bawaan dengan level `error` dan daftar pengecualian baseline yang menyusut, tanpa dependency baru.
10. **Safety net memakai mock, bukan DB.** Semua test repository me-mock Prisma. Tiga transaksi Serializable registrasi dan 16 `$transaction` tidak punya verifikasi nyata. CI sudah punya Postgres 18 (job `schema-drift`), jadi test integrasi bisa ditambah di sana.
11. **Characterization test sudah sebagian ada.** `registerTeam`, `commitRegistrationImportBatch`, `adminWriteMatchPlayerStats` sudah dites cukup dalam. Celah sebenarnya: `upsertStatSubmission` (2 call site), jalur tulis `setMatchResult` (hanya guard), dan `createTeamRegistrationRequest` (sedang). Jadi PR 0.2–0.4 yang berlabel B bisa menyusut jadi satu PR sedang.
12. **Laju perubahan tinggi.** `repository.ts` berubah 11 kali dan `actions.ts` 7 kali dalam 100 commit terakhir (7 hari), dan `HANDOFF.md` menandai release 1.0 BLOCKED. Refactor berminggu-minggu akan bertabrakan dengan pekerjaan fitur. Mitigasi: PR kecil, merge cepat, rebase harian, dan aturan bahwa setelah satu domain diekstrak, perubahan baru untuk domain itu hanya boleh di modul barunya.
13. **Fase 3 melanggar aturan sendiri.** Aturan 1 bilang "move + import, tanpa perubahan logic", tapi tiap PR Fase 3 juga mengekstrak `service.ts`. Pisahkan: pindahkan dulu, ekstraksi service jadi fase opsional terpisah.
14. **Spike 3.0 sebagian sudah terjawab.** Pola "use server" per file sudah terbukti oleh `src/lib/actions/*-v3-actions.ts` (14 file). Spike cukup berupa verifikasi `next build`, bukan PR sendiri. Batasan nyata: file "use server" hanya boleh export async function, jadi 6 wrapper di akhir `actions.ts` (baris 1975–1993) harus dipertahankan atau diganti import langsung, bukan `export ... from`.
15. **Siklus yang sudah ada.** `actions.ts` ↔ `registration-v3-actions.ts` (diakali dengan dynamic import), dan `uploadImageAsset` diimpor dari `@/lib/actions` oleh 3 file lib plus satu route handler. Ekstraksi pipeline upload di Fase 1 sekaligus memutus siklus ini.
16. **Hot spot di luar scope.** `admin-workspace.tsx` (2.245), `captain/page.tsx` (1.147), `public-v3-read.ts` (1.319), `certificate/template.ts` (957), ~35 file lib yang memakai Prisma langsung, dan repository kedua (`registration/captain-repository.ts`, `platform/stat-recording-repository.ts`). Dicatat sebagai Fase 4 (backlog), tidak dikerjakan di rangkaian ini.

## Struktur target

```
src/lib/platform/shared/      # authz, transaksi, mapper, konstanta, cache tag (bukan "use server")
src/lib/actions/shared/       # guard sesi, redirect, actionEntityId, pipeline upload (bukan "use server")
src/lib/<domain>/repository.ts   # data access (dari repository.ts)
src/lib/<domain>/actions.ts      # "use server" (dari actions.ts)
src/lib/platform/repository.ts   # facade `export *` sampai sapuan akhir, lalu dihapus
```
Domain: `platform` (config, profil, payment settings), `events` (+ visual assets, discovery, stream), `teams` (+ players), `bracket` (matches, standings, round config, match games), `registration` (requests, drafts, review, payment), `imports`, `stats` (`player-stats`), `certificate`, `identity` (users, password, captain account). Folder yang sudah ada dipakai ulang; hanya `teams` dan `identity` baru.

Urutan dependensi (hilir boleh impor hulu): shared → platform → events → teams → bracket → registration → imports → stats → certificate → identity. Contoh dependensi nyata: bracket memanggil `getTeamsForEvent`; stats memanggil `getPlayersForTeams`; imports memanggil `isEventBracketLocked`.

## Aturan tiap PR

1. Satu slice per PR: pindah kode + ubah import, tanpa ubah logic. Pindah dengan skrip/codemod, bukan tulis ulang.
2. Lolos `pnpm lint`, `pnpm exec eslint . --quiet`, `pnpm test`, dan `pnpm build` (CI tidak menjalankan build, jadi dijalankan lokal) sebelum push.
3. Test ikut pindah ke samping modulnya di PR yang sama.
4. Tidak ada dua PR yang menyentuh file sumber yang sama secara paralel. Merge berurutan, rebase tiap hari.
5. Eksekusi dengan agen ECC per PR: `ecc:tdd-guide` untuk celah test, `ecc:refactor-cleaner` / `code-simplifier` untuk pemindahan, `ecc:code-reviewer` dan `ecc:typescript-reviewer` setelahnya. `ecc:security-reviewer` wajib untuk PR authz, identity/password, dan upload; `ecc:database-reviewer` untuk PR transaksi Serializable.
6. Checklist di `docs/refactor/PLAN.md` dicentang di PR yang bersangkutan.

## Fase 0 — Safety net dan keputusan (7 PR)

| PR | Isi | Beban |
|---|---|---|
| 0.1 | Baseline: `tsc`, eslint, vitest, `next build` (ukuran bundle, waktu), coverage (tambah `@vitest/coverage-v8`) → `docs/refactor/baseline.md`. Simpan plan ini sebagai `docs/refactor/PLAN.md`. | S |
| 0.2 | Gate: `server-action-bundle.test.ts` jadi berbasis glob (path-agnostic, gagal jika target tidak ditemukan). Tambah job `next build` di CI atau dokumentasikan sebagai langkah wajib lokal. | S |
| 0.3 | Characterization: isi celah saja (`upsertStatSubmission`, jalur tulis `setMatchResult`, `createTeamRegistrationRequest` edge). | S |
| 0.4 | Test integrasi DB asli untuk 3 transaksi Serializable registrasi, jalan di job Postgres CI (dilewati tanpa DB, mengikuti pola `persistence-migration.integration.test.ts`). | B |
| 0.5 | Keputusan demoStore, bagian 1: inventaris 22 titik + `home-page-content.tsx`, tentukan pengganti (error propagate dengan log konteks lewat `observability/logger`, dan pastikan `error.tsx` ada untuk rute publik terkait). Dokumen keputusan, belum ubah kode. | S |
| 0.6 | Keputusan demoStore, bagian 2: hapus try/catch fallback, hapus atau pindahkan `demo-store.ts`, perbarui test. Ini satu-satunya PR dengan perubahan perilaku yang disengaja; deploy dan amati sebelum Fase 1. | B |
| 0.7 | Test tabel-driven: setiap action yang memanggil `revalidatePath/Tag` (43 + 24 panggilan di `actions.ts`) punya asersi. | S |
| 0.8 | `docs/architecture.md` (layout, arah dependensi, aturan API publik) dan ESLint `no-restricted-imports` level `error` dengan baseline pengecualian. | S |

## Fase 1 — Lapisan shared (5 PR)

| PR | Isi | Beban |
|---|---|---|
| 1.1 | `platform/shared`: konstanta, include, mapper, tag cache. | S |
| 1.2 | `platform/shared/authz`: tiga guard `assertUserCan*`. Review keamanan wajib. | S |
| 1.3 | `platform/shared/tx`: `runSerializableRegistrationTransaction`, guard window/roster, `expireStaleRegistrationRequests`. | S |
| 1.4 | `actions/shared`: `requireAdminSession`, `requireCaptainSession`, `assertWorkspaceEventAction`, `redirectToRequestedLocale`, `actionEntityId`. Non-"use server". | S |
| 1.5 | `actions/shared/uploads`: `uploadImageAsset` impl, validasi gambar, `MAX_*`. Wrapper async `uploadImageAsset` tetap di `actions.ts` sampai Fase 3. Memutus siklus dengan `registration-v3-actions`. | S |

`AppError` / `ActionResult` ditunda: tidak dibutuhkan untuk pemindahan.

## Fase 2 — Pecah repository.ts (13 PR + sapuan)

Tiap PR: pindahkan fungsi ke `<domain>/repository.ts`, tambah re-export di facade, pindahkan bagian `repository.test.ts` terkait, jalankan test mock facade.

| PR | Domain | Isi utama | Beban |
|---|---|---|---|
| 2.1 | platform | config game/mode, profil platform/organizer, payment settings | R |
| 2.2 | events | read/write event, discovery, stream, lifecycle | S |
| 2.3 | events | visual assets, brand/certificate asset update | S |
| 2.4 | teams | team, player, display captain, logo | S |
| 2.5 | bracket | matches, lock, standings, preview, `setMatchResult` | S |
| 2.6 | bracket | round config, match games | S |
| 2.7 | registration | `registerTeam`, requests, draft, proof | B |
| 2.8 | registration | review approve/reject, payment review, payment settings manager | S |
| 2.9 | imports | snapshot, preview batch, history, `commitRegistrationImportBatch` | B |
| 2.10 | stats | form context, reads, leaderboard | S |
| 2.11 | stats | `upsertStatSubmission`, approve/reject, `adminWriteMatchPlayerStats` | B |
| 2.12 | certificate | semua fungsi certificate | R |
| 2.13 | identity | users, password, `createCaptain*` (impor dari teams dan registration) | S |
| 2.14 | sapuan | codemod hapus facade, ubah import dan `vi.mock` di 115 file, dibagi per direktori (2–3 PR) | B |

Risiko: siklus antar modul. Aturan: modul hilir impor `index` modul hulu; kalau ada siklus, pindahkan fungsi bersama ke hulu atau `platform/shared`.

## Fase 3 — Pecah actions.ts (10 PR)

| PR | Isi | Beban |
|---|---|---|
| 3.0 | Verifikasi `next build` dengan satu action contoh per modul (pola sudah terbukti oleh `*-v3-actions.ts`). | R |
| 3.1 | identity: sign up, login, change/reset password, deactivate, assign captain | S |
| 3.2 | events: create/status/archive/stream/public info/accent color/character art | S |
| 3.3 | events: logo dan visual asset (8 action). Update `EventVisualAssetsPanel`, `EventDraftForm`. | S |
| 3.4 | registration: register, draft, payment proof, payment settings, approve/reject, 6 wrapper V3 | S |
| 3.5 | imports: CSV, preview, commit | S |
| 3.6 | teams: logo, player CRUD, display captain, delete team | S |
| 3.7 | bracket + stats: match result, round config, match games, submit/approve/reject/save stats. Pemicu certificate tetap lazy. | S |
| 3.8 | certificate: `adminRegenerateCertificate`. Hapus `lib/actions.ts`, perbarui 24 importer dan 8 `vi.mock("@/lib/actions")`. | S |
| 3.9 | Pecah `actions.test.ts`; evaluasi: build penuh, e2e, bandingkan bundle dan waktu build dengan baseline 0.1. | S |

## Fase 4 — Backlog (di luar scope, putuskan setelah Fase 3)

Ekstraksi `service.ts` (mulai dari `adminPreviewRegistrationImportAction`, ~44 baris logic di action), interface repository, `admin-workspace.tsx`, `captain/page.tsx`, `public-v3-read.ts`, konsolidasi akses Prisma langsung di ~35 file lib.

## Total dan ritme

~35 PR (Fase 0: 8, Fase 1: 5, Fase 2: ~15, Fase 3: 10). Satu sesi pendek per PR; PR berlabel B satu per sesi. Titik evaluasi: akhir Fase 0 (demo fallback sudah di produksi tanpa insiden), akhir Fase 1 (shared stabil), akhir Fase 2.

## File kritis

- `src/lib/platform/repository.ts`, `src/lib/platform/repository.test.ts`, `src/lib/platform/demo-store.ts`, `src/lib/platform/db.ts`
- `src/lib/actions.ts`, `src/lib/actions.test.ts`, `src/lib/server-action-bundle.test.ts`, `src/lib/actions/*-v3-actions.ts`
- `eslint.config.mjs`, `vitest.config.ts`, `.github/workflows/ci.yml`, `package.json`
- Dipakai ulang: pola "use server" per file di `src/lib/actions/*-v3-actions.ts`; test integrasi bergerbang DB di `tests/competition/persistence-migration.integration.test.ts`; job Postgres 18 di CI; referensi desain (bukan kode) dari `origin/fix/modular-build-and-test-stability` (policy murni, guardrail arsitektur).

## Verifikasi

Per PR: `pnpm lint`, `pnpm exec eslint . --quiet`, `pnpm test`, `pnpm build`, dan `pnpm test:e2e:smoke`. Jumlah test unit tidak boleh turun, diff harus berupa pindahan murni (`git diff --stat -M` menunjukkan rename). Per fase: bandingkan ukuran bundle dan waktu build dengan `docs/refactor/baseline.md`. Untuk PR 0.6: setelah deploy, pantau log error DB di halaman publik sebelum lanjut ke Fase 1.

## Checklist progres

Fase 0: [x] 0.1 [x] 0.2 [x] 0.3 [ ] 0.4 [ ] 0.5 [ ] 0.6 [ ] 0.7 [ ] 0.8
Fase 1: [ ] 1.1 [ ] 1.2 [ ] 1.3 [ ] 1.4 [ ] 1.5
Fase 2: [ ] 2.1 [ ] 2.2 [ ] 2.3 [ ] 2.4 [ ] 2.5 [ ] 2.6 [ ] 2.7 [ ] 2.8 [ ] 2.9 [ ] 2.10 [ ] 2.11 [ ] 2.12 [ ] 2.13 [ ] 2.14
Fase 3: [ ] 3.0 [ ] 3.1 [ ] 3.2 [ ] 3.3 [ ] 3.4 [ ] 3.5 [ ] 3.6 [ ] 3.7 [ ] 3.8 [ ] 3.9

## Catatan eksekusi

- **PR 0.3 (selesai):** dikerjakan sebagai dua file test baru (`repository-captain-signup.test.ts`, `repository-registration-edges.test.ts`) yang mencakup `createCaptainAccount`, `createCaptainWithTeam`, `createCaptainWithPendingPayment`, jalur draft dan guard `createTeamRegistrationRequest`, serta jalur tulis legacy `setMatchResult` (termasuk cabang Single Elimination tanpa baris match). Kedua file dipisah dari `repository.test.ts` (3.037 baris) agar tidak menambah file yang akan dipecah.
- **Celah sisanya dikerjakan just-in-time.** Coverage `repository.ts` menunjukkan 123 dari 297 fungsi belum dieksekusi (`repository-uncovered-functions.txt`). Sebagian besar adalah pembaca sederhana dengan fallback `demoStore` yang berubah di PR 0.6. Karena itu tiap PR Fase 2 menutup celah slice-nya sendiri sebelum memindahkan, bukan satu PR besar di depan.
- **Flaky yang diamati:** `tests/performance/organizer-readers.test.ts` ("runs scripts/load-test.mjs ...") pernah timeout 5 detik saat dijalankan dengan coverage; lolos pada run ulang.
- **Temuan dari karakterisasi PR 0.3 (perilaku yang di-pin apa adanya, diberi label `KNOWN QUIRK` di test):** (1) pendaftaran berbayar (`createCaptainWithPendingPayment`) tidak mengambil klaim `competitionVersion` dan tidak memeriksa roster-lock, sehingga bisa balapan dengan publish drawing; (2) `createCaptainWithTeam` memakai `logoText` = tag penuh, sedangkan jalur lain `tag.slice(0, 2)`; (3) `createTeamRegistrationRequest` menjalankan cek kapasitas dan identitas di luar transaksi; (4) `setMatchResult` mencatat tim tandang sebagai pemenang pada skor seri di format non-Single Elimination; (5) P2002 dari `user.create` di alur sign-up dilempar mentah. Semuanya kandidat perbaikan terpisah setelah refactor, bukan bagian PR pemindahan.
- **Belum tercakup di `setMatchResult`:** jalur sukses Single Elimination yang membuat baris match dari bracket proyeksi. Tutup di slice bracket (PR 2.5) sebelum dipindah.
