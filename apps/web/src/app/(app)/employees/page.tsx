'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronRight, Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { RequirePermission } from '@/components/app-shell';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  PageHeader,
  Pagination,
  SegmentedControl,
  Select,
  Table,
  TableSkeleton,
  Td,
  Th,
} from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate, LABELS } from '@/lib/format';
import { qk, useDepartments } from '@/lib/queries';
import type { EmployeeSummary, Paged } from '@/lib/types';
import type { EmployeeStatusTone } from './status';
import { statusTone } from './status';

const STATUS_OPTIONS = [
  { value: 'active', label: 'Aktif' },
  { value: 'resigned', label: 'Resign' },
  { value: 'terminated', label: 'PHK' },
  { value: '', label: 'Semua' },
];

export default function EmployeesPage() {
  return (
    <RequirePermission anyOf={['employee.view']}>
      <EmployeesList />
    </RequirePermission>
  );
}

function EmployeesList() {
  const { can } = useAuth();
  const router = useRouter();
  const departments = useDepartments();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [status, setStatus] = useState('active');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (search) params.set('search', search);
  if (departmentId) params.set('departmentId', departmentId);
  if (status) params.set('status', status);

  const query = useQuery({
    queryKey: [...qk.employees, 'list', params.toString()],
    queryFn: () => api.get<Paged<EmployeeSummary>>(`/employees?${params}`),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader
        title="Karyawan"
        description={
          query.data ? `${query.data.total} data sesuai filter.` : 'Direktori induk karyawan perusahaan.'
        }
        actions={
          can('employee.manage', 'salary.manage') && (
            <Link href="/employees/new">
              <Button>
                <Plus className="size-4" aria-hidden />
                Tambah karyawan
              </Button>
            </Link>
          )
        }
      />

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
          <SegmentedControl
            options={STATUS_OPTIONS}
            value={status}
            onChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
          />
          <div className="relative min-w-56 flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-subtle"
              aria-hidden
            />
            <Input
              aria-label="Cari karyawan"
              placeholder="Cari nama, kode EMP, atau NIK 16 digit…"
              className="pl-9"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
          <Select
            aria-label="Filter departemen"
            className="w-auto min-w-44"
            value={departmentId}
            onChange={(e) => {
              setDepartmentId(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Semua departemen</option>
            {departments.data?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </div>

        {query.isPending ? (
          <TableSkeleton rows={6} cols={5} />
        ) : query.isError ? (
          <div className="p-4">
            <Alert>{errorMessage(query.error)}</Alert>
          </div>
        ) : query.data.items.length === 0 ? (
          <EmptyState title="Tidak ada karyawan ditemukan" description="Coba ubah kata kunci pencarian atau filter status." />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Karyawan</Th>
                  <Th>Departemen & jabatan</Th>
                  <Th>Kontrak</Th>
                  <Th>Tanggal masuk</Th>
                  <Th>Status</Th>
                  <Th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {query.data.items.map((e) => (
                  <tr
                    key={e.id}
                    onClick={() => router.push(`/employees/${e.id}`)}
                    className="group cursor-pointer transition-colors hover:bg-canvas/70"
                  >
                    <Td>
                      <div className="flex items-center gap-3">
                        <Avatar name={e.fullName} size="md" />
                        <div className="min-w-0">
                          <Link
                            href={`/employees/${e.id}`}
                            onClick={(ev) => ev.stopPropagation()}
                            className="font-medium text-ink group-hover:text-brand-700"
                          >
                            {e.fullName}
                          </Link>
                          <div className="font-mono text-xs text-ink-subtle">{e.employeeCode}</div>
                        </div>
                      </div>
                    </Td>
                    <Td>
                      <div className="text-ink">{e.position.title}</div>
                      <div className="text-xs text-ink-muted">{e.department.name}</div>
                    </Td>
                    <Td className="text-ink-muted">{LABELS.contractType[e.contractType]}</Td>
                    <Td className="whitespace-nowrap font-mono text-xs text-ink-muted">{formatDate(e.joinDate)}</Td>
                    <Td>
                      <Badge tone={statusTone(e.employmentStatus) as EmployeeStatusTone} dot>
                        {LABELS.employmentStatus[e.employmentStatus]}
                      </Badge>
                    </Td>
                    <Td className="text-right">
                      <ChevronRight className="ml-auto size-4 text-ink-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-brand-600" />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={page} pageSize={pageSize} total={query.data.total} onPage={setPage} />
          </>
        )}
      </Card>
    </>
  );
}
