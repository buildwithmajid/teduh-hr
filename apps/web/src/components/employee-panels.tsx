'use client';

import { Badge, DescriptionList, EmptyState, Table, Td, Th } from '@/components/ui';
import { formatDate, formatRupiah, formatTenure, LABELS } from '@/lib/format';
import type { EmployeeSensitive, EmployeeSummary, SalaryAssignment } from '@/lib/types';

function Group({ title, items }: { title: string; items: { label: string; value: React.ReactNode }[] }) {
  return (
    <section className="py-5 first:pt-0 last:pb-0">
      <h3 className="mb-3.5 text-xs font-semibold uppercase tracking-wider text-brand-700">{title}</h3>
      <DescriptionList items={items} />
    </section>
  );
}

export function EmployeeSummaryList({ e }: { e: EmployeeSummary }) {
  return (
    <div className="divide-y divide-line">
      <Group
        title="Kepegawaian"
        items={[
          { label: 'Kode karyawan', value: <span className="font-mono text-xs">{e.employeeCode}</span> },
          { label: 'Departemen', value: e.department.name },
          { label: 'Jabatan', value: e.position.title },
          {
            label: 'Atasan langsung',
            value: e.supervisor ? `${e.supervisor.fullName} (${e.supervisor.employeeCode})` : '—',
          },
          { label: 'Lokasi kerja', value: e.workLocation?.name ?? 'Bebas lokasi (remote)' },
          { label: 'Tipe kontrak', value: LABELS.contractType[e.contractType] },
          {
            label: 'Tanggal masuk',
            value: (
              <span className="tabular">
                {formatDate(e.joinDate)}{' '}
                <span className="text-xs text-ink-muted">({formatTenure(e.joinDate, e.resignDate)})</span>
              </span>
            ),
          },
          { label: 'Akhir kontrak', value: formatDate(e.contractEndDate) },
          { label: 'Akhir masa percobaan', value: formatDate(e.probationEndDate) },
          ...(e.resignDate ? [{ label: 'Tanggal keluar', value: formatDate(e.resignDate) }] : []),
          {
            label: 'Akun login',
            value: e.hasUserAccount ? <Badge tone="green" dot>Terhubung</Badge> : <Badge>Belum ada</Badge>,
          },
        ]}
      />

      <Group
        title="Identitas pribadi"
        items={[
          { label: 'Jenis kelamin', value: LABELS.gender[e.gender] },
          { label: 'Tanggal lahir', value: formatDate(e.birthDate) },
          { label: 'Agama', value: e.religion ?? '—' },
        ]}
      />

      <Group
        title="Pajak & pola kerja"
        items={[
          { label: 'Status PTKP', value: <span className="font-mono font-medium">{e.ptkpStatus}</span> },
          { label: 'Pola kerja', value: e.workPattern ? LABELS.workPattern[e.workPattern] : 'Ikuti perusahaan' },
          {
            label: 'Berhak lembur',
            value: e.overtimeEligible === null ? 'Ikuti jabatan' : e.overtimeEligible ? 'Ya' : 'Tidak',
          },
        ]}
      />

      <Group
        title="Perbankan & BPJS"
        items={[
          { label: 'Bank', value: e.bankName ?? '—' },
          {
            label: 'BPJS Kesehatan',
            value: e.bpjsKesehatanNumber ? <span className="font-mono text-xs">{e.bpjsKesehatanNumber}</span> : '—',
          },
          {
            label: 'BPJS Ketenagakerjaan',
            value: e.bpjsTkNumber ? <span className="font-mono text-xs">{e.bpjsTkNumber}</span> : '—',
          },
          { label: 'Keluarga BPJS tambahan', value: <span className="tabular">{e.bpjsExtraFamilyMembers} orang</span> },
        ]}
      />
    </div>
  );
}

export function SensitiveList({ e }: { e: EmployeeSensitive }) {
  return (
    <DescriptionList
      columns={2}
      items={[
        { label: 'NIK', value: <span className="font-mono text-sm tracking-wide">{e.nik}</span> },
        {
          label: 'Gaji pokok',
          value: <span className="font-mono text-base font-semibold text-ink tabular">{formatRupiah(e.baseSalary)}</span>,
        },
        {
          label: 'Nomor rekening',
          value: e.bankAccountNumber ? (
            <span className="font-mono text-sm tracking-wide">{e.bankAccountNumber}</span>
          ) : (
            '—'
          ),
        },
        {
          label: 'NPWP',
          value: e.npwp ? (
            <span className="font-mono text-sm tracking-wide">{e.npwp}</span>
          ) : (
            <span className="text-ink-muted">Sama dengan NIK</span>
          ),
        },
      ]}
    />
  );
}

export function SalaryComponentsTable({
  rows,
  renderAction,
}: {
  rows: SalaryAssignment[];
  renderAction?: (row: SalaryAssignment) => React.ReactNode;
}) {
  if (rows.length === 0) return <EmptyState title="Belum ada komponen gaji" description="Tetapkan tunjangan atau potongan untuk karyawan ini." />;
  return (
    <Table>
      <thead>
        <tr>
          <Th>Komponen</Th>
          <Th>Jenis</Th>
          <Th className="text-right">Nominal</Th>
          <Th>Masa berlaku</Th>
          {renderAction && <Th />}
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {rows.map((r) => {
          const ended = r.effectiveTo !== null;
          return (
            <tr key={r.id} className={ended ? 'bg-canvas/40 text-ink-subtle' : 'hover:bg-canvas/50'}>
              <Td>
                <span className={ended ? 'text-ink-muted' : 'font-medium text-ink'}>{r.component.name}</span>
                <div className="mt-1 flex flex-wrap gap-1">
                  {r.component.isFixed && <Badge tone="brand">Tetap</Badge>}
                  {ended && <Badge>Berakhir</Badge>}
                </div>
              </Td>
              <Td className="text-ink-muted">{LABELS.componentType[r.component.type]}</Td>
              <Td className="whitespace-nowrap text-right font-mono text-[13px] font-medium">
                {formatRupiah(r.amount)}
                {r.component.calculation === 'per_attendance_day' && (
                  <span className="font-sans text-xs font-normal text-ink-muted"> /hari</span>
                )}
              </Td>
              <Td className="whitespace-nowrap text-xs text-ink-muted">
                {formatDate(r.effectiveFrom)} – {r.effectiveTo ? formatDate(r.effectiveTo) : 'sekarang'}
              </Td>
              {renderAction && <Td className="text-right">{!ended && renderAction(r)}</Td>}
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}
