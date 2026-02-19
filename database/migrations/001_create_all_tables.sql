-- HRMS Database Schema Migration
-- Version: 1.0
-- Date: 2025-12-02
-- Description: Complete database schema for Malaysian HRMS system

-- Drop tables if they exist (in reverse order of dependencies)
DROP TABLE IF EXISTS policy_acknowledgments;
DROP TABLE IF EXISTS policies;
DROP TABLE IF EXISTS memo_read_receipts;
DROP TABLE IF EXISTS memos;
DROP TABLE IF EXISTS claims;
DROP TABLE IF EXISTS claim_types;
DROP TABLE IF EXISTS wfh_applications;
DROP TABLE IF EXISTS attendance;
DROP TABLE IF EXISTS leaves;
DROP TABLE IF EXISTS leave_entitlements;
DROP TABLE IF EXISTS leave_types;
DROP TABLE IF EXISTS payroll;
DROP TABLE IF EXISTS ytd_statutory;
DROP TABLE IF EXISTS employees;
DROP TABLE IF EXISTS users;

-- Users Table
CREATE TABLE users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  email VARCHAR(100) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role ENUM('super_admin', 'admin', 'manager', 'staff') NOT NULL DEFAULT 'staff',
  is_active BOOLEAN DEFAULT TRUE,
  failed_login_attempts INT DEFAULT 0,
  locked_until DATETIME NULL,
  last_login_at DATETIME,
  remember_token VARCHAR(100),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_email (email),
  INDEX idx_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Employees Table
CREATE TABLE employees (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT UNIQUE,
  employee_id VARCHAR(20) UNIQUE NOT NULL,
  full_name VARCHAR(150) NOT NULL,
  ic_no VARCHAR(20) UNIQUE,
  passport_no VARCHAR(20),
  date_of_birth DATE,
  gender ENUM('Male', 'Female') NOT NULL,
  marital_status ENUM('Single', 'Married', 'Divorced', 'Widowed'),
  nationality VARCHAR(50) DEFAULT 'Malaysian',
  race VARCHAR(50),
  religion VARCHAR(50),
  mobile VARCHAR(20),
  email VARCHAR(100),
  emergency_contact_name VARCHAR(100),
  emergency_contact_phone VARCHAR(20),
  current_address TEXT,
  permanent_address TEXT,
  position VARCHAR(100),
  department VARCHAR(100),
  reporting_manager_id INT,
  basic_salary DECIMAL(10, 2) NOT NULL,
  join_date DATE NOT NULL,
  confirmation_date DATE,
  employment_type ENUM('Permanent', 'Contract', 'Probation', 'Intern') DEFAULT 'Probation',
  employment_status ENUM('Active', 'Resigned', 'Terminated') DEFAULT 'Active',
  work_location VARCHAR(100),
  bank_name VARCHAR(100),
  bank_account_no VARCHAR(50),
  bank_account_holder VARCHAR(150),
  epf_no VARCHAR(20),
  socso_no VARCHAR(20),
  tax_no VARCHAR(20),
  tax_category VARCHAR(50) DEFAULT 'Individual',
  photo_url VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (reporting_manager_id) REFERENCES employees(id) ON DELETE SET NULL,
  INDEX idx_employee_id (employee_id),
  INDEX idx_department (department),
  INDEX idx_status (employment_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- YTD Statutory Table
CREATE TABLE ytd_statutory (
  id INT PRIMARY KEY AUTO_INCREMENT,
  employee_id INT NOT NULL,
  year INT NOT NULL,
  total_gross DECIMAL(12, 2) DEFAULT 0,
  total_epf_employee DECIMAL(10, 2) DEFAULT 0,
  total_epf_employer DECIMAL(10, 2) DEFAULT 0,
  total_socso_employee DECIMAL(10, 2) DEFAULT 0,
  total_socso_employer DECIMAL(10, 2) DEFAULT 0,
  total_eis_employee DECIMAL(10, 2) DEFAULT 0,
  total_eis_employer DECIMAL(10, 2) DEFAULT 0,
  total_pcb DECIMAL(10, 2) DEFAULT 0,
  total_net DECIMAL(12, 2) DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  UNIQUE KEY unique_employee_year (employee_id, year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Payroll Table
CREATE TABLE payroll (
  id INT PRIMARY KEY AUTO_INCREMENT,
  employee_id INT NOT NULL,
  month INT NOT NULL,
  year INT NOT NULL,
  basic_salary DECIMAL(10, 2) NOT NULL,
  allowance DECIMAL(10, 2) DEFAULT 0,
  overtime_pay DECIMAL(10, 2) DEFAULT 0,
  bonus DECIMAL(10, 2) DEFAULT 0,
  gross_salary DECIMAL(10, 2) NOT NULL,
  epf_employee DECIMAL(10, 2) DEFAULT 0,
  epf_employer DECIMAL(10, 2) DEFAULT 0,
  socso_employee DECIMAL(10, 2) DEFAULT 0,
  socso_employer DECIMAL(10, 2) DEFAULT 0,
  eis_employee DECIMAL(10, 2) DEFAULT 0,
  eis_employer DECIMAL(10, 2) DEFAULT 0,
  pcb DECIMAL(10, 2) DEFAULT 0,
  other_deductions DECIMAL(10, 2) DEFAULT 0,
  total_deductions DECIMAL(10, 2) NOT NULL,
  net_salary DECIMAL(10, 2) NOT NULL,
  status ENUM('Draft', 'Locked', 'Paid') DEFAULT 'Draft',
  locked_at DATETIME,
  locked_by INT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (locked_by) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE KEY unique_payroll (employee_id, month, year),
  INDEX idx_month_year (month, year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Leave Types Table
CREATE TABLE leave_types (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(50) NOT NULL,
  days_per_year INT DEFAULT 0,
  is_paid BOOLEAN DEFAULT TRUE,
  carry_forward_allowed BOOLEAN DEFAULT FALSE,
  carry_forward_max_days INT DEFAULT 0,
  prorate_for_new_joiners BOOLEAN DEFAULT TRUE,
  requires_document BOOLEAN DEFAULT FALSE,
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Leave Entitlements Table
CREATE TABLE leave_entitlements (
  id INT PRIMARY KEY AUTO_INCREMENT,
  employee_id INT NOT NULL,
  leave_type_id INT NOT NULL,
  year INT NOT NULL,
  total_days DECIMAL(5, 2) NOT NULL,
  used_days DECIMAL(5, 2) DEFAULT 0,
  pending_days DECIMAL(5, 2) DEFAULT 0,
  balance_days DECIMAL(5, 2) NOT NULL,
  carry_forward_days DECIMAL(5, 2) DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (leave_type_id) REFERENCES leave_types(id) ON DELETE CASCADE,
  UNIQUE KEY unique_entitlement (employee_id, leave_type_id, year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Leaves Table
CREATE TABLE leaves (
  id INT PRIMARY KEY AUTO_INCREMENT,
  employee_id INT NOT NULL,
  leave_type_id INT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  total_days DECIMAL(5, 2) NOT NULL,
  is_half_day BOOLEAN DEFAULT FALSE,
  half_day_period ENUM('AM', 'PM'),
  reason TEXT NOT NULL,
  attachment_url VARCHAR(255),
  status ENUM('Pending', 'Approved', 'Rejected', 'Cancelled') DEFAULT 'Pending',
  approved_by INT,
  approved_at DATETIME,
  rejection_reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (leave_type_id) REFERENCES leave_types(id) ON DELETE CASCADE,
  FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_employee (employee_id),
  INDEX idx_status (status),
  INDEX idx_dates (start_date, end_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Attendance Table
CREATE TABLE attendance (
  id INT PRIMARY KEY AUTO_INCREMENT,
  employee_id INT NOT NULL,
  date DATE NOT NULL,
  clock_in_time DATETIME,
  clock_out_time DATETIME,
  total_hours DECIMAL(5, 2),
  type ENUM('Office', 'WFH') DEFAULT 'Office',
  location_lat DECIMAL(10, 8),
  location_long DECIMAL(11, 8),
  location_address VARCHAR(255),
  is_late BOOLEAN DEFAULT FALSE,
  is_early_leave BOOLEAN DEFAULT FALSE,
  remarks TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  UNIQUE KEY unique_attendance (employee_id, date),
  INDEX idx_employee_date (employee_id, date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- WFH Applications Table
CREATE TABLE wfh_applications (
  id INT PRIMARY KEY AUTO_INCREMENT,
  employee_id INT NOT NULL,
  date DATE NOT NULL,
  reason TEXT NOT NULL,
  status ENUM('Pending', 'Approved', 'Rejected') DEFAULT 'Pending',
  approved_by INT,
  approved_at DATETIME,
  rejection_reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_employee (employee_id),
  INDEX idx_date (date),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Claim Types Table
CREATE TABLE claim_types (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(50) NOT NULL,
  per_claim_limit DECIMAL(10, 2) DEFAULT 0,
  monthly_limit DECIMAL(10, 2) DEFAULT 0,
  annual_limit DECIMAL(10, 2) DEFAULT 0,
  requires_receipt BOOLEAN DEFAULT TRUE,
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Claims Table
CREATE TABLE claims (
  id INT PRIMARY KEY AUTO_INCREMENT,
  employee_id INT NOT NULL,
  claim_type_id INT NOT NULL,
  date DATE NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  description TEXT NOT NULL,
  receipt_url VARCHAR(255),
  status ENUM('Pending', 'Manager_Approved', 'Finance_Approved', 'Rejected', 'Paid') DEFAULT 'Pending',
  manager_approved_by INT,
  manager_approved_at DATETIME,
  finance_approved_by INT,
  finance_approved_at DATETIME,
  rejection_reason TEXT,
  payment_reference VARCHAR(100),
  paid_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (claim_type_id) REFERENCES claim_types(id) ON DELETE CASCADE,
  FOREIGN KEY (manager_approved_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (finance_approved_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_employee (employee_id),
  INDEX idx_status (status),
  INDEX idx_date (date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Memos Table
CREATE TABLE memos (
  id INT PRIMARY KEY AUTO_INCREMENT,
  title VARCHAR(200) NOT NULL,
  content TEXT NOT NULL,
  attachment_url VARCHAR(255),
  target_audience ENUM('All', 'Department', 'Role') DEFAULT 'All',
  target_departments VARCHAR(255),
  target_roles VARCHAR(255),
  priority ENUM('Normal', 'Urgent') DEFAULT 'Normal',
  publish_at DATETIME,
  created_by INT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_publish_at (publish_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Memo Read Receipts Table
CREATE TABLE memo_read_receipts (
  id INT PRIMARY KEY AUTO_INCREMENT,
  memo_id INT NOT NULL,
  employee_id INT NOT NULL,
  read_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (memo_id) REFERENCES memos(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  UNIQUE KEY unique_receipt (memo_id, employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Policies Table
CREATE TABLE policies (
  id INT PRIMARY KEY AUTO_INCREMENT,
  category VARCHAR(100) NOT NULL,
  title VARCHAR(200) NOT NULL,
  document_url VARCHAR(255) NOT NULL,
  version VARCHAR(20),
  effective_date DATE,
  require_acknowledgment BOOLEAN DEFAULT FALSE,
  uploaded_by INT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Policy Acknowledgments Table
CREATE TABLE policy_acknowledgments (
  id INT PRIMARY KEY AUTO_INCREMENT,
  policy_id INT NOT NULL,
  employee_id INT NOT NULL,
  acknowledged_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  ip_address VARCHAR(45),
  FOREIGN KEY (policy_id) REFERENCES policies(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  UNIQUE KEY unique_acknowledgment (policy_id, employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert default leave types
INSERT INTO leave_types (name, days_per_year, is_paid, carry_forward_allowed, carry_forward_max_days, prorate_for_new_joiners, requires_document, description) VALUES
('Annual Leave', 14, TRUE, TRUE, 7, TRUE, FALSE, 'Annual leave entitlement'),
('Medical Leave', 14, TRUE, FALSE, 0, FALSE, TRUE, 'Medical leave with medical certificate'),
('Emergency Leave', 5, TRUE, FALSE, 0, FALSE, FALSE, 'Emergency personal leave'),
('Unpaid Leave', 0, FALSE, FALSE, 0, FALSE, FALSE, 'Unpaid leave');

-- Insert default claim types
INSERT INTO claim_types (name, per_claim_limit, monthly_limit, annual_limit, requires_receipt, description) VALUES
('Medical', 500.00, 1000.00, 5000.00, TRUE, 'Medical expenses claim'),
('Travel', 200.00, 1000.00, 10000.00, TRUE, 'Travel expenses for business purposes'),
('Meal', 50.00, 500.00, 3000.00, TRUE, 'Meal allowance for overtime/business'),
('Parking', 30.00, 300.00, 2000.00, TRUE, 'Parking fees for business purposes');
