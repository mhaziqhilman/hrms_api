# Payroll API Documentation

## Overview
The Payroll API provides comprehensive payroll management functionality including automatic calculation of Malaysian statutory deductions (EPF, SOCSO, EIS, PCB), payroll processing, approval workflow, and payslip generation. The system automatically updates Year-to-Date (YTD) statutory records when payroll is processed.

## Base URL
```
http://localhost:3000/api/payroll
```

## Authentication
All endpoints require JWT authentication via the `Authorization` header:
```
Authorization: Bearer <jwt_token>
```

## Endpoints

### 1. Get All Payroll Records
Retrieve a paginated list of payroll records with optional filtering.

**Endpoint:** `GET /api/payroll`

**Access:** Admin, Manager

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| page | integer | No | Page number (default: 1, min: 1) |
| limit | integer | No | Items per page (default: 10, max: 100) |
| status | string | No | Filter by status (Draft, Pending, Approved, Paid, Cancelled) |
| year | integer | No | Filter by year (2020-2100) |
| month | integer | No | Filter by month (1-12) |
| employee_id | integer | No | Filter by employee ID |

**Response:**
```json
{
  "success": true,
  "data": {
    "payrolls": [
      {
        "id": 1,
        "employee_id": 1,
        "month": 12,
        "year": 2024,
        "basic_salary": "5000.00",
        "allowances": "500.00",
        "overtime_pay": "200.00",
        "bonus": "0.00",
        "commission": "0.00",
        "gross_salary": "5700.00",
        "epf_employee": "627.00",
        "epf_employer": "684.00",
        "socso_employee": "24.75",
        "socso_employer": "86.65",
        "eis_employee": "8.55",
        "eis_employer": "8.55",
        "pcb_deduction": "150.00",
        "unpaid_leave_deduction": "0.00",
        "other_deductions": "0.00",
        "total_deductions": "810.30",
        "net_salary": "4889.70",
        "pay_period_start": "2024-12-01",
        "pay_period_end": "2024-12-31",
        "payment_date": "2024-12-31",
        "status": "Paid",
        "processed_by": 1,
        "approved_by": 1,
        "approved_at": "2024-12-25T10:00:00.000Z",
        "notes": null,
        "created_at": "2024-12-20T08:00:00.000Z",
        "updated_at": "2024-12-25T10:00:00.000Z",
        "employee": {
          "id": 1,
          "employee_id": "EMP001",
          "full_name": "John Doe",
          "position": "Software Engineer",
          "department": "IT"
        }
      }
    ],
    "pagination": {
      "total": 50,
      "currentPage": 1,
      "limit": 10,
      "totalPages": 5
    }
  }
}
```

---

### 2. Get Payroll by ID
Retrieve detailed information for a specific payroll record.

**Endpoint:** `GET /api/payroll/:id`

**Access:** Admin, Manager, Staff (own record only)

**URL Parameters:**
- `id` (integer) - Payroll record ID

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "employee_id": 1,
    "month": 12,
    "year": 2024,
    "basic_salary": "5000.00",
    "allowances": "500.00",
    "overtime_pay": "200.00",
    "bonus": "0.00",
    "commission": "0.00",
    "gross_salary": "5700.00",
    "epf_employee": "627.00",
    "epf_employer": "684.00",
    "socso_employee": "24.75",
    "socso_employer": "86.65",
    "eis_employee": "8.55",
    "eis_employer": "8.55",
    "pcb_deduction": "150.00",
    "unpaid_leave_deduction": "0.00",
    "other_deductions": "0.00",
    "total_deductions": "810.30",
    "net_salary": "4889.70",
    "pay_period_start": "2024-12-01",
    "pay_period_end": "2024-12-31",
    "payment_date": "2024-12-31",
    "status": "Paid",
    "processed_by": 1,
    "approved_by": 1,
    "approved_at": "2024-12-25T10:00:00.000Z",
    "notes": null,
    "employee": {
      "id": 1,
      "employee_id": "EMP001",
      "full_name": "John Doe",
      "position": "Software Engineer",
      "department": "IT",
      "bank_name": "Maybank",
      "bank_account_no": "1234567890"
    },
    "processor": {
      "id": 1,
      "username": "admin",
      "full_name": "Admin User"
    },
    "approver": {
      "id": 1,
      "username": "admin",
      "full_name": "Admin User"
    }
  }
}
```

---

### 3. Calculate Payroll
Calculate and create a new payroll record for an employee. This endpoint automatically:
- Retrieves employee's current basic salary
- Calculates gross salary from all components
- Computes all statutory deductions (EPF, SOCSO, EIS, PCB)
- Calculates net salary
- Updates YTD statutory records

**Endpoint:** `POST /api/payroll/calculate`

**Access:** Admin, Manager

**Request Body:**
```json
{
  "employee_id": 1,
  "year": 2024,
  "month": 12,
  "allowances": 500.00,
  "overtime_pay": 200.00,
  "bonus": 0.00,
  "commission": 0.00,
  "unpaid_leave_deduction": 0.00,
  "other_deductions": 0.00,
  "payment_date": "2024-12-31",
  "notes": "December 2024 payroll"
}
```

**Validation Rules:**
- `employee_id`: Required, must be a valid integer
- `year`: Required, must be between 2020-2100
- `month`: Required, must be between 1-12
- `allowances`: Optional, must be >= 0 (default: 0)
- `overtime_pay`: Optional, must be >= 0 (default: 0)
- `bonus`: Optional, must be >= 0 (default: 0)
- `commission`: Optional, must be >= 0 (default: 0)
- `unpaid_leave_deduction`: Optional, must be >= 0 (default: 0)
- `other_deductions`: Optional, must be >= 0 (default: 0)
- `payment_date`: Optional, must be valid ISO date
- `notes`: Optional string

**Response:**
```json
{
  "success": true,
  "message": "Payroll calculated and created successfully",
  "data": {
    "id": 1,
    "employee_id": 1,
    "month": 12,
    "year": 2024,
    "basic_salary": "5000.00",
    "gross_salary": "5700.00",
    "net_salary": "4889.70",
    "status": "Draft",
    "calculations": {
      "gross_salary": "5700.00",
      "statutory": {
        "epf": {
          "employee": "627.00",
          "employer": "684.00",
          "total": "1311.00"
        },
        "socso": {
          "employee": "24.75",
          "employer": "86.65",
          "total": "111.40"
        },
        "eis": {
          "employee": "8.55",
          "employer": "8.55",
          "total": "17.10"
        },
        "pcb": "150.00"
      },
      "total_deductions": "810.30",
      "net_salary": "4889.70"
    }
  }
}
```

---

### 4. Update Payroll
Update an existing payroll record. Only Draft or Pending payrolls can be updated. The system will automatically recalculate all values if salary components are changed.

**Endpoint:** `PUT /api/payroll/:id`

**Access:** Admin, Manager

**URL Parameters:**
- `id` (integer) - Payroll record ID

**Request Body:**
```json
{
  "allowances": 600.00,
  "overtime_pay": 250.00,
  "bonus": 1000.00,
  "notes": "Updated with year-end bonus"
}
```

**Note:**
- Only Draft or Pending payrolls can be updated
- All fields are optional
- If any salary component is changed, statutory deductions are automatically recalculated
- YTD records are updated accordingly

**Response:**
```json
{
  "success": true,
  "message": "Payroll updated successfully",
  "data": {
    "id": 1,
    "employee_id": 1,
    "gross_salary": "6850.00",
    "net_salary": "5954.13",
    ...
  }
}
```

---

### 5. Approve Payroll
Approve a pending payroll record. Only payrolls with "Pending" status can be approved.

**Endpoint:** `PATCH /api/payroll/:id/approve`

**Access:** Admin only

**URL Parameters:**
- `id` (integer) - Payroll record ID

**Response:**
```json
{
  "success": true,
  "message": "Payroll approved successfully",
  "data": {
    "id": 1,
    "employee_id": 1,
    "status": "Approved",
    "approved_by": 1,
    "approved_at": "2024-12-25T10:00:00.000Z",
    ...
  }
}
```

---

### 6. Mark Payroll as Paid
Mark an approved payroll as paid. Only payrolls with "Approved" status can be marked as paid.

**Endpoint:** `PATCH /api/payroll/:id/mark-paid`

**Access:** Admin only

**URL Parameters:**
- `id` (integer) - Payroll record ID

**Response:**
```json
{
  "success": true,
  "message": "Payroll marked as paid successfully",
  "data": {
    "id": 1,
    "employee_id": 1,
    "status": "Paid",
    ...
  }
}
```

---

### 7. Cancel Payroll
Cancel a payroll record. Only Draft or Pending payrolls can be cancelled. Cancelling a payroll updates the YTD records by reversing the amounts.

**Endpoint:** `DELETE /api/payroll/:id`

**Access:** Admin only

**URL Parameters:**
- `id` (integer) - Payroll record ID

**Response:**
```json
{
  "success": true,
  "message": "Payroll cancelled successfully"
}
```

---

### 8. Generate Payslip
Generate a formatted payslip for a specific payroll record.

**Endpoint:** `GET /api/payroll/:id/payslip`

**Access:** Admin, Manager, Staff (own record only)

**URL Parameters:**
- `id` (integer) - Payroll record ID

**Response:**
```json
{
  "success": true,
  "data": {
    "payroll_id": 1,
    "employee": {
      "id": 1,
      "employee_id": "EMP001",
      "full_name": "John Doe",
      "ic_no": "901234567890",
      "position": "Software Engineer",
      "department": "IT",
      "epf_no": "12345678",
      "socso_no": "87654321",
      "tax_no": "SG1234567890"
    },
    "pay_period": {
      "month": 12,
      "year": 2024,
      "start_date": "2024-12-01",
      "end_date": "2024-12-31",
      "payment_date": "2024-12-31"
    },
    "earnings": {
      "basic_salary": 5000.00,
      "allowances": 500.00,
      "overtime_pay": 200.00,
      "bonus": 0.00,
      "commission": 0.00,
      "gross_salary": 5700.00
    },
    "deductions": {
      "epf_employee": 627.00,
      "socso_employee": 24.75,
      "eis_employee": 8.55,
      "pcb_deduction": 150.00,
      "unpaid_leave_deduction": 0.00,
      "other_deductions": 0.00,
      "total_deductions": 810.30
    },
    "employer_contributions": {
      "epf_employer": 684.00,
      "socso_employer": 86.65,
      "eis_employer": 8.55
    },
    "net_salary": 4889.70,
    "bank_details": {
      "bank_name": "Maybank",
      "account_no": "1234567890"
    },
    "status": "Paid",
    "notes": null,
    "generated_at": "2024-12-26T08:00:00.000Z"
  }
}
```

---

## Data Models

### Payroll Model
```javascript
{
  id: INTEGER (Primary Key, Auto Increment),
  employee_id: INTEGER (Foreign Key, Not Null),
  month: INTEGER (Not Null, 1-12),
  year: INTEGER (Not Null),
  basic_salary: DECIMAL(10, 2) (Not Null),
  allowances: DECIMAL(10, 2) (Default: 0.00),
  overtime_pay: DECIMAL(10, 2) (Default: 0.00),
  bonus: DECIMAL(10, 2) (Default: 0.00),
  commission: DECIMAL(10, 2) (Default: 0.00),
  gross_salary: DECIMAL(10, 2) (Not Null),
  epf_employee: DECIMAL(10, 2) (Default: 0.00),
  epf_employer: DECIMAL(10, 2) (Default: 0.00),
  socso_employee: DECIMAL(10, 2) (Default: 0.00),
  socso_employer: DECIMAL(10, 2) (Default: 0.00),
  eis_employee: DECIMAL(10, 2) (Default: 0.00),
  eis_employer: DECIMAL(10, 2) (Default: 0.00),
  pcb_deduction: DECIMAL(10, 2) (Default: 0.00),
  unpaid_leave_deduction: DECIMAL(10, 2) (Default: 0.00),
  other_deductions: DECIMAL(10, 2) (Default: 0.00),
  total_deductions: DECIMAL(10, 2) (Not Null),
  net_salary: DECIMAL(10, 2) (Not Null),
  pay_period_start: DATE,
  pay_period_end: DATE,
  payment_date: DATE,
  status: ENUM('Draft', 'Pending', 'Approved', 'Paid', 'Cancelled') (Default: 'Draft'),
  processed_by: INTEGER (Foreign Key),
  approved_by: INTEGER (Foreign Key),
  approved_at: TIMESTAMP,
  notes: TEXT,
  created_at: TIMESTAMP,
  updated_at: TIMESTAMP
}
```

## Statutory Calculations (Malaysian Standards)

### 1. EPF (Employees Provident Fund)
**Employee Contribution:** 11% of gross salary
**Employer Contribution:**
- 12% for employees earning ≤ RM 5,000
- 13% for employees earning > RM 5,000

**Example:**
```
Gross Salary: RM 5,700
Employee EPF: RM 5,700 × 11% = RM 627.00
Employer EPF: RM 5,700 × 12% = RM 684.00
```

### 2. SOCSO (Social Security Organization)
Contributions are based on salary brackets according to SOCSO's contribution table.

**Monthly Salary Brackets (Sample):**
| Salary Range | Employee | Employer |
|--------------|----------|----------|
| Up to RM 1,000 | RM 4.95 | RM 17.30 |
| RM 5,001 - RM 5,500 | RM 22.75 | RM 79.65 |
| RM 5,501 - RM 6,000 | RM 24.75 | RM 86.65 |

**Note:** SOCSO contributions are capped at RM 4,000 monthly salary

### 3. EIS (Employment Insurance System)
**Employee Contribution:** 0.2% of gross salary (max RM 7.90/month)
**Employer Contribution:** 0.2% of gross salary (max RM 7.90/month)

**Example:**
```
Gross Salary: RM 5,700
Employee EIS: RM 5,700 × 0.2% = RM 11.40 (capped at RM 7.90)
Employer EIS: RM 5,700 × 0.2% = RM 11.40 (capped at RM 7.90)
```

### 4. PCB (Potongan Cukai Bulanan - Monthly Tax Deduction)
Progressive tax based on annual income projection.

**Tax Brackets (Resident Individual - 2024):**
| Annual Income | Tax Rate |
|---------------|----------|
| First RM 5,000 | 0% |
| Next RM 15,000 | 1% |
| Next RM 15,000 | 3% |
| Next RM 15,000 | 6% |
| Next RM 20,000 | 11% |
| Next RM 30,000 | 19% |
| Next RM 150,000 | 25% |
| Exceeding RM 250,000 | 26% |

**Example:**
```
Monthly Gross: RM 5,700
Annual Projection: RM 5,700 × 12 = RM 68,400

Tax Calculation:
First RM 5,000: RM 0
Next RM 15,000: RM 150
Next RM 15,000: RM 450
Next RM 15,000: RM 900
Next RM 18,400: RM 2,024
Total Annual Tax: RM 3,524
Monthly PCB: RM 3,524 ÷ 12 = RM 293.67
```

## Payroll Status Workflow

```
Draft → Pending → Approved → Paid
  ↓        ↓
Cancelled  Cancelled
```

**Status Descriptions:**
- **Draft:** Initial state when payroll is calculated. Can be edited or deleted.
- **Pending:** Submitted for approval. Can be edited by Manager/Admin or cancelled.
- **Approved:** Approved by Admin. Ready for payment. Can be marked as paid.
- **Paid:** Payment completed. Cannot be modified.
- **Cancelled:** Payroll cancelled. YTD records are reversed.

## Business Logic

### Payroll Calculation Process
1. Validate employee exists and is active
2. Check for duplicate payroll (same employee, month, year)
3. Retrieve employee's current basic salary
4. Calculate gross salary: `basic_salary + allowances + overtime_pay + bonus + commission`
5. Calculate statutory deductions using Malaysian formulas
6. Calculate total deductions
7. Calculate net salary: `gross_salary - total_deductions`
8. Set pay period dates (1st to last day of month)
9. Create payroll record with status "Draft"
10. Update or create YTD statutory record

### YTD Update Process
When payroll is created or updated:
1. Find or create YTD record for employee/year/month
2. Update monthly amounts
3. Calculate YTD cumulative totals from January to current month
4. Save YTD record

When payroll is cancelled:
1. Subtract payroll amounts from YTD record
2. Recalculate YTD cumulative totals
3. Save updated YTD record

### Approval Workflow
1. **Draft → Pending:** Manager or Admin submits for approval
2. **Pending → Approved:** Admin approves the payroll
3. **Approved → Paid:** Admin marks as paid after processing payment
4. **Any → Cancelled:** Admin cancels payroll (only Draft/Pending can be cancelled)

## Error Responses

### 400 Bad Request
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    {
      "field": "employee_id",
      "message": "Employee ID must be an integer"
    }
  ]
}
```

### 401 Unauthorized
```json
{
  "success": false,
  "message": "Authentication required"
}
```

### 403 Forbidden
```json
{
  "success": false,
  "message": "You do not have permission to access this payroll record"
}
```

### 404 Not Found
```json
{
  "success": false,
  "message": "Payroll record not found"
}
```

### 409 Conflict
```json
{
  "success": false,
  "message": "Payroll for this employee and period already exists"
}
```

### 422 Unprocessable Entity
```json
{
  "success": false,
  "message": "Cannot update payroll with status Paid"
}
```

### 500 Internal Server Error
```json
{
  "success": false,
  "message": "Internal server error",
  "error": "Error details..."
}
```

## Permissions

| Endpoint | Admin | Manager | Staff |
|----------|-------|---------|-------|
| GET /payroll | ✓ | ✓ | ✗ |
| GET /payroll/:id | ✓ | ✓ | ✓ (own) |
| POST /payroll/calculate | ✓ | ✓ | ✗ |
| PUT /payroll/:id | ✓ | ✓ | ✗ |
| PATCH /payroll/:id/approve | ✓ | ✗ | ✗ |
| PATCH /payroll/:id/mark-paid | ✓ | ✗ | ✗ |
| DELETE /payroll/:id | ✓ | ✗ | ✗ |
| GET /payroll/:id/payslip | ✓ | ✓ | ✓ (own) |

## Implementation Files

- **Model:** `src/models/Payroll.js`
- **Controller:** `src/controllers/payrollController.js`
- **Routes:** `src/routes/payroll.routes.js`
- **Utilities:** `src/utils/statutoryCalculations.js`
- **Middleware:**
  - `src/middleware/auth.middleware.js` (JWT verification)
  - `src/middleware/rbac.middleware.js` (Role-based access control)

## Notes

1. **Automatic Calculations**: All statutory deductions are automatically calculated based on Malaysian regulations. You only need to provide basic salary components.

2. **YTD Integration**: The system automatically maintains YTD statutory records. These are updated whenever payroll is created, updated, or cancelled.

3. **Transaction Safety**: Payroll creation and updates use database transactions to ensure data integrity. If any step fails, the entire operation is rolled back.

4. **Status Restrictions**:
   - Only Draft/Pending payrolls can be updated
   - Only Pending payrolls can be approved
   - Only Approved payrolls can be marked as paid
   - Only Draft/Pending payrolls can be cancelled

5. **Duplicate Prevention**: The system prevents creating duplicate payroll records for the same employee in the same month/year.

6. **Date Handling**:
   - Pay period automatically set to 1st-last day of the month
   - Payment date defaults to last day of the month if not provided

7. **Decimal Precision**: All monetary values use DECIMAL(10, 2) for accurate financial calculations.

8. **Statutory Updates**: The Malaysian statutory rates (EPF, SOCSO, EIS, PCB) are implemented according to 2024 regulations. These should be reviewed and updated annually.

9. **Staff Access**: Staff members can only view their own payroll records and payslips. They cannot create, update, or delete any payroll records.

10. **Audit Trail**: The system tracks who processed and approved each payroll record, along with approval timestamps.
