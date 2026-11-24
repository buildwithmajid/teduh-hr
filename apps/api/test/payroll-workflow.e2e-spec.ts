/**
 * E2E Fase 2–5 — menguji alur operasional & finansial penuh:
 *   Reimbursement (2-step approval) → Run Payroll → Approval & Lock (Separation of Duties + DB Trigger)
 *   → Slip Gaji Digital & Privasi → Export CSV Finance (Bank, BPJS, PPh 21) → Dashboard Analytics.
 *
 * Jalankan: npm run test:e2e -w @hris/api
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { authenticator } from 'otplib';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/main';

const PASSWORD = process.env.SEED_DEFAULT_PASSWORD ?? '';
const runTag = Date.now().toString().slice(-6);

async function loginAccount(app: INestApplication, prisma: PrismaClient, email: string): Promise<string> {
  await prisma.user.update({
    where: { email },
    data: { mfaEnabled: false, mfaSecretEncrypted: null, mfaPendingEncrypted: null, failedLoginCount: 0, lockedUntil: null },
  });

  const res = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ email, password: PASSWORD })
    .expect(200);

  if (res.body.status === 'ok') return res.body.accessToken as string;

  const { mfaToken } = res.body as { mfaToken: string };
  const setup = await request(app.getHttpServer()).post('/api/auth/mfa/setup').send({ mfaToken }).expect(200);
  const enabled = await request(app.getHttpServer())
    .post('/api/auth/mfa/enable')
    .send({ mfaToken, code: authenticator.generate(setup.body.secret) })
    .expect(200);
  return enabled.body.accessToken as string;
}

describe('HRIS API — Fase 2–5 Payroll, Approval & Export (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let staffToken: string;
  let managerToken: string;
  let hrToken: string;
  let financeToken: string;

  let reimbursementId: string;
  let periodId: string;
  let staffDetailId: string;
  let otherDetailId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app, ['http://localhost:3001']);
    await app.init();

    staffToken = await loginAccount(app, prisma, 'staff@ruangteduh.test');
    managerToken = await loginAccount(app, prisma, 'manager@ruangteduh.test');
    hrToken = await loginAccount(app, prisma, 'hr@ruangteduh.test');
    financeToken = await loginAccount(app, prisma, 'finance@ruangteduh.test');
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('Reimbursement: Staff ajukan → Manager approve step 1 → Finance approve step 2', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/reimbursements')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        category: 'transport',
        title: `E2E Transport ${runTag}`,
        expenseDate: '2026-11-20',
        amount: 150_000,
        description: 'Kunjungan lokasi proyek E2E',
        receiptRef: `RCP-${runTag}`,
      })
      .expect(201);

    reimbursementId = created.body.id;
    expect(created.body.status).toBe('pending');
    expect(created.body.amount).toBe(150_000);

    // Step 1: muncul di inbox Manager
    const mgrInbox = await request(app.getHttpServer())
      .get('/api/approvals/pending')
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200);
    expect(mgrInbox.body.some((x: { requestId: string }) => x.requestId === reimbursementId)).toBe(true);

    const step1 = await request(app.getHttpServer())
      .post(`/api/reimbursements/${reimbursementId}/approve`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ notes: 'Disetujui atasan E2E' })
      .expect(200);
    expect(step1.body.status).toBe('pending');
    expect(step1.body.currentApprovalStep).toBe(2);

    // Step 2: muncul di inbox Finance
    const finInbox = await request(app.getHttpServer())
      .get('/api/approvals/pending')
      .set('Authorization', `Bearer ${financeToken}`)
      .expect(200);
    expect(finInbox.body.some((x: { requestId: string }) => x.requestId === reimbursementId)).toBe(true);

    const step2 = await request(app.getHttpServer())
      .post(`/api/reimbursements/${reimbursementId}/approve`)
      .set('Authorization', `Bearer ${financeToken}`)
      .send({ notes: 'Disetujui Finance E2E' })
      .expect(200);
    expect(step2.body.status).toBe('approved');
  });

  it('Payroll Run: HR hitung batch (termasuk reimbursement) → ajukan → Finance setujui & kunci', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/payroll/periods')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({
        year: 2027,
        month: 1,
        runType: 'regular',
        attendanceStart: '2027-01-01',
        attendanceEnd: '2027-01-31',
        payDate: '2027-01-25',
        isFinalTaxPeriod: false,
      })
      .expect(201);

    periodId = created.body.id;
    expect(created.body.employeeCount).toBeGreaterThanOrEqual(16);

    const detail = await request(app.getHttpServer())
      .get(`/api/payroll/periods/${periodId}`)
      .set('Authorization', `Bearer ${hrToken}`)
      .expect(200);

    expect(detail.body.totals.netSalary).toBeGreaterThan(0);
    expect(detail.body.totals.totalCompanyCost).toBeGreaterThan(detail.body.totals.netSalary);
    expect(detail.body.departmentReport.length).toBeGreaterThan(0);

    const staffItem = detail.body.items.find((i: { employee: { employeeCode: string } }) => i.employee.employeeCode === 'RTK-0006');
    const otherItem = detail.body.items.find((i: { employee: { employeeCode: string } }) => i.employee.employeeCode !== 'RTK-0006');
    expect(staffItem).toBeDefined();
    expect(staffItem.irregularIncome).toBeGreaterThanOrEqual(150_000);
    staffDetailId = staffItem.id;
    otherDetailId = otherItem.id;

    // HR ajukan ke Finance
    await request(app.getHttpServer())
      .post(`/api/payroll/periods/${periodId}/submit`)
      .set('Authorization', `Bearer ${hrToken}`)
      .expect(200);

    // HR tidak boleh approve sendiri
    await request(app.getHttpServer())
      .post(`/api/payroll/periods/${periodId}/approve`)
      .set('Authorization', `Bearer ${hrToken}`)
      .expect(403);

    // Finance approve & lock
    const locked = await request(app.getHttpServer())
      .post(`/api/payroll/periods/${periodId}/approve`)
      .set('Authorization', `Bearer ${financeToken}`)
      .expect(200);
    expect(locked.body.status).toBe('locked');

    // Reimbursement otomatis ditandai dibayar pada periode ini
    const reimbRow = await prisma.reimbursement.findUniqueOrThrow({ where: { id: reimbursementId } });
    expect(reimbRow.paidPayrollPeriodId).toBe(periodId);

    // Trigger DB memblokir perubahan pada periode yang sudah dikunci
    await expect(
      prisma.$executeRawUnsafe(`UPDATE payroll_periods SET rejection_notes = 'hack' WHERE id = '${periodId}'`),
    ).rejects.toThrow();
  });

  it('Slip Gaji: Staff bisa melihat slip sendiri, tapi ditolak melihat slip karyawan lain', async () => {
    const list = await request(app.getHttpServer())
      .get('/api/payroll/payslips/me')
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200);
    expect(list.body.some((p: { id: string }) => p.id === staffDetailId)).toBe(true);

    const slip = await request(app.getHttpServer())
      .get(`/api/payroll/payslips/${staffDetailId}`)
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200);
    expect(slip.body.company.name).toBe('PT Ruang Teduh Karya');
    expect(slip.body.summary.netSalary).toBeGreaterThan(0);

    await request(app.getHttpServer())
      .get(`/api/payroll/payslips/${otherDetailId}`)
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(403);
  });

  it('Finance Export CSV (bank, bpjs, pph21) & Dashboard Analytics', async () => {
    for (const type of ['bank', 'bpjs', 'pph21'] as const) {
      const res = await request(app.getHttpServer())
        .get(`/api/payroll/periods/${periodId}/export?type=${type}`)
        .set('Authorization', `Bearer ${financeToken}`)
        .expect(200);
      expect(res.headers['content-type']).toMatch(/text\/csv/i);
      expect(res.text).toContain('RTK-0006');
    }

    const analytics = await request(app.getHttpServer())
      .get('/api/payroll/analytics')
      .set('Authorization', `Bearer ${financeToken}`)
      .expect(200);
    expect(analytics.body.counts.locked).toBeGreaterThanOrEqual(1);
    expect(analytics.body.series.length).toBeGreaterThanOrEqual(1);
  });
});
