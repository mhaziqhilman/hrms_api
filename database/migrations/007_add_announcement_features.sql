-- Migration 007: Add Announcement Features
-- Creates announcement_categories table and extends memos table with category/pinning support

-- 1. Create announcement_categories table
CREATE TABLE IF NOT EXISTS announcement_categories (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) NOT NULL,
  color VARCHAR(7),
  icon VARCHAR(50),
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(company_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_category_company ON announcement_categories(company_id);

-- 2. Add new columns to memos table
ALTER TABLE memos ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id);
ALTER TABLE memos ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES announcement_categories(id) ON DELETE SET NULL;
ALTER TABLE memos ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT false;
ALTER TABLE memos ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_memo_company ON memos(company_id);
CREATE INDEX IF NOT EXISTS idx_memo_category ON memos(category_id);
CREATE INDEX IF NOT EXISTS idx_memo_pinned ON memos(is_pinned, pinned_at DESC);

-- 3. Backfill company_id from author's company_id
UPDATE memos SET company_id = u.company_id
FROM users u WHERE memos.author_id = u.id AND memos.company_id IS NULL;

-- 4. Make company_id NOT NULL after backfill (only if there are no NULL values remaining)
-- ALTER TABLE memos ALTER COLUMN company_id SET NOT NULL;
