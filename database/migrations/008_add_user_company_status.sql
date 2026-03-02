-- Migration 008: Add status field to user_companies table
-- Supports 'active' and 'inactive' membership states
-- Inactive memberships are invisible to regular users (company switcher)

-- Step 1: Create the ENUM type if it doesn't exist
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_user_companies_status') THEN
    CREATE TYPE enum_user_companies_status AS ENUM ('active', 'inactive');
  END IF;
END $$;

-- Step 2: Add the status column with default 'active'
ALTER TABLE user_companies
ADD COLUMN IF NOT EXISTS status enum_user_companies_status NOT NULL DEFAULT 'active';

-- Step 3: Backfill all existing records to 'active'
UPDATE user_companies SET status = 'active' WHERE status IS NULL;
