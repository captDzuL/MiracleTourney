# Bracket V3: identitas tim, background custom, PNG, dan juara

Tanggal: 4 Oktober 2026
Status: implementasi lokal mengikuti mood V3 selesai dan direview pada branch codex/bracket-social-v3. Migrasi database dan deployment belum dijalankan; alur login organizer pada database test masih perlu diverifikasi saat rollout.

## Tujuan dan kebutuhan yang sudah disepakati

Rombak bracket V3 yang sekarang berupa kolom gelap dengan dua nama tim dan teks status. Kembalikan slot tim yang jelas, logo atau placeholder, skor sejajar, hubungan antar-match, dan identitas kompetisi. Organizer dapat mengunggah background. Pengguna telah memilih background custom sekaligus unduh gambar PNG bracket. Pemenang turnamen harus langsung dikenali.

## Pilihan pendekatan

1. **Direkomendasikan: kanvas bracket dengan background khusus.** Kartu tim yang kontras dan identitas event berada di atas background yang diatur organizer. Halaman dan PNG memakai komponen presentasi serta sumber data yang sama. Background bracket terpisah dari poster event sehingga keduanya bisa punya komposisi yang sesuai.
2. **Gunakan poster event sebagai background.** Lebih sedikit konfigurasi, tetapi tulisan dan artwork poster bisa bertabrakan dengan bracket. Tidak dipilih sebagai default.
3. **Poster ekspor terpisah dari halaman.** Komposisi sosmed lebih bebas, tetapi dua tampilan harus dipelihara dan bisa berbeda. Tidak dipilih untuk versi awal.

## Rancangan tampilan

### Arahan pengguna setelah melihat mockup HTML

Pada 4 Oktober 2026 pengguna menyukai konsep dan meminta implementasi nanti menyesuaikan mood V3. Pertahankan struktur dua slot tim, logo/placeholder, skor sejajar, pohon pertandingan, custom background, PNG, dan panel juara. Palet mint dan lilac pada mockup adalah eksplorasi; bukan palet final aplikasi.

- Gunakan Montserrat, logo resmi Miracle, border tipis, radius, dan ritme jarak dari sistem desain V3.
- Navigasi dan editor mengikuti permukaan navy V3; aksen cyan untuk jalur/pemenang, violet untuk aksi, serta cream untuk juara. Artwork dan logo tim boleh memiliki warna identitas masing-masing.
- Pakai token yang ada di src/styles/miracle-v3-tokens.css. Jangan menambah palet brand mint/gold terpisah. Panel juara memakai cream V3, dengan ikon trofi dan label juara.
- Keterbacaan tetap menjadi prioritas: bedakan kanvas, kartu, slot tim, dan skor melalui tingkat permukaan, border, serta kontras. Jangan mengembalikan dua nama sebagai teks biasa dalam kolom gelap yang seragam.
- Background custom dibatasi lapisan pengatur keterbacaan; slot tim memiliki permukaan solid. Tampilan terang dapat dipakai sesuai konteks tema/background, dengan aksen dan tipografi V3 yang sama.

### Kanvas

- Kanvas mengikuti mood V3, dengan tingkat permukaan yang jelas, aksen cyan/violet/cream, serta garis penghubung yang terbaca. Shell navigasi mengikuti tema aplikasi; kanvas mempertahankan keterbacaan ketika menggunakan artwork organizer.
- Header kanvas memuat logo/placeholder event, nama event, format kompetisi, dan status turnamen. Tombol serta kontrol berada di luar bagian yang diekspor.
- Setiap babak memiliki judul yang mudah dimengerti: Babak 16 Besar, Perempat Final, Semifinal, Final. Nama babak tambahan mengikuti format kompetisi; jangan menyebut semua ronde sebagai final berdasarkan jumlah kolom saja.
- Desktop menampilkan pohon dengan kartu sejajar dan garis berdasarkan hubungan pertandingan sebenarnya. Mobile menyediakan pemilih babak dan area geser yang terbatas di kanvas, dengan nama babak terlihat jelas.

### Kartu match dan slot tim

- Satu kartu memuat dua slot terpisah. Masing-masing: logo atau placeholder inisial, nama tim, lalu skor di sisi kanan. Metadata match, status, dan BO ditampilkan ringkas.
- Target tinggi kartu dasar sekitar 100–120 px. Detail jadwal serta skor per game dibuka melalui kontrol detail, bukan memperbesar semua kartu.
- Logo tim diambil dengan ID tim. Nama bukan kunci pencocokan identitas. Logo yang tidak tersedia atau gagal dimuat berubah menjadi placeholder inisial yang tetap punya ukuran sama.
- Slot belum terisi menampilkan placeholder dan asal peserta, misalnya Pemenang Match 1. Slot tanpa sumber yang diketahui memakai Menunggu tim. Bye menampilkan Lolos otomatis dan tidak dianggap kemenangan turnamen.
- Pemenang match mendapat penanda teks/icon dan aksen warna; lawan tetap terbaca. Tidak mengandalkan warna saja.
- Match live mendapat badge LIVE dan aksen yang jelas. Efek gerak bersifat halus dan menghormati preferensi pengurangan animasi.
- Garis menghubungkan sourceMatchIds/relasi graph yang sebenarnya. Jangan menghubungkan pertandingan berdasarkan kedekatan posisi atau nama.

### Juara turnamen

- Setelah hasil resmi menetapkan pemenang, tampilkan panel menonjol: ikon trofi, JUARA TURNAMEN, logo/placeholder, nama tim, serta ringkasan hasil final yang tersedia.
- Panel juara berada dekat final pada pohon dan memiliki ringkasan yang terlihat di bagian atas kanvas. Penanda juga tampil pada slot tim pemenang final.
- Bedakan pemenang satu pertandingan dan juara turnamen. Tim yang memenangi semifinal bukan juara.
- Untuk eliminasi tunggal, gunakan ID pemenang final resmi yang sudah selesai. Untuk format dengan grand final/reset, gunakan keputusan juara dari proyeksi kompetisi setelah kondisi akhir terpenuhi. Untuk liga, gunakan keputusan peringkat resmi saat turnamen selesai, bukan pemimpin klasemen sementara.
- Jika hasil final belum selesai, seri, atau tidak memiliki pemenang resmi, jangan tampilkan nama juara. Hasil BO menggunakan kemenangan seri; skor satu game tidak menentukan juara.
- Tidak ada input nama juara bebas di editor background. Perubahan hasil resmi harus memperbarui halaman dan PNG.

## Background organizer

- Tambahkan panel Tampilan bracket di workspace organizer, dengan unggah background, pratinjau, atur posisi gambar, kecerahan lapisan latar, simpan, dan kembali ke background bawaan.
- Pratinjau memperlihatkan kartu tim dan panel juara contoh; contoh juara diberi label Contoh pratinjau agar tidak dianggap hasil resmi.
- Mendukung PNG, JPEG, WebP, maksimum 5 MiB, mengikuti batas upload background yang sudah ada. Sarankan gambar landscape minimal 1920 × 1080; ukuran kecil diberi informasi kualitas, bukan ditolak tanpa alasan.
- Gunakan kembali validasi jenis file, signature, decoder, dan penyimpanan gambar yang tersedia. Otorisasi harus memeriksa organizer pemilik event sebelum menyimpan aset atau pengaturan.
- Simpan URL background khusus bracket, posisi X/Y (0–100), dan kekuatan overlay (0–80 persen) sebagai pengaturan event. Kartu tetap memiliki permukaan solid yang kontras sesuai tema supaya artwork yang ramai tidak membuat nama dan skor sulit dibaca.
- Mengubah tampilan tersedia juga saat pertandingan berlangsung atau selesai. Pengaturan tampilan tidak mengubah hasil, seeding, atau jadwal. Aset tersimpan melalui proses upload yang ada; perubahan visual menginvalidasi cache halaman/ekspor terkait.
- Upload gagal mempertahankan pengaturan tersimpan dan menampilkan pesan dekat kontrol. Gambar gagal dimuat menggunakan background bawaan.

## Unduh PNG

- Tombol Unduh PNG tersedia pada bracket publik dan pratinjau organizer. Export publik hanya mengambil pertandingan dan pengaturan yang memang sudah dipublikasikan; preview organizer ditandai PRATINJAU jika memuat draft.
- PNG memuat header event, background, logo/placeholder tim, skor, garis penghubung, legenda singkat, dan panel juara jika resmi tersedia. Tombol, navigasi aplikasi, scrollbar, serta panel editor tidak masuk gambar.
- Ukuran output mengikuti isi bracket agar nama dan skor tetap terbaca. Tidak memaksakan seluruh bracket besar menjadi gambar persegi kecil. Sediakan ekspor babak yang dipilih agar bagian kompetisi bisa dibagikan dengan lebih jelas.
- Render seluruh bagian yang dipilih, termasuk bagian yang sedang di luar viewport/area geser. Tunggu font dan gambar selesai dimuat. Logo/background yang gagal dimuat memakai fallback yang sama dengan halaman.
- Gunakan renderer gambar server yang sudah menjadi pola ekspor sertifikat (Chromium + screenshot), dengan template bracket tersendiri dan data publik yang dibatasi. Jangan membuat renderer menerima URL halaman bebas atau markup dari pengguna.
- Batasi ekspor maksimal 16.000 px per sisi dan 64 juta piksel. Jika seluruh bracket melebihi batas, tampilkan pilihan ekspor per babak dengan pesan yang jelas; jangan diam-diam memotong hasil.
- Tampilkan status menyiapkan gambar, hasil unduhan, dan pesan coba lagi bila gagal. Nama file memuat slug event dan babak bila ekspor sebagian.

## Temuan codebase dan batas implementasi

- Folder aktif E:/dev/MiracleTourney-gitnative berada di integration/miracle-v3-local dan memiliki banyak perubahan kerja yang sudah ada. Rancangan ini tidak mengubah file tersebut.
- Komponen AdaptiveBracketBoard yang sesuai screenshot ada di checkout organizer-release-readiness dan salinan baseline outputs. Folder aktif belum memiliki komponen itu. Implementasi harus dimulai dari basis V3 yang diverifikasi dan checkout terisolasi; jangan menyalin seluruh baseline outputs ke folder aktif.
- Komponen V3 saat ini hanya menerima nama home/away dan skor. Perlu membawa ID tim, data logo, asal slot, winner ID, dan relasi pertandingan ke model presentasi bersama.
- Upload event visual sudah tersedia di src/lib/actions.ts, termasuk pemeriksaan hak publikasi dan proses aset. Gunakan pola ini untuk aset bracket yang terpisah.
- TeamAvatar/TeamIdentity sudah menyediakan pola identitas dan placeholder; sesuaikan pemakaiannya dengan tema kanvas bracket.
- Hasil juara sudah punya sumber resmi (winnerTeamId, proyeksi kompetisi, podium/hasil final). Jangan menyimpan hasil juara duplikat dalam pengaturan visual.
- Komponen presentasi dipakai pada bracket publik, pratinjau organizer, dan template PNG. Pembaca data serta kontrol editor tetap terpisah dari komponen gambar.
- Tambahkan pengaturan event dengan migrasi aditif dan default aman. Menjalankan migrasi pada produksi bukan bagian tahap implementasi lokal ini.
- Pertahankan perilaku visibilitas drawing, bye, BO, grup/playoff, liga, grand final, dan locale ID/EN. Rombakan visual tidak boleh membuka draft ke publik.

## Verifikasi penerimaan

1. Bracket 8 dan 16 tim menampilkan dua slot jelas, logo, fallback inisial, sumber slot, skor, serta hubungan match yang benar.
2. Uji logo hilang/rusak, nama panjang, bye, slot menunggu, live, seri, final belum selesai, dan final BO selesai.
3. Juara hanya muncul dari hasil resmi yang sah; uji pemenang semifinal dan upper final tidak menjadi juara prematur.
4. Organizer pemilik bisa unggah, menyimpan posisi/overlay, mengganti, dan kembali ke default. Organizer lain ditolak; file palsu, terlalu besar, dan gagal decode ditolak.
5. PNG menyertakan bagian di luar viewport, background, logo, hasil, serta juara; tidak menyertakan kontrol aplikasi. Uji fallback aset dan batas gambar besar.
6. Export publik tidak bisa mengakses draft. Preview organizer memiliki label yang tepat.
7. Periksa tampilan pada lebar 390, 768, dan 1440 px, keyboard, kontras, dan pengurangan animasi. Area pohon boleh bergeser secara lokal; halaman tidak melebar.
8. Jalankan tes terfokus, pemeriksaan tipe, lint file berubah, dan browser untuk alur upload → simpan → halaman publik → PNG. Database/fixture yang dipakai harus lingkungan pengujian terisolasi.

## Di luar cakupan versi ini

Editor bebas seperti Canva, upload aset ke akun sosmed, animasi konfeti besar, input juara manual, dan perubahan mesin kompetisi.

## Keputusan yang diminta

Konsep kartu dua slot tim, background khusus bracket beserta pratinjau, PNG seluruh bracket/per babak, dan panel juara otomatis dari hasil resmi telah disukai pengguna. Arahan berikutnya: selaraskan tampilan dengan mood V3 sebagaimana dijelaskan di atas. Saat masuk implementasi, buat rencana berdasarkan basis V3 yang diverifikasi, lalu implementasikan dan verifikasi alur lengkap.
