'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { RequirePermission } from '@/components/app-shell';
import { Alert, Badge, Button, Card, EmptyState, Input, PageHeader, Pagination, Select, Spinner, Table, Td, Th } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate, LABELS } from '@/lib/format';
import { qk, useDepartments } from '@/lib/queries';
import type { EmployeeStatusTone } from './status';
import { statusTone } from './status';
import type { EmployeeSummary, Paged } from '@/lib/types';

export default function EmployeesPage() {
  return (
    <RequirePermission anyOf={['employee.view']}>
      <EmployeesList />
    </RequirePermission>
  );
}

function EmployeesList() {
  const { can } = useAuth();
  const departments = useDepartments();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [status, setStatus] = useState('active');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // Debounce pencarian
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
        description="Data induk karyawan perusahaan."
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
        <div className="flex flex-wrap gap-3 border-b border-slate-100 p-4">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <Input
              aria-label="Cari karyawan"
              placeholder="Cari nama, kode, atau NIK (16 digit)…"
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
          <Select
            aria-label="Filter status"
            className="w-auto"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Semua status</option>
            {Object.entries(LABELS.employmentStatus).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>

        {query.isPending ? (
          <Spinner />
        ) : query.isError ? (
          <div className="p-4">
            <Alert>{errorMessage(query.error)}</Alert>
          </div>
        ) : query.data.items.length === 0 ? (
          <EmptyState title="Tidak ada karyawan" description="Coba ubah kata kunci atau filter." />
        ) : (
          <>
            <Table>
              <thead className="bg-slate-50">
                <tr>
                  <Th>Karyawan</Th>
                  <Th>Departemen / Jabatan</Th>
                  <Th>Tipe</Th>
                  <Th>Masuk</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {query.data.items.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50">
                    <Td>
                      <Link href={`/employees/${e.id}`} className="font-medium text-slate-900 hover:text-brand-700 hover:underline">
                        {e.fullName}
                      </Link>
                      <div className="text-xs text-slate-500">{e.employeeCode}</div>
                    </Td>
                    <Td>
                      {e.department.name}
                      <div className="text-xs text-slate-500">{e.position.title}</div>
                    </Td>
                    <Td>{LABELS.contractType[e.contractType]}</Td>
                    <Td className="whitespace-nowrap">{formatDate(e.joinDate)}</Td>
                    <Td>
                      <Badge tone={statusTone(e.employmentStatus) as EmployeeStatusTone}>{LABELS.employmentStatus[e.employmentStatus]}</Badge>
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
