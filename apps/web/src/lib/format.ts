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

/** Hitung lama masa kerja singkat (misal "2 thn 4 bln" atau "5 bln"). */
export function formatTenure(joinDate: string, endDate?: string | null): string {
  const start = new Date(`${joinDate.slice(0, 10)}T00:00:00Z`);
  const end = new Date(`${(endDate ?? todayISO()).slice(0, 10)}T00:00:00Z`);
  let months = (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + (end.getUTCMonth() - start.getUTCMonth());
  if (end.getUTCDate() < start.getUTCDate()) months -= 1;
  if (months < 1) return '< 1 bulan';
  const years = Math.floor(months / 12);
  const rem = months % 12;
  if (years === 0) return `${rem} bln`;
  if (rem === 0) return `${years} thn`;
  return `${years} thn ${rem} bln`;
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
    view_sensitive: 'Lihat sensitif',
    export: 'Ekspor',
    login: 'Login',
  },
  auditTable: {
    employees: 'Data karyawan',
    employee_history: 'Riwayat karyawan',
    employee_salary_components: 'Komponen gaji karyawan',
    salary_components: 'Katalog komponen gaji',
    users: 'Akun user',
    user_roles: 'Role user',
    departments: 'Departemen',
    positions: 'Jabatan',
    work_locations: 'Lokasi kerja',
    companies: 'Profil perusahaan',
    company_settings: 'Pengaturan perusahaan',
    attendance: 'Absensi',
    attendance_corrections: 'Koreksi absensi',
    shifts: 'Master shift',
    shift_schedules: 'Jadwal shift',
    holidays: 'Hari libur',
    leave_types: 'Jenis cuti',
    leave_balances: 'Saldo cuti',
    leave_requests: 'Pengajuan cuti',
    overtime_entries: 'Pengajuan lembur',
    approval_workflows: 'Alur persetujuan',
    approval_logs: 'Log persetujuan',
    approval_delegations: 'Delegasi persetujuan',
  } as Record<string, string>,
  attendanceStatus: {
    present: 'Hadir',
    late: 'Terlambat',
    absent: 'Alpha',
    on_leave: 'Cuti',
    half_day_leave: 'Cuti ½ hari',
    sick: 'Sakit',
    permit: 'Izin',
    holiday: 'Libur',
    day_off: 'Hari istirahat',
  } as Record<string, string>,
  requestStatus: {
    pending: 'Menunggu',
    approved: 'Disetujui',
    rejected: 'Ditolak',
    cancelled: 'Dibatalkan',
  } as Record<string, string>,
  overtimeDayType: {
    workday: 'Hari kerja',
    rest_day: 'Hari istirahat',
    holiday: 'Hari libur nasional',
    holiday_shortest_day: 'Hari libur (hari terpendek)',
  } as Record<string, string>,
  holidayType: {
    national: 'Libur nasional',
    collective_leave: 'Cuti bersama',
    company: 'Libur perusahaan',
  } as Record<string, string>,
  approvalRequestType: {
    leave: 'Cuti',
    overtime: 'Lembur',
    attendance_correction: 'Koreksi absensi',
    reimbursement: 'Reimbursement',
    payroll: 'Payroll',
  } as Record<string, string>,
} as const;

export const PTKP_STATUSES = ['TK/0', 'TK/1', 'TK/2', 'TK/3', 'K/0', 'K/1', 'K/2', 'K/3'];

export const TIMEZONES = [
  { value: 'Asia/Jakarta', label: 'WIB — Asia/Jakarta' },
  { value: 'Asia/Makassar', label: 'WITA — Asia/Makassar' },
  { value: 'Asia/Jayapura', label: 'WIT — Asia/Jayapura' },
];
