import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ProrataMethod, RoundingMode, WorkPattern } from '@prisma/client';

export class CreateCompanyDto {
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  npwp?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  address?: string;
}

export class UpdateCompanyDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  npwp?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  address?: string | null;
}

export class UpdateCompanySettingsDto {
  @IsOptional()
  @IsIn(['I', 'II', 'III', 'IV', 'V'])
  riskClassJkk?: string;

  @IsOptional()
  @IsEnum(WorkPattern)
  defaultWorkPattern?: WorkPattern;

  @IsOptional()
  @IsEnum(ProrataMethod)
  prorataMethod?: ProrataMethod;

  @IsOptional()
  @IsEnum(RoundingMode)
  roundingMode?: RoundingMode;

  @IsOptional()
  @IsInt()
  @Min(0)
  minimumWage?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 5 })
  @Min(0)
  @Max(1)
  maxDeductionPct?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  payrollCutoffDay?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  payDay?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(24)
  annualLeaveEligibilityMonths?: number;

  @IsOptional()
  @IsBoolean()
  annualLeaveProrata?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  attendancePhotoRetentionDays?: number;
}

export class CreateDepartmentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsUUID()
  parentDepartmentId?: string | null;

  @IsOptional()
  @IsUUID()
  headEmployeeId?: string | null;
}

export class UpdateDepartmentDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsUUID()
  parentDepartmentId?: string | null;

  @IsOptional()
  @IsUUID()
  headEmployeeId?: string | null;
}

export class CreatePositionDto {
  @IsUUID()
  departmentId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  title: string;

  @IsInt()
  @Min(1)
  @Max(20)
  level: number;

  @IsOptional()
  @IsBoolean()
  overtimeEligible?: boolean;
}

export class UpdatePositionDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  title?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  level?: number;

  @IsOptional()
  @IsBoolean()
  overtimeEligible?: boolean;
}

export class CreateWorkLocationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @Type(() => Number)
  @IsLatitude()
  latitude: number;

  @Type(() => Number)
  @IsLongitude()
  longitude: number;

  @IsInt()
  @Min(10)
  @Max(10_000)
  radiusMeters: number;

  /** Nama zona waktu IANA, misal Asia/Jakarta, Asia/Makassar, Asia/Jayapura. */
  @IsString()
  @MaxLength(40)
  timezone: string;
}

export class UpdateWorkLocationDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  longitude?: number;

  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(10_000)
  radiusMeters?: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  timezone?: string;
}
