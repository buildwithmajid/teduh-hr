'use client';

import { useQuery } from '@tanstack/react-query';
import { RequirePermission } from '@/components/app-shell';
import { Alert, Card, EmptyState, PageHeader, Spinner, Table, Td, Th } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { formatDate, LABELS } from '@/lib/format';
import type { EmployeeSummary } from '@/lib/types';

export default function TeamPage() {
  const team = useQuery({ queryKey: ['team'], queryFn: () => api.get<EmployeeSummary[]>('/employees/team') });
  return (
    <RequirePermission anyOf={['employee.view_team']}>
      <PageHeader title="Tim saya" description="Karyawan aktif yang melapor langsung kepada Anda." />
      <Card>
        {team.isPending ? (
          <Spinner />
        ) : team.isError ? (
          <div className="p-4">
            <Alert>{errorMessage(team.error)}</Alert>
          </div>
        ) : team.data.length === 0 ? (
          <EmptyState title="Belum ada bawahan langsung" />
        ) : (
          <Table>
            <thead className="bg-slate-50">
              <tr>
                <Th>Nama</Th>
                <Th>Jabatan</Th>
                <Th>Tipe</Th>
                <Th>Masuk</Th>
                <Th>Akhir kontrak</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {team.data.map((e) => (
                <tr key={e.id}>
                  <Td>
                    <span className="font-medium text-slate-900">{e.fullName}</span>
                    <div className="text-xs text-slate-500">{e.employeeCode}</div>
                  </Td>
                  <Td>{e.position.title}</Td>
                  <Td>{LABELS.contractType[e.contractType]}</Td>
                  <Td>{formatDate(e.joinDate)}</Td>
                  <Td>{formatDate(e.contractEndDate)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </RequirePermission>
  );
}
