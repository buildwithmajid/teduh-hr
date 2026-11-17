'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Building2, ShieldAlert, Users } from 'lucide-react';
import Link from 'next/link';
import { Card, CardHeader, EmptyState, PageHeader, Spinner, Table, Td, Th } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth, useMe } from '@/lib/auth';
import { formatDate, LABELS, todayISO } from '@/lib/format';
import { qk, useActiveEmployees, useDepartments } from '@/lib/queries';
import type { EmployeeSummary, Paged } from '@/lib/types';

const REMINDER_DAYS = 30;

function daysUntil(date: string) {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${todayISO()}T00:00:00Z`)) / 86_400_000);
}

export default function DashboardPage() {
  const me = useMe();
  const { can } = useAuth();
  const firstName = (me.employee?.fullName ?? me.email).split(' ')[0];

  return (
    <>
      <PageHeader title={`Halo, ${firstName}`} description={me.company.name} />
      {!me.mfaEnabled && me.roles.some((r) => ['super_admin', 'hr_admin', 'finance'].includes(r)) && (
        <div className="mb-6 flex items-center gap-2 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          <ShieldAlert className="size-4" aria-hidden /> Verifikasi dua langkah belum aktif untuk akun Anda.
        </div>
      )}
      {can('employee.view') ? <HrDashboard /> : <PersonalDashboard />}
    </>
  );
}

function Stat({ label, value, icon: Icon, href }: { label: string; value: React.ReactNode; icon: typeof Users; href?: string }) {
  const body = (
    <Card className="flex items-center gap-4 p-5 transition-shadow hover:shadow-md">
      <div className="flex size-10 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
        <Icon className="size-5" aria-hidden />
      </div>
      <div>
        <p className="text-sm text-slate-500">{label}</p>
        <p className="text-2xl font-semibold text-slate-900">{value}</p>
      </div>
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

function HrDashboard() {
  const active = useQuery({
    queryKey: [...qk.employees, 'count-active'],
    queryFn: () => api.get<Paged<EmployeeSummary>>('/employees?status=active&pageSize=1'),
  });
  const departments = useDepartments();
  // Pengingat dihitung dari maks. 100 karyawan aktif pertama; endpoint khusus menyusul di fase berikutnya.
  const employees = useActiveEmployees();

  const reminders = (employees.data ?? [])
    .flatMap((e) => [
      ...(e.contractEndDate ? [{ e, kind: 'Kontrak berakhir', date: e.contractEndDate }] : []),
      ...(e.probationEndDate ? [{ e, kind: 'Masa percobaan berakhir', date: e.probationEndDate }] : []),
    ])
    .map((r) => ({ ...r, days: daysUntil(r.date) }))
    .filter((r) => r.days <= REMINDER_DAYS)
    .sort((a, b) => a.days - b.days);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label="Karyawan aktif" value={active.data?.total ?? '…'} icon={Users} href="/employees" />
        <Stat label="Departemen" value={departments.data?.length ?? '…'} icon={Building2} href="/organization" />
        <Stat label={`Perlu perhatian (≤ ${REMINDER_DAYS} hari)`} value={employees.isPending ? '…' : reminders.length} icon={AlertTriangle} />
      </div>

      <Card>
        <CardHeader title="Kontrak & masa percobaan" description={`Berakhir dalam ${REMINDER_DAYS} hari ke depan atau sudah lewat.`} />
        {employees.isPending ? (
          <Spinner />
        ) : reminders.length === 0 ? (
          <EmptyState title="Tidak ada yang perlu ditindaklanjuti" />
        ) : (
          <Table>
            <thead className="bg-slate-50">
              <tr>
                <Th>Karyawan</Th>
                <Th>Jenis</Th>
                <Th>Tanggal</Th>
                <Th>Sisa</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {reminders.map((r) => (
                <tr key={`${r.e.id}-${r.kind}`}>
                  <Td>
                    <Link href={`/employees/${r.e.id}`} className="font-medium text-slate-900 hover:underline">
                      {r.e.fullName}
                    </Link>
                    <div className="text-xs text-slate-500">{r.e.department.name}</div>
                  </Td>
                  <Td>{r.kind}</Td>
                  <Td>{formatDate(r.date)}</Td>
                  <Td className={r.days < 0 ? 'font-medium text-red-700' : r.days <= 7 ? 'font-medium text-amber-700' : undefined}>
                    {r.days < 0 ? `lewat ${-r.days} hari` : r.days === 0 ? 'hari ini' : `${r.days} hari`}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
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
  if (!me.employee) return <Card className="p-5 text-sm text-slate-600">Akun ini tidak terhubung ke data karyawan.</Card>;
  if (!profile.data) return <Spinner />;
  const e = profile.data;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Card className="p-5">
        <p className="text-sm text-slate-500">Jabatan</p>
        <p className="mt-1 font-medium text-slate-900">{e.position.title}</p>
        <p className="text-sm text-slate-500">{e.department.name}</p>
      </Card>
      <Card className="p-5">
        <p className="text-sm text-slate-500">Status</p>
        <p className="mt-1 font-medium text-slate-900">{LABELS.contractType[e.contractType]}</p>
        <p className="text-sm text-slate-500">Sejak {formatDate(e.joinDate)}</p>
      </Card>
      <Card className="p-5">
        <p className="text-sm text-slate-500">Atasan</p>
        <p className="mt-1 font-medium text-slate-900">{e.supervisor?.fullName ?? '—'}</p>
        <Link href="/me" className="text-sm text-brand-700 hover:underline">
          Lihat profil lengkap →
        </Link>
      </Card>
    </div>
  );
}
