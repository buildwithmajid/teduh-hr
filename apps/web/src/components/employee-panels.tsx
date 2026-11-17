'use client';

import { Badge, DescriptionList, EmptyState, Table, Td, Th } from '@/components/ui';
import { formatDate, formatRupiah, LABELS } from '@/lib/format';
import type { EmployeeSensitive, EmployeeSummary, SalaryAssignment } from '@/lib/types';

export function EmployeeSummaryList({ e }: { e: EmployeeSummary }) {
  return (
    <DescriptionList
      items={[
        { label: 'Kode', value: e.employeeCode },
        { label: 'Departemen', value: e.department.name },
        { label: 'Jabatan', value: e.position.title },
        { label: 'Atasan', value: e.supervisor ? `${e.supervisor.fullName} (${e.supervisor.employeeCode})` : '—' },
        { label: 'Lokasi kerja', value: e.workLocation?.name ?? 'Bebas lokasi' },
        { label: 'Tipe kontrak', value: LABELS.contractType[e.contractType] },
        { label: 'Tanggal masuk', value: formatDate(e.joinDate) },
        { label: 'Akhir kontrak', value: formatDate(e.contractEndDate) },
        { label: 'Akhir masa percobaan', value: formatDate(e.probationEndDate) },
        ...(e.resignDate ? [{ label: 'Tanggal keluar', value: formatDate(e.resignDate) }] : []),
        { label: 'Jenis kelamin', value: LABELS.gender[e.gender] },
        { label: 'Tanggal lahir', value: formatDate(e.birthDate) },
        { label: 'Agama', value: e.religion ?? '—' },
        { label: 'Status PTKP', value: e.ptkpStatus },
        { label: 'Pola kerja', value: e.workPattern ? LABELS.workPattern[e.workPattern] : 'Ikut perusahaan' },
        { label: 'Berhak lembur', value: e.overtimeEligible === null ? 'Ikut jabatan' : e.overtimeEligible ? 'Ya' : 'Tidak' },
        { label: 'Bank', value: e.bankName ?? '—' },
        { label: 'BPJS Kesehatan', value: e.bpjsKesehatanNumber ?? '—' },
        { label: 'BPJS Ketenagakerjaan', value: e.bpjsTkNumber ?? '—' },
        { label: 'Keluarga BPJS tambahan', value: String(e.bpjsExtraFamilyMembers) },
        { label: 'Akun login', value: e.hasUserAccount ? 'Ada' : 'Belum ada' },
      ]}
    />
  );
}

export function SensitiveList({ e }: { e: EmployeeSensitive }) {
  return (
    <DescriptionList
      items={[
        { label: 'NIK', value: <span className="font-mono">{e.nik}</span> },
        { label: 'Gaji pokok', value: <span className="font-medium">{formatRupiah(e.baseSalary)}</span> },
        { label: 'Nomor rekening', value: e.bankAccountNumber ? <span className="font-mono">{e.bankAccountNumber}</span> : '—' },
        { label: 'NPWP', value: e.npwp ? <span className="font-mono">{e.npwp}</span> : 'Sama dengan NIK' },
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
  if (rows.length === 0) return <EmptyState title="Belum ada komponen gaji" />;
  return (
    <Table>
      <thead className="bg-slate-50">
        <tr>
          <Th>Komponen</Th>
          <Th>Jenis</Th>
          <Th className="text-right">Nominal</Th>
          <Th>Berlaku</Th>
          {renderAction && <Th />}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {rows.map((r) => {
          const ended = r.effectiveTo !== null;
          return (
            <tr key={r.id} className={ended ? 'text-slate-400' : undefined}>
              <Td>
                <span className={ended ? 'text-slate-500' : 'font-medium text-slate-900'}>{r.component.name}</span>
                <div className="mt-1 flex flex-wrap gap-1">
                  {r.component.isFixed && <Badge tone="brand">Tetap</Badge>}
                  {ended && <Badge>Berakhir</Badge>}
                </div>
              </Td>
              <Td>{LABELS.componentType[r.component.type]}</Td>
              <Td className="whitespace-nowrap text-right font-mono">
                {formatRupiah(r.amount)}
                {r.component.calculation === 'per_attendance_day' && <span className="text-xs text-slate-500"> /hari</span>}
              </Td>
              <Td className="whitespace-nowrap">
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
