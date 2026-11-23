-- Fase 2: Approval Workflow generik, Absensi (shift, jadwal, geofence, koreksi, libur),
-- Cuti & Izin, Lembur, dan Notifikasi In-App.

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('present', 'late', 'absent', 'on_leave', 'half_day_leave', 'sick', 'permit', 'holiday', 'day_off');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('pending', 'approved', 'rejected', 'cancelled');

-- CreateEnum
CREATE TYPE "HolidayType" AS ENUM ('national', 'collective_leave', 'company');

-- CreateEnum
CREATE TYPE "ApprovalRequestType" AS ENUM ('leave', 'reimbursement', 'payroll', 'attendance_correction', 'overtime');

-- CreateEnum
CREATE TYPE "ApproverType" AS ENUM ('direct_supervisor', 'department_head', 'role');

-- CreateEnum
CREATE TYPE "ApprovalAction" AS ENUM ('approved', 'rejected', 'escalated');

-- CreateEnum
CREATE TYPE "OvertimeDayType" AS ENUM ('workday', 'rest_day', 'holiday', 'holiday_shortest_day');

-- CreateTable
CREATE TABLE "approval_workflows" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "request_type" "ApprovalRequestType" NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "approval_workflows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_steps" (
    "id" UUID NOT NULL,
    "workflow_id" UUID NOT NULL,
    "step_order" INTEGER NOT NULL,
    "approver_type" "ApproverType" NOT NULL,
    "approver_role_id" UUID,
    "fallback_role_id" UUID,
    "escalate_after_hours" INTEGER,

    CONSTRAINT "approval_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_logs" (
    "id" UUID NOT NULL,
    "request_type" "ApprovalRequestType" NOT NULL,
    "request_id" UUID NOT NULL,
    "step_id" UUID NOT NULL,
    "approver_id" UUID NOT NULL,
    "on_behalf_of" UUID,
    "action" "ApprovalAction" NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_delegations" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "delegator_id" UUID NOT NULL,
    "delegate_id" UUID NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "request_types" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_delegations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shifts" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "start_time" VARCHAR(5) NOT NULL,
    "end_time" VARCHAR(5) NOT NULL,
    "is_overnight" BOOLEAN NOT NULL DEFAULT false,
    "late_tolerance_minutes" INTEGER NOT NULL DEFAULT 0,
    "work_hours" DECIMAL(4,2) NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_schedules" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "shift_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shift_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "shift_id" UUID,
    "work_date" DATE NOT NULL,
    "clock_in_time" TIMESTAMPTZ(6),
    "clock_out_time" TIMESTAMPTZ(6),
    "clock_in_lat" DECIMAL(9,6),
    "clock_in_lng" DECIMAL(9,6),
    "clock_out_lat" DECIMAL(9,6),
    "clock_out_lng" DECIMAL(9,6),
    "clock_in_distance_m" INTEGER,
    "clock_out_distance_m" INTEGER,
    "clock_in_photo_key" VARCHAR(500),
    "clock_out_photo_key" VARCHAR(500),
    "device_fingerprint" VARCHAR(255),
    "ip_address" VARCHAR(64),
    "late_minutes" INTEGER NOT NULL DEFAULT 0,
    "anomaly_flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "AttendanceStatus" NOT NULL DEFAULT 'present',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_corrections" (
    "id" UUID NOT NULL,
    "attendance_id" UUID,
    "employee_id" UUID NOT NULL,
    "work_date" DATE NOT NULL,
    "requested_clock_in" TIMESTAMPTZ(6),
    "requested_clock_out" TIMESTAMPTZ(6),
    "reason" TEXT NOT NULL,
    "workflow_id" UUID NOT NULL,
    "current_approval_step" INTEGER NOT NULL DEFAULT 1,
    "status" "RequestStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "attendance_corrections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holidays" (
    "id" UUID NOT NULL,
    "company_id" UUID,
    "date" DATE NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "type" "HolidayType" NOT NULL DEFAULT 'national',
    "deducts_annual_leave" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_types" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "default_quota_days" DECIMAL(5,2),
    "is_paid" BOOLEAN NOT NULL DEFAULT true,
    "requires_document" BOOLEAN NOT NULL DEFAULT false,
    "gender_restriction" "Gender",
    "allow_half_day" BOOLEAN NOT NULL DEFAULT false,
    "min_service_months" INTEGER NOT NULL DEFAULT 0,
    "max_carry_over_days" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "carry_over_expiry_months" INTEGER,
    "counts_working_days_only" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "leave_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_balances" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "leave_type_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "quota_days" DECIMAL(5,2) NOT NULL,
    "carried_over_days" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "carried_over_expires_at" DATE,
    "used_days" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "adjusted_by" UUID,
    "adjustment_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "leave_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_requests" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "leave_type_id" UUID NOT NULL,
    "workflow_id" UUID NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "is_half_day" BOOLEAN NOT NULL DEFAULT false,
    "total_days" DECIMAL(5,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "attachment_key" VARCHAR(500),
    "status" "RequestStatus" NOT NULL DEFAULT 'pending',
    "current_approval_step" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "overtime_entries" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "work_date" DATE NOT NULL,
    "start_time" TIMESTAMPTZ(6) NOT NULL,
    "end_time" TIMESTAMPTZ(6) NOT NULL,
    "hours" DECIMAL(4,2) NOT NULL,
    "day_type" "OvertimeDayType" NOT NULL,
    "reason" TEXT NOT NULL,
    "workflow_id" UUID NOT NULL,
    "current_approval_step" INTEGER NOT NULL DEFAULT 1,
    "status" "RequestStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "overtime_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "message" TEXT NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "link_url" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "approval_workflows_company_id_request_type_version_key" ON "approval_workflows"("company_id", "request_type", "version");
CREATE INDEX "approval_workflows_company_id_request_type_is_active_idx" ON "approval_workflows"("company_id", "request_type", "is_active");
CREATE UNIQUE INDEX "approval_steps_workflow_id_step_order_key" ON "approval_steps"("workflow_id", "step_order");
CREATE INDEX "approval_logs_request_type_request_id_idx" ON "approval_logs"("request_type", "request_id");
CREATE INDEX "approval_delegations_company_id_delegator_id_start_date_end_idx" ON "approval_delegations"("company_id", "delegator_id", "start_date", "end_date");
CREATE UNIQUE INDEX "shifts_company_id_name_key" ON "shifts"("company_id", "name");
CREATE UNIQUE INDEX "shift_schedules_employee_id_date_key" ON "shift_schedules"("employee_id", "date");
CREATE UNIQUE INDEX "attendance_employee_id_work_date_key" ON "attendance"("employee_id", "work_date");
CREATE INDEX "attendance_work_date_idx" ON "attendance"("work_date");
CREATE INDEX "attendance_corrections_employee_id_status_idx" ON "attendance_corrections"("employee_id", "status");
CREATE INDEX "holidays_date_idx" ON "holidays"("date");
CREATE UNIQUE INDEX "leave_types_company_id_code_key" ON "leave_types"("company_id", "code");
CREATE UNIQUE INDEX "leave_balances_employee_id_leave_type_id_year_key" ON "leave_balances"("employee_id", "leave_type_id", "year");
CREATE INDEX "leave_balances_employee_id_year_idx" ON "leave_balances"("employee_id", "year");
CREATE INDEX "leave_requests_employee_id_status_idx" ON "leave_requests"("employee_id", "status");
CREATE INDEX "leave_requests_start_date_end_date_idx" ON "leave_requests"("start_date", "end_date");
CREATE INDEX "overtime_entries_employee_id_work_date_idx" ON "overtime_entries"("employee_id", "work_date");
CREATE INDEX "overtime_entries_employee_id_status_idx" ON "overtime_entries"("employee_id", "status");
CREATE INDEX "notifications_user_id_is_read_created_at_idx" ON "notifications"("user_id", "is_read", "created_at");

-- AddForeignKey
ALTER TABLE "approval_workflows" ADD CONSTRAINT "approval_workflows_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "approval_workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_approver_role_id_fkey" FOREIGN KEY ("approver_role_id") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_fallback_role_id_fkey" FOREIGN KEY ("fallback_role_id") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "approval_logs" ADD CONSTRAINT "approval_logs_step_id_fkey" FOREIGN KEY ("step_id") REFERENCES "approval_steps"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approval_logs" ADD CONSTRAINT "approval_logs_approver_id_fkey" FOREIGN KEY ("approver_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approval_logs" ADD CONSTRAINT "approval_logs_on_behalf_of_fkey" FOREIGN KEY ("on_behalf_of") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "approval_delegations" ADD CONSTRAINT "approval_delegations_delegator_id_fkey" FOREIGN KEY ("delegator_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "approval_delegations" ADD CONSTRAINT "approval_delegations_delegate_id_fkey" FOREIGN KEY ("delegate_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "shift_schedules" ADD CONSTRAINT "shift_schedules_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "shift_schedules" ADD CONSTRAINT "shift_schedules_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_attendance_id_fkey" FOREIGN KEY ("attendance_id") REFERENCES "attendance"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "approval_workflows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "leave_types" ADD CONSTRAINT "leave_types_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_leave_type_id_fkey" FOREIGN KEY ("leave_type_id") REFERENCES "leave_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_leave_type_id_fkey" FOREIGN KEY ("leave_type_id") REFERENCES "leave_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "approval_workflows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "overtime_entries" ADD CONSTRAINT "overtime_entries_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "overtime_entries" ADD CONSTRAINT "overtime_entries_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "approval_workflows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ═════════════════════ SQL khusus Fase 2 ═════════════════════

-- Hanya boleh ada satu workflow aktif per (company_id, request_type).
CREATE UNIQUE INDEX "approval_workflows_active_unique"
  ON "approval_workflows"("company_id", "request_type") WHERE "is_active" = true;

-- Satu tanggal libur unik per perusahaan (atau global jika company_id NULL).
CREATE UNIQUE INDEX "holidays_company_id_date_key"
  ON "holidays"("company_id", "date") NULLS NOT DISTINCT;

-- Constraint integritas bisnis.
ALTER TABLE "leave_balances"
  ADD CONSTRAINT "leave_balances_used_within_quota_check"
    CHECK ("used_days" >= 0 AND "used_days" <= "quota_days" + "carried_over_days");

ALTER TABLE "leave_requests"
  ADD CONSTRAINT "leave_requests_date_range_check" CHECK ("end_date" >= "start_date"),
  ADD CONSTRAINT "leave_requests_total_days_check" CHECK ("total_days" > 0);

ALTER TABLE "overtime_entries"
  ADD CONSTRAINT "overtime_entries_time_range_check" CHECK ("end_time" > "start_time"),
  ADD CONSTRAINT "overtime_entries_hours_check" CHECK ("hours" > 0);

ALTER TABLE "approval_delegations"
  ADD CONSTRAINT "approval_delegations_date_range_check" CHECK ("end_date" >= "start_date"),
  ADD CONSTRAINT "approval_delegations_not_self_check" CHECK ("delegator_id" <> "delegate_id");
