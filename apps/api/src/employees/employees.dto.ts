import { ContractType, EmploymentStatus, Gender, SalaryComponentCalculation, SalaryComponentType, WorkPattern } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { DATE_ONLY_MESSAGE, DATE_ONLY_REGEX, PaginationQuery, PTKP_STATUSES } from '../common/validation';

const MAX_SALARY = 10_000_000_000; // Rp10 miliar/bulan — batas wajar untuk mencegah salah ketik

export class CreateEmployeeDto {
  @IsString()
  @Matches(/^[A-Za-z0-9-]{1,20}$/, { message: 'employeeCode hanya huruf, angka, dan "-" (maks 20)' })
  employeeCode: string;

  @IsString()
  @MinLength(2)
  @MaxLength(255)
  fullName: string;

  @Matches(/^\d{16}$/, { message: 'NIK harus 16 digit angka' })
  nik: string;

  @IsEnum(Gender)
  gender: Gender;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  religion?: string;

  @Matches(DATE_ONLY_REGEX, { message: DATE_ONLY_MESSAGE })
  birthDate: string;

  @Matches(DATE_ONLY_REGEX, { message: DATE_ONLY_MESSAGE })
  joinDate: string;

  @IsOptional()
  @Matches(DATE_ONLY_REGEX, { message: DATE_ONLY_MESSAGE })
  probationEndDate?: string;

  @IsOptional()
  @Matches(DATE_ONLY_REGEX, { message: DATE_ONLY_MESSAGE })
  contractEndDate?: string;

  @IsEnum(ContractType)
  contractType: ContractType;

  @IsUUID()
  departmentId: string;

  @IsUUID()
  positionId: string;

  @IsOptional()
  @IsUUID()
  supervisorId?: string;

  @IsOptional()
  @IsUUID()
  workLocationId?: string;

  @IsOptional()
  @IsEnum(WorkPattern)
  workPattern?: WorkPattern;

  @IsOptional()
  @IsBoolean()
  overtimeEligible?: boolean;

  @IsIn(PTKP_STATUSES)
  ptkpStatus: string;

  @IsInt()
  @Min(0)
  @Max(MAX_SALARY)
  baseSalary: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  bankName?: string;

  @IsOptional()
  @Matches(/^\d{5,30}$/, { message: 'Nomor rekening harus 5–30 digit angka' })
  bankAccountNumber?: string;

  @IsOptional()
  @Matches(/^\d{15,16}$/, { message: 'NPWP harus 15 atau 16 digit angka' })
  npwp?: string;

  @IsOptional()
  @Matches(/^\d{1,30}$/, { message: 'Nomor BPJS Kesehatan harus angka' })
  bpjsKesehatanNumber?: string;

  @IsOptional()
  @Matches(/^\d{1,30}$/, { message: 'Nomor BPJS Ketenagakerjaan harus angka' })
  bpjsTkNumber?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(20)
  bpjsExtraFamilyMembers?: number;
}

/** Perubahan data non-sensitif. Field organisasi & PTKP dicatat di employee_history. */
export class UpdateEmployeeDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  fullName?: string;

  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  religion?: string | null;

  @IsOptional()
  @Matches(DATE_ONLY_REGEX, { message: DATE_ONLY_MESSAGE })
  birthDate?: string;

  @IsOptional()
  @Matches(DATE_ONLY_REGEX, { message: DATE_ONLY_MESSAGE })
  probationEndDate?: string | null;

  @IsOptional()
  @Matches(DATE_ONLY_REGEX, { message: DATE_ONLY_MESSAGE })
  contractEndDate?: string | null;

  @IsOptional()
  @IsEnum(ContractType)
  contractType?: ContractType;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsUUID()
  positionId?: string;

  @IsOptional()
  @IsUUID()
  supervisorId?: string | null;

  @IsOptional()
  @IsUUID()
  workLocationId?: string | null;

  @IsOptional()
  @IsEnum(WorkPattern)
  workPattern?: WorkPattern | null;

  @IsOptional()
  @IsBoolean()
  overtimeEligible?: boolean | null;

  @IsOptional()
  @IsIn(PTKP_STATUSES)
  ptkpStatus?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  bankName?: string | null;

  @IsOptional()
  @Matches(/^\d{1,30}$/, { message: 'Nomor BPJS Kesehatan harus angka' })
  bpjsKesehatanNumber?: string | null;

  @IsOptional()
  @Matches(/^\d{1,30}$/, { message: 'Nomor BPJS Ketenagakerjaan harus angka' })
  bpjsTkNumber?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(20)
  bpjsExtraFamilyMembers?: number;

  /** Tanggal efektif perubahan organisasi/PTKP (default: hari ini). */
  @IsOptional()
  @Matches(DATE_ONLY_REGEX, { message: DATE_ONLY_MESSAGE })
  effectiveDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class UpdateSensitiveDto {
  @IsOptional()
  @Matches(/^\d{16}$/, { message: 'NIK harus 16 digit angka' })
  nik?: string;

  @IsOptional()
  @Matches(/^\d{5,30}$/, { message: 'Nomor rekening harus 5–30 digit angka' })
  bankAccountNumber?: string | null;

  @IsOptional()
  @Matches(/^\d{15,16}$/, { message: 'NPWP harus 15 atau 16 digit angka' })
  npwp?: string | null;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;
}

export class SalaryChangeDto {
  @IsInt()
  @Min(0)
  @Max(MAX_SALARY)
  baseSalary: number;

  @Matches(DATE_ONLY_REGEX, { message: DATE_ONLY_MESSAGE })
  effectiveDate: string;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;
}

export class TerminateEmployeeDto {
  @IsIn([EmploymentStatus.resigned, EmploymentStatus.terminated])
  status: 'resigned' | 'terminated';

  @Matches(DATE_ONLY_REGEX, { message: DATE_ONLY_MESSAGE })
  resignDate: string;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;
}

export class ListEmployeesQuery extends PaginationQuery {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsEnum(EmploymentStatus)
  status?: EmploymentStatus;
}

export class CreateSalaryComponentDto {
  @Matches(/^[a-z][a-z0-9_]{1,29}$/, { message: 'code: huruf kecil, angka, underscore (2–30)' })
  code: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @IsEnum(SalaryComponentType)
  type: SalaryComponentType;

  /** true = tunjangan tetap: masuk dasar BPJS & lembur. */
  @IsBoolean()
  isFixed: boolean;

  @IsOptional()
  @IsEnum(SalaryComponentCalculation)
  calculation?: SalaryComponentCalculation;

  @IsOptional()
  @IsBoolean()
  isTaxable?: boolean;
}

export class UpdateSalaryComponentDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsBoolean()
  isTaxable?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class AssignSalaryComponentDto {
  @IsUUID()
  componentId: string;

  /** Rupiah per bulan (fixed_amount) atau per hari hadir (per_attendance_day). */
  @IsInt()
  @Min(0)
  @Max(MAX_SALARY)
  amount: number;

  @Matches(DATE_ONLY_REGEX, { message: DATE_ONLY_MESSAGE })
  effectiveFrom: string;
}

export class EndSalaryComponentDto {
  @Matches(DATE_ONLY_REGEX, { message: DATE_ONLY_MESSAGE })
  effectiveTo: string;
}
