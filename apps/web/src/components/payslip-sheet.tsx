'use client';

import { Printer } from 'lucide-react';
import { formatDate, formatMonthYear, formatRupiah, LABELS } from '@/lib/format';
import type { PayslipDocument } from '@/lib/types';
import { BrandMark } from './brand-mark';
import { Button } from './ui';

export function PayslipSheet({ doc }: { doc: PayslipDocument }) {
  const totalEarnings = doc.earnings.reduce((s, e) => s + e.amount, 0);
  const totalDeductions = doc.deductions.reduce((s, d) => s + d.amount, 0);

  return (
    <div className="space-y-4">
      <div className="flex justify-end print:hidden">
        <Button variant="secondary" size="sm" onClick={() => window.print()}>
          <Printer className="size-3.5" aria-hidden /> Cetak / Simpan PDF
        </Button>
      </div>

      <article className="rounded-lg border border-line bg-white p-6 text-ink print:border-0 print:p-0">
        {/* Kop Perusahaan */}
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-4">
          <div className="flex items-start gap-3">
            <BrandMark />
            <div>
              <h2 className="text-base font-semibold tracking-tight text-ink">{doc.company.name}</h2>
              {doc.company.address && <p className="text-xs text-ink-muted">{doc.company.address}</p>}
              {doc.company.npwp && <p className="font-mono text-[11px] text-ink-subtle">NPWP: {doc.company.npwp}</p>}
            </div>
          </div>
          <div className="text-left sm:text-right">
            <p className="text-xs font-semibold uppercase tracking-wider text-brand-700">Slip Gaji Karyawan</p>
            <p className="mt-0.5 text-sm font-semibold text-ink">
              {formatMonthYear(doc.period.month, doc.period.year)} · {LABELS.payrollRunType[doc.period.runType]}
            </p>
            <p className="font-mono text-[11px] text-ink-muted">Tanggal bayar: {formatDate(doc.period.payDate)}</p>
          </div>
        </div>

        {/* Info Karyawan */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 border-b border-line py-4 text-xs sm:grid-cols-3">
          <div>
            <span className="text-ink-subtle">Nama</span>
            <p className="font-medium text-ink">{doc.employee.fullName}</p>
          </div>
          <div>
            <span className="text-ink-subtle">Kode karyawan</span>
            <p className="font-mono text-ink">{doc.employee.employeeCode}</p>
          </div>
          <div>
            <span className="text-ink-subtle">Departemen / Jabatan</span>
            <p className="text-ink">
              {doc.employee.department} · {doc.employee.position}
            </p>
          </div>
          <div>
            <span className="text-ink-subtle">Status PTKP</span>
            <p className="font-mono text-ink">{doc.employee.ptkpStatus}</p>
          </div>
          <div>
            <span className="text-ink-subtle">Metode PPh 21</span>
            <p className="text-ink">
              {doc.summary.pph21Method === 'annual_reconciliation' ? 'Rekonsiliasi Pasal 17' : 'TER Bulanan'}
            </p>
          </div>
          <div>
            <span className="text-ink-subtle">Bank</span>
            <p className="text-ink">{doc.employee.bankName ?? '—'}</p>
          </div>
        </div>

        {/* Pendapatan vs Potongan */}
        <div className="grid gap-6 border-b border-line py-5 sm:grid-cols-2">
          <div>
            <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">Pendapatan</h3>
            <ul className="space-y-1.5 text-xs">
              {doc.earnings.map((e, i) => (
                <li key={`${e.code}-${i}`} className="flex justify-between gap-2">
                  <span className="text-ink-muted">{e.name}</span>
                  <span className="font-mono text-ink tabular">{formatRupiah(e.amount)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex justify-between border-t border-line pt-2 text-xs font-semibold">
              <span>Total pendapatan</span>
              <span className="font-mono tabular">{formatRupiah(totalEarnings)}</span>
            </div>
          </div>

          <div>
            <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">Potongan</h3>
            <ul className="space-y-1.5 text-xs">
              {doc.deductions.length === 0 ? (
                <li className="text-ink-subtle">Tidak ada potongan</li>
              ) : (
                doc.deductions.map((d, i) => (
                  <li key={`${d.code}-${i}`} className="flex justify-between gap-2">
                    <span className="text-ink-muted">{d.name}</span>
                    <span className="font-mono text-red-700 tabular">−{formatRupiah(d.amount)}</span>
                  </li>
                ))
              )}
            </ul>
            <div className="mt-3 flex justify-between border-t border-line pt-2 text-xs font-semibold">
              <span>Total potongan</span>
              <span className="font-mono text-red-700 tabular">−{formatRupiah(totalDeductions)}</span>
            </div>
          </div>
        </div>

        {/* Take-Home Pay */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-brand-200 bg-brand-50/70 px-4 py-3">
          <div>
            <p className="text-xs font-medium text-brand-900">Gaji bersih diterima (Take-Home Pay)</p>
            <p className="text-[11px] text-brand-800/80">Bruto PPh 21: {formatRupiah(doc.summary.pph21Gross)}</p>
          </div>
          <p className="font-mono text-xl font-semibold text-brand-900 tabular">{formatRupiah(doc.summary.netSalary)}</p>
        </div>

        {/* Kontribusi perusahaan (informasional) */}
        {doc.companyContributions.length > 0 && (
          <div className="mt-4 border-t border-line pt-3">
            <p className="mb-1.5 text-[11px] font-medium text-ink-subtle">
              Iuran ditanggung perusahaan (tidak mengurangi gaji):
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-muted">
              {doc.companyContributions.map((c, i) => (
                <span key={`${c.code}-${i}`}>
                  {c.name}: <span className="font-mono tabular">{formatRupiah(c.amount)}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </article>
    </div>
  );
}
