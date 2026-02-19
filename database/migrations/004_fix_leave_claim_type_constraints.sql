-- Migration: Fix leave_types and claim_types for multi-tenancy
-- Date: 2026-02-11
-- Description:
--   1. Drop standalone unique constraint on leave_types.name (allows per-company duplicates)
--   2. Add company_id column to claim_types
--   3. Drop standalone unique constraint on claim_types.name
--   4. Add composite unique index (company_id, name) on claim_types
--   5. Delete orphaned rows with company_id = NULL
--
-- Run this in Supabase SQL Editor

-- ============================================================
-- STEP 1: Fix leave_types
-- ============================================================

-- Drop ALL standalone unique indexes/constraints on leave_types.name
-- (the exact name varies depending on how it was created)
DO $$
DECLARE
    idx RECORD;
BEGIN
    FOR idx IN
        SELECT indexname
        FROM pg_indexes
        WHERE tablename = 'leave_types'
          AND indexdef LIKE '%UNIQUE%'
          AND indexdef NOT LIKE '%company_id%'
          AND indexname != 'leave_types_pkey'
    LOOP
        EXECUTE 'DROP INDEX IF EXISTS ' || quote_ident(idx.indexname);
        RAISE NOTICE 'Dropped index: %', idx.indexname;
    END LOOP;
END $$;

-- Delete orphaned leave types with no company (from old seed data)
DELETE FROM leave_types WHERE company_id IS NULL;

-- Ensure the composite unique index exists
CREATE UNIQUE INDEX IF NOT EXISTS leave_types_company_id_name
ON leave_types (company_id, name);

-- ============================================================
-- STEP 2: Fix claim_types
-- ============================================================

-- Add company_id column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'claim_types' AND column_name = 'company_id'
    ) THEN
        ALTER TABLE claim_types ADD COLUMN company_id INTEGER REFERENCES companies(id);
        RAISE NOTICE 'Added company_id column to claim_types';
    END IF;
END $$;

-- Drop ALL standalone unique indexes/constraints on claim_types.name
DO $$
DECLARE
    idx RECORD;
BEGIN
    FOR idx IN
        SELECT indexname
        FROM pg_indexes
        WHERE tablename = 'claim_types'
          AND indexdef LIKE '%UNIQUE%'
          AND indexdef NOT LIKE '%company_id%'
          AND indexname != 'claim_types_pkey'
    LOOP
        EXECUTE 'DROP INDEX IF EXISTS ' || quote_ident(idx.indexname);
        RAISE NOTICE 'Dropped index: %', idx.indexname;
    END LOOP;
END $$;

-- Delete orphaned claim types with no company (from old seed data)
DELETE FROM claim_types WHERE company_id IS NULL;

-- Create composite unique index
CREATE UNIQUE INDEX IF NOT EXISTS claim_types_company_id_name
ON claim_types (company_id, name);

-- ============================================================
-- VERIFICATION
-- ============================================================

-- Show final indexes for both tables
SELECT 'leave_types' AS table_name, indexname, indexdef
FROM pg_indexes WHERE tablename = 'leave_types'
UNION ALL
SELECT 'claim_types' AS table_name, indexname, indexdef
FROM pg_indexes WHERE tablename = 'claim_types'
ORDER BY table_name, indexname;
