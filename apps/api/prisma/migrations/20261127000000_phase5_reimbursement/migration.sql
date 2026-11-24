-- Fase 5: Reimbursement (Klaim Biaya Karyawan) terhubung ke Approval Workflow & Payroll

CREATE TYPE "ReimbursementCategory" AS ENUM (
  'transport',
  'medical',
  'meal',
  'office_supply',
  'travel',
  'other'
);

CREATE TABLE "reimbursements" (
  "id"                    UUID                    NOT NULL DEFAULT gen_random_uuid(),
  "company_id"            UUID                    NOT NULL,
  "employee_id"           UUID                    NOT NULL,
  "category"              "ReimbursementCategory" NOT NULL,
  "title"                 VARCHAR(150)            NOT NULL,
  "expense_date"          DATE                    NOT NULL,
  "amount"                DECIMAL(15, 0)          NOT NULL,
  "description"           TEXT                    NOT NULL,
  "receipt_ref"           VARCHAR(200),
  "status"                "RequestStatus"         NOT NULL DEFAULT 'pending',
  "workflow_id"           UUID                    NOT NULL,
  "current_approval_step" INTEGER                 NOT NULL DEFAULT 1,
  "paid_payroll_period_id" UUID,
  "created_at"            TIMESTAMPTZ(6)          NOT NULL DEFAULT NOW(),
  "updated_at"            TIMESTAMPTZ(6)          NOT NULL DEFAULT NOW(),

  CONSTRAINT "reimbursements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "reimbursements_amount_positive" CHECK ("amount" > 0),
  CONSTRAINT "reimbursements_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "reimbursements_employee_id_fkey"
    FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "reimbursements_workflow_id_fkey"
    FOREIGN KEY ("workflow_id") REFERENCES "approval_workflows"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "reimbursements_paid_payroll_period_id_fkey"
    FOREIGN KEY ("paid_payroll_period_id") REFERENCES "payroll_periods"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "reimbursements_company_status_idx" ON "reimbursements"("company_id", "status");
CREATE INDEX "reimbursements_employee_idx" ON "reimbursements"("employee_id", "created_at" DESC);
CREATE INDEX "reimbursements_unpaid_idx" ON "reimbursements"("company_id", "status", "paid_payroll_period_id");
