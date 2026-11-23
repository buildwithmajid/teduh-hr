/**
 * Katalog permission & role bawaan. Dipakai oleh seed dan menjadi dokumentasi
 * hak akses Fase 1 & Fase 2. Role bawaan (company_id NULL) di-sync dari daftar ini.
 */
export const PERMISSIONS = {
  'company.create': 'Membuat perusahaan baru (platform)',
  'company.manage': 'Mengubah profil perusahaan',
  'settings.manage': 'Mengubah pengaturan perusahaan (payroll, cuti, absensi)',
  'department.view': 'Melihat struktur departemen & jabatan',
  'department.manage': 'Mengelola departemen',
  'position.manage': 'Mengelola jabatan',
  'location.view': 'Melihat lokasi kerja',
  'location.manage': 'Mengelola lokasi kerja & geofence',
  'employee.view': 'Melihat data karyawan (non-sensitif)',
  'employee.view_team': 'Melihat data bawahan langsung',
  'employee.view_sensitive': 'Melihat NIK, rekening, NPWP, gaji, dan riwayatnya',
  'employee.manage': 'Menambah/mengubah/menonaktifkan karyawan',
  'employee.manage_sensitive': 'Mengubah NIK, rekening, NPWP',
  'salary.view': 'Melihat katalog komponen gaji',
  'salary.manage': 'Mengelola gaji pokok & komponen gaji',
  'user.manage': 'Mengelola akun user & role',
  'audit.view': 'Melihat audit log perusahaan',
  'audit.verify': 'Memverifikasi rantai hash audit log (lintas perusahaan)',
  // Fase 2 — Absensi, Cuti, Lembur, Approval
  'shift.manage': 'Mengelola master shift & jadwal shift karyawan',
  'holiday.manage': 'Mengelola kalender hari libur & cuti bersama',
  'attendance.view': 'Melihat rekap absensi seluruh karyawan',
  'attendance.view_team': 'Melihat kehadiran bawahan langsung',
  'attendance.manage': 'Mengelola & mengoreksi absensi karyawan',
  'leave.view': 'Melihat pengajuan & saldo cuti seluruh karyawan',
  'leave.manage': 'Mengelola jenis cuti & kebijakan cuti',
  'leave.adjust_balance': 'Menyesuaikan saldo cuti karyawan secara manual',
  'overtime.view': 'Melihat pengajuan lembur seluruh karyawan',
  'overtime.manage': 'Mengelola data lembur karyawan',
  'approval.manage': 'Mengelola konfigurasi alur persetujuan (workflow)',
} as const;

export type PermissionCode = keyof typeof PERMISSIONS;

const ALL = Object.keys(PERMISSIONS) as PermissionCode[];

export interface SystemRoleDefinition {
  name: string;
  description: string;
  requiresMfa: boolean;
  permissions: PermissionCode[];
}

export const SYSTEM_ROLES: SystemRoleDefinition[] = [
  {
    name: 'super_admin',
    description: 'Konfigurasi sistem, role, dan akses',
    requiresMfa: true,
    permissions: ALL,
  },
  {
    name: 'hr_admin',
    description: 'Kelola data karyawan, organisasi, absensi, cuti, dan kebijakan',
    requiresMfa: true,
    permissions: ALL.filter((p) => !['company.create', 'company.manage', 'audit.verify'].includes(p)),
  },
  {
    name: 'finance',
    description: 'Verifikasi payroll & laporan biaya',
    requiresMfa: true,
    permissions: [
      'department.view',
      'location.view',
      'employee.view',
      'employee.view_sensitive',
      'salary.view',
      'attendance.view',
      'leave.view',
      'overtime.view',
      'audit.view',
    ],
  },
  {
    name: 'manager',
    description: 'Atasan langsung: lihat & approve tim',
    requiresMfa: false,
    permissions: ['department.view', 'location.view', 'employee.view_team', 'attendance.view_team'],
  },
  {
    name: 'staff',
    description: 'Karyawan',
    requiresMfa: false,
    permissions: ['department.view', 'location.view'],
  },
];
