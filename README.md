# Miracle League

Platform turnamen komunitas multi-game — bracket, statistik pemain, dan manajemen tim dalam satu tempat.

🌐 **[miracle-tourney.vercel.app](https://miracle-tourney.vercel.app)**

---

## Untuk Peserta & Kapten Tim

### Daftar dan Kelola Tim
- **Daftar mandiri** di halaman `/register` — buat akun dan daftarkan timmu ke event yang sedang terbuka, tanpa perlu menghubungi panitia
- Atau terima undangan dari panitia (mereka akan kirimkan login dan password sementara)
- **Dashboard kapten** menampilkan kartu tim, daftar pemain beserta nomor jersey, dan status event

### Kelola Roster
- Tambah, edit, dan hapus pemain dari dashboard kaptenmu
- Data pemain langsung tercermin di halaman peserta publik

### Submit Statistik Match
- Setelah pertandingan selesai, kapten bisa mengisi statistik pemain (poin, assist, rebound, dll.) dari halaman `/captain/stats`
- Statistik yang disetujui panitia otomatis masuk ke leaderboard event

### Lihat Hasil & Klasemen
- **Bracket** — hasil pertandingan single-elimination secara real-time, termasuk breakdown skor per game (BO3/BO5)
- **Standings** — klasemen league/round-robin
- **Leaderboard** — ranking pemain terbaik berdasarkan statistik
- **Participants** — daftar seluruh tim yang terdaftar

---

## Untuk Penyelenggara (Admin)

### Kelola Event
- Buat event baru dengan format **Single Elimination** atau **League (round-robin)**
- Pilih game dan mode (Kuroko no Basket Street Rival 3v3, Flashpeak 5v5, dll.)
- Atur kapasitas peserta (8, 12, 16, atau 24 tim)
- Ubah status event: Draft → Published → Ongoing → Finished
- Hubungkan link livestream (YouTube atau eksternal) ke halaman event

### Registrasi Tim
- **Import CSV** — daftarkan banyak tim sekaligus; akun kapten dibuat otomatis
- Download credentials kapten (email + password sementara) sebagai CSV untuk didistribusikan
- Kapten juga bisa daftar mandiri via halaman `/register`

### Atur Format Pertandingan
- Konfigurasi **Best of N** per ronde (BO1, BO3, atau BO5) — misalnya babak awal BO1, semifinal dan final BO3
- Status event otomatis berubah ke "Ongoing" saat hasil match pertama disimpan

### Input Hasil Match
- **BO1** — masukkan skor langsung
- **BO3/BO5** — input skor per game; sistem otomatis menghitung pemenang series
- Hasil tersimpan langsung memperbarui bracket dan standings

### Review Statistik
- Lihat statistik yang disubmit kapten, preview per pemain
- **Setujui** untuk memasukkan ke leaderboard, atau **tolak** dengan catatan agar kapten bisa memperbaiki

---

## Halaman yang Tersedia

| Halaman | Keterangan |
|---------|------------|
| `/` | Beranda — daftar event aktif dan filter per game |
| `/events` | Semua event (publik) |
| `/events/[slug]` | Detail event: info, jadwal, livestream |
| `/events/[slug]/bracket` | Bracket pertandingan (real-time) |
| `/events/[slug]/standings` | Klasemen league |
| `/events/[slug]/leaderboards` | Leaderboard pemain |
| `/events/[slug]/participants` | Daftar tim peserta |
| `/register` | Daftar tim baru (kapten) |
| `/login` | Masuk ke akun kapten atau admin |
| `/captain` | Dashboard kapten — tim dan pemain |
| `/captain/stats` | Submit statistik match |
| `/captain/settings` | Ganti password |
| `/admin` | Panel admin — manajemen event, tim, dan hasil |

---

## Cara Mulai

**Peserta**: Buka **[miracle-tourney.vercel.app/register](https://miracle-tourney.vercel.app/register)** untuk mendaftarkan timmu ke event yang sedang terbuka.

**Penyelenggara**: Login di **[miracle-tourney.vercel.app/login](https://miracle-tourney.vercel.app/login)** dengan akun admin yang diberikan untuk mulai mengelola event.
