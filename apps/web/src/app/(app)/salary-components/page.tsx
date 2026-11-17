'use client';

import { Pencil, Plus } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { RequirePermission } from '@/components/app-shell';
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Field,
  Input,
  Modal,
  ModalActions,
  PageHeader,
  Select,
  Spinner,
  Table,
  Td,
  Th,
} from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { LABELS } from '@/lib/format';
import { useApiMutation } from '@/lib/mutation';
import { qk, useSalaryComponents } from '@/lib/queries';
import type { SalaryComponent } from '@/lib/types';

export default function SalaryComponentsPage() {
  const { can } = useAuth();
  const components = useSalaryComponents();
  const [editing, setEditing] = useState<SalaryComponent | 'new' | null>(null);
  const manage = can('salary.manage');

  return (
    <RequirePermission anyOf={['salary.view']}>
      <PageHeader
        title="Komponen gaji"
        description="Katalog tunjangan & potongan. Nominal per karyawan diatur di halaman detail karyawan."
        actions={
          manage && (
            <Button onClick={() => setEditing('new')}>
              <Plus className="size-4" aria-hidden /> Tambah komponen
            </Button>
          )
        }
      />
      <Card>
        {components.isPending ? (
          <Spinner />
        ) : components.isError ? (
          <div className="p-4">
            <Alert>{errorMessage(components.error)}</Alert>
          </div>
        ) : components.data.length === 0 ? (
          <EmptyState title="Belum ada komponen gaji" />
        ) : (
          <Table>
            <thead className="bg-slate-50">
              <tr>
                <Th>Komponen</Th>
                <Th>Jenis</Th>
                <Th>Perhitungan</Th>
                <Th>Sifat</Th>
                <Th>Status</Th>
                {manage && <Th />}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {components.data.map((c) => (
                <tr key={c.id}>
                  <Td>
                    <span className="font-medium text-slate-900">{c.name}</span>
                    <div className="font-mono text-xs text-slate-500">{c.code}</div>
                  </Td>
                  <Td>{LABELS.componentType[c.type]}</Td>
                  <Td>{LABELS.calculation[c.calculation]}</Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {c.isFixed ? <Badge tone="brand">Tunjangan tetap</Badge> : <Badge>Tidak tetap</Badge>}
                      {!c.isTaxable && <Badge tone="blue">Tidak kena pajak</Badge>}
                    </div>
                  </Td>
                  <Td>{c.isActive ? <Badge tone="green">Aktif</Badge> : <Badge>Nonaktif</Badge>}</Td>
                  {manage && (
                    <Td className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(c)} aria-label={`Ubah ${c.name}`}>
                        <Pencil className="size-4" />
                      </Button>
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      {editing && <ComponentModal component={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </RequirePermission>
  );
}

function ComponentModal({ component, onClose }: { component: SalaryComponent | null; onClose: () => void }) {
  const [type, setType] = useState<'earning' | 'deduction'>(component?.type ?? 'earning');
  const save = useApiMutation(
    (body: Record<string, unknown>) =>
      component ? api.patch(`/salary-components/${component.id}`, body) : api.post('/salary-components', body),
    { invalidate: [qk.salaryComponents], success: 'Komponen gaji disimpan', onDone: onClose },
  );

  return (
    <Modal
      open
      onClose={onClose}
      title={component ? `Ubah ${component.name}` : 'Tambah komponen gaji'}
      description={component ? 'Kode, jenis, dan sifat tidak bisa diubah karena memengaruhi histori payroll.' : undefined}
    >
      <form
        className="space-y-4"
        onSubmit={(e: FormEvent<HTMLFormElement>) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const common = { name: f.get('name'), isTaxable: f.get('isTaxable') === 'on' };
          save.mutate(
            component
              ? { ...common, isActive: f.get('isActive') === 'on' }
              : {
                  ...common,
                  code: f.get('code'),
                  type,
                  isFixed: type === 'earning' && f.get('isFixed') === 'on',
                  calculation: f.get('calculation'),
                },
          );
        }}
      >
        {save.isError && <Alert>{errorMessage(save.error)}</Alert>}
        {!component && (
          <Field label="Kode" required hint="Huruf kecil, angka, underscore. Contoh: tunjangan_komunikasi">
            {(id) => <Input id={id} name="code" required pattern="[a-z][a-z0-9_]{1,29}" className="font-mono" />}
          </Field>
        )}
        <Field label="Nama" required>
          {(id) => <Input id={id} name="name" required minLength={2} maxLength={100} defaultValue={component?.name} />}
        </Field>
        {!component && (
          <>
            <Field label="Jenis" required>
              {(id) => (
                <Select id={id} value={type} onChange={(e) => setType(e.target.value as 'earning' | 'deduction')}>
                  <option value="earning">{LABELS.componentType.earning}</option>
                  <option value="deduction">{LABELS.componentType.deduction}</option>
                </Select>
              )}
            </Field>
            <Field label="Perhitungan" required>
              {(id) => (
                <Select id={id} name="calculation" defaultValue="fixed_amount">
                  <option value="fixed_amount">{LABELS.calculation.fixed_amount}</option>
                  <option value="per_attendance_day">{LABELS.calculation.per_attendance_day}</option>
                </Select>
              )}
            </Field>
            {type === 'earning' && (
              <Checkbox
                name="isFixed"
                label="Tunjangan tetap"
                description="Dibayar tetap tiap bulan tanpa bergantung kehadiran; masuk dasar iuran BPJS dan upah lembur."
              />
            )}
          </>
        )}
        <Checkbox name="isTaxable" defaultChecked={component?.isTaxable ?? true} label="Kena pajak (PPh 21)" />
        {component && <Checkbox name="isActive" defaultChecked={component.isActive} label="Aktif" description="Komponen nonaktif tidak bisa ditetapkan ke karyawan baru." />}
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
