'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Lock,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { PayslipSheet } from '@/components/payslip-sheet';
import { RequirePermission } from '@/components/app-shell';
import {
  Alert,
  Badge,
  Button,
  Card,
  ConfirmModal,
  Drawer,
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
  Textarea,
  Th,
  useToast,
} from '@/components/ui';
import { api, ApiError, downloadFile } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate, formatMonthYear, formatRupiah, LABELS } from '@/lib/format';
import type { PayrollPeriodDetail, PayrollPeriodStatus, PayslipDocument } from '@/lib/types';

const statusTone: Record<PayrollPeriodStatus, 'gray' | 'amber' | 'blue' | 'green'> = {
  draft: 'gray',
  pending_approval: 'amber',
  approved: 'blue',
  locked: 'green',
};

export default function PayrollPeriodDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const qc = useQueryClient();
  const toast = useToast();
  const { me, can } = useAuth();

  const canRun = can('payroll.run');
  const canApprove = can('payroll.approve');

  const [tab, setTab] = useState<'employees' | 'departments'>('employees');
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [openReject, setOpenReject] = useState(false);
  const [rejectNotes, setRejectNotes] = useState('');
  const [selectedDetailId, setSelectedDetailId] = useState<string | null>(null);
  const [empSearch, setEmpSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [exporting, setExporting] = useState<'bank' | 'bpjs' | 'pph21' | null>(null);

  async function handleExport(type: 'bank' | 'bpjs' | 'pph21') {
    setExporting(type);
    try {
      await downloadFile(`/payroll/periods/${id}/export?type=${type}`, `payroll-${type}.csv`);
      toast(`File CSV ${type.toUpperCase()} berhasil diunduh`);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Gagal mengekspor CSV', 'error');
    } finally {
      setExporting(null);
    }
  }

  const { data, isLoading, error } = useQuery({
    queryKey: ['payroll-period', id],
    queryFn: () => api.get<PayrollPeriodDetail>(`/payroll/periods/${id}`),
  });

  const { data: payslipDoc, isLoading: loadingSlip } = useQuery({
    queryKey: ['payslip', selectedDetailId],
    queryFn: () => api.get<PayslipDocument>(`/payroll/payslips/${selectedDetailId}`),
    enabled: Boolean(selectedDetailId),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['payroll-period', id] });
    qc.invalidateQueries({ queryKey: ['payroll-periods'] });
  };

  const recalcMutation = useMutation({
    mutationFn: () => api.post(`/payroll/periods/${id}/recalculate`),
    onSuccess: () => {
      invalidate();
      toast('Perhitungan payroll diperbarui');
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Gagal menghitung ulang', 'error'),
  });

  const submitMutation = useMutation({
    mutationFn: () => api.post(`/payroll/periods/${id}/submit`),
    onSuccess: () => {
      invalidate();
      setConfirmSubmit(false);
      toast('Payroll diajukan ke Finance untuk persetujuan');
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Gagal mengajukan payroll', 'error'),
  });

  const approveMutation = useMutation({
    mutationFn: () => api.post(`/payroll/periods/${id}/approve`),
    onSuccess: () => {
      invalidate();
      setConfirmApprove(false);
      toast('Payroll disetujui & dikunci. Slip gaji telah diterbitkan.');
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Gagal menyetujui payroll', 'error'),
  });

  const rejectMutation = useMutation({
    mutationFn: () => api.post(`/payroll/periods/${id}/reject`, { notes: rejectNotes }),
    onSuccess: () => {
      invalidate();
      setOpenReject(false);
      setRejectNotes('');
      toast('Payroll dikembalikan ke Draft');
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Gagal menolak payroll', 'error'),
  });

  function handleRejectSubmit(e: FormEvent) {
    e.preventDefault();
    if (!rejectNotes.trim()) return;
    rejectMutation.mutate();
  }

  const period = data?.period;
  const totals = data?.totals;
  const isSameProcessor = Boolean(period && me && period.processedBy === me.id);

  const filteredItems = (data?.items ?? []).filter((item) => {
    const q = empSearch.trim().toLowerCase();
    const matchQ =
      !q ||
      item.employee.fullName.toLowerCase().includes(q) ||
      item.employee.employeeCode.toLowerCase().includes(q);
    const matchDept = !deptFilter || item.employee.department.id === deptFilter;
    return matchQ && matchDept;
  });

  const selectedIndex = filteredItems.findIndex((i) => i.id === selectedDetailId);
  const selectedItem = selectedIndex >= 0 ? filteredItems[selectedIndex] : null;

  return (
    <RequirePermission anyOf={['payroll.view']}>
      <div className="mb-3">
        <Link
          href="/payroll"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-muted hover:text-ink"
        >
          <ArrowLeft className="size-3.5" aria-hidden /> Kembali ke daftar run payroll
        </Link>
      </div>

      {isLoading ? (
        <Spinner label="Memuat detail payroll…" />
      ) : error || !data || !period || !totals ? (
        <Alert tone="red">
          {error instanceof ApiError ? error.message : 'Gagal memuat detail periode payroll.'}
        </Alert>
      ) : (
        <>
          <PageHeader
            title={`Payroll ${formatMonthYear(period.month, period.year)}`}
            description={
              <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
                <span>{LABELS.payrollRunType[period.runType]}</span>
                <span>·</span>
                <span className="font-mono text-xs">
                  Cut-off {formatDate(period.attendanceStart)} – {formatDate(period.attendanceEnd)}
                </span>
                <span>·</span>
                <span className="font-mono text-xs">Bayar {formatDate(period.payDate)}</span>
                <Badge tone={statusTone[period.status]} dot>
                  {period.status === 'locked' && <Lock className="size-3" aria-hidden />}
                  {LABELS.payrollStatus[period.status]}
                </Badge>
              </span>
            }
            actions={
              <>
                {period.status === 'draft' && canRun && (
                  <>
                    <Button
                      variant="secondary"
                      loading={recalcMutation.isPending}
                      onClick={() => recalcMutation.mutate()}
                    >
                      <RefreshCw className="size-4" aria-hidden /> Hitung ulang
                    </Button>
                    <Button onClick={() => setConfirmSubmit(true)}>
                      <Send className="size-4" aria-hidden /> Ajukan ke Finance
                    </Button>
                  </>
                )}

                {period.status === 'pending_approval' && canApprove && (
                  <>
                    <Button variant="secondary" onClick={() => setOpenReject(true)}>
                      <XCircle className="size-4" aria-hidden /> Tolak ke Draft
                    </Button>
                    <Button
                      disabled={isSameProcessor}
                      title={
                        isSameProcessor
                          ? 'Pemisahan tugas: penyetuju harus berbeda dari pemroses payroll'
                          : undefined
                      }
                      onClick={() => setConfirmApprove(true)}
                    >
                      <CheckCircle2 className="size-4" aria-hidden /> Setujui & Kunci Payroll
                    </Button>
                  </>
                )}
              </>
            }
          />

          {period.rejectionNotes && period.status === 'draft' && (
            <div className="mb-5">
              <Alert tone="amber">
                <strong className="font-semibold">Catatan penolakan Finance:</strong> {period.rejectionNotes}
              </Alert>
            </div>
          )}

          {period.status === 'pending_approval' && canApprove && isSameProcessor && (
            <div className="mb-5">
              <Alert tone="blue">
                <span className="inline-flex items-center gap-1.5">
                  <ShieldAlert className="size-4 shrink-0" aria-hidden />
                  <span>
                    <strong>Pemisahan tugas (Separation of Duties):</strong> Anda yang memproses batch ini, sehingga persetujuan akhir harus dilakukan oleh akun Finance atau Super Admin lain.
                  </span>
                </span>
              </Alert>
            </div>
          )}

          {/* Unified Ledger Summary Strip */}
          <Card className="mb-6">
            <div className="grid grid-cols-2 divide-y divide-line sm:grid-cols-4 sm:divide-x sm:divide-y-0">
              <div className="p-4">
                <p className="text-[11px] font-medium uppercase tracking-wider text-ink-subtle">
                  Total Take-Home Pay
                </p>
                <p className="mt-1 font-mono text-lg font-semibold text-ink tabular">
                  {formatRupiah(totals.netSalary)}
                </p>
                <p className="mt-0.5 text-xs text-ink-muted">{totals.employeeCount} karyawan</p>
              </div>
              <div className="p-4">
                <p className="text-[11px] font-medium uppercase tracking-wider text-ink-subtle">
                  Total PPh 21
                </p>
                <p className="mt-1 font-mono text-lg font-semibold text-ink tabular">
                  {formatRupiah(totals.pph21)}
                </p>
                <p className="mt-0.5 text-xs text-ink-muted">
                  {period.isFinalTaxPeriod ? 'Rekonsiliasi Pasal 17' : 'Tarif Efektif (TER)'}
                </p>
              </div>
              <div className="p-4">
                <p className="text-[11px] font-medium uppercase tracking-wider text-ink-subtle">
                  BPJS Perusahaan
                </p>
                <p className="mt-1 font-mono text-lg font-semibold text-ink tabular">
                  {formatRupiah(totals.bpjsCompany)}
                </p>
                <p className="mt-0.5 text-xs text-ink-muted">
                  Karyawan: <span className="font-mono tabular">{formatRupiah(totals.bpjsEmployee)}</span>
                </p>
              </div>
              <div className="bg-brand-50/40 p-4">
                <p className="text-[11px] font-medium uppercase tracking-wider text-brand-800">
                  Total Biaya Perusahaan
                </p>
                <p className="mt-1 font-mono text-lg font-semibold text-brand-900 tabular">
                  {formatRupiah(totals.totalCompanyCost)}
                </p>
                <p className="mt-0.5 text-xs text-brand-800/80">Bruto tunai + BPJS perusahaan</p>
              </div>
            </div>
          </Card>

          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { value: 'employees', label: `Rincian karyawan (${data.items.length})` },
              { value: 'departments', label: `Laporan biaya departemen (${data.departmentReport.length})` },
            ]}
          />

          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-surface px-4 py-2.5">
            <span className="text-xs font-medium text-ink-muted">Export laporan Finance (CSV)</span>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                loading={exporting === 'bank'}
                onClick={() => handleExport('bank')}
              >
                <Download className="size-3.5" aria-hidden /> Transfer Bank
              </Button>
              <Button
                variant="secondary"
                size="sm"
                loading={exporting === 'bpjs'}
                onClick={() => handleExport('bpjs')}
              >
                <Download className="size-3.5" aria-hidden /> Rekap BPJS
              </Button>
              <Button
                variant="secondary"
                size="sm"
                loading={exporting === 'pph21'}
                onClick={() => handleExport('pph21')}
              >
                <Download className="size-3.5" aria-hidden /> Rekap PPh 21
              </Button>
            </div>
          </div>

          {tab === 'employees' ? (
            <Card>
              <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
                <div className="relative min-w-[220px] flex-1">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-ink-subtle"
                    aria-hidden
                  />
                  <Input
                    value={empSearch}
                    onChange={(e) => setEmpSearch(e.target.value)}
                    placeholder="Cari nama atau kode karyawan…"
                    className="h-8 pl-8 text-xs"
                  />
                </div>
                <Select
                  value={deptFilter}
                  onChange={(e) => setDeptFilter(e.target.value)}
                  className="h-8 w-auto min-w-[180px] py-1 text-xs"
                  aria-label="Filter departemen"
                >
                  <option value="">Semua departemen</option>
                  {data.departmentReport.map((d) => (
                    <option key={d.departmentId} value={d.departmentId}>
                      {d.departmentName}
                    </option>
                  ))}
                </Select>
                <span className="ml-auto font-mono text-xs text-ink-muted tabular">
                  {filteredItems.length} / {data.items.length}
                </span>
              </div>

              {filteredItems.length === 0 ? (
                <EmptyState
                  title="Tidak ada karyawan yang cocok"
                  description="Ubah kata kunci pencarian atau pilih departemen lain."
                />
              ) : (
                <div className="max-h-[65vh] overflow-auto">
                  <table className="min-w-full divide-y divide-line text-sm tabular">
                    <thead className="sticky top-0 z-10 shadow-[0_1px_0_var(--color-line)]">
                      <tr>
                        <Th className="sticky left-0 z-20 bg-canvas">Karyawan</Th>
                        <Th>PTKP</Th>
                        <Th className="text-right">Gaji pokok</Th>
                        <Th className="text-right">Tunj. & lembur</Th>
                        <Th className="text-right">BPJS kary.</Th>
                        <Th className="text-right">PPh 21</Th>
                        <Th className="text-right">Take-Home Pay</Th>
                        <Th className="text-right">Slip</Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line bg-surface">
                      {filteredItems.map((item) => {
                        const extras =
                          item.fixedAllowance +
                          item.variableAllowance +
                          item.overtimeAmount +
                          item.irregularIncome;
                        const activeRow = item.id === selectedDetailId;
                        return (
                          <tr
                            key={item.id}
                            className={
                              activeRow
                                ? 'bg-brand-50/50 transition-colors'
                                : 'transition-colors hover:bg-canvas/50'
                            }
                          >
                            <Td className="sticky left-0 bg-inherit">
                              <p className="font-medium text-ink">{item.employee.fullName}</p>
                              <p className="text-xs text-ink-muted">
                                <span className="font-mono">{item.employee.employeeCode}</span> ·{' '}
                                {item.employee.department.name}
                              </p>
                            </Td>
                            <Td className="font-mono text-xs text-ink-muted">{item.employee.ptkpStatus}</Td>
                            <Td className="text-right font-mono text-xs">{formatRupiah(item.baseSalary)}</Td>
                            <Td className="text-right font-mono text-xs text-ink-muted">
                              {formatRupiah(extras)}
                            </Td>
                            <Td className="text-right font-mono text-xs text-red-700">
                              −{formatRupiah(item.bpjsEmployee)}
                            </Td>
                            <Td className="text-right font-mono text-xs text-red-700">
                              {item.pph21Refund > 0
                                ? `+${formatRupiah(item.pph21Refund)}`
                                : `−${formatRupiah(item.pph21Amount)}`}
                            </Td>
                            <Td className="text-right font-mono text-xs font-semibold text-ink">
                              {formatRupiah(item.netSalary)}
                            </Td>
                            <Td className="text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setSelectedDetailId(item.id)}
                              >
                                <FileText className="size-3.5" aria-hidden /> Lihat slip
                              </Button>
                            </Td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          ) : (
            <Card>
              <Table>
                <thead>
                  <tr>
                    <Th>Departemen</Th>
                    <Th className="text-right">Karyawan</Th>
                    <Th className="text-right">Bruto tunai</Th>
                    <Th className="text-right">BPJS perusahaan</Th>
                    <Th className="text-right">PPh 21</Th>
                    <Th className="text-right">Total THP</Th>
                    <Th className="text-right">Total biaya perusahaan</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line bg-surface">
                  {data.departmentReport.map((dept) => (
                    <tr key={dept.departmentId} className="transition-colors hover:bg-canvas/50">
                      <Td className="font-medium text-ink">{dept.departmentName}</Td>
                      <Td className="text-right font-mono text-xs">{dept.employeeCount}</Td>
                      <Td className="text-right font-mono text-xs">{formatRupiah(dept.grossCash)}</Td>
                      <Td className="text-right font-mono text-xs">{formatRupiah(dept.bpjsCompany)}</Td>
                      <Td className="text-right font-mono text-xs">{formatRupiah(dept.pph21)}</Td>
                      <Td className="text-right font-mono text-xs font-medium">
                        {formatRupiah(dept.netSalary)}
                      </Td>
                      <Td className="text-right font-mono text-xs font-semibold text-brand-800">
                        {formatRupiah(dept.totalCompanyCost)}
                      </Td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-line bg-canvas/70 font-semibold">
                  <tr>
                    <Td>Grand Total</Td>
                    <Td className="text-right font-mono text-xs">{totals.employeeCount}</Td>
                    <Td className="text-right font-mono text-xs">{formatRupiah(totals.grossCash)}</Td>
                    <Td className="text-right font-mono text-xs">{formatRupiah(totals.bpjsCompany)}</Td>
                    <Td className="text-right font-mono text-xs">{formatRupiah(totals.pph21)}</Td>
                    <Td className="text-right font-mono text-xs">{formatRupiah(totals.netSalary)}</Td>
                    <Td className="text-right font-mono text-xs text-brand-900">
                      {formatRupiah(totals.totalCompanyCost)}
                    </Td>
                  </tr>
                </tfoot>
              </Table>
            </Card>
          )}

          {/* Confirm Submit */}
          <ConfirmModal
            open={confirmSubmit}
            onClose={() => setConfirmSubmit(false)}
            onConfirm={() => submitMutation.mutate()}
            loading={submitMutation.isPending}
            variant="primary"
            title="Ajukan payroll ke Finance?"
            description={`Batch ${formatMonthYear(period.month, period.year)} untuk ${totals.employeeCount} karyawan dengan total biaya ${formatRupiah(totals.totalCompanyCost)} akan dikirim ke Finance untuk diperiksa dan disetujui.`}
            confirmLabel="Ajukan sekarang"
          />

          {/* Confirm Approve & Lock */}
          <ConfirmModal
            open={confirmApprove}
            onClose={() => setConfirmApprove(false)}
            onConfirm={() => approveMutation.mutate()}
            loading={approveMutation.isPending}
            variant="primary"
            title="Setujui & kunci payroll?"
            description="Setelah dikunci, seluruh angka payroll bersifat permanen (dilindungi trigger database), ringkasan PPh 21 YTD diperbarui, dan slip gaji langsung tersedia untuk semua karyawan."
            confirmLabel="Setujui & kunci"
          />

          {/* Reject Modal */}
          <Modal
            open={openReject}
            onClose={() => setOpenReject(false)}
            title="Tolak batch payroll ke Draft"
            description="Berikan alasan perbaikan agar tim HR dapat menghitung ulang sebelum diajukan kembali."
            size="sm"
          >
            <form onSubmit={handleRejectSubmit} className="space-y-4">
              <Field label="Catatan penolakan" required>
                {(fid) => (
                  <Textarea
                    id={fid}
                    value={rejectNotes}
                    onChange={(e) => setRejectNotes(e.target.value)}
                    placeholder="Contoh: Lembur tim Studio Bali bulan ini belum masuk semua."
                    required
                  />
                )}
              </Field>
              <ModalActions>
                <Button variant="secondary" onClick={() => setOpenReject(false)}>
                  Batal
                </Button>
                <Button
                  type="submit"
                  variant="danger"
                  loading={rejectMutation.isPending}
                  disabled={!rejectNotes.trim()}
                >
                  Kembalikan ke Draft
                </Button>
              </ModalActions>
            </form>
          </Modal>

          {/* Payslip Slide-Over Drawer */}
          <Drawer
            open={Boolean(selectedDetailId)}
            onClose={() => setSelectedDetailId(null)}
            title={selectedItem ? selectedItem.employee.fullName : 'Pratinjau slip gaji'}
            description={
              selectedItem
                ? `${selectedItem.employee.employeeCode} · ${selectedItem.employee.department.name} (${selectedIndex + 1} dari ${filteredItems.length})`
                : undefined
            }
            headerActions={
              selectedIndex >= 0 && (
                <div className="flex items-center gap-1">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={selectedIndex <= 0}
                    onClick={() => setSelectedDetailId(filteredItems[selectedIndex - 1].id)}
                    aria-label="Karyawan sebelumnya"
                  >
                    <ChevronLeft className="size-3.5" aria-hidden />
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={selectedIndex >= filteredItems.length - 1}
                    onClick={() => setSelectedDetailId(filteredItems[selectedIndex + 1].id)}
                    aria-label="Karyawan berikutnya"
                  >
                    <ChevronRight className="size-3.5" aria-hidden />
                  </Button>
                </div>
              )
            }
          >
            {loadingSlip || !payslipDoc ? (
              <Spinner label="Memuat slip gaji…" />
            ) : (
              <PayslipSheet doc={payslipDoc} />
            )}
          </Drawer>
        </>
      )}
    </RequirePermission>
  );
}
