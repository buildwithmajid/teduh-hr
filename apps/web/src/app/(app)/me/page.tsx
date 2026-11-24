'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { Check, Eye, EyeOff, ShieldCheck, ShieldAlert } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { EmployeeSummaryList, SalaryComponentsTable, SensitiveList } from '@/components/employee-panels';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  PageHeader,
  Spinner,
  useToast,
} from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useAuth, useMe } from '@/lib/auth';
import { LABELS } from '@/lib/format';
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
              <div className="flex items-center gap-3.5 border-b border-line px-5 py-4">
                <Avatar name={profile.data.fullName} size="lg" />
                <div>
                  <h2 className="text-base font-semibold text-ink">{profile.data.fullName}</h2>
                  <p className="text-xs text-ink-muted">
                    {profile.data.position.title} · {profile.data.department.name}
                  </p>
                </div>
              </div>
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

        <AccountSecurityCard />
        <ChangePasswordCard />
      </div>
    </>
  );
}

function AccountSecurityCard() {
  const me = useMe();
  const requiresMfa = me.roles.some((r) => ['super_admin', 'hr_admin', 'finance'].includes(r));

  return (
    <Card>
      <CardHeader title="Keamanan akun" description="Status autentikasi dan hak akses akun Anda." />
      <div className="grid divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <div className="p-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">Email login</p>
          <p className="mt-1.5 font-mono text-sm text-ink">{me.email}</p>
        </div>
        <div className="p-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">Peran aktif</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {me.roles.map((r) => (
              <Badge key={r} tone="gray">
                {LABELS.role[r] ?? r}
              </Badge>
            ))}
          </div>
        </div>
        <div className="p-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">Verifikasi 2 langkah (MFA)</p>
          <div className="mt-1.5 flex items-center gap-2">
            {me.mfaEnabled ? (
              <Badge tone="green" dot>
                <ShieldCheck className="size-3" aria-hidden /> Aktif
              </Badge>
            ) : (
              <Badge tone={requiresMfa ? 'amber' : 'gray'} dot>
                <ShieldAlert className="size-3" aria-hidden /> Belum aktif
              </Badge>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

function PasswordInput({
  id,
  name,
  value,
  onChange,
  autoComplete,
  minLength,
  required,
}: {
  id: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  minLength?: number;
  required?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        name={name}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        minLength={minLength}
        required={required}
        className="pr-10"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? 'Sembunyikan password' : 'Tampilkan password'}
        className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer rounded p-1.5 text-ink-subtle transition-colors hover:bg-rail hover:text-ink"
      >
        {show ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
      </button>
    </div>
  );
}

function ChangePasswordCard() {
  const { logout } = useAuth();
  const toast = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [mismatch, setMismatch] = useState(false);

  const m = useMutation({
    mutationFn: (body: { currentPassword: string; newPassword: string }) => api.post('/auth/change-password', body),
    onSuccess: async () => {
      toast('Password diganti. Silakan masuk kembali.');
      await logout();
    },
  });

  const checks = [
    { ok: newPassword.length >= 12, label: 'Minimal 12 karakter' },
    { ok: /[A-Za-z]/.test(newPassword), label: 'Mengandung huruf' },
    { ok: /\d/.test(newPassword), label: 'Mengandung angka' },
    { ok: confirm.length > 0 && newPassword === confirm, label: 'Konfirmasi cocok' },
  ];

  return (
    <Card>
      <CardHeader
        title="Ganti password"
        description="Setelah password diganti, semua sesi di perangkat lain akan otomatis keluar."
      />
      <form
        className="grid max-w-xl gap-4 p-5"
        onSubmit={(e: FormEvent<HTMLFormElement>) => {
          e.preventDefault();
          if (newPassword !== confirm) {
            setMismatch(true);
            return;
          }
          setMismatch(false);
          m.mutate({ currentPassword, newPassword });
        }}
      >
        {m.isError && <Alert>{errorMessage(m.error)}</Alert>}
        {mismatch && <Alert>Konfirmasi password tidak sama.</Alert>}
        <Field label="Password saat ini" required>
          {(id) => (
            <PasswordInput
              id={id}
              name="currentPassword"
              value={currentPassword}
              onChange={setCurrentPassword}
              autoComplete="current-password"
              required
            />
          )}
        </Field>
        <Field label="Password baru" required>
          {(id) => (
            <PasswordInput
              id={id}
              name="newPassword"
              value={newPassword}
              onChange={(v) => {
                setNewPassword(v);
                setMismatch(false);
              }}
              autoComplete="new-password"
              minLength={12}
              required
            />
          )}
        </Field>
        <Field label="Ulangi password baru" required>
          {(id) => (
            <PasswordInput
              id={id}
              name="confirm"
              value={confirm}
              onChange={(v) => {
                setConfirm(v);
                setMismatch(false);
              }}
              autoComplete="new-password"
              minLength={12}
              required
            />
          )}
        </Field>

        {newPassword.length > 0 && (
          <ul className="grid grid-cols-2 gap-1.5 rounded-md border border-line bg-canvas/60 px-3.5 py-2.5 text-xs">
            {checks.map((c) => (
              <li
                key={c.label}
                className={c.ok ? 'flex items-center gap-1.5 font-medium text-emerald-800' : 'flex items-center gap-1.5 text-ink-muted'}
              >
                <Check className={c.ok ? 'size-3.5 text-emerald-600' : 'size-3.5 text-ink-subtle/40'} aria-hidden />
                {c.label}
              </li>
            ))}
          </ul>
        )}

        <div>
          <Button type="submit" loading={m.isPending}>
            Ganti password
          </Button>
        </div>
      </form>
    </Card>
  );
}
