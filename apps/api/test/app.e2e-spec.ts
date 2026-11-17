/**
 * E2E Fase 1 — butuh database yang sudah dimigrasi & di-seed:
 *   npm run db:migrate && npm run db:seed && npm run test:e2e
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { authenticator } from 'otplib';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/main';

const PASSWORD = process.env.SEED_DEFAULT_PASSWORD ?? '';
const run = Date.now().toString().slice(-8);

describe('HRIS API — Fase 1 (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let hrToken: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    // HR selalu mulai dari kondisi belum enrol MFA supaya alur setup bisa diuji berulang.
    await prisma.user.update({
      where: { email: 'hr@contoh.test' },
      data: { mfaEnabled: false, mfaSecretEncrypted: null, mfaPendingEncrypted: null, failedLoginCount: 0, lockedUntil: null },
    });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app, ['http://localhost:3001']);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('health check', async () => {
    await request(app.getHttpServer()).get('/api/health').expect(200, { status: 'ok' });
  });

  it('menolak request tanpa token', async () => {
    await request(app.getHttpServer()).get('/api/employees').expect(401);
  });

  it('staff: login tanpa MFA, lihat profil sendiri, tapi tidak bisa melihat daftar karyawan', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'staff@contoh.test', password: PASSWORD })
      .expect(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.refreshToken).toBeUndefined(); // refresh token hanya di cookie
    expect(res.headers['set-cookie'][0]).toMatch(/hris_rt=.*HttpOnly/i);
    const token = res.body.accessToken;

    const me = await request(app.getHttpServer()).get('/api/employees/me').set('Authorization', `Bearer ${token}`).expect(200);
    expect(me.body.employeeCode).toBe('EMP-0005');
    expect(me.body.baseSalary).toBe(8_000_000);
    expect(me.body.salaryComponents.length).toBeGreaterThan(0);

    await request(app.getHttpServer()).get('/api/employees').set('Authorization', `Bearer ${token}`).expect(403);
  });

  it('password salah ditolak dengan pesan generik', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'tidak-ada@contoh.test', password: 'salah-sekali-123' })
      .expect(401);
    expect(res.body.message).toBe('Email atau password salah');
  });

  it('HR: wajib enrol MFA sebelum dapat token', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'hr@contoh.test', password: PASSWORD })
      .expect(200);
    expect(res.body.status).toBe('mfa_setup_required');
    const { mfaToken } = res.body;

    const setup = await request(app.getHttpServer()).post('/api/auth/mfa/setup').send({ mfaToken }).expect(200);
    expect(setup.body.otpauthUrl).toMatch(/^otpauth:\/\/totp\//);

    await request(app.getHttpServer()).post('/api/auth/mfa/enable').send({ mfaToken, code: '000000' }).expect(401);

    const enabled = await request(app.getHttpServer())
      .post('/api/auth/mfa/enable')
      .send({ mfaToken, code: authenticator.generate(setup.body.secret) })
      .expect(200);
    hrToken = enabled.body.accessToken;
    expect(hrToken).toBeTruthy();
  });

  it('HR: membuat karyawan, data sensitif terenkripsi di DB & bisa dicari lewat NIK', async () => {
    const auth = { Authorization: `Bearer ${hrToken}` };
    const depts = await request(app.getHttpServer()).get('/api/departments').set(auth).expect(200);
    const eng = depts.body.find((x: { name: string }) => x.name === 'Engineering');
    const positions = await request(app.getHttpServer()).get(`/api/positions?departmentId=${eng.id}`).set(auth).expect(200);
    const engineer = positions.body.find((p: { title: string }) => p.title === 'Software Engineer');

    const nik = `3171${run.padStart(12, '9')}`.slice(0, 16);
    const created = await request(app.getHttpServer())
      .post('/api/employees')
      .set(auth)
      .send({
        employeeCode: `E2E-${run}`,
        fullName: 'Karyawan E2E',
        nik,
        gender: 'male',
        birthDate: '1998-01-15',
        joinDate: '2026-11-02',
        contractType: 'probation',
        probationEndDate: '2027-02-01',
        departmentId: eng.id,
        positionId: engineer.id,
        ptkpStatus: 'TK/0',
        baseSalary: 7_500_000,
        bankAccountNumber: '1234567890',
      })
      .expect(201);
    expect(created.body.nik).toBeUndefined();
    const id = created.body.id;

    const row = await prisma.employee.findUniqueOrThrow({ where: { id } });
    expect(row.nikEncrypted).not.toContain(nik);
    expect(row.baseSalaryEncrypted).not.toContain('7500000');

    const sensitive = await request(app.getHttpServer()).get(`/api/employees/${id}/sensitive`).set(auth).expect(200);
    expect(sensitive.body.nik).toBe(nik);
    expect(sensitive.body.baseSalary).toBe(7_500_000);

    const search = await request(app.getHttpServer()).get(`/api/employees?search=${nik}`).set(auth).expect(200);
    expect(search.body.items.map((e: { id: string }) => e.id)).toContain(id);

    await request(app.getHttpServer())
      .post(`/api/employees/${id}/salary-changes`)
      .set(auth)
      .send({ baseSalary: 8_000_000, effectiveDate: '2026-11-01', reason: 'Sebelum tanggal masuk' })
      .expect(400);

    const logs = await request(app.getHttpServer()).get(`/api/audit-logs?tableName=employees&recordId=${id}`).set(auth).expect(200);
    const actions = logs.body.items.map((l: { action: string }) => l.action);
    expect(actions).toEqual(expect.arrayContaining(['create', 'view_sensitive']));
  });

  it('HR tidak bisa memberi role super_admin (cegah eskalasi hak akses)', async () => {
    const auth = { Authorization: `Bearer ${hrToken}` };
    const roles = await request(app.getHttpServer()).get('/api/roles').set(auth).expect(200);
    const superAdmin = roles.body.find((r: { name: string }) => r.name === 'super_admin');
    await request(app.getHttpServer())
      .post('/api/users')
      .set(auth)
      .send({ email: `eskalasi-${run}@contoh.test`, password: 'Password-Aman-2026', roleIds: [superAdmin.id] })
      .expect(403);
  });

  it('refresh token dirotasi dan pemakaian ulang token lama mencabut sesi', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'staff@contoh.test', password: PASSWORD })
      .expect(200);
    const firstCookie = res.headers['set-cookie'][0].split(';')[0];

    const rotated = await request(app.getHttpServer()).post('/api/auth/refresh').set('Cookie', firstCookie).expect(200);
    const secondCookie = rotated.headers['set-cookie'][0].split(';')[0];
    expect(secondCookie).not.toBe(firstCookie);

    // Pakai ulang token pertama → ditolak, dan token kedua ikut dicabut.
    await request(app.getHttpServer()).post('/api/auth/refresh').set('Cookie', firstCookie).expect(401);
    await request(app.getHttpServer()).post('/api/auth/refresh').set('Cookie', secondCookie).expect(401);
  });

  it('audit_logs append-only di level database', async () => {
    // Trigger per-baris hanya terpicu jika ada baris yang terkena, jadi pastikan tabel tidak kosong.
    expect(await prisma.auditLog.count()).toBeGreaterThan(0);
    await expect(prisma.$executeRawUnsafe('UPDATE audit_logs SET action = action')).rejects.toThrow(/append-only/);
    await expect(prisma.$executeRawUnsafe('DELETE FROM audit_logs')).rejects.toThrow(/append-only/);
  });
});
