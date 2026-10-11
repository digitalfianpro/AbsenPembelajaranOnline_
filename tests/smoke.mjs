// Smoke tests: run with Node.js 22+, no Cloudflare account required.
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const root = new URL('../', import.meta.url);
const sql = readFileSync(new URL('schema.sql', root), 'utf8');
const db = new DatabaseSync(':memory:');
db.exec(sql);
const wrappedDB = {
  prepare(query) {
    const stmt = db.prepare(query);
    return {
      bind(...params) {this.params = params; return this;},
      async first() {return stmt.get(...(this.params||[])) || null;},
      async all() {return {results:stmt.all(...(this.params||[]))};},
      async run() {return {meta:{changes:stmt.run(...(this.params||[])).changes}};}
    };
  },
  async batch(statements) {
    db.exec('BEGIN TRANSACTION');
    try { for (const s of statements) await s.run(); db.exec('COMMIT'); }
    catch(e) {db.exec('ROLLBACK'); throw e;}
  }
};
const code = readFileSync(new URL('functions/api/[[path]].js', root), 'utf8');
const server = await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const env = {DB: wrappedDB, TEACHER_USERNAME:'ALFIAN',TEACHER_PASSWORD:'PasswordKuatSangatPanjang2026!',
  SESSION_SECRET:'SECRETDIPAKAISEKOLAH_0123456789_0123456789___'};
const origin = 'https://smp6.pages.dev';
async function call(path, method='GET', payload=undefined, {cookie='', link='', originHeader=true}={}) {
  const headers = {...(payload!==undefined?{'Content-Type':'application/json'}:{}), ...(originHeader?{'Origin':origin}:{}),
    ...(cookie?{'Cookie':cookie}:{}), ...(link?{'X-Student-Link':link}:{})};
  const req = new Request(origin+'/api'+path,{method,headers,...(payload===undefined?{}:{body:JSON.stringify(payload)})});
  const res = await server.onRequest({request:req,env,params:{path:path.split('?')[0].slice(1).split('/')}});
  const data = await res.json();
  return {status:res.status, data, cookie:res.headers.get('set-cookie')};
}
const ok = await call('/health');
assert.equal(ok.status,200); assert.equal(ok.data.timezone,'Asia/Jayapura');
assert.equal((await call('/roster')).status,403);
assert.equal((await call('/roster','GET',undefined,{link:'wrong'})).status,403);
assert.equal((await call('/admin/session')).data.authenticated,false);
assert.equal((await call('/admin/login','POST',{username:env.TEACHER_USERNAME,password:'SALAH'})).status,401);
assert.equal((await call('/admin/attendance')).status,401);
assert.equal((await call('/admin/login','POST',{username:env.TEACHER_USERNAME,password:env.TEACHER_PASSWORD},{originHeader:false})).status,403);
// Nama dapat ditulis dalam kapitalisasi berbeda; email bukan kredensial login lagi.
assert.equal((await call('/admin/login','POST',{username:'NAMA LAIN',password:env.TEACHER_PASSWORD})).status,401);
assert.equal((await call('/admin/login','POST',{email:'guru@example.com',password:env.TEACHER_PASSWORD})).status,400);
const login = await call('/admin/login','POST',{username:'  alfian  ',password:env.TEACHER_PASSWORD});
assert.equal(login.status,200); assert.match(login.cookie,/HttpOnly; SameSite=Strict/);
const teacherCookie = login.cookie.split(';')[0];
assert.equal((await call('/admin/session','GET',undefined,{cookie:teacherCookie})).data.authenticated,true);
assert.equal((await call('/admin/links')).status,401);
const linkResult=await call('/admin/links','POST',{classId:'VII-A'},{cookie:teacherCookie});
assert.equal(linkResult.status,200);
const classLink=linkResult.data.links.find(l=>l.classId==='VII-A');
assert.match(classLink.url,/^https:\/\/smp6\.pages\.dev\/\?access=v1\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{22}$/);
const token=new URL(classLink.url).searchParams.get('access');
const student={link:token};
assert.equal((await call('/roster','GET',undefined,student)).data.roster['VII-A'].length,0);
assert.equal((await call('/roster','GET',undefined,student)).data.classes.length,1);
assert.equal((await call('/roster','GET',undefined,student)).data.roster['VII-B'],undefined);
assert.equal((await call('/admin/links','POST',{classId:'IX-Z'},{cookie:teacherCookie})).status,404);
assert.equal((await call('/admin/links','POST',{classId:'VII-A'},{originHeader:false,cookie:teacherCookie})).status,403);
const add = await call('/admin/students','POST',{entries:[
  {classId:'VII-A',name:'Ahmad Contoh'}, {classId:'VII-A',name:'Ahmad Contoh'},
  {classId:'VII-B',name:'Ahmad Contoh'}, {classId:'VIII-B',name:'Siswa, Nama'}
]}, {cookie:teacherCookie});
assert.equal(add.status,200);
const roster = await call('/roster','GET',undefined,student);
assert.equal(roster.data.roster['VII-A'].length,1);
assert.equal(roster.data.roster['VII-B'],undefined);
const teacherRoster=await call('/roster','GET',undefined,{cookie:teacherCookie});
assert.equal(teacherRoster.data.roster['VII-B'].length,1);
assert.equal(teacherRoster.data.roster['VIII-B'][0],'Siswa, Nama');
const record = {classId:'VII-A',studentName:'Ahmad Contoh',status:'Sakit',notes:'Sakit flu'};
assert.equal((await call('/attendance','POST',record)).status,403);
assert.equal((await call('/attendance','POST',record,{...student,originHeader:false})).status,403);
assert.equal((await call('/attendance','POST',record,student)).status,201);
assert.equal((await call('/attendance','POST',record,student)).status,409);
assert.equal((await call('/attendance','POST',{...record,classId:'VII-B',status:'Hadir'},student)).status,403);
assert.equal((await call('/check?classId=VII-B&studentName=Ahmad%20Contoh','GET',undefined,student)).status,403);
const linkB=await call('/admin/links','POST',{classId:'VII-B'},{cookie:teacherCookie});
const tokenB=new URL(linkB.data.links.find(l=>l.classId==='VII-B').url).searchParams.get('access');
assert.equal((await call('/attendance','POST',{...record,classId:'VII-B',status:'Hadir'},{link:tokenB})).status,201);
assert.equal((await call('/attendance','POST',{...record,classId:'IX-A'},student)).status,403);
const chk = await call('/check?classId=VII-A&studentName=Ahmad%20Contoh','GET',undefined,student);
assert.equal(chk.data.submitted,true);
let results=await call('/admin/attendance','GET',undefined,{cookie:teacherCookie});
assert.equal(results.data.records.length,2);
assert.equal(results.data.records[0].attendanceDate,ok.data.dateWit);
assert.equal((await call('/admin/attendance?id='+results.data.records[0].id,'DELETE',undefined,{cookie:teacherCookie})).status,200);
results=await call('/admin/attendance','GET',undefined,{cookie:teacherCookie});
assert.equal(results.data.records.length,1);
const oldToken=token;
const regen=await call('/admin/links','POST',{classId:'VII-A'},{cookie:teacherCookie});
assert.equal(regen.status,200);
const newToken=new URL(regen.data.links.find(l=>l.classId==='VII-A').url).searchParams.get('access');
assert.notEqual(oldToken,newToken);
assert.equal((await call('/roster','GET',undefined,{link:oldToken})).status,403);
assert.equal((await call('/roster','GET',undefined,{link:newToken})).status,200);
assert.equal((await call('/admin/links?classId=VII-A','DELETE',undefined,{cookie:teacherCookie})).status,200);
assert.equal((await call('/roster','GET',undefined,{link:newToken})).status,403);
assert.equal((await call('/admin/logout','POST',{}, {cookie:teacherCookie})).status,200);
const js = readFileSync(new URL('frontend_engine.js', root), 'utf8');
const sandbox={Intl,Date,console,setInterval,setTimeout,clearTimeout,window:{},Blob};
vm.createContext(sandbox);
vm.runInContext(js+'\nthis.__appData=appData;this.__witDateKey=witDateKey;this.__parseCsv=parseRosterCsvRow;',sandbox);
assert.equal(sandbox.__witDateKey('2026-10-10T15:00:00Z'),'2026-10-11'); // 00:00 WIT
assert.equal(sandbox.__witDateKey('2026-10-10T14:59:59Z'),'2026-10-10');
assert.equal(sandbox.__parseCsv('"Kelas VII-A","Nama, Dengan Koma"')[1],'Nama, Dengan Koma');
const app=sandbox.__appData();
app.studentForm.classId='VII-A';app.studentForm.studentName='Ahmad Contoh';
app.checkedAttendance={key:sandbox.__witDateKey()+'__VII-A__Ahmad Contoh',submitted:true,timestamp:'2026-10-11T00:00:00Z'};
assert.equal(app.checkAlreadySubmitted('Ahmad Contoh'),true);
assert.equal(app.stats.total,0);
console.log('LULUS: API health, kode kelas, login nama guru/password (tanpa email), logout guru, autentikasi sesi, tambah siswa, kelas berbeda, kirim absensi, duplikat, cek absensi, hapus, filter data, tanggal WIT, CSV.');
