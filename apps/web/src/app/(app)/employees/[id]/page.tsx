'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Eye, MoreHorizontal, Pencil, Plus, ShieldAlert, UserX } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { RequirePermission } from '@/components/app-shell';
import { EmployeeSummaryList, SalaryComponentsTable, SensitiveList } from '@/components/employee-panels';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Modal,
  ModalActions,
  Select,
  Spinner,
  Table,
  TableSkeleton,
  Tabs,
  Td,
  Textarea,
  Th,
  useToast,
} from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate, formatDateTime, formatRupiah, formatTenure, LABELS, todayISO } from '@/lib/format';
import { qk, useActiveEmployees, useDepartments, usePositions, useSalaryComponents, useWorkLocations } from '@/lib/queries';
import type { EmployeeSensitive, EmployeeSummary, HistoryEntry, SalaryAssignment } from '@/lib/types';
import { statusTone } from '../status';

type Tab = 'summary' | 'sensitive' | 'components' | 'history';

export default function EmployeeDetailPage() {
  return (
    <RequirePermission anyOf={['employee.view']}>
      <EmployeeDetail />
    </RequirePermission>
  );
}

function EmployeeDetail() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const [tab, setTab] = useState<Tab>('summary');
  const [modal, setModal] = useState<null | 'salary' | 'sensitive' | 'terminate'>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  // Disimpan di sini (bukan di tab) supaya bisa disembunyikan lagi setelah data berubah.
  const [revealed, setRevealed] = useState(false);
  const employee = useQuery({ queryKey: qk.employee(id), queryFn: () => api.get<EmployeeSummary>(`/employees/${id}`) });

  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (ev: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(ev.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [menuOpen]);

  const closeModal = (changed = false) => {
    setModal(null);
    if (changed) setRevealed(false);
  };

  if (employee.isPending) return <Spinner />;
  if (employee.isError) return <Alert>{errorMessage(employee.error)}</Alert>;
  const e = employee.data;
  const active = e.employmentStatus === 'active';
  const canSensitive = can('employee.view_sensitive');
  const hasSecondaryActions = active && (can('employee.manage_sensitive') || can('employee.manage'));

  const tabs: { value: Tab; label: string }[] = [
    { value: 'summary', label: 'Ringkasan' },
    ...(canSensitive
      ? [
          { value: 'sensitive' as const, label: 'Gaji & data sensitif' },
          { value: 'components' as const, label: 'Komponen gaji' },
          { value: 'history' as const, label: 'Riwayat' },
        ]
      : []),
  ];

  return (
    <>
      <Link href="/employees" className="mb-4 inline-flex items-center gap-1 text-xs font-medium text-ink-muted hover:text-ink">
        <ArrowLeft className="size-3.5" aria-hidden /> Kembali ke daftar karyawan
      </Link>

      {/* Profile Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5">
        <div className="flex items-start gap-4">
          <Avatar name={e.fullName} size="lg" />
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-[22px] font-semibold tracking-tight text-ink">{e.fullName}</h1>
              <Badge tone={statusTone(e.employmentStatus)} dot>
                {LABELS.employmentStatus[e.employmentStatus]}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-ink-muted">
              {e.position.title} · {e.department.name}
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-subtle">
              <span className="font-mono text-ink-muted">{e.employeeCode}</span>
              <span>·</span>
              <span>{LABELS.contractType[e.contractType]}</span>
              <span>·</span>
              <span>Masa kerja {formatTenure(e.joinDate, e.resignDate)}</span>
            </p>
          </div>
        </div>

        {active && (
          <div className="flex flex-wrap items-center gap-2">
            {can('employee.manage') && (
              <Link href={`/employees/${id}/edit`}>
                <Button variant="secondary">
                  <Pencil className="size-3.5" aria-hidden /> Ubah data
                </Button>
              </Link>
            )}
            {can('salary.manage') && (
              <Button variant="secondary" onClick={() => setModal('salary')}>
                Ubah gaji
              </Button>
            )}
            {hasSecondaryActions && (
              <div className="relative" ref={menuRef}>
                <Button
                  variant="secondary"
                  aria-label="Aksi lainnya"
                  aria-expanded={menuOpen}
                  onClick={() => setMenuOpen((v) => !v)}
                  className="px-2.5"
                >
                  <MoreHorizontal className="size-4" />
                </Button>
                {menuOpen && (
                  <div className="absolute right-0 z-20 mt-1.5 w-52 rounded-lg border border-line bg-surface p-1 shadow-lg">
                    {can('employee.manage_sensitive') && (
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          setModal('sensitive');
                        }}
                        className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs font-medium text-ink hover:bg-canvas"
                      >
                        <ShieldAlert className="size-3.5 text-ink-muted" aria-hidden />
                        Ubah NIK / rekening / NPWP
                      </button>
                    )}
                    {can('employee.manage') && (
                      <>
                        {can('employee.manage_sensitive') && <div className="my-1 border-t border-line" />}
                        <button
                          type="button"
                          onClick={() => {
                            setMenuOpen(false);
                            setModal('terminate');
                          }}
                          className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs font-medium text-red-700 hover:bg-red-50"
                        >
                          <UserX className="size-3.5" aria-hidden />
                          Proses resign / PHK
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <Tabs tabs={tabs} value={tab} onChange={setTab} />

      {tab === 'summary' && (
        <Card className="p-5">
          <EmployeeSummaryList e={e} />
        </Card>
      )}
      {tab === 'sensitive' && <SensitiveTab id={id} revealed={revealed} onReveal={() => setRevealed(true)} />}
      {tab === 'components' && <ComponentsTab id={id} active={active} joinDate={e.joinDate} />}
      {tab === 'history' && <HistoryTab id={id} />}

      <SalaryChangeModal id={id} open={modal === 'salary'} onClose={closeModal} />
      <SensitiveEditModal id={id} open={modal === 'sensitive'} onClose={closeModal} />
      <TerminateModal employee={e} open={modal === 'terminate'} onClose={closeModal} />
    </>
  );
}

/**
 * Query yang memicu audit `view_sensitive` di server memakai namespace sendiri, supaya tidak
 * ikut di-refetch otomatis oleh invalidasi data karyawan (refetch otomatis = log palsu).
 */
const auditedKey = {
  sensitive: (id: string) => ['audited', 'sensitive', id] as const,
  components: (id: string) => ['audited', 'components', id] as const,
  history: (id: string) => ['audited', 'history', id] as const,
};

/** Data sensitif baru diambil setelah user menekan tombol — setiap akses tercatat di audit log. */
function SensitiveTab({ id, revealed, onReveal }: { id: string; revealed: boolean; onReveal: () => void }) {
  const data = useQuery({
    queryKey: auditedKey.sensitive(id),
    queryFn: () => api.get<EmployeeSensitive>(`/employees/${id}/sensitive`),
    enabled: revealed,
    staleTime: 0,
    gcTime: 0,
  });

  return (
    <Card>
      <CardHeader
        title="Gaji & data sensitif"
        description="Terenkripsi di database. Setiap kali ditampilkan, aksesnya dicatat di audit log."
      />
      <div className="p-5">
        {!revealed ? (
          <div className="flex flex-col items-start gap-3 rounded-md border border-dashed border-line-strong bg-canvas/60 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-ink">Data sensitif disembunyikan</p>
              <p className="mt-0.5 text-xs text-ink-muted">
                Klik tombol di samping untuk mendekripsi NIK, gaji pokok, nomor rekening, dan NPWP.
              </p>
            </div>
            <Button variant="secondary" onClick={onReveal}>
              <Eye className="size-4" aria-hidden /> Tampilkan data
            </Button>
          </div>
        ) : data.isPending ? (
          <Spinner />
        ) : data.isError ? (
          <Alert>{errorMessage(data.error)}</Alert>
        ) : (
          <SensitiveList e={data.data} />
        )}
      </div>
    </Card>
  );
}

function ComponentsTab({ id, active, joinDate }: { id: string; active: boolean; joinDate: string }) {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [assignOpen, setAssignOpen] = useState(false);
  const [ending, setEnding] = useState<SalaryAssignment | null>(null);
  const key = auditedKey.components(id);
  const rows = useQuery({ queryKey: key, queryFn: () => api.get<SalaryAssignment[]>(`/employees/${id}/salary-components`) });
  const catalog = useSalaryComponents();

  const assign = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post(`/employees/${id}/salary-components`, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: key });
      setAssignOpen(false);
      toast('Komponen gaji disimpan');
    },
  });
  const end = useMutation({
    mutationFn: ({ assignmentId, effectiveTo }: { assignmentId: string; effectiveTo: string }) =>
      api.post(`/employees/${id}/salary-components/${assignmentId}/end`, { effectiveTo }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: key });
      setEnding(null);
      toast('Komponen gaji diakhiri');
    },
  });
  const manage = active && can('salary.manage');

  return (
    <Card>
      <CardHeader
        title="Komponen gaji"
        description="Tunjangan tetap ikut menjadi dasar iuran BPJS dan upah lembur."
        actions={
          manage && (
            <Button
              onClick={() => {
                assign.reset();
                setAssignOpen(true);
              }}
            >
              <Plus className="size-4" aria-hidden /> Tetapkan komponen
            </Button>
          )
        }
      />
      {rows.isPending ? (
        <TableSkeleton rows={3} cols={4} />
      ) : rows.isError ? (
        <div className="p-5">
          <Alert>{errorMessage(rows.error)}</Alert>
        </div>
      ) : (
        <SalaryComponentsTable
          rows={rows.data}
          renderAction={
            manage
              ? (r) => (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      end.reset();
                      setEnding(r);
                    }}
                  >
                    Akhiri
                  </Button>
                )
              : undefined
          }
        />
      )}

      <Modal
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        title="Tetapkan komponen gaji"
        description="Jika komponen yang sama masih berlaku, penugasan lama otomatis diakhiri sehari sebelum tanggal mulai."
      >
        <form
          onSubmit={(ev: FormEvent<HTMLFormElement>) => {
            ev.preventDefault();
            const f = new FormData(ev.currentTarget);
            assign.mutate({
              componentId: f.get('componentId'),
              amount: Number(f.get('amount')),
              effectiveFrom: f.get('effectiveFrom'),
            });
          }}
          className="space-y-4"
        >
          {assign.isError && <Alert>{errorMessage(assign.error)}</Alert>}
          <Field label="Komponen" required>
            {(fid) => (
              <Select id={fid} name="componentId" required defaultValue="">
                <option value="" disabled>
                  Pilih…
                </option>
                {catalog.data
                  ?.filter((c) => c.isActive)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} — {LABELS.calculation[c.calculation]}
                    </option>
                  ))}
              </Select>
            )}
          </Field>
          <Field label="Nominal (Rp)" required>
            {(fid) => <Input id={fid} name="amount" type="number" min={0} step={1} required />}
          </Field>
          <Field label="Berlaku mulai" required>
            {(fid) => <Input id={fid} name="effectiveFrom" type="date" min={joinDate} required defaultValue={todayISO()} />}
          </Field>
          <ModalActions>
            <Button variant="secondary" onClick={() => setAssignOpen(false)}>
              Batal
            </Button>
            <Button type="submit" loading={assign.isPending}>
              Simpan
            </Button>
          </ModalActions>
        </form>
      </Modal>

      <Modal open={ending !== null} onClose={() => setEnding(null)} title={`Akhiri ${ending?.component.name ?? ''}`} size="sm">
        <form
          onSubmit={(ev: FormEvent<HTMLFormElement>) => {
            ev.preventDefault();
            if (!ending) return;
            end.mutate({ assignmentId: ending.id, effectiveTo: String(new FormData(ev.currentTarget).get('effectiveTo')) });
          }}
          className="space-y-4"
        >
          {end.isError && <Alert>{errorMessage(end.error)}</Alert>}
          <Field label="Berlaku sampai (tanggal terakhir)" required>
            {(fid) => <Input id={fid} name="effectiveTo" type="date" min={ending?.effectiveFrom} required defaultValue={todayISO()} />}
          </Field>
          <ModalActions>
            <Button variant="secondary" onClick={() => setEnding(null)}>
              Batal
            </Button>
            <Button type="submit" variant="danger" loading={end.isPending}>
              Akhiri komponen
            </Button>
          </ModalActions>
        </form>
      </Modal>
    </Card>
  );
}

function HistoryTab({ id }: { id: string }) {
  const history = useQuery({
    queryKey: auditedKey.history(id),
    queryFn: () => api.get<HistoryEntry[]>(`/employees/${id}/history`),
  });
  const departments = useDepartments();
  const positions = usePositions();
  const locations = useWorkLocations();
  const employees = useActiveEmployees();
  const names: Record<string, Map<string, string>> = {
    department_id: new Map(departments.data?.map((d) => [d.id, d.name])),
    position_id: new Map(positions.data?.map((p) => [p.id, `${p.title} (${p.department.name})`])),
    work_location_id: new Map(locations.data?.map((l) => [l.id, l.name])),
    supervisor_id: new Map(employees.data?.map((e) => [e.id, e.fullName])),
  };
  const format = (h: HistoryEntry, v: string | null) => {
    if (v === null) return '—';
    if (h.field === 'base_salary') return <span className="font-mono">{formatRupiah(v)}</span>;
    if (h.field === 'employment_status') return LABELS.employmentStatus[v as keyof typeof LABELS.employmentStatus] ?? v;
    if (h.field === 'contract_type') return LABELS.contractType[v as keyof typeof LABELS.contractType] ?? v;
    const name = names[h.field]?.get(v);
    if (name) return name;
    if (/^[0-9a-f-]{36}$/.test(v)) return <span className="font-mono text-xs text-ink-subtle">{v.slice(0, 8)}…</span>;
    return v;
  };

  return (
    <Card>
      <CardHeader title="Riwayat perubahan" description="Dipakai untuk prorata payroll dan jejak audit." />
      {history.isPending ? (
        <TableSkeleton rows={4} cols={5} />
      ) : history.isError ? (
        <div className="p-5">
          <Alert>{errorMessage(history.error)}</Alert>
        </div>
      ) : history.data.length === 0 ? (
        <EmptyState title="Belum ada riwayat perubahan" />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Berlaku</Th>
              <Th>Data</Th>
              <Th>Sebelum</Th>
              <Th>Sesudah</Th>
              <Th>Alasan</Th>
              <Th>Dicatat</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {history.data.map((h) => (
              <tr key={h.id} className="hover:bg-canvas/50">
                <Td className="whitespace-nowrap font-mono text-xs">{formatDate(h.effectiveDate)}</Td>
                <Td className="font-medium text-ink">{LABELS.historyField[h.field] ?? h.field}</Td>
                <Td className="text-ink-muted">{format(h, h.oldValue)}</Td>
                <Td className="text-ink">{format(h, h.newValue)}</Td>
                <Td className="max-w-xs text-ink-muted">{h.reason ?? '—'}</Td>
                <Td className="whitespace-nowrap font-mono text-xs text-ink-subtle">{formatDateTime(h.createdAt)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}

function useInvalidateEmployee(id: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: qk.employees });
    void queryClient.invalidateQueries({ queryKey: auditedKey.history(id) });
    queryClient.removeQueries({ queryKey: auditedKey.sensitive(id) });
  };
}

function SalaryChangeModal({ id, open, onClose }: { id: string; open: boolean; onClose: (changed?: boolean) => void }) {
  const invalidate = useInvalidateEmployee(id);
  const toast = useToast();
  const m = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post(`/employees/${id}/salary-changes`, body),
    onSuccess: () => {
      invalidate();
      toast('Gaji pokok diperbarui');
      onClose(true);
    },
  });
  return (
    <Modal
      open={open}
      onClose={() => {
        m.reset();
        onClose();
      }}
      title="Ubah gaji pokok"
      description="Tanggal efektif boleh mundur, tapi harus setelah perubahan gaji terakhir dan tidak di masa depan."
    >
      <form
        onSubmit={(ev: FormEvent<HTMLFormElement>) => {
          ev.preventDefault();
          const f = new FormData(ev.currentTarget);
          m.mutate({ baseSalary: Number(f.get('baseSalary')), effectiveDate: f.get('effectiveDate'), reason: f.get('reason') });
        }}
        className="space-y-4"
      >
        {m.isError && <Alert>{errorMessage(m.error)}</Alert>}
        <Field label="Gaji pokok baru (Rp / bulan)" required>
          {(fid) => <Input id={fid} name="baseSalary" type="number" min={0} step={1} required />}
        </Field>
        <Field label="Berlaku mulai" required>
          {(fid) => <Input id={fid} name="effectiveDate" type="date" max={todayISO()} required defaultValue={todayISO()} />}
        </Field>
        <Field label="Alasan" required>
          {(fid) => <Textarea id={fid} name="reason" required minLength={3} maxLength={500} placeholder="Misal: penyesuaian tahunan, promosi" />}
        </Field>
        <ModalActions>
          <Button variant="secondary" onClick={() => onClose()}>
            Batal
          </Button>
          <Button type="submit" loading={m.isPending}>
            Simpan
          </Button>
        </ModalActions>
      </form>
    </Modal>
  );
}

function SensitiveEditModal({ id, open, onClose }: { id: string; open: boolean; onClose: (changed?: boolean) => void }) {
  const invalidate = useInvalidateEmployee(id);
  const toast = useToast();
  const m = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch(`/employees/${id}/sensitive`, body),
    onSuccess: () => {
      invalidate();
      toast('Data sensitif diperbarui');
      onClose(true);
    },
  });
  return (
    <Modal
      open={open}
      onClose={() => {
        m.reset();
        onClose();
      }}
      title="Ubah NIK, rekening, atau NPWP"
      description="Isi hanya field yang ingin diubah. Nilai lama tersimpan terenkripsi di riwayat."
    >
      <form
        onSubmit={(ev: FormEvent<HTMLFormElement>) => {
          ev.preventDefault();
          const f = new FormData(ev.currentTarget);
          const body: Record<string, unknown> = { reason: f.get('reason') };
          for (const k of ['nik', 'bankAccountNumber', 'npwp']) {
            const v = String(f.get(k) ?? '').trim();
            if (v) body[k] = v;
          }
          m.mutate(body);
        }}
        className="space-y-4"
      >
        {m.isError && <Alert>{errorMessage(m.error)}</Alert>}
        <Field label="NIK baru">{(fid) => <Input id={fid} name="nik" inputMode="numeric" pattern="\d{16}" maxLength={16} className="font-mono" />}</Field>
        <Field label="Nomor rekening baru">{(fid) => <Input id={fid} name="bankAccountNumber" inputMode="numeric" pattern="\d{5,30}" className="font-mono" />}</Field>
        <Field label="NPWP baru">{(fid) => <Input id={fid} name="npwp" inputMode="numeric" pattern="\d{15,16}" className="font-mono" />}</Field>
        <Field label="Alasan" required>
          {(fid) => <Textarea id={fid} name="reason" required minLength={3} maxLength={500} />}
        </Field>
        <ModalActions>
          <Button variant="secondary" onClick={() => onClose()}>
            Batal
          </Button>
          <Button type="submit" loading={m.isPending}>
            Simpan
          </Button>
        </ModalActions>
      </form>
    </Modal>
  );
}

interface TerminateResult {
  releasedDepartmentHeads: { id: string; name: string }[];
  subordinatesNeedingNewSupervisor: { id: string; fullName: string; employeeCode: string }[];
}

function TerminateModal({ employee, open, onClose }: { employee: EmployeeSummary; open: boolean; onClose: (changed?: boolean) => void }) {
  const invalidate = useInvalidateEmployee(employee.id);
  const toast = useToast();
  const [result, setResult] = useState<TerminateResult | null>(null);
  const m = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post<TerminateResult>(`/employees/${employee.id}/terminate`, body),
    onSuccess: (r) => {
      invalidate();
      toast(`Status ${employee.fullName} diperbarui`);
      setResult(r);
    },
  });
  const close = () => {
    m.reset();
    setResult(null);
    onClose(result !== null);
  };
  const followUps = result && (result.releasedDepartmentHeads.length > 0 || result.subordinatesNeedingNewSupervisor.length > 0);

  return (
    <Modal open={open || result !== null} onClose={close} title={`Resign / PHK — ${employee.fullName}`}>
      {result ? (
        <div className="space-y-4 text-sm">
          <Alert tone="green">Data karyawan disimpan sebagai tidak aktif dan akun loginnya dinonaktifkan.</Alert>
          {followUps ? (
            <Alert tone="amber">
              <p className="font-medium">Perlu ditindaklanjuti:</p>
              <ul className="mt-1 list-disc pl-5">
                {result.releasedDepartmentHeads.map((d) => (
                  <li key={d.id}>Departemen {d.name} sekarang tanpa kepala departemen.</li>
                ))}
                {result.subordinatesNeedingNewSupervisor.map((s) => (
                  <li key={s.id}>
                    <Link href={`/employees/${s.id}/edit`} className="underline">
                      {s.fullName} ({s.employeeCode})
                    </Link>{' '}
                    perlu atasan baru.
                  </li>
                ))}
              </ul>
            </Alert>
          ) : null}
          <ModalActions>
            <Button onClick={close}>Selesai</Button>
          </ModalActions>
        </div>
      ) : (
        <form
          onSubmit={(ev: FormEvent<HTMLFormElement>) => {
            ev.preventDefault();
            const f = new FormData(ev.currentTarget);
            m.mutate({ status: f.get('status'), resignDate: f.get('resignDate'), reason: f.get('reason') });
          }}
          className="space-y-4"
        >
          <Alert tone="amber">
            Data karyawan tidak dihapus (dibutuhkan untuk histori payroll & pajak), tapi akun loginnya langsung dinonaktifkan.
          </Alert>
          {m.isError && <Alert>{errorMessage(m.error)}</Alert>}
          <Field label="Jenis" required>
            {(fid) => (
              <Select id={fid} name="status" required defaultValue="resigned">
                <option value="resigned">Resign</option>
                <option value="terminated">PHK</option>
              </Select>
            )}
          </Field>
          <Field label="Tanggal keluar" required>
            {(fid) => <Input id={fid} name="resignDate" type="date" min={employee.joinDate} required />}
          </Field>
          <Field label="Alasan" required>
            {(fid) => <Textarea id={fid} name="reason" required minLength={3} maxLength={500} />}
          </Field>
          <ModalActions>
            <Button variant="secondary" onClick={close}>
              Batal
            </Button>
            <Button type="submit" variant="danger" loading={m.isPending}>
              Proses
            </Button>
          </ModalActions>
        </form>
      )}
    </Modal>
  );
}
