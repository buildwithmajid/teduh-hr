-- Fase 4: Payroll Periods, Payroll Details, Payroll Components, Tax Year Summaries,
-- Separation of Duties constraint, dan Trigger DB penguncian payroll status 'locked'.

CREATE TYPE "PayrollRunType" AS ENUM ('regular', 'thr', 'bonus', 'correction', 'final_settlement');
CREATE TYPE "PayrollPeriodStatus" AS ENUM ('draft', 'pending_approval', 'approved', 'locked');
CREATE TYPE "Pph21Method" AS ENUM ('ter', 'annual_reconciliation');
CREATE TYPE "PayrollComponentKind" AS ENUM ('earning', 'deduction', 'company_contribution', 'taxable_benefit');

CREATE TABLE "payroll_periods" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "run_type" "PayrollRunType" NOT NULL DEFAULT 'regular',
    "run_sequence" INTEGER NOT NULL DEFAULT 1,
    "attendance_start" DATE NOT NULL,
    "attendance_end" DATE NOT NULL,
    "pay_date" DATE NOT NULL,
    "is_final_tax_period" BOOLEAN NOT NULL DEFAULT false,
    "status" "PayrollPeriodStatus" NOT NULL DEFAULT 'draft',
    "processed_by" UUID,
    "approved_by" UUID,
    "rejection_notes" TEXT,
    "locked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payroll_periods_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payroll_details" (
    "id" UUID NOT NULL,
    "payroll_period_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "base_salary_encrypted" TEXT NOT NULL,
    "fixed_allowance_encrypted" TEXT NOT NULL,
    "variable_allowance_encrypted" TEXT NOT NULL,
    "overtime_amount_encrypted" TEXT NOT NULL,
    "irregular_income_encrypted" TEXT NOT NULL,
    "bpjs_wage_base" DECIMAL(15,0) NOT NULL,
    "bpjs_kes_employee" DECIMAL(15,0) NOT NULL,
    "bpjs_kes_company" DECIMAL(15,0) NOT NULL,
    "jht_employee" DECIMAL(15,0) NOT NULL,
    "jht_company" DECIMAL(15,0) NOT NULL,
    "jkk_company" DECIMAL(15,0) NOT NULL,
    "jkm_company" DECIMAL(15,0) NOT NULL,
    "jp_employee" DECIMAL(15,0) NOT NULL,
    "jp_company" DECIMAL(15,0) NOT NULL,
    "pph21_gross_encrypted" TEXT NOT NULL,
    "pph21_method" "Pph21Method" NOT NULL,
    "pph21_amount_encrypted" TEXT NOT NULL,
    "pph21_refund_encrypted" TEXT NOT NULL,
    "is_final_tax_period" BOOLEAN NOT NULL DEFAULT false,
    "other_deductions_encrypted" TEXT NOT NULL,
    "net_salary_encrypted" TEXT NOT NULL,
    "rate_snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payroll_details_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payroll_components" (
    "id" UUID NOT NULL,
    "payroll_detail_id" UUID NOT NULL,
    "component_type" "PayrollComponentKind" NOT NULL,
    "component_code" VARCHAR(50) NOT NULL,
    "component_name" VARCHAR(100) NOT NULL,
    "amount_encrypted" TEXT NOT NULL,
    "reference_id" UUID,

    CONSTRAINT "payroll_components_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tax_year_summaries" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "ptkp_status" VARCHAR(5) NOT NULL,
    "months_worked" INTEGER NOT NULL DEFAULT 0,
    "gross_ytd_encrypted" TEXT NOT NULL,
    "jht_employee_ytd" DECIMAL(15,0) NOT NULL DEFAULT 0,
    "jp_employee_ytd" DECIMAL(15,0) NOT NULL DEFAULT 0,
    "pph21_ytd_encrypted" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tax_year_summaries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payroll_periods_company_id_year_month_run_type_run_sequence_key" ON "payroll_periods"("company_id", "year", "month", "run_type", "run_sequence");
CREATE INDEX "payroll_periods_company_id_year_month_idx" ON "payroll_periods"("company_id", "year", "month");
CREATE UNIQUE INDEX "payroll_details_payroll_period_id_employee_id_key" ON "payroll_details"("payroll_period_id", "employee_id");
CREATE INDEX "payroll_components_payroll_detail_id_idx" ON "payroll_components"("payroll_detail_id");
CREATE UNIQUE INDEX "tax_year_summaries_employee_id_company_id_year_key" ON "tax_year_summaries"("employee_id", "company_id", "year");

ALTER TABLE "payroll_periods" ADD CONSTRAINT "payroll_periods_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payroll_details" ADD CONSTRAINT "payroll_details_payroll_period_id_fkey" FOREIGN KEY ("payroll_period_id") REFERENCES "payroll_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payroll_details" ADD CONSTRAINT "payroll_details_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payroll_components" ADD CONSTRAINT "payroll_components_payroll_detail_id_fkey" FOREIGN KEY ("payroll_detail_id") REFERENCES "payroll_details"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tax_year_summaries" ADD CONSTRAINT "tax_year_summaries_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Separation of duties & validasi bulan
ALTER TABLE "payroll_periods"
  ADD CONSTRAINT "payroll_periods_month_check" CHECK ("month" BETWEEN 1 AND 12),
  ADD CONSTRAINT "payroll_periods_sod_check" CHECK ("approved_by" IS NULL OR "approved_by" <> "processed_by");

-- Trigger penguncian payroll: periode berstatus 'locked' tidak bisa diubah/dihapus di level DB.
CREATE OR REPLACE FUNCTION payroll_block_locked_period() RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'locked' THEN
    RAISE EXCEPTION 'Periode payroll yang sudah dikunci (locked) tidak dapat diubah atau dihapus';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER payroll_periods_no_modify_locked
  BEFORE UPDATE OR DELETE ON "payroll_periods"
  FOR EACH ROW EXECUTE FUNCTION payroll_block_locked_period();

CREATE OR REPLACE FUNCTION payroll_block_locked_detail() RETURNS trigger AS $$
DECLARE
  p_status "PayrollPeriodStatus";
BEGIN
  SELECT status INTO p_status FROM "payroll_periods" WHERE id = OLD.payroll_period_id;
  IF p_status = 'locked' THEN
    RAISE EXCEPTION 'Detail payroll pada periode yang sudah dikunci (locked) tidak dapat diubah atau dihapus';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER payroll_details_no_modify_locked
  BEFORE UPDATE OR DELETE ON "payroll_details"
  FOR EACH ROW EXECUTE FUNCTION payroll_block_locked_detail();
