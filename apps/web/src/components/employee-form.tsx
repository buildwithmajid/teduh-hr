'use client';

import { FormEvent, ReactNode, useState } from 'react';
import { Alert, Button, Card, CardHeader, Field, Input, Select, Textarea } from '@/components/ui';
import { LABELS, PTKP_STATUSES, todayISO } from '@/lib/format';
import { useActiveEmployees, useDepartments, usePositions, useWorkLocations } from '@/lib/queries';
import type { EmployeeSummary } from '@/lib/types';

type Mode = 'create' | 'edit';

interface Props {
  mode: Mode;
  initial?: EmployeeSummary;
  submitting: boolean;
  error: string | null;
  onSubmit: (payload: Record<string, unknown>) => void;
  onCancel: () => void;
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader title={title} description={description} />
      <div className="grid grid-cols-1 gap-4 px-5 py-5 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </Card>
  );
}

/**
 * Form karyawan untuk tambah & ubah. Data sensitif (NIK, rekening, NPWP) dan gaji pokok
 * hanya diisi saat tambah; perubahan berikutnya lewat aksi khusus yang tercatat di riwayat.
 */
export function EmployeeForm({ mode, initial, submitting, error, onSubmit, onCancel }: Props) {
  const departments = useDepartments();
  const positions = usePositions();
  const locations = useWorkLocations();
  const employees = useActiveEmployees();
  const [departmentId, setDepartmentId] = useState(initial?.department.id ?? '');
  const [contractType, setContractType] = useState<string>(initial?.contractType ?? 'permanent');

  const deptPositions = (positions.data ?? []).filter((p) => p.departmentId === departmentId);
  const supervisorOptions = (employees.data ?? []).filter((e) => e.id !== initial?.id);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const str = (k: string) => String(f.get(k) ?? '').trim();
    // Saat edit, field opsional yang dikosongkan dikirim null (menghapus nilai); saat tambah, dihilangkan.
    const opt = (k: string) => (str(k) === '' ? (mode === 'edit' ? null : undefined) : str(k));
    const bool = (k: string) => (str(k) === '' ? (mode === 'edit' ? null : undefined) : str(k) === 'true');

    const payload: Record<string, unknown> = {
      fullName: str('fullName'),
      gender: str('gender'),
      religion: opt('religion'),
      birthDate: str('birthDate'),
      contractType: str('contractType'),
      probationEndDate: opt('probationEndDate'),
      contractEndDate: opt('contractEndDate'),
      departmentId: str('departmentId'),
      positionId: str('positionId'),
      supervisorId: opt('supervisorId'),
      workLocationId: opt('workLocationId'),
      workPattern: opt('workPattern'),
      overtimeEligible: bool('overtimeEligible'),
      ptkpStatus: str('ptkpStatus'),
      bankName: opt('bankName'),
      bpjsKesehatanNumber: opt('bpjsKesehatanNumber'),
      bpjsTkNumber: opt('bpjsTkNumber'),
      bpjsExtraFamilyMembers: Number(str('bpjsExtraFamilyMembers') || 0),
    };

    if (mode === 'create') {
      Object.assign(payload, {
        employeeCode: str('employeeCode'),
        nik: str('nik'),
        joinDate: str('joinDate'),
        baseSalary: Number(str('baseSalary')),
        bankAccountNumber: opt('bankAccountNumber'),
        npwp: opt('npwp'),
      });
    } else {
      Object.assign(payload, { effectiveDate: str('effectiveDate'), reason: opt('reason') ?? undefined });
    }
    onSubmit(Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined)));
  }

  const v = initial;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && <Alert>{error}</Alert>}

      <Section title="Data pribadi">
        {mode === 'create' && (
          <Field label="Kode karyawan" required hint="Huruf, angka, dan tanda hubung. Contoh: EMP-0010">
            {(id) => <Input id={id} name="employeeCode" required maxLength={20} pattern="[A-Za-z0-9\-]+" />}
          </Field>
        )}
        <Field label="Nama lengkap" required className={mode === 'create' ? 'lg:col-span-2' : 'lg:col-span-3'}>
          {(id) => <Input id={id} name="fullName" required minLength={2} defaultValue={v?.fullName} />}
        </Field>
        {mode === 'create' && (
          <Field label="NIK" required hint="16 digit, disimpan terenkripsi">
            {(id) => <Input id={id} name="nik" required inputMode="numeric" pattern="\d{16}" maxLength={16} />}
          </Field>
        )}
        <Field label="Jenis kelamin" required>
          {(id) => (
            <Select id={id} name="gender" required defaultValue={v?.gender ?? ''}>
              <option value="" disabled>
                Pilih…
              </option>
              <option value="male">{LABELS.gender.male}</option>
              <option value="female">{LABELS.gender.female}</option>
            </Select>
          )}
        </Field>
        <Field label="Tanggal lahir" required>
          {(id) => <Input id={id} name="birthDate" type="date" required defaultValue={v?.birthDate} />}
        </Field>
        <Field label="Agama" hint="Dipakai untuk jadwal THR">
          {(id) => <Input id={id} name="religion" maxLength={30} defaultValue={v?.religion ?? ''} />}
        </Field>
        <Field label="Status PTKP" required hint="Kondisi per 1 Januari tahun berjalan">
          {(id) => (
            <Select id={id} name="ptkpStatus" required defaultValue={v?.ptkpStatus ?? 'TK/0'}>
              {PTKP_STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          )}
        </Field>
      </Section>

      <Section title="Kepegawaian">
        {mode === 'create' && (
          <Field label="Tanggal masuk" required>
            {(id) => <Input id={id} name="joinDate" type="date" required />}
          </Field>
        )}
        <Field label="Tipe kontrak" required>
          {(id) => (
            <Select id={id} name="contractType" required value={contractType} onChange={(e) => setContractType(e.target.value)}>
              {Object.entries(LABELS.contractType).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Akhir kontrak" required={contractType === 'contract'} hint="Wajib untuk PKWT">
          {(id) => (
            <Input id={id} name="contractEndDate" type="date" required={contractType === 'contract'} defaultValue={v?.contractEndDate ?? ''} />
          )}
        </Field>
        <Field label="Akhir masa percobaan">
          {(id) => <Input id={id} name="probationEndDate" type="date" defaultValue={v?.probationEndDate ?? ''} />}
        </Field>
        <Field label="Departemen" required>
          {(id) => (
            <Select id={id} name="departmentId" required value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
              <option value="" disabled>
                Pilih…
              </option>
              {departments.data?.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Jabatan" required>
          {(id) => (
            <Select
              id={id}
              name="positionId"
              required
              key={departmentId}
              defaultValue={v && v.department.id === departmentId ? v.position.id : ''}
              disabled={!departmentId}
            >
              <option value="" disabled>
                {departmentId ? (deptPositions.length ? 'Pilih…' : 'Belum ada jabatan di departemen ini') : 'Pilih departemen dulu'}
              </option>
              {deptPositions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Atasan langsung">
          {(id) => (
            <Select id={id} name="supervisorId" defaultValue={v?.supervisor?.id ?? ''}>
              <option value="">— Tidak ada —</option>
              {supervisorOptions.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.fullName} ({e.employeeCode})
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Lokasi kerja">
          {(id) => (
            <Select id={id} name="workLocationId" defaultValue={v?.workLocation?.id ?? ''}>
              <option value="">— Bebas lokasi (remote) —</option>
              {locations.data?.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Pola kerja">
          {(id) => (
            <Select id={id} name="workPattern" defaultValue={v?.workPattern ?? ''}>
              <option value="">Ikuti pengaturan perusahaan</option>
              <option value="5_day">{LABELS.workPattern['5_day']}</option>
              <option value="6_day">{LABELS.workPattern['6_day']}</option>
            </Select>
          )}
        </Field>
        <Field label="Berhak lembur">
          {(id) => (
            <Select id={id} name="overtimeEligible" defaultValue={v?.overtimeEligible === null || !v ? '' : String(v.overtimeEligible)}>
              <option value="">Ikuti jabatan</option>
              <option value="true">Ya</option>
              <option value="false">Tidak</option>
            </Select>
          )}
        </Field>
      </Section>

      <Section title="Gaji, bank & BPJS" description={mode === 'create' ? 'Gaji pokok, rekening, dan NPWP disimpan terenkripsi.' : 'Gaji pokok, rekening, dan NPWP diubah dari halaman detail.'}>
        {mode === 'create' && (
          <Field label="Gaji pokok (Rp / bulan)" required>
            {(id) => <Input id={id} name="baseSalary" type="number" min={0} step={1} required inputMode="numeric" />}
          </Field>
        )}
        <Field label="Nama bank">
          {(id) => <Input id={id} name="bankName" maxLength={100} defaultValue={v?.bankName ?? ''} />}
        </Field>
        {mode === 'create' && (
          <>
            <Field label="Nomor rekening">
              {(id) => <Input id={id} name="bankAccountNumber" inputMode="numeric" pattern="\d{5,30}" />}
            </Field>
            <Field label="NPWP" hint="Isi hanya jika berbeda dari NIK (15/16 digit)">
              {(id) => <Input id={id} name="npwp" inputMode="numeric" pattern="\d{15,16}" />}
            </Field>
          </>
        )}
        <Field label="No. BPJS Kesehatan">
          {(id) => <Input id={id} name="bpjsKesehatanNumber" inputMode="numeric" pattern="\d{1,30}" defaultValue={v?.bpjsKesehatanNumber ?? ''} />}
        </Field>
        <Field label="No. BPJS Ketenagakerjaan">
          {(id) => <Input id={id} name="bpjsTkNumber" inputMode="numeric" pattern="\d{1,30}" defaultValue={v?.bpjsTkNumber ?? ''} />}
        </Field>
        <Field label="Anggota keluarga BPJS tambahan" hint="Di luar tanggungan standar (iuran +1%/orang)">
          {(id) => <Input id={id} name="bpjsExtraFamilyMembers" type="number" min={0} max={20} defaultValue={v?.bpjsExtraFamilyMembers ?? 0} />}
        </Field>
      </Section>

      {mode === 'edit' && (
        <Section title="Keterangan perubahan" description="Perubahan departemen, jabatan, atasan, lokasi, PTKP, dan tipe kontrak dicatat di riwayat.">
          <Field label="Berlaku mulai" required>
            {(id) => <Input id={id} name="effectiveDate" type="date" required defaultValue={todayISO()} />}
          </Field>
          <Field label="Alasan" className="sm:col-span-1 lg:col-span-2">
            {(id) => <Textarea id={id} name="reason" maxLength={500} rows={2} placeholder="Misal: promosi, mutasi, perubahan status pernikahan" />}
          </Field>
        </Section>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          Batal
        </Button>
        <Button type="submit" loading={submitting}>
          {mode === 'create' ? 'Simpan karyawan' : 'Simpan perubahan'}
        </Button>
      </div>
    </form>
  );
}
