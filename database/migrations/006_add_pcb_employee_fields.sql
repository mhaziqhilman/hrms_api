-- Migration: Add PCB-related fields to employees table
-- Required for full LHDN PCB (Monthly Tax Deduction) calculation

-- Update tax_category to support KA/KB/KC categories
-- KA = Single (or married, spouse working)
-- KB = Married, spouse NOT working
-- KC = Married, spouse IS working (also: divorced/widowed with children)
ALTER TABLE employees ALTER COLUMN tax_category SET DEFAULT 'KA';

-- Add number of qualifying children (under 18 or in full-time education)
ALTER TABLE employees ADD COLUMN IF NOT EXISTS number_of_children INTEGER DEFAULT 0;

-- Add number of children in higher education (diploma/degree - RM8,000 relief each)
ALTER TABLE employees ADD COLUMN IF NOT EXISTS children_in_higher_education INTEGER DEFAULT 0;

-- Add disabled self flag (additional RM6,000 relief)
ALTER TABLE employees ADD COLUMN IF NOT EXISTS disabled_self BOOLEAN DEFAULT false;

-- Add disabled spouse flag (additional RM5,000 relief, KB category only)
ALTER TABLE employees ADD COLUMN IF NOT EXISTS disabled_spouse BOOLEAN DEFAULT false;

-- Add number of disabled children (additional RM6,000 relief each)
ALTER TABLE employees ADD COLUMN IF NOT EXISTS disabled_children INTEGER DEFAULT 0;

-- Update existing 'Individual' tax_category to 'KA'
UPDATE employees SET tax_category = 'KA' WHERE tax_category = 'Individual' OR tax_category IS NULL;
