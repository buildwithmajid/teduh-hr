'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Paperclip, Plus, Receipt, Search, XCircle } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { AttachmentPreviewModal, AttachmentUpload } from '@/components/attachment-upload';
import {
  Alert,
  Badge,
  Button,
  Card,
  ConfirmModal,
  CurrencyInput,
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
import { api, ApiError } from '@/lib/api';
import { useAuth, useMe } from '@/lib/auth';
import { formatDate, formatMonthYear, formatRupiah, LABELS, todayISO } from '@/lib/format';
import type { ReimbursementCategory, ReimbursementItem, RequestStatus } from '@/lib/types';

const statusTone: Record<RequestStatus, 'amber' | 'green' | 'red' | 'gray'> = {
  pending: 'amber',
  approved: 'green',
  rejected: 'red',
  cancelled: 'gray',
};

const CATEGORIES: ReimbursementCategory[] = [
  'transport',
  'medical',
  'meal',
  'office_supply',
  'travel',
  'other',
];

export default function ReimbursementsPage() {
  const me = useMe();
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const canViewAll = can('reimbursement.view');

  const [tab, setTab] = useState<'mine' | 'all'>(me.employee ? 'mine' : 'all');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [openCreate, setOpenCreate] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<ReimbursementItem | null>(null);
  const [previewKey, setPreviewKey] = useState<string | null>(null);

  const [category, setCategory] = useState<ReimbursementCategory>('transport');
  const [title, setTitle] = useState('');
  const [expenseDate, setExpenseDate] = useState(todayISO());
  const [amount, setAmount] = useState('');
  const [receiptRef, setReceiptRef] = useState('');
  const [uploadedKey, setUploadedKey] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const mine = useQuery({
    queryKey: ['reimbursements', 'me'],
    queryFn: () => api.get<ReimbursementItem[]>('/reimbursements/me'),
    enabled: Boolean(me.employee),
  });

  const all = useQuery({
    queryKey: ['reimbursements', 'all'],
    queryFn: () => api.get<ReimbursementItem[]>('/reimbursements'),
    enabled: canViewAll,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.post('/reimbursements', {
        category,
        title,
        expenseDate,
        amount: Number(amount),
        description,
        receiptRef: uploadedKey ? `file:${uploadedKey}` : receiptRef.trim() || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reimbursements'] });
      toast('Klaim reimbursement berhasil diajukan');
      setOpenCreate(false);
      setTitle('');
      setAmount('');
      setReceiptRef('');
      setUploadedKey(null);
      setDescription('');
    },
    onError: (e) => setFormError(e instanceof ApiError ? e.message : 'Gagal mengajukan reimbursement'),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.post(`/reimbursements/${id}/cancel`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reimbursements'] });
      setCancelTarget(null);
      toast('Klaim reimbursement dibatalkan');
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Gagal membatalkan klaim', 'error'),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    createMutation.mutate();
  }

  const activeQuery = tab === 'mine' ? mine : all;
  const allRows = activeQuery.data ?? [];
  const rows = allRows.filter((r) => {
    const q = search.trim().toLowerCase();
    const matchQ =
      !q ||
      r.title.toLowerCase().includes(q) ||
      r.description.toLowerCase().includes(q) ||
      (r.employee?.fullName.toLowerCase().includes(q) ?? false);
    const matchStatus = !statusFilter || r.status === statusFilter;
    return matchQ && matchStatus;
  });

  return (
    <>
      <PageHeader
        title="Reimbursement"
        description="Ajukan klaim biaya operasional; klaim yang disetujui otomatis masuk ke payroll reguler berikutnya (bebas pajak)."
        actions={
          me.employee && (
            <Button
              onClick={() => {
                setFormError(null);
                setOpenCreate(true);
              }}
            >
              <Plus className="size-4" aria-hidden /> Ajukan klaim
            </Button>
          )
        }
      />

      {canViewAll && me.employee && (
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'mine', label: `Klaim saya (${mine.data?.length ?? 0})` },
            { value: 'all', label: `Semua karyawan (${all.data?.length ?? 0})` },
          ]}
        />
      )}

      {activeQuery.error && (
        <div className="mb-4">
          <Alert tone="red">
            {activeQuery.error instanceof ApiError
              ? activeQuery.error.message
              : 'Gagal memuat data reimbursement.'}
          </Alert>
        </div>
      )}

      <Card>
        {allRows.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
            <div className="relative min-w-[200px] flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-ink-subtle"
                aria-hidden
              />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={tab === 'all' ? 'Cari karyawan, judul, atau keterangan…' : 'Cari judul atau keterangan…'}
                className="h-8 pl-8 text-xs"
              />
            </div>
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-8 w-auto min-w-[150px] py-1 text-xs"
              aria-label="Filter status"
            >
              <option value="">Semua status</option>
              <option value="pending">Menunggu</option>
              <option value="approved">Disetujui</option>
              <option value="rejected">Ditolak</option>
              <option value="cancelled">Dibatalkan</option>
            </Select>
          </div>
        )}
        {activeQuery.isLoading ? (
          <TableSkeleton rows={5} cols={6} />
        ) : rows.length === 0 ? (
          <EmptyState
            title={allRows.length > 0 ? 'Tidak ada klaim yang cocok' : 'Belum ada klaim reimbursement'}
            description={
              allRows.length > 0
                ? 'Ubah kata kunci pencarian atau filter status.'
                : tab === 'mine'
                  ? 'Klik tombol Ajukan klaim untuk mencatat pengeluaran dinas atau operasional Anda.'
                  : 'Belum ada karyawan yang mengajukan klaim reimbursement.'
            }
            action={
              allRows.length === 0 && tab === 'mine' && me.employee && (
                <Button onClick={() => setOpenCreate(true)}>
                  <Receipt className="size-4" aria-hidden /> Ajukan klaim
                </Button>
              )
            }
          />
        ) : (
          <>
            {/* Mobile stacked card list */}
            <ul className="divide-y divide-line sm:hidden">
              {rows.map((r) => (
                <li key={r.id} className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-ink">{r.title}</p>
                      {tab === 'all' && r.employee && (
                        <p className="text-xs text-ink-muted">{r.employee.fullName} · {r.employee.department}</p>
                      )}
                      <p className="mt-0.5 text-xs text-ink-muted">
                        {LABELS.reimbursementCategory[r.category]} · {formatDate(r.expenseDate)}
                      </p>
                    </div>
                    <Badge tone={statusTone[r.status]} dot>
                      {LABELS.requestStatus[r.status]}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <span className="font-mono text-sm font-semibold text-ink tabular">{formatRupiah(r.amount)}</span>
                    {tab === 'mine' && r.status === 'pending' && (
                      <Button variant="ghost" size="sm" onClick={() => setCancelTarget(r)}>
                        <XCircle className="size-3.5" aria-hidden /> Batalkan
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>

            {/* Desktop table */}
            <div className="hidden sm:block">
              <Table>
                <thead>
                  <tr>
                    {tab === 'all' && <Th>Karyawan</Th>}
                    <Th>Judul & catatan</Th>
                    <Th>Kategori</Th>
                    <Th>Tgl transaksi</Th>
                    <Th className="text-right">Nominal</Th>
                    <Th>Status</Th>
                    {tab === 'mine' && <Th className="text-right">Aksi</Th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line bg-surface">
                  {rows.map((r) => (
                    <tr key={r.id} className="transition-colors hover:bg-canvas/50">
                      {tab === 'all' && (
                        <Td>
                          <p className="font-medium text-ink">{r.employee?.fullName ?? '—'}</p>
                          <p className="text-xs text-ink-muted">
                            <span className="font-mono">{r.employee?.employeeCode}</span> · {r.employee?.department}
                          </p>
                        </Td>
                      )}
                      <Td>
                        <p className="font-medium text-ink">{r.title}</p>
                        <p className="line-clamp-1 text-xs text-ink-muted">{r.description}</p>
                        {r.receiptRef && (
                          r.receiptRef.startsWith('file:') ? (
                            <button
                              type="button"
                              onClick={() => setPreviewKey(r.receiptRef!.slice(5))}
                              className="mt-1 inline-flex cursor-pointer items-center gap-1 text-[11px] font-medium text-brand-700 hover:underline"
                            >
                              <Paperclip className="size-3" aria-hidden /> Lihat bukti kuitansi
                            </button>
                          ) : (
                            <p className="mt-0.5 font-mono text-[11px] text-ink-subtle">Kuitansi: {r.receiptRef}</p>
                          )
                        )}
                      </Td>
                      <Td className="whitespace-nowrap text-xs text-ink-muted">
                        {LABELS.reimbursementCategory[r.category]}
                      </Td>
                      <Td className="whitespace-nowrap font-mono text-xs text-ink-muted">
                        {formatDate(r.expenseDate)}
                      </Td>
                      <Td className="whitespace-nowrap text-right font-mono text-xs font-semibold text-ink">
                        {formatRupiah(r.amount)}
                      </Td>
                      <Td>
                        <div className="flex flex-col items-start gap-1">
                          <Badge tone={statusTone[r.status]} dot>
                            {LABELS.requestStatus[r.status]}
                          </Badge>
                          {r.paidPayrollPeriod && (
                            <span className="font-mono text-[10px] text-emerald-800">
                              Dibayar {formatMonthYear(r.paidPayrollPeriod.month, r.paidPayrollPeriod.year)}
                            </span>
                          )}
                        </div>
                      </Td>
                      {tab === 'mine' && (
                        <Td className="text-right">
                          {r.status === 'pending' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setCancelTarget(r)}
                            >
                              <XCircle className="size-3.5" aria-hidden /> Batalkan
                            </Button>
                          )}
                        </Td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </>
        )}
      </Card>

      <Modal
        open={openCreate}
        onClose={() => setOpenCreate(false)}
        title="Ajukan klaim reimbursement"
        description="Klaim akan melalui persetujuan atasan langsung dan verifikasi Finance."
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && <Alert tone="red">{formError}</Alert>}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Kategori" required>
              {(id) => (
                <Select
                  id={id}
                  value={category}
                  onChange={(e) => setCategory(e.target.value as ReimbursementCategory)}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {LABELS.reimbursementCategory[c]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Tanggal transaksi" required>
              {(id) => (
                <Input
                  id={id}
                  type="date"
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                  required
                />
              )}
            </Field>
          </div>

          <Field label="Judul klaim" required>
            {(id) => (
              <Input
                id={id}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Contoh: Transport survei proyek Bandung"
                required
              />
            )}
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Nominal" required>
              {(id) => (
                <CurrencyInput
                  id={id}
                  value={amount}
                  onChange={setAmount}
                  placeholder="250.000"
                  required
                />
              )}
            </Field>
            <Field label="No. Kuitansi / Referensi">
              {(id) => (
                <Input
                  id={id}
                  value={receiptRef}
                  onChange={(e) => setReceiptRef(e.target.value)}
                  placeholder="INV-2026-001"
                />
              )}
            </Field>
          </div>

          <Field label="Foto / PDF kuitansi">
            {() => (
              <AttachmentUpload
                value={uploadedKey}
                onChange={setUploadedKey}
                label="Unggah foto struk atau PDF kuitansi (maks. 5 MB)"
              />
            )}
          </Field>

          <Field label="Keterangan pengeluaran" required>
            {(id) => (
              <Textarea
                id={id}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Jelaskan keperluan dan rincian biaya."
                required
              />
            )}
          </Field>

          <ModalActions>
            <Button variant="secondary" onClick={() => setOpenCreate(false)}>
              Batal
            </Button>
            <Button type="submit" loading={createMutation.isPending}>
              Ajukan klaim
            </Button>
          </ModalActions>
        </form>
      </Modal>

      <ConfirmModal
        open={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        onConfirm={() => cancelTarget && cancelMutation.mutate(cancelTarget.id)}
        loading={cancelMutation.isPending}
        title="Batalkan klaim reimbursement?"
        description={
          cancelTarget
            ? `Klaim "${cancelTarget.title}" sebesar ${formatRupiah(cancelTarget.amount)} akan dibatalkan.`
            : ''
        }
        confirmLabel="Ya, batalkan"
      />

      <AttachmentPreviewModal
        attachmentKey={previewKey}
        onClose={() => setPreviewKey(null)}
        title="Bukti kuitansi reimbursement"
      />
    </>
  );
}
