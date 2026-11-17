import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Employee, Prisma } from '@prisma/client';
import { AuditContext, AuthUser } from '../common/auth-context';
import { CryptoContext, FieldCrypto } from '../common/crypto/field-crypto';
import { formatDateOnly, parseDateOnly, parseDateOnlyNullable, todayIn } from '../common/dates';
import { paginate, wouldCreateCycle } from '../common/validation';
import { AuditService } from '../audit/audit.service';
import { OrganizationService } from '../organization/organization.service';
import { PrismaService, Tx } from '../prisma/prisma.service';
import {
  CreateEmployeeDto,
  ListEmployeesQuery,
  SalaryChangeDto,
  TerminateEmployeeDto,
  UpdateEmployeeDto,
  UpdateSensitiveDto,
} from './employees.dto';

/** Field yang perubahannya dicatat di employee_history (dengan tanggal efektif). */
const TRACKED_FIELDS = ['departmentId', 'positionId', 'supervisorId', 'workLocationId', 'ptkpStatus', 'contractType'] as const;
type TrackedField = (typeof TRACKED_FIELDS)[number];

const HISTORY_FIELD_NAME: Record<TrackedField | 'baseSalary' | 'nik' | 'bankAccountNumber' | 'npwp' | 'employmentStatus', string> = {
  departmentId: 'department_id',
  positionId: 'position_id',
  supervisorId: 'supervisor_id',
  workLocationId: 'work_location_id',
  ptkpStatus: 'ptkp_status',
  contractType: 'contract_type',
  baseSalary: 'base_salary',
  nik: 'nik',
  bankAccountNumber: 'bank_account',
  npwp: 'npwp',
  employmentStatus: 'employment_status',
};

const summaryInclude = {
  department: { select: { id: true, name: true } },
  position: { select: { id: true, title: true, level: true } },
  supervisor: { select: { id: true, fullName: true, employeeCode: true } },
  workLocation: { select: { id: true, name: true, timezone: true } },
} satisfies Prisma.EmployeeInclude;

type EmployeeWithRefs = Prisma.EmployeeGetPayload<{ include: typeof summaryInclude }>;

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: FieldCrypto,
    private readonly audit: AuditService,
    private readonly org: OrganizationService,
  ) {}

  // ───────────── Read ─────────────

  async list(companyId: string, q: ListEmployeesQuery) {
    const search = q.search?.trim();
    const where: Prisma.EmployeeWhereInput = {
      companyId,
      ...(q.departmentId ? { departmentId: q.departmentId } : {}),
      ...(q.status ? { employmentStatus: q.status } : {}),
      ...(search
        ? {
            OR: [
              { fullName: { contains: search, mode: 'insensitive' } },
              { employeeCode: { contains: search, mode: 'insensitive' } },
              // NIK dicari lewat blind index (exact match), karena kolom aslinya terenkripsi.
              ...(/^\d{16}$/.test(search) ? [{ nikHash: this.crypto.blindIndex(search, CryptoContext.nik) }] : []),
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.employee.findMany({ where, include: summaryInclude, orderBy: { fullName: 'asc' }, ...paginate(q) }),
      this.prisma.employee.count({ where }),
    ]);
    return { items: items.map((e) => this.toSummary(e)), total, page: q.page, pageSize: q.pageSize };
  }

  async listTeam(user: AuthUser) {
    if (!user.employeeId) return [];
    const items = await this.prisma.employee.findMany({
      where: { companyId: user.companyId, supervisorId: user.employeeId, employmentStatus: 'active' },
      include: summaryInclude,
      orderBy: { fullName: 'asc' },
    });
    return items.map((e) => this.toSummary(e));
  }

  async getSummary(companyId: string, id: string) {
    return this.toSummary(await this.findWithRefs(companyId, id));
  }

  /** Data lengkap termasuk kolom terdekripsi. Akses oleh orang lain dicatat sebagai view_sensitive. */
  async getSensitive(user: AuthUser, ctx: AuditContext, id: string) {
    const employee = await this.findWithRefs(user.companyId, id);
    if (employee.id !== user.employeeId) {
      await this.audit.recordStandalone(ctx, {
        tableName: 'employees',
        recordId: id,
        action: 'view_sensitive',
        newValue: { fields: ['nik', 'base_salary', 'bank_account', 'npwp'] },
      });
    }
    return this.toDetail(employee);
  }

  async getMe(user: AuthUser) {
    if (!user.employeeId) throw new NotFoundException('Akun ini tidak terhubung ke data karyawan');
    const employee = await this.findWithRefs(user.companyId, user.employeeId);
    return {
      ...this.toDetail(employee),
      salaryComponents: await this.listAssignmentsDecrypted(employee.id),
    };
  }

  async getHistory(user: AuthUser, ctx: AuditContext, id: string) {
    await this.findWithRefs(user.companyId, id);
    const rows = await this.prisma.employeeHistory.findMany({
      where: { employeeId: id },
      orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }],
    });
    if (id !== user.employeeId) {
      await this.audit.recordStandalone(ctx, {
        tableName: 'employee_history',
        recordId: id,
        action: 'view_sensitive',
      });
    }
    return rows.map((r) => ({
      id: r.id,
      field: r.fieldChanged,
      oldValue: r.isEncrypted ? this.crypto.decryptNullable(r.oldValue, CryptoContext.history(r.fieldChanged)) : r.oldValue,
      newValue: r.isEncrypted ? this.crypto.decryptNullable(r.newValue, CryptoContext.history(r.fieldChanged)) : r.newValue,
      effectiveDate: formatDateOnly(r.effectiveDate),
      reason: r.reason,
      changedBy: r.changedBy,
      createdAt: r.createdAt,
    }));
  }

  // ───────────── Write ─────────────

  async create(user: AuthUser, ctx: AuditContext, dto: CreateEmployeeDto) {
    const companyId = user.companyId;
    const joinDate = parseDateOnly(dto.joinDate);
    const birthDate = parseDateOnly(dto.birthDate);
    if (birthDate >= joinDate) throw new BadRequestException('Tanggal lahir harus sebelum tanggal masuk');
    const contractEndDate = parseDateOnlyNullable(dto.contractEndDate) ?? null;
    const probationEndDate = parseDateOnlyNullable(dto.probationEndDate) ?? null;
    this.assertContractDates(dto.contractType, joinDate, contractEndDate, probationEndDate);

    await this.assertOrgRefs(companyId, dto.departmentId, dto.positionId, dto.workLocationId ?? null);
    if (dto.supervisorId) await this.assertActiveEmployee(companyId, dto.supervisorId, 'Atasan');

    const nikHash = this.crypto.blindIndex(dto.nik, CryptoContext.nik);
    if (await this.prisma.employee.findFirst({ where: { companyId, nikHash } })) {
      throw new ConflictException('NIK sudah terdaftar di perusahaan ini');
    }

    return this.prisma.$transaction(async (tx) => {
      const employee = await tx.employee.create({
        data: {
          companyId,
          employeeCode: dto.employeeCode.toUpperCase(),
          fullName: dto.fullName.trim(),
          nikEncrypted: this.crypto.encrypt(dto.nik, CryptoContext.nik),
          nikHash,
          gender: dto.gender,
          religion: dto.religion ?? null,
          birthDate,
          joinDate,
          probationEndDate,
          contractEndDate,
          contractType: dto.contractType,
          departmentId: dto.departmentId,
          positionId: dto.positionId,
          supervisorId: dto.supervisorId ?? null,
          workLocationId: dto.workLocationId ?? null,
          workPattern: dto.workPattern ?? null,
          overtimeEligible: dto.overtimeEligible ?? null,
          ptkpStatus: dto.ptkpStatus,
          baseSalaryEncrypted: this.crypto.encryptAmount(dto.baseSalary, CryptoContext.baseSalary),
          bankName: dto.bankName ?? null,
          bankAccountEncrypted: this.crypto.encryptNullable(dto.bankAccountNumber, CryptoContext.bankAccount),
          npwpEncrypted: this.crypto.encryptNullable(dto.npwp, CryptoContext.npwp),
          bpjsKesehatanNumber: dto.bpjsKesehatanNumber ?? null,
          bpjsTkNumber: dto.bpjsTkNumber ?? null,
          bpjsExtraFamilyMembers: dto.bpjsExtraFamilyMembers ?? 0,
        },
        include: summaryInclude,
      });

      // Gaji awal dicatat sebagai segmen pertama (dipakai prorata payroll).
      await this.addHistory(tx, user, employee.id, 'baseSalary', null, String(dto.baseSalary), joinDate, 'Gaji awal', true);
      await this.audit.record(tx, ctx, { tableName: 'employees', recordId: employee.id, action: 'create', newValue: this.rowForAudit(employee) });
      return this.toSummary(employee);
    });
  }

  async update(user: AuthUser, ctx: AuditContext, id: string, dto: UpdateEmployeeDto) {
    const companyId = user.companyId;
    const before = await this.findWithRefs(companyId, id);
    this.assertActive(before);

    const effectiveDate = dto.effectiveDate ? parseDateOnly(dto.effectiveDate) : parseDateOnly(todayIn());
    if (effectiveDate < before.joinDate) throw new BadRequestException('Tanggal efektif tidak boleh sebelum tanggal masuk');

    const departmentId = dto.departmentId ?? before.departmentId;
    const positionId = dto.positionId ?? before.positionId;
    const workLocationId = dto.workLocationId === undefined ? before.workLocationId : dto.workLocationId;
    if (dto.departmentId || dto.positionId || dto.workLocationId) {
      await this.assertOrgRefs(companyId, departmentId, positionId, workLocationId);
    }

    if (dto.supervisorId !== undefined && dto.supervisorId !== null) {
      await this.assertActiveEmployee(companyId, dto.supervisorId, 'Atasan');
      const cycle = await wouldCreateCycle(id, dto.supervisorId, async (empId) => {
        const e = await this.prisma.employee.findUnique({ where: { id: empId }, select: { supervisorId: true } });
        return e?.supervisorId ?? null;
      });
      if (cycle) throw new BadRequestException('Atasan baru adalah bawahan (langsung/tidak langsung) karyawan ini');
    }

    const contractType = dto.contractType ?? before.contractType;
    const contractEndDate = dto.contractEndDate === undefined ? before.contractEndDate : parseDateOnlyNullable(dto.contractEndDate) ?? null;
    const probationEndDate = dto.probationEndDate === undefined ? before.probationEndDate : parseDateOnlyNullable(dto.probationEndDate) ?? null;
    this.assertContractDates(contractType, before.joinDate, contractEndDate, probationEndDate);

    const data: Prisma.EmployeeUncheckedUpdateInput = {
      fullName: dto.fullName?.trim(),
      gender: dto.gender,
      religion: dto.religion,
      birthDate: dto.birthDate ? parseDateOnly(dto.birthDate) : undefined,
      probationEndDate,
      contractEndDate,
      contractType: dto.contractType,
      departmentId: dto.departmentId,
      positionId: dto.positionId,
      supervisorId: dto.supervisorId,
      workLocationId: dto.workLocationId,
      workPattern: dto.workPattern,
      overtimeEligible: dto.overtimeEligible,
      ptkpStatus: dto.ptkpStatus,
      bankName: dto.bankName,
      bpjsKesehatanNumber: dto.bpjsKesehatanNumber,
      bpjsTkNumber: dto.bpjsTkNumber,
      bpjsExtraFamilyMembers: dto.bpjsExtraFamilyMembers,
    };

    return this.prisma.$transaction(async (tx) => {
      const after = await tx.employee.update({ where: { id }, data, include: summaryInclude });
      for (const field of TRACKED_FIELDS) {
        const oldValue = before[field] ?? null;
        const newValue = after[field] ?? null;
        if (oldValue !== newValue) {
          await this.addHistory(tx, user, id, field, oldValue, newValue, effectiveDate, dto.reason ?? null, false);
        }
      }
      await this.audit.record(tx, ctx, {
        tableName: 'employees',
        recordId: id,
        action: 'update',
        oldValue: this.rowForAudit(before),
        newValue: this.rowForAudit(after),
      });
      return this.toSummary(after);
    });
  }

  async updateSensitive(user: AuthUser, ctx: AuditContext, id: string, dto: UpdateSensitiveDto) {
    const before = await this.findWithRefs(user.companyId, id);
    this.assertActive(before);
    const today = parseDateOnly(todayIn());
    const data: Prisma.EmployeeUncheckedUpdateInput = {};
    const changes: { field: 'nik' | 'bankAccountNumber' | 'npwp'; old: string | null; next: string | null }[] = [];

    if (dto.nik !== undefined) {
      const nikHash = this.crypto.blindIndex(dto.nik, CryptoContext.nik);
      const dup = await this.prisma.employee.findFirst({ where: { companyId: user.companyId, nikHash, NOT: { id } } });
      if (dup) throw new ConflictException('NIK sudah dipakai karyawan lain');
      data.nikEncrypted = this.crypto.encrypt(dto.nik, CryptoContext.nik);
      data.nikHash = nikHash;
      changes.push({ field: 'nik', old: this.crypto.decrypt(before.nikEncrypted, CryptoContext.nik), next: dto.nik });
    }
    if (dto.bankAccountNumber !== undefined) {
      data.bankAccountEncrypted = this.crypto.encryptNullable(dto.bankAccountNumber, CryptoContext.bankAccount);
      changes.push({
        field: 'bankAccountNumber',
        old: this.crypto.decryptNullable(before.bankAccountEncrypted, CryptoContext.bankAccount),
        next: dto.bankAccountNumber,
      });
    }
    if (dto.npwp !== undefined) {
      data.npwpEncrypted = this.crypto.encryptNullable(dto.npwp, CryptoContext.npwp);
      changes.push({ field: 'npwp', old: this.crypto.decryptNullable(before.npwpEncrypted, CryptoContext.npwp), next: dto.npwp });
    }
    const effective = changes.filter((c) => c.old !== c.next);
    if (effective.length === 0) throw new BadRequestException('Tidak ada perubahan');

    return this.prisma.$transaction(async (tx) => {
      const after = await tx.employee.update({ where: { id }, data, include: summaryInclude });
      for (const c of effective) {
        await this.addHistory(tx, user, id, c.field, c.old, c.next, today, dto.reason, true);
      }
      await this.audit.record(tx, ctx, {
        tableName: 'employees',
        recordId: id,
        action: 'update',
        oldValue: this.rowForAudit(before),
        newValue: this.rowForAudit(after),
      });
      return this.toDetail(after);
    });
  }

  /**
   * Ubah gaji pokok. Tanggal efektif boleh mundur (backdated) selama tidak sebelum perubahan
   * gaji terakhir; tanggal di masa depan belum didukung (butuh penjadwalan).
   */
  async changeSalary(user: AuthUser, ctx: AuditContext, id: string, dto: SalaryChangeDto) {
    const before = await this.findWithRefs(user.companyId, id);
    this.assertActive(before);
    const effectiveDate = parseDateOnly(dto.effectiveDate);
    if (dto.effectiveDate > todayIn()) throw new BadRequestException('Tanggal efektif di masa depan belum didukung');
    if (effectiveDate < before.joinDate) throw new BadRequestException('Tanggal efektif tidak boleh sebelum tanggal masuk');

    const last = await this.prisma.employeeHistory.findFirst({
      where: { employeeId: id, fieldChanged: HISTORY_FIELD_NAME.baseSalary },
      orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }],
    });
    if (last && effectiveDate <= last.effectiveDate) {
      throw new BadRequestException(`Tanggal efektif harus setelah perubahan gaji terakhir (${formatDateOnly(last.effectiveDate)})`);
    }
    const oldSalary = this.crypto.decryptAmount(before.baseSalaryEncrypted, CryptoContext.baseSalary);
    if (oldSalary === dto.baseSalary) throw new BadRequestException('Gaji baru sama dengan gaji saat ini');

    return this.prisma.$transaction(async (tx) => {
      const after = await tx.employee.update({
        where: { id },
        data: { baseSalaryEncrypted: this.crypto.encryptAmount(dto.baseSalary, CryptoContext.baseSalary) },
        include: summaryInclude,
      });
      await this.addHistory(tx, user, id, 'baseSalary', String(oldSalary), String(dto.baseSalary), effectiveDate, dto.reason, true);
      await this.audit.record(tx, ctx, {
        tableName: 'employees',
        recordId: id,
        action: 'update',
        oldValue: { baseSalaryEncrypted: before.baseSalaryEncrypted },
        newValue: { baseSalaryEncrypted: after.baseSalaryEncrypted, effectiveDate: dto.effectiveDate },
      });
      return { id, baseSalary: dto.baseSalary, effectiveDate: dto.effectiveDate };
    });
  }

  /** Resign/PHK: data tidak dihapus (dibutuhkan untuk histori payroll & pajak). */
  async terminate(user: AuthUser, ctx: AuditContext, id: string, dto: TerminateEmployeeDto) {
    const before = await this.findWithRefs(user.companyId, id);
    this.assertActive(before);
    if (id === user.employeeId) throw new ForbiddenException('Tidak bisa memproses resign untuk diri sendiri');
    const resignDate = parseDateOnly(dto.resignDate);
    if (resignDate < before.joinDate) throw new BadRequestException('Tanggal keluar tidak boleh sebelum tanggal masuk');

    return this.prisma.$transaction(async (tx) => {
      const after = await tx.employee.update({
        where: { id },
        data: { employmentStatus: dto.status, resignDate },
        include: summaryInclude,
      });
      await this.addHistory(tx, user, id, 'employmentStatus', before.employmentStatus, dto.status, resignDate, dto.reason, false);

      // Lepas jabatan kepala departemen; bawahan perlu dipindah oleh HR.
      const headed = await tx.department.findMany({ where: { headEmployeeId: id }, select: { id: true, name: true } });
      if (headed.length) await tx.department.updateMany({ where: { headEmployeeId: id }, data: { headEmployeeId: null } });
      const subordinates = await tx.employee.findMany({
        where: { supervisorId: id, employmentStatus: 'active' },
        select: { id: true, fullName: true, employeeCode: true },
      });

      if (before.userId) {
        await tx.user.update({ where: { id: before.userId }, data: { isActive: false } });
        await tx.refreshToken.updateMany({ where: { userId: before.userId, revokedAt: null }, data: { revokedAt: new Date() } });
      }

      await this.audit.record(tx, ctx, {
        tableName: 'employees',
        recordId: id,
        action: 'update',
        oldValue: this.rowForAudit(before),
        newValue: { ...this.rowForAudit(after), releasedDepartmentHeads: headed.map((d) => d.id) },
      });
      return {
        employee: this.toSummary(after),
        releasedDepartmentHeads: headed,
        subordinatesNeedingNewSupervisor: subordinates,
      };
    });
  }

  // ───────────── Helpers ─────────────

  async findWithRefs(companyId: string, id: string): Promise<EmployeeWithRefs> {
    const employee = await this.prisma.employee.findFirst({ where: { id, companyId }, include: summaryInclude });
    if (!employee) throw new NotFoundException('Karyawan tidak ditemukan');
    return employee;
  }

  async listAssignmentsDecrypted(employeeId: string) {
    const rows = await this.prisma.employeeSalaryComponent.findMany({
      where: { employeeId },
      include: { component: true },
      orderBy: [{ component: { code: 'asc' } }, { effectiveFrom: 'desc' }],
    });
    return rows.map((r) => ({
      id: r.id,
      component: { id: r.component.id, code: r.component.code, name: r.component.name, type: r.component.type, isFixed: r.component.isFixed, calculation: r.component.calculation },
      amount: this.crypto.decryptAmount(r.amountEncrypted, CryptoContext.componentAmount),
      effectiveFrom: formatDateOnly(r.effectiveFrom),
      effectiveTo: formatDateOnly(r.effectiveTo),
    }));
  }

  private assertActive(e: Employee) {
    if (e.employmentStatus !== 'active') throw new ConflictException('Karyawan sudah tidak aktif');
  }

  private async assertActiveEmployee(companyId: string, id: string, label: string) {
    const e = await this.prisma.employee.findFirst({ where: { id, companyId, employmentStatus: 'active' } });
    if (!e) throw new BadRequestException(`${label} harus karyawan aktif di perusahaan ini`);
  }

  private async assertOrgRefs(companyId: string, departmentId: string, positionId: string, workLocationId: string | null) {
    await this.org.findDepartment(companyId, departmentId);
    const position = await this.org.findPosition(companyId, positionId);
    if (position.departmentId !== departmentId) throw new BadRequestException('Jabatan tidak berada di departemen tersebut');
    if (workLocationId) {
      const loc = await this.prisma.workLocation.findFirst({ where: { id: workLocationId, companyId } });
      if (!loc) throw new BadRequestException('Lokasi kerja tidak ditemukan');
    }
  }

  private assertContractDates(type: string, joinDate: Date, contractEnd: Date | null, probationEnd: Date | null) {
    if (type === 'contract' && !contractEnd) throw new BadRequestException('Karyawan kontrak (PKWT) wajib punya tanggal akhir kontrak');
    if (contractEnd && contractEnd <= joinDate) throw new BadRequestException('Tanggal akhir kontrak harus setelah tanggal masuk');
    if (probationEnd && probationEnd <= joinDate) throw new BadRequestException('Tanggal akhir probation harus setelah tanggal masuk');
  }

  private async addHistory(
    tx: Tx,
    user: AuthUser,
    employeeId: string,
    field: keyof typeof HISTORY_FIELD_NAME,
    oldValue: string | null,
    newValue: string | null,
    effectiveDate: Date,
    reason: string | null,
    encrypt: boolean,
  ) {
    const name = HISTORY_FIELD_NAME[field];
    const ctx = CryptoContext.history(name);
    await tx.employeeHistory.create({
      data: {
        employeeId,
        fieldChanged: name,
        oldValue: encrypt ? this.crypto.encryptNullable(oldValue, ctx) : oldValue,
        newValue: encrypt ? this.crypto.encryptNullable(newValue, ctx) : newValue,
        isEncrypted: encrypt,
        effectiveDate,
        reason,
        changedBy: user.userId,
      },
    });
  }

  /** Baris untuk audit: kolom sensitif tetap berupa ciphertext, relasi dibuang. */
  private rowForAudit(e: EmployeeWithRefs) {
    const { department, position, supervisor, workLocation, ...row } = e;
    return row;
  }

  private toSummary(e: EmployeeWithRefs) {
    return {
      id: e.id,
      employeeCode: e.employeeCode,
      fullName: e.fullName,
      gender: e.gender,
      religion: e.religion,
      birthDate: formatDateOnly(e.birthDate),
      joinDate: formatDateOnly(e.joinDate),
      probationEndDate: formatDateOnly(e.probationEndDate),
      contractEndDate: formatDateOnly(e.contractEndDate),
      resignDate: formatDateOnly(e.resignDate),
      employmentStatus: e.employmentStatus,
      contractType: e.contractType,
      workPattern: e.workPattern,
      overtimeEligible: e.overtimeEligible,
      ptkpStatus: e.ptkpStatus,
      department: e.department,
      position: e.position,
      supervisor: e.supervisor,
      workLocation: e.workLocation,
      bankName: e.bankName,
      bpjsKesehatanNumber: e.bpjsKesehatanNumber,
      bpjsTkNumber: e.bpjsTkNumber,
      bpjsExtraFamilyMembers: e.bpjsExtraFamilyMembers,
      hasUserAccount: e.userId !== null,
    };
  }

  private toDetail(e: EmployeeWithRefs) {
    return {
      ...this.toSummary(e),
      nik: this.crypto.decrypt(e.nikEncrypted, CryptoContext.nik),
      baseSalary: this.crypto.decryptAmount(e.baseSalaryEncrypted, CryptoContext.baseSalary),
      bankAccountNumber: this.crypto.decryptNullable(e.bankAccountEncrypted, CryptoContext.bankAccount),
      npwp: this.crypto.decryptNullable(e.npwpEncrypted, CryptoContext.npwp),
    };
  }
}
