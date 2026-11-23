'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { Fragment, useState } from 'react';
import { RequirePermission } from '@/components/app-shell';
import { Alert, Badge, Button, Card, EmptyState, PageHeader, Pagination, Select, Table, TableSkeleton, Td, Th } from '@/components/ui';
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
    if (typeof v === 'string' && /^v\d+:[^:]+:[^:]+:[^:]+$/.test(v)) return '[terenkripsi]';
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
        description="Catatan permanen setiap perubahan dan akses data sensitif. Dilindungi rantai hash SHA-256."
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
            <Alert>
              Rantai hash rusak mulai catatan #{verify.data.brokenAtId}. Ada data audit yang diubah atau dihapus di luar aplikasi.
            </Alert>
          )}
        </div>
      )}
      {verify.isError && (
        <div className="mb-4">
          <Alert>{errorMessage(verify.error)}</Alert>
        </div>
      )}

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
          <Select
            aria-label="Filter kategori data"
            className="w-auto min-w-52"
            value={tableName}
            onChange={(e) => {
              setTableName(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Semua kategori data</option>
            {TABLES.map((t) => (
              <option key={t} value={t}>
                {LABELS.auditTable[t] ?? t}
              </option>
            ))}
          </Select>
        </div>
        {logs.isPending ? (
          <TableSkeleton rows={6} cols={6} />
        ) : logs.isError ? (
          <div className="p-4">
            <Alert>{errorMessage(logs.error)}</Alert>
          </div>
        ) : logs.data.items.length === 0 ? (
          <EmptyState title="Belum ada catatan audit" />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Waktu</Th>
                  <Th>Pelaku</Th>
                  <Th>Aksi</Th>
                  <Th>Objek data</Th>
                  <Th>IP</Th>
                  <Th />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {logs.data.items.map((l) => {
                  const changes = diff(l.oldValue, l.newValue);
                  const open = expanded === l.id;
                  return (
                    <Fragment key={l.id}>
                      <tr className="hover:bg-canvas/60">
                        <Td className="whitespace-nowrap font-mono text-xs text-ink-muted">{formatDateTime(l.createdAt)}</Td>
                        <Td className="text-xs text-ink">
                          {l.userId ? (emailOf.get(l.userId) ?? `${l.userId.slice(0, 8)}…`) : 'Sistem'}
                        </Td>
                        <Td>
                          <Badge tone={actionTone[l.action]} dot>
                            {LABELS.auditAction[l.action]}
                          </Badge>
                        </Td>
                        <Td>
                          <span className="text-sm font-medium text-ink">{LABELS.auditTable[l.tableName] ?? l.tableName}</span>
                          <div className="font-mono text-[11px] text-ink-subtle">{l.recordId.slice(0, 8)}…</div>
                        </Td>
                        <Td className="font-mono text-xs text-ink-muted">{l.ipAddress ?? '—'}</Td>
                        <Td className="text-right">
                          {changes.length > 0 && (
                            <Button size="sm" variant="ghost" onClick={() => setExpanded(open ? null : l.id)} aria-expanded={open}>
                              {open ? 'Tutup' : `${changes.length} perubahan`}
                            </Button>
                          )}
                        </Td>
                      </tr>
                      {open && (
                        <tr className="bg-canvas/80">
                          <td colSpan={6} className="px-5 py-3.5">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-ink-subtle">
                                  <th className="py-1.5 pr-4 font-semibold">Field</th>
                                  <th className="py-1.5 pr-4 font-semibold">Sebelum</th>
                                  <th className="py-1.5 font-semibold">Sesudah</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-line/60">
                                {changes.map((c) => (
                                  <tr key={c.key} className="align-top">
                                    <td className="py-1.5 pr-4 font-mono text-ink">{c.key}</td>
                                    <td className="break-all py-1.5 pr-4 font-mono text-red-700">{c.before ?? '—'}</td>
                                    <td className="break-all py-1.5 font-mono text-emerald-800">{c.after ?? '—'}</td>
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
