# Unggah gambar

Gambar yang diunggah organizer atau admin masuk lewat server action. Kode unggahnya ada di `src/lib/actions/shared/uploads.ts`.

## Action unggah

| Action | File | Fungsi |
|---|---|---|
| `adminUploadEventLogoAction` | `event-visual-actions.ts` | Logo event |
| `adminUploadEventVisualAction` | `event-visual-actions.ts` | Gambar latar event (lewat tinjauan revisi) |
| `adminUploadTeamLogoAction` | `team-actions.ts` | Logo tim |
| `adminUploadCharacterArtAction` | `event-actions.ts` | Gambar karakter untuk sertifikat MVP |

## Tempat penyimpanan

- Kalau `BLOB_READ_WRITE_TOKEN` ada, file masuk ke Vercel Blob.
- Kalau tidak ada, file ditulis ke folder `public/` (hanya untuk lokal).

## Aturan

- Hanya folder di daftar `UPLOAD_FOLDERS` yang boleh dipakai. Folder baru ditambahkan di daftar itu.
- Tipe file dicek dari isi file, bukan dari nama. File yang menyamar sebagai gambar ditolak.
- `uploadImageAsset` tidak mengecek sesi sendiri, jadi tidak boleh diekspor dari file `"use server"`. Action yang memanggilnya wajib mengecek sesi dan izin lebih dulu.

Latar belakang aturan server action ada di [arsitektur](../architecture.md).
