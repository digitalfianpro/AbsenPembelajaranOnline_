# PANDUAN CLOUDFLARE — ABSENSI PJJ SMPN 6 MANOKWARI

Untuk proyek yang **SUDAH** dibuat di Cloudflare, ikuti **[PANDUAN_UPDATE_QR.md](PANDUAN_UPDATE_QR.md)** terlebih dahulu agar tidak perlu membuat ulang database atau Pages.

Untuk pemasangan **BARU**:

1. Buat D1 SQLite Database di Cloudflare, jalankan seluruh `schema.sql` pada **Console** (bila console menolak perintah gabungan, jalankan setiap perintah SQL secara terpisah). Schema mencakup tabel kelas, siswa, absensi, login_attempts, dan class_access.
2. Unggah isi ZIP ini ke GitHub. Folder `public` dan `functions` harus di akar repo.
3. Cloudflare → Workers & Pages → Create → **Continue to Pages** → Hubungkan repositori GitHub, branch `main`. Framework None, build command `exit 0`, build output directory `public`.
4. Pages → Settings → Bindings → Tambahkan D1 database dengan **variable name `DB`**; pilih database yang Anda buat.
5. Pages → Settings → Variables and secrets → Tambahkan **Secret** `TEACHER_USERNAME`, `TEACHER_PASSWORD`, `SESSION_SECRET` (panjang minimal 32 karakter). Tidak ada Secret password untuk siswa.
6. Deploy ulang. `https://NAMA-PAGES.pages.dev/api/health` harus menunjukkan `ok: true` dan `Asia/Jayapura`.
7. Buka Portal Guru; unggah data siswa, buat link/QR tiap kelas, bagikan dengan hati-hati, kemudian uji presensi dan rekap.

**Keamanan:** QR per kelas dapat ditukar atau dicabut dan berlaku 30 hari, tetapi bukan pengenal identitas siswa. Jangan memasukkan password atau data murid ke GitHub publik.
