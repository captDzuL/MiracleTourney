# Claude handoff — checkpoint 1: pemulihan database testing

Status: **pemulihan Delicate berhasil; verifikasi rilis belum selesai. Bukan production-ready.**

## Titik lanjut dan kepemilikan

- Branch sumber: `codex/v3-controlled-production-readiness`; target PR: `feature/ui/release/1.0`.
- Baseline release: `0c828b5ec7900a30a927d4ac9e775eaf21ebb939`.
- Executable SHA untuk operasi nyata checkpoint ini: `dbb48f06107bb3eef5a5ba47af33f6493cd1f5bf`. Commit yang memuat dokumen ini adalah checkpoint publikasi **dokumentasi saja**, bukan SHA yang sebelumnya diuji. Jangan mengulang tes hanya karena commit dokumen.
- Worktree: `E:/dev/MiracleTourney-gitnative/.worktrees/codex-public-event-overview`. Jangan menyentuh checkout integration atau worktree task lain.
- Perubahan owner pada `docs/operations/2026-10-03-public-home-pressure-rca.md` tetap tidak di-stage. Hash terjaga: `861E4072B8ADB9CF3BC4A324BB7303A3C21E17A10C117DB777A1AAD711295404`. Jangan edit/discard/reset/stash.
- `.superpowers/sdd/2026-10-06-v3-controlled-production-readiness/` menyimpan brief/report/ledger privat. Jangan force-add, hapus, atau publikasikan archive, credential, key, raw logs maupun PII.

## Yang diselesaikan

Delicate memiliki 37 migrasi tercatat tetapi skema fisiknya tertinggal. Perbaikan terarah menambahkan skema yang hilang dengan ledger tetap identik, mempertahankan lima tabel legacy tambahan, dan mengganti hanya index Certificate lama yang memang diganti migrasi canonical. Tidak ada global reset, seed, replay migrasi, atau perubahan production.

Task12 source/fix1/fix2 ditinjau independen; fix2 channel-binding accepted pada `ccc78acf37697fb6e4ba79037ba85a4162cc3e35`. Task13 initial review menemukan no-op tidak lengkap dan kegagalan receipt pasca-commit. Fix1 menutup receipt, invariant utama dan translasi TLS Prisma; fix2 menutup foreign group/member. Review fix2: spec **PASS**, kualitas **PASS**, tanpa Critical/Important tersisa pada lingkup ini. Review final seluruh branch masih belum dilakukan.

Prisma 6.19.3 tidak menerjemahkan `verify-full`/`sslrootcert` libpq sebagaimana diharapkan. Operator fixture menggunakan native `require` + `strict` + CA terpin + mandatory channel binding yang sudah divalidasi. SELECT read-only melalui helper aktual lolos, target `neondb/public/test`, 5.436 ms. Ini bukti operator testing, bukan audit semua koneksi aplikasi production.

## Bukti operasi nyata — 6 Oktober UTC / 7 Oktober WIB

Target hanya project `steep-tree-47893196`, test branch `br-young-thunder-az5w6nt3`, endpoint `ep-delicate-forest-azuodo4q`, database `neondb`. Production parent **bukan target**. Provider metadata dan identitas runtime cocok; snapshot sebelum operasi menunjukkan nol session lain aktif dan 20 CI terbaru telah terminal.

| Operasi | Hasil dan waktu |
| --- | --- |
| Export terenkripsi pre-schema | Exit 0, 95.656 byte, pipeline 2.848 ms; command wall 8,01 s; warning 0 |
| Apply skema terarah | `TESTING_SCHEMA_REPAIRED`, exit 0, command wall 7,95 s |
| Export terenkripsi post-schema/pre-fixture | Exit 0, 190.722 byte, pipeline 3.033 ms; command wall 8,06 s; warning 0 |
| Rekonstruksi empat fixture | `TESTING_FIXTURES_RECONSTRUCTED`, exit 0, receipt `created`; command menunggu sedikitnya 10,01 s sebelum yield, **total wall tidak dicatat**; jangan klaim angka presisi atau ulang operasi untuk timing |
| Public fixture compatibility | Empat state dan local asset lolos, exit 0, command wall 0,53 s |

Archive dan manifest berada di `E:/MiracleBackups`, private owner-only; `pg_dump` custom langsung dialirkan ke age, tidak ada dump plaintext pada disk. Pasangan archive diverifikasi, dan checkpoint agregat/catalognya berasal dari snapshot yang sama dengan export.

- Pre-schema: `miracle-testing-neondb-2026-10-06T19-30-16-560Z.age`; SHA256 `de025a1ce82d0bd7c146f44eb0dffbb4c4c13f9bae1baff46806811616dee5fc`.
- Post-schema: `miracle-testing-neondb-2026-10-06T19-31-09-624Z.age`; SHA256 `bb94ce3cc9e67f1a24dcbf4e272e60a9d0f5df331495fb44341a993792281e52`.
- Ledger SHA256 tetap `e4fb878a3feb48b4349f9c0ed174d688bba3ac3be082d3a9f572dd6bdcf9ead0`; 37 finished, tanpa ledger rewrite.
- Catalog nyata terverifikasi: 50 tabel fisik public, 545 kolom, 156 index, 525 constraint, 10 enum, 1 trigger, 1 function. Sembilan tabel `neon_auth` tidak diubah.
- Full old-column projections seluruh 24 tabel awal tetap identik (23 tabel aplikasi berisi 233 baris, ditambah 37 ledger rows); bukan hanya hitungan baris.
- Receipt rekonstruksi: `task13-fixture-recovery-bb94ce3cc9e67f1a24dcbf4e272e60a9d0f5df331495fb44341a993792281e52.json`, timestamp rekonstruksi `2026-10-06T19:31:34.708Z`.
- Receipt old-row hash: `76e6137c7b01226fc5a74ac1f447a34a3aa39e90f2f4344c18da9d5eeeb698c2`; new-state hash: `37b9068c52c6164daa7715d2ef4a06e0bf62bf8833ea84928004a12763e78a45`.

Metadata baru hanya untuk `flashpeak-revision-published`, `flashpeak-revision-closed`, `flashpeak-rising-64`, dan `flashpeak-champions-32`. Total aktual: 3 phase, 16 dependency, 2 schedule, 8 result revision, 1 completion; semua group kosong. Empat fixture punya versi kompetisi 0/1/1/2 sesuai state. ID, status, hasil, nilai kolom lama, dan event lain dipertahankan. Provenance `task13-synthetic-fixture-reconstruction-v1` menandai data sintetis baru; ini bukan pemulihan aktor/waktu historis yang hilang. Finished fixture mempertahankan satu sertifikat lama, publication 0; **tidak mengklaim tujuh sertifikat historis terbit**.

## Bukti sebelumnya — jangan diulang atau dilebihkan

- Whole unit run terdahulu: 617 suites, 2.826 test dieksekusi, 2.816 pass/10 fail, 192,50 s. Penutupan terarah: sandbox-bound synthetic performance 19/19 pass; static mutation regression 8/8 pass. Ini bukan whole-suite rerun PASS. Satu required DB persistence case belum dijalankan.
- Task13 focused 49 Vitest pass; fix1 URL/LF 2 Node pass dan isolated PG pass; fix2 genuine RED kemudian isolated PG 1/1 pass (21,63 s wall), scoped lint nol warning dan TypeScript pass. Local synthetic cluster berhenti; reviewer tidak mengulang tes tersebut.
- Strict lint seluruh project sebelumnya nol warning; frozen install, Prisma validate, TypeScript, dependency audit production tanpa vulnerability dan diff check pernah lolos pada SHA terdokumentasi. Static checks terdampak source baru perlu dicatat terpisah; jangan mengklaim seluruh command berjalan pada SHA terbaru.
- Production-derived encrypted backup/rehearsal sebelumnya sudah selesai: archive 175.055 byte, SHA256 `8102e70a03c26a34a7fabcb4a197979051223a88946a79b0f4242055e65bbc1a`; export 7.276 ms, verify 1.794 ms, rehearsal 79.128 ms. Dua restore cocok 23 tabel/2.036 baris; migration candidate 17→37, 13.746 ms, repeat no-op 1.132 ms. PostgreSQL 18.6 lokal berhenti. Jangan export/rehearse ulang hanya demi timestamp.

## Kelanjutan tepat — tiga checkpoint push berikutnya

1. **PHASE A:** satu required DB persistence case, satu public E2E runner 54 kasus (35 DB +9 V3 +9 V2 +1 legacy), lalu tiga supplemental organizer/accessibility/certificate geometry cases. Workers1/retries0/no skips/no flaky. Pakai fixture tersedia, NO_RESET=1; tidak menjalankan prepare/reset/reseed atau dua shard aplikasi penuh. Catat actual SHA/count/duration/exit; gagal berarti stop dan diagnosis, bukan retry otomatis. Setelah terminal, handoff checkpoint2 dan push sebelum beban.
2. **PHASE B:** satu production-mode build dan pressure runner 11 skenario/520 request terukur +11 initial samples. p95 tiap skenario <3 s, deadline10 s, nol HTTP/timeout/content failure. Initial >3 s hanya warning, bukan p95. Return/HOLD, handoff checkpoint3 dan push. Jangan membangun dua kali atau mengulang tes untuk doc-only SHA.
3. Fresh whole-branch review, tutup finding penting, handoff checkpoint4 dan push; Draft PR ke release dan protected Preview verification sesudah bukti yang relevan tersedia.

## Batas dan pekerjaan production yang masih terbuka

- Public54/supplemental3/required DB1/build-load/final branch review/Preview terbaru: **NOT RUN** pada checkpoint ini. Tidak ada p95 aktual kandidat baru.
- GitHub CI deferred oleh owner. Push checkpoint memakai `[skip ci]`; required checks yang belum tersedia **bukan pass**. Tidak mengubah CI, bypass branch protection, force push, atau merge.
- Live Vercel override yang terakhir diperiksa masih auto-migrate pada production build. Usulan build-only `pnpm vercel-build` **belum diterapkan/read-back**. Ini blocker sebelum production cutover.
- Production migration/deployment/flag/settings/write-pause/restore/merge **belum diotorisasi dalam fase ini**. Fresh backup menjelang cutover serta keputusan manusia tetap wajib. Artifact aplikasi lama tidak otomatis kompatibel setelah certificate/reset migrations.
- Backup mingguan **PAUSED**. Weekly backup tidak memenuhi target RPO≤1 jam. RTO≤30 menit/RPO≤1 jam belum terbukti sebagai layanan produksi. Production backup operator legacy17 belum divalidasi untuk post-V3 ledger37; perlu follow-up sebelum aktivasi jadwal.
- Admin V3 dan fitur tambahan ditunda. Local restored database mengandung data sensitif dan tetap privat, bukan DB E2E/CI. Locale/extension equivalence, layanan email/Blob dan recovery layanan tidak dibuktikan oleh rehearsal SQL lokal.

Gunakan Sol High untuk debugging/keamanan/migrasi/review, Luna untuk pekerjaan mekanis. Sumber serial, brief/report privat, fresh reviewer. Jangan mengulang pekerjaan yang bukti scoped-nya sudah accepted atau memperluas izin menjadi operasi production.
