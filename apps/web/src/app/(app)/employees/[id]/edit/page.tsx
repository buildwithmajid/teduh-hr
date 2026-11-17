'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { RequirePermission } from '@/components/app-shell';
import { EmployeeForm } from '@/components/employee-form';
import { Alert, PageHeader, Spinner, useToast } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { qk } from '@/lib/queries';
import type { EmployeeSummary } from '@/lib/types';

export default function EditEmployeePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const employee = useQuery({ queryKey: qk.employee(id), queryFn: () => api.get<EmployeeSummary>(`/employees/${id}`) });
  const update = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.patch<EmployeeSummary>(`/employees/${id}`, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.employees });
      toast('Perubahan disimpan');
      router.push(`/employees/${id}`);
    },
  });

  return (
    <RequirePermission anyOf={['employee.manage']}>
      <PageHeader title={employee.data ? `Ubah data ${employee.data.fullName}` : 'Ubah data karyawan'} />
      {employee.isPending ? (
        <Spinner />
      ) : employee.isError ? (
        <Alert>{errorMessage(employee.error)}</Alert>
      ) : employee.data.employmentStatus !== 'active' ? (
        <Alert tone="amber">Karyawan ini sudah tidak aktif sehingga datanya tidak bisa diubah.</Alert>
      ) : (
        <EmployeeForm
          mode="edit"
          initial={employee.data}
          submitting={update.isPending}
          error={update.isError ? errorMessage(update.error) : null}
          onSubmit={(p) => update.mutate(p)}
          onCancel={() => router.push(`/employees/${id}`)}
        />
      )}
    </RequirePermission>
  );
}
