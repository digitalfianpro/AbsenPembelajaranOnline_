-- Jalankan sekali di D1 Console yang SUDAH ada. TIDAK menghapus siswa/absensi.
CREATE TABLE IF NOT EXISTS class_access (
  class_id TEXT PRIMARY KEY REFERENCES classes(id),
  nonce TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
