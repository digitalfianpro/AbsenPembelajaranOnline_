# Absensi PJJ PKn — SMP Negeri 6 Manokwari (Cloudflare + QR)

Tanpa Firebase. Frontend **Cloudflare Pages**, API **Pages Functions**, penyimpanan **Cloudflare D1**, waktu **WIT (Asia/Jayapura)**.

- **Portal Murid**: buka link / pindai QR per kelas dari guru, tanpa mengetik password; pilih nama dan Hadir/Izin/Sakit, maksimal 1 kali per hari WIT.
- **Portal Guru**: login nama guru/password di server, impor/tambah siswa, kelola tautan QR kelas (30 hari, dapat diganti/dinonaktifkan), rekap dan ekspor CSV.
- QR dibuat **langsung di browser**, tanpa layanan QR eksternal. Akses link berlaku hanya untuk kelas masing-masing. Ini **bukan** verifikasi identitas: siapa pun yang punya link dapat memilih nama siswa di kelas itu.

**Sudah memiliki D1 dan Pages aktif?** Buka [PANDUAN_UPDATE_QR.md](PANDUAN_UPDATE_QR.md). Anda hanya perlu menjalankan `MIGRASI_D1_QR.sql` dan mengunggah update ke repositori GitHub; jangan buat database baru.

**Mulai dari nol?** Lihat [PANDUAN_CLOUDFLARE.md](PANDUAN_CLOUDFLARE.md), jalankan `schema.sql` penuh pada database baru.

**Mengganti login email menjadi nama guru pada Pages yang sudah online?** Ikuti [PANDUAN_UPDATE_LOGIN_GURU.md](PANDUAN_UPDATE_LOGIN_GURU.md). Tidak perlu mengubah SQL D1 lagi.
