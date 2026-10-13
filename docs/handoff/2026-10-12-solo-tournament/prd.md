# PRD — Miracle Turnamen Solo (Pemain Perorangan)

Status: disetujui pemilik produk untuk fase 1 (Flashpeak 5v5), 12 Oktober 2026 (Asia/Jakarta). Implementasi dimulai bertahap, semua di balik flag `solo_tournament_v1`.

## 1. Maksud produk

Miracle V3 melayani organizer dan kapten. Orang yang mau main tapi belum punya tim tidak bisa ikut. Fitur ini menambah satu jalur: **pemain daftar sendiri, organizer mengacak mereka jadi tim, lalu event berjalan seperti event tim biasa.**

Janji produknya: **pemain yang sudah bayar pasti dapat tim.** Pemain cukup daftar. Kalau dapat slot, dia bayar. Setelah pendaftaran tutup, organizer mengacak, memeriksa, lalu mengunci. Pemain langsung tahu tim, kapten, dan teman satu timnya. Setiap tim punya tepat satu kiper.

### Penilaian ide

**Layak dibangun.**

- Menambah jumlah peserta tanpa menunggu tim lengkap.
- Biaya bangun rendah: hasil acak dikunci menjadi `Team` dan `Player` biasa, jadi grup, bracket, jadwal, statistik, dan sertifikat jalan apa adanya.
- Pemain punya akun sendiri. Riwayat dan statistik lintas event bisa dibangun di atasnya.

**Risiko dan penutupnya:**

| Risiko | Akibat | Penutup di desain |
|---|---|---|
| Pemain bayar tapi tidak dapat tim | Pemain rugi uang dan waktu, uang tertahan di organizer | **Kuota per posisi.** Tiap tim butuh 1 kiper + 4 pemain lapangan, jadi slot dihitung per posisi. Bayar baru diminta setelah pemain dapat slot. Yang melewati kuota masuk antrean tanpa bayar. |
| Kiper sedikit | Jumlah tim dibatasi jumlah kiper | Kuota kiper = jumlah tim. Pemain lapangan boleh mengisi "bisa jadi kiper darurat". Panel "Siap diacak" menghitung tim yang jadi. |
| Kuota tidak seimbang saat pendaftaran ditutup | Ada pemain yang sudah bayar tapi tidak masuk tim | Tombol "Tutup pendaftaran" memperingatkan dan meminta organizer menandai pemain yang kena refund. Kasus ini kecil karena kuota sudah per posisi. |
| Satu anggota tidak datang | Tim gagal main | Kontak WhatsApp antar anggota setelah kunci, organizer bisa ganti pemain dari antrean. |
| Level tidak merata | Tim timpang | Fase 1 acak murni. Fase 2 tambah pengacakan seimbang berdasarkan tingkat. |
| Hasil acak dituduh curang | Organizer kehilangan kepercayaan | Seed, versi algoritma, hash data, dan jejak audit disimpan. Hasil bisa diulang. |
| Satu orang punya banyak akun | Satu pemain masuk dua kali | UID game unik per event. |
| Organizer menukar peserta setelah acak | Hasil tidak adil | Tombol kunci menolak kalau daftar pemain berubah sejak diacak. Perubahan sesudah kunci tercatat. |
| Pemain yang naik dari antrean tidak tahu | Slot hangus | Satu email "slot kamu terbuka" saat naik dari antrean (satu-satunya email baru di fase 1). |

**Syarat agar aman:** jangan membuat mesin turnamen kedua. Solo hanya jalur pendaftaran dan pembentuk tim.

## 2. Istilah (Bahasa Lazim)

Satu hal satu kata, di semua tempat (judul, isi, label, pesan, email).

| Pakai | Jangan pakai | Catatan |
|---|---|---|
| Pemain | Peserta perorangan, Individu, Player (di teks Indonesia) | Nama role di UI. Nilai di database tetap `player`. |
| Daftar | Registrasi, Pendaftaran (sebagai tombol) | Tombol, pesan sukses, dan email semuanya "Daftar". |
| Daftar solo | Daftar individu | Tombol di halaman event solo. Event tim tetap "Daftar tim". |
| Slot | Kursi, Jatah | Satu tempat di satu tim: slot kiper atau slot lapangan. |
| Antrean | Waitlist, Daftar tunggu | Pemain yang daftar tapi slotnya penuh. Belum bayar. |
| Acak tim | Draw, Pengundian, Randomisasi | Aksi organizer. |
| Kunci tim | Finalisasi, Publish tim | Setelah dikunci, tim jadi nyata dan pemain bisa melihatnya. |
| Kiper | Penjaga gawang | Nilai di database tetap `Goalkeeper` (sudah ada di konfigurasi game). |
| Kiper darurat | Backup GK | Pemain lapangan yang mau jadi kiper kalau kiper kurang. |
| Pemain lapangan | Outfield | Semua posisi selain kiper. |
| Kapten | Ketua tim | Sudah dipakai di Miracle. |
| Tim 1, Tim 2 ... | Nama kreatif otomatis | Nama bawaan hasil acak, tag `T1`, `T2`. |

Teks UI ditulis di `messages/id.json` dan `messages/en.json`. Kalimat tanya maksimal 13 kata. Satu instruksi maksimal 2 kalimat.

## 3. Persona

- **Pemain** (user baru): punya akun, daftar event solo, bayar kalau dapat slot, lihat tim hasil acak, lihat jadwal dan hasil timnya.
- **Organizer**: membuat event solo, memantau kuota, menyetujui bukti bayar, mengacak, memeriksa, mengunci, mengganti pemain.
- **Kapten (hasil acak)**: pemain yang terpilih jadi kapten tim solo. Dapat kemampuan kapten yang sudah ada untuk timnya saja.
- **Admin platform**: akses sama seperti ke event lain.
- **Penonton publik**: melihat event seperti biasa. Sebelum kunci hanya melihat jumlah pemain. Sesudah kunci melihat tim dan roster seperti event tim.

## 4. Siklus event solo

Memakai status event yang sudah ada (`Draft`, `Published`, `Registration Closed`, `Ongoing`, `Finished`). Tidak ada status baru.

| Status event | Untuk pemain | Untuk organizer |
|---|---|---|
| Draft | Tidak terlihat | Atur event: pilih "Solo", jumlah tim, biaya per pemain. |
| Published | Daftar. Dapat slot lalu bayar, atau masuk antrean. | Pantau kuota kiper dan lapangan. Setujui bukti bayar. |
| Registration Closed | Menunggu tim | **Acak tim**: acak, cek, acak ulang kalau perlu, kunci. Lalu acak grup/bracket seperti biasa. |
| Ongoing | Lihat tim, jadwal, hasil. Kapten kirim statistik. | Kontrol pertandingan seperti biasa. |
| Finished | Lihat hasil dan sertifikat | Penyelesaian seperti biasa. |

Acak tim hanya bisa dijalankan saat status `Registration Closed`. Acak grup/bracket (fitur yang sudah ada) baru boleh setelah tim dikunci.

**Tombol "Tutup pendaftaran".** Sekarang hanya form `/admin` lama yang bisa memindahkan event ke `Registration Closed` (`adminUpdateEventStatusAction`). Layar organizer V3 belum punya tombolnya, padahal `drawing_publish` mensyaratkan status itu (`src/lib/tournament/operations/commands.ts:200`). Fase 1 menambahkan tombol "Tutup pendaftaran" di panel acak tim (untuk event solo).

## 5. Kebutuhan fungsional

### 5.1 Akun pemain

1. Role baru `player`. Nilai disimpan di kolom `User.role` yang sudah ada (tanpa perubahan tipe kolom).
2. Daftar akun di `/[locale]/register` dengan pilihan "Saya pemain" selain "Saya kapten". Aturan sama dengan kapten: nama, email, kata sandi minimal 8 karakter, batas 5 percobaan per 15 menit per IP, email sekali pakai ditolak, email kembar ditolak.
3. Pemain juga bisa daftar akun sekaligus daftar event dari halaman event solo (satu langkah), seperti alur kapten yang sudah ada.
4. Profil pemain menyimpan nomor WhatsApp. Nomor ini baru terlihat oleh anggota satu tim dan organizer setelah tim dikunci.
5. **Satu email = satu role (diputuskan untuk fase 1).** Email yang sudah jadi kapten tidak bisa jadi pemain, dan sebaliknya. Kapten yang mau main solo memakai email lain. Pesan error saat daftar: "Email ini sudah dipakai sebagai kapten." (atau "... sebagai pemain.").
6. Halaman pemain: `/[locale]/player` (ringkasan: pendaftaran aktif, tim, pertandingan berikutnya), `/player/registrations`, `/player/team/[eventId]`, `/player/profile`, `/player/settings`.
7. Setelah masuk, pemain diarahkan ke `/player`, atau ke halaman event tempat dia mulai daftar.

### 5.2 Pengaturan event solo (organizer)

1. Di wizard buat/ubah event, pilihan **Cara daftar**: "Tim" (bawaan) atau "Solo".
2. Event solo hanya untuk game yang punya **posisi wajib** di konfigurasi (`soloDraw.requiredPositions`). Fase 1 hanya Flashpeak 5v5: posisi `Forward`, `Midfielder`, `Defender`, `Goalkeeper`, dengan posisi wajib `Goalkeeper` x 1 per tim.

   Rencana berikutnya: **Kuroko 3v3** (posisi `Guard`, `Forward`, `Center`). Di Kuroko, `Center` memegang peran yang sama dengan kiper di Flashpeak, yaitu posisi wajib x 1 per tim. Menambahkannya cukup satu entri konfigurasi: `requiredPositions: { Center: 1 }` untuk `mode-kuroko-3v3` (isi tim 3, jadi 1 `Center` + 2 pemain lain per tim). Tidak ada perubahan tabel. Teks di UI untuk posisi wajib dan pengganti darurat membaca nama posisi dari konfigurasi, bukan kata "kiper" yang ditulis mati.
3. Kolom khusus event solo: hanya biaya per pemain (memakai `registrationFeeAmount` yang ada). Jumlah tim memakai `participantCap` yang sudah ada.
4. **Kuota dihitung otomatis dari jumlah tim:**

| Kuota | Rumus | Contoh 8 tim |
|---|---|---|
| Slot kiper | jumlah tim x 1 | 8 |
| Slot lapangan | jumlah tim x (isi tim - 1) | 32 |

   Jumlah tim memakai pilihan yang sudah ada (8, 12, 16, 24, 32, 64, 128, 256). Pilihan itu terkunci di banyak tempat (`event-draft.ts`, `publish-readiness.ts`, `event-v3-actions.ts`), jadi tidak diubah.
5. Event solo menolak pendaftaran tim (kapten tidak bisa daftar). Menggabung tim utuh dan pemain solo di satu event bukan bagian fase 1.
6. Tim yang benar-benar jadi (`T`) bisa lebih sedikit dari jumlah tim kalau kuota tidak penuh. Panel "Siap diacak" memperingatkan kalau `T` tidak cocok dengan format kompetisi (mis. grup + playoff), memakai pengecekan alokasi grup yang sudah ada.

### 5.3 Daftar solo dan slot (pemain)

Halaman `/[locale]/events/[slug]/register` untuk event solo menampilkan form pemain:

| Kolom | Aturan |
|---|---|
| IGN | Wajib, minimal 2 karakter. |
| UID | Wajib, minimal 2 karakter, unik per event (tanpa membedakan huruf besar/kecil). |
| Posisi utama | Wajib, salah satu dari daftar posisi game. |
| Posisi cadangan | Opsional. Memilih Goalkeeper = jadi **kiper darurat**. |
| Mau jadi kapten | Pilihan, bawaan tidak. |
| WhatsApp | Wajib. Ada pernyataan "Boleh dilihat teman satu tim setelah tim dikunci". |

Halaman juga menampilkan **sisa slot**: "Kiper 5 / 8, Lapangan 32 / 32 (antrean 4)".

**Alur status pendaftaran** (status baru `queued` di depan alur pembayaran tim yang sudah ada):

```
Daftar ──► slot kelompoknya masih ada? ──ya──► pending_payment ──► pending_review ──► approved
                       │                            │ (lewat batas waktu)    │ (organizer tolak)
                       └──tidak──► queued           ▼                        ▼
                                     ▲          expired                   rejected ──(upload ulang)──► pending_review
                                     │                                        │ (lewat batas waktu)
                                     │                                        ▼
                                     └── slot terbuka (batal / hangus):    expired
                                         pendaftar tertua di antrean naik jadi pending_payment dan dapat email
```

Aturan:

- **Kelompok slot**: posisi utama yang sama dengan posisi wajib game (Flashpeak: Goalkeeper) masuk kelompok `required`, selain itu kelompok `open`. Pemain darurat (posisi cadangan = posisi wajib) tetap kelompok `open`.
- **Slot terpakai** = pendaftar berstatus `pending_payment`, `pending_review`, `approved`, atau `rejected` yang belum lewat `expiresAt`, dalam kelompok itu. Penuh = jumlah terpakai sama dengan kuota.
- **Ditolak tidak melepas slot.** Sama dengan pembayaran tim yang sudah ada: pemain boleh upload bukti baru sampai batas waktu. Slot baru lepas saat statusnya `expired`. Organizer yang mau melepas slot lebih cepat meminta pemain batal (`withdrawn`).
- **Event gratis**: dapat slot langsung `approved`. Tidak ada `pending_payment`.
- **Antrean** diurutkan menurut waktu daftar. Pemain di antrean tidak diminta bayar, dan melihat "Antrean ke-N" di `/player/registrations`.
- **Naik dari antrean**: pendaftar tertua di kelompok yang sama naik saat slot terbuka. Dia dapat email "slot kamu terbuka" dan batas bayar (`expiresAt`, 24 jam seperti pendaftaran tim sekarang).
- Pemain bisa batal sendiri selama pendaftaran buka (`withdrawn`). Kalau sudah bayar, organizer mengurus refund manual (QRIS tanpa gateway), tercatat di `refundedAt`.
- Naik dari antrean, hangus, dan batal terjadi di dalam transaksi serializable supaya slot tidak terjual dua kali.

### 5.4 Pembayaran dan persetujuan (organizer)

1. Halaman Registrasi (`view=queue` dan `view=payments`) menampilkan pendaftar solo di daftar yang sama dengan pendaftar tim, diberi penanda "Solo". Tidak ada layar baru untuk bukti bayar.
2. QRIS memakai `EventPaymentSettings` per event yang sudah ada.
3. Aturan setujui/tolak, alasan wajib (3-240 karakter), dan cek versi (CAS) sama dengan pembayaran tim.
4. Organizer melihat kuota kiper dan lapangan (terpakai / total / antrean) di atas daftar.

### 5.5 Acak tim (organizer)

Tampilan baru: `view=draw` di halaman Registrasi, hanya untuk event solo.

**Tombol "Tutup pendaftaran".** Sebelum menutup, sistem menghitung hasilnya. Kalau akan ada pemain `approved` yang tidak masuk tim, sistem menampilkan daftarnya dan meminta organizer mengonfirmasi bahwa mereka akan di-refund. Pemain `pending_payment` dan `pending_review` yang belum disetujui saat penutupan dibatalkan atau diselesaikan dulu oleh organizer.

**Panel "Siap diacak"** (selalu tampil):

| Isi | Contoh |
|---|---|
| Kiper diterima | 7 dari 8 |
| Kiper darurat tersedia | 3 |
| Pemain lapangan diterima | 30 dari 32 |
| Tim yang akan jadi | 7 |
| Pemain tidak masuk tim (refund) | 2 |
| Peringatan | "Lapangan kurang. 1 tim tidak bisa dibentuk." |

Tombol "Acak tim" nonaktif kalau tim yang jadi kurang dari 2.

**Aturan pengacakan** (mesin murni, tanpa database, mudah diuji):

> Angka dan kata di bagian ini memakai Flashpeak (isi tim 5, 1 kiper, 4 pemain lapangan). Rumus umumnya: pemain lapangan per tim = isi tim - jumlah posisi wajib. Untuk Kuroko 3v3 nanti: isi tim 3, 1 `Center`, 2 pemain lain. Mesin acak membaca angka ini dari konfigurasi game, bukan angka tertulis mati.

1. Cari `T` terbesar (paling banyak jumlah tim event) yang memenuhi: kiper diterima + kiper darurat terpakai >= `T`, dan pemain lapangan sisa >= `4 x T`. Kiper darurat yang terpakai mengurangi jumlah pemain lapangan.
2. Pilih `T` kiper: kiper utama dulu (acak), baru kiper darurat (acak).
3. Isi tiap tim dengan 4 pemain lapangan secara acak.
4. Pemain yang tidak masuk tim (kiper berlebih atau lapangan berlebih) ditandai "tidak masuk tim" dan masuk daftar refund.
5. Tidak boleh ada dua pemain ber-IGN sama (tanpa membedakan huruf) dalam satu tim. Kalau terjadi, geser salah satu ke tim lain.
6. Kapten: acak di antara 5 utama yang "mau jadi kapten". Kalau tidak ada yang mau, acak dari 5 utama.
7. Hasil dihitung dari `seed` + data masukan yang diurutkan tetap. Seed sama + data sama = hasil sama.

**Alur organizer:**

1. Tutup pendaftaran (lihat di atas).
2. Klik "Acak tim". Hasil berstatus draf, belum terlihat pemain.
3. Periksa tabel tim (kiper, kapten, daftar refund). Boleh "Acak ulang" (seed baru, versi naik). Versi lama tetap tersimpan.
4. Boleh tukar dua pemain antar tim sebelum dikunci. Aturan "1 kiper per tim" dicek lagi tiap tukar.
5. Klik "Kunci tim". Sistem menolak kalau daftar pemain diterima berubah sejak diacak ("Pendaftar berubah. Acak ulang dulu.").
6. Saat dikunci: dibuat `Team` dan `Player` biasa. Pemain langsung melihat timnya di `/player`.

Hanya satu hasil yang boleh terkunci per event. Setelah dikunci, pendaftaran solo tidak bisa berubah.

### 5.6 Setelah tim dikunci

1. Tiap tim dibuat sebagai `Team` bersumber `solo-draw`, nama `Tim N`, tag `TN`. Tiap pemain dibuat sebagai `Player` (UID di `displayName`, IGN di `nickname`, posisi hasil acak) yang terhubung ke akun pemain. Pembuatan lewat jalur yang sama dengan pendaftaran tim (`assertEventRosterMutable` di dalam transaksi serializable).
2. Kapten terpilih menjadi `Team.captainId`. Dia bisa membuka halaman kapten yang sudah ada untuk timnya saja (ganti roster, kirim statistik). Di halaman itu fitur "daftar tim ke event lain" disembunyikan dan ditolak server untuk role `player`.
3. Grup, bracket, jadwal, kontrol pertandingan, statistik, penyelesaian, dan sertifikat memakai alur yang ada tanpa perubahan. Satu penjaga baru: sebelum tim dikunci, perintah `drawing_save` untuk event solo ditolak, karena `persistDrawing` mensyaratkan daftar tim lengkap.
4. Pemain melihat di `/player/team/[eventId]`: nama tim, kapten, teman satu tim (UID, IGN, posisi, WhatsApp), jadwal tim.
5. Organizer bisa mengganti pemain yang mundur sebelum pertandingan pertama. Sumbernya: pemain di antrean (mereka belum bayar, jadi harus bayar dulu) atau pemain "tidak masuk tim" yang sudah bayar (prioritas). Setelah pertandingan dimulai, ganti roster memakai alur "ajukan ganti roster" yang sudah ada. Semua penggantian tercatat.
6. Pemain "tidak masuk tim" melihat statusnya di `/player/registrations`, dan organizer melihat daftar refund.
7. **Pemberitahuan fase 1 = tampilan, plus satu email.** Aplikasi belum punya pengiriman pesan selain email lupa kata sandi (Resend). Tabel `Notification` ada tapi belum dipakai kode mana pun. Jadi pemain tahu timnya dari kartu "Tim terbentuk" di `/player`. Satu-satunya email baru: "slot kamu terbuka" saat naik dari antrean, karena tanpa itu slot bisa hangus. Email lain dan WhatsApp masuk fase 2.

### 5.7 Halaman publik

- Halaman event solo menampilkan tombol "Daftar solo" dan sisa slot kiper dan lapangan.
- Sebelum tim dikunci, halaman peserta hanya menampilkan jumlah, tidak menampilkan nama pemain.
- Setelah dikunci, halaman peserta memakai tampilan yang ada (UID, IGN, posisi). Nomor WhatsApp tidak pernah tampil di publik.

### 5.8 Bahasa

Semua teks ada di `messages/id.json` dan `messages/en.json`. Tidak ada teks campuran. Tanggal, uang, pesan error, dan label aksesibilitas mengikuti locale.

## 6. Data, keamanan, dan konkurensi

- Rancangan tabel ada di `database-design.md`.
- Semua tulis memeriksa peran, kepemilikan event, dan versi data. Menyembunyikan menu bukan batas keamanan.
- Role `player` tidak bisa masuk `/admin` atau halaman organizer. Role `player` hanya bisa masuk `/captain` kalau dia kapten sebuah tim, dan hanya melihat timnya. Middleware `/captain` sekarang hanya menerima role `captain` (`src/middleware.ts:175`), dan 12 aksi di `src/lib/actions.ts` memakai `requireCaptainSession`. Aksi "daftar tim" tetap khusus `captain`. Aksi roster dan statistik menerima `player` hanya lewat cek kepemilikan tim (`Team.captainId`).
- Daftar, naik dari antrean, batal, hangus, dan kunci tim memakai transaksi serializable, seperti pendaftaran tim sekarang. Dua pemain yang berebut slot terakhir: satu dapat slot, satu masuk antrean.
- Nomor WhatsApp, URL bukti bayar, dan email tidak masuk log. Log hanya berisi ID dan nama kesalahan.
- Setiap tutup pendaftaran, acak, acak ulang, tukar, kunci, dan ganti pemain ditulis ke `CompetitionAuditLog` (pelaku, waktu, seed, versi).
- Migrasi database bersifat **tambahan saja**. Kode lama tetap jalan di database baru. Migrasi produksi diterapkan manual oleh pemilik (build produksi sekarang diblokir kalau migrasi belum diterapkan).

## 7. Feature flag dan rollback

Flag baru: `solo_tournament_v1`, bawaan `false`. Aktif hanya kalau env `FEATURE_FLAG_SOLO_TOURNAMENT_V1=true`.

Kalau flag dimatikan:

- Pilihan "Solo" hilang dari wizard dan halaman daftar solo tidak bisa dibuka.
- Event solo yang sudah dibuat tetap ada. Data tidak dihapus.
- Tim yang sudah dikunci tetap jalan sebagai tim biasa (karena sudah jadi `Team`).

## 8. Fase

| Fase | Isi | Selesai kalau |
|---|---|---|
| 1 (MVP) | Role pemain, daftar solo dengan kuota posisi dan antrean, bayar setelah dapat slot, email slot terbuka, tombol tutup pendaftaran, panel siap diacak, acak murni, kunci jadi tim, halaman tim pemain, flag | Satu event Flashpeak solo berjalan dari daftar sampai bracket, tanpa pemain yang bayar lalu tidak dapat tim di skenario normal |
| 2 | Pengacakan seimbang berdasarkan tingkat, posisi lapangan merata, pemberitahuan email/WhatsApp lengkap, pemain cadangan, impor pemain dari CSV, layar ganti pemain khusus | Selisih kekuatan antar tim turun (ukur di event nyata) |
| 2b | Kuroko 3v3 (posisi wajib `Center`). Hanya konfigurasi game, uji acak untuk isi tim 3, teks posisi dari konfigurasi | Satu event Kuroko solo berjalan |
| 3 | Profil pemain lintas event (riwayat, statistik), catatan tidak hadir, game lain, satu akun dengan dua role | Pemain punya riwayat tampil |

## 9. Bukan bagian rencana ini

- Mesin turnamen baru. Pertandingan tetap tim lawan tim.
- Event campuran (sebagian tim utuh, sebagian solo) di satu event.
- Pembayaran lewat gateway atau refund otomatis.
- Pemain cadangan di tim (fase 2). Slot = tepat 5 per tim.
- Pilih tim sendiri atau lelang pemain.
- Satu akun dengan dua role.
- Game selain Flashpeak di fase 1 (Kuroko menyusul, lihat 5.2).
- Deploy produksi, migrasi produksi, dan mengaktifkan flag produksi.

## 10. Kriteria selesai (fase 1)

1. Pemain daftar akun, daftar event solo, dapat slot atau masuk antrean, bayar, dan melihat status.
2. Pemain yang melewati kuota tidak diminta bayar. Pemain yang naik dari antrean dapat email dan batas bayar.
3. Dua pemain berebut slot terakhir: tepat satu dapat slot.
4. Organizer menyetujui pembayaran solo dari daftar yang sama dengan pendaftar tim.
5. Tombol "Tutup pendaftaran" menampilkan daftar pemain yang kena refund sebelum menutup.
6. Panel "Siap diacak" menghitung tim, kiper, kiper darurat, dan pemain tidak masuk tim dengan benar, termasuk saat kiper atau lapangan kurang.
7. Setiap hasil acak: tepat 1 kiper di 5 pemain tiap tim, tidak ada pemain di dua tim, tidak ada IGN kembar dalam tim. Diuji dengan banyak variasi jumlah kiper, kiper darurat, dan pemain lapangan.
8. Seed sama dan data sama menghasilkan hasil sama.
9. Kunci menolak kalau data pendaftar berubah. Dua kunci bersamaan: satu menang.
10. Setelah kunci, grup, bracket, jadwal, dan statistik berjalan tanpa perubahan kode di mesin turnamen.
11. Kapten solo bisa memakai halaman kapten untuk timnya saja. Pemain biasa tidak bisa membuka halaman kapten tim lain.
12. Nomor WhatsApp tidak muncul di halaman publik, log, atau ekspor publik.
13. Teks ID dan EN lengkap. Uji lebar layar 360, 390, 768, 1024, 1440.
14. Flag mati = fitur hilang tanpa merusak event lain.
15. Tes unit, tes otorisasi, tes migrasi (CI), dan E2E lulus.

