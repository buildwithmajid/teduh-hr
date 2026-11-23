'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, MapPin, Plus, ShieldAlert } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
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
import { formatDate, formatTenure, LABELS, todayISO } from '@/lib/format';
import { qk, useActiveEmployees, useDepartments, useWorkLocations } from '@/lib/queries';
import type { EmployeeSummary, Paged } from '@/lib/types';

const REMINDER_DAYS = 30;

function daysUntil(date: string) {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${todayISO()}T00:00:00Z`)) / 86_400_000);
}

function tzShort(tz: string) {
  if (tz === 'Asia/Jakarta') return 'WIB';
  if (tz === 'Asia/Makassar') return 'WITA';
  if (tz === 'Asia/Jayapura') return 'WIT';
  return tz;
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
          {can('employee.manage', 'salary.manage') && (
            <Link href="/employees/new">
              <Button>
                <Plus className="size-4" aria-hidden />
                Tambah karyawan
              </Button>
            </Link>
          )}
        </div>
      </section>

      {!me.mfaEnabled && me.roles.some((r) => ['super_admin', 'hr_admin', 'finance'].includes(r)) && (
        <div className="flex items-center gap-2.5 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <ShieldAlert className="size-4 shrink-0 text-amber-700" aria-hidden />
          <span>Verifikasi dua langkah belum aktif untuk akun Anda.</span>
        </div>
      )}

      {can('employee.view') ? <HrDashboard /> : <PersonalDashboard />}
    </div>
  );
}

function HrDashboard() {
  const active = useQuery({
    queryKey: [...qk.employees, 'count-active'],
    queryFn: () => api.get<Paged<EmployeeSummary>>('/employees?status=active&pageSize=1'),
  });
  const departments = useDepartments();
  const locations = useWorkLocations();
  const employees = useActiveEmployees();

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

  const deptList = [...(departments.data ?? [])]
    .filter((d) => d._count.employees > 0)
    .sort((a, b) => b._count.employees - a._count.employees)
    .slice(0, 6);
  const maxDeptCount = Math.max(1, ...deptList.map((d) => d._count.employees));

  return (
    <div className="space-y-6">
      {/* Unified Ledger Metric Strip */}
      <Card className="overflow-hidden">
        <div className="grid divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <Link href="/employees" className="group block p-5 transition-colors hover:bg-canvas/60">
            <div className="flex items-center justify-between text-xs font-medium text-ink-muted">
              <span>Karyawan aktif</span>
              <ArrowUpRight className="size-3.5 text-ink-subtle transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-brand-600" />
            </div>
            <p className="mt-2 font-mono text-3xl font-semibold tracking-tight text-ink tabular">
              {active.data?.total ?? '—'}
            </p>
            <p className="mt-1 text-xs text-ink-subtle">Lihat direktori lengkap</p>
          </Link>

          <Link href="/organization" className="group block p-5 transition-colors hover:bg-canvas/60">
            <div className="flex items-center justify-between text-xs font-medium text-ink-muted">
              <span>Departemen</span>
              <ArrowUpRight className="size-3.5 text-ink-subtle transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-brand-600" />
            </div>
            <p className="mt-2 font-mono text-3xl font-semibold tracking-tight text-ink tabular">
              {departments.data?.length ?? '—'}
            </p>
            <p className="mt-1 text-xs text-ink-subtle">
              {locations.data?.length ? `${locations.data.length} lokasi kerja terdaftar` : 'Struktur & kepala departemen'}
            </p>
          </Link>

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
        </div>
      </Card>

      {/* Main 2-column operational grid */}
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <Card>
            <CardHeader
              title="Kontrak & masa percobaan"
              description={`Berakhir dalam ${REMINDER_DAYS} hari ke depan atau sudah lewat.`}
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

        {/* Side column: Department headcount & Work locations */}
        <div className="space-y-6 lg:col-span-4">
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

function PersonalDashboard() {
  const me = useMe();
  const profile = useQuery({
    queryKey: ['me', 'profile'],
    queryFn: () => api.get<EmployeeSummary>('/employees/me'),
    enabled: me.employee !== null,
  });
  if (!me.employee) {
    return <Card className="p-5 text-sm text-ink-muted">Akun ini tidak terhubung ke data karyawan.</Card>;
  }
  if (!profile.data) return <Spinner />;
  const e = profile.data;
  return (
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
  );
}
