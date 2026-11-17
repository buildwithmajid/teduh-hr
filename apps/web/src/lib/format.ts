const rupiah = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
const dateFmt = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const dateTimeFmt = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' });

export function formatRupiah(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  return rupiah.format(Number(value));
}

/** Untuk tanggal "YYYY-MM-DD" (tanpa jam). */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  return dateFmt.format(new Date(`${value.slice(0, 10)}T00:00:00Z`));
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  return dateTimeFmt.format(new Date(value));
}

export function todayISO(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
}

export const LABELS = {
  gender: { male: 'Laki-laki', female: 'Perempuan' },
  employmentStatus: { active: 'Aktif', resigned: 'Resign', terminated: 'PHK' },
  contractType: { permanent: 'Tetap (PKWTT)', contract: 'Kontrak (PKWT)', intern: 'Magang', probation: 'Masa percobaan' },
  workPattern: { '5_day': '5 hari kerja', '6_day': '6 hari kerja' },
  componentType: { earning: 'Pendapatan', deduction: 'Potongan' },
  calculation: { fixed_amount: 'Nominal tetap / bulan', per_attendance_day: 'Per hari hadir' },
  prorata: { working_days: 'Hari kerja', calendar_days: 'Hari kalender' },
  rounding: { round_half_up: 'Pembulatan normal', floor: 'Bulatkan ke bawah', ceil: 'Bulatkan ke atas' },
  role: {
    super_admin: 'Super Admin',
    hr_admin: 'HR Admin',
    finance: 'Finance',
    manager: 'Manager',
    staff: 'Staff',
  } as Record<string, string>,
  historyField: {
    base_salary: 'Gaji pokok',
    department_id: 'Departemen',
    position_id: 'Jabatan',
    supervisor_id: 'Atasan',
    work_location_id: 'Lokasi kerja',
    ptkp_status: 'Status PTKP',
    contract_type: 'Tipe kontrak',
    employment_status: 'Status kepegawaian',
    nik: 'NIK',
    bank_account: 'Rekening bank',
    npwp: 'NPWP',
  } as Record<string, string>,
  auditAction: {
    create: 'Dibuat',
    update: 'Diubah',
    delete: 'Dihapus',
    view_sensitive: 'Lihat data sensitif',
    export: 'Ekspor',
    login: 'Login',
  },
} as const;

export const PTKP_STATUSES = ['TK/0', 'TK/1', 'TK/2', 'TK/3', 'K/0', 'K/1', 'K/2', 'K/3'];

export const TIMEZONES = [
  { value: 'Asia/Jakarta', label: 'WIB — Asia/Jakarta' },
  { value: 'Asia/Makassar', label: 'WITA — Asia/Makassar' },
  { value: 'Asia/Jayapura', label: 'WIT — Asia/Jayapura' },
];
