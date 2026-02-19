-- Migration: Add late_minutes and early_leave_minutes columns to attendance table
-- Date: 2025-12-18
-- Description: Add columns to store the exact number of minutes an employee was late or left early

ALTER TABLE attendance
ADD COLUMN late_minutes INT NULL COMMENT 'Minutes late from standard start time (9:00 AM)';

ALTER TABLE attendance
ADD COLUMN early_leave_minutes INT NULL COMMENT 'Minutes early from standard end time (6:00 PM)';
