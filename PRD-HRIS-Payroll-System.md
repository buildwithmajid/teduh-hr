# Product Requirements Document (PRD)
# Sistem HRIS & Payroll Management

**Versi:** 1.1
**Tanggal:** 17 November 2026
**Status:** Draft — Portfolio Project

**Dokumen terkait:** [ERD-Sistem-HRIS.md](ERD-Sistem-HRIS.md) (sumber kebenaran skema database), [Payroll-Calculation-Engine-Detail.md](Payroll-Calculation-Engine-Detail.md) (sumber kebenaran rumus payroll).

> **Perubahan v1.1:** audit trail dan approval workflow masuk MVP; aturan bisnis cuti, lembur, potongan, dan koreksi payroll diperjelas; persyaratan keamanan & UU PDP ditambahkan; skema database di PRD diganti rujukan ke ERD; estimasi roadmap disesuaikan.

---

## 1. Latar Belakang & Tujuan

### 1.1 Latar Belakang
Perusahaan skala kecil-menengah di Indonesia sering masih mengelola data karyawan, absensi, dan penggajian secara manual (Excel/spreadsheet), yang rawan human error, sulit diaudit, dan tidak scalable. Sistem HRIS (Human Resource Information System) yang terintegrasi dibutuhkan untuk mengotomatisasi proses HR dari absensi hingga penggajian dengan perhitungan yang taat aturan perpajakan dan ketenagakerjaan Indonesia.

### 1.2 Tujuan Produk
- Mengotomatisasi pencatatan absensi karyawan secara akurat, dengan deteksi anomali (lokasi, device) untuk mempersulit manipulasi.
- Menghitung gaji otomatis termasuk PPh 21, BPJS Kesehatan, BPJS Ketenagakerjaan, lembur, dan potongan lain.
- Menyediakan alur approval berjenjang untuk pengajuan cuti, izin, dan reimbursement.
- Memberikan visibilitas data HR melalui dashboard dan laporan.
- Menjadi portfolio project yang menunjukkan kemampuan menangani business logic kompleks, bukan sekadar CRUD.

### 1.3 Target Pengguna (Persona)
| Persona | Kebutuhan Utama |
|---|---|
| **Staff/Karyawan** | Absen mudah, ajukan cuti, lihat slip gaji |
| **Manager/Atasan Langsung** | Approve pengajuan tim, lihat kehadiran tim |
| **HR Admin** | Kelola data karyawan, proses payroll, atur kebijakan |
| **Finance** | Verifikasi payroll sebelum disbursement, lihat laporan biaya |
| **Super Admin** | Kelola konfigurasi sistem, role, dan akses |

---

## 2. Scope Produk

### 2.1 In-Scope (MVP)
1. Manajemen data karyawan (employee master data)
2. Absensi (clock-in/out dengan validasi lokasi, jadwal shift)
3. Pengajuan & approval cuti/izin/lembur dengan approval workflow generik multi-level
4. Perhitungan payroll otomatis (gaji pokok, tunjangan, lembur, potongan, PPh 21, BPJS), termasuk rekonsiliasi PPh 21 masa pajak terakhir
5. Slip gaji digital (PDF)
6. Role-based access control (RBAC) dengan MFA untuk role HR/Finance/Super Admin
7. Audit trail untuk data gaji, data pribadi, dan approval
8. Dashboard ringkasan per role

### 2.2 In-Scope (Advanced/Fase 5)
1. Perhitungan THR otomatis (run off-cycle)
2. Reimbursement/expense claim dengan approval
3. Notifikasi email/WhatsApp untuk approval & slip gaji (notifikasi in-app sudah ada di MVP)
4. Export laporan payroll ke format perbankan (untuk transfer massal)
5. Export data PPh 21 untuk e-Bupot (SPT Masa & bukti potong 1721-A1)
6. Performance review sederhana (KPI/OKR tracking) — opsional, paling akhir

### 2.3 Out-of-Scope
- Recruitment/ATS (applicant tracking system)
- Modul training & learning management
- Integrasi payroll disbursement langsung ke bank (real API, cukup export file)
- Pelaporan langsung ke API DJP/BPJS (cukup export file)
- Perhitungan pesangon otomatis (final settlement dicatat manual sebagai komponen run `final_settlement`)
- Aplikasi mobile native (cukup web responsive)

---

## 3. User Stories & Fitur Detail

### 3.1 Modul Employee Management
- Sebagai HR Admin, saya bisa menambah/edit/menonaktifkan data karyawan (data pribadi, jabatan, departemen, tipe kontrak, tanggal mulai kerja, tanggal akhir kontrak/probation, gaji pokok, tunjangan, status PTKP).
- Sebagai HR Admin, saya bisa mengatur struktur organisasi (departemen, kepala departemen, jabatan, atasan langsung).
- Sistem menyimpan riwayat perubahan data karyawan dengan tanggal efektif (histori jabatan/gaji/PTKP), dan perubahan gaji di tengah bulan diprorata per segmen.
- Sistem mengingatkan HR 30 hari sebelum kontrak PKWT atau masa probation berakhir.
- Perubahan status PTKP di tengah tahun berlaku untuk perhitungan pajak tahun berikutnya (status PTKP mengikuti kondisi 1 Januari).

### 3.2 Modul Absensi
- Sebagai Karyawan, saya bisa clock-in/out melalui web dengan validasi geolocation (radius lokasi kerja) dan/atau foto selfie.
- Sebagai Karyawan, saya bisa mengajukan koreksi lupa absen dengan alasan, menunggu approval atasan.
- Sebagai Karyawan, saya bisa mengajukan lembur (jam mulai–selesai, alasan) untuk di-approve; hanya lembur yang di-approve yang dibayar.
- Sistem otomatis menandai status: hadir, terlambat, alpha, cuti, cuti setengah hari, izin, sakit, libur, hari istirahat.
- Sebagai HR Admin, saya bisa mengatur shift, jadwal shift bergilir, toleransi keterlambatan, lokasi kerja & radiusnya, serta pola kerja 5/6 hari.

**Edge case penting:**
- Geolocation di browser bisa dipalsukan (mock GPS). Sistem tidak mengklaim anti-manipulasi penuh: clock-in di luar radius, dari device baru, atau dengan pola mencurigakan ditandai sebagai anomali untuk direview HR, bukan langsung ditolak.
- Shift malam yang melewati tengah malam dicatat pada tanggal mulai shift.
- Kantor di zona waktu berbeda (WIB/WITA/WIT) memakai zona waktu lokasi kerja untuk menentukan tanggal & keterlambatan.
- Libur nasional & cuti bersama otomatis dari kalender; cuti bersama dapat dikonfigurasi memotong saldo cuti tahunan.
- Lembur hari kerja dibatasi maksimal 4 jam/hari dan 18 jam/minggu (PP 35/2021); pengajuan yang melebihi ditolak.

**Privasi (UU PDP — UU 27/2022):**
- Karyawan memberi persetujuan eksplisit sebelum lokasi dan foto dikumpulkan.
- Foto & lokasi hanya dapat dilihat oleh karyawan itu sendiri, atasan langsung, dan HR; disimpan di storage privat dan dihapus otomatis setelah masa retensi yang dikonfigurasi.

### 3.3 Modul Cuti & Izin
- Sebagai Karyawan, saya bisa mengajukan cuti (tahunan, sakit, melahirkan, dll), termasuk cuti setengah hari jika jenis cutinya mengizinkan, dengan saldo cuti otomatis terpotong setelah approve.
- Sebagai Karyawan, saya bisa membatalkan pengajuan; jika sudah di-approve dan belum lewat, saldo dikembalikan.
- Sebagai Manager, saya bisa approve/reject pengajuan dengan catatan.
- Sistem menghitung saldo cuti tahunan otomatis. Hak cuti tahunan mengikuti masa kerja minimal (default 12 bulan sesuai UU Ketenagakerjaan); pemberian prorata untuk karyawan baru adalah kebijakan perusahaan yang bisa diaktifkan.
- Sisa saldo dapat dibawa ke tahun berikutnya sampai batas & masa berlaku yang dikonfigurasi per jenis cuti.
- Sistem menolak pengajuan yang tumpang-tindih dengan pengajuan lain, dan menghitung jumlah hari tanpa hari libur & hari istirahat.
- Cuti yang melewati pergantian tahun memotong saldo masing-masing tahun.
- Jenis cuti bisa dibatasi berdasarkan jenis kelamin (misal cuti melahirkan) dan mewajibkan lampiran (misal surat dokter).
- Cuti tidak dibayar diteruskan ke payroll sebagai potongan.
- Sebagai HR Admin, saya bisa override saldo cuti secara manual dengan alasan tercatat.

### 3.4 Modul Payroll (Core — paling kompleks)
- Sebagai HR Admin, saya bisa menjalankan proses payroll bulanan untuk semua karyawan sekaligus atau per individu.
- Komponen perhitungan (rumus lengkap di dokumen Payroll Engine):
  - **Gaji Pokok**: prorata jika karyawan masuk/keluar atau gajinya berubah di tengah periode (metode hari kerja atau hari kalender, dikonfigurasi).
  - **Tunjangan tetap** (misal jabatan, transport tetap) dan **tunjangan tidak tetap** (misal uang makan per hari hadir), dikelola sebagai komponen gaji per karyawan.
  - **Lembur**: sesuai PP 35/2021 — upah per jam = (gaji pokok + tunjangan tetap) ÷ 173; hari kerja 1,5× jam pertama dan 2× jam berikutnya; hari libur mengikuti pola kerja 5/6 hari. Multiplier disimpan di tabel konfigurasi.
  - **BPJS**: dasar iuran = gaji pokok + tunjangan tetap (tanpa lembur/bonus). Kesehatan 1% karyawan / 4% perusahaan (batas atas & bawah), Ketenagakerjaan JHT, JKK, JKM, JP sesuai rate berlaku.
  - **PPh 21**: skema TER bulanan; bruto pajak mencakup premi JKK, JKM, dan BPJS Kesehatan yang dibayar perusahaan. Di masa pajak terakhir (Desember atau bulan terakhir bekerja) direkonsiliasi dengan tarif Pasal 17; kelebihan potong dikembalikan ke karyawan.
  - **Potongan lain**: kasbon, cicilan pinjaman, alpha, cuti tidak dibayar. Total potongan dibatasi sesuai PP 36/2021; cicilan yang melebihi batas digeser ke bulan berikutnya, dan gaji bersih tidak boleh negatif.
- Selain run reguler bulanan, HR bisa membuat run **THR/bonus**, **koreksi**, dan **final settlement** (karyawan keluar).
- Sebagai Finance, saya bisa mereview & approve batch payroll sebelum dikunci. User yang memproses payroll tidak boleh menjadi approver-nya (separation of duties).
- Sebagai Karyawan, saya bisa mengunduh slip gaji (PDF) setelah payroll di-approve.
- Sistem menyimpan histori payroll per run. Run yang sudah dikunci tidak bisa diubah (dijaga di level database); kesalahan diperbaiki lewat run koreksi yang mencatat selisihnya.
- Sistem menyimpan akumulasi pajak setahun per karyawan (termasuk bukti potong dari pemberi kerja sebelumnya untuk karyawan yang masuk di tengah tahun) sebagai dasar rekonsiliasi dan laporan pajak.

**Catatan teknis penting:** Perhitungan PPh 21, BPJS, dan lembur dibuat sebagai *rule engine* murni yang terpisah. Semua tarif disimpan di tabel database dengan tanggal berlaku (bukan di kode), dan engine memilih tarif berdasarkan tanggal periode payroll.

### 3.5 Modul Approval Workflow (Generik)
- Approval workflow dibuat generik (reusable) untuk cuti, koreksi absensi, lembur, reimbursement, dan payroll — dengan konfigurasi jumlah level approval per jenis pengajuan (misal staff → manager → HR → finance).
- Approver per level bisa berupa atasan langsung, kepala departemen, atau role tertentu.
- Sebagai Manager, saya menerima notifikasi setiap ada pengajuan baru yang perlu diapprove.
- Sebagai Manager, saya bisa mendelegasikan approval ke orang lain selama periode tertentu (misal saat cuti).
- Jika approver tidak ada (karyawan tanpa atasan, kepala departemen kosong) atau approver adalah pemohon sendiri, pengajuan dialihkan ke role fallback.
- Pengajuan yang tidak direspons dalam batas waktu yang dikonfigurasi dieskalasi ke role fallback.
- Perubahan konfigurasi workflow tidak memengaruhi pengajuan yang sedang berjalan (workflow diberi versi).

### 3.6 Modul Dashboard & Laporan
- Dashboard HR Admin: jumlah karyawan aktif, tingkat kehadiran, pengajuan pending, biaya payroll bulan berjalan.
- Dashboard Karyawan: ringkasan kehadiran, saldo cuti, slip gaji terakhir.
- Laporan: rekap absensi per periode, rekap payroll per departemen, rekap iuran BPJS per program, laporan PPh 21 bulanan & bukti potong tahunan (format siap diimpor ke e-Bupot).

---

## 4. Non-Functional Requirements

| Kategori | Requirement |
|---|---|
| **Keamanan** | Kolom sensitif (NIK, rekening, gaji) dienkripsi di level aplikasi dengan kunci di secret manager; RBAC multi-role; MFA wajib untuk HR Admin, Finance, Super Admin; rate limiting login; file (slip, foto, kuitansi) di storage privat dan diakses lewat signed URL berumur pendek |
| **Privasi** | Patuh UU PDP: persetujuan untuk data lokasi & foto, akses minimum, retensi & penghapusan otomatis, karyawan bisa melihat data pribadinya |
| **Integritas data** | Uang disimpan sebagai integer rupiah; payroll yang dikunci dilindungi trigger database; payroll batch idempoten (bisa dijalankan ulang selama masih draft) |
| **Performa** | Proses payroll batch untuk 500 karyawan selesai < 30 detik (rate dimuat sekali per run, bukan per karyawan) |
| **Skalabilitas** | Arsitektur modular agar mudah ditambah modul baru; semua data dipisah per `company_id` |
| **Ketersediaan** | Uptime 99% (untuk keperluan demo/portfolio, cukup deployment stabil di cloud) |
| **Kompatibilitas** | Responsive — bisa diakses via mobile browser untuk absensi lapangan; mendukung zona waktu WIB/WITA/WIT |
| **Auditability** | Semua perubahan data gaji, data pribadi, rate, dan approval tercatat (siapa, kapan, apa yang diubah) di audit log append-only; akses/ekspor data sensitif juga dicatat |

---

## 5. Rancangan Teknis (Rekomendasi)

### 5.1 Tech Stack
- **Frontend:** Next.js (React) + TailwindCSS
- **Backend:** Node.js (NestJS) — cocok untuk modular architecture dengan dependency injection
- **Database:** PostgreSQL + PostGIS (relasional, cocok untuk data finansial yang butuh konsistensi/transaction)
- **Perhitungan uang:** integer rupiah / `decimal.js`, bukan floating point
- **Cache/Queue:** Redis + BullMQ (job proses payroll per karyawan & notifikasi async)
- **Auth:** access token JWT berumur pendek + refresh token dengan rotasi (disimpan di cookie httpOnly), MFA TOTP, RBAC berbasis permission
- **File storage:** S3-compatible (untuk slip gaji PDF, foto absensi)
- **Deployment:** Docker + CI/CD (GitHub Actions) ke VPS/cloud (Railway, Render, atau VPS sendiri)

### 5.2 Arsitektur
Disarankan **modular monolith** (bukan microservices penuh) — cukup untuk portfolio, tapi tetap menunjukkan pemisahan concern yang baik:
```
/modules
  /employee
  /attendance
  /leave
  /payroll        (engine murni + rate repository)
  /approval-workflow (generic/reusable)
  /notification
  /reporting
  /audit
```

### 5.3 Skema Database
Skema lengkap ada di [ERD-Sistem-HRIS.md](ERD-Sistem-HRIS.md) dan menjadi satu-satunya acuan. Entitas utamanya: `employees`, `employee_salary_components`, `shift_schedules`, `attendance`, `leave_requests`, `leave_balances`, `overtime_entries`, `employee_loans`, `payroll_periods`, `payroll_details`, `payroll_components`, `tax_year_summaries`, tabel rate (`ter_rates`, `ptkp_rates`, `bpjs_rates`, `overtime_rules`), `approval_workflows`, `approval_steps`, `approval_logs`, dan `audit_logs`.

---

## 6. Roadmap Pengerjaan (untuk Portfolio)

| Fase | Fitur | Estimasi Waktu |
|---|---|---|
| **Fase 1 (MVP)** | Auth + RBAC + MFA, audit log, enkripsi kolom, employee mgmt & komponen gaji, organisasi | 3-4 minggu |
| **Fase 2** | Absensi (shift, jadwal, geofence, koreksi), approval workflow generik, cuti, lembur | 3-4 minggu |
| **Fase 3** | Payroll engine (prorata, lembur, BPJS, PPh 21 TER + rekonsiliasi, potongan) + golden test | 4-5 minggu (paling kompleks) |
| **Fase 4** | Run payroll batch, approval & lock, slip gaji PDF, dashboard, laporan | 2-3 minggu |
| **Fase 5 (Advanced)** | THR, reimbursement, notifikasi email/WA, export bank & e-Bupot | 2-3 minggu |

Total realistis untuk dikerjakan sendiri: ±14–19 minggu. Jika waktu terbatas, potong scope Fase 5 dan fitur opsional (shift bergilir, delegasi approval), bukan audit log atau test payroll.

---

## 7. Metrik Keberhasilan (untuk Konteks Portfolio)
- Sistem bisa memproses payroll untuk data dummy 50-100 karyawan tanpa error perhitungan.
- Ada golden test untuk prorata, lembur, BPJS, PPh 21 (TER & rekonsiliasi) yang hasilnya cocok dengan kalkulator resmi DJP/BPJS atau perhitungan manual yang sudah diverifikasi.
- Ada dokumentasi arsitektur (README + diagram) yang menjelaskan keputusan desain.
- Ada demo video/link live deployment yang bisa diakses recruiter.

---

## 8. Risiko & Mitigasi

| Risiko | Mitigasi |
|---|---|
| Aturan pajak/BPJS berubah tiap tahun | Buat rule engine terpisah/configurable, bukan hardcoded |
| Scope terlalu besar untuk dikerjakan sendiri | Prioritaskan MVP dulu, fitur advance opsional |
| Kompleksitas perhitungan payroll salah | Buat unit test dengan kasus perhitungan manual sebagai baseline |
| Data sensitif (gaji) bocor | Enkripsi kolom, MFA, RBAC, signed URL, dan audit log diterapkan di Fase 1 |
| Geolocation absensi dipalsukan | Tandai anomali untuk review HR, kombinasikan dengan selfie & device fingerprint; tidak mengklaim anti-manipulasi penuh |
| Kesalahan payroll ditemukan setelah dikunci | Run koreksi yang mencatat selisih, bukan mengedit data yang sudah dikunci |
| Pelanggaran UU PDP (data lokasi & foto) | Persetujuan eksplisit, akses minimum, retensi & penghapusan otomatis |

---

## 9. Lampiran: Referensi Perhitungan Indonesia
- **PPh 21** (PP 58/2023, PMK 168/2023): skema TER (Tarif Efektif Rata-rata) bulanan berdasarkan kategori A/B/C dari status PTKP; rekonsiliasi tarif Pasal 17 di masa pajak terakhir. Bruto pajak termasuk premi JKK, JKM, dan BPJS Kesehatan yang dibayar perusahaan; iuran JHT & JP karyawan menjadi pengurang penghasilan netto.
- **BPJS Kesehatan**: 5% dari upah (gaji pokok + tunjangan tetap) — 4% perusahaan, 1% karyawan — dengan batas atas Rp12 juta dan batas bawah UMK.
- **BPJS Ketenagakerjaan**: dasar upah sama dengan BPJS Kesehatan. JHT (3,7% perusahaan + 2% karyawan), JKK (0,24%–1,74% sesuai kelas risiko), JKM (0,3%), JP (2% perusahaan + 1% karyawan, dengan batas upah yang disesuaikan berkala).
- **Lembur** (PP 35/2021): upah per jam = upah sebulan ÷ 173; batas 4 jam/hari dan 18 jam/minggu.
- **Potongan upah** (PP 36/2021): total potongan dibatasi persentase tertentu dari upah.

*Catatan: Persentase di atas bisa berubah sesuai regulasi terbaru — pastikan cek sumber resmi (BPJS, DJP) saat implementasi aktual, dan jangan hardcode angka ini di kode utama.*
