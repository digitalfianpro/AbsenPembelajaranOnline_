-- Jalankan sekali pada Cloudflare D1 (Console atau wrangler d1 execute).
-- Tanggal absen dihitung oleh server menggunakan Asia/Jayapura / WIT.
CREATE TABLE IF NOT EXISTS classes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id TEXT NOT NULL REFERENCES classes(id),
  name TEXT NOT NULL,
  name_key TEXT NOT NULL,
  UNIQUE(class_id, name_key)
);
CREATE INDEX IF NOT EXISTS idx_students_class ON students(class_id);
CREATE TABLE IF NOT EXISTS attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES students(id),
  class_id TEXT NOT NULL REFERENCES classes(id),
  attendance_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('Hadir', 'Izin', 'Sakit')),
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  UNIQUE(student_id, attendance_date)
);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(attendance_date, created_at DESC);
CREATE TABLE IF NOT EXISTS login_attempts (
  ip_key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  window_start INTEGER NOT NULL
);
INSERT OR IGNORE INTO classes(id,name) VALUES
  ('VII-A', 'Kelas VII-A'), ('VII-B', 'Kelas VII-B'),
  ('VIII-A', 'Kelas VIII-A'), ('VIII-B', 'Kelas VIII-B'),
  ('IX-A', 'Kelas IX-A'), ('IX-B', 'Kelas IX-B');

-- Tautan rahasia per kelas untuk QR (versi baru, aman juga untuk database yang sudah ada).
CREATE TABLE IF NOT EXISTS class_access (
  class_id TEXT PRIMARY KEY REFERENCES classes(id),
  nonce TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
