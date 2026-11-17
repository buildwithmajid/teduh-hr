# Payroll Calculation Engine — Spesifikasi Teknis Detail
## Dokumen Pendamping PRD Sistem HRIS

**Versi:** 1.1
**Tanggal:** 17 November 2026
**Referensi regulasi:** PP 58/2023 & PMK 168/2023 (PPh 21 skema TER), PP 35/2021 (lembur), PP 36/2021 (pengupahan), ketentuan BPJS Kesehatan & Ketenagakerjaan

> ⚠️ **Catatan penting:** Semua persentase & batas nominal di dokumen ini adalah nilai saat dokumen dibuat dan **bisa berubah sewaktu-waktu**. Implementasi menyimpan nilai ini sebagai **data konfigurasi di database** (tabel `ter_rates`, `ptkp_rates`, `bpjs_rates`, `overtime_rules`, `company_settings` — lihat ERD), bukan di kode program. Setiap angka di sini wajib diverifikasi ke sumber resmi (DJP, BPJS, Kemnaker) sebelum dipakai sebagai baseline test.

### Riwayat perubahan v1.1
- Dasar iuran BPJS = upah (gaji pokok + tunjangan tetap), **tanpa lembur**.
- Penghasilan bruto PPh 21 kini memasukkan premi JKK, JKM, dan BPJS Kesehatan yang dibayar perusahaan.
- Rekonsiliasi masa pajak terakhir: pengurang iuran JHT/JP karyawan, biaya jabatan prorata per bulan kerja, pembulatan PKP, dan penanganan lebih bayar.
- Lookup tarif memakai tanggal periode payroll, bukan `CURRENT_DATE`; tarif tidak ditemukan → error.
- Lembur mengikuti PP 35/2021, dasar upah termasuk tunjangan tetap, pola kerja 5/6 hari, multiplier dari tabel `overtime_rules`.
- Engine murni (tanpa akses DB), uang dalam integer rupiah, aturan pembulatan & prorata eksplisit.
- Contoh perhitungan dihitung ulang.

---

## 1. Arsitektur Rule Engine

Modul `payroll-engine` adalah **fungsi murni**: tidak mengakses database, tidak membaca jam sistem. Semua data (karyawan, absensi, rate yang berlaku untuk periode itu) disiapkan oleh lapisan service, lalu dioper sebagai input. Ini membuat hasil hitung deterministik dan mudah diuji.

```
/payroll
  /engine                      <- murni, tanpa I/O
    /calculators
      ProrataCalculator.ts
      OvertimeCalculator.ts
      BpjsCalculator.ts
      Pph21Calculator.ts        <- TER bulanan + rekonsiliasi masa terakhir
      DeductionCalculator.ts    <- kasbon, cicilan, alpha, batas 50%
      PayrollOrchestrator.ts
    money.ts                    <- aritmetika integer rupiah & pembulatan
    types.ts
  /rates
    RateRepository.ts           <- memuat RateSet dari DB berdasarkan tanggal periode
    /seeds                      <- file JSON/SQL hanya untuk seed awal tabel rate
  /tests
    /golden                     <- kasus baseline dari kalkulator resmi
```

**Sumber kebenaran rate = tabel database.** File JSON di `/seeds` hanya dipakai untuk mengisi database pertama kali; perubahan rate berikutnya dilakukan lewat admin panel.

### 1.1 Input & output

```typescript
type Rupiah = number; // selalu integer rupiah, tidak pernah pecahan

interface PayrollInput {
  period: { start: Date; end: Date; isFinalTaxPeriod: boolean };
  employee: {
    ptkpStatus: string;           // status per 1 Januari tahun pajak
    workPattern: '5_day' | '6_day';
    salarySegments: SalarySegment[]; // pecahan gaji per tanggal efektif (lihat §2)
    overtimeEligible: boolean;
    bpjsExtraFamilyMembers: number;
  };
  attendance: AttendanceSummary;   // hari kerja aktif, alpha, cuti tidak dibayar
  overtime: OvertimeEntry[];       // hanya yang sudah approved
  irregularIncome: IrregularIncome[]; // THR, bonus — masuk bruto bulan dibayar
  deductions: DeductionInput[];    // kasbon, cicilan pinjaman
  ytd: TaxYtd;                     // akumulasi Jan s.d. bulan lalu (untuk rekonsiliasi)
  rates: RateSet;                  // rate yang berlaku pada period.end
  policy: CompanyPolicy;           // pembulatan, metode prorata, kelas risiko JKK
}
```

Output adalah `PayrollResult` berisi daftar komponen (`earning`, `deduction`, `company_contribution`, `taxable_benefit`) — daftar inilah yang disimpan ke `payroll_components`, dan total di `payroll_details` diturunkan darinya.

### 1.2 Alur orchestrator

```
 1. Gaji pokok & tunjangan tetap prorata              → ProrataCalculator
 2. Upah (dasar BPJS & lembur) = pokok + tunjangan tetap (sebelum prorata potongan alpha)
 3. Lembur                                            → OvertimeCalculator (dasar: upah)
 4. Penghasilan tidak teratur (THR, bonus)
 5. Iuran BPJS karyawan & perusahaan                  → BpjsCalculator (dasar: upah, BUKAN bruto)
 6. Bruto PPh 21 = pokok + tunjangan + lembur + tidak teratur
                   + premi JKK + premi JKM + BPJS Kesehatan porsi perusahaan
 7. PPh 21:
      bulan biasa       → TER × bruto PPh 21
      masa pajak akhir  → rekonsiliasi Pasal 17 (bisa kurang bayar atau lebih bayar)
 8. Potongan lain (kasbon, cicilan, alpha) dengan batas maksimal         → DeductionCalculator
 9. Take-home pay = pokok + tunjangan + lembur + tidak teratur
                   − BPJS karyawan − PPh 21 (+ refund lebih bayar) − potongan lain
```

Premi JKK, JKM, dan BPJS Kesehatan porsi perusahaan **menambah bruto pajak** tetapi **tidak dibayarkan tunai**, jadi tidak masuk take-home pay. Porsi perusahaan JHT dan JP **tidak** termasuk bruto PPh 21.

### 1.3 Aturan uang & pembulatan
- Semua nominal disimpan sebagai integer rupiah (`BIGINT` / `DECIMAL(15,0)`), dihitung dengan integer atau library desimal (`decimal.js`), **bukan** floating point.
- Hasil antara (upah per jam, hasil kali persen) tidak dibulatkan; pembulatan hanya dilakukan sekali per komponen akhir.
- Mode pembulatan (`round_half_up`, `floor`, `ceil`) diambil dari `company_settings.rounding_mode`. Default `round_half_up`.

---

## 2. Prorata Gaji

Metode dikonfigurasi di `company_settings.prorata_method`:

| Metode | Rumus |
|---|---|
| `working_days` (default) | gaji × hari kerja aktif ÷ hari kerja dalam periode |
| `calendar_days` | gaji × hari kalender aktif ÷ jumlah hari kalender periode |

- **Hari aktif** = hari antara `join_date` / awal periode dan `resign_date` / akhir periode.
- **Perubahan gaji di tengah periode**: riwayat di `employee_history` (dengan `effective_date`) dipecah menjadi `salarySegments`; tiap segmen diprorata terpisah lalu dijumlahkan.
- **Alpha & cuti tidak dibayar** dipotong dengan rumus yang sama (gaji × hari alpha ÷ hari kerja periode) sebagai komponen potongan terpisah. Hari yang sudah dikeluarkan lewat prorata masuk/keluar **tidak** dihitung lagi sebagai alpha, supaya tidak terpotong dua kali.

---

## 3. Perhitungan Lembur (Overtime)

Berdasarkan PP 35/2021 (menggantikan Kepmenaker 102/2004).

**Dasar perhitungan:** upah per jam = upah sebulan ÷ 173, dengan upah sebulan = gaji pokok + tunjangan tetap.
Jika komponen upah juga mencakup tunjangan tidak tetap dan (pokok + tunjangan tetap) < 75% dari total upah, dasar dipakai 75% dari total upah.

**Hari kerja biasa (semua pola):**

| Jam lembur | Multiplier |
|---|---|
| Jam ke-1 | 1,5× |
| Jam ke-2 dst | 2× |

**Hari istirahat mingguan / libur resmi:**

| Pola | 2× | 3× | 4× |
|---|---|---|---|
| 5 hari kerja | jam ke-1 s.d. 8 | jam ke-9 | jam ke-10 s.d. 12 |
| 6 hari kerja | jam ke-1 s.d. 7 | jam ke-8 | jam ke-9 s.d. 11 |
| 6 hari kerja, libur jatuh di hari kerja terpendek | jam ke-1 s.d. 5 | jam ke-6 | jam ke-7 s.d. 9 |

Semua baris tabel di atas disimpan di `overtime_rules` (kolom `work_pattern`, `day_type`, `hour_from`, `hour_to`, `multiplier`) — kalkulator **tidak** menyimpan multiplier sendiri.

**Validasi wajib:**
- Lembur hari kerja maksimal **4 jam/hari dan 18 jam/minggu** (tidak termasuk lembur di hari istirahat/libur). Entri yang melebihi batas ditolak saat pengajuan.
- Karyawan dengan `overtime_eligible = false` (jabatan tertentu yang dikecualikan sesuai kebijakan & regulasi) tidak dihitung lemburnya.
- Hanya `overtime_entries` dengan status `approved` yang masuk perhitungan.

```typescript
function calculateOvertime(
  upahBulanan: Rupiah,
  entries: OvertimeEntry[],
  rules: OvertimeRule[],          // dari RateSet, sudah difilter work_pattern karyawan
  round: RoundingFn,
): Rupiah {
  const upahPerJam = upahBulanan / 173; // tidak dibulatkan
  let total = 0;

  for (const entry of entries) {
    const dayRules = rules
      .filter(r => r.dayType === entry.dayType)
      .sort((a, b) => a.hourFrom - b.hourFrom);

    for (const rule of dayRules) {
      // jam dalam rentang [hourFrom, hourTo], hourFrom dimulai dari 1
      const upper = rule.hourTo ?? Infinity;
      const jamDiLapisan = Math.max(0, Math.min(entry.hours, upper) - (rule.hourFrom - 1));
      total += jamDiLapisan * rule.multiplier * upahPerJam;
    }
  }

  return round(total); // dibulatkan sekali di akhir
}
```

---

## 4. Perhitungan BPJS

**Dasar iuran ("upah") = gaji pokok + tunjangan tetap.** Lembur, THR, bonus, dan tunjangan tidak tetap **tidak** termasuk.

### 4.1 BPJS Kesehatan
- Total 5%: perusahaan 4%, karyawan 1%.
- Batas atas dasar iuran: Rp12.000.000/bulan.
- Batas bawah dasar iuran: UMK/UMP setempat (`company_settings.minimum_wage`).
- Anggota keluarga tambahan (di luar 5 orang yang ditanggung) dikenakan tambahan 1% per orang, dipotong dari karyawan.

```typescript
function calculateBpjsKesehatan(upah: Rupiah, r: BpjsKesRate, extraFamily: number, round: RoundingFn) {
  const dasar = Math.min(Math.max(upah, r.wageFloor), r.wageCap);
  return {
    perusahaan: round(dasar * r.companyPct),
    karyawan:   round(dasar * r.employeePct),
    keluargaTambahan: round(dasar * r.extraFamilyPct * extraFamily),
  };
}
```

### 4.2 BPJS Ketenagakerjaan

| Program | Perusahaan | Karyawan | Batas dasar iuran | Masuk bruto PPh 21? |
|---|---|---|---|---|
| JHT | 3,7% | 2% | tidak ada | tidak |
| JKK | 0,24%–1,74% (kelas risiko I–V) | 0% | tidak ada | **ya** |
| JKM | 0,3% | 0% | tidak ada | **ya** |
| JP | 2% | 1% | ada, disesuaikan berkala | tidak |

```typescript
function calculateBpjsTk(upah: Rupiah, r: BpjsTkRates, round: RoundingFn) {
  const dasarJP = Math.min(upah, r.jp.wageCap);
  const b = {
    jhtPerusahaan: round(upah * r.jht.companyPct),
    jhtKaryawan:   round(upah * r.jht.employeePct),
    jkkPerusahaan: round(upah * r.jkk.companyPct), // rate sesuai kelas risiko perusahaan
    jkmPerusahaan: round(upah * r.jkm.companyPct),
    jpPerusahaan:  round(dasarJP * r.jp.companyPct),
    jpKaryawan:    round(dasarJP * r.jp.employeePct),
  };
  return {
    breakdown: b,
    karyawan: b.jhtKaryawan + b.jpKaryawan,
    premiKenaPajak: b.jkkPerusahaan + b.jkmPerusahaan, // ditambahkan ke bruto PPh 21
  };
}
```

Yang dipotong dari gaji karyawan: BPJS Kesehatan 1% (+ keluarga tambahan) + JHT 2% + JP 1%. Rincian per program disimpan terpisah di `payroll_details` karena dibutuhkan untuk laporan iuran ke BPJS.

---

## 5. Perhitungan PPh 21

Masa Januari s.d. sebelum masa pajak terakhir memakai **TER bulanan**. Di masa pajak terakhir (Desember, atau bulan terakhir bekerja bagi yang berhenti) PPh 21 dihitung ulang setahun dengan tarif Pasal 17.

### 5.1 Bruto PPh 21 bulanan

```
bruto_pph21 = gaji pokok (prorata) + tunjangan tetap + tunjangan tidak tetap
            + lembur + THR/bonus yang dibayar bulan ini
            + premi JKK + premi JKM + BPJS Kesehatan porsi perusahaan
```

Potongan alpha mengurangi gaji yang dibayar, sehingga bruto memakai gaji setelah potongan alpha.

### 5.2 Kategori TER

Status PTKP ditentukan **per 1 Januari** tahun pajak (perubahan status di tengah tahun berlaku tahun berikutnya).

| Kategori | Status PTKP |
|---|---|
| **TER A** | TK/0, TK/1, K/0 |
| **TER B** | TK/2, TK/3, K/1, K/2 |
| **TER C** | K/3 |

Mapping ini juga data (kolom `ter_category` di `ptkp_rates`), bukan konstanta di kode. Status yang tidak dikenali → error, bukan default.

### 5.3 Lookup tarif TER

Tarif dipilih berdasarkan **tanggal akhir periode payroll**, bukan tanggal hari ini, supaya hitung ulang periode lama memakai tarif yang berlaku saat itu. `RateRepository` memuat seluruh tabel TER versi yang berlaku sekali per run payroll (bukan satu query per karyawan).

Batas lapisan disimpan tidak tumpang-tindih: `batas_bawah` lapisan berikutnya = `batas_atas` lapisan sebelumnya + 1.

```sql
-- 1) pilih versi tabel yang berlaku pada akhir periode
SELECT MAX(berlaku_sejak) FROM ter_rates WHERE berlaku_sejak <= :period_end;

-- 2) muat semua lapisan versi itu (sekali per run, lalu di-cache di memori)
SELECT kategori, batas_bawah, batas_atas, tarif
FROM ter_rates
WHERE berlaku_sejak = :versi
ORDER BY kategori, batas_bawah;
```

```typescript
function findTerRate(table: TerRow[], kategori: TerCategory, bruto: Rupiah): number {
  const row = table.find(r =>
    r.kategori === kategori &&
    r.batasBawah <= bruto &&
    (r.batasAtas === null || bruto <= r.batasAtas));
  if (!row) {
    throw new RateNotFoundError(`TER ${kategori} untuk bruto ${bruto} tidak ditemukan`);
  }
  return row.tarif;
}

function calculatePph21Ter(bruto: Rupiah, kategori: TerCategory, table: TerRow[], round: RoundingFn): Rupiah {
  return round(bruto * findTerRate(table, kategori, bruto));
}
```

### 5.4 Penghasilan tidak teratur (THR, bonus)
Dalam skema TER, THR/bonus dijumlahkan ke bruto bulan pembayarannya, lalu tarif TER dicari dari total bruto tersebut. Karena itu THR/bonus sebaiknya diproses di run yang sama dengan gaji bulan itu, atau run off-cycle yang menghitung ulang PPh 21 bulan tersebut dari total bruto (selisih dengan yang sudah dipotong di run reguler).

### 5.5 Rekonsiliasi masa pajak terakhir

Dilakukan di Desember, atau di bulan terakhir bekerja untuk karyawan yang berhenti di tengah tahun.

**Tarif progresif Pasal 17:**

| Lapisan PKP | Tarif |
|---|---|
| s.d. Rp60.000.000 | 5% |
| > Rp60.000.000 – Rp250.000.000 | 15% |
| > Rp250.000.000 – Rp500.000.000 | 25% |
| > Rp500.000.000 – Rp5.000.000.000 | 30% |
| > Rp5.000.000.000 | 35% |

Lapisan ini juga disimpan sebagai data (`pph21_progressive_rates`).

**Langkah:**

```
bruto_setahun      = Σ bruto_pph21 Jan s.d. masa terakhir (dari tax_year_summaries + bulan ini)
                     + bruto dari pemberi kerja sebelumnya di tahun yang sama (bukti potong), jika ada
biaya_jabatan      = min(5% × bruto_setahun, Rp500.000 × jumlah_bulan_bekerja)
iuran_pengurang    = Σ JHT karyawan + Σ JP karyawan setahun
                     (+ zakat/sumbangan keagamaan wajib lewat pemberi kerja, jika ada)
netto_setahun      = bruto_setahun − biaya_jabatan − iuran_pengurang
PKP                = floor_ribuan(max(0, netto_setahun − PTKP_setahun))
pajak_setahun      = tarif_pasal_17(PKP)
sudah_dipotong     = Σ PPh 21 Jan s.d. bulan lalu (+ PPh 21 dari pemberi kerja sebelumnya)
pph21_masa_akhir   = pajak_setahun − sudah_dipotong
```

- `pph21_masa_akhir > 0` → dipotong di slip bulan terakhir.
- `pph21_masa_akhir < 0` → **lebih bayar**, dikembalikan ke karyawan bersamaan dengan pembayaran gaji masa terakhir (komponen `pph21_refund` sebagai earning). Tidak boleh dibuang dengan `max(0, …)`.
- Untuk karyawan yang bekerja kurang dari setahun, penghasilan tidak disetahunkan kecuali untuk kasus khusus yang diatur PMK 168/2023 (misalnya pegawai dari/ke luar negeri) — cek ketentuan saat implementasi.

```typescript
function calculatePph21Progresif(pkp: Rupiah, brackets: ProgressiveBracket[], round: RoundingFn): Rupiah {
  let pajak = 0;
  let batasBawah = 0;
  for (const b of brackets) {                  // terurut naik, batas terakhir = null
    if (pkp <= batasBawah) break;
    const batasAtas = b.max ?? Infinity;
    pajak += (Math.min(pkp, batasAtas) - batasBawah) * b.rate;
    batasBawah = batasAtas;
  }
  return round(pajak);
}

function reconcileFinalPeriod(i: FinalPeriodInput, rates: RateSet, round: RoundingFn) {
  const brutoSetahun = i.ytd.bruto + i.brutoBulanIni + i.previousEmployer.bruto;
  const biayaJabatan = Math.min(
    round(brutoSetahun * rates.biayaJabatan.pct),
    rates.biayaJabatan.maxPerMonth * i.monthsWorked,
  );
  const iuran = i.ytd.jhtKaryawan + i.ytd.jpKaryawan + i.jhtKaryawanBulanIni + i.jpKaryawanBulanIni;
  const netto = brutoSetahun - biayaJabatan - iuran;
  const ptkp = rates.ptkp[i.ptkpStatus];
  const pkp = Math.floor(Math.max(0, netto - ptkp) / 1000) * 1000;

  const pajakSetahun = calculatePph21Progresif(pkp, rates.progressive, round);
  const sudahDipotong = i.ytd.pph21 + i.previousEmployer.pph21;
  const selisih = pajakSetahun - sudahDipotong;

  return {
    pajakSetahun,
    sudahDipotong,
    pph21MasaAkhir: Math.max(0, selisih),
    pph21Refund: Math.max(0, -selisih),
  };
}
```

**Tabel PTKP setahun** (disimpan di `ptkp_rates`):

| Status | PTKP/tahun | Kategori TER |
|---|---|---|
| TK/0 | Rp54.000.000 | A |
| TK/1 | Rp58.500.000 | A |
| K/0 | Rp58.500.000 | A |
| TK/2 | Rp63.000.000 | B |
| K/1 | Rp63.000.000 | B |
| TK/3 | Rp67.500.000 | B |
| K/2 | Rp67.500.000 | B |
| K/3 | Rp72.000.000 | C |

---

## 6. Potongan Lain

- Sumber: `employee_loans` / `loan_installments` (kasbon, pinjaman), potongan alpha & cuti tidak dibayar (§2), denda sesuai peraturan perusahaan.
- **Batas maksimal:** total potongan upah (di luar pajak dan iuran wajib) dibatasi maksimal 50% dari upah yang dibayarkan sesuai PP 36/2021 — persentasenya disimpan di `company_settings.max_deduction_pct` dan diverifikasi ke regulasi.
- Jika total potongan melebihi batas, cicilan pinjaman yang tidak terpotong **digeser ke periode berikutnya** (status cicilan `deferred`), bukan membuat gaji bersih minus.
- Take-home pay tidak boleh negatif; jika tetap negatif setelah semua aturan, run payroll untuk karyawan itu gagal dengan error yang harus ditangani HR.

---

## 7. Contoh Perhitungan End-to-End

**Asumsi:** status K/0 (TER A), pola 5 hari kerja, bekerja penuh sebulan (tanpa alpha), gaji pokok Rp8.000.000, tunjangan tetap Rp500.000, lembur 5 jam pada hari kerja biasa, kelas risiko JKK I (0,24%), batas upah JP di atas Rp8.500.000, bukan masa pajak terakhir. Pembulatan `round_half_up` per komponen.

```
1. Upah (dasar BPJS & lembur) = 8.000.000 + 500.000 = 8.500.000

2. Upah per jam = 8.500.000 / 173 = 49.132,948... (tidak dibulatkan)
   Lembur       = (1 × 1,5 + 4 × 2) × 49.132,948... = 9,5 × 49.132,948...
                = 466.763,005... → 466.763

3. BPJS Kesehatan (dasar 8.500.000)
   Perusahaan 4% = 340.000      Karyawan 1% = 85.000

4. BPJS Ketenagakerjaan (dasar 8.500.000)
   JHT  : perusahaan 3,7% = 314.500   karyawan 2% = 170.000
   JKK  : perusahaan 0,24% = 20.400
   JKM  : perusahaan 0,3%  = 25.500
   JP   : perusahaan 2%    = 170.000  karyawan 1% = 85.000

5. Bruto PPh 21 = 8.000.000 + 500.000 + 466.763        (dibayar tunai)
                + 20.400 + 25.500 + 340.000            (premi JKK, JKM, BPJS Kes perusahaan)
                = 9.352.663

6. TER A untuk bruto 9.352.663 → tarif 2%*
   PPh 21 = 9.352.663 × 2% = 187.053,26 → 187.053

7. Take-home pay = (8.000.000 + 500.000 + 466.763)
                 − 85.000 (BPJS Kes) − 170.000 (JHT) − 85.000 (JP) − 187.053 (PPh 21)
                 = 8.966.763 − 527.053
                 = 8.439.710

   Biaya perusahaan tambahan (tidak masuk slip sebagai pendapatan tunai):
   340.000 + 314.500 + 20.400 + 25.500 + 170.000 = 870.400
```

\* Tarif 2% berasal dari lapisan TER A Rp8.550.001–Rp9.650.000 pada lampiran PP 58/2023. **Verifikasi ulang ke lampiran resmi** sebelum kasus ini dipakai sebagai golden test.

---

## 8. Rekomendasi Unit Test

Baseline diambil dari kalkulator resmi DJP/BPJS atau perhitungan manual yang sudah diverifikasi, **bukan** dari contoh ilustrasi.

```
Prorata
✓ Masuk tengah bulan → prorata sesuai metode (working_days vs calendar_days)
✓ Kenaikan gaji di tengah bulan → dua segmen diprorata terpisah
✓ Hari sebelum join_date tidak dihitung ganda sebagai alpha

Lembur
✓ Hari kerja: jam ke-1 1,5×, jam ke-2 dst 2×
✓ Hari libur pola 5 hari vs 6 hari → hasil berbeda
✓ Hari libur di hari kerja terpendek (pola 6 hari)
✓ Lembur hari kerja > 4 jam/hari atau > 18 jam/minggu → ditolak
✓ Dasar upah per jam memakai pokok + tunjangan tetap

BPJS
✓ Lembur tidak mengubah dasar iuran BPJS
✓ Upah di atas Rp12 jt → BPJS Kesehatan capped
✓ Upah di bawah UMK → BPJS Kesehatan memakai UMK
✓ Upah di atas batas JP → JP capped
✓ JKK berbeda per kelas risiko perusahaan

PPh 21
✓ Bruto PPh 21 memasukkan JKK, JKM, BPJS Kes perusahaan; tidak memasukkan JHT/JP perusahaan
✓ TER A, B, C dengan bruto sama → hasil berbeda
✓ Bruto tepat di batas lapisan TER → hanya satu lapisan yang cocok
✓ Tarif TER tidak ditemukan → error, bukan 0
✓ Hitung ulang periode lama memakai tarif versi lama
✓ THR di bulan pembayaran menaikkan lapisan TER bulan itu
✓ Rekonsiliasi Desember: JHT+JP karyawan mengurangi netto
✓ Resign bulan Juni: biaya jabatan maks 6 × Rp500.000, rekonsiliasi di Juni
✓ Rekonsiliasi lebih bayar → refund muncul di slip
✓ PKP dibulatkan ke bawah ke ribuan

Potongan
✓ Total potongan melebihi batas → cicilan digeser ke periode berikutnya
✓ Take-home pay tidak pernah negatif
```

---

## 9. Pertimbangan Desain Tambahan

- **Historisasi rate**: semua tabel rate punya `berlaku_sejak`; RateRepository memilih versi berdasarkan tanggal periode.
- **Admin panel rate**: Super Admin mengelola tabel rate lewat UI; perubahan rate tercatat di `audit_logs`.
- **Snapshot**: saat payroll dihitung, `RateSet` yang dipakai disimpan di `payroll_details.rate_snapshot`, sehingga periode yang sudah dikunci tidak berubah meski rate diperbarui.
- **Idempotensi run**: proses batch dijalankan sebagai job (queue) per karyawan; menjalankan ulang run `draft` menghapus dan menghitung ulang baris karyawan itu saja. Run yang sudah `locked` tidak bisa dihitung ulang — koreksi dilakukan lewat run `correction` (lihat ERD).
- **Kelas risiko JKK, UMK, pola kerja, metode prorata, mode pembulatan**: semuanya setting per perusahaan di `company_settings`.
