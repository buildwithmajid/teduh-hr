import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ApprovalAction,
  ApprovalRequestType,
  ApprovalStep,
  ApproverType,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuditContext, AuthUser } from '../common/auth-context';
import { formatDateOnly, parseDateOnly, todayIn } from '../common/dates';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService, Tx } from '../prisma/prisma.service';

export interface ResolvedApprover {
  userId: string;
  onBehalfOf: string | null;
}

export interface SaveWorkflowInput {
  requestType: ApprovalRequestType;
  name: string;
  steps: {
    approverType: ApproverType;
    approverRoleId?: string | null;
    fallbackRoleId?: string | null;
    escalateAfterHours?: number | null;
  }[];
}

export interface CreateDelegationInput {
  delegateId: string;
  startDate: string;
  endDate: string;
  requestTypes?: string[];
}

@Injectable()
export class ApprovalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  // ───────────── Workflow Config ─────────────

  listWorkflows(companyId: string) {
    return this.prisma.approvalWorkflow.findMany({
      where: { companyId, isActive: true },
      include: {
        steps: {
          orderBy: { stepOrder: 'asc' },
          include: {
            approverRole: { select: { id: true, name: true } },
            fallbackRole: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { requestType: 'asc' },
    });
  }

  async getActiveWorkflow(companyId: string, requestType: ApprovalRequestType, tx: Tx = this.prisma) {
    const wf = await tx.approvalWorkflow.findFirst({
      where: { companyId, requestType, isActive: true },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
    });
    if (!wf || wf.steps.length === 0) {
      throw new BadRequestException(`Workflow persetujuan aktif untuk "${requestType}" belum dikonfigurasi`);
    }
    return wf;
  }

  /** Perubahan workflow selalu membuat versi baru agar pengajuan berjalan tetap memakai versi lamanya. */
  async saveWorkflow(companyId: string, ctx: AuditContext, dto: SaveWorkflowInput) {
    if (dto.steps.length === 0) throw new BadRequestException('Minimal satu level persetujuan diperlukan');
    for (const s of dto.steps) {
      if (s.approverType === 'role' && !s.approverRoleId) {
        throw new BadRequestException('Approver bertipe role wajib memilih role');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const latest = await tx.approvalWorkflow.findFirst({
        where: { companyId, requestType: dto.requestType },
        orderBy: { version: 'desc' },
      });
      if (latest) {
        await tx.approvalWorkflow.updateMany({
          where: { companyId, requestType: dto.requestType, isActive: true },
          data: { isActive: false },
        });
      }
      const created = await tx.approvalWorkflow.create({
        data: {
          companyId,
          requestType: dto.requestType,
          name: dto.name.trim(),
          version: (latest?.version ?? 0) + 1,
          isActive: true,
          steps: {
            create: dto.steps.map((s, idx) => ({
              stepOrder: idx + 1,
              approverType: s.approverType,
              approverRoleId: s.approverType === 'role' ? s.approverRoleId! : null,
              fallbackRoleId: s.fallbackRoleId ?? null,
              escalateAfterHours: s.escalateAfterHours ?? null,
            })),
          },
        },
        include: { steps: { orderBy: { stepOrder: 'asc' } } },
      });

      await this.audit.record(tx, ctx, {
        tableName: 'approval_workflows',
        recordId: created.id,
        action: 'create',
        newValue: created,
      });
      return created;
    });
  }

  // ───────────── Approver Resolution Engine ─────────────

  /**
   * Menentukan daftar user yang berhak menyetujui step tertentu.
   * - Pemohon tidak boleh menyetujui pengajuannya sendiri (otomatis jatuh ke fallbackRoleId).
   * - Jika approver utama sedang mendelegasikan hari ini, delegasi ikut berhak (dengan onBehalfOf).
   */
  async resolveStepApprovers(
    companyId: string,
    employeeId: string,
    step: Pick<ApprovalStep, 'approverType' | 'approverRoleId' | 'fallbackRoleId'>,
    requestType: ApprovalRequestType,
    tx: Tx = this.prisma,
  ): Promise<ResolvedApprover[]> {
    const emp = await tx.employee.findFirst({
      where: { id: employeeId, companyId },
      select: {
        userId: true,
        supervisor: { select: { userId: true, user: { select: { isActive: true } } } },
        department: { select: { head: { select: { userId: true, user: { select: { isActive: true } } } } } },
      },
    });
    if (!emp) return [];

    const requesterUserId = emp.userId;
    let primaryIds: string[] = [];

    if (step.approverType === 'direct_supervisor') {
      if (emp.supervisor?.userId && emp.supervisor.user?.isActive) primaryIds = [emp.supervisor.userId];
    } else if (step.approverType === 'department_head') {
      if (emp.department?.head?.userId && emp.department.head.user?.isActive) primaryIds = [emp.department.head.userId];
    } else if (step.approverType === 'role' && step.approverRoleId) {
      const holders = await tx.userRole.findMany({
        where: { companyId, roleId: step.approverRoleId, user: { isActive: true } },
        select: { userId: true },
      });
      primaryIds = holders.map((h) => h.userId);
    }

    // Cegah self-approval
    primaryIds = primaryIds.filter((uid) => uid !== requesterUserId);

    // Fallback ke fallbackRoleId bila tidak ada approver yang valid
    if (primaryIds.length === 0 && step.fallbackRoleId) {
      const fallbacks = await tx.userRole.findMany({
        where: { companyId, roleId: step.fallbackRoleId, user: { isActive: true } },
        select: { userId: true },
      });
      primaryIds = fallbacks.map((f) => f.userId).filter((uid) => uid !== requesterUserId);
    }

    const result = new Map<string, ResolvedApprover>();
    for (const uid of primaryIds) result.set(uid, { userId: uid, onBehalfOf: null });

    // Cek delegasi aktif hari ini
    if (primaryIds.length > 0) {
      const today = parseDateOnly(todayIn());
      const delegations = await tx.approvalDelegation.findMany({
        where: {
          companyId,
          delegatorId: { in: primaryIds },
          startDate: { lte: today },
          endDate: { gte: today },
          delegate: { isActive: true },
        },
      });
      for (const del of delegations) {
        if (del.delegateId === requesterUserId) continue;
        if (del.requestTypes.length > 0 && !del.requestTypes.includes(requestType)) continue;
        if (!result.has(del.delegateId)) {
          result.set(del.delegateId, { userId: del.delegateId, onBehalfOf: del.delegatorId });
        }
      }
    }

    return [...result.values()];
  }

  async assertCanAct(
    companyId: string,
    employeeId: string,
    workflowId: string,
    stepOrder: number,
    requestType: ApprovalRequestType,
    actorUserId: string,
    tx: Tx = this.prisma,
  ): Promise<{ step: ApprovalStep; totalSteps: number; onBehalfOf: string | null }> {
    const steps = await tx.approvalStep.findMany({
      where: { workflowId },
      orderBy: { stepOrder: 'asc' },
    });
    const step = steps.find((s) => s.stepOrder === stepOrder);
    if (!step) throw new BadRequestException('Level persetujuan tidak valid');

    const approvers = await this.resolveStepApprovers(companyId, employeeId, step, requestType, tx);
    const match = approvers.find((a) => a.userId === actorUserId);
    if (!match) {
      throw new ForbiddenException('Anda bukan approver yang berwenang untuk tahap pengajuan ini');
    }
    return { step, totalSteps: steps.length, onBehalfOf: match.onBehalfOf };
  }

  async recordDecision(
    tx: Tx,
    ctx: AuditContext,
    input: {
      requestType: ApprovalRequestType;
      requestId: string;
      stepId: string;
      approverId: string;
      onBehalfOf: string | null;
      action: ApprovalAction;
      notes?: string | null;
    },
  ) {
    const log = await tx.approvalLog.create({
      data: {
        requestType: input.requestType,
        requestId: input.requestId,
        stepId: input.stepId,
        approverId: input.approverId,
        onBehalfOf: input.onBehalfOf,
        action: input.action,
        notes: input.notes ?? null,
      },
    });
    await this.audit.record(tx, ctx, {
      tableName: 'approval_logs',
      recordId: log.id,
      action: 'create',
      newValue: log,
    });
    return log;
  }

  async notifyStepApprovers(
    tx: Tx,
    companyId: string,
    employeeId: string,
    workflowId: string,
    stepOrder: number,
    requestType: ApprovalRequestType,
    title: string,
    message: string,
    linkUrl = '/approvals',
  ) {
    const step = await tx.approvalStep.findFirst({ where: { workflowId, stepOrder } });
    if (!step) return;
    const approvers = await this.resolveStepApprovers(companyId, employeeId, step, requestType, tx);
    await this.notifications.createMany(
      tx,
      approvers.map((a) => ({
        userId: a.userId,
        type: `${requestType}_approval_needed`,
        title,
        message,
        linkUrl,
      })),
    );
  }

  // ───────────── Unified Pending Inbox ─────────────

  async listPendingForUser(user: AuthUser) {
    const [leaves, overtimes, corrections, reimbursements] = await Promise.all([
      this.prisma.leaveRequest.findMany({
        where: { status: 'pending', employee: { companyId: user.companyId } },
        include: {
          employee: { select: { id: true, fullName: true, employeeCode: true, department: { select: { name: true } } } },
          leaveType: { select: { id: true, name: true, code: true } },
          workflow: { include: { steps: { orderBy: { stepOrder: 'asc' } } } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.overtimeEntry.findMany({
        where: { status: 'pending', employee: { companyId: user.companyId } },
        include: {
          employee: { select: { id: true, fullName: true, employeeCode: true, department: { select: { name: true } } } },
          workflow: { include: { steps: { orderBy: { stepOrder: 'asc' } } } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.attendanceCorrection.findMany({
        where: { status: 'pending', employee: { companyId: user.companyId } },
        include: {
          employee: { select: { id: true, fullName: true, employeeCode: true, department: { select: { name: true } } } },
          workflow: { include: { steps: { orderBy: { stepOrder: 'asc' } } } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.reimbursement.findMany({
        where: { status: 'pending', companyId: user.companyId },
        include: {
          employee: { select: { id: true, fullName: true, employeeCode: true, department: { select: { name: true } } } },
          workflow: { include: { steps: { orderBy: { stepOrder: 'asc' } } } },
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const items: {
      requestType: ApprovalRequestType;
      requestId: string;
      employee: { id: string; fullName: string; employeeCode: string; department: string };
      title: string;
      subtitle: string;
      reason: string;
      stepOrder: number;
      totalSteps: number;
      onBehalfOf: string | null;
      attachmentKey: string | null;
      createdAt: Date;
    }[] = [];

    for (const r of leaves) {
      const step = r.workflow.steps.find((s) => s.stepOrder === r.currentApprovalStep);
      if (!step) continue;
      const approvers = await this.resolveStepApprovers(user.companyId, r.employeeId, step, 'leave');
      const match = approvers.find((a) => a.userId === user.userId);
      if (!match) continue;
      items.push({
        requestType: 'leave',
        requestId: r.id,
        employee: {
          id: r.employee.id,
          fullName: r.employee.fullName,
          employeeCode: r.employee.employeeCode,
          department: r.employee.department.name,
        },
        title: `${r.leaveType.name} (${Number(r.totalDays)} hari)`,
        subtitle: `${formatDateOnly(r.startDate)} – ${formatDateOnly(r.endDate)}${r.isHalfDay ? ' · Setengah hari' : ''}`,
        reason: r.reason,
        stepOrder: r.currentApprovalStep,
        totalSteps: r.workflow.steps.length,
        onBehalfOf: match.onBehalfOf,
        attachmentKey: r.attachmentKey ?? null,
        createdAt: r.createdAt,
      });
    }

    for (const r of overtimes) {
      const step = r.workflow.steps.find((s) => s.stepOrder === r.currentApprovalStep);
      if (!step) continue;
      const approvers = await this.resolveStepApprovers(user.companyId, r.employeeId, step, 'overtime');
      const match = approvers.find((a) => a.userId === user.userId);
      if (!match) continue;
      items.push({
        requestType: 'overtime',
        requestId: r.id,
        employee: {
          id: r.employee.id,
          fullName: r.employee.fullName,
          employeeCode: r.employee.employeeCode,
          department: r.employee.department.name,
        },
        title: `Lembur (${Number(r.hours)} jam)`,
        subtitle: `${formatDateOnly(r.workDate)} · ${r.dayType}`,
        reason: r.reason,
        stepOrder: r.currentApprovalStep,
        totalSteps: r.workflow.steps.length,
        onBehalfOf: match.onBehalfOf,
        attachmentKey: null,
        createdAt: r.createdAt,
      });
    }

    for (const r of corrections) {
      const step = r.workflow.steps.find((s) => s.stepOrder === r.currentApprovalStep);
      if (!step) continue;
      const approvers = await this.resolveStepApprovers(user.companyId, r.employeeId, step, 'attendance_correction');
      const match = approvers.find((a) => a.userId === user.userId);
      if (!match) continue;
      items.push({
        requestType: 'attendance_correction',
        requestId: r.id,
        employee: {
          id: r.employee.id,
          fullName: r.employee.fullName,
          employeeCode: r.employee.employeeCode,
          department: r.employee.department.name,
        },
        title: 'Koreksi absensi',
        subtitle: `Tanggal ${formatDateOnly(r.workDate)}`,
        reason: r.reason,
        stepOrder: r.currentApprovalStep,
        totalSteps: r.workflow.steps.length,
        onBehalfOf: match.onBehalfOf,
        attachmentKey: null,
        createdAt: r.createdAt,
      });
    }

    for (const r of reimbursements) {
      const step = r.workflow.steps.find((s) => s.stepOrder === r.currentApprovalStep);
      if (!step) continue;
      const approvers = await this.resolveStepApprovers(user.companyId, r.employeeId, step, 'reimbursement');
      const match = approvers.find((a) => a.userId === user.userId);
      if (!match) continue;
      items.push({
        requestType: 'reimbursement',
        requestId: r.id,
        employee: {
          id: r.employee.id,
          fullName: r.employee.fullName,
          employeeCode: r.employee.employeeCode,
          department: r.employee.department.name,
        },
        title: `Reimbursement: ${r.title}`,
        subtitle: `Rp ${Number(r.amount).toLocaleString('id-ID')} · ${formatDateOnly(r.expenseDate)}`,
        reason: r.description,
        stepOrder: r.currentApprovalStep,
        totalSteps: r.workflow.steps.length,
        onBehalfOf: match.onBehalfOf,
        attachmentKey: r.receiptRef?.startsWith('file:') ? r.receiptRef.slice(5) : null,
        createdAt: r.createdAt,
      });
    }

    return items.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  // ───────────── Delegations ─────────────

  listDelegations(user: AuthUser) {
    return this.prisma.approvalDelegation.findMany({
      where: { companyId: user.companyId, OR: [{ delegatorId: user.userId }, { delegateId: user.userId }] },
      include: {
        delegator: { select: { id: true, email: true, employee: { select: { fullName: true } } } },
        delegate: { select: { id: true, email: true, employee: { select: { fullName: true } } } },
      },
      orderBy: { startDate: 'desc' },
    });
  }

  async createDelegation(user: AuthUser, ctx: AuditContext, dto: CreateDelegationInput) {
    if (dto.delegateId === user.userId) throw new BadRequestException('Tidak bisa mendelegasikan ke diri sendiri');
    const startDate = parseDateOnly(dto.startDate);
    const endDate = parseDateOnly(dto.endDate);
    if (endDate < startDate) throw new BadRequestException('Tanggal akhir harus >= tanggal mulai');

    const delegate = await this.prisma.user.findFirst({
      where: { id: dto.delegateId, isActive: true, userRoles: { some: { companyId: user.companyId } } },
    });
    if (!delegate) throw new NotFoundException('User penerima delegasi tidak ditemukan');

    return this.prisma.$transaction(async (tx) => {
      const row = await tx.approvalDelegation.create({
        data: {
          companyId: user.companyId,
          delegatorId: user.userId,
          delegateId: dto.delegateId,
          startDate,
          endDate,
          requestTypes: dto.requestTypes ?? [],
        },
      });
      await this.audit.record(tx, ctx, {
        tableName: 'approval_delegations',
        recordId: row.id,
        action: 'create',
        newValue: row,
      });
      return row;
    });
  }

  async deleteDelegation(user: AuthUser, ctx: AuditContext, id: string) {
    const row = await this.prisma.approvalDelegation.findFirst({
      where: { id, companyId: user.companyId, delegatorId: user.userId },
    });
    if (!row) throw new NotFoundException('Delegasi tidak ditemukan');
    await this.prisma.$transaction(async (tx) => {
      await tx.approvalDelegation.delete({ where: { id } });
      await this.audit.record(tx, ctx, {
        tableName: 'approval_delegations',
        recordId: id,
        action: 'delete',
        oldValue: row,
      });
    });
  }
}
