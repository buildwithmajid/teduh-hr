'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { EmployeeSummaryList, SalaryComponentsTable, SensitiveList } from '@/components/employee-panels';
import { Alert, Button, Card, CardHeader, Field, Input, PageHeader, Spinner, useToast } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useAuth, useMe } from '@/lib/auth';
import type { MyProfile } from '@/lib/types';

export default function MyProfilePage() {
  const me = useMe();
  const profile = useQuery({
    queryKey: ['me', 'profile'],
    queryFn: () => api.get<MyProfile>('/employees/me'),
    enabled: me.employee !== null,
  });

  return (
    <>
      <PageHeader title="Profil saya" description={me.email} />
      <div className="space-y-6">
        {me.employee === null ? (
          <Alert tone="blue">Akun ini tidak terhubung ke data karyawan.</Alert>
        ) : profile.isPending ? (
          <Spinner />
        ) : profile.isError ? (
          <Alert>{errorMessage(profile.error)}</Alert>
        ) : (
          <>
            <Card>
              <CardHeader title={profile.data.fullName} description={`${profile.data.position.title} · ${profile.data.department.name}`} />
              <div className="p-5">
                <EmployeeSummaryList e={profile.data} />
              </div>
            </Card>
            <Card>
              <CardHeader title="Gaji & data pribadi" description="Hanya Anda, HR, dan Finance yang bisa melihat data ini." />
              <div className="p-5">
                <SensitiveList e={profile.data} />
              </div>
            </Card>
            <Card>
              <CardHeader title="Komponen gaji" />
              <SalaryComponentsTable rows={profile.data.salaryComponents} />
            </Card>
          </>
        )}
        <ChangePasswordCard />
      </div>
    </>
  );
}

function ChangePasswordCard() {
  const { logout } = useAuth();
  const toast = useToast();
  const [mismatch, setMismatch] = useState(false);
  const m = useMutation({
    mutationFn: (body: { currentPassword: string; newPassword: string }) => api.post('/auth/change-password', body),
    onSuccess: async () => {
      toast('Password diganti. Silakan masuk kembali.');
      await logout();
    },
  });

  return (
    <Card>
      <CardHeader title="Ganti password" description="Minimal 12 karakter, berisi huruf dan angka. Semua sesi lain akan keluar." />
      <form
        className="grid max-w-xl gap-4 p-5"
        onSubmit={(e: FormEvent<HTMLFormElement>) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const next = String(f.get('newPassword'));
          setMismatch(next !== String(f.get('confirm')));
          if (next !== String(f.get('confirm'))) return;
          m.mutate({ currentPassword: String(f.get('currentPassword')), newPassword: next });
        }}
      >
        {m.isError && <Alert>{errorMessage(m.error)}</Alert>}
        {mismatch && <Alert>Konfirmasi password tidak sama.</Alert>}
        <Field label="Password saat ini" required>
          {(id) => <Input id={id} name="currentPassword" type="password" autoComplete="current-password" required />}
        </Field>
        <Field label="Password baru" required>
          {(id) => <Input id={id} name="newPassword" type="password" autoComplete="new-password" minLength={12} required />}
        </Field>
        <Field label="Ulangi password baru" required>
          {(id) => <Input id={id} name="confirm" type="password" autoComplete="new-password" minLength={12} required />}
        </Field>
        <div>
          <Button type="submit" loading={m.isPending}>
            Ganti password
          </Button>
        </div>
      </form>
    </Card>
  );
}
