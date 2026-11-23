'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { FormEvent, useState } from 'react';
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
  Tabs,
  Td,
  Textarea,
  Th,
  useToast,
} from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useAuth, useMe } from '@/lib/auth';
import { formatDate, LABELS, todayISO } from '@/lib/format';
import { useApiMutation } from '@/lib/mutation';
import type { LeaveBalance, LeaveRequest, LeaveType } from '@/lib/types';

type Tab = 'mine' | 'company' | 'types';

function reqTone(s: string): 'green' | 'amber' | 'red' | 'gray' {
  if (s === 'approved') return 'green';
  if (s === 'pending') return 'amber';
  if (s === 'rejected') return 'red';
  return 'gray';
}

export default function LeavesPage() {
  const me = useMe();
  const { can } = useAuth();
  const [tab, setTab] = useState<Tab>(me.employee ? 'mine' : 'company');
  const [reqOpen, setReqOpen] = useState(false);

  const balances = useQuery({
    queryKey: ['leaves', 'balances'],
    queryFn: () => api.get<LeaveBalance[]>('/leaves/balances/me'),
    enabled: me.employee !== null,
  });

  const types = useQuery({
    queryKey: ['leaves', 'types'],
    queryFn: () => api.get<LeaveType[]>('/leaves/types'),
  });

  const tabs: { value: Tab; label: string }[] = [
    ...(me.employee ? [{ value: 'mine' as const, label: 'Pengajuan saya' }] : []),
    ...(can('leave.view') ? [{ value: 'company' as const, label: 'Semua pengajuan' }] : []),
    ...(can('leave.manage') ? [{ value: 'types' as const, label: 'Jenis cuti' }] : []),
  ];

  return (
    <>
      <PageHeader
        title="Cuti & izin"
        description="Pengajuan cuti, perhitungan hari kerja otomatis, dan saldo tahunan."
        actions={
          me.employee && (
            <Button onClick={() => setReqOpen(true)}>
              <Plus className="size-4" aria-hidden /> Ajukan cuti
            </Button>
          )
        }
      />

      {me.employee && balances.data && balances.data.length > 0 && (
        <Card className="mb-6 overflow-hidden">
          <div className="grid divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {balances.data.map((b) => (
              <div key={b.id} className="p-5">
                <p className="text-xs font-medium text-ink-muted">{b.leaveType.name} ({b.year})</p>
                <p className="mt-2 font-mono text-3xl font-semibold tracking-tight text-ink tabular">
                  {b.remainingDays} <span className="font-sans text-sm font-normal text-ink-muted">hari tersisa</span>
                </p>
                <p className="mt-1 font-mono text-xs text-ink-subtle">
                  Kuota {b.quotaDays + b.carriedOverDays} · Terpakai {b.usedDays}
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {tabs.length > 1 && <Tabs tabs={tabs} value={tab} onChange={setTab} />}

      {tab === 'mine' && me.employee && <MyLeavesTab />}
      {tab === 'company' && <CompanyLeavesTab />}
      {tab === 'types' && <LeaveTypesTab types={types.data ?? []} />}

      <RequestLeaveModal open={reqOpen} onClose={() => setReqOpen(false)} types={types.data ?? []} />
    </>
  );
}

function MyLeavesTab() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [cancelling, setCancelling] = useState<LeaveRequest | null>(null);
  const rows = useQuery({
    queryKey: ['leaves', 'mine'],
    queryFn: () => api.get<LeaveRequest[]>('/leaves/requests/me'),
  });
  const cancel = useMutation({
    mutationFn: (id: string) => api.post(`/leaves/requests/${id}/cancel`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['leaves'] });
      void queryClient.invalidateQueries({ queryKey: ['approvals', 'pending'] });
      setCancelling(null);
      toast('Pengajuan cuti dibatalkan');
    },
  });

  return (
    <Card>
      <CardHeader title="Pengajuan cuti saya" />
      {rows.isPending ? (
        <TableSkeleton rows={4} cols={5} />
      ) : !rows.data?.length ? (
        <EmptyState title="Belum ada pengajuan cuti" description="Klik Ajukan cuti untuk membuat pengajuan baru." />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Jenis</Th>
              <Th>Tanggal</Th>
              <Th className="text-right">Durasi</Th>
              <Th>Alasan</Th>
              <Th>Status</Th>
              <Th />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.data.map((r) => (
              <tr key={r.id} className="hover:bg-canvas/60">
                <Td className="font-medium text-ink">{r.leaveType.name}</Td>
                <Td className="whitespace-nowrap font-mono text-xs">
                  {formatDate(r.startDate)} – {formatDate(r.endDate)}
                </Td>
                <Td className="text-right font-mono text-xs">{r.totalDays} hari</Td>
                <Td className="max-w-xs text-xs text-ink-muted">{r.reason}</Td>
                <Td>
                  <Badge tone={reqTone(r.status)} dot>{LABELS.requestStatus[r.status]}</Badge>
                </Td>
                <Td className="text-right">
                  {(r.status === 'pending' || (r.status === 'approved' && r.startDate > todayISO())) && (
                    <Button size="sm" variant="ghost" onClick={() => setCancelling(r)}>
                      Batalkan
                    </Button>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <ConfirmModal
        open={cancelling !== null}
        onClose={() => setCancelling(null)}
        onConfirm={() => cancelling && cancel.mutate(cancelling.id)}
        loading={cancel.isPending}
        title="Batalkan pengajuan cuti"
        description={
          cancelling?.status === 'approved'
            ? 'Cuti ini sudah disetujui. Pembatalan akan mengembalikan saldo cuti Anda.'
            : 'Yakin ingin membatalkan pengajuan cuti ini?'
        }
        confirmLabel="Batalkan cuti"
      />
    </Card>
  );
}

function CompanyLeavesTab() {
  const rows = useQuery({
    queryKey: ['leaves', 'company'],
    queryFn: () => api.get<LeaveRequest[]>('/leaves/requests'),
  });
  return (
    <Card>
      <CardHeader title="Semua pengajuan cuti perusahaan" />
      {rows.isPending ? (
        <TableSkeleton rows={5} cols={5} />
      ) : !rows.data?.length ? (
        <EmptyState title="Belum ada pengajuan cuti" />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Karyawan</Th>
              <Th>Jenis</Th>
              <Th>Tanggal</Th>
              <Th className="text-right">Durasi</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.data.map((r) => (
              <tr key={r.id} className="hover:bg-canvas/60">
                <Td>
                  <div className="flex items-center gap-2.5">
                    <Avatar name={r.employee?.fullName ?? '?'} size="sm" />
                    <div>
                      <p className="font-medium text-ink">{r.employee?.fullName}</p>
                      <p className="text-xs text-ink-muted">{r.employee?.department.name}</p>
                    </div>
                  </div>
                </Td>
                <Td>{r.leaveType.name}</Td>
                <Td className="whitespace-nowrap font-mono text-xs">
                  {formatDate(r.startDate)} – {formatDate(r.endDate)}
                </Td>
                <Td className="text-right font-mono text-xs">{r.totalDays} hari</Td>
                <Td>
                  <Badge tone={reqTone(r.status)} dot>{LABELS.requestStatus[r.status]}</Badge>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}

function LeaveTypesTab({ types }: { types: LeaveType[] }) {
  return (
    <Card>
      <CardHeader title="Kebijakan jenis cuti" description="Aturan kuota, potongan gaji, dan perhitungan hari." />
      <Table>
        <thead>
          <tr>
            <Th>Jenis cuti</Th>
            <Th className="text-right">Kuota default</Th>
            <Th>Aturan</Th>
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {types.map((t) => (
            <tr key={t.id}>
              <Td>
                <span className="font-medium text-ink">{t.name}</span>
                <div className="font-mono text-xs text-ink-subtle">{t.code}</div>
              </Td>
              <Td className="text-right font-mono text-xs">{t.defaultQuotaDays ? `${Number(t.defaultQuotaDays)} hari` : 'Tanpa kuota'}</Td>
              <Td>
                <div className="flex flex-wrap gap-1">
                  {t.isPaid ? <Badge tone="green">Dibayar</Badge> : <Badge tone="amber">Tidak dibayar</Badge>}
                  {t.allowHalfDay && <Badge>Setengah hari</Badge>}
                  {t.requiresDocument && <Badge tone="blue">Wajib dokumen</Badge>}
                </div>
              </Td>
              <Td>{t.isActive ? <Badge tone="green" dot>Aktif</Badge> : <Badge>Nonaktif</Badge>}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}

function RequestLeaveModal({ open, onClose, types }: { open: boolean; onClose: () => void; types: LeaveType[] }) {
  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [startDate, setStartDate] = useState(todayISO());
  const [endDate, setEndDate] = useState(todayISO());
  const [isHalfDay, setIsHalfDay] = useState(false);

  const selectedType = types.find((t) => t.id === leaveTypeId);
  const preview = useQuery({
    queryKey: ['leaves', 'preview', leaveTypeId, startDate, endDate, isHalfDay],
    queryFn: () =>
      api.get<{ totalDays: number }>(
        `/leaves/preview?leaveTypeId=${leaveTypeId}&startDate=${startDate}&endDate=${endDate}&isHalfDay=${isHalfDay}`,
      ),
    enabled: open && Boolean(leaveTypeId && startDate && endDate && endDate >= startDate),
  });

  const submit = useApiMutation((body: Record<string, unknown>) => api.post('/leaves/requests', body), {
    invalidate: [['leaves'], ['approvals', 'pending']],
    success: 'Pengajuan cuti dikirim ke atasan',
    onDone: onClose,
  });

  return (
    <Modal open={open} onClose={onClose} title="Ajukan cuti" description="Hari libur nasional & akhir pekan otomatis tidak dihitung.">
      <form
        className="space-y-4"
        onSubmit={(e: FormEvent<HTMLFormElement>) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          submit.mutate({
            leaveTypeId,
            startDate,
            endDate: isHalfDay ? startDate : endDate,
            isHalfDay,
            reason: f.get('reason'),
          });
        }}
      >
        {submit.isError && <Alert>{errorMessage(submit.error)}</Alert>}
        <Field label="Jenis cuti" required>
          {(id) => (
            <Select id={id} required value={leaveTypeId} onChange={(e) => { setLeaveTypeId(e.target.value); setIsHalfDay(false); }}>
              <option value="" disabled>Pilih jenis cuti…</option>
              {types.filter((t) => t.isActive).map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </Select>
          )}
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Tanggal mulai" required>
            {(id) => <Input id={id} type="date" required value={startDate} onChange={(e) => { setStartDate(e.target.value); if (e.target.value > endDate) setEndDate(e.target.value); }} />}
          </Field>
          <Field label="Tanggal selesai" required>
            {(id) => <Input id={id} type="date" required min={startDate} disabled={isHalfDay} value={isHalfDay ? startDate : endDate} onChange={(e) => setEndDate(e.target.value)} />}
          </Field>
        </div>
        {selectedType?.allowHalfDay && (
          <Checkbox
            checked={isHalfDay}
            onChange={(e) => {
              setIsHalfDay(e.target.checked);
              if (e.target.checked) setEndDate(startDate);
            }}
            label="Cuti setengah hari (0,5 hari)"
          />
        )}
        {preview.data && (
          <div className="rounded-md border border-line bg-canvas px-3.5 py-2.5 text-xs text-ink-muted">
            Estimasi hari kerja terpakai: <strong className="font-mono text-ink">{preview.data.totalDays} hari</strong>
          </div>
        )}
        <Field label="Alasan" required>
          {(id) => <Textarea id={id} name="reason" required minLength={3} maxLength={500} />}
        </Field>
        <ModalActions>
          <Button variant="secondary" onClick={onClose}>Batal</Button>
          <Button type="submit" loading={submit.isPending}>Kirim pengajuan</Button>
        </ModalActions>
      </form>
    </Modal>
  );
}
