'use client';

import { useQuery } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import { useEffect, useState } from 'react';
import { PayslipSheet } from '@/components/payslip-sheet';
import { Alert, Card, EmptyState, PageHeader, Spinner, cn } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { formatDate, formatMonthYear, formatRupiah, LABELS } from '@/lib/format';
import type { PayslipDocument, PayslipListItem } from '@/lib/types';

export default function MyPayslipsPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: list, isLoading, error } = useQuery({
    queryKey: ['my-payslips'],
    queryFn: () => api.get<PayslipListItem[]>('/payroll/payslips/me'),
  });

  useEffect(() => {
    if (!selectedId && list && list.length > 0) {
      setSelectedId(list[0].id);
    }
  }, [list, selectedId]);

  const { data: doc, isLoading: loadingDoc } = useQuery({
    queryKey: ['payslip', selectedId],
    queryFn: () => api.get<PayslipDocument>(`/payroll/payslips/${selectedId}`),
    enabled: Boolean(selectedId),
  });

  return (
    <>
      <PageHeader
        title="Slip gaji saya"
        description="Akses dan cetak slip gaji resmi dari periode payroll yang sudah disetujui dan dikunci."
      />

      {error && (
        <div className="mb-4">
          <Alert tone="red">
            {error instanceof ApiError ? error.message : 'Gagal memuat daftar slip gaji.'}
          </Alert>
        </div>
      )}

      {isLoading ? (
        <Spinner label="Memuat daftar slip gaji…" />
      ) : !list || list.length === 0 ? (
        <Card>
          <EmptyState
            title="Belum ada slip gaji"
            description="Slip gaji akan otomatis muncul di sini setelah payroll bulanan disetujui dan dikunci oleh Finance."
          />
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <Card className="h-fit overflow-hidden print:hidden">
            <div className="border-b border-line px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">
                Riwayat slip ({list.length})
              </p>
            </div>
            <ul className="divide-y divide-line">
              {list.map((item) => {
                const active = item.id === selectedId;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(item.id)}
                      className={cn(
                        'flex w-full cursor-pointer items-start justify-between gap-3 px-4 py-3 text-left transition-colors',
                        active ? 'bg-brand-50/70 text-brand-900' : 'hover:bg-canvas/70',
                      )}
                    >
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 text-sm font-medium text-ink">
                          <FileText className="size-3.5 shrink-0 text-brand-600" aria-hidden />
                          <span className="truncate">{formatMonthYear(item.month, item.year)}</span>
                        </p>
                        <p className="mt-0.5 text-[11px] text-ink-muted">
                          {LABELS.payrollRunType[item.runType]} · {formatDate(item.payDate)}
                        </p>
                      </div>
                      <p className="shrink-0 font-mono text-xs font-semibold text-ink tabular">
                        {formatRupiah(item.netSalary)}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>

          <div>
            {loadingDoc || !doc ? (
              <Card>
                <Spinner label="Memuat rincian slip gaji…" />
              </Card>
            ) : (
              <PayslipSheet doc={doc} />
            )}
          </div>
        </div>
      )}
    </>
  );
}
