/**
 * Seed data development: permission & role bawaan (selalu di-sync), plus satu perusahaan
 * demo realistis (PT Ruang Teduh Karya — Studio Arsitektur & Design-Build) dengan 3 wilayah
 * kerja (Jakarta, Bandung, Bali), 6 departemen, komponen gaji, 16 karyawan, dan akun login.
 *
 * Jalankan: npm run db:seed (dari apps/api). Aman dijalankan berulang.
 * Password semua akun demo = SEED_DEFAULT_PASSWORD di .env.
 */
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/auth/password';
import { PERMISSIONS, SYSTEM_ROLES } from '../src/auth/permissions';
import { loadConfig } from '../src/config/app-config';
import { CryptoContext, FieldCrypto } from '../src/common/crypto/field-crypto';

try {
  process.loadEnvFile('.env');
} catch {
  /* env dari luar */
}

const prisma = new PrismaClient();
const config = loadConfig();
const crypto = new FieldCrypto(config.encryptionKeys, config.hmacKey);
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

function daysFromToday(offsetDays: number): string {
  const dt = new Date();
  dt.setUTCDate(dt.getUTCDate() + offsetDays);
  return dt.toISOString().slice(0, 10);
}

const DEMO_COMPANY = 'PT Ruang Teduh Karya';

async function syncRbac() {
  for (const [code, description] of Object.entries(PERMISSIONS)) {
    await prisma.permission.upsert({ where: { code }, update: { description }, create: { code, description } });
  }
  const perms = await prisma.permission.findMany();
  const permId = new Map(perms.map((p) => [p.code, p.id]));

  for (const def of SYSTEM_ROLES) {
    const existing = await prisma.role.findFirst({ where: { companyId: null, name: def.name } });
    const role = existing
      ? await prisma.role.update({ where: { id: existing.id }, data: { description: def.description, requiresMfa: def.requiresMfa } })
      : await prisma.role.create({ data: { name: def.name, description: def.description, requiresMfa: def.requiresMfa } });
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: def.permissions.map((code) => ({ roleId: role.id, permissionId: permId.get(code)! })),
    });
  }
  console.log(`RBAC: ${perms.length} permission, ${SYSTEM_ROLES.length} role bawaan`);
}

async function seedDemoCompany() {
  if (await prisma.company.findFirst({ where: { name: DEMO_COMPANY } })) {
    console.log('Perusahaan demo sudah ada — dilewati');
    return;
  }
  const password = process.env.SEED_DEFAULT_PASSWORD;
  if (!password) throw new Error('SEED_DEFAULT_PASSWORD wajib diisi untuk membuat akun demo');
  const passwordHash = await hashPassword(password);
  const roles = new Map((await prisma.role.findMany({ where: { companyId: null } })).map((r) => [r.name, r.id]));

  await prisma.$transaction(async (tx) => {
    const company = await tx.company.create({
      data: {
        name: DEMO_COMPANY,
        npwp: '09.412.885.3-014.000',
        address: 'Jl. Kemang Selatan VIII No. 14, Jakarta Selatan',
        settings: {
          create: {
            riskClassJkk: 'II',
            minimumWage: 5_396_761,
            payrollCutoffDay: 25,
            payDay: 28,
          },
        },
      },
    });

    // 3 Wilayah kerja (Jakarta WIB, Bandung WIB, Bali WITA)
    const locJakarta = await tx.workLocation.create({
      data: {
        companyId: company.id,
        name: 'Studio Utama Jakarta',
        latitude: -6.2724,
        longitude: 106.8148,
        radiusMeters: 100,
        timezone: 'Asia/Jakarta',
      },
    });
    const locBandung = await tx.workLocation.create({
      data: {
        companyId: company.id,
        name: 'Workshop & Material Lab Bandung',
        latitude: -6.8726,
        longitude: 107.6194,
        radiusMeters: 150,
        timezone: 'Asia/Jakarta',
      },
    });
    const locBali = await tx.workLocation.create({
      data: {
        companyId: company.id,
        name: 'Studio Cabang Bali',
        latitude: -8.6478,
        longitude: 115.1385,
        radiusMeters: 120,
        timezone: 'Asia/Makassar',
      },
    });

    // 6 Departemen bertingkat
    const dept = async (name: string, parentDepartmentId?: string) =>
      tx.department.create({ data: { companyId: company.id, name, parentDepartmentId } });
    const direksi = await dept('Direksi');
    const studioDesain = await dept('Studio Desain', direksi.id);
    const proyek = await dept('Operasional & Proyek', direksi.id);
    const procurement = await dept('Procurement & Material', direksi.id);
    const finance = await dept('Finance & Accounting', direksi.id);
    const hr = await dept('People & Operations', direksi.id);

    // Jabatan
    const pos = (departmentId: string, title: string, level: number, overtimeEligible = true) =>
      tx.position.create({ data: { departmentId, title, level, overtimeEligible } });
    const pPrincipal = await pos(direksi.id, 'Principal Architect', 5, false);
    const pLeadArch = await pos(studioDesain.id, 'Lead Architect', 3, false);
    const pSeniorArch = await pos(studioDesain.id, 'Senior Architect', 2, true);
    const pInterior = await pos(studioDesain.id, 'Interior Designer', 2, true);
    const pJuniorArch = await pos(studioDesain.id, 'Junior Architect', 1, true);
    const pProjMgr = await pos(proyek.id, 'Project Manager', 3, false);
    const pSiteEng = await pos(proyek.id, 'Site Engineer', 2, true);
    const pQs = await pos(proyek.id, 'Quantity Surveyor', 2, true);
    const pDrafter = await pos(proyek.id, 'CAD Drafter', 1, true);
    const pProcSpec = await pos(procurement.id, 'Procurement Specialist', 2, true);
    const pFinMgr = await pos(finance.id, 'Finance & Tax Officer', 2, true);
    const pHrMgr = await pos(hr.id, 'HR Manager', 3, false);
    const pHrGen = await pos(hr.id, 'HR Generalist', 1, true);

    // Komponen gaji
    const comp = (code: string, name: string, isFixed: boolean, calculation: 'fixed_amount' | 'per_attendance_day' = 'fixed_amount') =>
      tx.salaryComponent.create({ data: { companyId: company.id, code, name, type: 'earning', isFixed, calculation } });
    const cJabatan = await comp('tunjangan_jabatan', 'Tunjangan Jabatan', true);
    const cLapangan = await comp('tunjangan_lapangan', 'Tunjangan Lapangan', true);
    const cTransport = await comp('tunjangan_transport', 'Tunjangan Transport', false, 'per_attendance_day');
    const cMeal = await comp('uang_makan', 'Uang Makan', false, 'per_attendance_day');

    type Seed = {
      code: string;
      name: string;
      nik: string;
      gender: 'male' | 'female';
      birth?: string;
      religion?: string;
      positionId: string;
      departmentId: string;
      locationId: string;
      supervisorId?: string;
      ptkp: string;
      salary: number;
      join: string;
      workPattern?: 'FIVE_DAY' | 'SIX_DAY';
      contractType?: 'permanent' | 'contract' | 'probation' | 'intern';
      contractEnd?: string;
      probationEnd?: string;
      email?: string;
      roles?: string[];
      components?: [string, number][];
      salaryRaise?: { from: number; at: string; reason: string };
    };

    const createEmployee = async (s: Seed) => {
      const user = s.email ? await tx.user.create({ data: { email: s.email, passwordHash } }) : null;
      if (user) {
        await tx.userRole.createMany({
          data: (s.roles ?? ['staff']).map((r) => ({ userId: user.id, roleId: roles.get(r)!, companyId: company.id })),
        });
      }
      const emp = await tx.employee.create({
        data: {
          companyId: company.id,
          userId: user?.id,
          employeeCode: s.code,
          fullName: s.name,
          nikEncrypted: crypto.encrypt(s.nik, CryptoContext.nik),
          nikHash: crypto.blindIndex(s.nik, CryptoContext.nik),
          gender: s.gender,
          religion: s.religion ?? 'Islam',
          birthDate: d(s.birth ?? '1992-05-14'),
          joinDate: d(s.join),
          contractType: s.contractType ?? 'permanent',
          contractEndDate: s.contractEnd ? d(s.contractEnd) : null,
          probationEndDate: s.probationEnd ? d(s.probationEnd) : null,
          workPattern: s.workPattern ?? null,
          departmentId: s.departmentId,
          positionId: s.positionId,
          supervisorId: s.supervisorId,
          workLocationId: s.locationId,
          ptkpStatus: s.ptkp,
          baseSalaryEncrypted: crypto.encryptAmount(s.salary, CryptoContext.baseSalary),
          bankName: 'BCA',
          bankAccountEncrypted: crypto.encrypt(`52700${s.code.replace(/\D/g, '')}81`, CryptoContext.bankAccount),
        },
      });
      if (s.salaryRaise) {
        await tx.employeeHistory.create({
          data: {
            employeeId: emp.id,
            fieldChanged: 'base_salary',
            oldValue: null,
            newValue: crypto.encrypt(String(s.salaryRaise.from), CryptoContext.history('base_salary')),
            isEncrypted: true,
            effectiveDate: d(s.join),
            reason: 'Gaji awal',
          },
        });
        await tx.employeeHistory.create({
          data: {
            employeeId: emp.id,
            fieldChanged: 'base_salary',
            oldValue: crypto.encrypt(String(s.salaryRaise.from), CryptoContext.history('base_salary')),
            newValue: crypto.encrypt(String(s.salary), CryptoContext.history('base_salary')),
            isEncrypted: true,
            effectiveDate: d(s.salaryRaise.at),
            reason: s.salaryRaise.reason,
          },
        });
      } else {
        await tx.employeeHistory.create({
          data: {
            employeeId: emp.id,
            fieldChanged: 'base_salary',
            oldValue: null,
            newValue: crypto.encrypt(String(s.salary), CryptoContext.history('base_salary')),
            isEncrypted: true,
            effectiveDate: d(s.join),
            reason: 'Gaji awal',
          },
        });
      }
      for (const [componentId, amount] of s.components ?? []) {
        await tx.employeeSalaryComponent.create({
          data: {
            employeeId: emp.id,
            componentId,
            amountEncrypted: crypto.encryptAmount(amount, CryptoContext.componentAmount),
            effectiveFrom: d(s.join),
          },
        });
      }
      return emp;
    };

    // 1. Direksi
    const direktur = await createEmployee({
      code: 'RTK-0001', name: 'Rina Wijaya', nik: '3174015205840001', gender: 'female', birth: '1984-05-12',
      departmentId: direksi.id, positionId: pPrincipal.id, locationId: locJakarta.id, ptkp: 'K/2', salary: 38_000_000,
      join: '2020-01-06', components: [[cJabatan.id, 10_000_000]],
    });
    await tx.department.update({ where: { id: direksi.id }, data: { headEmployeeId: direktur.id } });

    // 2. People & Operations (HR)
    const hrMgr = await createEmployee({
      code: 'RTK-0002', name: 'Dimas Pratama', nik: '3174011803890002', gender: 'male', birth: '1989-03-18',
      departmentId: hr.id, positionId: pHrMgr.id, locationId: locJakarta.id, supervisorId: direktur.id, ptkp: 'K/1',
      salary: 16_000_000, join: '2021-03-01', email: 'hr@ruangteduh.test', roles: ['hr_admin'],
      components: [[cJabatan.id, 3_000_000], [cTransport.id, 40_000], [cMeal.id, 45_000]],
      salaryRaise: { from: 14_000_000, at: '2024-01-01', reason: 'Penyesuaian tahunan & perluasan cabang Bali' },
    });
    await tx.department.update({ where: { id: hr.id }, data: { headEmployeeId: hrMgr.id } });

    await createEmployee({
      code: 'RTK-0003', name: 'Aulia Rahmawati', nik: '3174026109960003', gender: 'female', birth: '1996-09-21',
      departmentId: hr.id, positionId: pHrGen.id, locationId: locJakarta.id, supervisorId: hrMgr.id, ptkp: 'TK/0',
      salary: 8_200_000, join: '2023-06-05', components: [[cTransport.id, 35_000], [cMeal.id, 40_000]],
    });

    // 3. Finance & Accounting
    const finOfficer = await createEmployee({
      code: 'RTK-0004', name: 'Sari Lestari', nik: '3174035407920004', gender: 'female', birth: '1992-07-14',
      departmentId: finance.id, positionId: pFinMgr.id, locationId: locJakarta.id, supervisorId: direktur.id, ptkp: 'TK/0',
      salary: 10_500_000, join: '2022-07-11', email: 'finance@ruangteduh.test', roles: ['finance'],
      components: [[cTransport.id, 35_000], [cMeal.id, 40_000]],
    });
    await tx.department.update({ where: { id: finance.id }, data: { headEmployeeId: finOfficer.id } });

    // 4. Studio Desain (Jakarta & Bali)
    const leadArch = await createEmployee({
      code: 'RTK-0005', name: 'Bayu Saputra', nik: '3174041108880005', gender: 'male', birth: '1988-08-11',
      departmentId: studioDesain.id, positionId: pLeadArch.id, locationId: locJakarta.id, supervisorId: direktur.id, ptkp: 'K/1',
      salary: 21_000_000, join: '2021-09-01', email: 'manager@ruangteduh.test', roles: ['manager', 'staff'],
      components: [[cJabatan.id, 4_000_000], [cTransport.id, 40_000]],
      salaryRaise: { from: 18_500_000, at: '2024-06-01', reason: 'Promosi Lead Architect' },
    });
    await tx.department.update({ where: { id: studioDesain.id }, data: { headEmployeeId: leadArch.id } });

    await createEmployee({
      code: 'RTK-0006', name: 'Putri Anggraini', nik: '3174054802950006', gender: 'female', birth: '1995-02-08',
      departmentId: studioDesain.id, positionId: pSeniorArch.id, locationId: locJakarta.id, supervisorId: leadArch.id, ptkp: 'TK/0',
      salary: 12_500_000, join: '2023-02-03', email: 'staff@ruangteduh.test', roles: ['staff'],
      components: [[cTransport.id, 35_000], [cMeal.id, 40_000]],
    });

    await createEmployee({
      code: 'RTK-0007', name: 'Putu Maheswari', nik: '5103015511930007', gender: 'female', birth: '1993-11-15', religion: 'Hindu',
      departmentId: studioDesain.id, positionId: pInterior.id, locationId: locBali.id, supervisorId: leadArch.id, ptkp: 'K/0',
      salary: 11_800_000, join: '2023-02-10', components: [[cTransport.id, 35_000], [cMeal.id, 40_000]],
    });

    await createEmployee({
      code: 'RTK-0008', name: 'Made Wirawan', nik: '5103020904940008', gender: 'male', birth: '1994-04-09', religion: 'Hindu',
      departmentId: studioDesain.id, positionId: pSeniorArch.id, locationId: locBali.id, supervisorId: leadArch.id, ptkp: 'K/1',
      salary: 13_000_000, join: '2023-08-14', components: [[cTransport.id, 35_000], [cMeal.id, 40_000]],
    });

    // Probation berakhir 11 hari lagi → muncul di pengingat Dashboard
    await createEmployee({
      code: 'RTK-0009', name: 'Nadia Kusuma', nik: '3174066201990009', gender: 'female', birth: '1999-01-22',
      departmentId: studioDesain.id, positionId: pJuniorArch.id, locationId: locJakarta.id, supervisorId: leadArch.id, ptkp: 'TK/0',
      salary: 7_500_000, join: daysFromToday(-80), contractType: 'probation', probationEnd: daysFromToday(11),
      components: [[cTransport.id, 30_000], [cMeal.id, 35_000]],
    });

    await createEmployee({
      code: 'RTK-0010', name: 'Fajar Nugroho', nik: '3273011706010010', gender: 'male', birth: '2001-06-17',
      departmentId: studioDesain.id, positionId: pJuniorArch.id, locationId: locBandung.id, supervisorId: leadArch.id, ptkp: 'TK/0',
      salary: 5_800_000, join: '2025-07-01', contractType: 'intern', components: [[cMeal.id, 35_000]],
    });

    // 5. Operasional & Proyek (6 hari kerja, Bandung & Bali & Jakarta)
    const projMgr = await createEmployee({
      code: 'RTK-0011', name: 'Hendra Wijaya', nik: '3273021010870011', gender: 'male', birth: '1987-10-10',
      departmentId: proyek.id, positionId: pProjMgr.id, locationId: locBandung.id, supervisorId: direktur.id, ptkp: 'K/2',
      salary: 19_000_000, join: '2021-05-03', workPattern: 'SIX_DAY',
      components: [[cJabatan.id, 3_500_000], [cLapangan.id, 1_500_000]],
    });
    await tx.department.update({ where: { id: proyek.id }, data: { headEmployeeId: projMgr.id } });

    // Kontrak PKWT berakhir 6 hari lagi → badge amber/merah di Dashboard
    await createEmployee({
      code: 'RTK-0012', name: 'Raka Mahendra', nik: '3273031405960012', gender: 'male', birth: '1996-05-14',
      departmentId: proyek.id, positionId: pSiteEng.id, locationId: locBandung.id, supervisorId: projMgr.id, ptkp: 'K/1',
      salary: 9_800_000, join: '2024-12-01', workPattern: 'SIX_DAY', contractType: 'contract', contractEnd: daysFromToday(6),
      components: [[cLapangan.id, 1_200_000], [cMeal.id, 40_000]],
    });

    // Kontrak PKWT berakhir 18 hari lagi
    await createEmployee({
      code: 'RTK-0013', name: 'Bagas Prakoso', nik: '3273042308950013', gender: 'male', birth: '1995-08-23',
      departmentId: proyek.id, positionId: pQs.id, locationId: locBandung.id, supervisorId: projMgr.id, ptkp: 'TK/0',
      salary: 9_200_000, join: '2025-01-06', workPattern: 'SIX_DAY', contractType: 'contract', contractEnd: daysFromToday(18),
      components: [[cLapangan.id, 1_000_000], [cMeal.id, 40_000]],
    });

    await createEmployee({
      code: 'RTK-0014', name: 'I Wayan Arya', nik: '5103030203910014', gender: 'male', birth: '1991-03-02', religion: 'Hindu',
      departmentId: proyek.id, positionId: pSiteEng.id, locationId: locBali.id, supervisorId: projMgr.id, ptkp: 'K/2',
      salary: 10_400_000, join: '2023-04-03', workPattern: 'SIX_DAY',
      components: [[cLapangan.id, 1_200_000], [cMeal.id, 40_000]],
    });

    await createEmployee({
      code: 'RTK-0015', name: 'Dina Safitri', nik: '3273055912980015', gender: 'female', birth: '1998-12-19',
      departmentId: proyek.id, positionId: pDrafter.id, locationId: locBandung.id, supervisorId: projMgr.id, ptkp: 'TK/0',
      salary: 7_400_000, join: '2024-03-04', workPattern: 'FIVE_DAY',
      components: [[cTransport.id, 30_000], [cMeal.id, 35_000]],
    });

    // 6. Procurement & Material
    const procLead = await createEmployee({
      code: 'RTK-0016', name: 'Teguh Santoso', nik: '3174071504900016', gender: 'male', birth: '1990-04-15',
      departmentId: procurement.id, positionId: pProcSpec.id, locationId: locJakarta.id, supervisorId: direktur.id, ptkp: 'K/1',
      salary: 11_200_000, join: '2022-04-04', components: [[cTransport.id, 35_000], [cMeal.id, 40_000]],
    });
    await tx.department.update({ where: { id: procurement.id }, data: { headEmployeeId: procLead.id } });

    // Super admin platform (tanpa data karyawan).
    const admin = await tx.user.create({ data: { email: 'admin@ruangteduh.test', passwordHash } });
    await tx.userRole.create({ data: { userId: admin.id, roleId: roles.get('super_admin')!, companyId: company.id } });
  });

  console.log(`Perusahaan demo ${DEMO_COMPANY} dibuat (16 karyawan, 3 lokasi). Akun: admin@, hr@, finance@, manager@, staff@ruangteduh.test`);
}

async function seedPhase2Defaults() {
  const company = await prisma.company.findFirst({ where: { name: DEMO_COMPANY } });
  if (!company) return;

  // 1. Shifts (idempotent)
  const defaultShifts = [
    { name: 'Shift Studio', startTime: '09:00', endTime: '18:00', isOvernight: false, lateToleranceMinutes: 15, workHours: 8, isDefault: true },
    { name: 'Shift Proyek', startTime: '08:00', endTime: '17:00', isOvernight: false, lateToleranceMinutes: 10, workHours: 8, isDefault: false },
  ];
  for (const s of defaultShifts) {
    await prisma.shift.upsert({
      where: { companyId_name: { companyId: company.id, name: s.name } },
      update: {},
      create: { companyId: company.id, ...s },
    });
  }

  // 2. Hari Libur Nasional 2026 (global companyId = null)
  const holidays2026: { date: string; name: string; type: 'national' | 'collective_leave'; deductsAnnualLeave?: boolean }[] = [
    { date: '2026-01-01', name: 'Tahun Baru 2026 Masehi', type: 'national' },
    { date: '2026-03-19', name: 'Hari Suci Nyepi Tahun Baru Saka 1948', type: 'national' },
    { date: '2026-03-20', name: 'Hari Raya Idul Fitri 1447 H', type: 'national' },
    { date: '2026-03-21', name: 'Hari Raya Idul Fitri 1447 H', type: 'national' },
    { date: '2026-04-03', name: 'Wafat Yesus Kristus', type: 'national' },
    { date: '2026-05-01', name: 'Hari Buruh Internasional', type: 'national' },
    { date: '2026-05-14', name: 'Kenaikan Yesus Kristus', type: 'national' },
    { date: '2026-05-27', name: 'Hari Raya Idul Adha 1447 H', type: 'national' },
    { date: '2026-06-01', name: 'Hari Lahir Pancasila', type: 'national' },
    { date: '2026-08-17', name: 'Hari Kemerdekaan Republik Indonesia', type: 'national' },
    { date: '2026-12-25', name: 'Hari Raya Natal', type: 'national' },
  ];
  for (const h of holidays2026) {
    const exists = await prisma.holiday.findFirst({ where: { companyId: null, date: d(h.date) } });
    if (!exists) {
      await prisma.holiday.create({
        data: { companyId: null, date: d(h.date), name: h.name, type: h.type, deductsAnnualLeave: h.deductsAnnualLeave ?? false },
      });
    }
  }

  // 3. Jenis Cuti (idempotent)
  const leaveTypes = [
    {
      code: 'annual',
      name: 'Cuti Tahunan',
      defaultQuotaDays: 12,
      isPaid: true,
      requiresDocument: false,
      allowHalfDay: true,
      minServiceMonths: 12,
      maxCarryOverDays: 5,
      carryOverExpiryMonths: 3,
      countsWorkingDaysOnly: true,
    },
    {
      code: 'sick',
      name: 'Cuti Sakit',
      defaultQuotaDays: null,
      isPaid: true,
      requiresDocument: true,
      allowHalfDay: false,
      minServiceMonths: 0,
      maxCarryOverDays: 0,
      carryOverExpiryMonths: null,
      countsWorkingDaysOnly: true,
    },
    {
      code: 'maternity',
      name: 'Cuti Melahirkan',
      defaultQuotaDays: 90,
      isPaid: true,
      requiresDocument: true,
      genderRestriction: 'female' as const,
      allowHalfDay: false,
      minServiceMonths: 0,
      maxCarryOverDays: 0,
      carryOverExpiryMonths: null,
      countsWorkingDaysOnly: false,
    },
    {
      code: 'unpaid',
      name: 'Cuti Tidak Dibayar',
      defaultQuotaDays: null,
      isPaid: false,
      requiresDocument: false,
      allowHalfDay: true,
      minServiceMonths: 0,
      maxCarryOverDays: 0,
      carryOverExpiryMonths: null,
      countsWorkingDaysOnly: true,
    },
  ];
  for (const lt of leaveTypes) {
    await prisma.leaveType.upsert({
      where: { companyId_code: { companyId: company.id, code: lt.code } },
      update: {},
      create: { companyId: company.id, ...lt },
    });
  }

  // 4. Saldo Cuti Tahunan untuk tahun berjalan bagi seluruh karyawan aktif
  const annualType = await prisma.leaveType.findUnique({ where: { companyId_code: { companyId: company.id, code: 'annual' } } });
  if (annualType) {
    const year = new Date().getUTCFullYear();
    const emps = await prisma.employee.findMany({ where: { companyId: company.id, employmentStatus: 'active' } });
    for (const emp of emps) {
      await prisma.leaveBalance.upsert({
        where: { employeeId_leaveTypeId_year: { employeeId: emp.id, leaveTypeId: annualType.id, year } },
        update: {},
        create: { employeeId: emp.id, leaveTypeId: annualType.id, year, quotaDays: 12, carriedOverDays: 0, usedDays: 0 },
      });
    }
  }

  // 5. Default Approval Workflows (leave, overtime, attendance_correction)
  const hrRole = await prisma.role.findFirst({ where: { companyId: null, name: 'hr_admin' } });
  if (hrRole) {
    const workflows: {
      requestType: 'leave' | 'overtime' | 'attendance_correction';
      name: string;
      steps: { stepOrder: number; approverType: 'direct_supervisor' | 'role'; approverRoleId?: string; fallbackRoleId: string }[];
    }[] = [
      {
        requestType: 'leave',
        name: 'Persetujuan Cuti Standar',
        steps: [
          { stepOrder: 1, approverType: 'direct_supervisor', fallbackRoleId: hrRole.id },
          { stepOrder: 2, approverType: 'role', approverRoleId: hrRole.id, fallbackRoleId: hrRole.id },
        ],
      },
      {
        requestType: 'overtime',
        name: 'Persetujuan Lembur Standar',
        steps: [
          { stepOrder: 1, approverType: 'direct_supervisor', fallbackRoleId: hrRole.id },
          { stepOrder: 2, approverType: 'role', approverRoleId: hrRole.id, fallbackRoleId: hrRole.id },
        ],
      },
      {
        requestType: 'attendance_correction',
        name: 'Persetujuan Koreksi Absensi',
        steps: [{ stepOrder: 1, approverType: 'direct_supervisor', fallbackRoleId: hrRole.id }],
      },
    ];

    for (const wf of workflows) {
      const existing = await prisma.approvalWorkflow.findFirst({
        where: { companyId: company.id, requestType: wf.requestType, isActive: true },
      });
      if (!existing) {
        await prisma.approvalWorkflow.create({
          data: {
            companyId: company.id,
            requestType: wf.requestType,
            name: wf.name,
            version: 1,
            isActive: true,
            steps: { create: wf.steps },
          },
        });
      }
    }
  }

  console.log('Fase 2 seed: shift, hari libur, jenis cuti, saldo cuti, dan workflow approval siap');
}

async function main() {
  await syncRbac();
  await seedDemoCompany();
  await seedPhase2Defaults();
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
