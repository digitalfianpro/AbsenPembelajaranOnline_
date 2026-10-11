# LANGKAH MEMPERBARUI APLIKASI YANG SUDAH ONLINE — Tautan / QR tanpa password murid

Untuk Cloudflare Pages `absenpembelajaranonline.pages.dev` dan D1 `absensi-smp6pjj` yang sudah Anda siapkan.

## 1. Tambahkan tabel QR pada D1 yang lama (JANGAN hapus database)

Buka **Cloudflare → Storage & databases → D1 SQLite Database → absensi-smp6pjj → Console**.

Salin perintah berikut ke **kotak paling bawah**, lalu klik **Execute**:

```sql
CREATE TABLE IF NOT EXISTS class_access (
  class_id TEXT PRIMARY KEY REFERENCES classes(id),
  nonce TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
```

Pesan yang diharapkan: `This query successfully executed.`. Perintah hanya membuat tabel tambahan; siswa, kelas, dan rekap yang sudah tersimpan tidak terhapus. Perintah ini sama dengan isi file `MIGRASI_D1_QR.sql`. Jangan menjalankan ulang dan mengosongkan tabel lain.

## 2. Unggah file pembaruan ke GitHub

1. Ekstrak **ZIP versi QR** yang saya sediakan.
2. Buka repository GitHub Anda: `digitalfianpro/AbsenPembelajaranOnline_` (atau repository yang sekarang terhubung dengan Pages).
3. Unggah **isi folder hasil ekstrak** ke **akar repository**, bukan ZIP-nya. Jika ada pertanyaan konfirmasi menimpa file lama, pilih file baru/replace.
4. Pastikan file/folder ini ada dalam struktur repository (bukan di dalam folder tambahan):

```text
public/
  index.html        <- sekarang tidak meminta password siswa
  app.js            <- BARU, dibutuhkan oleh index.html
  qr.js             <- BARU, menggambar QR secara lokal
  _headers
  _routes.json
functions/
  api/
    [[path]].js     <- versi baru, memakai link kelas
MIGRASI_D1_QR.sql
schema.sql
README.md
PANDUAN_UPDATE_QR.md
```

5. Klik **Commit changes**. Cloudflare Pages yang terhubung ke GitHub biasanya akan melakukan deploy otomatis. Perhatikan halaman **Workers & Pages → proyek Pages Anda → Deployments** sampai terlihat **Success** dengan commit baru.
6. Bila belum deploy otomatis, cek koneksi GitHub di pengaturan build Pages, kemudian deploy ulang *versi commit terbaru*. Mengulang deployment lama tidak akan memasukkan perubahan baru.

**Jangan** upload ZIP secara utuh; jangan upload hanya file `index.html`. Folder `functions` harus tetap di akar repository.

## 3. Secret Cloudflare yang digunakan

**Pembaruan terbaru:** login guru memakai `TEACHER_USERNAME` (nama, bukan email), lihat `PANDUAN_UPDATE_LOGIN_GURU.md`. **Tidak perlu membuat `STUDENT_ACCESS_CODE` lagi.** Secret lama tersebut boleh dibiarkan dulu dan boleh dihapus setelah versi baru selesai diuji karena kode baru tidak membacanya.

Login Portal Guru masih membutuhkan **`TEACHER_USERNAME`, `TEACHER_PASSWORD`, `SESSION_SECRET`**, dan binding D1 bernama **`DB`**. Tidak ada password siswa. Rahasia ini disimpan di Cloudflare → Pages → Settings → Variables and secrets, jangan ditulis di GitHub/WA.

Jika Portal Guru belum bisa login, periksa nama guru/password yang disimpan sebagai Secret, panjang `SESSION_SECRET` minimal 32 karakter, dan lakukan deployment ulang setelah memperbaruinya. Jangan coba berkali-kali jika login ditolak karena ada pembatasan percobaan.

## 4. Buat QR untuk kelas

1. Buka **alamat utama** `https://absenpembelajaranonline.pages.dev`, bukan alamat preview yang diawali kode acak seperti `https://4d00466c....pages.dev`.
2. Masuk ke **Portal Guru** dengan nama guru dan password Cloudflare.
3. Unggah/tambahkan siswa kelas via tombol **Template & Sinkron Excel** jika daftar masih kosong.
4. Tekan **Bagikan Link / QR Kelas**.
5. Pilih kelas, contoh `VII-A`, kemudian klik **Buat Tautan & QR Kelas**.
6. Pilih **Salin Tautan** untuk dibagikan melalui grup kelas, atau **Unduh QR (PNG)** untuk dibagikan kepada siswa kelas itu.
7. Setiap kelas memiliki tautan yang berbeda. Siswa hanya melihat nama kelas dari tautannya.
8. Tautan berlaku **30 hari**, setelahnya guru perlu membuat link baru. Tombol **Perbarui QR** menonaktifkan tautan lama. Tombol **Nonaktifkan Tautan Kelas** mencabut akses kapan pun.

## 5. Uji bersama satu siswa

- Di HP lain, buka link kelas/scan QR dari guru. **Tidak ada kolom password siswa.**
- Kelas terpilih otomatis, nama-nama kelas itu muncul setelah guru mengunggah daftar siswa.
- Pilih nama dan status, klik **Kirim Kehadiran Hari Ini**.
- Di Portal Guru, rekap tersimpan langsung di D1. Rekap layar akan memuat ulang otomatis kira-kira tiap 60 detik; guru bisa muat ulang halaman bila perlu.
- Coba absen lagi dengan nama sama di hari WIT yang sama: harus ditolak.
- Coba QR kelas VII-A untuk kelas lain: harus ditolak oleh server.

## Penting tentang privasi dan keamanan

- QR/link kelas **bukan identitas siswa**; siapa pun yang memiliki tautan bisa melihat nama kelas tersebut dan berpotensi absen atas nama orang lain. Jangan membagikannya di media sosial publik. Bila sekolah memerlukan verifikasi siswa sungguhan, diperlukan autentikasi individual (bukan QR kelas bersama).
- Jangan memasukkan daftar siswa atau password guru ke repo GitHub (repository Anda terlihat publik). Data nama siswa disimpan di Cloudflare D1.
- Setelah link dibuka, token disembunyikan dari address bar dan disimpan di sesi tab. Membuka website utama di tab baru tanpa tautan tidak membuka daftar siswa.
- Waktu absensi dan pergantian hari dihitung oleh server dengan `Asia/Jayapura` (WIT), bukan jam HP siswa.
- File lama dalam repo `frontend_engine.js` masih ada sebagai salinan pengembang; aplikasi yang ditampilkan sekarang memakai `public/app.js`.
