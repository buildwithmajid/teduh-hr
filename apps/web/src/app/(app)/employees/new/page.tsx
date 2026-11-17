'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { RequirePermission } from '@/components/app-shell';
import { EmployeeForm } from '@/components/employee-form';
import { PageHeader, useToast } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { qk } from '@/lib/queries';
import type { EmployeeSummary } from '@/lib/types';

export default function NewEmployeePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const create = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post<EmployeeSummary>('/employees', payload),
    onSuccess: (emp) => {
      void queryClient.invalidateQueries({ queryKey: qk.employees });
      toast(`${emp.fullName} ditambahkan`);
      router.push(`/employees/${emp.id}`);
    },
  });

  return (
    <RequirePermission anyOf={['employee.manage']}>
      <PageHeader title="Tambah karyawan" />
      <EmployeeForm
        mode="create"
        submitting={create.isPending}
        error={create.isError ? errorMessage(create.error) : null}
        onSubmit={(p) => create.mutate(p)}
        onCancel={() => router.push('/employees')}
      />
    </RequirePermission>
  );
}
