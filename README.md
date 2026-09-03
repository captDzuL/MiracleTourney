# Miracle League

Miracle League adalah platform turnamen komunitas multi-game untuk menjalankan event dari pendaftaran sampai hasil akhir: event marketplace, registrasi tim, bracket, standings, leaderboard, review statistik, branding event, dan bukti champion dalam satu tempat.

Website publik: [miracle-tourney.vercel.app](https://miracle-tourney.vercel.app)

---

## Untuk Siapa?

### Peserta
- Melihat daftar event yang sedang dibuka, berlangsung, atau sudah selesai.
- Membuka detail event untuk melihat jadwal, organizer, slot peserta, biaya registrasi, hadiah, venue, livestream, bracket, standings, leaderboard, dan peserta.
- Membagikan halaman event atau hasil champion ke komunitas.

### Captain
- Mendaftarkan tim ke event yang terbuka.
- Mengelola roster tim dan data pemain.
- Mengganti password dari akun captain.
- Submit statistik pemain setelah match selesai.
- Melihat status statistik yang perlu direview oleh organizer.

### Organizer
- Membuat dan mengelola event miliknya sendiri.
- Mengatur informasi publik event seperti deskripsi, jadwal, venue, hadiah, biaya registrasi, dan link pendaftaran.
- Upload logo event, background event, dan logo tim peserta.
- Import peserta lewat CSV dan mengunduh kredensial captain.
- Mengatur match day: status event, livestream, BO config, hasil match, standings, leaderboard, dan sertifikat champion.

### Platform Admin
- Mengelola semua event dan semua organizer.
- Membuat draft event untuk organizer tertentu.
- Melihat dan memperbaiki event lintas organizer jika dibutuhkan.
- Tetap memiliki akses penuh untuk operasional, testing, dan support produksi.

---

## Alur Penggunaan

### 1. Cari Event
Mulai dari halaman utama atau `/events`. Event bisa difilter berdasarkan status dan game. Card event menampilkan status, organizer, game, mode, format, slot peserta, tanggal, hadiah, biaya registrasi, venue, dan CTA sesuai fase event.

### 2. Buka Detail Event
Halaman detail event menjadi hub utama untuk peserta. Di sana tersedia ringkasan event, organizer, jadwal, slot, hadiah, biaya, link pendaftaran, livestream, peserta, bracket, standings, dan leaderboard.

### 3. Daftar atau Masuk
Captain bisa daftar mandiri lewat `/register` jika event membuka pendaftaran. Captain juga bisa menerima akun dari organizer jika tim di-import lewat CSV.

### 4. Kelola Tim
Captain masuk ke `/captain` untuk mengelola roster. Data tim dan pemain akan muncul di halaman publik event.

### 5. Jalankan Match Day
Organizer masuk ke `/admin`, memilih event aktif, lalu mengatur status event, livestream, konfigurasi BO, dan hasil pertandingan. Saat hasil match masuk, bracket dan standings ikut diperbarui.

### 6. Review Statistik
Captain submit statistik dari `/captain/stats`. Organizer mereview submission tersebut, lalu menyetujui atau menolak dengan catatan. Statistik yang disetujui masuk ke leaderboard.

### 7. Publikasikan Hasil
Event selesai dapat menampilkan champion, leaderboard final, bracket lengkap, dan bukti sertifikat champion.

---

## Fitur Utama

- **Tournament marketplace**: daftar event publik dengan filter game dan status.
- **Multi-organizer ownership**: organizer hanya mengelola event miliknya, sedangkan platform admin bisa mengelola semua event.
- **Event branding**: logo event, background game/event, verified organizer badge, dan card event yang lebih hidup.
- **Team identity**: logo tim tampil di peserta, bracket, standings, dan leaderboard jika tersedia.
- **Flexible tournament ops**: Single Elimination, League, BO1/BO3/BO5, CSV import, livestream, status event, dan hasil match.
- **Public event hub**: detail event, participants, bracket, standings, leaderboard, dan share action.
- **Stat review workflow**: captain submit statistik, organizer approve/reject, leaderboard terbit dari data yang sudah direview.
- **Champion proof**: event selesai bisa menampilkan champion dan sertifikat.
- **Demo data**: tersedia demo organizer Flashpeak dan Mobile Legends dengan event ongoing dan finished untuk testing alur end-to-end.

---

## Halaman Penting

| Halaman | Fungsi |
| --- | --- |
| `/` | Beranda dengan featured event dan ringkasan event publik |
| `/events` | Marketplace turnamen dengan filter game dan status |
| `/events/[slug]` | Detail event dan hub informasi |
| `/events/[slug]/participants` | Daftar tim peserta |
| `/events/[slug]/bracket` | Bracket dan hasil pertandingan |
| `/events/[slug]/standings` | Klasemen untuk format league |
| `/events/[slug]/leaderboards` | Leaderboard pemain |
| `/register` | Pendaftaran captain dan tim |
| `/login` | Login captain, organizer, dan platform admin |
| `/captain` | Dashboard captain untuk roster tim |
| `/captain/stats` | Submit statistik match |
| `/captain/settings` | Ganti password captain |
| `/admin` | Dashboard organizer dan platform admin |
| `/organizer` | Halaman positioning untuk calon organizer |

---

## Status Saat Ini

Miracle League sudah mendukung alur MVP multi-organizer:

- Platform admin, organizer, dan captain memiliki akses yang berbeda.
- Organizer tidak bisa mengubah event organizer lain.
- Event publik bisa punya logo, background, hadiah, biaya registrasi, link pendaftaran, venue, bracket, standings, leaderboard, dan champion proof.
- Captain dapat mengelola roster dan submit statistik.
- Organizer dapat mengelola event dari setup sampai publish hasil.

Fitur seperti co-organizer granular, staff permission detail, payment automation, dan payout automation belum menjadi bagian dari versi ini.
