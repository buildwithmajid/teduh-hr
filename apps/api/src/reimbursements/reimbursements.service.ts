import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ReimbursementCategory, RequestStatus } from '@prisma/client';
import { ApprovalsService } from '../approvals/approvals.service';
import { AuditService } from '../audit/audit.service';
import { AuditContext, AuthUser } from '../common/auth-context';
import { formatDateOnly, parseDateOnly } from '../common/dates';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReimbursementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly approvals: ApprovalsService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(
    user: AuthUser,
    ctx: AuditContext,
    dto: {
      category: ReimbursementCategory;
      title: string;
      expenseDate: string;
      amount: number;
      description: string;
      receiptRef?: string;
    },
  ) {
    if (!user.employeeId) throw new ForbiddenException('Akun Anda tidak terhubung ke data karyawan');
    if (dto.amount <= 0) throw new BadRequestException('Nominal reimbursement harus lebih dari Rp 0');

    const workflow = await this.approvals.getActiveWorkflow(user.companyId, 'reimbursement');
    const firstStep = workflow.steps[0];
    if (!firstStep) throw new BadRequestException('Alur persetujuan reimbursement belum memiliki step');

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.reimbursement.create({
        data: {
          companyId: user.companyId,
          employeeId: user.employeeId!,
          category: dto.category,
          title: dto.title.trim(),
          expenseDate: parseDateOnly(dto.expenseDate),
          amount: new Prisma.Decimal(Math.round(dto.amount)),
          description: dto.description.trim(),
          receiptRef: dto.receiptRef?.trim() || null,
          status: 'pending',
          workflowId: workflow.id,
          currentApprovalStep: 1,
        },
      });

      await this.audit.record(tx, ctx, {
        tableName: 'reimbursements',
        recordId: created.id,
        action: 'create',
        newValue: { category: dto.category, title: created.title, amount: dto.amount },
      });

      const approvers = await this.approvals.resolveStepApprovers(
        user.companyId,
        user.employeeId!,
        firstStep,
        'reimbursement',
        tx,
      );
      await this.notifications.createMany(
        tx,
        approvers.map((a) => ({
          userId: a.userId,
          type: 'approval_needed',
          title: 'Pengajuan reimbursement baru',
          message: `Klaim "${created.title}" sebesar Rp ${Math.round(dto.amount).toLocaleString('id-ID')} menunggu persetujuan.`,
          linkUrl: '/approvals',
        })),
      );

      return this.serialize(created);
    });
  }

  async listMine(user: AuthUser) {
    if (!user.employeeId) return [];
    const rows = await this.prisma.reimbursement.findMany({
      where: { companyId: user.companyId, employeeId: user.employeeId },
      include: { paidPayrollPeriod: { select: { id: true, year: true, month: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.serialize(r));
  }

  async listCompany(companyId: string, status?: RequestStatus) {
    const rows = await this.prisma.reimbursement.findMany({
      where: { companyId, ...(status ? { status } : {}) },
      include: {
        employee: { select: { id: true, fullName: true, employeeCode: true, department: { select: { name: true } } } },
        paidPayrollPeriod: { select: { id: true, year: true, month: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({
      ...this.serialize(r),
      employee: {
        id: r.employee.id,
        fullName: r.employee.fullName,
        employeeCode: r.employee.employeeCode,
        department: r.employee.department.name,
      },
    }));
  }

  async decide(
    actor: AuthUser,
    ctx: AuditContext,
    id: string,
    action: 'approved' | 'rejected',
    notes?: string,
  ) {
    const req = await this.prisma.reimbursement.findFirst({
      where: { id, companyId: actor.companyId },
      include: {
        employee: { select: { userId: true } },
        workflow: { include: { steps: { orderBy: { stepOrder: 'asc' } } } },
      },
    });
    if (!req) throw new NotFoundException('Klaim reimbursement tidak ditemukan');
    if (req.status !== 'pending') throw new ConflictException('Klaim sudah diproses sebelumnya');

    const step = req.workflow.steps.find((s) => s.stepOrder === req.currentApprovalStep);
    if (!step) throw new BadRequestException('Step persetujuan tidak valid');

    const approvers = await this.approvals.resolveStepApprovers(
      actor.companyId,
      req.employeeId,
      step,
      'reimbursement',
    );
    const match = approvers.find((a) => a.userId === actor.userId);
    if (!match) throw new ForbiddenException('Anda bukan approver untuk step ini');

    const nextStep = req.workflow.steps.find((s) => s.stepOrder === req.currentApprovalStep + 1);
    const isFinalApprove = action === 'approved' && !nextStep;
    const newStatus: RequestStatus = action === 'rejected' ? 'rejected' : isFinalApprove ? 'approved' : 'pending';

    return this.prisma.$transaction(async (tx) => {
      await tx.approvalLog.create({
        data: {
          requestType: 'reimbursement',
          requestId: req.id,
          stepId: step.id,
          approverId: actor.userId,
          onBehalfOf: match.onBehalfOf,
          action,
          notes: notes?.trim() || null,
        },
      });

      const updated = await tx.reimbursement.update({
        where: { id: req.id },
        data: {
          status: newStatus,
          currentApprovalStep: action === 'approved' && nextStep ? nextStep.stepOrder : req.currentApprovalStep,
        },
      });

      await this.audit.record(tx, ctx, {
        tableName: 'reimbursements',
        recordId: req.id,
        action: 'update',
        oldValue: { status: req.status, step: req.currentApprovalStep },
        newValue: { status: updated.status, step: updated.currentApprovalStep, notes: notes ?? null },
      });

      if (action === 'approved' && nextStep) {
        const nextApprovers = await this.approvals.resolveStepApprovers(
          actor.companyId,
          req.employeeId,
          nextStep,
          'reimbursement',
          tx,
        );
        await this.notifications.createMany(
          tx,
          nextApprovers.map((a) => ({
            userId: a.userId,
            type: 'approval_needed',
            title: 'Verifikasi reimbursement diperlukan',
            message: `Klaim "${req.title}" telah disetujui atasan dan menunggu persetujuan tahap ${nextStep.stepOrder}.`,
            linkUrl: '/approvals',
          })),
        );
      } else if (req.employee.userId) {
        await this.notifications.createMany(tx, [
          {
            userId: req.employee.userId,
            type: action === 'approved' ? 'request_approved' : 'request_rejected',
            title: action === 'approved' ? 'Reimbursement disetujui' : 'Reimbursement ditolak',
            message:
              action === 'approved'
                ? `Klaim "${req.title}" disetujui dan akan dibayarkan pada payroll reguler berikutnya.`
                : `Klaim "${req.title}" ditolak.${notes ? ` Catatan: ${notes}` : ''}`,
            linkUrl: '/reimbursements',
          },
        ]);
      }

      return this.serialize(updated);
    });
  }

  async cancel(user: AuthUser, ctx: AuditContext, id: string) {
    const req = await this.prisma.reimbursement.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!req) throw new NotFoundException('Klaim reimbursement tidak ditemukan');
    if (req.employeeId !== user.employeeId) throw new ForbiddenException('Hanya pemohon yang dapat membatalkan klaim');
    if (req.status !== 'pending') throw new ConflictException('Hanya klaim berstatus menunggu yang bisa dibatalkan');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.reimbursement.update({
        where: { id: req.id },
        data: { status: 'cancelled' },
      });
      await this.audit.record(tx, ctx, {
        tableName: 'reimbursements',
        recordId: req.id,
        action: 'update',
        oldValue: { status: req.status },
        newValue: { status: 'cancelled' },
      });
      return this.serialize(updated);
    });
  }

  private serialize(r: {
    id: string;
    category: ReimbursementCategory;
    title: string;
    expenseDate: Date;
    amount: Prisma.Decimal;
    description: string;
    receiptRef: string | null;
    status: RequestStatus;
    currentApprovalStep: number;
    paidPayrollPeriodId: string | null;
    paidPayrollPeriod?: { id: string; year: number; month: number } | null;
    createdAt: Date;
  }) {
    return {
      id: r.id,
      category: r.category,
      title: r.title,
      expenseDate: formatDateOnly(r.expenseDate),
      amount: Number(r.amount),
      description: r.description,
      receiptRef: r.receiptRef,
      status: r.status,
      currentApprovalStep: r.currentApprovalStep,
      paidPayrollPeriodId: r.paidPayrollPeriodId,
      paidPayrollPeriod: r.paidPayrollPeriod ?? null,
      createdAt: r.createdAt,
    };
  }
}
