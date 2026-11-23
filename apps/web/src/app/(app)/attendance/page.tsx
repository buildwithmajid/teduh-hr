'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Clock, LogIn, LogOut, MapPin, Plus, Trash2 } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
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
import { useAuth, useMe } from '@/lib/auth';
import { formatDate, LABELS, todayISO } from '@/lib/format';
import { useApiMutation } from '@/lib/mutation';
import type { AttendanceCorrection, AttendanceRecord, AttendanceToday, Holiday, Shift } from '@/lib/types';

type Tab = 'mine' | 'team' | 'company' | 'config';

function formatTime(iso: string | null | undefined, tz = 'Asia/Jakarta') {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: tz }).format(new Date(iso));
}

function statusTone(s: string): 'green' | 'amber' | 'red' | 'blue' | 'gray' {
  if (s === 'present') return 'green';
  if (s === 'late') return 'amber';
  if (s === 'absent') return 'red';
  if (s === 'on_leave' || s === 'half_day_leave' || s === 'sick') return 'blue';
  return 'gray';
}

export default function AttendancePage() {
  const me = useMe();
  const { can } = useAuth();
  const defaultTab: Tab = me.employee ? 'mine' : can('attendance.view') ? 'company' : 'config';
  const [tab, setTab] = useState<Tab>(defaultTab);
  const [corrOpen, setCorrOpen] = useState(false);

  const tabs: { value: Tab; label: string }[] = [
    ...(me.employee ? [{ value: 'mine' as const, label: 'Absensi saya' }] : []),
    ...(can('attendance.view_team') ? [{ value: 'team' as const, label: 'Kehadiran tim' }] : []),
    ...(can('attendance.view') ? [{ value: 'company' as const, label: 'Rekap perusahaan' }] : []),
    ...(can('shift.manage') || can('holiday.manage') ? [{ value: 'config' as const, label: 'Shift & hari libur' }] : []),
  ];

  return (
    <>
      <PageHeader
        title="Absensi"
        description="Pencatatan kehadiran harian berbasis zona waktu lokasi kerja & geofence."
        actions={
          me.employee && (
            <Button variant="secondary" onClick={() => setCorrOpen(true)}>
              Ajukan koreksi lupa absen
            </Button>
          )
        }
      />

      {me.employee && <ClockCard />}

      {tabs.length > 1 && <Tabs tabs={tabs} value={tab} onChange={setTab} />}

      {tab === 'mine' && me.employee && <MyAttendanceTab />}
      {tab === 'team' && <AttendanceTableTab endpoint="/attendance/team" title="Kehadiran tim langsung" />}
      {tab === 'company' && <AttendanceTableTab endpoint="/attendance" title="Rekap absensi perusahaan" />}
      {tab === 'config' && <ShiftHolidayTab />}

      <CorrectionModal open={corrOpen} onClose={() => setCorrOpen(false)} />
    </>
  );
}

function ClockCard() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [now, setNow] = useState(() => new Date());
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'locating' | 'ready' | 'denied'>('idle');

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const today = useQuery({
    queryKey: ['attendance', 'today'],
    queryFn: () => api.get<AttendanceToday>('/attendance/me/today'),
  });

  const requestGps = () => {
    if (!navigator.geolocation) {
      setGpsStatus('denied');
      return;
    }
    setGpsStatus('locating');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: Number(pos.coords.latitude.toFixed(6)), lng: Number(pos.coords.longitude.toFixed(6)) });
        setGpsStatus('ready');
      },
      () => setGpsStatus('denied'),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  const clockIn = useMutation({
    mutationFn: () => api.post<AttendanceRecord>('/attendance/clock-in', coords ?? {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['attendance'] });
      toast('Clock-in berhasil dicatat');
    },
  });

  const clockOut = useMutation({
    mutationFn: () => api.post<AttendanceRecord>('/attendance/clock-out', coords ?? {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['attendance'] });
      toast('Clock-out berhasil dicatat');
    },
  });

  const d = today.data;
  const tz = d?.timezone ?? 'Asia/Jakarta';
  const liveTime = new Intl.DateTimeFormat('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    timeZone: tz,
  }).format(now);

  const att = d?.attendance;
  const err = clockIn.error ?? clockOut.error;

  return (
    <Card className="mb-6 overflow-hidden">
      <div className="grid gap-5 p-5 lg:grid-cols-12 lg:items-center">
        <div className="lg:col-span-5">
          <p className="text-xs font-medium text-ink-muted">
            {d ? `${formatDate(d.workDate)} · ${tz}` : 'Memuat jadwal…'}
          </p>
          <p className="mt-1 font-mono text-3xl font-semibold tracking-tight text-ink tabular">{liveTime}</p>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-ink-muted">
            {d?.shift && (
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3.5 text-ink-subtle" aria-hidden />
                {d.shift.name} ({d.shift.startTime}–{d.shift.endTime})
              </span>
            )}
            {d?.workLocation && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5 text-brand-600" aria-hidden />
                {d.workLocation.name} (radius {d.workLocation.radiusMeters} m)
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 border-y border-line py-3 lg:col-span-4 lg:border-x lg:border-y-0 lg:px-5 lg:py-0">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">Masuk</p>
            <p className="mt-1 font-mono text-base font-semibold text-ink tabular">{formatTime(att?.clockInTime, tz)}</p>
            {att && att.lateMinutes > 0 && <p className="text-[11px] text-amber-800">Telat {att.lateMinutes} mnt</p>}
          </div>
          <div className="h-8 w-px bg-line" aria-hidden />
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">Pulang</p>
            <p className="mt-1 font-mono text-base font-semibold text-ink tabular">{formatTime(att?.clockOutTime, tz)}</p>
            {att?.clockInDistanceM !== null && att?.clockInDistanceM !== undefined && (
              <p className="font-mono text-[11px] text-ink-muted">{att.clockInDistanceM} m dari kantor</p>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2 lg:col-span-3 lg:items-end">
          <div className="flex flex-wrap gap-2">
            {!att?.clockInTime ? (
              <Button loading={clockIn.isPending} onClick={() => clockIn.mutate()}>
                <LogIn className="size-4" aria-hidden /> Clock-in
              </Button>
            ) : !att.clockOutTime ? (
              <Button loading={clockOut.isPending} onClick={() => clockOut.mutate()}>
                <LogOut className="size-4" aria-hidden /> Clock-out
              </Button>
            ) : (
              <Badge tone="green" dot>Absensi hari ini lengkap</Badge>
            )}
            <Button variant="secondary" size="sm" onClick={requestGps} disabled={gpsStatus === 'locating'}>
              <MapPin className="size-3.5" aria-hidden />
              {gpsStatus === 'ready' ? 'GPS aktif' : gpsStatus === 'locating' ? 'Mencari…' : 'Aktifkan GPS'}
            </Button>
          </div>
          <p className="text-[11px] text-ink-subtle lg:text-right">
            {gpsStatus === 'ready' && coords
              ? `Koordinat siap (${coords.lat}, ${coords.lng})`
              : gpsStatus === 'denied'
                ? 'GPS tidak tersedia — absen tetap dicatat dengan tanda anomali.'
                : 'Aktifkan GPS untuk validasi radius kantor (UU PDP).'}
          </p>
        </div>
      </div>

      {err && (
        <div className="border-t border-line px-5 py-3">
          <Alert>{errorMessage(err)}</Alert>
        </div>
      )}
      {att && att.anomalyFlags.length > 0 && (
        <div className="flex items-center gap-2 border-t border-amber-200 bg-amber-50/80 px-5 py-2.5 text-xs text-amber-950">
          <AlertTriangle className="size-3.5 shrink-0 text-amber-700" aria-hidden />
          <span>Catatan sistem: {att.anomalyFlags.join(', ')} (akan direview HR).</span>
        </div>
      )}
    </Card>
  );
}

function MyAttendanceTab() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const mine = useQuery({
    queryKey: ['attendance', 'mine'],
    queryFn: () => api.get<AttendanceRecord[]>('/attendance/me'),
  });
  const corrections = useQuery({
    queryKey: ['attendance', 'corrections'],
    queryFn: () => api.get<AttendanceCorrection[]>('/attendance/corrections/me'),
  });
  const cancel = useMutation({
    mutationFn: (id: string) => api.post(`/attendance/corrections/${id}/cancel`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['attendance', 'corrections'] });
      toast('Pengajuan koreksi dibatalkan');
    },
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Riwayat absensi" description="60 hari terakhir." />
        {mine.isPending ? (
          <TableSkeleton rows={5} cols={5} />
        ) : !mine.data?.length ? (
          <EmptyState title="Belum ada catatan absensi" description="Klik Clock-in di atas saat mulai bekerja." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Tanggal</Th>
                <Th>Masuk</Th>
                <Th>Pulang</Th>
                <Th>Terlambat</Th>
                <Th>Status</Th>
                <Th>Catatan</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {mine.data.map((r) => (
                <tr key={r.id} className="hover:bg-canvas/60">
                  <Td className="whitespace-nowrap font-mono text-xs">{formatDate(r.workDate)}</Td>
                  <Td className="font-mono text-xs">{formatTime(r.clockInTime)}</Td>
                  <Td className="font-mono text-xs">{formatTime(r.clockOutTime)}</Td>
                  <Td className="font-mono text-xs text-ink-muted">{r.lateMinutes > 0 ? `${r.lateMinutes} mnt` : '—'}</Td>
                  <Td>
                    <Badge tone={statusTone(r.status)} dot>
                      {LABELS.attendanceStatus[r.status] ?? r.status}
                    </Badge>
                  </Td>
                  <Td className="text-xs text-ink-muted">
                    {r.anomalyFlags.length > 0 ? (
                      <Badge tone="amber">{r.anomalyFlags.join(', ')}</Badge>
                    ) : (
                      r.notes ?? '—'
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {corrections.data && corrections.data.length > 0 && (
        <Card>
          <CardHeader title="Pengajuan koreksi saya" />
          <Table>
            <thead>
              <tr>
                <Th>Tanggal</Th>
                <Th>Jam diajukan</Th>
                <Th>Alasan</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {corrections.data.map((c) => (
                <tr key={c.id}>
                  <Td className="font-mono text-xs">{formatDate(c.workDate)}</Td>
                  <Td className="font-mono text-xs text-ink-muted">
                    {formatTime(c.requestedClockIn)} – {formatTime(c.requestedClockOut)}
                  </Td>
                  <Td className="text-xs">{c.reason}</Td>
                  <Td>
                    <Badge tone={c.status === 'approved' ? 'green' : c.status === 'rejected' ? 'red' : c.status === 'pending' ? 'amber' : 'gray'} dot>
                      {LABELS.requestStatus[c.status]}
                    </Badge>
                  </Td>
                  <Td className="text-right">
                    {c.status === 'pending' && (
                      <Button size="sm" variant="ghost" onClick={() => cancel.mutate(c.id)}>
                        Batalkan
                      </Button>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}

function AttendanceTableTab({ endpoint, title }: { endpoint: string; title: string }) {
  const [date, setDate] = useState(todayISO());
  const rows = useQuery({
    queryKey: ['attendance', endpoint, date],
    queryFn: () => api.get<AttendanceRecord[]>(`${endpoint}?from=${date}&to=${date}`),
  });
  return (
    <Card>
      <CardHeader
        title={title}
        actions={<Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-auto font-mono text-xs" />}
      />
      {rows.isPending ? (
        <TableSkeleton rows={5} cols={5} />
      ) : !rows.data?.length ? (
        <EmptyState title="Belum ada data absensi pada tanggal ini" />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Karyawan</Th>
              <Th>Masuk</Th>
              <Th>Pulang</Th>
              <Th>Jarak</Th>
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
                <Td className="font-mono text-xs">{formatTime(r.clockInTime)}</Td>
                <Td className="font-mono text-xs">{formatTime(r.clockOutTime)}</Td>
                <Td className="font-mono text-xs text-ink-muted">
                  {r.clockInDistanceM !== null ? `${r.clockInDistanceM} m` : '—'}
                </Td>
                <Td>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone={statusTone(r.status)} dot>
                      {LABELS.attendanceStatus[r.status] ?? r.status}
                    </Badge>
                    {r.anomalyFlags.length > 0 && <Badge tone="amber">Anomali</Badge>}
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}

function ShiftHolidayTab() {
  const { can } = useAuth();
  const [shiftOpen, setShiftOpen] = useState(false);
  const [holidayOpen, setHolidayOpen] = useState(false);
  const [deletingHoliday, setDeletingHoliday] = useState<Holiday | null>(null);

  const shifts = useQuery({ queryKey: ['shifts'], queryFn: () => api.get<Shift[]>('/shifts') });
  const holidays = useQuery({ queryKey: ['holidays'], queryFn: () => api.get<Holiday[]>('/holidays') });

  const createShift = useApiMutation((body: Record<string, unknown>) => api.post('/shifts', body), {
    invalidate: [['shifts']],
    success: 'Shift ditambahkan',
    onDone: () => setShiftOpen(false),
  });
  const createHoliday = useApiMutation((body: Record<string, unknown>) => api.post('/holidays', body), {
    invalidate: [['holidays']],
    success: 'Hari libur ditambahkan',
    onDone: () => setHolidayOpen(false),
  });
  const delHoliday = useApiMutation((id: string) => api.delete(`/holidays/${id}`), {
    invalidate: [['holidays']],
    success: 'Hari libur dihapus',
    onDone: () => setDeletingHoliday(null),
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Master shift"
          description="Jam kerja dan toleransi keterlambatan."
          actions={
            can('shift.manage') && (
              <Button size="sm" onClick={() => setShiftOpen(true)}>
                <Plus className="size-3.5" aria-hidden /> Tambah shift
              </Button>
            )
          }
        />
        {shifts.isPending ? (
          <Spinner />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Nama shift</Th>
                <Th>Jam kerja</Th>
                <Th className="text-right">Toleransi</Th>
                <Th className="text-right">Durasi</Th>
                <Th>Default</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(shifts.data ?? []).map((s) => (
                <tr key={s.id}>
                  <Td className="font-medium text-ink">{s.name}</Td>
                  <Td className="font-mono text-xs">
                    {s.startTime} – {s.endTime} {s.isOvernight ? '(malam)' : ''}
                  </Td>
                  <Td className="text-right font-mono text-xs">{s.lateToleranceMinutes} mnt</Td>
                  <Td className="text-right font-mono text-xs">{Number(s.workHours)} jam</Td>
                  <Td>{s.isDefault ? <Badge tone="brand">Default</Badge> : '—'}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Kalender hari libur"
          description="Otomatis dilewati saat menghitung hari kerja cuti."
          actions={
            can('holiday.manage') && (
              <Button size="sm" onClick={() => setHolidayOpen(true)}>
                <Plus className="size-3.5" aria-hidden /> Tambah libur
              </Button>
            )
          }
        />
        {holidays.isPending ? (
          <Spinner />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Tanggal</Th>
                <Th>Nama</Th>
                <Th>Jenis</Th>
                {can('holiday.manage') && <Th />}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(holidays.data ?? []).map((h) => (
                <tr key={h.id}>
                  <Td className="whitespace-nowrap font-mono text-xs">{formatDate(h.date)}</Td>
                  <Td className="font-medium text-ink">{h.name}</Td>
                  <Td>
                    <Badge tone={h.type === 'national' ? 'brand' : 'gray'}>{LABELS.holidayType[h.type]}</Badge>
                  </Td>
                  {can('holiday.manage') && (
                    <Td className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => setDeletingHoliday(h)} aria-label={`Hapus ${h.name}`}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Modal open={shiftOpen} onClose={() => setShiftOpen(false)} title="Tambah shift">
        <form
          className="space-y-4"
          onSubmit={(e: FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            createShift.mutate({
              name: f.get('name'),
              startTime: f.get('startTime'),
              endTime: f.get('endTime'),
              lateToleranceMinutes: Number(f.get('lateToleranceMinutes')),
              workHours: Number(f.get('workHours')),
              isOvernight: f.get('isOvernight') === 'on',
              isDefault: f.get('isDefault') === 'on',
            });
          }}
        >
          {createShift.isError && <Alert>{errorMessage(createShift.error)}</Alert>}
          <Field label="Nama shift" required>
            {(id) => <Input id={id} name="name" required placeholder="Shift Pagi" />}
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Jam mulai" required>
              {(id) => <Input id={id} name="startTime" type="time" required defaultValue="09:00" />}
            </Field>
            <Field label="Jam selesai" required>
              {(id) => <Input id={id} name="endTime" type="time" required defaultValue="18:00" />}
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Toleransi telat (menit)" required>
              {(id) => <Input id={id} name="lateToleranceMinutes" type="number" min={0} max={120} defaultValue={15} required />}
            </Field>
            <Field label="Jam kerja normal" required>
              {(id) => <Input id={id} name="workHours" type="number" min={1} max={24} step="0.5" defaultValue={8} required />}
            </Field>
          </div>
          <Checkbox name="isOvernight" label="Shift malam (melewati tengah malam)" />
          <Checkbox name="isDefault" label="Jadikan shift default perusahaan" />
          <ModalActions>
            <Button variant="secondary" onClick={() => setShiftOpen(false)}>Batal</Button>
            <Button type="submit" loading={createShift.isPending}>Simpan</Button>
          </ModalActions>
        </form>
      </Modal>

      <Modal open={holidayOpen} onClose={() => setHolidayOpen(false)} title="Tambah hari libur">
        <form
          className="space-y-4"
          onSubmit={(e: FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            createHoliday.mutate({
              date: f.get('date'),
              name: f.get('name'),
              type: f.get('type'),
              deductsAnnualLeave: f.get('deductsAnnualLeave') === 'on',
            });
          }}
        >
          {createHoliday.isError && <Alert>{errorMessage(createHoliday.error)}</Alert>}
          <Field label="Tanggal" required>
            {(id) => <Input id={id} name="date" type="date" required />}
          </Field>
          <Field label="Nama hari libur" required>
            {(id) => <Input id={id} name="name" required maxLength={100} />}
          </Field>
          <Field label="Jenis" required>
            {(id) => (
              <Select id={id} name="type" defaultValue="company">
                <option value="national">Libur nasional</option>
                <option value="collective_leave">Cuti bersama</option>
                <option value="company">Libur perusahaan</option>
              </Select>
            )}
          </Field>
          <Checkbox name="deductsAnnualLeave" label="Memotong saldo cuti tahunan" />
          <ModalActions>
            <Button variant="secondary" onClick={() => setHolidayOpen(false)}>Batal</Button>
            <Button type="submit" loading={createHoliday.isPending}>Simpan</Button>
          </ModalActions>
        </form>
      </Modal>

      <ConfirmModal
        open={deletingHoliday !== null}
        onClose={() => setDeletingHoliday(null)}
        onConfirm={() => deletingHoliday && delHoliday.mutate(deletingHoliday.id)}
        loading={delHoliday.isPending}
        title="Hapus hari libur"
        description={`Hapus "${deletingHoliday?.name ?? ''}" dari kalender?`}
        confirmLabel="Hapus"
      />
    </div>
  );
}

function CorrectionModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const save = useApiMutation((body: Record<string, unknown>) => api.post('/attendance/corrections', body), {
    invalidate: [['attendance', 'corrections'], ['approvals', 'pending']],
    success: 'Koreksi absensi diajukan ke atasan',
    onDone: onClose,
  });

  return (
    <Modal open={open} onClose={onClose} title="Ajukan koreksi lupa absen" description="Menunggu persetujuan atasan langsung.">
      <form
        className="space-y-4"
        onSubmit={(e: FormEvent<HTMLFormElement>) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const workDate = String(f.get('workDate'));
          const ci = String(f.get('clockIn') ?? '').trim();
          const co = String(f.get('clockOut') ?? '').trim();
          save.mutate({
            workDate,
            ...(ci ? { requestedClockIn: `${workDate}T${ci}:00+07:00` } : {}),
            ...(co ? { requestedClockOut: `${workDate}T${co}:00+07:00` } : {}),
            reason: f.get('reason'),
          });
        }}
      >
        {save.isError && <Alert>{errorMessage(save.error)}</Alert>}
        <Field label="Tanggal kerja" required>
          {(id) => <Input id={id} name="workDate" type="date" max={todayISO()} defaultValue={todayISO()} required />}
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Jam masuk (opsional)">
            {(id) => <Input id={id} name="clockIn" type="time" />}
          </Field>
          <Field label="Jam pulang (opsional)">
            {(id) => <Input id={id} name="clockOut" type="time" />}
          </Field>
        </div>
        <Field label="Alasan" required>
          {(id) => <Textarea id={id} name="reason" required minLength={3} maxLength={500} placeholder="Misal: lupa klik clock-in saat kunjungan proyek" />}
        </Field>
        <ModalActions>
          <Button variant="secondary" onClick={onClose}>Batal</Button>
          <Button type="submit" loading={save.isPending}>Ajukan koreksi</Button>
        </ModalActions>
      </form>
    </Modal>
  );
}
