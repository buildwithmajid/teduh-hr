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
import type { OvertimeEntry, OvertimeQuota } from '@/lib/types';

type Tab = 'mine' | 'company';

function tone(s: string): 'green' | 'amber' | 'red' | 'gray' {
  if (s === 'approved') return 'green';
  if (s === 'pending') return 'amber';
  if (s === 'rejected') return 'red';
  return 'gray';
}

export default function OvertimePage() {
  const me = useMe();
  const { can } = useAuth();
  const [tab, setTab] = useState<Tab>(me.employee ? 'mine' : 'company');
  const [open, setOpen] = useState(false);

  const quota = useQuery({
    queryKey: ['overtime', 'quota'],
    queryFn: () => api.get<OvertimeQuota>('/overtime/me/quota'),
    enabled: me.employee !== null,
  });

  const tabs: { value: Tab; label: string }[] = [
    ...(me.employee ? [{ value: 'mine' as const, label: 'Lembur saya' }] : []),
    ...(can('overtime.view') ? [{ value: 'company' as const, label: 'Semua pengajuan' }] : []),
  ];

  const q = quota.data;
  const pct = q ? Math.min(100, Math.round((q.usedWeekHours / q.maxWeekHours) * 100)) : 0;

  return (
    <>
      <PageHeader
        title="Lembur"
        description="Pengajuan lembur dengan validasi batas PP 35/2021 (maks. 4 jam/hari & 18 jam/minggu hari kerja)."
        actions={
          me.employee && q?.eligible && (
            <Button onClick={() => setOpen(true)}>
              <Plus className="size-4" aria-hidden /> Ajukan lembur
            </Button>
          )
        }
      />

      {me.employee && q && (
        <Card className="mb-6 p-5">
          {!q.eligible ? (
            <p className="text-sm text-ink-muted">Jabatan Anda saat ini tidak termasuk kategori berhak lembur sesuai kebijakan perusahaan.</p>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-medium text-ink-muted">
                  Kuota lembur hari kerja minggu ini ({formatDate(q.weekStart)} – {formatDate(q.weekEnd)})
                </p>
                <p className="mt-1 font-mono text-2xl font-semibold text-ink tabular">
                  {q.usedWeekHours} <span className="font-sans text-sm font-normal text-ink-muted">/ {q.maxWeekHours} jam</span>
                </p>
              </div>
              <div className="w-full sm:w-64">
                <div className="h-2 overflow-hidden rounded-full bg-rail">
                  <div className="h-full rounded-full bg-brand-600" style={{ width: `${pct}%` }} />
                </div>
                <p className="mt-1 text-right font-mono text-[11px] text-ink-subtle">{pct}% terpakai</p>
              </div>
            </div>
          )}
        </Card>
      )}

      {tabs.length > 1 && <Tabs tabs={tabs} value={tab} onChange={setTab} />}

      {tab === 'mine' && me.employee && <MyOvertimeTab />}
      {tab === 'company' && <CompanyOvertimeTab />}

      <CreateOvertimeModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function MyOvertimeTab() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const rows = useQuery({ queryKey: ['overtime', 'mine'], queryFn: () => api.get<OvertimeEntry[]>('/overtime/me') });
  const cancel = useMutation({
    mutationFn: (id: string) => api.post(`/overtime/${id}/cancel`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['overtime'] });
      void queryClient.invalidateQueries({ queryKey: ['approvals', 'pending'] });
      toast('Pengajuan lembur dibatalkan');
    },
  });

  return (
    <Card>
      <CardHeader title="Pengajuan lembur saya" />
      {rows.isPending ? (
        <TableSkeleton rows={4} cols={5} />
      ) : !rows.data?.length ? (
        <EmptyState title="Belum ada pengajuan lembur" />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Tanggal</Th>
              <Th>Jenis hari</Th>
              <Th className="text-right">Durasi</Th>
              <Th>Alasan</Th>
              <Th>Status</Th>
              <Th />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.data.map((r) => (
              <tr key={r.id} className="hover:bg-canvas/60">
                <Td className="whitespace-nowrap font-mono text-xs">{formatDate(r.workDate)}</Td>
                <Td className="text-xs text-ink-muted">{LABELS.overtimeDayType[r.dayType]}</Td>
                <Td className="text-right font-mono text-xs">{r.hours} jam</Td>
                <Td className="max-w-xs text-xs text-ink-muted">{r.reason}</Td>
                <Td>
                  <Badge tone={tone(r.status)} dot>{LABELS.requestStatus[r.status]}</Badge>
                </Td>
                <Td className="text-right">
                  {r.status === 'pending' && (
                    <Button size="sm" variant="ghost" onClick={() => cancel.mutate(r.id)}>
                      Batalkan
                    </Button>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}

function CompanyOvertimeTab() {
  const rows = useQuery({ queryKey: ['overtime', 'company'], queryFn: () => api.get<OvertimeEntry[]>('/overtime') });
  return (
    <Card>
      <CardHeader title="Semua pengajuan lembur" />
      {rows.isPending ? (
        <TableSkeleton rows={5} cols={5} />
      ) : !rows.data?.length ? (
        <EmptyState title="Belum ada pengajuan lembur" />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Karyawan</Th>
              <Th>Tanggal</Th>
              <Th>Jenis hari</Th>
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
                <Td className="whitespace-nowrap font-mono text-xs">{formatDate(r.workDate)}</Td>
                <Td className="text-xs text-ink-muted">{LABELS.overtimeDayType[r.dayType]}</Td>
                <Td className="text-right font-mono text-xs">{r.hours} jam</Td>
                <Td>
                  <Badge tone={tone(r.status)} dot>{LABELS.requestStatus[r.status]}</Badge>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}

function CreateOvertimeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const save = useApiMutation((body: Record<string, unknown>) => api.post('/overtime', body), {
    invalidate: [['overtime'], ['approvals', 'pending']],
    success: 'Pengajuan lembur dikirim ke atasan',
    onDone: onClose,
  });

  return (
    <Modal open={open} onClose={onClose} title="Ajukan lembur" description="Hanya lembur yang disetujui yang masuk perhitungan payroll.">
      <form
        className="space-y-4"
        onSubmit={(e: FormEvent<HTMLFormElement>) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const workDate = String(f.get('workDate'));
          save.mutate({
            workDate,
            startTime: `${workDate}T${f.get('startTime')}:00+07:00`,
            endTime: `${workDate}T${f.get('endTime')}:00+07:00`,
            dayType: f.get('dayType'),
            reason: f.get('reason'),
          });
        }}
      >
        {save.isError && <Alert>{errorMessage(save.error)}</Alert>}
        <Field label="Tanggal" required>
          {(id) => <Input id={id} name="workDate" type="date" defaultValue={todayISO()} required />}
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Jam mulai" required>
            {(id) => <Input id={id} name="startTime" type="time" defaultValue="18:00" required />}
          </Field>
          <Field label="Jam selesai" required>
            {(id) => <Input id={id} name="endTime" type="time" defaultValue="20:00" required />}
          </Field>
        </div>
        <Field label="Jenis hari" required>
          {(id) => (
            <Select id={id} name="dayType" defaultValue="workday">
              <option value="workday">Hari kerja (maks. 4 jam/hari)</option>
              <option value="rest_day">Hari istirahat mingguan</option>
              <option value="holiday">Hari libur nasional</option>
            </Select>
          )}
        </Field>
        <Field label="Pekerjaan / alasan" required>
          {(id) => <Textarea id={id} name="reason" required minLength={3} maxLength={500} placeholder="Misal: finalisasi gambar kerja tender proyek" />}
        </Field>
        <ModalActions>
          <Button variant="secondary" onClick={onClose}>Batal</Button>
          <Button type="submit" loading={save.isPending}>Kirim pengajuan</Button>
        </ModalActions>
      </form>
    </Modal>
  );
}
