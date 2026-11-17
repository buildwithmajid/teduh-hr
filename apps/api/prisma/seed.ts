/**
 * Seed data development: permission & role bawaan (selalu di-sync), plus satu perusahaan
 * demo dengan struktur organisasi, komponen gaji, karyawan, dan akun login.
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

const DEMO_COMPANY = 'PT Contoh Sejahtera (Demo)';

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
        address: 'Jl. Contoh No. 1, Jakarta',
        settings: { create: { riskClassJkk: 'I', minimumWage: 5_396_761 } },
      },
    });

    const loc = await tx.workLocation.create({
      data: {
        companyId: company.id,
        name: 'Kantor Pusat Jakarta',
        latitude: -6.2088,
        longitude: 106.8456,
        radiusMeters: 150,
        timezone: 'Asia/Jakarta',
      },
    });

    const dept = async (name: string, parentDepartmentId?: string) =>
      tx.department.create({ data: { companyId: company.id, name, parentDepartmentId } });
    const direksi = await dept('Direksi');
    const hr = await dept('Human Resources', direksi.id);
    const finance = await dept('Finance', direksi.id);
    const engineering = await dept('Engineering', direksi.id);

    const pos = (departmentId: string, title: string, level: number, overtimeEligible = true) =>
      tx.position.create({ data: { departmentId, title, level, overtimeEligible } });
    const pDirektur = await pos(direksi.id, 'Direktur Utama', 5, false);
    const pHrMgr = await pos(hr.id, 'HR Manager', 3, false);
    const pFinance = await pos(finance.id, 'Finance Officer', 2);
    const pEngMgr = await pos(engineering.id, 'Engineering Manager', 3, false);
    const pEngineer = await pos(engineering.id, 'Software Engineer', 2);

    const comp = (code: string, name: string, isFixed: boolean, calculation: 'fixed_amount' | 'per_attendance_day' = 'fixed_amount') =>
      tx.salaryComponent.create({ data: { companyId: company.id, code, name, type: 'earning', isFixed, calculation } });
    const cJabatan = await comp('position_allowance', 'Tunjangan Jabatan', true);
    const cTransport = await comp('transport', 'Tunjangan Transport', true);
    const cMeal = await comp('meal', 'Uang Makan', false, 'per_attendance_day');

    type Seed = {
      code: string;
      name: string;
      nik: string;
      gender: 'male' | 'female';
      positionId: string;
      departmentId: string;
      supervisorId?: string;
      ptkp: string;
      salary: number;
      join: string;
      contractType?: 'permanent' | 'contract';
      contractEnd?: string;
      email?: string;
      roles?: string[];
      components?: [string, number][];
    };

    const createEmployee = async (s: Seed) => {
      const user = s.email
        ? await tx.user.create({ data: { email: s.email, passwordHash } })
        : null;
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
          birthDate: d('1990-05-17'),
          joinDate: d(s.join),
          contractType: s.contractType ?? 'permanent',
          contractEndDate: s.contractEnd ? d(s.contractEnd) : null,
          departmentId: s.departmentId,
          positionId: s.positionId,
          supervisorId: s.supervisorId,
          workLocationId: loc.id,
          ptkpStatus: s.ptkp,
          baseSalaryEncrypted: crypto.encryptAmount(s.salary, CryptoContext.baseSalary),
          bankName: 'Bank Contoh',
          bankAccountEncrypted: crypto.encrypt(`88800${s.code.replace(/\D/g, '')}`, CryptoContext.bankAccount),
        },
      });
      await tx.employeeHistory.create({
        data: {
          employeeId: emp.id,
          fieldChanged: 'base_salary',
          oldValue: null,
          newValue: crypto.encrypt(String(s.salary), CryptoContext.history('base_salary')),
          isEncrypted: true,
          effectiveDate: d(s.join),
          reason: 'Gaji awal (seed)',
        },
      });
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

    const direktur = await createEmployee({
      code: 'EMP-0001', name: 'Rina Wijaya', nik: '3171000000000001', gender: 'female',
      departmentId: direksi.id, positionId: pDirektur.id, ptkp: 'K/2', salary: 40_000_000, join: '2020-01-06',
      components: [[cJabatan.id, 10_000_000]],
    });
    await tx.department.update({ where: { id: direksi.id }, data: { headEmployeeId: direktur.id } });

    const hrMgr = await createEmployee({
      code: 'EMP-0002', name: 'Dimas Pratama', nik: '3171000000000002', gender: 'male',
      departmentId: hr.id, positionId: pHrMgr.id, supervisorId: direktur.id, ptkp: 'K/1', salary: 15_000_000,
      join: '2021-03-01', email: 'hr@contoh.test', roles: ['hr_admin'],
      components: [[cJabatan.id, 3_000_000], [cTransport.id, 750_000], [cMeal.id, 40_000]],
    });
    await tx.department.update({ where: { id: hr.id }, data: { headEmployeeId: hrMgr.id } });

    await createEmployee({
      code: 'EMP-0003', name: 'Sari Lestari', nik: '3171000000000003', gender: 'female',
      departmentId: finance.id, positionId: pFinance.id, supervisorId: direktur.id, ptkp: 'TK/0', salary: 9_000_000,
      join: '2022-07-11', email: 'finance@contoh.test', roles: ['finance'],
      components: [[cTransport.id, 500_000], [cMeal.id, 35_000]],
    });

    const engMgr = await createEmployee({
      code: 'EMP-0004', name: 'Bayu Saputra', nik: '3171000000000004', gender: 'male',
      departmentId: engineering.id, positionId: pEngMgr.id, supervisorId: direktur.id, ptkp: 'K/0', salary: 20_000_000,
      join: '2021-09-01', email: 'manager@contoh.test', roles: ['manager', 'staff'],
      components: [[cJabatan.id, 4_000_000], [cTransport.id, 750_000]],
    });
    await tx.department.update({ where: { id: engineering.id }, data: { headEmployeeId: engMgr.id } });

    await createEmployee({
      code: 'EMP-0005', name: 'Putri Anggraini', nik: '3171000000000005', gender: 'female',
      departmentId: engineering.id, positionId: pEngineer.id, supervisorId: engMgr.id, ptkp: 'TK/0', salary: 8_000_000,
      join: '2025-02-03', contractType: 'contract', contractEnd: '2027-02-02',
      email: 'staff@contoh.test', roles: ['staff'],
      components: [[cTransport.id, 500_000], [cMeal.id, 35_000]],
    });

    // Super admin platform (tanpa data karyawan).
    const admin = await tx.user.create({ data: { email: 'admin@contoh.test', passwordHash } });
    await tx.userRole.create({ data: { userId: admin.id, roleId: roles.get('super_admin')!, companyId: company.id } });
  });

  console.log(`Perusahaan demo dibuat. Akun: admin@, hr@, finance@, manager@, staff@contoh.test (password = SEED_DEFAULT_PASSWORD)`);
}

async function main() {
  await syncRbac();
  await seedDemoCompany();
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
