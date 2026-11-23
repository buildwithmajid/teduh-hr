import { AttendanceStatus, HolidayType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export class ClockDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  deviceFingerprint?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class AttendanceListQuery {
  @IsOptional()
  @Matches(DATE_RE)
  from?: string;

  @IsOptional()
  @Matches(DATE_RE)
  to?: string;

  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @IsOptional()
  @IsEnum(AttendanceStatus)
  status?: AttendanceStatus;
}

export class CreateShiftDto {
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  name: string;

  @Matches(HHMM_RE, { message: 'Jam mulai harus berformat HH:MM' })
  startTime: string;

  @Matches(HHMM_RE, { message: 'Jam selesai harus berformat HH:MM' })
  endTime: string;

  @IsOptional()
  @IsBoolean()
  isOvernight?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(120)
  lateToleranceMinutes?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(24)
  workHours: number;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateShiftDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  name?: string;

  @IsOptional()
  @Matches(HHMM_RE)
  startTime?: string;

  @IsOptional()
  @Matches(HHMM_RE)
  endTime?: string;

  @IsOptional()
  @IsBoolean()
  isOvernight?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(120)
  lateToleranceMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(24)
  workHours?: number;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class AssignScheduleDto {
  @IsUUID()
  employeeId: string;

  @Matches(DATE_RE)
  date: string;

  @IsOptional()
  @IsUUID()
  shiftId?: string | null;
}

export class CreateHolidayDto {
  @Matches(DATE_RE)
  date: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @IsEnum(HolidayType)
  type: HolidayType;

  @IsOptional()
  @IsBoolean()
  deductsAnnualLeave?: boolean;
}

export class CreateCorrectionDto {
  @Matches(DATE_RE)
  workDate: string;

  @IsOptional()
  @IsDateString()
  requestedClockIn?: string;

  @IsOptional()
  @IsDateString()
  requestedClockOut?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;
}

export class ApprovalDecisionDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
