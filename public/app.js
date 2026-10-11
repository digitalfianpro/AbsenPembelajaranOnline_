// Waktu sekolah sepenuhnya WIT (Asia/Jayapura); tanggal validasi dibuat di server.
const SCHOOL_TZ = 'Asia/Jayapura';
function witParts(value = new Date()) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
        timeZone: SCHOOL_TZ, year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(date).filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
}
function witDateKey(value = new Date()) {
    const p = witParts(value);
    return p ? `${p.year}-${p.month}-${p.day}` : '';
}
function parseRosterCsvRow(line) {
    const out = []; let value = ''; let quoted = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (quoted && line[i + 1] === '"') { value += '"'; i++; }
            else quoted = !quoted;
        } else if (ch === ',' && !quoted) { out.push(value.trim()); value = ''; }
        else value += ch;
    }
    if (quoted) throw new Error('Tanda petik CSV tidak berpasangan.');
    out.push(value.trim()); return out;
}
function csvSafe(value) {
    let s = String(value ?? '');
    if (/^[\s]*[=+\-@]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
}
function saveCsv(fileName, rows) {
    const csv = '\ufeff' + rows.map(row => row.map(csvSafe).join(',')).join('\r\n');
    const blob = new Blob([csv], {type:'text/csv;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = fileName;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
}
function classIdFromCsv(source) {
    const normalized = source.trim().toUpperCase().replace(/^KELAS\s+/, '').replace(/\s+/g, '');
    return /^[A-Z0-9-]{2,32}$/.test(normalized) ? normalized : '';
}
function attendanceId(dateStr, classId, name) { return `${dateStr}__${classId}__${name.trim()}`; }

function appData() {
    return {
        activeTab:'student', isTeacherAuthenticated:false, isTeacherLoginPending:false,
        showAuthModal:false, showRosterModal:false, showExportModal:false, showAddStudentModal:false,
        showShareModal:false, shareClassId:'VII-A', shareLinks:[], isShareBusy:false,
        teacherUsername:'', inputPassword:'', showPass:false, authError:false,
        isSubmitting:false, isCloudConnected:false, connectionError:'',
        studentLink:'', isRosterUnlocked:false, isCheckingAttendance:false,
        checkedAttendance:{key:'',submitted:false,timestamp:null},
        exportClassId:'ALL', importCSVText:'',
        currentDateString:'', currentTimeString:'',
        studentForm:{classId:'',studentName:'',status:'Hadir',notes:''},
        teacherFilters:{searchQuery:'',classId:'ALL',status:'ALL',date:witDateKey()},
        newStudent:{classId:'VII-A',name:''},
        toast:{show:false,title:'',message:'',type:'success'},
        classesList:[
            {id:'VII-A',name:'Kelas VII-A'}, {id:'VII-B',name:'Kelas VII-B'},
            {id:'VIII-A',name:'Kelas VIII-A'}, {id:'VIII-B',name:'Kelas VIII-B'},
            {id:'IX-A',name:'Kelas IX-A'}, {id:'IX-B',name:'Kelas IX-B'}
        ],
        studentsRoster:{}, attendanceRecords:[], _toastTimer:null, _lastWitDate:'',
        get availableStudents() { return this.studentsRoster[this.studentForm.classId] || []; },
        get filteredRecords() {
            return this.attendanceRecords.filter(item => {
                const matchClass = this.teacherFilters.classId === 'ALL' || item.classId === this.teacherFilters.classId;
                const matchStatus = this.teacherFilters.status === 'ALL' || item.status === this.teacherFilters.status;
                const matchSearch = !this.teacherFilters.searchQuery || item.studentName.toLocaleLowerCase('id-ID').includes(this.teacherFilters.searchQuery.toLocaleLowerCase('id-ID'));
                const matchDate = !this.teacherFilters.date || item.attendanceDate === this.teacherFilters.date;
                return matchClass && matchStatus && matchSearch && matchDate;
            });
        },
        get stats() {
            const rows = this.filteredRecords;
            const hadir=rows.filter(r=>r.status==='Hadir').length;
            const izin=rows.filter(r=>r.status==='Izin').length;
            const sakit=rows.filter(r=>r.status==='Sakit').length;
            return {hadir,izin,sakit,total:rows.length,hadirPercentage:rows.length ? Math.round(100*hadir/rows.length):0};
        },
        redrawIcons() { this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); }); },
        async api(path, options={}) {
            const headers = {'Accept':'application/json', ...(options.body ? {'Content-Type':'application/json'} : {})};
            if (this.studentLink) headers['X-Student-Link'] = this.studentLink;
            const response = await fetch('/api'+path, {...options, credentials:'same-origin', cache:'no-store', headers:{...headers,...(options.headers || {})}});
            let data;
            try { data = await response.json(); } catch { throw new Error('Server tidak mengembalikan JSON. Periksa pengaturan Cloudflare Pages Functions.'); }
            if (!response.ok) throw Object.assign(new Error(data.error || `Server HTTP ${response.status}`), {status:response.status});
            return data;
        },
        async initApp() {
            this.updateTime();
            setInterval(() => this.updateTime(), 1000);
            const url = new URL(window.location.href);
            const incomingLink = url.searchParams.get('access');
            if (incomingLink) {
                this.studentLink=incomingLink;
                sessionStorage.setItem('smp6_class_link', incomingLink);
                url.searchParams.delete('access');
                window.history.replaceState({}, '', url.pathname + url.search + url.hash);
            } else {
                this.studentLink=sessionStorage.getItem('smp6_class_link') || '';
            }
            try {
                await this.api('/health');
                this.isCloudConnected=true; this.connectionError='';
                const session=await this.api('/admin/session');
                if (session.authenticated) {
                    this.isTeacherAuthenticated=true;
                    await this.loadRoster(); await this.loadAttendance();
                } else if (this.studentLink) {
                    try { await this.loadRoster(); }
                    catch(e) {
                        this.studentLink=''; sessionStorage.removeItem('smp6_class_link');
                        this.isRosterUnlocked=false;
                        this.connectionError='Tautan kelas tidak berlaku atau sudah kedaluwarsa. Minta tautan/QR baru dari guru.';
                    }
                }
            } catch(e) {
                console.error('Koneksi Cloudflare gagal:',e);
                this.isCloudConnected=false;
                this.connectionError='Belum terhubung ke Cloudflare D1. Pastikan binding DB, schema SQL, dan Pages Functions sudah dipasang.';
            }
            this.redrawIcons();
            setInterval(() => { if (this.isTeacherAuthenticated) this.loadAttendance(); }, 60000);
        },
        async loadRoster() {
            const data=await this.api('/roster');
            this.classesList=data.classes;
            this.studentsRoster=data.roster;
            this.isRosterUnlocked=true;
            if (!this.isTeacherAuthenticated && data.classes.length===1) this.studentForm.classId=data.classes[0].id;
            if (!this.classesList.some(c=>c.id===this.newStudent.classId)) this.newStudent.classId=this.classesList[0]?.id || '';
            if (!this.classesList.some(c=>c.id===this.studentForm.classId)) { this.studentForm.classId=''; this.studentForm.studentName=''; }
            this.redrawIcons();
        },
        async loadAttendance() {
            if (!this.isTeacherAuthenticated) return;
            try {
                const params=this.teacherFilters.date ? '?date='+encodeURIComponent(this.teacherFilters.date) : '';
                const response=await this.api('/admin/attendance'+params);
                this.attendanceRecords=response.records;
                this.redrawIcons();
            } catch(e) {
                if (e.status===401) {
                    this.isTeacherAuthenticated=false; this.attendanceRecords=[]; this.activeTab='student';
                    this.isRosterUnlocked=false; this.studentsRoster={};
                }
                this.showToast('Gagal Memuat Rekap', e.message, 'error');
            }
        },
        get selectedShareLink() { return this.shareLinks.find(x=>x.classId===this.shareClassId) || null; },
        async openShareLinks() {
            if (!this.isTeacherAuthenticated) return;
            this.showShareModal=true;
            this.shareClassId=this.classesList[0]?.id || 'VII-A';
            await this.loadShareLinks();
        },
        async loadShareLinks() {
            try {
                const data=await this.api('/admin/links');
                this.shareLinks=data.links;
                this.drawShareQR();
            } catch(e) {this.showToast('Gagal Memuat Tautan',e.message,'error');}
        },
        drawShareQR() {
            this.$nextTick(()=>{
                const canvas=document.getElementById('classShareQRCode');
                if (!canvas) return;
                const link=this.selectedShareLink?.url;
                if (!link || !window.SMP6QR) {
                    canvas.hidden=true;
                    return;
                }
                try {window.SMP6QR.draw(canvas,link);canvas.hidden=false;}
                catch(e) {canvas.hidden=true;this.showToast('QR Gagal Dibuat',e.message,'error');}
            });
        },
        async generateShareLink() {
            if (!this.isTeacherAuthenticated || !this.shareClassId || this.isShareBusy) return;
            if (this.selectedShareLink?.url && !window.confirm('Ganti tautan kelas? QR yang sudah dibagikan akan berhenti berlaku.')) return;
            this.isShareBusy=true;
            try {
                const data=await this.api('/admin/links',{method:'POST',body:JSON.stringify({classId:this.shareClassId})});
                this.shareLinks=data.links;this.drawShareQR();
                this.showToast('Tautan Siap','Salin tautan atau bagikan gambar QR kepada kelas ini.','success');
            } catch(e) {this.showToast('Gagal Membuat Tautan',e.message,'error');}
            finally {this.isShareBusy=false;}
        },
        async revokeShareLink() {
            if (!this.selectedShareLink?.url || this.isShareBusy) return;
            if (!window.confirm('Nonaktifkan tautan/QR kelas ini? Siswa yang memakai tautan lama tidak dapat mengisi absen.')) return;
            this.isShareBusy=true;
            try {
                const data=await this.api('/admin/links?classId='+encodeURIComponent(this.shareClassId),{method:'DELETE'});
                this.shareLinks=data.links;this.drawShareQR();
                this.showToast('Tautan Dinonaktifkan','Tautan lama sudah tidak berlaku.','success');
            } catch(e) {this.showToast('Gagal Menonaktifkan',e.message,'error');}
            finally {this.isShareBusy=false;}
        },
        async copyShareLink() {
            if (!this.selectedShareLink?.url) return;
            try {await navigator.clipboard.writeText(this.selectedShareLink.url);this.showToast('Tautan Disalin','Bagikan hanya melalui grup kelas yang sesuai.','success');}
            catch(e) {this.showToast('Gagal Menyalin','Salin tautan secara manual dari kotak.','error');}
        },
        downloadShareQR() {
            const canvas=document.getElementById('classShareQRCode');
            if (!this.selectedShareLink?.url || !canvas || canvas.hidden) return;
            const a=document.createElement('a');a.href=canvas.toDataURL('image/png');a.download=`QR_Absensi_${this.shareClassId}.png`;
            document.body.appendChild(a);a.click();a.remove();
        },
        async submitAttendance() {
            if (this.isSubmitting) return;
            const {classId,studentName,status}=this.studentForm;
            const notes=this.studentForm.notes.trim();
            if (!this.isRosterUnlocked || !this.isCloudConnected) {
                this.showToast('Akses Diperlukan','Buka absensi melalui tautan/QR dari guru terlebih dahulu.','error'); return;
            }
            if (!classId || !studentName || !(this.studentsRoster[classId] || []).includes(studentName)) {
                this.showToast('Data Tidak Valid','Pilih kelas dan nama yang tercantum dalam daftar siswa.','error'); return;
            }
            if (!['Hadir','Izin','Sakit'].includes(status) || notes.length>250) {
                this.showToast('Data Tidak Valid','Pilih status dan catatan maksimal 250 karakter.','error'); return;
            }
            this.isSubmitting=true;
            try {
                const result=await this.api('/attendance',{method:'POST',body:JSON.stringify({classId,studentName,status,notes})});
                this.checkedAttendance={key:attendanceId(witDateKey(),classId,studentName),submitted:true,timestamp:result.timestamp};
                this.studentForm.studentName=''; this.studentForm.status='Hadir'; this.studentForm.notes='';
                this.showToast('Absensi Berhasil','Presensi tersimpan di database Cloudflare D1.','success');
            } catch(e) {
                if (e.status===409) await this.checkDuplicateAttendance();
                this.showToast('Absensi Tidak Tersimpan',e.message || 'Periksa koneksi internet.','error');
            } finally {this.isSubmitting=false;}
        },
        async deleteRecord(id) {
            if (!this.isTeacherAuthenticated || !window.confirm('Hapus data absensi ini secara permanen?')) return;
            try {
                await this.api('/admin/attendance?id='+encodeURIComponent(id),{method:'DELETE'});
                await this.loadAttendance();
                this.showToast('Data Dihapus','Data presensi sudah dihapus.','success');
            } catch(e) {this.showToast('Gagal Menghapus',e.message,'error');}
        },
        async saveRosterToCloud(specificClassId=null,rosterOverride=null) {
            if (!this.isTeacherAuthenticated) throw new Error('Hanya guru yang dapat mengubah daftar siswa.');
            const roster=rosterOverride || this.studentsRoster;
            const keys=specificClassId ? [specificClassId] : Object.keys(roster);
            const entries=keys.flatMap(classId => (roster[classId] || []).map(name=>({classId,name})));
            for (let i=0;i<entries.length;i+=200) {
                await this.api('/admin/students',{method:'POST',body:JSON.stringify({entries:entries.slice(i,i+200)})});
            }
            await this.loadRoster();
        },
        async addNewStudent() {
            if (!this.isTeacherAuthenticated) return;
            const name=this.newStudent.name.trim(); const classId=this.newStudent.classId;
            if (!name || name.length>100 || !this.classesList.some(c=>c.id===classId)) {
                this.showToast('Data Tidak Valid','Pilih kelas dan isi nama maksimal 100 karakter.','error'); return;
            }
            if ((this.studentsRoster[classId] || []).some(n=>n.toLocaleLowerCase('id-ID')===name.toLocaleLowerCase('id-ID'))) {
                this.showToast('Nama Sudah Ada','Nama itu sudah ada dalam kelas ini.','error'); return;
            }
            try {
                await this.api('/admin/students',{method:'POST',body:JSON.stringify({entries:[{classId,name}]})});
                await this.loadRoster();
                this.newStudent.name=''; this.showAddStudentModal=false;
                this.showToast('Siswa Ditambahkan','Nama siswa tersimpan di Cloudflare D1.','success');
            } catch(e) {this.showToast('Gagal Menambah',e.message,'error');}
        },
        async importRosterFromCSV() {
            if (!this.isTeacherAuthenticated || !this.importCSVText.trim()) {
                this.showToast('CSV Kosong','Masukkan daftar siswa terlebih dahulu.','error'); return;
            }
            const draft=Object.fromEntries(Object.entries(this.studentsRoster).map(([id,names])=>[id,[...names]]));
            let count=0;
            try {
                const lines=this.importCSVText.replace(/^\ufeff/,'').split(/\r?\n/);
                for (const line of lines) {
                    if (!line.trim()) continue;
                    const cells=parseRosterCsvRow(line);
                    if (cells.length!==2) throw new Error('CSV harus memiliki dua kolom: Kelas, Nama Murid.');
                    const [rawClass,rawName]=cells;
                    if (/^kelas$/i.test(rawClass) && /^nama murid$/i.test(rawName)) continue;
                    const classId=classIdFromCsv(rawClass), name=rawName.trim();
                    if (!classId || !name || name.length>100) throw new Error('Baris CSV tidak valid: '+line.slice(0,60));
                    if (!draft[classId]) draft[classId]=[];
                    if (!draft[classId].some(n=>n.toLocaleLowerCase('id-ID')===name.toLocaleLowerCase('id-ID'))) {
                        draft[classId].push(name); count++;
                    }
                }
                if (!count) throw new Error('Semua siswa sudah ada atau CSV kosong.');
                await this.saveRosterToCloud(null,draft);
                this.importCSVText=''; this.showRosterModal=false;
                this.showToast('Impor Berhasil',`${count} siswa baru dikirim ke Cloudflare D1.`,'success');
            } catch(e) {this.showToast('Impor Gagal',e.message,'error');}
        },
        updateTime() {
            const now=new Date();
            this.currentDateString=new Intl.DateTimeFormat('id-ID',{timeZone:SCHOOL_TZ,weekday:'long',year:'numeric',month:'long',day:'numeric'}).format(now);
            this.currentTimeString=new Intl.DateTimeFormat('id-ID',{timeZone:SCHOOL_TZ,hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(now)+' WIT';
            const today=witDateKey(now);
            if (!this._lastWitDate) this._lastWitDate=today;
            if (today!==this._lastWitDate) {
                this._lastWitDate=today; this.teacherFilters.date=today;
                this.checkedAttendance={key:'',submitted:false,timestamp:null};
                if (this.isTeacherAuthenticated) this.loadAttendance();
            }
        },
        switchTab(tab) {
            if (tab==='teacher' && !this.isTeacherAuthenticated) {this.openTeacherAuthModal();return;}
            this.activeTab=tab; this.redrawIcons();
        },
        openTeacherAuthModal() {
            if (this.isTeacherAuthenticated) {this.switchTab('teacher');return;}
            this.inputPassword=''; this.authError=false; this.showAuthModal=true; this.redrawIcons();
        },
        async verifyTeacherPassword() {
            if (this.isTeacherLoginPending) return;
            if (!this.teacherUsername.trim()) {this.authError=true;return;}
            this.isTeacherLoginPending=true;
            try {
                await this.api('/admin/login',{method:'POST',body:JSON.stringify({username:this.teacherUsername.trim(),password:this.inputPassword})});
                this.isTeacherAuthenticated=true; this.authError=false; this.inputPassword='';
                this.showAuthModal=false; this.activeTab='teacher';
                await this.loadRoster(); await this.loadAttendance();
                this.showToast('Login Berhasil','Selamat datang di Portal Guru.','success');
            } catch(e) {
                console.error('Login guru:',e);
                this.authError=true; this.isTeacherAuthenticated=false;
                this.showToast('Login Gagal',e.message,'error');
            } finally {this.isTeacherLoginPending=false;}
        },
        async logoutTeacher() {
            try {await this.api('/admin/logout',{method:'POST'});} catch(e) {console.error(e);}
            this.isTeacherAuthenticated=false; this.attendanceRecords=[];
            this.isRosterUnlocked=false; this.studentsRoster={}; this.studentLink='';sessionStorage.removeItem('smp6_class_link');
            this.showShareModal=false;this.shareLinks=[];
            this.studentForm.studentName=''; this.checkedAttendance={key:'',submitted:false,timestamp:null};
            this.activeTab='student'; this.showToast('Keluar Portal','Sesi guru sudah ditutup.','success');
        },
        onClassChange() {
            this.studentForm.studentName=''; this.checkedAttendance={key:'',submitted:false,timestamp:null};
        },
        checkAlreadySubmitted(name) {
            if (!name || !this.studentForm.classId) return false;
            return this.checkedAttendance.key===attendanceId(witDateKey(),this.studentForm.classId,name) && this.checkedAttendance.submitted;
        },
        getStudentTodayRecord(name) {
            if (this.checkAlreadySubmitted(name)) return {timestamp:this.checkedAttendance.timestamp};
            return null;
        },
        async checkDuplicateAttendance() {
            const name=this.studentForm.studentName;
            const classId=this.studentForm.classId;
            this.checkedAttendance={key:'',submitted:false,timestamp:null};
            if (!this.isRosterUnlocked || !name || !classId) return;
            const key=attendanceId(witDateKey(),classId,name);
            this.isCheckingAttendance=true;
            try {
                const result=await this.api('/check?classId='+encodeURIComponent(classId)+'&studentName='+encodeURIComponent(name));
                if (this.studentForm.studentName===name && this.studentForm.classId===classId && key.startsWith(witDateKey())) {
                    this.checkedAttendance={key,submitted:result.submitted,timestamp:result.timestamp};
                }
            } catch(e) {this.showToast('Pemeriksaan Gagal',e.message,'error');}
            finally {this.isCheckingAttendance=false;this.redrawIcons();}
        },
        downloadExcelTemplate() {
            saveCsv('Template_Roster_SMPN6.csv',[
                ['Kelas','Nama Murid'],['Kelas VII-A','Contoh Siswa Satu'],
                ['Kelas VII-A','Contoh Siswa Dua'],['Kelas VIII-B','Contoh Siswa Tiga']
            ]);
            this.showToast('Template Siap','File CSV template dibuat.','success');
        },
        exportClassExcel() {
            if (!this.isTeacherAuthenticated) return;
            const selectedClass=this.exportClassId;
            const filtered=this.attendanceRecords.filter(r=>(selectedClass==='ALL'||r.classId===selectedClass)&&
                (!this.teacherFilters.date||r.attendanceDate===this.teacherFilters.date));
            if (!filtered.length) {this.showToast('Tidak Ada Data','Tidak ada absensi pada tanggal yang dipilih.','error');return;}
            const rows=[['No','Hari','Tanggal','Bulan','Tahun','Jam (WIT)','Nama Murid','Kelas','Status Kehadiran','Catatan']];
            filtered.forEach((r,i)=>{
                const d=new Date(r.timestamp);
                const parts=Object.fromEntries(new Intl.DateTimeFormat('id-ID',{
                    timeZone:SCHOOL_TZ,weekday:'long',day:'numeric',month:'long',year:'numeric'
                }).formatToParts(d).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
                const time=new Intl.DateTimeFormat('id-ID',{
                    timeZone:SCHOOL_TZ,hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false
                }).format(d);
                rows.push([i+1,parts.weekday,parts.day,parts.month,parts.year,time,r.studentName,this.getClassName(r.classId),r.status,r.notes||'-']);
            });
            const date=this.teacherFilters.date||'semua-tanggal';
            saveCsv(`Rekap_Absen_PKn_${selectedClass}_${date}.csv`,rows);
            this.showExportModal=false; this.showToast('Ekspor Berhasil','Rekap CSV sudah dibuat.','success');
        },
        getClassName(classId) {return this.classesList.find(c=>c.id===classId)?.name||classId;},
        formatTime(value) {
            if (!value) return '-';
            const d=new Date(value);
            return Number.isNaN(d.getTime())?'-':new Intl.DateTimeFormat('id-ID',{
                timeZone:SCHOOL_TZ,hour:'2-digit',minute:'2-digit',hour12:false
            }).format(d)+' WIT';
        },
        showToast(title,message,type='success') {
            this.toast={show:true,title,message,type}; this.redrawIcons();
            if (this._toastTimer) clearTimeout(this._toastTimer);
            this._toastTimer=setTimeout(()=>{this.toast.show=false;},4000);
        }
    };
}