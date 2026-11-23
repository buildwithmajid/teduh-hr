'use client';

import { useQuery } from '@tanstack/react-query';
import { RequirePermission } from '@/components/app-shell';
import { Alert, Avatar, Card, EmptyState, PageHeader, Table, TableSkeleton, Td, Th } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { formatDate, formatTenure, LABELS } from '@/lib/format';
import type { EmployeeSummary } from '@/lib/types';

export default function TeamPage() {
  const team = useQuery({ queryKey: ['team'], queryFn: () => api.get<EmployeeSummary[]>('/employees/team') });
  return (
    <RequirePermission anyOf={['employee.view_team']}>
      <PageHeader title="Tim saya" description="Karyawan aktif yang melapor langsung kepada Anda." />
      <Card>
        {team.isPending ? (
          <TableSkeleton rows={4} cols={5} />
        ) : team.isError ? (
          <div className="p-4">
            <Alert>{errorMessage(team.error)}</Alert>
          </div>
        ) : team.data.length === 0 ? (
          <EmptyState title="Belum ada bawahan langsung" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Nama</Th>
                <Th>Jabatan</Th>
                <Th>Kontrak</Th>
                <Th>Masuk</Th>
                <Th>Akhir kontrak</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {team.data.map((e) => (
                <tr key={e.id} className="hover:bg-canvas/60">
                  <Td>
                    <div className="flex items-center gap-2.5">
                      <Avatar name={e.fullName} size="sm" />
                      <div>
                        <span className="font-medium text-ink">{e.fullName}</span>
                        <div className="font-mono text-xs text-ink-subtle">{e.employeeCode}</div>
                      </div>
                    </div>
                  </Td>
                  <Td className="text-ink-muted">{e.position.title}</Td>
                  <Td className="text-ink-muted">{LABELS.contractType[e.contractType]}</Td>
                  <Td className="whitespace-nowrap">
                    <span className="font-mono text-xs">{formatDate(e.joinDate)}</span>
                    <div className="text-[11px] text-ink-subtle">{formatTenure(e.joinDate)}</div>
                  </Td>
                  <Td className="whitespace-nowrap font-mono text-xs text-ink-muted">{formatDate(e.contractEndDate)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </RequirePermission>
  );
}
