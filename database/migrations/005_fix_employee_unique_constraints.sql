-- Migration: Fix employees table unique constraints for multi-tenancy
-- Date: 2026-02-12
-- Description:
--   1. Drop standalone unique constraints on employees.ic_no, employees.employee_id, employees.user_id
--   2. Add composite unique index (ic_no, company_id) on employees
--   3. Ensure composite unique indexes for (employee_id, company_id) and (user_id, company_id) exist
--
-- Run this in Supabase SQL Editor

-- ============================================================
-- STEP 1: Drop standalone unique constraints on employees
-- ============================================================

-- Drop ALL standalone unique indexes/constraints on employees
-- (except the primary key and existing composite indexes that include company_id)
DO $$
DECLARE
    idx RECORD;
BEGIN
    FOR idx IN
        SELECT indexname
        FROM pg_indexes
        WHERE tablename = 'employees'
          AND indexdef LIKE '%UNIQUE%'
          AND indexdef NOT LIKE '%company_id%'
          AND indexname != 'employees_pkey'
    LOOP
        EXECUTE 'DROP INDEX IF EXISTS ' || quote_ident(idx.indexname);
        RAISE NOTICE 'Dropped index: %', idx.indexname;
    END LOOP;
END $$;

-- ============================================================
-- STEP 2: Add composite unique indexes for multi-tenancy
-- ============================================================

-- Unique ic_no per company (allow NULLs - only enforce when ic_no is not null)
CREATE UNIQUE INDEX IF NOT EXISTS unique_ic_no_company
ON employees (ic_no, company_id)
WHERE ic_no IS NOT NULL;

-- Unique employee_id per company (should already exist from Sequelize sync, but ensure)
CREATE UNIQUE INDEX IF NOT EXISTS unique_employee_id_company
ON employees (employee_id, company_id);

-- Unique user_id per company (should already exist from Sequelize sync, but ensure)
CREATE UNIQUE INDEX IF NOT EXISTS unique_user_company_employee
ON employees (user_id, company_id)
WHERE user_id IS NOT NULL;

-- ============================================================
-- VERIFICATION
-- ============================================================

SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'employees'
ORDER BY indexname;
