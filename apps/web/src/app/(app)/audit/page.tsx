'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { Fragment, useState } from 'react';
import { RequirePermission } from '@/components/app-shell';
import { Alert, Badge, Button, Card, EmptyState, PageHeader, Pagination, Select, Spinner, Table, Td, Th } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDateTime, LABELS } from '@/lib/format';
import { qk } from '@/lib/queries';
import type { AuditLog, Paged, UserRow } from '@/lib/types';

const TABLES = [
  'employees',
  'employee_history',
  'employee_salary_components',
  'salary_components',
  'users',
  'user_roles',
  'departments',
  'positions',
  'work_locations',
  'companies',
  'company_settings',
];

const actionTone: Record<AuditLog['action'], 'green' | 'blue' | 'red' | 'amber' | 'gray'> = {
  create: 'green',
  update: 'blue',
  delete: 'red',
  view_sensitive: 'amber',
  export: 'amber',
  login: 'gray',
};

export default function AuditPage() {
  return (
    <RequirePermission anyOf={['audit.view']}>
      <AuditLogs />
    </RequirePermission>
  );
}

/** Tampilkan hanya field yang berubah; nilai terenkripsi disingkat. */
function diff(oldValue: Record<string, unknown> | null, newValue: Record<string, unknown> | null) {
  const keys = new Set([...Object.keys(oldValue ?? {}), ...Object.keys(newValue ?? {})]);
  const show = (v: unknown) => {
    if (v === undefined) return '—';
    const s = typeof v === 'string' ? v : JSON.stringify(v);
    // Ciphertext berformat versi:iv:tag:data
    if (typeof v === 'string' && /^v\d+:[^:]+:[^:]+:[^:]+$/.test(v)) return '🔒 terenkripsi';
    return s.length > 80 ? `${s.slice(0, 80)}…` : s;
  };
  return [...keys]
    .filter((k) => !['updatedAt', 'createdAt'].includes(k))
    .filter((k) => JSON.stringify(oldValue?.[k]) !== JSON.stringify(newValue?.[k]))
    .map((k) => ({ key: k, before: oldValue ? show(oldValue[k]) : null, after: newValue ? show(newValue[k]) : null }));
}

function AuditLogs() {
  const { can } = useAuth();
  const [tableName, setTableName] = useState('');
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);
  const pageSize = 25;
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (tableName) params.set('tableName', tableName);

  const logs = useQuery({
    queryKey: ['audit', params.toString()],
    queryFn: () => api.get<Paged<AuditLog>>(`/audit-logs?${params}`),
    placeholderData: keepPreviousData,
  });
  const users = useQuery({ queryKey: qk.users, queryFn: () => api.get<UserRow[]>('/users'), enabled: can('user.manage') });
  const emailOf = new Map(users.data?.map((u) => [u.id, u.email]));

  const verify = useQuery({
    queryKey: ['audit-verify'],
    queryFn: () => api.get<{ valid: boolean; checked: number; brokenAtId: string | null }>('/audit-logs/verify'),
    enabled: false,
  });

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Catatan siapa mengubah atau melihat data apa, kapan. Tidak bisa diubah atau dihapus."
        actions={
          can('audit.verify') && (
            <Button variant="secondary" loading={verify.isFetching} onClick={() => void verify.refetch()}>
              <ShieldCheck className="size-4" aria-hidden /> Verifikasi integritas
            </Button>
          )
        }
      />
      {verify.data && (
        <div className="mb-4">
          {verify.data.valid ? (
            <Alert tone="green">Rantai hash utuh — {verify.data.checked} catatan terverifikasi tidak dimanipulasi.</Alert>
          ) : (
            <Alert>Rantai hash rusak mulai catatan #{verify.data.brokenAtId}. Ada data audit yang diubah atau dihapus di luar aplikasi.</Alert>
          )}
        </div>
      )}
      {verify.isError && (
        <div className="mb-4">
          <Alert>{errorMessage(verify.error)}</Alert>
        </div>
      )}

      <Card>
        <div className="flex flex-wrap gap-3 border-b border-slate-100 p-4">
          <Select
            aria-label="Filter tabel"
            className="w-auto"
            value={tableName}
            onChange={(e) => {
              setTableName(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Semua data</option>
            {TABLES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </div>
        {logs.isPending ? (
          <Spinner />
        ) : logs.isError ? (
          <div className="p-4">
            <Alert>{errorMessage(logs.error)}</Alert>
          </div>
        ) : logs.data.items.length === 0 ? (
          <EmptyState title="Belum ada catatan" />
        ) : (
          <>
            <Table>
              <thead className="bg-slate-50">
                <tr>
                  <Th>Waktu</Th>
                  <Th>Pelaku</Th>
                  <Th>Aksi</Th>
                  <Th>Data</Th>
                  <Th>IP</Th>
                  <Th />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.data.items.map((l) => {
                  const changes = diff(l.oldValue, l.newValue);
                  const open = expanded === l.id;
                  return (
                    <Fragment key={l.id}>
                      <tr>
                        <Td className="whitespace-nowrap text-xs">{formatDateTime(l.createdAt)}</Td>
                        <Td className="text-xs">{l.userId ? (emailOf.get(l.userId) ?? `${l.userId.slice(0, 8)}…`) : 'Sistem'}</Td>
                        <Td>
                          <Badge tone={actionTone[l.action]}>{LABELS.auditAction[l.action]}</Badge>
                        </Td>
                        <Td>
                          <code className="text-xs">{l.tableName}</code>
                          <div className="font-mono text-xs text-slate-400">{l.recordId.slice(0, 8)}…</div>
                        </Td>
                        <Td className="font-mono text-xs">{l.ipAddress ?? '—'}</Td>
                        <Td className="text-right">
                          {changes.length > 0 && (
                            <Button size="sm" variant="ghost" onClick={() => setExpanded(open ? null : l.id)} aria-expanded={open}>
                              {open ? 'Tutup' : `${changes.length} perubahan`}
                            </Button>
                          )}
                        </Td>
                      </tr>
                      {open && (
                        <tr className="bg-slate-50/70">
                          <td colSpan={6} className="px-4 py-3">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-left text-slate-500">
                                  <th className="py-1 pr-4 font-medium">Field</th>
                                  <th className="py-1 pr-4 font-medium">Sebelum</th>
                                  <th className="py-1 font-medium">Sesudah</th>
                                </tr>
                              </thead>
                              <tbody>
                                {changes.map((c) => (
                                  <tr key={c.key} className="align-top">
                                    <td className="py-1 pr-4 font-mono text-slate-700">{c.key}</td>
                                    <td className="break-all py-1 pr-4 text-red-700">{c.before ?? '—'}</td>
                                    <td className="break-all py-1 text-emerald-700">{c.after ?? '—'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </Table>
            <Pagination page={page} pageSize={pageSize} total={logs.data.total} onPage={setPage} />
          </>
        )}
      </Card>
    </>
  );
}
