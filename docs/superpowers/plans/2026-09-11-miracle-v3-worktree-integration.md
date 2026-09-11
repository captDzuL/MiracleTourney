# Miracle V3 Worktree Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menyatukan seluruh perubahan relevan dari worktree Git ke checkout utama agar Miracle V3 dapat dijalankan lokal, dengan `feature/ui/adaptive-public-event-v3` dikecualikan.

**Architecture:** Branch `integration/miracle-v3-local` dirakit pada worktree terisolasi dari HEAD checkout utama. Commit unik digabung secara eksplisit; perubahan belum di-commit dipreservasi sebagai stash bernama dan dipindahkan tanpa memasukkan metadata `.claude` atau `package-lock.json`. Setelah test dan build lulus, checkout utama diarahkan ke branch integrasi dan perubahan lokal dipulihkan.

**Tech Stack:** Git worktree, Next.js 15, Prisma 6, Vitest, Playwright, pnpm.

## Global Constraints

- Jangan merge atau mengambil perubahan dari `feature/ui/adaptive-public-event-v3`.
- Jangan menghapus worktree sumber.
- Jangan kehilangan perubahan tracked atau untracked pada checkout utama.
- Jangan memasukkan `.claude/`, `.agents/`, hasil test sementara, atau `package-lock.json` ke commit integrasi.
- Jangan menjalankan migration atau seed terhadap `.env` utama.

---

### Task 1: Create safety snapshots and integration workspace

**Files:**
- Create: `.worktrees/miracle-v3-integrated/`

- [ ] **Step 1:** Simpan status, branch, dan HEAD seluruh worktree dalam log operasi.
- [ ] **Step 2:** Buat stash recoverable untuk perubahan checkout utama, termasuk untracked files.
- [ ] **Step 3:** Buat branch `integration/miracle-v3-local` pada worktree `.worktrees/miracle-v3-integrated` dari `codex/stat-recording-status`.
- [ ] **Step 4:** Pastikan checkout utama bersih dan stash tetap terdaftar.

### Task 2: Merge committed V3 branches

**Files:**
- Modify: Git history on `integration/miracle-v3-local`

- [ ] **Step 1:** Merge `feature/ui/release/1.0` dengan merge commit.
- [ ] **Step 2:** Merge `feature/ui/release/1.0-task-1` sampai `feature/ui/release/1.0-task-6` berurutan.
- [ ] **Step 3:** Selesaikan konflik berdasarkan kombinasi API terbaru, bukan memilih satu sisi secara global.
- [ ] **Step 4:** Verifikasi `git log main..HEAD` tidak memuat commit dari `feature/ui/adaptive-public-event-v3`.

### Task 3: Integrate uncommitted worktree changes

**Files:**
- Modify: source files reported dirty by each source worktree
- Create: relevant assets under `public/payment-qris`, `public/event-backgrounds`, and `public/event-logos`

- [ ] **Step 1:** Buat commit preservasi pada tiap worktree dirty untuk source/assets relevan saja.
- [ ] **Step 2:** Abaikan `.claude/` and `package-lock.json` karena bukan source pnpm production.
- [ ] **Step 3:** Merge commit preservasi ke branch integrasi dan selesaikan konflik semantik.
- [ ] **Step 4:** Pastikan setiap worktree sumber tetap terdaftar dan tidak dihapus.

### Task 4: Restore root registration and local changes

**Files:**
- Modify: all files captured in the root safety stash

- [ ] **Step 1:** Apply root safety stash pada worktree integrasi tanpa menjatuhkan stash.
- [ ] **Step 2:** Selesaikan konflik dengan mempertahankan Registration Control Center, Captain Registration, dan V3 release components.
- [ ] **Step 3:** Commit perubahan aplikasi yang relevan; biarkan artefak lokal non-source di stash.
- [ ] **Step 4:** Jalankan `git diff --check`.

### Task 5: Verify and connect the main folder

**Files:**
- Verify: application and tests

- [ ] **Step 1:** Jalankan `pnpm install --frozen-lockfile` bila dependency tree berubah.
- [ ] **Step 2:** Jalankan `pnpm lint` dan `pnpm test`.
- [ ] **Step 3:** Jalankan `pnpm build`.
- [ ] **Step 4:** Lepaskan branch integrasi dari linked worktree, checkout branch itu di `E:/dev/MiracleTourney-gitnative`, lalu pulihkan artefak lokal yang tidak dikomit.
- [ ] **Step 5:** Jalankan preflight `.env.test` dan berikan URL serta akun test lokal.
