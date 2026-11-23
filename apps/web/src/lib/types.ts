// Bentuk respons API (lihat apps/api). Hanya field yang dipakai UI.

export type WorkPattern = '5_day' | '6_day';
export type Gender = 'male' | 'female';
export type EmploymentStatus = 'active' | 'resigned' | 'terminated';
export type ContractType = 'permanent' | 'contract' | 'intern' | 'probation';

export interface Me {
  id: string;
  email: string;
  mfaEnabled: boolean;
  lastLoginAt: string | null;
  company: { id: string; name: string };
  employee: { id: string; fullName: string; employeeCode: string } | null;
  roles: string[];
  permissions: string[];
  companies: { id: string; name: string }[];
}

export type LoginResponse =
  | { status: 'ok'; accessToken: string; expiresIn: number }
  | { status: 'mfa_required' | 'mfa_setup_required'; mfaToken: string }
  | { status: 'company_selection_required'; companies: { id: string; name: string }[] };

export interface Ref {
  id: string;
  name: string;
}

export interface EmployeeSummary {
  id: string;
  employeeCode: string;
  fullName: string;
  gender: Gender;
  religion: string | null;
  birthDate: string;
  joinDate: string;
  probationEndDate: string | null;
  contractEndDate: string | null;
  resignDate: string | null;
  employmentStatus: EmploymentStatus;
  contractType: ContractType;
  workPattern: WorkPattern | null;
  overtimeEligible: boolean | null;
  ptkpStatus: string;
  department: { id: string; name: string };
  position: { id: string; title: string; level: number };
  supervisor: { id: string; fullName: string; employeeCode: string } | null;
  workLocation: { id: string; name: string; timezone: string } | null;
  bankName: string | null;
  bpjsKesehatanNumber: string | null;
  bpjsTkNumber: string | null;
  bpjsExtraFamilyMembers: number;
  hasUserAccount: boolean;
}

export interface EmployeeSensitive extends EmployeeSummary {
  nik: string;
  baseSalary: number;
  bankAccountNumber: string | null;
  npwp: string | null;
}

export interface SalaryAssignment {
  id: string;
  component: {
    id: string;
    code: string;
    name: string;
    type: 'earning' | 'deduction';
    isFixed: boolean;
    calculation: 'fixed_amount' | 'per_attendance_day';
  };
  amount: number;
  effectiveFrom: string;
  effectiveTo: string | null;
}

export interface MyProfile extends EmployeeSensitive {
  salaryComponents: SalaryAssignment[];
}

export interface HistoryEntry {
  id: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  effectiveDate: string;
  reason: string | null;
  changedBy: string | null;
  createdAt: string;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Department {
  id: string;
  name: string;
  parentDepartmentId: string | null;
  headEmployeeId: string | null;
  head: { id: string; fullName: string; employeeCode: string } | null;
  _count: { employees: number; positions: number; children: number };
}

export interface Position {
  id: string;
  departmentId: string;
  title: string;
  level: number;
  overtimeEligible: boolean;
  department: { id: string; name: string };
  _count: { employees: number };
}

export interface WorkLocation {
  id: string;
  name: string;
  latitude: string;
  longitude: string;
  radiusMeters: number;
  timezone: string;
}

export interface SalaryComponent {
  id: string;
  code: string;
  name: string;
  type: 'earning' | 'deduction';
  isFixed: boolean;
  calculation: 'fixed_amount' | 'per_attendance_day';
  isTaxable: boolean;
  isActive: boolean;
}

export interface Role {
  id: string;
  name: string;
  description: string | null;
  requiresMfa: boolean;
  isSystem: boolean;
  permissions: string[];
}

export interface UserRow {
  id: string;
  email: string;
  isActive: boolean;
  mfaEnabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  employee: { id: string; fullName: string; employeeCode: string } | null;
  roles: { id: string; name: string }[];
}

export interface Company {
  id: string;
  name: string;
  npwp: string | null;
  address: string | null;
}

export interface CompanySettings {
  riskClassJkk: string;
  defaultWorkPattern: WorkPattern;
  prorataMethod: 'working_days' | 'calendar_days';
  roundingMode: 'round_half_up' | 'floor' | 'ceil';
  minimumWage: string;
  maxDeductionPct: string;
  payrollCutoffDay: number;
  payDay: number;
  annualLeaveEligibilityMonths: number;
  annualLeaveProrata: boolean;
  attendancePhotoRetentionDays: number;
}

export interface AuditLog {
  id: string;
  userId: string | null;
  tableName: string;
  recordId: string;
  action: 'create' | 'update' | 'delete' | 'view_sensitive' | 'export' | 'login';
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

// ───────────── Fase 2 ─────────────

export type AttendanceStatus =
  | 'present'
  | 'late'
  | 'absent'
  | 'on_leave'
  | 'half_day_leave'
  | 'sick'
  | 'permit'
  | 'holiday'
  | 'day_off';

export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type OvertimeDayType = 'workday' | 'rest_day' | 'holiday' | 'holiday_shortest_day';
export type ApprovalRequestType = 'leave' | 'reimbursement' | 'payroll' | 'attendance_correction' | 'overtime';

export interface Shift {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  isOvernight: boolean;
  lateToleranceMinutes: number;
  workHours: string;
  isDefault: boolean;
}

export interface Holiday {
  id: string;
  companyId: string | null;
  date: string;
  name: string;
  type: 'national' | 'collective_leave' | 'company';
  deductsAnnualLeave: boolean;
}

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  workDate: string;
  clockInTime: string | null;
  clockOutTime: string | null;
  clockInDistanceM: number | null;
  clockOutDistanceM: number | null;
  lateMinutes: number;
  anomalyFlags: string[];
  status: AttendanceStatus;
  notes: string | null;
  shift?: Shift | null;
  employee?: { id: string; fullName: string; employeeCode: string; department: { name: string } };
}

export interface AttendanceToday {
  workDate: string;
  timezone: string;
  workLocation: {
    id: string;
    name: string;
    latitude: number;
    longitude: number;
    radiusMeters: number;
    timezone: string;
  } | null;
  shift: Shift | null;
  attendance: AttendanceRecord | null;
}

export interface AttendanceCorrection {
  id: string;
  workDate: string;
  requestedClockIn: string | null;
  requestedClockOut: string | null;
  reason: string;
  status: RequestStatus;
  currentApprovalStep: number;
  createdAt: string;
}

export interface LeaveType {
  id: string;
  code: string;
  name: string;
  defaultQuotaDays: string | null;
  isPaid: boolean;
  requiresDocument: boolean;
  genderRestriction: Gender | null;
  allowHalfDay: boolean;
  minServiceMonths: number;
  maxCarryOverDays: string;
  countsWorkingDaysOnly: boolean;
  isActive: boolean;
}

export interface LeaveBalance {
  id: string;
  year: number;
  quotaDays: number;
  carriedOverDays: number;
  usedDays: number;
  remainingDays: number;
  leaveType: LeaveType;
}

export interface LeaveRequest {
  id: string;
  startDate: string;
  endDate: string;
  isHalfDay: boolean;
  totalDays: number;
  reason: string;
  status: RequestStatus;
  currentApprovalStep: number;
  createdAt: string;
  leaveType: { id: string; code: string; name: string; isPaid: boolean };
  employee?: { id: string; fullName: string; employeeCode: string; department: { name: string } };
}

export interface OvertimeQuota {
  eligible: boolean;
  usedWeekHours: number;
  maxWeekHours: number;
  maxDayHours?: number;
  weekStart: string;
  weekEnd: string;
}

export interface OvertimeEntry {
  id: string;
  workDate: string;
  startTime: string;
  endTime: string;
  hours: number;
  dayType: OvertimeDayType;
  reason: string;
  status: RequestStatus;
  currentApprovalStep: number;
  createdAt: string;
  employee?: { id: string; fullName: string; employeeCode: string; department: { name: string } };
}

export interface PendingApproval {
  requestType: ApprovalRequestType;
  requestId: string;
  employee: { id: string; fullName: string; employeeCode: string; department: string };
  title: string;
  subtitle: string;
  reason: string;
  stepOrder: number;
  totalSteps: number;
  onBehalfOf: string | null;
  createdAt: string;
}

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  linkUrl: string | null;
  createdAt: string;
}
