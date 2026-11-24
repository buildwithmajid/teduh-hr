'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Calculator, Lock, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
  Table,
  TableSkeleton,
  Td,
  Th,
  useToast,
} from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate, formatMonthYear, LABELS, MONTHS_ID } from '@/lib/format';
import type { PayrollPeriodRow, PayrollPeriodStatus, PayrollRunType } from '@/lib/types';

const statusTone: Record<PayrollPeriodStatus, 'gray' | 'amber' | 'blue' | 'green'> = {
  draft: 'gray',
  pending_approval: 'amber',
  approved: 'blue',
  locked: 'green',
};

function defaultDatesForMonth(year: number, month: number) {
  const pad = (n: number) => String(n).padStart(2, '0');
  const lastDay = new Date(year, month, 0).getDate();
  const payDay = Math.min(25, lastDay);
  return {
    attendanceStart: `${year}-${pad(month)}-01`,
    attendanceEnd: `${year}-${pad(month)}-${pad(lastDay)}`,
    payDate: `${year}-${pad(month)}-${pad(payDay)}`,
  };
}

export default function PayrollPeriodsPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const { can } = useAuth();
  const canRun = can('payroll.run');

  const now = new Date();
  const [openCreate, setOpenCreate] = useState(false);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [runType, setRunType] = useState<PayrollRunType>('regular');
  const initDates = defaultDatesForMonth(now.getFullYear(), now.getMonth() + 1);
  const [attendanceStart, setAttendanceStart] = useState(initDates.attendanceStart);
  const [attendanceEnd, setAttendanceEnd] = useState(initDates.attendanceEnd);
  const [payDate, setPayDate] = useState(initDates.payDate);
  const [isFinalTaxPeriod, setIsFinalTaxPeriod] = useState(now.getMonth() + 1 === 12);
  const [formError, setFormError] = useState<string | null>(null);

  const { data: periods, isLoading, error } = useQuery({
    queryKey: ['payroll-periods'],
    queryFn: () => api.get<PayrollPeriodRow[]>('/payroll/periods'),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.post<{ id: string }>('/payroll/periods', {
        year,
        month,
        runType,
        attendanceStart,
        attendanceEnd,
        payDate,
        isFinalTaxPeriod,
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['payroll-periods'] });
      toast('Batch payroll berhasil dibuat dan dihitung');
      setOpenCreate(false);
      router.push(`/payroll/${res.id}`);
    },
    onError: (e) => {
      setFormError(e instanceof ApiError ? e.message : 'Gagal membuat batch payroll');
    },
  });

  function syncPeriodDates(nextYear: number, nextMonth: number) {
    setYear(nextYear);
    setMonth(nextMonth);
    const d = defaultDatesForMonth(nextYear, nextMonth);
    setAttendanceStart(d.attendanceStart);
    setAttendanceEnd(d.attendanceEnd);
    setPayDate(d.payDate);
    setIsFinalTaxPeriod(nextMonth === 12);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    createMutation.mutate();
  }

  return (
    <RequirePermission anyOf={['payroll.view']}>
      <PageHeader
        title="Run payroll"
        description="Hitung batch penggajian bulanan, ajukan persetujuan Finance, dan kunci periode untuk menerbitkan slip gaji."
        actions={
          canRun && (
            <Button
              onClick={() => {
                setFormError(null);
                setOpenCreate(true);
              }}
            >
              <Plus className="size-4" aria-hidden /> Buat & hitung payroll
            </Button>
          )
        }
      />

      {error && (
        <div className="mb-4">
          <Alert tone="red">
            {error instanceof ApiError ? error.message : 'Gagal memuat daftar periode payroll.'}
          </Alert>
        </div>
      )}

      <Card>
        {isLoading ? (
          <TableSkeleton rows={5} cols={6} />
        ) : !periods || periods.length === 0 ? (
          <EmptyState
            title="Belum ada batch payroll"
            description={
              canRun
                ? 'Mulai dengan membuat batch payroll bulanan pertama untuk menghitung gaji, BPJS, dan PPh 21 karyawan.'
                : 'Belum ada periode payroll yang dibuat oleh HR.'
            }
            action={
              canRun && (
                <Button onClick={() => setOpenCreate(true)}>
                  <Calculator className="size-4" aria-hidden /> Buat & hitung payroll
                </Button>
              )
            }
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Periode</Th>
                <Th>Jenis run</Th>
                <Th>Rentang absensi</Th>
                <Th>Tanggal bayar</Th>
                <Th className="text-right">Karyawan</Th>
                <Th>Status</Th>
                <Th className="text-right">Aksi</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line bg-surface">
              {periods.map((p) => (
                <tr key={p.id} className="transition-colors hover:bg-canvas/50">
                  <Td>
                    <Link
                      href={`/payroll/${p.id}`}
                      className="font-medium text-ink hover:text-brand-700 hover:underline"
                    >
                      {formatMonthYear(p.month, p.year)}
                    </Link>
                    {p.isFinalTaxPeriod && (
                      <span className="ml-2 font-mono text-[11px] text-brand-700">Pasal 17</span>
                    )}
                  </Td>
                  <Td className="text-ink-muted">
                    {LABELS.payrollRunType[p.runType]}
                    {p.runSequence > 1 && <span className="ml-1 font-mono text-xs">#{p.runSequence}</span>}
                  </Td>
                  <Td className="font-mono text-xs text-ink-muted">
                    {formatDate(p.attendanceStart)} – {formatDate(p.attendanceEnd)}
                  </Td>
                  <Td className="font-mono text-xs text-ink-muted">{formatDate(p.payDate)}</Td>
                  <Td className="text-right font-mono">{p.employeeCount}</Td>
                  <Td>
                    <Badge tone={statusTone[p.status]} dot>
                      {p.status === 'locked' && <Lock className="size-3" aria-hidden />}
                      {LABELS.payrollStatus[p.status]}
                    </Badge>
                  </Td>
                  <Td className="text-right">
                    <Link
                      href={`/payroll/${p.id}`}
                      className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:text-brand-800"
                    >
                      Detail <ArrowRight className="size-3.5" aria-hidden />
                    </Link>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Modal
        open={openCreate}
        onClose={() => setOpenCreate(false)}
        title="Buat & hitung batch payroll"
        description="Sistem akan mengambil data karyawan aktif, lembur disetujui, cuti unpaid, BPJS, dan PPh 21 sesuai tarif berlaku."
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && <Alert tone="red">{formError}</Alert>}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Bulan" required>
              {(id) => (
                <Select
                  id={id}
                  value={month}
                  onChange={(e) => syncPeriodDates(year, Number(e.target.value))}
                >
                  {MONTHS_ID.map((m, idx) => (
                    <option key={m} value={idx + 1}>
                      {m}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Tahun" required>
              {(id) => (
                <Input
                  id={id}
                  type="number"
                  min={2024}
                  max={2035}
                  value={year}
                  onChange={(e) => syncPeriodDates(Number(e.target.value), month)}
                  required
                />
              )}
            </Field>
          </div>

          <Field label="Jenis run" required>
            {(id) => (
              <Select
                id={id}
                value={runType}
                onChange={(e) => setRunType(e.target.value as PayrollRunType)}
              >
                <option value="regular">Gaji Bulanan (Reguler)</option>
                <option value="thr">THR</option>
                <option value="bonus">Bonus</option>
                <option value="correction">Koreksi</option>
                <option value="final_settlement">Penyelesaian Akhir</option>
              </Select>
            )}
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Awal cut-off absensi" required>
              {(id) => (
                <Input
                  id={id}
                  type="date"
                  value={attendanceStart}
                  onChange={(e) => setAttendanceStart(e.target.value)}
                  required
                />
              )}
            </Field>
            <Field label="Akhir cut-off absensi" required>
              {(id) => (
                <Input
                  id={id}
                  type="date"
                  value={attendanceEnd}
                  onChange={(e) => setAttendanceEnd(e.target.value)}
                  required
                />
              )}
            </Field>
          </div>

          <Field label="Tanggal pembayaran (pay date)" required>
            {(id) => (
              <Input
                id={id}
                type="date"
                value={payDate}
                onChange={(e) => setPayDate(e.target.value)}
                required
              />
            )}
          </Field>

          <Checkbox
            label="Masa pajak terakhir (rekonsiliasi tahunan Pasal 17)"
            description="Aktifkan untuk payroll Desember agar PPh 21 dihitung ulang secara kumulatif satu tahun."
            checked={isFinalTaxPeriod}
            onChange={(e) => setIsFinalTaxPeriod(e.target.checked)}
          />

          <ModalActions>
            <Button variant="secondary" onClick={() => setOpenCreate(false)}>
              Batal
            </Button>
            <Button type="submit" loading={createMutation.isPending}>
              <Calculator className="size-4" aria-hidden /> Buat & hitung
            </Button>
          </ModalActions>
        </form>
      </Modal>
    </RequirePermission>
  );
}
