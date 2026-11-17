'use client';

import { Pencil, Plus, Trash2 } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { RequirePermission } from '@/components/app-shell';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
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
  Tabs,
  Td,
  Th,
} from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { TIMEZONES } from '@/lib/format';
import { useApiMutation } from '@/lib/mutation';
import { qk, useActiveEmployees, useDepartments, usePositions, useWorkLocations } from '@/lib/queries';
import type { Department, Position, WorkLocation } from '@/lib/types';

type Tab = 'departments' | 'positions' | 'locations';

export default function OrganizationPage() {
  const { can } = useAuth();
  const [tab, setTab] = useState<Tab>('departments');
  return (
    <RequirePermission anyOf={['department.view']}>
      <PageHeader title="Organisasi" description="Struktur departemen, jabatan, dan lokasi kerja." />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'departments', label: 'Departemen' },
          { value: 'positions', label: 'Jabatan' },
          ...(can('location.view') ? [{ value: 'locations' as const, label: 'Lokasi kerja' }] : []),
        ]}
      />
      {tab === 'departments' && <DepartmentsTab />}
      {tab === 'positions' && <PositionsTab />}
      {tab === 'locations' && <LocationsTab />}
    </RequirePermission>
  );
}

function DeleteButton({ onClick, disabled, title }: { onClick: () => void; disabled?: boolean; title: string }) {
  return (
    <Button size="sm" variant="ghost" onClick={onClick} disabled={disabled} title={title} aria-label={title}>
      <Trash2 className="size-4" />
    </Button>
  );
}

// ───────────── Departemen ─────────────

/** Urutkan departemen sebagai pohon (induk lalu anak) dengan kedalaman untuk indentasi. */
function asTree(depts: Department[]) {
  const children = new Map<string | null, Department[]>();
  for (const d of depts) children.set(d.parentDepartmentId, [...(children.get(d.parentDepartmentId) ?? []), d]);
  const out: { d: Department; depth: number }[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const d of children.get(parent) ?? []) {
      out.push({ d, depth });
      walk(d.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

function DepartmentsTab() {
  const { can } = useAuth();
  const departments = useDepartments();
  const [editing, setEditing] = useState<Department | 'new' | null>(null);
  const del = useApiMutation((id: string) => api.delete(`/departments/${id}`), { invalidate: [qk.departments], success: 'Departemen dihapus' });
  const manage = can('department.manage');

  return (
    <Card>
      <CardHeader
        title="Departemen"
        actions={
          manage && (
            <Button onClick={() => setEditing('new')}>
              <Plus className="size-4" aria-hidden /> Tambah departemen
            </Button>
          )
        }
      />
      {del.isError && (
        <div className="px-5 pt-4">
          <Alert>{errorMessage(del.error)}</Alert>
        </div>
      )}
      {departments.isPending ? (
        <Spinner />
      ) : departments.isError ? (
        <div className="p-5">
          <Alert>{errorMessage(departments.error)}</Alert>
        </div>
      ) : departments.data.length === 0 ? (
        <EmptyState title="Belum ada departemen" />
      ) : (
        <Table>
          <thead className="bg-slate-50">
            <tr>
              <Th>Nama</Th>
              <Th>Kepala departemen</Th>
              <Th className="text-right">Karyawan</Th>
              <Th className="text-right">Jabatan</Th>
              {manage && <Th />}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {asTree(departments.data).map(({ d, depth }) => (
              <tr key={d.id}>
                <Td>
                  <span style={{ paddingLeft: depth * 20 }} className="font-medium text-slate-900">
                    {depth > 0 && <span className="mr-1 text-slate-300">└</span>}
                    {d.name}
                  </span>
                </Td>
                <Td>{d.head ? d.head.fullName : <span className="text-slate-400">Belum ditetapkan</span>}</Td>
                <Td className="text-right">{d._count.employees}</Td>
                <Td className="text-right">{d._count.positions}</Td>
                {manage && (
                  <Td className="whitespace-nowrap text-right">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(d)} aria-label={`Ubah ${d.name}`}>
                      <Pencil className="size-4" />
                    </Button>
                    <DeleteButton
                      title={
                        d._count.employees || d._count.positions || d._count.children
                          ? 'Tidak bisa dihapus: masih punya karyawan, jabatan, atau sub-departemen'
                          : `Hapus ${d.name}`
                      }
                      disabled={Boolean(d._count.employees || d._count.positions || d._count.children)}
                      onClick={() => confirm(`Hapus departemen ${d.name}?`) && del.mutate(d.id)}
                    />
                  </Td>
                )}
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {editing && <DepartmentModal department={editing === 'new' ? null : editing} all={departments.data ?? []} onClose={() => setEditing(null)} />}
    </Card>
  );
}

function DepartmentModal({ department, all, onClose }: { department: Department | null; all: Department[]; onClose: () => void }) {
  const employees = useActiveEmployees();
  const save = useApiMutation(
    (body: Record<string, unknown>) => (department ? api.patch(`/departments/${department.id}`, body) : api.post('/departments', body)),
    { invalidate: [qk.departments], success: 'Departemen disimpan', onDone: onClose },
  );
  // Departemen tidak boleh menjadi induk dirinya sendiri (siklus lain dicek di server).
  const parents = all.filter((d) => d.id !== department?.id);

  return (
    <Modal open onClose={onClose} title={department ? `Ubah ${department.name}` : 'Tambah departemen'}>
      <form
        className="space-y-4"
        onSubmit={(e: FormEvent<HTMLFormElement>) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          save.mutate({
            name: f.get('name'),
            parentDepartmentId: f.get('parentDepartmentId') || null,
            headEmployeeId: f.get('headEmployeeId') || null,
          });
        }}
      >
        {save.isError && <Alert>{errorMessage(save.error)}</Alert>}
        <Field label="Nama" required>
          {(id) => <Input id={id} name="name" required maxLength={100} defaultValue={department?.name} />}
        </Field>
        <Field label="Induk departemen">
          {(id) => (
            <Select id={id} name="parentDepartmentId" defaultValue={department?.parentDepartmentId ?? ''}>
              <option value="">— Tidak ada (level teratas) —</option>
              {parents.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Kepala departemen" hint="Dipakai sebagai approver bertipe kepala departemen.">
          {(id) => (
            <Select id={id} name="headEmployeeId" defaultValue={department?.headEmployeeId ?? ''}>
              <option value="">— Belum ditetapkan —</option>
              {employees.data?.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.fullName} ({e.department.name})
                </option>
              ))}
            </Select>
          )}
        </Field>
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

// ───────────── Jabatan ─────────────

function PositionsTab() {
  const { can } = useAuth();
  const positions = usePositions();
  const departments = useDepartments();
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState<Position | 'new' | null>(null);
  const del = useApiMutation((id: string) => api.delete(`/positions/${id}`), {
    invalidate: [qk.positions, qk.departments],
    success: 'Jabatan dihapus',
  });
  const manage = can('position.manage');
  const rows = (positions.data ?? []).filter((p) => !filter || p.departmentId === filter);

  return (
    <Card>
      <CardHeader
        title="Jabatan"
        actions={
          <>
            <Select aria-label="Filter departemen" className="w-auto" value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="">Semua departemen</option>
              {departments.data?.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
            {manage && (
              <Button onClick={() => setEditing('new')}>
                <Plus className="size-4" aria-hidden /> Tambah jabatan
              </Button>
            )}
          </>
        }
      />
      {del.isError && (
        <div className="px-5 pt-4">
          <Alert>{errorMessage(del.error)}</Alert>
        </div>
      )}
      {positions.isPending ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <EmptyState title="Belum ada jabatan" />
      ) : (
        <Table>
          <thead className="bg-slate-50">
            <tr>
              <Th>Jabatan</Th>
              <Th>Departemen</Th>
              <Th className="text-right">Level</Th>
              <Th>Lembur</Th>
              <Th className="text-right">Karyawan</Th>
              {manage && <Th />}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((p) => (
              <tr key={p.id}>
                <Td className="font-medium text-slate-900">{p.title}</Td>
                <Td>{p.department.name}</Td>
                <Td className="text-right">{p.level}</Td>
                <Td>{p.overtimeEligible ? <Badge tone="green">Berhak</Badge> : <Badge>Tidak</Badge>}</Td>
                <Td className="text-right">{p._count.employees}</Td>
                {manage && (
                  <Td className="whitespace-nowrap text-right">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(p)} aria-label={`Ubah ${p.title}`}>
                      <Pencil className="size-4" />
                    </Button>
                    <DeleteButton
                      title={p._count.employees ? 'Tidak bisa dihapus: masih dipakai karyawan' : `Hapus ${p.title}`}
                      disabled={p._count.employees > 0}
                      onClick={() => confirm(`Hapus jabatan ${p.title}?`) && del.mutate(p.id)}
                    />
                  </Td>
                )}
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {editing && <PositionModal position={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </Card>
  );
}

function PositionModal({ position, onClose }: { position: Position | null; onClose: () => void }) {
  const departments = useDepartments();
  const save = useApiMutation(
    (body: Record<string, unknown>) => (position ? api.patch(`/positions/${position.id}`, body) : api.post('/positions', body)),
    { invalidate: [qk.positions, qk.departments], success: 'Jabatan disimpan', onDone: onClose },
  );
  return (
    <Modal open onClose={onClose} title={position ? `Ubah ${position.title}` : 'Tambah jabatan'}>
      <form
        className="space-y-4"
        onSubmit={(e: FormEvent<HTMLFormElement>) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const body: Record<string, unknown> = {
            title: f.get('title'),
            level: Number(f.get('level')),
            overtimeEligible: f.get('overtimeEligible') === 'on',
          };
          if (!position) body.departmentId = f.get('departmentId');
          save.mutate(body);
        }}
      >
        {save.isError && <Alert>{errorMessage(save.error)}</Alert>}
        {!position && (
          <Field label="Departemen" required>
            {(id) => (
              <Select id={id} name="departmentId" required defaultValue="">
                <option value="" disabled>
                  Pilih…
                </option>
                {departments.data?.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        <Field label="Nama jabatan" required>
          {(id) => <Input id={id} name="title" required maxLength={100} defaultValue={position?.title} />}
        </Field>
        <Field label="Level" required hint="1 = junior … makin tinggi makin senior. Dipakai untuk hierarki approval.">
          {(id) => <Input id={id} name="level" type="number" min={1} max={20} required defaultValue={position?.level ?? 1} />}
        </Field>
        <Checkbox
          name="overtimeEligible"
          defaultChecked={position?.overtimeEligible ?? true}
          label="Berhak lembur"
          description="Jabatan tertentu (misal manajerial) bisa dikecualikan sesuai kebijakan & regulasi."
        />
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

// ───────────── Lokasi kerja ─────────────

function LocationsTab() {
  const { can } = useAuth();
  const locations = useWorkLocations();
  const [editing, setEditing] = useState<WorkLocation | 'new' | null>(null);
  const del = useApiMutation((id: string) => api.delete(`/work-locations/${id}`), { invalidate: [qk.locations], success: 'Lokasi dihapus' });
  const manage = can('location.manage');

  return (
    <Card>
      <CardHeader
        title="Lokasi kerja"
        description="Titik & radius geofence untuk validasi absensi."
        actions={
          manage && (
            <Button onClick={() => setEditing('new')}>
              <Plus className="size-4" aria-hidden /> Tambah lokasi
            </Button>
          )
        }
      />
      {del.isError && (
        <div className="px-5 pt-4">
          <Alert>{errorMessage(del.error)}</Alert>
        </div>
      )}
      {locations.isPending ? (
        <Spinner />
      ) : !locations.data?.length ? (
        <EmptyState title="Belum ada lokasi kerja" />
      ) : (
        <Table>
          <thead className="bg-slate-50">
            <tr>
              <Th>Nama</Th>
              <Th>Koordinat</Th>
              <Th className="text-right">Radius</Th>
              <Th>Zona waktu</Th>
              {manage && <Th />}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {locations.data.map((l) => (
              <tr key={l.id}>
                <Td className="font-medium text-slate-900">{l.name}</Td>
                <Td>
                  <a
                    className="font-mono text-xs text-brand-700 hover:underline"
                    href={`https://www.openstreetmap.org/?mlat=${l.latitude}&mlon=${l.longitude}#map=17/${l.latitude}/${l.longitude}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {Number(l.latitude).toFixed(5)}, {Number(l.longitude).toFixed(5)}
                  </a>
                </Td>
                <Td className="text-right">{l.radiusMeters} m</Td>
                <Td>{TIMEZONES.find((t) => t.value === l.timezone)?.label ?? l.timezone}</Td>
                {manage && (
                  <Td className="whitespace-nowrap text-right">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(l)} aria-label={`Ubah ${l.name}`}>
                      <Pencil className="size-4" />
                    </Button>
                    <DeleteButton title={`Hapus ${l.name}`} onClick={() => confirm(`Hapus lokasi ${l.name}?`) && del.mutate(l.id)} />
                  </Td>
                )}
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {editing && <LocationModal location={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </Card>
  );
}

function LocationModal({ location, onClose }: { location: WorkLocation | null; onClose: () => void }) {
  const save = useApiMutation(
    (body: Record<string, unknown>) => (location ? api.patch(`/work-locations/${location.id}`, body) : api.post('/work-locations', body)),
    { invalidate: [qk.locations], success: 'Lokasi disimpan', onDone: onClose },
  );
  return (
    <Modal open onClose={onClose} title={location ? `Ubah ${location.name}` : 'Tambah lokasi kerja'}>
      <form
        className="space-y-4"
        onSubmit={(e: FormEvent<HTMLFormElement>) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          save.mutate({
            name: f.get('name'),
            latitude: Number(f.get('latitude')),
            longitude: Number(f.get('longitude')),
            radiusMeters: Number(f.get('radiusMeters')),
            timezone: f.get('timezone'),
          });
        }}
      >
        {save.isError && <Alert>{errorMessage(save.error)}</Alert>}
        <Field label="Nama" required>
          {(id) => <Input id={id} name="name" required maxLength={100} defaultValue={location?.name} />}
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Latitude" required>
            {(id) => <Input id={id} name="latitude" type="number" step="any" min={-90} max={90} required defaultValue={location?.latitude} />}
          </Field>
          <Field label="Longitude" required>
            {(id) => <Input id={id} name="longitude" type="number" step="any" min={-180} max={180} required defaultValue={location?.longitude} />}
          </Field>
        </div>
        <Field label="Radius (meter)" required hint="Clock-in di luar radius akan ditandai sebagai anomali.">
          {(id) => <Input id={id} name="radiusMeters" type="number" min={10} max={10000} required defaultValue={location?.radiusMeters ?? 100} />}
        </Field>
        <Field label="Zona waktu" required>
          {(id) => (
            <Select id={id} name="timezone" required defaultValue={location?.timezone ?? 'Asia/Jakarta'}>
              {TIMEZONES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
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
