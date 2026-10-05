# Perbaikan pembacaan relasi homepage

Desain ini disetujui pengguna setelah penjelasan ORM JOIN, bukan rawSQL atau
cursor pagination, termasuk dampak strategi default pada pembacaan lain.
Scope hanya koreksi kode dan verifikasi sebelumrelease, bukan deploy.

## Bukti dan hipotesis perbaikan

Probe homepage37124374591 di d104596 mencatat koneksi1367ms dan query
discovery2034ms, mapping1ms. Batas pembaca2s tercapai sebelum data siap,
lalu homepage merender error tanpa eventunggulan. Query dasar database
0.044ms/6event bukan ukuran keseluruhan relasi atau network. Biaya tiap
perjalanan relasi belum diukur terpisah; JOIN adalah koreksi yang akan
divalidasi, bukan jaminan kecepatan sebelum runtime diukur.

## Desain

Aktifkan relationJoins pada generator Prisma6.19.3 lalu tetapkan
relationLoadStrategy join pada getPublicDiscoveryEvents.findMany. PostgreSQL
mengambil relasi lewat querygabungan ORM. Filter status publik, relasi
stream/visualasset, fasepertama, live match, hitungtim, ordering dan mapping
tetap sama. Tidak ada model/datasource/migration/dependencyversion berubah.
Regenerasi PrismaClient saja; tidak mengubah data atau skema database.

Prisma default untuk pembacaan relasi lain juga berubah menjadi join setelah
previewflag aktif. Dampak lebih luas ini sudah disetujui; reviewer wajib
mempertimbangkan correctness/querybehavior terkait. Tes berbasis mock
tidak membuktikan performa maupun seluruh aplikasi runtime.

Alternatif rawSQL ditolak karena batas keamanan; membuang relasi dibutuhkan
ditolak karena merusak hasil; pemecahan query manual lebihinvasif dan belum
terbukti lebihcepat. Tidak menaikkan deadline atau menerima errorfallback.

## Error handling dan verifikasi

Pertahankan batas discovery2s, request/body10s, p95<3000ms,0failures,
pengamanan database, locale parity dan penolakan fallback. TDD memverifikasi
strategy di boundary reader beserta mapping/errorpropagation. Jalankan
generate, affectedreader tests, type/lint/validate/diffcheck, lalu review
task-scoped dan satu home-only Linuxverification pada fixture yang sama.
Tidak ada seed/reset/migrate, suite54/twoshards atau akses tulisproduction.
RCA melaporkan hasil aktual, bukan sekadar hipotesis atau testargumen.

Rollback kode: hapus optionjoin dan previewflag lalu generate ulang. Bukan
downmigration. Release publik lengkap dan recovery/migration tetap gate
terpisah; keberhasilan homepage saja tidak berarti READYproduction.
