# Panduan pemasangan absensi SMPN 6 Manokwari — Cloudflare 100%

**Tidak memakai Firebase.** Frontend: Cloudflare Pages; backend: Pages Functions (berbasis Workers); database: D1; jam: WIT (`Asia/Jayapura`).

## Langkah 1 — Unggah kode ke GitHub

Buat repositori baru, sebaiknya **Private** karena ini proyek sekolah. Unggah **isi folder paket** (bukan ZIP saja) dengan susunan yang sama:

```text
public/
  index.html
  _headers
  _routes.json
functions/
  api/
    [[path]].js
schema.sql
PANDUAN_CLOUDFLARE.md
.gitignore
```

Nama folder `functions` **wajib di akar repositori**, bukan di dalam `public`. Mengunggah `public/index.html` saja tidak akan menyimpan data secara online.

## Langkah 2 — Buat database D1

1. Masuk ke dashboard Cloudflare > **Storage & databases > D1 SQL database** (lokasi menu bisa berubah) dan buat database misalnya `absensi-smp6`.
2. Buka database tersebut > **Console**.
3. Salin seluruh isi `schema.sql`, lalu klik **Execute**. Ini membuat tabel `classes`, `students`, `attendance`, `login_attempts` dan enam kelas awal (roster masih kosong).
4. Pastikan tabel-tabel telah muncul sebelum melanjutkan.

> Alternatif melalui terminal: `npx wrangler d1 execute absensi-smp6 --remote --file=./schema.sql` (Wrangler harus sudah login dan nama database cocok).

## Langkah 3 — Hubungkan GitHub ke Cloudflare Pages

1. Di Cloudflare, buka **Workers & Pages > Create application > Pages > Connect to Git** (tampilan menu dapat berbeda).
2. Pilih repositori tadi dan branch `main`.
3. Set **Framework preset: None**, **Build command: `exit 0`**, **Build output directory: `public`**, **Root directory: /**.
4. Deploy awal. Pages akan menyediakan alamat `https://<nama-proyek>.pages.dev`.
5. Pastikan aplikasi dilayani melalui HTTPS dari **Pages** dan fungsi `/api/...` aktif. Upload langsung via drag-drop di dashboard **tidak** membawa folder Functions ini.

## Langkah 4 — Sambungkan database ke Pages Functions

1. Masuk ke pengaturan proyek Pages: **Settings > Bindings > Add > D1 database** (atau pengaturan Production/Preview sesuai UI).
2. **Variable name** harus persis `DB` (huruf besar).
3. Pilih database D1 `absensi-smp6` yang sudah dibuat. Simpan.
4. **Redeploy** setelah membuat binding.

## Langkah 5 — Simpan rahasia aplikasi di Cloudflare (JANGAN di GitHub)

Buka proyek Pages > **Settings > Variables and Secrets**. Tambahkan **empat variabel bertipe Secret/Encrypt** di lingkungan **Production**:

| Nama persis | Isi | Catatan |
|---|---|---|
| `TEACHER_EMAIL` | email guru milik Anda | Mis. `guru@sekolah.sch.id` |
| `TEACHER_PASSWORD` | password guru kuat | Buat sendiri, **bukan password lama yang tertulis di HTML** |
| `SESSION_SECRET` | teks acak rahasia minimal 32 karakter | Buat unik; **jangan pernah di-commit** |
| `STUDENT_ACCESS_CODE` | kode kelas rahasia untuk para siswa | Bagikan hanya kepada kelas; gunakan kode yang sulit ditebak |

Semua pengaturan harus dibuat untuk Production; jika ingin memakai preview, gunakan database uji dan secrets tersendiri. Setelah mengubah secrets, **redeploy** agar aktif.

Contoh cara membuat `SESSION_SECRET` secara lokal (terminal):

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Jangan menempelkan hasil perintah tersebut di GitHub atau grup kelas.

## Langkah 6 — Tes setelah deploy

- Kunjungi `https://<alamat-pages>/api/health`: harus menampilkan `{"ok":true,"timezone":"Asia/Jayapura",...}`.
- Buka Portal Murid: masukkan kode kelas; nama siswa awalnya **kosong** (disengaja, agar data pribadi tidak dimasukkan ke source code publik).
- Buka Portal Guru, login menggunakan email dan password yang dibuat di **Cloudflare Secrets**.
- Tambahkan 2 siswa contoh atau impor CSV, lalu buka daftar siswa dengan kode kelas di perangkat lain.
- Isi Hadir/Izin/Sakit dan pastikan rekamannya ada di Portal Guru, lalu coba kirim ulang siswa dan tanggal yang sama: harus ditolak.
- Uji filter tanggal, rekap CSV, serta login/logout dari ponsel dan laptop.

## Waktu WIT

UI dan ekspor CSV menggunakan timezone `Asia/Jayapura`; **tanggal dan timestamp absensi ditentukan server**, sehingga jam pengguna tidak bisa memindahkan tanggal presensi.

## Catatan keamanan penting

- Daftar nama siswa hanya dikirim ke browser setelah memasukkan **kode akses siswa** atau login guru. Namun kode bersama bukan verifikasi identitas per siswa: siswa yang memiliki kode kelas masih bisa memilih nama temannya. Untuk absensi dengan jaminan identitas, perlu login atau PIN **per siswa**.
- Data `Izin`, `Sakit`, dan catatan berpotensi sensitif. Dapatkan persetujuan/izin sekolah, jangan publikasikan CSV atau nama siswa di GitHub, gunakan kebijakan akses, dan buat backup D1 berkala.
- Login guru dibatasi maksimal 5 percobaan gagal dalam 15 menit **per IP** di kode dan disarankan menambah proteksi bot/rate limiting di Cloudflare WAF untuk penggunaan publik.
- Sesi guru memakai cookie HttpOnly + Secure + SameSite=Strict, masa berlaku maksimal 8 jam; logout menghapus cookie di browser.
- **Ekspor semua tanggal** membatasi pembacaan backend hingga 10.000 rekaman; gunakan tanggal terpilih untuk mengelola dataset lebih besar.
- Backend tidak mendukung fitur menghapus siswa dari roster; fitur yang tersedia: tambah dan impor. Hapus absensi ada di Portal Guru.

## Pemecahan masalah

- **`/api/health` 404**: folder `functions/api/[[path]].js` salah lokasi, atau deploy bukan via Git/Wrangler.
- **`Binding database D1 (DB) belum dipasang`**: binding harus bernama `DB` dan harus redeploy.
- **`Server mengalami kesalahan`**: jalankan `schema.sql`, periksa logs Pages Functions dan ikatan database.
- **Tidak bisa login guru (503)**: periksa 4 variabel rahasia (terutama `SESSION_SECRET` > 32 karakter) dan redeploy.
- **Kode kelas salah (403)**: cocokkan dengan Secret `STUDENT_ACCESS_CODE`, tidak perlu memakai tanda kutip.
- **Tidak ada nama siswa**: login sebagai guru dan tambah/impor daftar siswa terlebih dahulu.

**Referensi resmi:**
- Pages Git + static HTML: https://developers.cloudflare.com/pages/framework-guides/deploy-anything/
- Pages Functions + D1 binding: https://developers.cloudflare.com/pages/functions/bindings/
- D1 database: https://developers.cloudflare.com/d1/get-started/
