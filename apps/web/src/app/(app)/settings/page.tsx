'use client';

import { useQuery } from '@tanstack/react-query';
import { FormEvent } from 'react';
import { RequirePermission } from '@/components/app-shell';
import { Alert, Button, Card, CardHeader, Checkbox, Field, Input, PageHeader, Select, Spinner, Textarea } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { LABELS } from '@/lib/format';
import { useApiMutation } from '@/lib/mutation';
import type { Company, CompanySettings } from '@/lib/types';

export default function SettingsPage() {
  const { can } = useAuth();
  return (
    <RequirePermission anyOf={['settings.manage', 'company.manage']}>
      <PageHeader title="Pengaturan" description="Profil perusahaan dan kebijakan yang dipakai payroll, cuti, dan absensi." />
      <div className="space-y-6">
        <CompanyCard editable={can('company.manage')} />
        {can('settings.manage') && <PolicyCard />}
      </div>
    </RequirePermission>
  );
}

function CompanyCard({ editable }: { editable: boolean }) {
  const { reloadMe } = useAuth();
  const company = useQuery({ queryKey: ['company'], queryFn: () => api.get<Company>('/companies/current') });
  const save = useApiMutation((body: Record<string, unknown>) => api.patch('/companies/current', body), {
    invalidate: [['company']],
    success: 'Profil perusahaan disimpan',
    onDone: () => void reloadMe(),
  });

  return (
    <Card>
      <CardHeader title="Profil perusahaan" description={editable ? undefined : 'Hanya Super Admin yang bisa mengubah profil perusahaan.'} />
      {company.isPending ? (
        <Spinner />
      ) : company.isError ? (
        <div className="p-5">
          <Alert>{errorMessage(company.error)}</Alert>
        </div>
      ) : (
        <form
          className="grid gap-4 p-5 sm:grid-cols-2"
          onSubmit={(e: FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            save.mutate({
              name: f.get('name'),
              npwp: String(f.get('npwp') ?? '').trim() || null,
              address: String(f.get('address') ?? '').trim() || null,
            });
          }}
        >
          {save.isError && (
            <div className="sm:col-span-2">
              <Alert>{errorMessage(save.error)}</Alert>
            </div>
          )}
          <fieldset disabled={!editable} className="contents">
            <Field label="Nama perusahaan" required>
              {(id) => <Input id={id} name="name" required minLength={2} maxLength={255} defaultValue={company.data.name} />}
            </Field>
            <Field label="NPWP perusahaan" hint="Pemotong PPh 21">
              {(id) => <Input id={id} name="npwp" maxLength={30} defaultValue={company.data.npwp ?? ''} />}
            </Field>
            <Field label="Alamat" className="sm:col-span-2">
              {(id) => <Textarea id={id} name="address" maxLength={1000} defaultValue={company.data.address ?? ''} />}
            </Field>
          </fieldset>
          {editable && (
            <div className="sm:col-span-2">
              <Button type="submit" loading={save.isPending}>
                Simpan profil
              </Button>
            </div>
          )}
        </form>
      )}
    </Card>
  );
}

function PolicyCard() {
  const settings = useQuery({ queryKey: ['company-settings'], queryFn: () => api.get<CompanySettings>('/company-settings') });
  const save = useApiMutation((body: Record<string, unknown>) => api.patch('/company-settings', body), {
    invalidate: [['company-settings']],
    success: 'Pengaturan disimpan',
  });

  if (settings.isPending) return <Spinner />;
  if (settings.isError) return <Alert>{errorMessage(settings.error)}</Alert>;
  const s = settings.data;

  return (
    <form
      className="space-y-6"
      onSubmit={(e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const n = (k: string) => Number(f.get(k));
        save.mutate({
          riskClassJkk: f.get('riskClassJkk'),
          defaultWorkPattern: f.get('defaultWorkPattern'),
          prorataMethod: f.get('prorataMethod'),
          roundingMode: f.get('roundingMode'),
          minimumWage: n('minimumWage'),
          maxDeductionPct: n('maxDeductionPct') / 100,
          payrollCutoffDay: n('payrollCutoffDay'),
          payDay: n('payDay'),
          annualLeaveEligibilityMonths: n('annualLeaveEligibilityMonths'),
          annualLeaveProrata: f.get('annualLeaveProrata') === 'on',
          attendancePhotoRetentionDays: n('attendancePhotoRetentionDays'),
        });
      }}
    >
      {save.isError && <Alert>{errorMessage(save.error)}</Alert>}

      <Card>
        <CardHeader title="Payroll" description="Dipakai payroll engine (Fase 3). Perubahan tercatat di audit log." />
        <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Kelas risiko JKK" hint="Menentukan tarif iuran JKK (0,24%–1,74%)">
            {(id) => (
              <Select id={id} name="riskClassJkk" defaultValue={s.riskClassJkk}>
                {['I', 'II', 'III', 'IV', 'V'].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Pola kerja default" hint="Menentukan multiplier lembur hari libur">
            {(id) => (
              <Select id={id} name="defaultWorkPattern" defaultValue={s.defaultWorkPattern}>
                <option value="5_day">{LABELS.workPattern['5_day']}</option>
                <option value="6_day">{LABELS.workPattern['6_day']}</option>
              </Select>
            )}
          </Field>
          <Field label="Metode prorata gaji">
            {(id) => (
              <Select id={id} name="prorataMethod" defaultValue={s.prorataMethod}>
                <option value="working_days">{LABELS.prorata.working_days}</option>
                <option value="calendar_days">{LABELS.prorata.calendar_days}</option>
              </Select>
            )}
          </Field>
          <Field label="Pembulatan">
            {(id) => (
              <Select id={id} name="roundingMode" defaultValue={s.roundingMode}>
                {Object.entries(LABELS.rounding).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="UMK/UMP (Rp)" hint="Batas bawah dasar iuran BPJS Kesehatan">
            {(id) => <Input id={id} name="minimumWage" type="number" min={0} step={1} defaultValue={Number(s.minimumWage)} />}
          </Field>
          <Field label="Batas total potongan (%)" hint="Dari upah yang dibayarkan (PP 36/2021)">
            {(id) => (
              <Input id={id} name="maxDeductionPct" type="number" min={0} max={100} step="0.01" defaultValue={Number(s.maxDeductionPct) * 100} />
            )}
          </Field>
          <Field label="Tanggal cut-off absensi" hint="31 = akhir bulan">
            {(id) => <Input id={id} name="payrollCutoffDay" type="number" min={1} max={31} defaultValue={s.payrollCutoffDay} />}
          </Field>
          <Field label="Tanggal gajian">
            {(id) => <Input id={id} name="payDay" type="number" min={1} max={31} defaultValue={s.payDay} />}
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Cuti & absensi" />
        <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Masa kerja minimal cuti tahunan (bulan)" hint="Default UU Ketenagakerjaan: 12 bulan">
            {(id) => (
              <Input id={id} name="annualLeaveEligibilityMonths" type="number" min={0} max={24} defaultValue={s.annualLeaveEligibilityMonths} />
            )}
          </Field>
          <Field label="Retensi foto absensi (hari)" hint="Foto dihapus otomatis setelah masa ini (UU PDP)">
            {(id) => (
              <Input id={id} name="attendancePhotoRetentionDays" type="number" min={1} max={3650} defaultValue={s.attendancePhotoRetentionDays} />
            )}
          </Field>
          <div className="flex items-end">
            <Checkbox
              name="annualLeaveProrata"
              defaultChecked={s.annualLeaveProrata}
              label="Prorata cuti karyawan baru"
              description="Beri cuti tahunan prorata sebelum masa kerja minimal tercapai"
            />
          </div>
        </div>
      </Card>

      <div>
        <Button type="submit" loading={save.isPending}>
          Simpan pengaturan
        </Button>
      </div>
    </form>
  );
}
