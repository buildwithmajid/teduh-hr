import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditContext, AuthUser } from '../common/auth-context';
import { CryptoContext, FieldCrypto } from '../common/crypto/field-crypto';
import { addDays, formatDateOnly, parseDateOnly } from '../common/dates';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { AssignSalaryComponentDto, CreateSalaryComponentDto, UpdateSalaryComponentDto } from './employees.dto';
import { EmployeesService } from './employees.service';

@Injectable()
export class SalaryComponentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: FieldCrypto,
    private readonly audit: AuditService,
    private readonly employees: EmployeesService,
  ) {}

  // ───────────── Katalog ─────────────

  list(companyId: string) {
    return this.prisma.salaryComponent.findMany({ where: { companyId }, orderBy: [{ type: 'asc' }, { code: 'asc' }] });
  }

  async create(companyId: string, ctx: AuditContext, dto: CreateSalaryComponentDto) {
    if (dto.type === 'deduction' && dto.isFixed) {
      throw new BadRequestException('Komponen potongan tidak bisa ditandai sebagai tunjangan tetap');
    }
    return this.prisma.$transaction(async (tx) => {
      const c = await tx.salaryComponent.create({ data: { ...dto, companyId } });
      await this.audit.record(tx, ctx, { tableName: 'salary_components', recordId: c.id, action: 'create', newValue: c });
      return c;
    });
  }

  /** code, type, isFixed, calculation tidak bisa diubah setelah dibuat karena memengaruhi histori payroll. */
  async update(companyId: string, ctx: AuditContext, id: string, dto: UpdateSalaryComponentDto) {
    const before = await this.prisma.salaryComponent.findFirst({ where: { id, companyId } });
    if (!before) throw new NotFoundException('Komponen gaji tidak ditemukan');
    return this.prisma.$transaction(async (tx) => {
      const after = await tx.salaryComponent.update({ where: { id }, data: dto });
      await this.audit.record(tx, ctx, { tableName: 'salary_components', recordId: id, action: 'update', oldValue: before, newValue: after });
      return after;
    });
  }

  // ───────────── Penugasan ke karyawan ─────────────

  async listForEmployee(user: AuthUser, ctx: AuditContext, employeeId: string) {
    await this.employees.findWithRefs(user.companyId, employeeId);
    if (employeeId !== user.employeeId) {
      await this.audit.recordStandalone(ctx, {
        tableName: 'employee_salary_components',
        recordId: employeeId,
        action: 'view_sensitive',
      });
    }
    return this.employees.listAssignmentsDecrypted(employeeId);
  }

  /**
   * Tetapkan nominal komponen mulai tanggal tertentu. Penugasan aktif sebelumnya untuk
   * komponen yang sama otomatis ditutup sehari sebelumnya, sehingga riwayat tidak tumpang-tindih.
   */
  async assign(user: AuthUser, ctx: AuditContext, employeeId: string, dto: AssignSalaryComponentDto) {
    const employee = await this.employees.findWithRefs(user.companyId, employeeId);
    if (employee.employmentStatus !== 'active') throw new ConflictException('Karyawan sudah tidak aktif');
    const component = await this.prisma.salaryComponent.findFirst({ where: { id: dto.componentId, companyId: user.companyId } });
    if (!component) throw new NotFoundException('Komponen gaji tidak ditemukan');
    if (!component.isActive) throw new BadRequestException('Komponen gaji sudah nonaktif');

    const effectiveFrom = parseDateOnly(dto.effectiveFrom);
    if (effectiveFrom < employee.joinDate) throw new BadRequestException('Tanggal mulai tidak boleh sebelum tanggal masuk');

    const existing = await this.prisma.employeeSalaryComponent.findMany({ where: { employeeId, componentId: dto.componentId } });
    const conflict = existing.find((e) => e.effectiveFrom >= effectiveFrom);
    if (conflict) {
      throw new BadRequestException(
        `Sudah ada penugasan komponen ini mulai ${formatDateOnly(conflict.effectiveFrom)}; tanggal mulai baru harus setelahnya`,
      );
    }
    const open = existing.filter((e) => e.effectiveTo === null || e.effectiveTo >= effectiveFrom);

    return this.prisma.$transaction(async (tx) => {
      const closeAt = addDays(effectiveFrom, -1);
      for (const prev of open) {
        await tx.employeeSalaryComponent.update({ where: { id: prev.id }, data: { effectiveTo: closeAt } });
      }
      const created = await tx.employeeSalaryComponent.create({
        data: {
          employeeId,
          componentId: dto.componentId,
          amountEncrypted: this.crypto.encryptAmount(dto.amount, CryptoContext.componentAmount),
          effectiveFrom,
        },
      });
      await this.audit.record(tx, ctx, {
        tableName: 'employee_salary_components',
        recordId: created.id,
        action: 'create',
        oldValue: open.length ? { closed: open.map((p) => ({ id: p.id, effectiveTo: formatDateOnly(closeAt) })) } : undefined,
        newValue: created,
      });
      return { id: created.id, componentId: dto.componentId, amount: dto.amount, effectiveFrom: dto.effectiveFrom, effectiveTo: null };
    });
  }

  async end(user: AuthUser, ctx: AuditContext, employeeId: string, assignmentId: string, effectiveToStr: string) {
    await this.employees.findWithRefs(user.companyId, employeeId);
    const row = await this.prisma.employeeSalaryComponent.findFirst({ where: { id: assignmentId, employeeId } });
    if (!row) throw new NotFoundException('Penugasan komponen tidak ditemukan');
    if (row.effectiveTo) throw new ConflictException('Penugasan ini sudah berakhir');
    const effectiveTo = parseDateOnly(effectiveToStr);
    if (effectiveTo < row.effectiveFrom) throw new BadRequestException('Tanggal akhir tidak boleh sebelum tanggal mulai');

    return this.prisma.$transaction(async (tx) => {
      const after = await tx.employeeSalaryComponent.update({ where: { id: assignmentId }, data: { effectiveTo } });
      await this.audit.record(tx, ctx, {
        tableName: 'employee_salary_components',
        recordId: assignmentId,
        action: 'update',
        oldValue: row,
        newValue: after,
      });
      return { id: assignmentId, effectiveTo: effectiveToStr };
    });
  }
}
