-- Fase 3: Tabel tarif regulasi payroll (TER, PTKP, Pasal 17, BPJS, Lembur PP 35/2021).

CREATE TYPE "BpjsProgram" AS ENUM ('kesehatan', 'jht', 'jkk', 'jkm', 'jp');

CREATE TABLE "ter_rates" (
    "id" UUID NOT NULL,
    "kategori" CHAR(1) NOT NULL,
    "batas_bawah" BIGINT NOT NULL,
    "batas_atas" BIGINT,
    "tarif" DECIMAL(6,5) NOT NULL,
    "berlaku_sejak" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ter_rates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ptkp_rates" (
    "id" UUID NOT NULL,
    "status" VARCHAR(5) NOT NULL,
    "amount_per_year" DECIMAL(15,0) NOT NULL,
    "ter_category" CHAR(1) NOT NULL,
    "berlaku_sejak" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ptkp_rates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pph21_progressive_rates" (
    "id" UUID NOT NULL,
    "batas_bawah" BIGINT NOT NULL,
    "batas_atas" BIGINT,
    "tarif" DECIMAL(6,5) NOT NULL,
    "berlaku_sejak" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pph21_progressive_rates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "bpjs_rates" (
    "id" UUID NOT NULL,
    "program" "BpjsProgram" NOT NULL,
    "risk_class" VARCHAR(5),
    "company_percentage" DECIMAL(6,5) NOT NULL,
    "employee_percentage" DECIMAL(6,5) NOT NULL,
    "extra_family_percentage" DECIMAL(6,5),
    "wage_cap" BIGINT,
    "berlaku_sejak" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bpjs_rates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "overtime_rules" (
    "id" UUID NOT NULL,
    "company_id" UUID,
    "work_pattern" "WorkPattern" NOT NULL,
    "day_type" "OvertimeDayType" NOT NULL,
    "hour_from" INTEGER NOT NULL,
    "hour_to" INTEGER,
    "multiplier" DECIMAL(3,2) NOT NULL,
    "berlaku_sejak" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "overtime_rules_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ter_rates_berlaku_sejak_kategori_batas_bawah_idx" ON "ter_rates"("berlaku_sejak", "kategori", "batas_bawah");
CREATE UNIQUE INDEX "ptkp_rates_status_berlaku_sejak_key" ON "ptkp_rates"("status", "berlaku_sejak");
CREATE INDEX "pph21_progressive_rates_berlaku_sejak_batas_bawah_idx" ON "pph21_progressive_rates"("berlaku_sejak", "batas_bawah");
CREATE INDEX "bpjs_rates_berlaku_sejak_program_idx" ON "bpjs_rates"("berlaku_sejak", "program");
CREATE UNIQUE INDEX "bpjs_rates_program_risk_class_berlaku_sejak_key" ON "bpjs_rates"("program", "risk_class", "berlaku_sejak") NULLS NOT DISTINCT;
CREATE INDEX "overtime_rules_berlaku_sejak_work_pattern_day_type_idx" ON "overtime_rules"("berlaku_sejak", "work_pattern", "day_type");

ALTER TABLE "ter_rates"
  ADD CONSTRAINT "ter_rates_kategori_check" CHECK ("kategori" IN ('A','B','C')),
  ADD CONSTRAINT "ter_rates_range_check" CHECK ("batas_atas" IS NULL OR "batas_atas" >= "batas_bawah");

ALTER TABLE "ptkp_rates"
  ADD CONSTRAINT "ptkp_rates_ter_cat_check" CHECK ("ter_category" IN ('A','B','C'));
