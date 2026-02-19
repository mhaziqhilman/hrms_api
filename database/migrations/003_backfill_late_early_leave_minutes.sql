-- Migration: Backfill late_minutes and early_leave_minutes for existing records
-- Date: 2025-12-18
-- Description: Calculate and populate late_minutes and early_leave_minutes for existing attendance records

-- Update late_minutes for Office attendance where is_late = 1
UPDATE attendance
SET late_minutes = TIMESTAMPDIFF(MINUTE,
    CONCAT(date, ' 09:00:00'),
    clock_in_time
)
WHERE type = 'Office'
AND is_late = 1
AND late_minutes IS NULL
AND clock_in_time IS NOT NULL;

-- Update early_leave_minutes for Office attendance where is_early_leave = 1
UPDATE attendance
SET early_leave_minutes = TIMESTAMPDIFF(MINUTE,
    clock_out_time,
    CONCAT(date, ' 18:00:00')
)
WHERE type = 'Office'
AND is_early_leave = 1
AND early_leave_minutes IS NULL
AND clock_out_time IS NOT NULL;

-- Set to 0 for records where is_late = 0 but late_minutes is NULL
UPDATE attendance
SET late_minutes = 0
WHERE is_late = 0
AND late_minutes IS NULL;

-- Set to 0 for records where is_early_leave = 0 but early_leave_minutes is NULL
UPDATE attendance
SET early_leave_minutes = 0
WHERE is_early_leave = 0
AND early_leave_minutes IS NULL;
