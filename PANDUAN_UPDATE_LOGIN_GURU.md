# PANDUAN MEMPERBARUI LOGIN PORTAL GURU MENJADI NAMA + PASSWORD

Untuk aplikasi Anda yang **SUDAH ONLINE** di `https://absenpembelajaranonline.pages.dev` dan database D1 `absensi-smp6pjj`.

**Tujuan:** mengganti Email Guru menjadi **Nama Guru**, tetap memakai **Password Guru**. Portal Murid versi tautan/QR tanpa password siswa, data D1, dan waktu WIT **tetap sama**. **Tidak perlu menjalankan SQL baru**, menghapus D1, membuat proyek Cloudflare baru, atau mengganti domain.

## LANGKAH 1 — Tambahkan secret nama guru di Cloudflare

1. Masuk ke Cloudflare → **Workers & Pages** → pilih proyek **Pages** `absenpembelajaranonline` (bukan proyek Worker lama).
2. Buka **Settings → Variables and secrets**. Pilih lingkungan **Production**.
3. Klik **Add**. Isi nama **`TEACHER_USERNAME`** dengan *nama guru yang ingin dipakai untuk login*, misalnya `ALFIAN` (boleh nama lengkap). Pilih tipe **Secret** (encrypted), lalu **Save**.
4. Biarkan `TEACHER_PASSWORD` dan `SESSION_SECRET` yang sudah ada. Pastikan password yang nanti dimasukkan sama dengan secret `TEACHER_PASSWORD`; `SESSION_SECRET` sekurangnya 32 karakter.
5. `TEACHER_EMAIL` tidak dipakai oleh aplikasi versi baru. **Jangan hapus dulu** sampai versi baru berhasil login. `STUDENT_ACCESS_CODE` lama juga tidak dipakai oleh versi QR.

**Jangan memasukkan nama/password guru ke kode GitHub, dan jangan mengirim password kepada siapa pun melalui chat.**

## LANGKAH 2 — Unggah kode baru ke GitHub

1. Unduh file ZIP **absensi_smp6_cloudflare_QR_login_nama_guru.zip** dan ekstrak.
2. Buka repository **`digitalfianpro/AbsenPembelajaranOnline_`**.
3. Klik **Add file → Upload files** dan seret **seluruh isi hasil ekstrak** ke halaman upload, bukan file ZIP-nya. Timpa file dengan nama/lokasi sama jika diminta.
4. Pastikan file di akar repo masih sesuai struktur:

```text
public/index.html
public/app.js
public/qr.js
functions/api/[[path]].js
schema.sql
README.md
```

5. Klik **Commit changes**. Jika GitHub tidak mengizinkan timpa file melalui upload, edit masing-masing file melalui tombol pensil (edit) di GitHub atau unggah perubahan menggunakan Git/GitHub Desktop.

**PENTING:** Jangan hanya mengganti `public/index.html`! Server `functions/api/[[path]].js` juga harus diperbarui agar login dengan nama diterima.

## LANGKAH 3 — Aktifkan dan tes

1. Cloudflare → proyek **Pages** `absenpembelajaranonline` → **Deployments**. Tunggu *deployment baru dari commit GitHub terakhir* berstatus **Success**. Jika perlu setelah menambah secret, jalankan deployment baru terhadap commit terbaru.
2. Buka **alamat utama**, bukan preview: `https://absenpembelajaranonline.pages.dev`.
3. Gunakan **Ctrl + Shift + R** untuk memuat ulang halaman tanpa cache.
4. Klik **Portal Guru**. Sekarang kolomnya **Nama Guru** dan **Password Guru**, **bukan email**.
5. Isi persis nama pada secret `TEACHER_USERNAME` (huruf besar-kecil tidak masalah), kemudian password yang tersimpan dalam `TEACHER_PASSWORD`.
6. Jika login sukses, coba **Bagikan Link / QR Kelas** dan lihat rekap. Data absensi WIT tetap ada di D1 yang sama.
7. Setelah berhasil, Anda boleh menghapus secret lama `TEACHER_EMAIL` di Cloudflare. Jangan hapus `TEACHER_PASSWORD`, `SESSION_SECRET`, atau binding D1 `DB`.

## Jika masih gagal login

- Coba `https://absenpembelajaranonline.pages.dev/api/health` — seharusnya JSON dengan `ok: true` dan `timezone: "Asia/Jayapura"`.
- Pastikan `TEACHER_USERNAME` sudah **Production** dan tidak salah eja; periksa bahwa `TEACHER_PASSWORD` benar dan `SESSION_SECRET` minimal 32 karakter.
- Jika respons 'terlalu banyak percobaan', hentikan percobaan selama sekitar 15 menit (batas percobaan login).
- Jika kolom masih tertulis Email Guru, deployment terbaru mungkin belum aktif atau browser belum menyegarkan halaman.
- Jika sistem mengembalikan 503, periksa binding `DB`, `TEACHER_USERNAME`, `TEACHER_PASSWORD`, `SESSION_SECRET`, serta deployment.
- Berikan screenshot **tanpa menampilkan password, nilai secret, atau tautan QR kelas** untuk dibantu.

## Catatan keamanan

Nama guru bukan rahasia dan **tidak menggantikan password**. Gunakan password yang kuat. Link/QR kelas tidak membuktikan identitas murid; siapa pun yang memilikinya bisa memilih nama siswa. Bagikan hanya melalui kanal kelas tepercaya.
