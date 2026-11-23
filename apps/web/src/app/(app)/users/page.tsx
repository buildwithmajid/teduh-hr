'use client';

import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Plus } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { RequirePermission } from '@/components/app-shell';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  Checkbox,
  ConfirmModal,
  EmptyState,
  Field,
  Input,
  Modal,
  ModalActions,
  PageHeader,
  Select,
  Table,
  TableSkeleton,
  Td,
  Th,
} from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useAuth, useMe } from '@/lib/auth';
import { formatDateTime, LABELS } from '@/lib/format';
import { useApiMutation } from '@/lib/mutation';
import { qk, useActiveEmployees, useRoles } from '@/lib/queries';
import type { Role, UserRow } from '@/lib/types';

export default function UsersPage() {
  return (
    <RequirePermission anyOf={['user.manage']}>
      <Users />
    </RequirePermission>
  );
}

/** User hanya bisa memberi role yang seluruh permission-nya ia miliki (aturan yang sama dengan server). */
function useAssignable() {
  const { me } = useAuth();
  const mine = new Set(me?.permissions ?? []);
  return (role: Role) => role.permissions.every((p) => mine.has(p));
}

function Users() {
  const me = useMe();
  const users = useQuery({ queryKey: qk.users, queryFn: () => api.get<UserRow[]>('/users') });
  const roles = useRoles();
  const [creating, setCreating] = useState(false);
  const [editingRoles, setEditingRoles] = useState<UserRow | null>(null);
  const [confirming, setConfirming] = useState<
    | null
    | { kind: 'resetMfa'; user: UserRow }
    | { kind: 'deactivate'; user: UserRow }
  >(null);

  const invalidate = [qk.users];
  const setActive = useApiMutation(
    ({ id, isActive }: { id: string; isActive: boolean }) => api.patch(`/users/${id}/status`, { isActive }),
    { invalidate, success: 'Status akun diperbarui', onDone: () => setConfirming(null) },
  );
  const resetMfa = useApiMutation((id: string) => api.post(`/users/${id}/reset-mfa`), {
    invalidate,
    success: 'MFA direset; user wajib enrol ulang saat login',
    onDone: () => setConfirming(null),
  });
  const actionError = setActive.error ?? resetMfa.error;

  return (
    <>
      <PageHeader
        title="User & role"
        description="Akun login dan hak akses di perusahaan ini."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" aria-hidden /> Tambah user
          </Button>
        }
      />
      <div className="space-y-6">
        {actionError && <Alert>{errorMessage(actionError)}</Alert>}
        <Card>
          {users.isPending ? (
            <TableSkeleton rows={5} cols={6} />
          ) : users.isError ? (
            <div className="p-4">
              <Alert>{errorMessage(users.error)}</Alert>
            </div>
          ) : users.data.length === 0 ? (
            <EmptyState title="Belum ada user" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Akun</Th>
                  <Th>Role</Th>
                  <Th>MFA</Th>
                  <Th>Login terakhir</Th>
                  <Th>Status</Th>
                  <Th />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {users.data.map((u) => {
                  const self = u.id === me.id;
                  return (
                    <tr key={u.id} className="hover:bg-canvas/60">
                      <Td>
                        <div className="flex items-center gap-2.5">
                          <Avatar name={u.employee?.fullName ?? u.email} size="sm" />
                          <div className="min-w-0">
                            <span className="font-medium text-ink">{u.email}</span>
                            <div className="text-xs text-ink-muted">
                              {u.employee
                                ? `${u.employee.fullName} · ${u.employee.employeeCode}`
                                : 'Tidak terhubung ke karyawan'}
                            </div>
                          </div>
                        </div>
                      </Td>
                      <Td>
                        <div className="flex flex-wrap gap-1">
                          {u.roles.map((r) => (
                            <Badge key={r.id} tone="brand">
                              {LABELS.role[r.name] ?? r.name}
                            </Badge>
                          ))}
                        </div>
                      </Td>
                      <Td>{u.mfaEnabled ? <Badge tone="green" dot>Aktif</Badge> : <Badge>Belum</Badge>}</Td>
                      <Td className="whitespace-nowrap font-mono text-xs text-ink-muted">{formatDateTime(u.lastLoginAt)}</Td>
                      <Td>{u.isActive ? <Badge tone="green" dot>Aktif</Badge> : <Badge tone="red" dot>Nonaktif</Badge>}</Td>
                      <Td className="whitespace-nowrap text-right">
                        {self ? (
                          <span className="text-xs text-ink-subtle">Akun Anda</span>
                        ) : (
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="ghost" onClick={() => setEditingRoles(u)}>
                              Role
                            </Button>
                            {u.mfaEnabled && (
                              <Button size="sm" variant="ghost" onClick={() => setConfirming({ kind: 'resetMfa', user: u })}>
                                Reset MFA
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                u.isActive
                                  ? setConfirming({ kind: 'deactivate', user: u })
                                  : setActive.mutate({ id: u.id, isActive: true })
                              }
                            >
                              {u.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                            </Button>
                          </div>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>

        <RolesReference roles={roles.data ?? []} />
      </div>

      {creating && <CreateUserModal roles={roles.data ?? []} onClose={() => setCreating(false)} />}
      {editingRoles && <EditRolesModal user={editingRoles} roles={roles.data ?? []} onClose={() => setEditingRoles(null)} />}

      <ConfirmModal
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        loading={resetMfa.isPending || setActive.isPending}
        title={confirming?.kind === 'resetMfa' ? 'Reset MFA akun' : 'Nonaktifkan akun'}
        description={
          confirming?.kind === 'resetMfa'
            ? `Reset verifikasi dua langkah untuk ${confirming.user.email}? Semua sesi aktif akan keluar dan user wajib enrol ulang.`
            : `Nonaktifkan akun ${confirming?.user.email ?? ''}? Semua sesi aktifnya akan segera dicabut.`
        }
        confirmLabel={confirming?.kind === 'resetMfa' ? 'Reset MFA' : 'Nonaktifkan'}
        onConfirm={() => {
          if (!confirming) return;
          if (confirming.kind === 'resetMfa') resetMfa.mutate(confirming.user.id);
          else setActive.mutate({ id: confirming.user.id, isActive: false });
        }}
      />
    </>
  );
}

function RoleCheckboxes({ roles, selected }: { roles: Role[]; selected?: string[] }) {
  const assignable = useAssignable();
  return (
    <fieldset className="space-y-2.5">
      <legend className="mb-1.5 text-[13px] font-medium text-ink">Role</legend>
      {roles.map((r) => (
        <Checkbox
          key={r.id}
          name="roleIds"
          value={r.id}
          defaultChecked={selected?.includes(r.id)}
          disabled={!assignable(r)}
          label={`${LABELS.role[r.name] ?? r.name}${r.requiresMfa ? ' · wajib MFA' : ''}`}
          description={assignable(r) ? (r.description ?? undefined) : 'Hak akses role ini melebihi hak Anda'}
        />
      ))}
    </fieldset>
  );
}

function CreateUserModal({ roles, onClose }: { roles: Role[]; onClose: () => void }) {
  const employees = useActiveEmployees();
  const create = useApiMutation((body: Record<string, unknown>) => api.post('/users', body), {
    invalidate: [qk.users, qk.employees],
    success: 'User dibuat. Bagikan password awal secara aman dan minta user menggantinya.',
    onDone: onClose,
  });
  const candidates = (employees.data ?? []).filter((e) => !e.hasUserAccount);

  return (
    <Modal open onClose={onClose} title="Tambah user">
      <form
        className="space-y-4"
        onSubmit={(e: FormEvent<HTMLFormElement>) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          create.mutate({
            email: f.get('email'),
            password: f.get('password'),
            roleIds: f.getAll('roleIds'),
            ...(f.get('employeeId') ? { employeeId: f.get('employeeId') } : {}),
          });
        }}
      >
        {create.isError && <Alert>{errorMessage(create.error)}</Alert>}
        <Field label="Email" required>
          {(id) => <Input id={id} name="email" type="email" required autoComplete="off" />}
        </Field>
        <Field label="Password awal" required hint="Minimal 12 karakter, berisi huruf dan angka.">
          {(id) => <Input id={id} name="password" type="password" required minLength={12} autoComplete="new-password" />}
        </Field>
        <Field label="Hubungkan ke karyawan">
          {(id) => (
            <Select id={id} name="employeeId" defaultValue="">
              <option value="">— Tidak dihubungkan —</option>
              {candidates.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.fullName} ({e.employeeCode})
                </option>
              ))}
            </Select>
          )}
        </Field>
        <RoleCheckboxes roles={roles} />
        <ModalActions>
          <Button variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button type="submit" loading={create.isPending}>
            Buat user
          </Button>
        </ModalActions>
      </form>
    </Modal>
  );
}

function EditRolesModal({ user, roles, onClose }: { user: UserRow; roles: Role[]; onClose: () => void }) {
  const save = useApiMutation((roleIds: string[]) => api.put(`/users/${user.id}/roles`, { roleIds }), {
    invalidate: [qk.users],
    success: 'Role diperbarui',
    onDone: onClose,
  });
  return (
    <Modal open onClose={onClose} title={`Role ${user.email}`} description="Mencabut semua role akan langsung mengeluarkan user dari semua sesinya.">
      <form
        className="space-y-4"
        onSubmit={(e: FormEvent<HTMLFormElement>) => {
          e.preventDefault();
          save.mutate(new FormData(e.currentTarget).getAll('roleIds').map(String));
        }}
      >
        {save.isError && <Alert>{errorMessage(save.error)}</Alert>}
        <RoleCheckboxes roles={roles} selected={user.roles.map((r) => r.id)} />
        <ModalActions>
          <Button variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button type="submit" loading={save.isPending}>
            Simpan
          </Button>
        </ModalActions>
      </form>
    </Modal>
  );
}

function RolesReference({ roles }: { roles: Role[] }) {
  return (
    <Card>
      <CardHeader title="Daftar role" description="Hak akses tiap role bawaan sistem." />
      <div className="divide-y divide-line">
        {roles.map((r) => (
          <details key={r.id} className="group px-5 py-3.5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm">
              <span>
                <span className="font-medium text-ink">{LABELS.role[r.name] ?? r.name}</span>
                <span className="ml-2 text-xs text-ink-muted">{r.description}</span>
              </span>
              <span className="flex items-center gap-1.5 font-mono text-xs text-ink-subtle">
                {r.permissions.length} permission
                <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" aria-hidden />
              </span>
            </summary>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {r.permissions.map((p) => (
                <code key={p} className="rounded border border-line bg-canvas px-2 py-0.5 font-mono text-[11px] text-ink-muted">
                  {p}
                </code>
              ))}
            </div>
          </details>
        ))}
      </div>
    </Card>
  );
}
