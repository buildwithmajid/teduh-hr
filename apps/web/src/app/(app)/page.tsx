'use client';

import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  ArrowUpRight,
  Banknote,
  CalendarDays,
  CheckSquare,
  Clock,
  Eye,
  EyeOff,
  FileText,
  Lock,
  MapPin,
  Plus,
  ShieldAlert,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Spinner,
  Table,
  TableSkeleton,
  Td,
  Th,
} from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth, useMe } from '@/lib/auth';
import {
  formatDate,
  formatMonthYear,
  formatRupiah,
  formatTenure,
  LABELS,
  MONTHS_ID,
  todayISO,
} from '@/lib/format';
import { qk, useActiveEmployees, useDepartments, useWorkLocations } from '@/lib/queries';
import type {
  AttendanceRecord,
  AttendanceToday,
  EmployeeSummary,
  LeaveBalance,
  Paged,
  PayrollAnalytics,
  PayrollPeriodStatus,
  PayslipListItem,
  PendingApproval,
} from '@/lib/types';

const REMINDER_DAYS = 30;

const payrollStatusTone: Record<PayrollPeriodStatus, 'gray' | 'amber' | 'blue' | 'green'> = {
  draft: 'gray',
  pending_approval: 'amber',
  approved: 'blue',
  locked: 'green',
};

function daysUntil(date: string) {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${todayISO()}T00:00:00Z`)) / 86_400_000);
}

function tzShort(tz: string) {
  if (tz === 'Asia/Jakarta') return 'WIB';
  if (tz === 'Asia/Makassar') return 'WITA';
  if (tz === 'Asia/Jayapura') return 'WIT';
  return tz;
}

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Jakarta',
  }).format(new Date(iso));
}

function formatCompactRp(n: number): string {
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(2).replace('.', ',')} M`;
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(1).replace('.', ',')} jt`;
  return formatRupiah(n);
}

export default function DashboardPage() {
  const me = useMe();
  const { can } = useAuth();
  const firstName = (me.employee?.fullName ?? me.email).split(' ')[0];
  const todayLabel = new Intl.DateTimeFormat('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Jakarta',
  }).format(new Date());

  const isOrgAdmin = can('employee.view') || can('payroll.view');

  return (
    <div className="space-y-6">
      {/* Architectural Studio Cover Banner */}
      <section className="relative overflow-hidden rounded-lg border border-line bg-[#1B1917]">
        <Image
          src="/images/studio-interior.png"
          alt=""
          fill
          priority
          sizes="(min-width: 1024px) 1152px, 100vw"
          className="object-cover object-[50%_42%]"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-r from-[#161412]/90 via-[#161412]/65 to-[#161412]/35"
        />
        <div className="relative z-10 flex flex-wrap items-end justify-between gap-4 px-6 py-7 sm:py-8">
          <div>
            <p className="text-xs font-medium text-stone-200/90">{me.company.name}</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white">Halo, {firstName}</h1>
            <p className="mt-1 text-xs text-stone-200/80">{todayLabel}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {can('payroll.view') && (
              <Link href="/payroll">
                <Button variant={can('employee.manage', 'salary.manage') ? 'secondary' : 'primary'}>
                  <Banknote className="size-4" aria-hidden />
                  Run payroll
                </Button>
              </Link>
            )}
            {can('employee.manage', 'salary.manage') && (
              <Link href="/employees/new">
                <Button>
                  <Plus className="size-4" aria-hidden />
                  Tambah karyawan
                </Button>
              </Link>
            )}
            {!isOrgAdmin && me.employee && (
              <Link href="/attendance">
                <Button>
                  <Clock className="size-4" aria-hidden />
                  Absensi hari ini
                </Button>
              </Link>
            )}
          </div>
        </div>
      </section>

      {!me.mfaEnabled && me.roles.some((r) => ['super_admin', 'hr_admin', 'finance'].includes(r)) && (
        <div className="flex items-center gap-2.5 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <ShieldAlert className="size-4 shrink-0 text-amber-700" aria-hidden />
          <span>Verifikasi dua langkah belum aktif untuk akun Anda.</span>
        </div>
      )}

      {isOrgAdmin ? <OrgDashboard /> : <PersonalDashboard />}
    </div>
  );
}

// ───────────── HR / Finance / Super Admin Dashboard ─────────────

function OrgDashboard() {
  const { can } = useAuth();
  const canEmployees = can('employee.view');
  const canAttendance = can('attendance.view');
  const canPayroll = can('payroll.view');
  const today = todayISO();

  const active = useQuery({
    queryKey: [...qk.employees, 'count-active'],
    queryFn: () => api.get<Paged<EmployeeSummary>>('/employees?status=active&pageSize=1'),
    enabled: canEmployees,
  });
  const departments = useDepartments();
  const locations = useWorkLocations();
  const employees = useActiveEmployees(canEmployees);

  const attendanceToday = useQuery({
    queryKey: ['attendance', 'company-today', today],
    queryFn: () => api.get<AttendanceRecord[]>(`/attendance?from=${today}&to=${today}`),
    enabled: canAttendance,
  });

  const pendingApprovals = useQuery({
    queryKey: ['approvals', 'pending'],
    queryFn: () => api.get<PendingApproval[]>('/approvals/pending'),
  });

  const payrollAnalytics = useQuery({
    queryKey: ['payroll', 'analytics'],
    queryFn: () => api.get<PayrollAnalytics>('/payroll/analytics'),
    enabled: canPayroll,
  });

  const reminders = (employees.data ?? [])
    .flatMap((e) => [
      ...(e.contractEndDate ? [{ e, kind: 'Kontrak PKWT', date: e.contractEndDate }] : []),
      ...(e.probationEndDate ? [{ e, kind: 'Masa percobaan', date: e.probationEndDate }] : []),
    ])
    .map((r) => ({ ...r, days: daysUntil(r.date) }))
    .filter((r) => r.days <= REMINDER_DAYS)
    .sort((a, b) => a.days - b.days);

  const overdueCount = reminders.filter((r) => r.days < 0).length;
  const totalActive = active.data?.total ?? 0;

  const presentToday = (attendanceToday.data ?? []).filter((r) => Boolean(r.clockInTime)).length;
  const lateToday = (attendanceToday.data ?? []).filter((r) => r.lateMinutes > 0).length;

  const pendingReqCount = pendingApprovals.data?.length ?? 0;
  const pendingPayrollCount = payrollAnalytics.data?.counts.pendingApproval ?? 0;

  const deptList = [...(departments.data ?? [])]
    .filter((d) => d._count.employees > 0)
    .sort((a, b) => b._count.employees - a._count.employees)
    .slice(0, 6);
  const maxDeptCount = Math.max(1, ...deptList.map((d) => d._count.employees));

  const latestPayroll = payrollAnalytics.data?.latest ?? null;
  const series = payrollAnalytics.data?.series ?? [];
  const prevPayroll = series.length >= 2 ? series[series.length - 2] : null;
  const payrollDeltaPct =
    latestPayroll && prevPayroll && prevPayroll.totalCompanyCost > 0
      ? ((latestPayroll.totalCompanyCost - prevPayroll.totalCompanyCost) / prevPayroll.totalCompanyCost) * 100
      : null;
  const maxPayrollCost = Math.max(1, ...series.map((s) => s.totalCompanyCost));

  return (
    <div className="space-y-6">
      {/* Unified 4-Column Ledger Metric Strip */}
      <Card className="overflow-hidden">
        <div className="grid divide-y divide-line sm:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-y-0">
          <Link href="/employees" className="group block p-5 transition-colors hover:bg-canvas/60">
            <div className="flex items-center justify-between text-xs font-medium text-ink-muted">
              <span>Karyawan aktif</span>
              <ArrowUpRight className="size-3.5 text-ink-subtle transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-brand-600" />
            </div>
            <p className="mt-2 font-mono text-3xl font-semibold tracking-tight text-ink tabular">
              {canEmployees ? (active.data?.total ?? '—') : (departments.data?.reduce((s, d) => s + d._count.employees, 0) ?? '—')}
            </p>
            <p className="mt-1 text-xs text-ink-subtle">
              {departments.data?.length ?? 0} departemen · {locations.data?.length ?? 0} lokasi
            </p>
          </Link>

          <Link href="/attendance" className="group block p-5 transition-colors hover:bg-canvas/60">
            <div className="flex items-center justify-between text-xs font-medium text-ink-muted">
              <span>Kehadiran hari ini</span>
              {lateToday > 0 ? (
                <Badge tone="amber" dot>{lateToday} telat</Badge>
              ) : (
                <ArrowUpRight className="size-3.5 text-ink-subtle transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-brand-600" />
              )}
            </div>
            <p className="mt-2 font-mono text-3xl font-semibold tracking-tight text-ink tabular">
              {canAttendance ? (attendanceToday.isPending ? '—' : presentToday) : '—'}
              {canAttendance && totalActive > 0 && (
                <span className="ml-1 text-base font-normal text-ink-subtle">/ {totalActive}</span>
              )}
            </p>
            <p className="mt-1 text-xs text-ink-subtle">Sudah clock-in hari ini</p>
          </Link>

          <Link href="/approvals" className="group block p-5 transition-colors hover:bg-canvas/60">
            <div className="flex items-center justify-between text-xs font-medium text-ink-muted">
              <span>Menunggu persetujuan</span>
              {pendingReqCount + pendingPayrollCount > 0 ? (
                <Badge tone="brand" dot>Perlu aksi</Badge>
              ) : (
                <ArrowUpRight className="size-3.5 text-ink-subtle transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-brand-600" />
              )}
            </div>
            <p className="mt-2 font-mono text-3xl font-semibold tracking-tight text-ink tabular">
              {pendingApprovals.isPending ? '—' : pendingReqCount}
            </p>
            <p className="mt-1 text-xs text-ink-subtle">
              {pendingPayrollCount > 0
                ? `Plus ${pendingPayrollCount} batch payroll menunggu Finance`
                : 'Cuti, lembur & koreksi absen'}
            </p>
          </Link>

          {canPayroll ? (
            <Link
              href={latestPayroll ? `/payroll/${latestPayroll.id}` : '/payroll'}
              className="group block bg-brand-50/35 p-5 transition-colors hover:bg-brand-50/70"
            >
              <div className="flex items-center justify-between gap-2 text-xs font-medium text-brand-900">
                <span>Biaya payroll terakhir</span>
                {latestPayroll ? (
                  <Badge tone={payrollStatusTone[latestPayroll.status]} dot>
                    {LABELS.payrollStatus[latestPayroll.status]}
                  </Badge>
                ) : (
                  <ArrowUpRight className="size-3.5 text-brand-700" />
                )}
              </div>
              <p className="mt-2 font-mono text-2xl font-semibold tracking-tight text-brand-900 tabular">
                {payrollAnalytics.isPending
                  ? '—'
                  : latestPayroll
                    ? formatCompactRp(latestPayroll.totalCompanyCost)
                    : 'Belum ada'}
              </p>
              <p className="mt-1 text-xs text-brand-800/80">
                {latestPayroll ? (
                  <>
                    {formatMonthYear(latestPayroll.month, latestPayroll.year)}
                    {payrollDeltaPct !== null && (
                      <span className="ml-1.5 font-mono font-medium">
                        ({payrollDeltaPct >= 0 ? '+' : ''}
                        {payrollDeltaPct.toFixed(1).replace('.', ',')}% MoM)
                      </span>
                    )}
                  </>
                ) : (
                  'Buat batch payroll pertama'
                )}
              </p>
            </Link>
          ) : (
            <div className="p-5">
              <div className="flex items-center justify-between gap-2 text-xs font-medium text-ink-muted">
                <span>Perlu perhatian (≤ {REMINDER_DAYS} hari)</span>
                {overdueCount > 0 && <Badge tone="red" dot>{overdueCount} lewat</Badge>}
              </div>
              <p className="mt-2 font-mono text-3xl font-semibold tracking-tight text-ink tabular">
                {employees.isPending ? '—' : reminders.length}
              </p>
              <p className="mt-1 text-xs text-ink-subtle">Kontrak PKWT & masa percobaan</p>
            </div>
          )}
        </div>
      </Card>

      {/* Payroll Trend & Finance Summary (visible for HR Admin, Finance, Super Admin) */}
      {canPayroll && (
        <div className="grid gap-6 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <Card>
              <CardHeader
                title="Tren biaya payroll"
                description="Total biaya perusahaan (bruto tunai + BPJS perusahaan) dari 6 batch terakhir."
                actions={
                  <Link
                    href="/payroll"
                    className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:text-brand-800"
                  >
                    Semua batch <ArrowRight className="size-3.5" aria-hidden />
                  </Link>
                }
              />
              <div className="p-5">
                {payrollAnalytics.isPending ? (
                  <Spinner label="Memuat tren payroll…" />
                ) : series.length === 0 ? (
                  <EmptyState
                    title="Belum ada histori payroll"
                    description="Buat dan hitung batch payroll pertama di menu Run payroll untuk mulai melihat tren biaya bulanan."
                    action={
                      <Link href="/payroll">
                        <Button size="sm">Buka Run payroll</Button>
                      </Link>
                    }
                  />
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
                      {series.map((pt) => {
                        const heightPct = Math.max(12, Math.round((pt.totalCompanyCost / maxPayrollCost) * 100));
                        const thpPct =
                          pt.totalCompanyCost > 0
                            ? Math.round((pt.netSalary / pt.totalCompanyCost) * 100)
                            : 0;
                        return (
                          <Link
                            key={pt.id}
                            href={`/payroll/${pt.id}`}
                            className="group relative flex flex-col justify-end rounded-md border border-line bg-canvas/50 p-3 transition-colors hover:border-brand-300 hover:bg-brand-50/40"
                          >
                            {/* Interactive Hover Tooltip */}
                            <div className="pointer-events-none invisible absolute -top-2 left-1/2 z-20 w-48 -translate-x-1/2 -translate-y-full rounded-md border border-stone-700 bg-ink p-2.5 text-[11px] text-white opacity-0 shadow-lg transition-all duration-150 group-hover:visible group-hover:opacity-100">
                              <p className="font-semibold">
                                {formatMonthYear(pt.month, pt.year)}
                              </p>
                              <div className="mt-1.5 space-y-0.5 font-mono text-[10px] text-stone-200 tabular">
                                <div className="flex justify-between gap-2">
                                  <span className="text-stone-400">THP</span>
                                  <span>{formatRupiah(pt.netSalary)}</span>
                                </div>
                                <div className="flex justify-between gap-2">
                                  <span className="text-stone-400">PPh 21</span>
                                  <span>{formatRupiah(pt.pph21)}</span>
                                </div>
                                <div className="flex justify-between gap-2">
                                  <span className="text-stone-400">BPJS Prsh</span>
                                  <span>{formatRupiah(pt.bpjsCompany)}</span>
                                </div>
                              </div>
                            </div>

                            <div className="mb-2 flex items-center justify-between text-[10px]">
                              <span className="font-mono text-ink-subtle">
                                {MONTHS_ID[pt.month - 1]?.slice(0, 3)} {String(pt.year).slice(-2)}
                              </span>
                              {pt.status === 'locked' && (
                                <Lock className="size-3 text-emerald-700" aria-label="Terkunci" />
                              )}
                            </div>
                            <div className="flex h-28 items-end">
                              <div
                                className="relative w-full overflow-hidden rounded-t bg-brand-200/80 transition-all group-hover:bg-brand-300/80"
                                style={{ height: `${heightPct}%` }}
                              >
                                <div
                                  className="absolute inset-x-0 bottom-0 bg-brand-600 transition-colors group-hover:bg-brand-700"
                                  style={{ height: `${thpPct}%` }}
                                />
                              </div>
                            </div>
                            <p className="mt-2 font-mono text-xs font-semibold text-ink tabular">
                              {formatCompactRp(pt.totalCompanyCost)}
                            </p>
                            <p className="text-[10px] text-ink-muted">
                              {pt.employeeCount} kary.
                            </p>
                          </Link>
                        );
                      })}
                    </div>
                    <div className="flex flex-wrap items-center gap-4 border-t border-line pt-3 text-[11px] text-ink-muted">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="size-2.5 rounded-sm bg-brand-600" aria-hidden />
                        Take-Home Pay (THP)
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="size-2.5 rounded-sm bg-brand-200" aria-hidden />
                        PPh 21 & BPJS
                      </span>
                      <span className="ml-auto text-ink-subtle">Klik bar untuk buka laporan biaya departemen</span>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          </div>

          <div className="lg:col-span-4">
            <Card className="h-full">
              <CardHeader title="Status batch payroll" description="Ringkasan alur persetujuan." />
              <div className="divide-y divide-line px-5 py-1 text-sm">
                <div className="flex items-center justify-between py-3.5">
                  <span className="text-ink-muted">Draft (HR)</span>
                  <span className="font-mono font-semibold text-ink tabular">
                    {payrollAnalytics.data?.counts.draft ?? 0}
                  </span>
                </div>
                <div className="flex items-center justify-between py-3.5">
                  <span className="text-ink-muted">Menunggu Finance</span>
                  <Badge tone={(payrollAnalytics.data?.counts.pendingApproval ?? 0) > 0 ? 'amber' : 'gray'} dot>
                    {payrollAnalytics.data?.counts.pendingApproval ?? 0} batch
                  </Badge>
                </div>
                <div className="flex items-center justify-between py-3.5">
                  <span className="text-ink-muted">Terkunci & terbit slip</span>
                  <span className="font-mono font-semibold text-emerald-800 tabular">
                    {payrollAnalytics.data?.counts.locked ?? 0}
                  </span>
                </div>
              </div>
              {latestPayroll && (
                <div className="border-t border-line bg-canvas/50 px-5 py-4">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-ink-subtle">
                    Rincian batch terakhir
                  </p>
                  <div className="mt-2 space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-ink-muted">Total THP</span>
                      <span className="font-mono text-ink tabular">{formatRupiah(latestPayroll.netSalary)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-ink-muted">Total PPh 21</span>
                      <span className="font-mono text-ink tabular">{formatRupiah(latestPayroll.pph21)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-ink-muted">BPJS Perusahaan</span>
                      <span className="font-mono text-ink tabular">{formatRupiah(latestPayroll.bpjsCompany)}</span>
                    </div>
                  </div>
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      {/* Main 2-column operational grid */}
      <div className="grid gap-6 lg:grid-cols-12">
        {canEmployees && (
          <div className="lg:col-span-8">
            <Card>
              <CardHeader
                title="Kontrak & masa percobaan"
                description={`Berakhir dalam ${REMINDER_DAYS} hari ke depan atau sudah lewat.`}
                actions={
                  overdueCount > 0 ? <Badge tone="red" dot>{overdueCount} lewat</Badge> : undefined
                }
              />
              {employees.isPending ? (
                <TableSkeleton rows={4} cols={4} />
              ) : reminders.length === 0 ? (
                <EmptyState
                  title="Semua kontrak & masa percobaan aman"
                  description={`Tidak ada jadwal yang berakhir dalam ${REMINDER_DAYS} hari ke depan.`}
                />
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <Th>Karyawan</Th>
                      <Th>Jenis</Th>
                      <Th>Tanggal</Th>
                      <Th className="text-right">Status</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {reminders.map((r) => (
                      <tr key={`${r.e.id}-${r.kind}`} className="transition-colors hover:bg-canvas/60">
                        <Td>
                          <Link href={`/employees/${r.e.id}`} className="group flex items-center gap-2.5">
                            <Avatar name={r.e.fullName} size="sm" />
                            <div className="min-w-0">
                              <p className="truncate font-medium text-ink group-hover:text-brand-700">{r.e.fullName}</p>
                              <p className="truncate text-xs text-ink-muted">{r.e.department.name}</p>
                            </div>
                          </Link>
                        </Td>
                        <Td className="whitespace-nowrap text-ink-muted">{r.kind}</Td>
                        <Td className="whitespace-nowrap font-mono text-xs">{formatDate(r.date)}</Td>
                        <Td className="whitespace-nowrap text-right">
                          {r.days < 0 ? (
                            <Badge tone="red" dot>Lewat {-r.days} hari</Badge>
                          ) : r.days === 0 ? (
                            <Badge tone="red" dot>Hari ini</Badge>
                          ) : r.days <= 7 ? (
                            <Badge tone="amber" dot>{r.days} hari lagi</Badge>
                          ) : (
                            <Badge tone="gray">{r.days} hari lagi</Badge>
                          )}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>
          </div>
        )}

        {/* Side column: Department headcount & Work locations */}
        <div className={canEmployees ? 'space-y-6 lg:col-span-4' : 'grid gap-6 sm:grid-cols-2 lg:col-span-12'}>
          <Card>
            <CardHeader title="Sebaran departemen" description="Jumlah karyawan aktif per unit." />
            <div className="p-5">
              {departments.isPending ? (
                <Spinner />
              ) : deptList.length === 0 ? (
                <p className="text-xs text-ink-muted">Belum ada karyawan di departemen.</p>
              ) : (
                <ul className="space-y-3.5">
                  {deptList.map((d) => {
                    const pct = Math.round((d._count.employees / maxDeptCount) * 100);
                    return (
                      <li key={d.id}>
                        <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                          <span className="truncate font-medium text-ink">{d.name}</span>
                          <span className="shrink-0 font-mono text-ink-muted tabular">
                            {d._count.employees}
                            {totalActive > 0 && (
                              <span className="text-ink-subtle"> ({Math.round((d._count.employees / totalActive) * 100)}%)</span>
                            )}
                          </span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-rail">
                          <div className="h-full rounded-full bg-brand-600/85" style={{ width: `${pct}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </Card>

          {locations.data && locations.data.length > 0 && (
            <Card>
              <CardHeader title="Lokasi kerja aktif" description="Titik geofence & zona waktu." />
              <ul className="divide-y divide-line px-5 py-1">
                {locations.data.map((loc) => (
                  <li key={loc.id} className="flex items-center justify-between gap-3 py-3 text-xs">
                    <div className="flex min-w-0 items-center gap-2">
                      <MapPin className="size-3.5 shrink-0 text-brand-600" aria-hidden />
                      <span className="truncate font-medium text-ink">{loc.name}</span>
                    </div>
                    <span className="shrink-0 font-mono text-[11px] text-ink-muted">{tzShort(loc.timezone)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

// ───────────── Employee & Manager Self-Service Dashboard ─────────────

function PersonalDashboard() {
  const me = useMe();
  const [showSalary, setShowSalary] = useState(false);

  const profile = useQuery({
    queryKey: ['me', 'profile'],
    queryFn: () => api.get<EmployeeSummary>('/employees/me'),
    enabled: me.employee !== null,
  });

  const todayAttendance = useQuery({
    queryKey: ['attendance', 'me', 'today'],
    queryFn: () => api.get<AttendanceToday>('/attendance/me/today'),
    enabled: me.employee !== null,
  });

  const balances = useQuery({
    queryKey: ['leaves', 'balances', 'me'],
    queryFn: () => api.get<LeaveBalance[]>('/leaves/balances/me'),
    enabled: me.employee !== null,
  });

  const payslips = useQuery({
    queryKey: ['my-payslips'],
    queryFn: () => api.get<PayslipListItem[]>('/payroll/payslips/me'),
    enabled: me.employee !== null,
  });

  const pendingApprovals = useQuery({
    queryKey: ['approvals', 'pending'],
    queryFn: () => api.get<PendingApproval[]>('/approvals/pending'),
  });

  if (!me.employee) {
    return <Card className="p-5 text-sm text-ink-muted">Akun ini tidak terhubung ke data karyawan.</Card>;
  }
  if (!profile.data) return <Spinner />;

  const e = profile.data;
  const att = todayAttendance.data?.attendance ?? null;
  const annualLeave =
    balances.data?.find((b) => b.leaveType.code === 'annual') ?? balances.data?.[0] ?? null;
  const latestSlip = payslips.data?.[0] ?? null;
  const pendingCount = pendingApprovals.data?.length ?? 0;

  return (
    <div className="space-y-6">
      {/* Quick Self-Service Strip */}
      <Card className="overflow-hidden">
        <div className="grid divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <Link href="/attendance" className="group block p-5 transition-colors hover:bg-canvas/60">
            <div className="flex items-center justify-between text-xs font-medium text-ink-muted">
              <span className="inline-flex items-center gap-1.5">
                <Clock className="size-3.5 text-brand-600" aria-hidden />
                Absensi hari ini
              </span>
              <ArrowUpRight className="size-3.5 text-ink-subtle transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-brand-600" />
            </div>
            <p className="mt-2 font-mono text-2xl font-semibold tracking-tight text-ink tabular">
              {todayAttendance.isPending
                ? '—'
                : att?.clockInTime
                  ? formatTime(att.clockInTime)
                  : 'Belum absen'}
            </p>
            <p className="mt-1 text-xs text-ink-subtle">
              {att?.clockOutTime
                ? `Pulang pukul ${formatTime(att.clockOutTime)}`
                : att?.clockInTime
                  ? 'Sudah clock-in · klik untuk clock-out'
                  : 'Klik untuk clock-in sekarang'}
            </p>
          </Link>

          <Link href="/leaves" className="group block p-5 transition-colors hover:bg-canvas/60">
            <div className="flex items-center justify-between text-xs font-medium text-ink-muted">
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="size-3.5 text-brand-600" aria-hidden />
                Sisa cuti tahunan
              </span>
              <ArrowUpRight className="size-3.5 text-ink-subtle transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-brand-600" />
            </div>
            <p className="mt-2 font-mono text-2xl font-semibold tracking-tight text-ink tabular">
              {balances.isPending
                ? '—'
                : annualLeave
                  ? `${annualLeave.remainingDays} hari`
                  : '—'}
            </p>
            <p className="mt-1 text-xs text-ink-subtle">
              {annualLeave
                ? `Terpakai ${annualLeave.usedDays} dari ${annualLeave.quotaDays + annualLeave.carriedOverDays} hari`
                : 'Ajukan cuti atau lihat riwayat'}
            </p>
          </Link>

          <div className="p-5">
            <div className="flex items-center justify-between text-xs font-medium text-ink-muted">
              <span className="inline-flex items-center gap-1.5">
                <FileText className="size-3.5 text-brand-600" aria-hidden />
                Slip gaji terakhir
              </span>
              {latestSlip && (
                <button
                  type="button"
                  onClick={() => setShowSalary((v) => !v)}
                  className="cursor-pointer rounded p-1 text-ink-subtle hover:bg-rail hover:text-ink"
                  aria-label={showSalary ? 'Sembunyikan nominal gaji' : 'Tampilkan nominal gaji'}
                >
                  {showSalary ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                </button>
              )}
            </div>
            <p className="mt-2 font-mono text-2xl font-semibold tracking-tight text-ink tabular">
              {payslips.isPending
                ? '—'
                : latestSlip
                  ? showSalary
                    ? formatRupiah(latestSlip.netSalary)
                    : 'Rp ••••••••'
                  : 'Belum ada'}
            </p>
            <p className="mt-1 text-xs text-ink-subtle">
              {latestSlip ? (
                <Link href="/payslips" className="font-medium text-brand-700 hover:underline">
                  {formatMonthYear(latestSlip.month, latestSlip.year)} · Lihat & cetak PDF
                </Link>
              ) : (
                'Slip muncul setelah payroll dikunci'
              )}
            </p>
          </div>
        </div>
      </Card>

      {pendingCount > 0 && (
        <Card className="flex flex-wrap items-center justify-between gap-3 bg-brand-50/40 px-5 py-4">
          <div className="flex items-center gap-3">
            <CheckSquare className="size-5 shrink-0 text-brand-700" aria-hidden />
            <div>
              <p className="text-sm font-semibold text-ink">
                {pendingCount} pengajuan tim menunggu persetujuan Anda
              </p>
              <p className="text-xs text-ink-muted">
                Tinjau pengajuan cuti, lembur, atau koreksi absensi anggota tim Anda.
              </p>
            </div>
          </div>
          <Link href="/approvals">
            <Button size="sm">Buka persetujuan</Button>
          </Link>
        </Card>
      )}

      {/* Employee Profile Card */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-4 border-b border-line p-5">
          <Avatar name={e.fullName} size="lg" />
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-ink">{e.fullName}</h2>
            <p className="text-sm text-ink-muted">
              {e.position.title} · {e.department.name}
            </p>
          </div>
          <Link href="/me">
            <Button variant="secondary" size="sm">
              Lihat profil lengkap
            </Button>
          </Link>
        </div>
        <div className="grid divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <div className="p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">Status kerja</p>
            <p className="mt-1.5 text-sm font-medium text-ink">{LABELS.contractType[e.contractType]}</p>
            <p className="mt-0.5 text-xs text-ink-muted">Masa kerja {formatTenure(e.joinDate)}</p>
          </div>
          <div className="p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">Bergabung sejak</p>
            <p className="mt-1.5 font-mono text-sm font-medium text-ink">{formatDate(e.joinDate)}</p>
            <p className="mt-0.5 font-mono text-xs text-ink-muted">{e.employeeCode}</p>
          </div>
          <div className="p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">Atasan langsung</p>
            <p className="mt-1.5 text-sm font-medium text-ink">{e.supervisor?.fullName ?? '—'}</p>
            <p className="mt-0.5 text-xs text-ink-muted">{e.workLocation?.name ?? 'Bebas lokasi'}</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
