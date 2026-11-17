# HRIS & Payroll

Sistem HRIS & payroll untuk perusahaan Indonesia (portfolio project). Dokumen desain:

- [PRD-HRIS-Payroll-System.md](PRD-HRIS-Payroll-System.md) — kebutuhan produk
- [ERD-Sistem-HRIS.md](ERD-Sistem-HRIS.md) — skema database
- [Payroll-Calculation-Engine-Detail.md](Payroll-Calculation-Engine-Detail.md) — rumus payroll

## Status

| Fase | Isi | Status |
|---|---|---|
| 1 | Auth + RBAC + MFA, audit log, enkripsi kolom, organisasi, karyawan & komponen gaji | **API selesai**, UI belum |
| 2 | Absensi, approval workflow, cuti, lembur | belum |
| 3 | Payroll engine | belum |
| 4 | Run payroll, slip gaji, dashboard | belum |
| 5 | THR, reimbursement, notifikasi, export | belum |

## Struktur

```
apps/
  api/            NestJS 11 + Prisma 6 + PostgreSQL
    prisma/       schema, migrasi, seed
    src/
      audit/          audit log append-only dengan rantai hash
      auth/           login, MFA TOTP, refresh token rotation, guard RBAC
      common/         enkripsi kolom, util tanggal, validasi
      config/         validasi environment
      employees/      karyawan, riwayat, gaji pokok, komponen gaji
      organization/   perusahaan, pengaturan, departemen, jabatan, lokasi kerja
      users/          akun user & role
    test/         e2e test
```

## Menjalankan (development)

Prasyarat: Node.js 22+, Docker Desktop (atau PostgreSQL 15+ sendiri).

```bash
npm install
```

```bash
docker compose up -d
```

```bash
cd apps/api
cp .env.example .env        # sesuaikan DATABASE_URL jika tidak memakai Docker
npm run db:migrate
npm run db:seed
npm run dev
```

API berjalan di `http://localhost:3100/api` (web: `http://localhost:3001`). Cek: `GET /api/health`.

### Akun demo (dari seed)

`admin@contoh.test` (super_admin), `hr@contoh.test` (hr_admin), `finance@contoh.test`, `manager@contoh.test`, `staff@contoh.test`. Password semua akun = `SEED_DEFAULT_PASSWORD` di `.env`.

Role super_admin, hr_admin, dan finance wajib MFA: login pertama mengembalikan `mfa_setup_required` + `mfaToken`, lanjutkan ke `POST /api/auth/mfa/setup` lalu `POST /api/auth/mfa/enable` dengan kode dari aplikasi authenticator.

### Test

```bash
npm test -w @hris/api
```

```bash
npm run test:e2e -w @hris/api
```

Unit test tidak butuh database. E2E butuh database yang sudah dimigrasi & di-seed.

## Keputusan keamanan Fase 1

- **Enkripsi kolom** NIK, gaji pokok, nomor rekening, NPWP, nominal komponen gaji, riwayat gaji, dan secret MFA memakai AES-256-GCM dengan AAD per kolom. Kunci punya versi (`ENCRYPTION_KEYS`) untuk rotasi. NIK dicari lewat blind index HMAC.
- **Audit log** ditulis dalam transaksi yang sama dengan perubahan datanya, menyimpan ciphertext (bukan plaintext), dirantai hash SHA-256 (`GET /api/audit-logs/verify`), dan dijaga trigger database agar tidak bisa di-UPDATE/DELETE/TRUNCATE. Melihat data sensitif orang lain dicatat sebagai `view_sensitive`.
- **Auth**: password Argon2id, lockout 15 menit setelah 5 kali gagal, rate limit login, access token 15 menit, refresh token di cookie httpOnly dengan rotasi & deteksi pemakaian ulang.
- **RBAC**: permission dicek ulang dari database di setiap request; user hanya bisa memberi/mencabut role yang hak aksesnya tidak melebihi miliknya sendiri.
