# Turnamen Solo — Rencana Implementasi

> **Untuk agent yang mengerjakan:** pakai `superpowers:subagent-driven-development` (disarankan) atau `superpowers:executing-plans`. Langkah memakai kotak centang `- [ ]`.

**Tujuan:** Pemain perorangan (role `player`) daftar ke event solo, dapat slot per posisi atau masuk antrean, bayar setelah dapat slot. Organizer menutup pendaftaran, mengacak, memeriksa, lalu mengunci. Saat dikunci, sistem membuat `Team` dan `Player` biasa, dan event berjalan lewat mesin turnamen yang sudah ada.

**Sumber kebenaran:** [`docs/handoff/2026-10-12-solo-tournament/prd.md`](../../handoff/2026-10-12-solo-tournament/prd.md) dan [`database-design.md`](../../handoff/2026-10-12-solo-tournament/database-design.md). Kalau rencana ini bertentangan dengan dua dokumen itu, dokumen itu menang, lalu perbaiki rencana ini.

**Arsitektur:** Tiga lapis, dikerjakan dari bawah ke atas.

1. **Mesin murni** `src/lib/solo/` (kuota, antrean, acak, validasi). Tanpa database, tanpa React. Semua aturan bisnis yang rumit ada di sini dan diuji habis-habisan.
2. **Repository + aksi server** (daftar, antrean, bayar, tutup, acak, kunci). Membungkus mesin murni dalam transaksi serializable (`runSerializableRegistrationTransaction`, `repository.ts:85`).
3. **Layar** (pemain, organizer, publik). Tipis, hanya menampilkan dan memanggil aksi.

Mesin turnamen yang ada (`src/lib/tournament/**`) **tidak diubah**, kecuali satu penjaga di `commands.ts` (Task 9).

**Tech stack:** Next.js 15, React 19, Prisma 6 + PostgreSQL (Neon), zod 4, next-intl, Vitest, Playwright. Perintah: `pnpm exec vitest run <file>`, `pnpm lint` (= `tsc --noEmit`), `pnpm build`, `pnpm test:e2e:prepare` lalu `pnpm test:e2e`.

## Batasan global

- **Semua di balik flag** `solo_tournament_v1` (bawaan `false`). Flag mati = tidak ada jalur solo yang terbuka, event lain tidak berubah.
- **Satu email satu role.** Daftar pemain dengan email yang sudah jadi kapten ditolak, dan sebaliknya.
- **Fase 1 hanya Flashpeak 5v5.** Mesin tidak boleh menulis mati angka 5, 4, atau kata "Goalkeeper"; semuanya dari `GameMode.soloDraw`. Kuroko 3v3 (`Center`) ditambahkan nanti hanya lewat konfigurasi.
- **Fase 1 mendukung tepat satu posisi wajib dengan jumlah 1 per tim.** Konfigurasi lain: mesin melempar kesalahan jelas, bukan menebak.
- **Tambahan saja di database.** Tidak ada `DROP`, tidak ada ubah tipe kolom. Migrasi idempotent, nama constraint sama dengan bawaan Prisma.
- **Jangan menyentuh database produksi.** Migrasi produksi diterapkan manual oleh pemilik. Memori proyek: build produksi gagal kalau migrasi belum tercatat (`scripts/vercel-build.mjs`).
- **Penulis roster** harus lewat `assertEventRosterMutable` (`repository.ts:1169`) di dalam transaksi serializable.
- **Log** hanya berisi ID dan nama kesalahan. Tidak ada WhatsApp, email, URL bukti bayar.
- **Teks UI** di `messages/id.json` dan `messages/en.json`, ikut daftar kata Bahasa Lazim di PRD bagian 2. Satu hal satu kata.
- **Perubahan lain di working tree harus dipertahankan.** Tidak ada refactor di luar cakupan.
- **TDD:** tes dulu (merah), implementasi minimal (hijau), rapikan. Cakupan minimal 80% untuk kode baru.

## Keputusan yang sudah dibuat (jangan dibuka lagi)

| Hal | Keputusan |
|---|---|
| Role | `player`, satu email satu role |
| Kuota | per posisi: `required` (posisi wajib x1) dan `open` (sisanya) |
| Bayar | setelah dapat slot. Lewat kuota = `queued`, tidak bayar |
| `rejected` | masih memegang slot sampai `expiresAt` (sama dengan alur tim: boleh upload ulang) |
| Antrean naik | otomatis, pendaftar tertua di kelompok yang sama, email "slot kamu terbuka" |
| Kiper darurat | posisi cadangan = posisi wajib, hanya dipakai kalau posisi wajib kurang |
| Pemain berlebih saat tutup | `unplaced`, organizer konfirmasi refund manual |
| Pemain cadangan di tim | tidak ada di fase 1 (slot = tepat isi tim) |
| Antrean/hangus | disapu malas (lazy) saat ada yang membaca event solo; tidak ada cron di fase 1 |
| `entryMode` | hanya bisa diubah saat event `Draft` |
| Format kompetisi | tidak diubah; organizer menyesuaikan kalau `T` < `participantCap` tidak cocok |

## Pembagian PR

Tiap PR berdiri sendiri, lulus CI, dan aman dengan flag mati.

| PR | Task | Isi | Migrasi? |
|---|---|---|---|
| A | 1, 2 | Flag, konfigurasi game, mesin murni | Tidak |
| B | 3, 4 | Schema + migrasi, role `player`, akses | **Ya** |
| C | 5, 6, 7 | Daftar akun pemain, pendaftaran solo + antrean + bayar, pengaturan event solo | Tidak |
| D | 8, 9, 10 | Tutup pendaftaran, acak, tukar, kunci, panel organizer | **Ya, kecil** (`20261014000000_solo_assignment_fk_cascade`) |
| E | 11, 12 | Area pemain, akses kapten hasil acak | Tidak |
| F | 13, 14 | Teks, a11y, E2E, seed, dokumen, rollout | Tidak |

**Urutan merge: A, B, C, D, E, F.** PR B membawa migrasi: terapkan ke database produksi **sebelum** PR B di-deploy ke produksi.

---

## Task 1: Flag dan konfigurasi game

**Files:**
- Modify: `src/lib/feature-flags.ts`, `src/lib/feature-flags.test.ts`, `docs/operations/v3-feature-flag-matrix.md`, `src/feature-flag-matrix.test.ts` (tes ini menghitung jumlah flag dan mewajibkan satu baris per flag)
- Modify: `src/lib/platform/types.ts` (tipe `GameMode`)
- Modify: `src/lib/platform/config.ts` (`mode-flashpeak-5v5`)
- Create: `src/lib/platform/config.solo.test.ts`

**Interfaces:**
- `FeatureFlag` mendapat `"solo_tournament_v1"`, bawaan `false`, env `FEATURE_FLAG_SOLO_TOURNAMENT_V1`.
- `GameMode` mendapat `soloDraw?: { requiredPositions: Readonly<Record<string, number>> }`.
- `getSoloDrawRules(gameModeId: string): { teamSize: number; requiredPositions: Readonly<Record<string, number>> } | null` di `config.ts`. Kembalikan `null` kalau mode tidak punya `soloDraw`.

- [ ] **Step 1: Tes merah.** Tambah `FEATURE_FLAG_SOLO_TOURNAMENT_V1` ke `OWNED_KEYS` di `feature-flags.test.ts`; tes: bawaan `false`, `"true"` menyalakan, nilai lain tetap `false`. Di `config.solo.test.ts`: `getSoloDrawRules("mode-flashpeak-5v5")` = `{ teamSize: 5, requiredPositions: { Goalkeeper: 1 } }`; `mode-mlbb-5v5` dan id tak dikenal = `null`; setiap posisi di `requiredPositions` ada di `GameMode.positions` (tes ini menjaga Kuroko `Center` nanti).
- [ ] **Step 2:** Jalankan `pnpm exec vitest run src/lib/feature-flags.test.ts src/lib/platform/config.solo.test.ts`. Pastikan gagal karena fungsi/flag belum ada.
- [ ] **Step 3: Implementasi.** Tambah flag di tipe `FeatureFlag` dan `DEFAULTS`. Tambah `soloDraw` di `GameMode` dan di `mode-flashpeak-5v5` (`{ requiredPositions: { Goalkeeper: 1 } }`). Tulis `getSoloDrawRules`.
- [ ] **Step 4:** Tes hijau + `pnpm lint`.

## Task 2: Mesin murni `src/lib/solo/`

Inti seluruh fitur. Kerjakan paling teliti. Tanpa import `prisma`, `react`, atau `next/*`.

**Files (semua baru):**
- `src/lib/solo/types.ts`
- `src/lib/solo/slots.ts` + `slots.test.ts`
- `src/lib/solo/prng.ts` + `prng.test.ts`
- `src/lib/solo/plan.ts` + `plan.test.ts`
- `src/lib/solo/draw.ts` + `draw.test.ts`
- `src/lib/solo/invariants.ts` + `invariants.test.ts`
- `src/lib/solo/hash.ts` + `hash.test.ts`
- `src/lib/solo/index.ts` (ekspor publik)

**Interfaces:**

```ts
export type SoloSlotGroup = "required" | "open";
export type SoloRules = Readonly<{ teamSize: number; requiredPositions: Readonly<Record<string, number>> }>;
export type SoloCandidate = Readonly<{
  registrationId: string; ign: string; uid: string;
  primaryPosition: string; secondaryPosition: string | null; willingCaptain: boolean;
  registeredAt: number;   // epoch ms: yang daftar lebih awal tetap masuk, yang terakhir daftar tersisih
}>;

// slots.ts
export function assertSupportedRules(rules: SoloRules): { requiredPosition: string };   // melempar kalau bukan tepat 1 posisi x1
export function slotGroupOf(primaryPosition: string, rules: SoloRules): SoloSlotGroup;
export function computeQuota(participantCap: number, rules: SoloRules): { required: number; open: number };
export function decideRegistration(input: { used: number; quota: number; free: boolean }): "approved" | "pending_payment" | "queued";
export function pickNextQueued<T extends { id: string; createdAt: Date }>(queued: readonly T[]): T | null;

// prng.ts
export function createRng(seed: string): () => number;          // sha256(seed) -> mulberry32, hasil [0,1)
export function shuffle<T>(items: readonly T[], rng: () => number): T[];   // Fisher-Yates, tidak mengubah input

// plan.ts
export type SoloPlan = Readonly<{
  teamCount: number;
  keeperRegistrationIds: readonly string[];            // termasuk pemain darurat yang dipakai
  emergencyUsedRegistrationIds: readonly string[];
  fieldRegistrationIds: readonly string[];
  unplacedRegistrationIds: readonly string[];          // pasti, tidak bergantung seed: preview tutup pendaftaran memakai ini
  warnings: readonly SoloWarning[];
}>;
export function planTeams(input: { candidates: readonly SoloCandidate[]; participantCap: number; rules: SoloRules }): SoloPlan;

// draw.ts
export type SoloAssignment = Readonly<{
  registrationId: string; teamIndex: number | null; role: "starter" | "unplaced";
  assignedPosition: string | null; isCaptain: boolean;
}>;
export type SoloDrawResult = Readonly<{
  assignments: readonly SoloAssignment[]; teamCount: number; unplacedCount: number;
  warnings: readonly SoloWarning[]; canLock: boolean;
}>;
export function drawTeams(input: { candidates: readonly SoloCandidate[]; participantCap: number; rules: SoloRules; seed: string }): SoloDrawResult;
export function swapPlayers(input: { result: SoloDrawResult; candidates: readonly SoloCandidate[]; a: string; b: string; rules: SoloRules }): SoloDrawResult;  // tukar dua pemain antar tim; melempar kalau melanggar aturan

// invariants.ts
export function checkDrawInvariants(result: SoloDrawResult, rules: SoloRules): readonly string[];  // daftar pelanggaran, kosong = sah

// hash.ts
export function hashDrawInput(candidates: readonly SoloCandidate[]): string;   // sha256 hex, urut registrationId, tidak peka urutan masukan
```

`SoloWarning` = `{ code: "required_short" | "open_short" | "unplaced" | "ign_collision" | "team_count_below_cap"; detail?: Record<string, number | string> }`. Kode, bukan kalimat: teks ada di UI.

**Aturan `planTeams` (diperbarui saat PR A dibangun):** siapa masuk dan siapa tersisih ditentukan murni dari urutan daftar (`registeredAt`, lalu `registrationId`), **bukan acak**, supaya daftar refund bisa ditampilkan persis sebelum organizer menutup pendaftaran. Seed hanya menentukan siapa masuk tim mana dan siapa kapten. Pemain darurat yang dipakai = yang paling awal daftar. `K` = jumlah kandidat `required`; `E` = kandidat `open` yang `secondaryPosition` = posisi wajib; `O` = kandidat `open`. Untuk `T` dari `participantCap` turun ke 2: `need = max(0, T - K)`; lolos kalau `need <= E` dan `O - need >= (teamSize - 1) * T`. `T` pertama yang lolos = `teamCount`. Tidak ada yang lolos = `teamCount: 0` dengan peringatan. Kandidat di luar tim = `unplaced` (termasuk posisi wajib berlebih).

**Aturan `drawTeams`:** (1) urutkan kandidat berdasarkan `registrationId`; (2) `createRng(seed)`; (3) pilih `T` pemegang posisi wajib: `required` acak dulu, lalu darurat acak; (4) acak sisa `open`, isi tiap tim `teamSize - 1` pemain berurutan; (5) kapten per tim: acak di antara starter `willingCaptain`, kalau tidak ada acak dari semua starter; (6) IGN kembar (tanpa peka huruf) dalam satu tim: tukar dengan pemain `open` di tim lain tanpa membuat kembar baru, batas percobaan tetap; kalau gagal, peringatan `ign_collision` dan `canLock: false`.

- [ ] **Step 1: Tes merah `slots.test.ts`.** `computeQuota(8, flashpeak)` = `{ required: 8, open: 32 }`; `computeQuota(12, ...)` = `{ 12, 48 }`. `assertSupportedRules` melempar untuk dua posisi wajib atau jumlah 2 atau kosong. `slotGroupOf("Goalkeeper")` = `required`, `"Forward"` = `open`. `decideRegistration`: `used < quota` dan gratis = `approved`, berbayar = `pending_payment`, `used >= quota` = `queued`. `pickNextQueued` memilih `createdAt` terkecil, kembar waktu dipecah dengan `id`; daftar kosong = `null`.
- [ ] **Step 2: Tes merah `prng.test.ts` dan `hash.test.ts`.** Seed sama = deretan sama; seed beda = beda; `shuffle` tidak mengubah input, hasilnya permutasi; `hashDrawInput` sama untuk urutan masukan berbeda, beda kalau satu kandidat berubah (posisi, `willingCaptain`, atau `secondaryPosition`).
- [ ] **Step 3: Tes merah `plan.test.ts`.** Tabel kasus: cukup semua (8 kiper, 32 lapangan) = 8 tim; kiper 7 + darurat 3 + lapangan 30 = 7 tim, 2 `unplaced` (kasus contoh PRD); kiper 3 + darurat 0 + lapangan 40, cap 8 = 3 tim, `unplaced` = 28; kiper 8, lapangan 10 = 2 tim, 6 kiper `unplaced`; kandidat kosong = 0 tim; kiper darurat dipakai mengurangi lapangan; hanya satu tim mungkin = `teamCount: 0` (batas minimal 2).
- [ ] **Step 4: Tes merah `draw.test.ts` dan `invariants.test.ts`.** Seed sama + masukan sama (urutan masukan diacak) = hasil identik; seed beda = hasil beda. **Uji sifat:** loop 200 kombinasi (K, E, O, cap) dengan seed berbeda, tiap hasil harus lolos `checkDrawInvariants`: tiap `teamIndex` 1..T punya tepat `teamSize` starter, tepat 1 starter dengan posisi wajib, tepat 1 kapten, tidak ada `registrationId` ganda, tidak ada starter tanpa `teamIndex`, `unplaced` tanpa `teamIndex`, jumlah `unplaced` = hasil `planTeams`. Kapten dipilih dari yang `willingCaptain` kalau ada. IGN kembar `Budi` / `budi` di satu tim dipecah. `swapPlayers` menolak menukar pemain posisi wajib dengan pemain `open`, menolak pemain `unplaced`, menjaga invarian.
- [ ] **Step 5: Verifikasi merah.** `pnpm exec vitest run src/lib/solo` gagal karena modul belum ada.
- [ ] **Step 6: Implementasi** berurutan: `types` → `slots` → `prng` → `hash` → `plan` → `draw` → `invariants`. Hijau satu per satu.
- [ ] **Step 7: Uji Kuroko tanpa mengubah kode.** Tambah satu tes di `draw.test.ts` dengan `rules = { teamSize: 3, requiredPositions: { Center: 1 } }` (aturan dikirim langsung, bukan dari konfigurasi): semua invarian lolos untuk isi tim 3. Ini membuktikan tidak ada angka 5 atau kata Goalkeeper tertulis mati.
- [ ] **Step 8:** `pnpm exec vitest run src/lib/solo --coverage` (>= 80%) + `pnpm lint`.

## Task 3: Schema dan migrasi

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<YYYYMMDDHHMMSS>_add_solo_tournament/migration.sql`

Tanggal migrasi harus lebih baru dari `20261011010000_add_player_roster_gaps`.

- [ ] **Step 1:** Salin model dari `database-design.md` bagian 3 dan 4 apa adanya: `Event` (`entryMode`, `activeSoloDrawId` + relasi), `Player.userId`, relasi di `User`, dan model `PlayerProfile`, `SoloRegistration`, `SoloDraw`, `SoloDrawAssignment`.
- [ ] **Step 2:** `pnpm exec prisma validate` dan `pnpm exec prisma format`.
- [ ] **Step 3: Hasilkan SQL**, jangan tulis tangan. Dengan database lokal kosong yang sudah menerapkan semua migrasi lama: `pnpm exec prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script > /tmp/solo.sql`. (`DATABASE_URL` harus database **lokal**; baca isinya dulu sebelum menjalankan.)
- [ ] **Step 4: Bungkus idempotent** mengikuti `prisma/migrations/20261011000000_add_roster_change_requests/migration.sql`: `ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`, `CREATE [UNIQUE] INDEX IF NOT EXISTS`, constraint di blok `DO $$ ... IF NOT EXISTS (SELECT 1 FROM pg_constraint ...) $$`. Urutan: `PlayerProfile`, `SoloRegistration`, `SoloDraw`, `SoloDrawAssignment`, kolom `Event`, kolom `Player`, lalu kunci asing `Event.activeSoloDrawId`.
- [ ] **Step 5: Cek seperti CI** (`.github/workflows/ci.yml:123-127`): database lokal kosong → `pnpm exec prisma migrate deploy` → `pnpm exec prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script --exit-code`. Harus keluar 0 (tidak ada selisih). Jalankan `migrate deploy` **dua kali**; yang kedua harus tidak error (bukti idempotent).
- [ ] **Step 6:** `pnpm exec prisma generate`, `pnpm lint`.
- [ ] **Step 7:** Jalankan `scripts/migration-ledger.mjs` lokal (lihat cara pakainya di skripnya) untuk memastikan folder baru terdeteksi dan tidak memecah gerbang build.
- [ ] **Step 8:** Catat di deskripsi PR: "Migrasi baru. Terapkan ke produksi sebelum deploy (Neon SQL Editor atau `pnpm exec prisma migrate deploy` dengan `DIRECT_URL` produksi)."

## Task 4: Role `player` dan akses

**Files:**
- Modify: `src/lib/platform/types.ts` (`UserRole`), `src/lib/auth/session.ts` (`SESSION_ROLES`, `getSessionMaxAge`), `src/lib/security/authorization.ts` (`WorkspaceActor.role`), `src/middleware.ts`, `src/lib/auth/post-login-path.ts`
- Modify tes: `src/lib/auth/session.test.ts`, `src/lib/security/authorization.test.ts`, `src/lib/security/authorization-matrix.test.ts`
- Modify tes: `src/lib/auth/post-login-path.test.ts` (sudah ada)

**Perilaku:**
- `UserRole` dan `SESSION_ROLES` mendapat `"player"`. Masa sesi pemain 7 hari (sama dengan kapten).
- `middleware.ts:172-180`: `/player` hanya `player`. `/captain` menerima `captain` **dan** `player` (halaman memfilter lagi di Task 12). `/admin` tidak berubah dan menolak `player`.
- `resolvePostLoginPath`: `player` → `/player` (atau `returnTo` / halaman event). **Perhatikan:** fungsi ini sekarang mengembalikan `/captain` untuk semua role yang tidak disebut, jadi tanpa perubahan pemain akan mendarat di halaman yang salah.
- `authorizeWorkspaceResource`: `player` ditolak untuk sumber daya event kecuali lewat jalur kepemilikan tim (Task 12). Di task ini: `player` selalu `forbidden` ke sumber daya event.

- [ ] **Step 1: Tes merah.** `verifyToken` menerima role `player`, menolak role asing. Matriks otorisasi: `player` ditolak di semua sumber daya event yang sekarang ditolak untuk role tak berwenang; organizer/admin tidak berubah. `resolvePostLoginPath({ role: "player" })` = `/player`; `player` + `eventId` aman = halaman daftar event itu; `captain`, `organizer`, `platform_admin` tidak berubah. Tes middleware (ikuti gaya tes middleware yang ada, atau ekstrak keputusan akses ke fungsi murni `canAccessPath(role, path)` dan uji itu): `player` ke `/admin` ditolak, `captain` ke `/player` ditolak.
- [ ] **Step 2:** Verifikasi merah → implementasi → hijau.
- [ ] **Step 3:** Cari tipe gabungan role yang ditulis mati dengan `rg '"captain" \| "organizer"' src` dan `rg 'role === "captain"' src`. Tangani tiap hasil: tambahkan `player` hanya bila relevan, catat sisanya sebagai "sengaja tidak" di deskripsi PR. Termasuk `/api/me` dan navigasi (`src/lib/navigation/`).
- [ ] **Step 4:** `pnpm lint` bersih, seluruh tes auth/security hijau.

## Task 5: Daftar akun pemain

**Files:**
- Modify: `src/lib/actions.ts` (tambah `playerSignUpAction`, acuan `captainSignUpAction`), `src/lib/platform/repository.ts` (`createPlayerAccount`, acuan `createCaptainAccount` di baris ~3977)
- Modify: `src/app/register/RegisterPageContent.tsx`, `RegisterWizard.tsx`
- Create: `src/lib/player/profile.ts` + `profile.test.ts` (validasi WhatsApp)
- Tes: `src/lib/actions.test.ts` (tambah), `src/app/register/*.test.*`

**Perilaku:**
- Pilihan "Saya pemain" / "Saya kapten" di halaman daftar. Pemain: nama, email, kata sandi, WhatsApp.
- Aturan sama dengan kapten: kata sandi >= 8, `checkRateLimit("register:<ip>", 5, 15 menit)`, `isDisposableEmail`, email kembar ditolak.
- **Satu email satu role:** kalau email sudah ada dengan role lain, pesan: "Email ini sudah dipakai sebagai kapten." (atau "... pemain."). Kalau role sama: "Email ini sudah terdaftar. Coba login."
- `createPlayerAccount` membuat `User` (`role: "player"`) dan `PlayerProfile` dalam satu transaksi.
- Setelah daftar dan masuk: ke `/player` atau ke halaman daftar event kalau datang dari event solo (`eventId` aman, event berstatus `Published`).
- WhatsApp: normalisasi ke digit (+62), 9-15 digit, tidak masuk log.

- [ ] **Step 1: Tes merah.** Validasi WhatsApp (format `08..`, `+62..`, `62..`, spasi, terlalu pendek). Aksi: sukses membuat user `player` + profil; email kapten ditolak dengan pesan role; email pemain ganda ditolak; rate limit; email sekali pakai ditolak; flag mati = aksi menolak.
- [ ] **Step 2:** Merah → implementasi → hijau.
- [ ] **Step 3:** Pastikan `captainSignUpAction` menolak email pemain dengan pesan yang sepadan (sisi sebaliknya dari satu email satu role).
- [ ] **Step 4:** Uji tampilan: pilihan role, kolom WhatsApp, pesan error, aksesibilitas label.

## Task 6: Pendaftaran solo, antrean, bayar

Task terbesar kedua. Semua tulis dalam `runSerializableRegistrationTransaction`.

**Files:**
- Create: `src/lib/solo/registration-repository.ts` + `.test.ts` (satu-satunya tempat tabel `SoloRegistration` disentuh)
- Create: `src/lib/actions/solo-registration-actions.ts` + `.test.ts`
- Create: `src/lib/email/templates/solo-slot-open.ts` + tes; Modify: `src/lib/email/send.ts` kalau perlu
- Modify: `src/lib/platform/repository.ts` (`registerTeam` baris ~1913 dan `createTeamRegistrationRequest` baris ~2011: tolak event `entryMode = "solo"`)

**Interfaces (repository):**

```ts
registerSolo(input: { eventId: string; userId: string; ign: string; uid: string; primaryPosition: string;
  secondaryPosition?: string | null; willingCaptain: boolean; whatsapp: string }):
  Promise<{ registration: SoloRegistrationView; outcome: "approved" | "pending_payment" | "queued" }>;
uploadSoloProof(input: { userId: string; registrationId: string; proofImageUrl: string }): Promise<SoloRegistrationView>;   // pending_payment|rejected -> pending_review
withdrawSolo(input: { userId: string; registrationId: string }): Promise<{ freedSlot: boolean; promoted: SoloRegistrationView | null }>;
approveSolo(input: { actor: AppUser; registrationId: string; expectedVersion: number }): Promise<SoloRegistrationView>;
rejectSolo(input: { actor: AppUser; registrationId: string; reason: string; expectedVersion: number }): Promise<SoloRegistrationView>;   // alasan 3-240 karakter
sweepSoloEvent(eventId: string): Promise<{ expired: number; promoted: number }>;     // hanguskan lewat expiresAt, naikkan antrean
getSoloQuotaSnapshot(eventId: string): Promise<{ required: Counts; open: Counts }>;  // Counts = { quota, used, queued }
```

**Aturan penting:**
- **Ekspor dulu pembantu yang masih privat di `repository.ts`** karena `registration-repository.ts` ada di file lain: `PAYMENT_REQUEST_TTL_MS` (baris 227), `assertNewRegistrationWindowOpen` (baris 79), `assertEventRosterMutable` (baris 1169, dipakai Task 9). Cukup tambah `export`, tanpa mengubah isi, dan jalankan tes `repository.test.ts` untuk memastikan tidak ada regresi.
- `registerSolo`: cek flag, event `Published`, jendela daftar terbuka (`assertNewRegistrationWindowOpen`), `entryMode = "solo"`, posisi sah (`assertPositionAllowed`, `roster-change-rules.ts:48`), role `player`, `uidKey = uid.trim().toLowerCase()`. Hitung `used` per `slotGroup` di dalam transaksi, lalu `decideRegistration`. Gratis + dapat slot = `approved` langsung. Berbayar + dapat slot = `pending_payment` dengan `expiresAt = now + PAYMENT_REQUEST_TTL_MS` (`repository.ts:227`) dan `slotHeldAt`. Tidak dapat slot = `queued`, tanpa `expiresAt`.
- Pelanggaran unik `(eventId, userId)` atau `(eventId, uidKey)` (`P2002`) diterjemahkan menjadi `UserFacingError` yang jelas ("Kamu sudah daftar di event ini." / "UID ini sudah terdaftar di event ini.").
- Naik dari antrean (`promoteNext`): di dalam transaksi yang sama dengan pelepasan slot; `queued` tertua di `slotGroup` yang sama menjadi `pending_payment` (atau `approved` kalau gratis), isi `slotHeldAt`/`expiresAt`, `version + 1`. Email "slot kamu terbuka" dikirim **setelah commit**; kegagalan kirim tidak menggagalkan transaksi dan hanya dicatat (ID saja).
- Hitungan `used` mencakup `rejected` yang `expiresAt > now` (Keputusan: ditolak masih memegang slot).
- `approveSolo`/`rejectSolo`: `assertUserCanManageEvent` (`repository.ts:561`), cek `version` (CAS); `version` basi = `UserFacingError` "Data sudah berubah. Muat ulang."
- `sweepSoloEvent` dipanggil di awal `registerSolo`, di pembacaan dasbor pemain, dan di pembacaan panel organizer. Idempoten.
- Event solo menolak `registerTeam` dan `createTeamRegistrationRequest` dengan pesan jelas.

- [ ] **Step 1: Tes merah repository** (pola mock Prisma seperti `repository.test.ts`, atau uji terhadap database lokal bila pola itu dipakai di tes serupa). Kasus wajib:
  - slot tersedia → `approved` (gratis) / `pending_payment` (berbayar); slot penuh → `queued`.
  - Kuota 32 lapangan penuh, pendaftar ke-33 `queued`; satu `withdrawn` → pendaftar `queued` tertua naik, kelompok `required` tidak ikut naik.
  - `rejected` belum lewat `expiresAt` masih menghitung sebagai terpakai; sesudah `sweepSoloEvent` jadi `expired` dan antrean naik.
  - Dua `registerSolo` bersamaan untuk slot terakhir: tepat satu dapat slot (uji dengan dua panggilan paralel pada database lokal, atau simulasi `P2034` ulang transaksi).
  - UID `ABC123` lalu `abc123`: yang kedua ditolak. Akun sama dua kali: ditolak.
  - Kapten atau organizer memanggil `registerSolo`: ditolak. Event `Draft`/`Registration Closed`/`Ongoing`: ditolak. Flag mati: ditolak.
  - Posisi tidak sah: ditolak.
  - `approveSolo` oleh organizer lain event: ditolak; `version` basi: konflik.
  - `registerTeam` pada event solo ditolak.
- [ ] **Step 2: Tes merah aksi** (validasi zod, batas laju `checkRateLimit("solo-register:<userId>:<eventId>")`, unggah bukti memakai `uploadImageAsset` seperti `captainUploadPaymentProofAction`, `actions.ts:569`, folder `payment-proofs`, 2 MB).
- [ ] **Step 3:** Merah → implementasi → hijau. Jaga fungsi < 50 baris; pecah ke pembantu privat.
- [ ] **Step 4: Tes privasi.** Tidak ada log yang memuat `whatsapp`, `proofImageUrl`, atau email (spy pada `writeServerLog`).
- [ ] **Step 5:** Tes email: templat memuat nama event dan batas bayar dalam bahasa pemain; tanpa nomor WhatsApp.

## Task 7: Pengaturan event solo dan halaman publik

**Files:**
- Modify: `src/lib/events/event-draft.ts` (skema `.strict()` perlu `entryMode`), `src/lib/events/publish-readiness.ts`, `src/lib/actions/event-v3-actions.ts`, `src/lib/events/event-revision.ts` (jangan boleh mengubah `entryMode` sesudah `Draft`)
- Modify: `src/components/v3/events/EventDraftForm.tsx`, `CreateEventWizard.tsx`, `PublishReadiness.tsx`
- Modify: `src/app/events/[slug]/register/event-registration-page.tsx` (cabang event solo), `src/lib/events/adaptive-public-event.ts` (`getRegistrationAvailability`), halaman peserta publik
- Create: `src/components/solo/SoloRegisterForm.tsx` + tes, `src/components/solo/SlotMeter.tsx` + tes

**Perilaku:**
- Pilihan "Cara daftar: Tim / Solo" hanya muncul bila flag menyala dan game punya `getSoloDrawRules`. Tidak bisa diubah sesudah `Draft`.
- `publish-readiness`: event solo butuh game dengan `soloDraw`, `participantCap` sah, biaya terisi bila berbayar. Pesan blocker memakai kosakata PRD.
- Halaman event solo: tombol "Daftar solo", `SlotMeter` ("Kiper 5 / 8, Lapangan 32 / 32, antrean 4"). Sebelum tim dikunci, halaman peserta hanya menampilkan jumlah.
- Form pemain: IGN, UID, posisi utama, posisi cadangan, mau jadi kapten, WhatsApp (isian awal dari `PlayerProfile`), pernyataan WhatsApp boleh dilihat tim. Pengunjung yang belum masuk diarahkan ke daftar/masuk dengan `returnTo` aman.

- [ ] **Step 1: Tes merah.** Skema draf menerima `entryMode: "solo"` dan menolak nilai lain; revisi event terbit menolak perubahan `entryMode`; kesiapan terbit untuk solo (game tanpa `soloDraw` = blocker); render form (urutan kolom, label, posisi dari konfigurasi game); `SlotMeter` (penuh, sisa, antrean 0); halaman peserta sebelum kunci tidak memuat nama pemain (fixture dengan UID/IGN, cek tidak ada di HTML).
- [ ] **Step 2:** Merah → implementasi → hijau.
- [ ] **Step 3:** Cek visual 390 dan 1440 px tanpa luapan horizontal (harness lokal, tanpa data produksi).

## Task 8: Tutup pendaftaran

**Files:**
- Create: `src/lib/solo/close-registration.ts` + `.test.ts`
- Modify: `src/lib/actions/solo-organizer-actions.ts` (baru) + `.test.ts`
- Rujukan: `adminUpdateEventStatusAction` (`src/lib/actions.ts:926`)

**Interfaces:**
```ts
previewCloseSolo(input: { actor: AppUser; eventId: string }): Promise<{
  pendingBlockers: SoloRegistrationView[];       // pending_payment / pending_review / rejected (belum expired)
  plan: SoloPlan;                                // dari planTeams atas pendaftar approved
  willBeUnplaced: SoloRegistrationView[];        // daftar refund
}>;
closeSoloRegistration(input: { actor: AppUser; eventId: string; confirmRefundIds: readonly string[]; expectedCompetitionVersion: number }): Promise<void>;
```

**Aturan:** status `Published` → `Registration Closed`, hanya event `solo`, hanya organizer pemilik atau admin. Menolak bila masih ada `pendingBlockers` (organizer menyelesaikannya dulu: setujui, tolak lalu tunggu, atau minta batal). Menolak bila `willBeUnplaced` tidak seluruhnya ada di `confirmRefundIds`. Pemain `queued` di-set `withdrawn` dengan catatan "pendaftaran ditutup" (tanpa refund karena belum bayar). Tulis `CompetitionAuditLog` (`action: "solo_registration_closed"`). Gunakan CAS `competitionVersion`.

- [ ] **Step 1: Tes merah.** Peringatan bila ada yang kena refund; tolak tanpa konfirmasi; tolak saat masih ada `pendingBlockers`; antrean ditutup; organizer lain event = ditolak; event tim = ditolak; audit tertulis; CAS basi = konflik.
- [ ] **Step 2:** Merah → hijau.

## Task 9: Persistensi acak: acak, acak ulang, tukar, kunci

**Files:**
- Create: `src/lib/solo/draw-repository.ts` + `.test.ts`
- Modify: `src/lib/actions/solo-organizer-actions.ts` + tes
- Modify: `src/lib/tournament/operations/commands.ts` (penjaga `drawing_save`) + tes di `src/lib/tournament/operations/operations.test.ts`

**Interfaces:**
```ts
createSoloDraw(input: { actor: AppUser; eventId: string; seed?: string }): Promise<SoloDrawView>;   // seed acak aman bila tidak diberikan; version naik; draf lama -> superseded
swapSoloPlayers(input: { actor: AppUser; drawId: string; a: string; b: string }): Promise<SoloDrawView>;
lockSoloDraw(input: { actor: AppUser; drawId: string }): Promise<{ teamIds: readonly string[] }>;
getSoloDrawView(input: { actor: AppUser; eventId: string }): Promise<SoloDrawView | null>;
```

**Alur `lockSoloDraw`** persis `database-design.md` bagian 7: `assertEventRosterMutable` → cek draf `draft`, event `Registration Closed` + `solo` + belum ada `activeSoloDrawId` → hitung ulang `hashDrawInput` atas pendaftar `approved`, beda = `UserFacingError` "Pendaftar berubah. Acak ulang dulu." → `checkDrawInvariants` harus kosong dan `canLock` benar → buat `Team` (`source: "solo-draw"`, nama `Tim N`, tag `TN`, `createdAt` naik berurutan) dan `Player` (UID di `displayName`, IGN di `nickname`, `position`, `userId`, `eventId`) → isi `teamId`/`playerId` di penempatan → `SoloDraw.status = "locked"`, `Event.activeSoloDrawId` → `CompetitionAuditLog`. Satu transaksi serializable.

**Penjaga `drawing_save`:** di `commands.ts` (`drawing_save` ~baris 189), bila event `entryMode = "solo"` dan `activeSoloDrawId` kosong, tolak dengan pesan "Kunci tim dulu sebelum mengacak grup." Event tim tidak terpengaruh (tes regresi).

- [ ] **Step 1: Tes merah.** `createSoloDraw` menolak bila status bukan `Registration Closed`, bila tim yang jadi < 2, bila sudah terkunci. Acak ulang menaikkan `version` dan menandai draf lama `superseded`. Seed sama = hasil sama (bandingkan penempatan tersimpan). `swapSoloPlayers` menjaga invarian dan menolak setelah terkunci. `lockSoloDraw`: membuat `Team`/`Player` dengan pemetaan tepat seperti tabel di `database-design.md` bagian 7; `Team.captainId` = akun kapten; `Player.userId` terisi; nama dan tag lolos `validateTeamData` (`src/lib/validation/team-data.ts`); `createdAt` urut sesuai `teamIndex`; menolak bila `inputHash` berubah (satu pendaftar `approved` ditambah/dikurangi setelah acak); menolak bila roster sudah terkunci; **dua `lockSoloDraw` bersamaan: satu berhasil, satu ditolak** (kolom unik `activeSoloDrawId` + serializable); `Event.participantCap` tidak berubah; audit tertulis tanpa data pribadi.
- [ ] **Step 2: Tes regresi mesin turnamen.** Setelah kunci, jalankan `drawing_save` dan `drawing_publish` dari `operations` pada event hasil kunci (fixture): lolos tanpa perubahan kode selain penjaga. `persistDrawing` (`commands.ts:35`) menerima himpunan tim yang sama. Ini membuktikan kriteria selesai nomor 10 PRD.
- [ ] **Step 3:** Merah → implementasi → hijau.
- [ ] **Step 4:** Tinjau dengan `security-reviewer` dan `database-reviewer` (aturan proyek: kode otorisasi, transaksi, dan kueri DB).

## Task 10: Panel organizer

**Files:**
- Modify: `src/app/[locale]/organizer/events/[eventId]/registration/page.tsx` (+ `page.test.ts`), `src/components/v3/organizer/registration/RegistrationWorkspace.tsx`, `RegistrationQueuePanel.tsx`, `PaymentReviewPanel.tsx`, `query.ts`
- Create: `src/components/v3/organizer/registration/SoloQuotaHeader.tsx`, `SoloDrawPanel.tsx`, `CloseRegistrationDialog.tsx` + tes
- Modify: `src/lib/registration/organizer-workspace-read.ts` (gabungkan pendaftar solo ke antrean dan antrean bayar, penanda "Solo") + tes
- Modify: `src/lib/registration/records.ts` (`RegistrationSource` mendapat `solo_registration`; `mapRequestStatus` untuk status solo, `queued` → label "Antrean")

**Perilaku:** `view=queue` dan `view=payments` menampilkan pendaftar solo di daftar yang sama dengan penanda "Solo"; `SoloQuotaHeader` (kiper/lapangan: terpakai / total / antrean); `view=draw` hanya untuk event solo (event tim tidak melihat tab ini): panel "Siap diacak", tombol Tutup pendaftaran (dialog daftar refund), Acak tim, Acak ulang, tukar pemain, tabel tim, daftar refund, Kunci tim. Semua tombol nonaktif dengan alasan terbaca (bukan hilang). Setelah kunci: tampilan hanya baca + tautan ke Kompetisi.

- [ ] **Step 1: Tes merah.** Pembaca organizer menggabungkan dua sumber dengan pagination stabil (ID item, bukan offset, sesuai PRD V3); filter status mencakup `queued`; `view=draw` untuk event tim = tidak tersedia; render panel untuk tiga keadaan (belum ditutup, draf, terkunci); dialog tutup menampilkan daftar refund; tombol Acak nonaktif saat tim < 2; semua teks dari `messages`.
- [ ] **Step 2:** Merah → hijau. Pakai komponen dan token V3 yang ada; tidak ada mesin impor/bayar kedua.
- [ ] **Step 3:** Cek visual 360/390/768/1024/1440 px: `scrollWidth <= clientWidth`, target sentuh >= 44 px, fokus terlihat, dialog menjebak fokus dan menutup dengan Escape.

## Task 11: Area pemain

**Files (semua baru kecuali dicatat):**
- `src/app/[locale]/player/layout.tsx`, `page.tsx`, `loading.tsx`
- `src/app/[locale]/player/registrations/page.tsx`
- `src/app/[locale]/player/team/[eventId]/page.tsx`
- `src/app/[locale]/player/profile/page.tsx`, `settings/page.tsx`
- `src/lib/player/dashboard-read.ts` + tes
- `src/components/solo/PlayerRegistrationCard.tsx`, `TeamCard.tsx` + tes
- Modify: `src/lib/navigation/*` (menu role `player`)

**Perilaku:**
- Semua halaman: `requireRole("player")`, kalau tidak, ke login.
- `/player`: kartu pendaftaran aktif (status, "Antrean ke-N", batas bayar, tombol upload bukti), kartu "Tim terbentuk" bila ada tim terkunci, pertandingan berikutnya (dari `Match` tim).
- `/player/registrations`: riwayat; batal; upload bukti baru bila `pending_payment`/`rejected`; status `unplaced` dengan keterangan refund.
- `/player/team/[eventId]`: hanya bila pemain ada di roster event itu **dan** tim terkunci. Anggota satu tim melihat UID, IGN, posisi, **WhatsApp** (hanya yang `shareContact`); orang lain 404.
- `/player/profile`: WhatsApp. `/player/settings`: kata sandi (pakai alur yang ada).
- Pembacaan memanggil `sweepSoloEvent` untuk event terkait.

- [ ] **Step 1: Tes merah.** Pembaca: pemain hanya melihat pendaftarannya sendiri; "Antrean ke-N" benar (urut `createdAt` di kelompok sama); WhatsApp teman hanya muncul setelah kunci dan hanya untuk anggota tim; pemain di tim lain mendapat 404; `unplaced` menampilkan keterangan refund. Komponen: render per status.
- [ ] **Step 2:** Merah → hijau. Cek visual dan a11y seperti Task 10.

## Task 12: Kapten hasil acak

**Files:**
- Modify: `src/middleware.ts` (sudah menerima `player` di Task 4), `src/app/captain/page.tsx` (+ pembungkus `[locale]/captain`), `src/app/captain/stats/page.tsx`, `src/app/captain/settings/page.tsx`
- Modify: `src/lib/actions.ts` (`requireCaptainSession`, 12 aksi), `src/lib/actions/captain-roster-change-actions.ts`, `src/lib/registration/actions.ts`
- Modify: `src/lib/security/authorization.ts` + matriks tes

**Perilaku:** `requireCaptainSession` dipecah dua: `requireCaptainOrOwnerSession()` (role `captain`, atau `player` yang `captainId` salah satu `Team`) untuk aksi roster dan statistik, dan `requireCaptainOnlySession()` (hanya `captain`) untuk semua aksi "daftar tim" dan draf tim. Halaman kapten untuk `player` hanya memuat tim milik sendiri, menyembunyikan bagian daftar tim ke event lain dan draf tim. Server menolak aksi daftar tim dari `player` walau tombolnya disembunyikan.

- [ ] **Step 1: Tes merah.** Matriks: `player` kapten tim A bisa ajukan ganti roster dan kirim statistik untuk tim A; ditolak untuk tim B (event sama maupun lain); `player` biasa (bukan kapten) ditolak di semua aksi kapten; `player` ditolak di aksi daftar tim dan draf tim; `captain` biasa tidak berubah (tes regresi dari `captain-roster-change-actions.test.ts`, `captain-draft-action.test.ts`, `actions.test.ts`).
- [ ] **Step 2:** Merah → implementasi → hijau.
- [ ] **Step 3:** Tinjau dengan `security-reviewer` (perubahan otorisasi).

## Task 13: Teks, aksesibilitas, seed, E2E

**Files:**
- Modify: `messages/id.json`, `messages/en.json`
- Modify: `prisma/seed.ts` (mode `--test`: akun pemain, event solo Flashpeak dengan kuota kecil)
- Create: `tests/e2e/solo-tournament.spec.ts`, helper di `tests/e2e/helpers/`
- Rujukan: `tests/e2e/captain-auth.spec.ts`, `tests/e2e/v3-organizer-lifecycle.spec.ts`

- [ ] **Step 1: Teks.** Namespace baru `solo.*` dan `player.*` di kedua file. Tidak ada teks UI tertulis mati di komponen baru. Ada tes yang membandingkan kunci `id.json` dan `en.json` (cek apakah sudah ada; kalau belum, tambah satu).
- [ ] **Step 2: Tinjau Bahasa Lazim.** Baca semua teks id dengan mata pemakai baru: satu hal satu kata ("Daftar", "Slot", "Antrean", "Acak tim", "Kunci tim", "Kiper"), pertanyaan <= 13 kata, instruksi <= 2 kalimat, tidak ada "Registrasi" atau "Waitlist" di teks Indonesia. Posisi wajib dibaca dari konfigurasi, bukan kata "kiper" tertulis mati.
- [ ] **Step 3: Seed uji.** Event solo Flashpeak berstatus `Published`, 2 tim (kuota 2 kiper, 8 lapangan), biaya berbayar, QRIS terbit; 1 organizer, 14 akun pemain bawaan seed (kata sandi dari variabel lingkungan seed yang sudah ada, tidak ditulis di kode).
- [ ] **Step 4: E2E jalur utama** (`pnpm test:e2e:prepare` lalu `pnpm exec playwright test tests/e2e/solo-tournament.spec.ts`):
  1. Pemain daftar akun → daftar solo → dapat slot → upload bukti → status `pending_review`.
  2. Pemain ke-3 di kelompok kiper penuh → `queued`, "Antrean ke-1", tanpa tombol bayar.
  3. Satu pemain batal → pemain antrean naik, melihat batas bayar.
  4. Organizer setujui semua pembayaran → tutup pendaftaran → acak → kunci.
  5. Pemain melihat `/player/team/[eventId]` dengan teman satu tim; WhatsApp tampil hanya untuk anggota tim.
  6. Organizer menjalankan acak grup/bracket di Kompetisi → berhasil tanpa perubahan lain.
  7. Kapten hasil acak membuka halaman kapten timnya; tidak bisa daftar tim ke event lain.
  8. Flag mati: tidak ada pilihan Solo, halaman daftar solo 404.
- [ ] **Step 5: Regresi.** Jalankan tes E2E yang ada untuk kapten dan organizer (`captain-auth`, `captain-team`, `roster-change`, `v3-organizer-lifecycle`): tetap hijau.
- [ ] **Step 6: Responsif dan a11y.** 360/390/768/1024/1440 px untuk halaman baru; Escape, fokus, target 44 px, `prefers-reduced-motion`.

## Task 14: Dokumen dan rollout

- [ ] **Step 1: Dokumen.** Perbarui `docs/operations/v3-feature-flag-matrix.md` (tambah `solo_tournament_v1`), `README.developer.md` (bagian peran: tambah `player`), dan status di `prd.md` / `database-design.md` ("disetujui", "diimplementasi fase 1").
- [ ] **Step 2: Gerbang kualitas penuh.** `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm test:e2e:ci` (atau skrip yang dipakai CI), cakupan kode baru >= 80%.
- [ ] **Step 3: Tinjauan.** `/code-review` atas seluruh cabang; `security-reviewer` (otorisasi, input, bukti bayar); `database-reviewer` (schema, indeks, transaksi).
- [ ] **Step 4: Rollout (urutan wajib, dikerjakan pemilik).**
  1. Gabungkan PR A.
  2. **PR B:** terapkan migrasi ke database produksi dulu (Neon SQL Editor atau `pnpm exec prisma migrate deploy` dengan `DIRECT_URL` produksi), baru gabung dan deploy.
  3. Gabungkan PR C, D, E, F dengan flag mati.
  4. Di pratinjau/staging: nyalakan `FEATURE_FLAG_SOLO_TOURNAMENT_V1=true`, jalankan E2E nyata satu kali dengan event uji.
  5. Produksi: nyalakan flag untuk satu organizer tepercaya dan satu event kecil. Awasi log, jumlah antrean, dan refund.
  6. Setelah satu event selesai bersih, flag dinyalakan umum.
- [ ] **Step 5: Rollback.** Matikan flag. Tidak ada migrasi balik. Tim yang sudah dikunci tetap tim biasa.

---

## Risiko pelaksanaan dan penangkalnya

| Risiko | Penangkal |
|---|---|
| Balapan slot terakhir menjual dua kali | Transaksi serializable + tes dua panggilan paralel (Task 6) |
| Pemain pindah ke antrean tidak tahu | Email setelah commit; antrean ditampilkan di `/player` (Task 6, 11) |
| Antrean tidak naik karena tidak ada cron | `sweepSoloEvent` dipanggil di tiga jalur baca/tulis; diuji idempoten. Bila volume naik, tambah cron di fase 2 |
| Pemain mendarat di `/captain` setelah masuk | Perbaikan `resolvePostLoginPath` + tes (Task 4) |
| `participantCap` terkunci ke daftar angka | Tidak diubah; kuota dihitung dari angka itu (Task 1, 7) |
| `drawing_save` jalan sebelum tim dikunci | Penjaga di `commands.ts` + tes regresi (Task 9) |
| Migrasi memecah build produksi | Gerbang `migration-ledger`, urutan rollout wajib (Task 3, 14) |
| Angka 5 / kata "kiper" tertulis mati menyulitkan Kuroko | Tes Kuroko di mesin murni (Task 2 Step 7) |
| Perubahan otorisasi membuka celah | Matriks tes + `security-reviewer` (Task 4, 12) |
| WhatsApp bocor | Tes privasi log dan HTML publik (Task 6, 7, 11) |

## Estimasi ukuran

Perkiraan kasar, untuk perencanaan saja: PR A kecil (mesin murni, banyak tes), B sedang (schema + akses), C besar (pendaftaran + antrean), D besar (acak + kunci + panel), E sedang, F sedang. Task 2, 6, 9 adalah tiga bagian yang paling menentukan benar-salahnya fitur; luangkan waktu tinjauan di situ.

## Catatan pelaksanaan (diperbarui saat PR C dibangun)

Hal yang berbeda dari rencana di atas, atau yang sengaja ditunda. Dokumen PRD dan desain database tetap acuan; catatan ini hanya mencatat selisih.

| Topik | Rencana | Yang dibangun | Alasan |
|---|---|---|---|
| Penguncian slot (Task 6) | Transaksi serializable | Semua penulisan slot satu event antre pada baris event (`withEventLock`), transaksi biasa | Di bawah 5 pendaftar serentak, serializable membuat 2 pendaftar gagal "write conflict". Dengan kunci baris, 30 pendaftar serentak terisi tepat sesuai kuota tanpa galat. Tes meloloskan kunci tetapi gagal tanpanya. |
| Pilihan "Cara daftar" (Task 7) | Di wizard buat event | Di editor draf event (status Draft) | Wizard punya empat jalur panggilan dengan baris panjang. Editor draf sudah cukup untuk "ubah event". Mengisi di wizard bisa menyusul. |
| Label tombol di hero non-adaptif (`PublicV3EventHero`) dan kartu daftar event | "Daftar solo" | Selesai di PR F: tampilan pendaftaran kompatibel memakai `buildSoloRegistrationCta`, tombolnya "Daftar solo" lewat halaman masuk biasa (bukan dialog kapten), dan mati bila flag mati | `entryMode` sudah ada di baris event yang dibaca pembaca publik, jadi tidak perlu kolom baru. Halaman detail lama dan V2 juga menyembunyikan tombol daftar untuk event solo bila flag mati. |
| Tujuan setelah masuk (Task 4/5) | `/player` | `/player` | Halamannya baru ada di PR E. Sampai itu, pemain yang masuk tanpa `returnTo` mendarat di 404. Aman karena semua di balik flag. |
| Pembayaran ditolak | Slot lepas | Slot tetap dipegang sampai batas waktu baru | Sama dengan alur tim yang ada (boleh unggah ulang). Dokumen PRD sudah diperbarui. |
| Tes database | Tes mock | Tes integrasi database asli, jalan di CI setelah snapshot katalog | Slot, antrean, dan balapan hanya bermakna dengan transaksi sungguhan. |
| Daftar "tidak masuk tim" | Acak | Urutan daftar (yang terakhir daftar tersisih) | Daftar refund harus bisa ditampilkan sebelum organizer memilih seed. |
| **PR D** Penguncian tutup/acak/tukar/kunci | Transaksi serializable | `withEventLock` (sama dengan PR C), dipindah ke `src/lib/solo/event-lock.ts` | Satu mekanisme untuk semua tulisan slot dan tim satu event. Dua kunci bersamaan: tes menunjukkan tepat satu berhasil. `lockSoloDraw` tetap memanggil `assertEventRosterMutable` di transaksi yang sama. |
| PR D: migrasi | Tidak ada migrasi di PR D | Satu migrasi kecil: kunci asing `SoloDrawAssignment` -> `SoloRegistration` dari `RESTRICT` jadi `CASCADE` | Dengan `RESTRICT`, menghapus event yang punya hasil acak gagal (event menghapus pendaftaran dan hasil acak di satu perintah). Ditemukan oleh tes integrasi. `NO ACTION` juga gagal karena dicek per cascade. Pengguna hanya dinonaktifkan di aplikasi, jadi `CASCADE` aman. **Terapkan ke produksi sebelum PR D di-deploy** (gerbang `migration-ledger`). |
| PR D: daftar solo di antrean dan bayar | Digabung dengan daftar tim, penanda "Solo" | Event solo menampilkan hanya pendaftar solo, dengan penanda "Solo" | Event solo menolak pendaftaran tim, jadi satu event tidak pernah punya dua jenis. Penggabungan dua sumber (dan paginasi gabungan) tidak diperlukan. |
| PR D: tab di event solo | Tab Acak tim ditambah | Tab Impor XLSX/CSV disembunyikan untuk event solo | Impor tim ditolak server untuk event solo, tab-nya hanya membingungkan. |
| PR D: pemain di antrean saat tutup | `withdrawn` dengan catatan | `withdrawn`, catatan "Pendaftaran ditutup." disimpan di `rejectReason` | Tabel tidak punya kolom catatan lain yang pantas, dan pemain melihat alasannya di halaman event. |
| PR D: refund | Organizer menandai refund | `markSoloRefunded` + tombol "Tandai sudah refund" di daftar tidak masuk tim | Hanya untuk event berbayar dan pemain yang sudah bayar. Mengisi `refundedAt` dan `refundNote`. |
| PR D: penjaga `drawing_save` | Tolak dengan pesan | `Error` biasa "Kunci tim dulu sebelum mengacak grup." | Sama dengan galat validasi lain di `commands.ts`. Panel Acak tim sudah menjelaskan urutannya, jadi pesan ini jarang terlihat. |
| PR D: tag tim | `T{N}` | `T{N}`, tetapi `TM{N}` bila `T{N}` ditolak filter kata kasar | `T41` terbaca "tai" setelah filter mengganti angka jadi huruf. Tanpa cadangan, event dengan 41 tim atau lebih (kuota 64/128/256) tidak akan pernah bisa dikunci. Ditemukan tes 64 tim. |
| PR D: token "layar yang saya lihat" | Tidak ada | Tukar dan kunci mengirim `SoloDraw.updatedAt` yang dilihat layar. Berbeda = "Data sudah berubah", layar dimuat ulang | Dua pengelola event (organizer dan admin) bisa membuka draf yang sama. Tanpa token, kunci yang tidak bisa dibatalkan bisa terjadi pada susunan yang tidak pernah dilihat pengunci. Ditemukan tinjauan kode. |
| PR D: acak ulang | Satu klik | Meminta konfirmasi bila sudah ada draf | Acak ulang membuang pertukaran manual dan hasil lama tidak ditampilkan lagi. |
| PR D: setuju/tolak pembayaran | Transaksi biasa | Di bawah kunci event, dan ditolak setelah tim dikunci | Tanpa kunci, persetujuan bisa menyelip antara pengecekan hash dan pembuatan tim. Daftar, batal, setuju, dan tolak juga ditolak bila `activeSoloDrawId` terisi (mis. event dibuka lagi lewat form admin). Ditemukan tinjauan database. |
| PR D: status event solo lewat form admin lama | Tidak dibahas | `setEventStatus` menolak "Registration Closed" langsung untuk event solo (harus lewat tab Acak tim) dan menolak membuka lagi event yang timnya sudah dikunci | Form `/admin` bisa melewati penyelesaian pembayaran dan refund. Pesan ditampilkan lewat `/admin?error=`. |
| PR D: refund | Tandai bila event berbayar | Hanya untuk pemain yang sudah bayar dan tidak masuk tim (disetujui dan tersisih di hasil acak terkini, atau batal setelah disetujui). Ditulis ke audit `solo_refund_marked` | Tombol hanya muncul untuk yang tersisih, server kini menegakkan hal yang sama. |
| PR D: penulisan massal saat kunci | Satu per satu | `createMany` untuk tim dan pemain, penempatan ditulis ulang dengan tautannya (id sama), batas waktu transaksi 60 detik | 64 tim berarti sekitar 700 query berurutan di dalam satu transaksi 30 detik. Tanpa SQL mentah karena aturan proyek melarangnya (`security-smoke`). |
| PR D: aksi organizer | Cek akses lalu cari data | Cek flag dan peran dulu, baru cari data. Id yang tidak ada dan event milik orang lain dijawab sama. Acak ulang dibatasi 10 per menit per event. Galat tak terduga dicatat (kelas dan kode saja) | Tinjauan keamanan: tidak boleh ada oracle keberadaan id, dan tiap acak mengambil kunci event. |
| PR D: status "kedaluwarsa" | Dipetakan ke "Perlu perbaikan" | Pendaftar solo yang kehabisan waktu tampil "Kedaluwarsa" | "Perlu perbaikan" adalah kosakata tim. |
| PR D: yang sengaja belum | - | Indeks pada `SoloRegistration.approvedById`, `SoloDraw.createdById`, `SoloDraw.lockedById` (hapus akun jadi seq scan). `lock_timeout` di `withEventLock`. Sapuan antrean hanya bila ada yang jatuh tempo. Hapus akun pemain menghapus penempatannya di hasil acak terkunci (akun hanya dinonaktifkan di aplikasi) | Disarankan reviewer, tetapi butuh migrasi lagi atau mengubah perilaku PR C. Dicatat untuk PR F. |
| PR D: kapten yang namanya tidak lolos validasi | Nama akun jadi nama kapten | Pakai nama akun, kalau tidak lolos pakai IGN, kalau tidak lolos juga kunci ditolak | `validateTeamData` menolak tanda `<` `>` dan kata terlarang. Kunci tidak boleh gagal karena nama akun yang aneh. |
| PR E: bayar dan batal di `/player` | Upload bukti baru dan batal dari `/player/registrations` | Kartu pendaftaran menaut ke halaman daftar event (`/events/<slug>/register`), tempat bayar, unggah bukti, dan batal sudah ada | Satu tempat untuk tiap aksi. Aksi itu mengarahkan balik ke halaman event, dan tidak perlu dua form untuk hal yang sama. |
| PR E: WhatsApp teman satu tim | Hanya yang `shareContact` | Semua anggota tim yang punya nomor, karena izin berbagi wajib dicentang saat daftar | Tidak ada kolom `shareContact` di tabel; form menolak pendaftaran tanpa izin itu. Pemain yang ditambahkan kapten lewat tangan tidak punya nomor dan tampil "Tidak ada". |
| PR E: `/player` dan flag | Tidak dibahas | Halaman area pemain 404 bila flag `solo_tournament_v1` mati | Aturan global: flag mati, tidak ada jalur solo. Kapten hasil acak tetap bisa memakai halaman kapten karena itu jalur tim biasa. |
| PR E: gerbang kapten | `requireCaptainSession` dipecah dua | `src/lib/auth/captain-access.ts`: `getCaptainOrTeamOwner` (kapten, atau pemain yang `captainId` salah satu tim), `getCaptainOnly`, `getCaptainOrPlayer` (ganti password). `actions.ts` memakai `requireCaptainOnlySession` untuk daftar tim, draf tim, dan bukti bayar tim, dan `requireCaptainOrOwnerSession` untuk roster, logo, dan statistik | Tiap aksi tetap membatasi ke tim milik akun itu di lapisan database (`captainId`). Dibuktikan dengan tes database nyata untuk tim lain di event yang sama dan event lain. |
| PR E: ganti password | Pakai alur yang ada | `changePasswordAction` menerima kapten dan pemain; pemain kembali ke `/player/settings` dan `/player`. `/captain/settings` tetap khusus kapten | Pemain hasil acak yang bukan kapten juga perlu ganti password, jadi tidak bisa bergantung pada halaman kapten. |
| PR E: halaman kapten untuk pemain | Sembunyikan daftar tim dan draf | Pemain hasil acak hanya melihat tab roster: tidak memuat event terbuka dan permintaan bayar, tidak ada form draf tim, deskripsi roster memakai teks sendiri, tombol pengaturan menuju `/player/settings` | Server tetap menolak aksinya walau tombolnya tidak ada. |
| PR E: menu | Ubah `src/lib/navigation/*` | Tautan "Pemain" ditambah di `shell.tsx` (v3), `session-nav.tsx`, dan `mobile-nav.tsx`. `src/lib/navigation/` hanya berisi `safe-return-to` | Tidak ada modul menu yang perlu diubah. |
| PR E: tipe `Team.source` | - | Ditambah `"solo-draw"` | Dipakai untuk mengenali tim hasil acak di halaman kapten. |
| PR E: yang sengaja belum | - | Tidak ada tes E2E untuk `/player` (PR F). Sapuan antrean saat `/player` dibuka memakai `sweepSoloEventAndAnnounce` yang menelan galat | Sama dengan jalur lain. |
| PR E: roster tim hasil acak | Kapten hasil acak "ganti roster" | Kapten hasil acak tidak bisa menambah, mengganti nama, atau menghapus pemain langsung (`addPlayer`, `updatePlayer`, `deletePlayer` menolak tim `solo-draw`). Perubahan lewat permintaan ganti roster yang disetujui organizer, dan halaman kapten menyembunyikan kontrol langsung dengan catatan | Roster tim solo adalah hasil acak organizer dari pemain yang masing-masing sudah bayar slot. Tanpa ini, kapten bisa menghapus teman yang sudah bayar atau memasukkan orang yang tidak pernah daftar. Ditemukan tinjauan keamanan. Kapten tim biasa tidak berubah. |
| PR E: ganti password | - | Dibatasi 5 percobaan per 15 menit per akun | Tanpa batas, pemegang cookie sesi bisa menebak password lama. Pesan galat di halaman pengaturan pemain hanya dari daftar pesan yang dikirim aksinya. |
| PR E: yang sengaja belum | - | Ganti password belum mengakhiri sesi lain (`sessionVersion`), dan `decodeURIComponent` pada parameter `error` di halaman kapten yang sudah ada belum diganti kode galat | Keduanya sudah ada sebelum solo dan menyentuh semua kapten, jadi perlu PR sendiri. Dicatat untuk PR F. |
| **PR F** Seed uji | Mode `--test`, event 2 tim | Di seed utama (`prisma/seed-solo.ts`), karena `test:e2e:prepare` menjalankan `db:seed`. Event `flashpeak-solo-cup` (cap 2, di bawah pilihan wizard, sengaja) dan 14 akun `solo-player-NN` | Seed `--test` tidak dipakai oleh E2E mana pun. Nomor WhatsApp seed disimpan dalam bentuk yang sama dengan form (angka berawalan 62). |
| PR F: E2E jalur utama | Delapan langkah | `tests/e2e/solo-tournament.spec.ts`: daftar akun sampai bukti bayar, antrean, naik dari antrean, organizer setuju-tutup-acak-kunci, halaman tim dan WhatsApp, kapten hasil acak, acak grup dan bracket lewat operasi yang sama dengan fixture lain, lima lebar layar. Langkah "flag mati" ada di `tests/e2e-legacy/solo-flag-off.spec.ts` | Satu server E2E punya satu nilai flag. Profil flags-off yang sudah ada (`E2E_COMPETITION_FLAGS_OFF`) kini juga mematikan flag solo. Acak grup dan bracket dijalankan lewat `createCompetitionOperations` seperti fixture lain, bukan lewat klik layar. |
| PR F: reset data uji | - | Event solo dihapus dan dibuat ulang dengan id yang sama | Server menyimpan event per alamat selama 60 detik, termasuk antar-restart. Id baru membuat form menunjuk event yang sudah tiada. |
| PR F: halaman 404 pemain | 404 | Isi halaman 404, status HTTP 200 | Halaman mengalir di balik `loading.tsx`, jadi status sudah terkirim sebelum `notFound()`. Tidak ada data yang bocor. Tes memeriksa isi halaman. |
| PR F: ganti password | Ditunda dari PR E | Sandi baru menaikkan `sessionVersion`, sesi perangkat lain berhenti, perangkat yang mengganti dapat sesi baru (`reissueSession`). Berlaku juga untuk organizer | Sesi yang dicuri tidak lagi hidup setelah korban mengganti sandi. |
| PR F: `decodeURIComponent` halaman kapten | Ditunda dari PR E | Dihapus; pesan galat tampil apa adanya | Next sudah mendekode parameter. Dekode kedua melempar galat untuk teks berisi `%`. |
| PR F: indeks kunci asing | Ditunda dari PR D | Migrasi `20261015000000_solo_fk_indexes` (tiga indeks) | Hapus akun mengubah tautan jadi null lewat scan penuh tanpa indeks. |
| PR F: sapuan antrean | Ditunda dari PR D | Cek baca dulu (ada tenggat lewat, atau antrean dengan slot kosong); kunci event hanya bila perlu | Tiap buka halaman daftar atau `/player` tidak lagi mengambil kunci tulis event. |
| PR F: `lock_timeout` di `withEventLock` | Ditunda dari PR D | Tidak dibuat | Aturan proyek melarang SQL mentah di kode aplikasi. `maxWait` 15 detik dan batas transaksi 30 detik sudah membatasi tunggu. Migrasi memakai `SET LOCAL lock_timeout`. |
| PR F: teks | Tinjau Bahasa Lazim | "Seed" menjadi "Kode acak", "Buka halaman daftar" menjadi "Buka halaman pendaftaran", "Selesai" (pendaftaran hangus atau batal) menjadi "Berakhir", subjek email "Kamu masuk" menjadi "Kamu terdaftar", teks panjang dipangkas jadi dua kalimat. Tes `messages-parity.test.ts` menjaga kunci, argumen, kata terlarang, dan panjang kalimat | Satu hal satu kata, instruksi paling banyak dua kalimat. |
