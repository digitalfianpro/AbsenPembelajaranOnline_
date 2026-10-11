// Cloudflare Pages Function. D1 binding DB dan secrets ditempatkan di dashboard.
// Tidak ada Firebase ataupun password guru yang disimpan/dikirim ke browser sebagai konfigurasi.
const WIT_ZONE = 'Asia/Jayapura';
const COOKIE = '__Host-smp6_teacher';
const EIGHT_HOURS = 8 * 60 * 60;
const STUDENT_LINK_DAYS = 30;
const textEncoder = new TextEncoder();

function dateWit(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: WIT_ZONE, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(d).filter(v => v.type !== 'literal').map(v => [v.type, v.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), { status, headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders
  }});
}
function error(status, message) { return json({error: message}, status); }
function sameOrigin(request) {
  const origin = request.headers.get('Origin');
  return !!origin && origin === new URL(request.url).origin;
}
function validClassId(value) { return typeof value === 'string' && /^[A-Z0-9-]{2,32}$/.test(value); }
function validName(value) { return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 100 && !/[\r\n\u0000-\u001f]/.test(value); }
function normalizeName(name) { return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('id-ID'); }
function normalizeTeacherUsername(name) { return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('id-ID'); }
function base64url(bytes) {
  let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
async function sha256(value) { return new Uint8Array(await crypto.subtle.digest('SHA-256', textEncoder.encode(value))); }
function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let x = 0; for (let i = 0; i < a.length; i++) x |= a[i] ^ b[i];
  return x === 0;
}
async function hmac(secret, value) {
  const key = await crypto.subtle.importKey('raw', textEncoder.encode(secret), {name:'HMAC',hash:'SHA-256'}, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, textEncoder.encode(value)));
}
async function signCookie(secret) {
  const exp = Math.floor(Date.now()/1000) + EIGHT_HOURS;
  const nonce = base64url(crypto.getRandomValues(new Uint8Array(16)));
  const payload = `v1.${exp}.${nonce}`;
  return `${payload}.${base64url(await hmac(secret, payload))}`;
}
async function isTeacher(request, env) {
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) return false;
  const raw = request.headers.get('Cookie') || '';
  const token = raw.split(';').map(s => s.trim()).find(s => s.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
  if (!token) return false;
  const match = /^v1\.(\d{10})\.([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match || Number(match[1]) < Date.now()/1000) return false;
  const payload = `v1.${match[1]}.${match[2]}`;
  const expected = base64url(await hmac(env.SESSION_SECRET, payload));
  return constantTimeEqual(textEncoder.encode(match[3]), textEncoder.encode(expected));
}
function cookieHeader(token, maxAge = EIGHT_HOURS) {
  return `${COOKIE}=${token}; Path=/; Max-Age=${maxAge}; Secure; HttpOnly; SameSite=Strict`;
}
async function studentScope(request, env) {
  // Tautan merupakan bearer token. Hanya berlaku untuk kelasnya sendiri.
  if (await isTeacher(request, env)) return '*';
  const provided = request.headers.get('X-Student-Link') || '';
  if (provided.length > 160) return null;
  // Token ringkas agar QR mudah dipindai; tanda tangan 128-bit dari HMAC SHA-256.
  const match = /^v1\.([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{22})$/.exec(provided);
  if (!match || !env.SESSION_SECRET || env.SESSION_SECRET.length < 32) return null;
  const record = await env.DB.prepare('SELECT class_id,nonce,expires_at FROM class_access WHERE nonce=?').bind(match[1]).first();
  if (!record || record.expires_at <= Math.floor(Date.now()/1000)) return null;
  const sig = base64url((await hmac(env.SESSION_SECRET, `student-class-link:v1.${record.class_id}.${record.nonce}.${record.expires_at}`)).slice(0,16));
  if (!constantTimeEqual(textEncoder.encode(match[2]), textEncoder.encode(sig))) return null;
  return record.class_id;
}
async function getTeacherLinks(request, env) {
  const rows = await env.DB.prepare('SELECT c.id,c.name,a.nonce,a.expires_at FROM classes c LEFT JOIN class_access a ON a.class_id=c.id ORDER BY c.id').all();
  const origin = new URL(request.url).origin;
  const now = Math.floor(Date.now()/1000);
  const links = [];
  for (const r of rows.results) {
    let url = null;
    if (r.nonce && r.expires_at > now) {
      const sig = base64url((await hmac(env.SESSION_SECRET, `student-class-link:v1.${r.id}.${r.nonce}.${r.expires_at}`)).slice(0,16));
      url = `${origin}/?access=${encodeURIComponent(`v1.${r.nonce}.${sig}`)}`;
    }
    links.push({classId:r.id, className:r.name, url, expiresAt:url ? new Date(r.expires_at*1000).toISOString() : null});
  }
  return links;
}
async function bodyJson(request) {
  if (!(request.headers.get('Content-Type') || '').toLowerCase().startsWith('application/json')) throw new Error('Kirim data dalam format JSON.');
  const raw = await request.text();
  if (raw.length > 130000) throw new Error('Data terlalu besar.');
  try { return JSON.parse(raw); } catch { throw new Error('JSON tidak valid.'); }
}

export async function onRequest({request, env, params}) {
  try {
    if (!env.DB) return error(503, 'Binding database D1 (DB) belum dipasang.');
    const path = '/' + (Array.isArray(params.path) ? params.path.join('/') : (params.path || ''));
    const method = request.method.toUpperCase();
    if (!['GET','POST','DELETE'].includes(method)) return error(405, 'Metode tidak diizinkan.');
    if (method !== 'GET' && !sameOrigin(request)) return error(403, 'Permintaan lintas situs ditolak.');

    if (path === '/health' && method === 'GET') {
      await env.DB.prepare('SELECT id FROM classes LIMIT 1').first();
      return json({ok: true, timezone: WIT_ZONE, dateWit: dateWit()});
    }

    if (path === '/admin/login' && method === 'POST') {
      if (!env.TEACHER_USERNAME || !env.TEACHER_PASSWORD || !env.SESSION_SECRET || env.SESSION_SECRET.length < 32) {
        return error(503, 'Rahasia autentikasi guru belum disetel di Cloudflare.');
      }
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      const ipKey = base64url(await sha256(ip));
      const now = Math.floor(Date.now()/1000);
      const attempt = await env.DB.prepare('SELECT attempts,window_start FROM login_attempts WHERE ip_key=?').bind(ipKey).first();
      if (attempt && attempt.window_start + 900 > now && attempt.attempts >= 5) return error(429, 'Terlalu banyak percobaan. Coba lagi setelah 15 menit.');
      const b = await bodyJson(request);
      const username = typeof b.username === 'string' ? b.username : '';
      const password = typeof b.password === 'string' ? b.password : '';
      if (!validName(username) || password.length > 256 || !password) return error(400, 'Nama atau password tidak valid.');
      const usernameOk = constantTimeEqual(
        await sha256(normalizeTeacherUsername(username)),
        await sha256(normalizeTeacherUsername(env.TEACHER_USERNAME))
      );
      const passOk = constantTimeEqual(await sha256(password), await sha256(env.TEACHER_PASSWORD));
      if (!usernameOk || !passOk) {
        const attempts = attempt && attempt.window_start + 900 > now ? attempt.attempts + 1 : 1;
        await env.DB.prepare('INSERT INTO login_attempts(ip_key,attempts,window_start) VALUES (?,?,?) ON CONFLICT(ip_key) DO UPDATE SET attempts=excluded.attempts, window_start=excluded.window_start').bind(ipKey, attempts, (attempt && attempt.window_start + 900 > now) ? attempt.window_start : now).run();
        return error(401, 'Nama atau password guru salah.');
      }
      await env.DB.prepare('DELETE FROM login_attempts WHERE ip_key=?').bind(ipKey).run();
      return json({ok: true}, 200, {'Set-Cookie': cookieHeader(await signCookie(env.SESSION_SECRET))});
    }
    if (path === '/admin/logout' && method === 'POST') {
      return json({ok: true}, 200, {'Set-Cookie': cookieHeader('', 0)});
    }
    if (path === '/admin/session' && method === 'GET') {
      return json({authenticated: await isTeacher(request, env)});
    }

    if (path === '/roster' && method === 'GET') {
      const scope = await studentScope(request, env);
      if (!scope) return error(403, 'Buka halaman dari tautan/QR yang dibagikan guru.');
      const classesQuery = "SELECT id,name FROM classes" + (scope==='*' ? " ORDER BY CASE WHEN id LIKE 'VII-%' THEN 1 WHEN id LIKE 'VIII-%' THEN 2 WHEN id LIKE 'IX-%' THEN 3 ELSE 4 END, id" : ' WHERE id=?');
      const classes = await (scope==='*' ? env.DB.prepare(classesQuery) : env.DB.prepare(classesQuery).bind(scope)).all();
      const studentsQuery = 'SELECT class_id AS classId,name FROM students' + (scope==='*' ? ' ORDER BY name' : ' WHERE class_id=? ORDER BY name');
      const students = await (scope==='*' ? env.DB.prepare(studentsQuery) : env.DB.prepare(studentsQuery).bind(scope)).all();
      const roster = {};
      for (const cls of classes.results) roster[cls.id] = [];
      for (const student of students.results) (roster[student.classId] ||= []).push(student.name);
      return json({classes: classes.results, roster});
    }
    if (path === '/check' && method === 'GET') {
      const scope = await studentScope(request, env);
      if (!scope) return error(403, 'Tautan kelas tidak berlaku. Minta tautan baru kepada guru.');
      const url = new URL(request.url);
      const classId = url.searchParams.get('classId') || '';
      const studentName = url.searchParams.get('studentName') || '';
      if (scope !== '*' && scope !== classId) return error(403, 'Tautan tidak berlaku untuk kelas ini.');
      if (!validClassId(classId) || !validName(studentName)) return error(400, 'Data siswa tidak valid.');
      const rec = await env.DB.prepare(`SELECT a.created_at AS timestamp
        FROM attendance a JOIN students s ON s.id = a.student_id
        WHERE s.class_id=? AND s.name_key=? AND a.attendance_date=? LIMIT 1`)
        .bind(classId, normalizeName(studentName), dateWit()).first();
      return json({submitted: !!rec, timestamp: rec?.timestamp || null});
    }
    if (path === '/attendance' && method === 'POST') {
      const scope = await studentScope(request, env);
      if (!scope) return error(403, 'Tautan kelas tidak berlaku. Minta tautan baru kepada guru.');
      const b = await bodyJson(request);
      if (scope !== '*' && scope !== b.classId) return error(403, 'Tautan tidak berlaku untuk kelas ini.');
      if (!validClassId(b.classId) || !validName(b.studentName) || !['Hadir','Izin','Sakit'].includes(b.status) || typeof b.notes !== 'string' || b.notes.length > 250) return error(400, 'Data absensi tidak valid.');
      const student = await env.DB.prepare('SELECT id FROM students WHERE class_id=? AND name_key=?').bind(b.classId, normalizeName(b.studentName)).first();
      if (!student) return error(400, 'Nama tidak terdaftar di kelas ini.');
      const date = dateWit();
      const stamp = new Date().toISOString();
      const result = await env.DB.prepare(`INSERT INTO attendance(student_id,class_id,attendance_date,status,notes,created_at)
        VALUES(?,?,?,?,?,?) ON CONFLICT(student_id,attendance_date) DO NOTHING`)
        .bind(student.id, b.classId, date, b.status, b.notes.trim(), stamp).run();
      if (!result.meta.changes) return error(409, 'Siswa sudah mengisi absensi hari ini (WIT).');
      return json({ok: true, timestamp: stamp, dateWit: date}, 201);
    }

    if (path.startsWith('/admin/')) {
      if (!await isTeacher(request, env)) return error(401, 'Silakan masuk sebagai guru terlebih dahulu.');
      if (path === '/admin/links' && method === 'GET') {
        if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) return error(503,'SESSION_SECRET belum dikonfigurasi.');
        return json({links:await getTeacherLinks(request,env)});
      }
      if (path === '/admin/links' && method === 'POST') {
        const b = await bodyJson(request);
        if (!validClassId(b.classId)) return error(400, 'Kelas tidak valid.');
        const cls = await env.DB.prepare('SELECT id FROM classes WHERE id=?').bind(b.classId).first();
        if (!cls) return error(404,'Kelas tidak ditemukan.');
        const nonce = base64url(crypto.getRandomValues(new Uint8Array(16)));
        const exp = Math.floor(Date.now()/1000)+ STUDENT_LINK_DAYS*24*60*60;
        await env.DB.prepare('INSERT INTO class_access(class_id,nonce,expires_at) VALUES(?,?,?) ON CONFLICT(class_id) DO UPDATE SET nonce=excluded.nonce,expires_at=excluded.expires_at').bind(b.classId,nonce,exp).run();
        return json({links:await getTeacherLinks(request,env)});
      }
      if (path === '/admin/links' && method === 'DELETE') {
        const classId=new URL(request.url).searchParams.get('classId');
        if (!validClassId(classId)) return error(400, 'Kelas tidak valid.');
        await env.DB.prepare('DELETE FROM class_access WHERE class_id=?').bind(classId).run();
        return json({links:await getTeacherLinks(request,env)});
      }
      if (path === '/admin/attendance' && method === 'GET') {
        const date = new URL(request.url).searchParams.get('date');
        if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return error(400, 'Format tanggal salah.');
        const query = `SELECT a.id, s.name AS studentName, a.class_id AS classId, a.attendance_date AS attendanceDate,
          a.status,a.notes,a.created_at AS timestamp
          FROM attendance a JOIN students s ON s.id=a.student_id
          ${date ? 'WHERE a.attendance_date=?' : ''}
          ORDER BY a.created_at DESC LIMIT 10000`;
        const result = await (date ? env.DB.prepare(query).bind(date) : env.DB.prepare(query)).all();
        return json({records:result.results});
      }
      if (path === '/admin/attendance' && method === 'DELETE') {
        const id = Number(new URL(request.url).searchParams.get('id'));
        if (!Number.isSafeInteger(id) || id <= 0) return error(400, 'ID absensi tidak valid.');
        const result = await env.DB.prepare('DELETE FROM attendance WHERE id=?').bind(id).run();
        if (!result.meta.changes) return error(404, 'Data absensi tidak ditemukan.');
        return json({ok:true});
      }
      if (path === '/admin/students' && method === 'POST') {
        const b = await bodyJson(request);
        if (!Array.isArray(b.entries) || b.entries.length < 1 || b.entries.length > 1000) return error(400, 'Jumlah data siswa tidak valid (maksimal 1000/baris impor).');
        const values = new Map();
        for (const entry of b.entries) {
          if (!validClassId(entry.classId) || !validName(entry.name)) return error(400, 'Kelas atau nama murid tidak valid.');
          const k = `${entry.classId}\u0000${normalizeName(entry.name)}`;
          values.set(k, {classId:entry.classId, name:entry.name.trim().replace(/\s+/g,' '), className: `Kelas ${entry.classId}`});
        }
        const ids = [...new Set([...values.values()].map(x=>x.classId))];
        // batch D1 bersifat transaksional: daftar kelas dan siswa tersimpan bersama.
        const statements = [
          ...ids.map(id => env.DB.prepare('INSERT OR IGNORE INTO classes(id,name) VALUES (?,?)').bind(id, `Kelas ${id}`)),
          ...[...values.values()].map(v => env.DB.prepare('INSERT OR IGNORE INTO students(class_id,name,name_key) VALUES(?,?,?)').bind(v.classId,v.name,normalizeName(v.name)))
        ];
        await env.DB.batch(statements);
        return json({ok:true,processed:values.size});
      }
    }
    return error(404, 'Endpoint tidak ditemukan.');
  } catch (e) {
    console.error('API Error', e);
    if (e instanceof SyntaxError || (e.message && /JSON|Data terlalu besar/.test(e.message))) return error(400, e.message);
    return error(500, 'Server mengalami kesalahan. Periksa database D1 dan konfigurasi.');
  }
}
