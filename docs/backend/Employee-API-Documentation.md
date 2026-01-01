# Employee API Documentation

## Overview
The Employee API provides comprehensive CRUD operations for managing employee records, including personal information, employment details, statutory information, and Year-to-Date (YTD) summaries.

## Base URL
```
http://localhost:3000/api/employees
```

## Authentication
All endpoints require JWT authentication via the `Authorization` header:
```
Authorization: Bearer <jwt_token>
```

## Endpoints

### 1. Get All Employees
Retrieve a paginated list of employees with optional filtering.

**Endpoint:** `GET /api/employees`

**Access:** Admin, Manager

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| page | integer | No | Page number (default: 1) |
| limit | integer | No | Items per page (default: 10) |
| status | string | No | Filter by employment status (Active, Resigned, Terminated) |
| department | string | No | Filter by department |
| employment_type | string | No | Filter by type (Permanent, Contract, Probation, Intern) |
| search | string | No | Search by name, employee_id, ic_no, or email |

**Response:**
```json
{
  "success": true,
  "data": {
    "employees": [
      {
        "id": 1,
        "employee_id": "EMP001",
        "full_name": "John Doe",
        "ic_no": "901234567890",
        "gender": "Male",
        "position": "Software Engineer",
        "department": "IT",
        "basic_salary": "5000.00",
        "employment_status": "Active",
        "employment_type": "Permanent",
        "join_date": "2023-01-15",
        "email": "john.doe@company.com",
        "mobile": "+60123456789",
        "created_at": "2023-01-10T00:00:00.000Z",
        "updated_at": "2023-01-10T00:00:00.000Z"
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

### 2. Get Employee Statistics
Retrieve summary statistics for employees.

**Endpoint:** `GET /api/employees/statistics`

**Access:** Admin, Manager

**Response:**
```json
{
  "success": true,
  "data": {
    "total": 50,
    "active": 45,
    "resigned": 3,
    "terminated": 2,
    "by_department": [
      { "department": "IT", "count": 15 },
      { "department": "HR", "count": 8 },
      { "department": "Finance", "count": 10 }
    ],
    "by_employment_type": [
      { "employment_type": "Permanent", "count": 35 },
      { "employment_type": "Contract", "count": 8 },
      { "employment_type": "Probation", "count": 5 }
    ]
  }
}
```

---

### 3. Get Employee by ID
Retrieve detailed information for a specific employee.

**Endpoint:** `GET /api/employees/:id`

**Access:** Admin, Manager, Staff (own record only)

**URL Parameters:**
- `id` (integer) - Employee ID

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "employee_id": "EMP001",
    "full_name": "John Doe",
    "ic_no": "901234567890",
    "passport_no": null,
    "date_of_birth": "1990-12-31",
    "gender": "Male",
    "marital_status": "Single",
    "nationality": "Malaysian",
    "race": "Malay",
    "religion": "Islam",
    "mobile": "+60123456789",
    "email": "john.doe@company.com",
    "emergency_contact_name": "Jane Doe",
    "emergency_contact_phone": "+60198765432",
    "current_address": "123 Main Street, KL",
    "permanent_address": "123 Main Street, KL",
    "position": "Software Engineer",
    "department": "IT",
    "reporting_manager_id": 2,
    "basic_salary": "5000.00",
    "join_date": "2023-01-15",
    "confirmation_date": "2023-04-15",
    "employment_type": "Permanent",
    "employment_status": "Active",
    "work_location": "Kuala Lumpur",
    "bank_name": "Maybank",
    "bank_account_no": "1234567890",
    "bank_account_holder": "John Doe",
    "epf_no": "12345678",
    "socso_no": "87654321",
    "tax_no": "SG1234567890",
    "tax_category": "Resident",
    "photo_url": null,
    "manager": {
      "id": 2,
      "employee_id": "EMP002",
      "full_name": "Manager Name",
      "position": "Senior Manager"
    }
  }
}
```

---

### 4. Create Employee
Create a new employee record.

**Endpoint:** `POST /api/employees`

**Access:** Admin, Manager

**Request Body:**
```json
{
  "employee_id": "EMP001",
  "full_name": "John Doe",
  "ic_no": "901234567890",
  "date_of_birth": "1990-12-31",
  "gender": "Male",
  "marital_status": "Single",
  "nationality": "Malaysian",
  "race": "Malay",
  "religion": "Islam",
  "mobile": "+60123456789",
  "email": "john.doe@company.com",
  "emergency_contact_name": "Jane Doe",
  "emergency_contact_phone": "+60198765432",
  "current_address": "123 Main Street, KL",
  "permanent_address": "123 Main Street, KL",
  "position": "Software Engineer",
  "department": "IT",
  "reporting_manager_id": 2,
  "basic_salary": 5000.00,
  "join_date": "2023-01-15",
  "employment_type": "Permanent",
  "work_location": "Kuala Lumpur",
  "bank_name": "Maybank",
  "bank_account_no": "1234567890",
  "bank_account_holder": "John Doe",
  "epf_no": "12345678",
  "socso_no": "87654321",
  "tax_no": "SG1234567890",
  "tax_category": "Resident"
}
```

**Validation Rules:**
- `employee_id`: Required, max 20 characters, must be unique
- `full_name`: Required, max 150 characters
- `ic_no`: Optional, must be 12 digits, must be unique
- `gender`: Required, must be "Male" or "Female"
- `basic_salary`: Required, must be a valid decimal
- `join_date`: Required, must be a valid date
- `email`: Optional, must be valid email format
- `employment_type`: Optional, must be one of: Permanent, Contract, Probation, Intern

**Response:**
```json
{
  "success": true,
  "message": "Employee created successfully",
  "data": {
    "id": 1,
    "employee_id": "EMP001",
    "full_name": "John Doe",
    ...
  }
}
```

---

### 5. Update Employee
Update an existing employee record.

**Endpoint:** `PUT /api/employees/:id`

**Access:** Admin, Manager

**URL Parameters:**
- `id` (integer) - Employee ID

**Request Body:**
```json
{
  "position": "Senior Software Engineer",
  "basic_salary": 6000.00,
  "employment_status": "Active"
}
```

**Note:** All fields are optional. Only provided fields will be updated.

**Response:**
```json
{
  "success": true,
  "message": "Employee updated successfully",
  "data": {
    "id": 1,
    "employee_id": "EMP001",
    "full_name": "John Doe",
    ...
  }
}
```

---

### 6. Delete Employee (Soft Delete)
Change employee status to Resigned or Terminated.

**Endpoint:** `DELETE /api/employees/:id`

**Access:** Admin

**URL Parameters:**
- `id` (integer) - Employee ID

**Request Body:**
```json
{
  "status": "Resigned",
  "reason": "Better opportunity"
}
```

**Validation:**
- `status`: Optional, must be "Resigned" or "Terminated" (default: "Resigned")
- `reason`: Optional string

**Response:**
```json
{
  "success": true,
  "message": "Employee resigned successfully",
  "data": {
    "id": 1,
    "employee_id": "EMP001",
    "employment_status": "Resigned",
    ...
  }
}
```

---

### 7. Get Employee YTD Summary
Retrieve Year-to-Date statutory summary for an employee.

**Endpoint:** `GET /api/employees/:id/ytd`

**Access:** Admin, Manager, Staff (own record only)

**URL Parameters:**
- `id` (integer) - Employee ID

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| year | integer | No | Year (default: current year) |

**Response:**
```json
{
  "success": true,
  "data": {
    "employee": {
      "id": 1,
      "employee_id": "EMP001",
      "full_name": "John Doe"
    },
    "ytd": {
      "id": 1,
      "employee_id": 1,
      "year": 2024,
      "month": 12,
      "gross_salary": "5500.00",
      "net_salary": "4850.00",
      "employee_epf": "605.00",
      "employer_epf": "660.00",
      "employee_socso": "24.75",
      "employer_socso": "86.65",
      "employee_eis": "8.00",
      "employer_eis": "8.00",
      "pcb_deduction": "50.00",
      "ytd_gross": "66000.00",
      "ytd_net": "58200.00",
      "ytd_employee_epf": "7260.00",
      "ytd_employer_epf": "7920.00",
      "ytd_employee_socso": "297.00",
      "ytd_employer_socso": "1039.80",
      "ytd_employee_eis": "96.00",
      "ytd_employer_eis": "96.00",
      "ytd_pcb": "600.00"
    }
  }
}
```

---

## Data Models

### Employee Model
```javascript
{
  id: INTEGER (Primary Key, Auto Increment),
  employee_id: STRING(20) (Unique, Not Null),
  full_name: STRING(150) (Not Null),
  ic_no: STRING(12) (Unique),
  passport_no: STRING(20),
  date_of_birth: DATE,
  gender: ENUM('Male', 'Female') (Not Null),
  marital_status: ENUM('Single', 'Married', 'Divorced', 'Widowed'),
  nationality: STRING(50),
  race: STRING(50),
  religion: STRING(50),
  mobile: STRING(20),
  email: STRING(100),
  emergency_contact_name: STRING(150),
  emergency_contact_phone: STRING(20),
  current_address: TEXT,
  permanent_address: TEXT,
  position: STRING(100),
  department: STRING(100),
  reporting_manager_id: INTEGER (Foreign Key),
  basic_salary: DECIMAL(10, 2) (Not Null),
  join_date: DATE (Not Null),
  confirmation_date: DATE,
  employment_type: ENUM('Permanent', 'Contract', 'Probation', 'Intern'),
  employment_status: ENUM('Active', 'Resigned', 'Terminated') (Default: 'Active'),
  work_location: STRING(100),
  bank_name: STRING(100),
  bank_account_no: STRING(50),
  bank_account_holder: STRING(150),
  epf_no: STRING(20),
  socso_no: STRING(20),
  tax_no: STRING(30),
  tax_category: ENUM('Resident', 'Non-Resident'),
  photo_url: STRING(255),
  user_id: INTEGER (Foreign Key),
  created_at: TIMESTAMP,
  updated_at: TIMESTAMP
}
```

### YTD Statutory Model
```javascript
{
  id: INTEGER (Primary Key, Auto Increment),
  employee_id: INTEGER (Foreign Key, Not Null),
  year: INTEGER (Not Null),
  month: INTEGER (Not Null),
  gross_salary: DECIMAL(10, 2),
  net_salary: DECIMAL(10, 2),
  employee_epf: DECIMAL(10, 2),
  employer_epf: DECIMAL(10, 2),
  employee_socso: DECIMAL(10, 2),
  employer_socso: DECIMAL(10, 2),
  employee_eis: DECIMAL(10, 2),
  employer_eis: DECIMAL(10, 2),
  pcb_deduction: DECIMAL(10, 2),
  ytd_gross: DECIMAL(10, 2),
  ytd_net: DECIMAL(10, 2),
  ytd_employee_epf: DECIMAL(10, 2),
  ytd_employer_epf: DECIMAL(10, 2),
  ytd_employee_socso: DECIMAL(10, 2),
  ytd_employer_socso: DECIMAL(10, 2),
  ytd_employee_eis: DECIMAL(10, 2),
  ytd_employer_eis: DECIMAL(10, 2),
  ytd_pcb: DECIMAL(10, 2),
  created_at: TIMESTAMP,
  updated_at: TIMESTAMP
}
```

## Error Responses

### 400 Bad Request
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    {
      "field": "employee_id",
      "message": "Employee ID is required"
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
  "message": "You do not have permission to view this employee"
}
```

### 404 Not Found
```json
{
  "success": false,
  "message": "Employee not found"
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

## Business Logic

### Employee Creation
1. Validates all required fields
2. Checks for duplicate employee_id and ic_no
3. Creates employee record with status "Active"
4. YTD records are NOT created on employee creation (created when payroll is processed)

### Employee Update
1. Validates fields if provided
2. Prevents updating: id, user_id, created_at
3. Checks for duplicate employee_id/ic_no if being changed
4. Updates only provided fields

### Employee Deletion (Soft)
1. Validates employee exists and is Active
2. Changes status to Resigned or Terminated
3. Logs reason for status change
4. Does not delete the record from database

### YTD Summary Retrieval
1. Finds the latest YTD record for the specified year
2. Returns cumulative totals from January to current month
3. Includes monthly breakdown and year-to-date totals

## Permissions

| Endpoint | Admin | Manager | Staff |
|----------|-------|---------|-------|
| GET /employees | ✓ | ✓ | ✗ |
| GET /employees/statistics | ✓ | ✓ | ✗ |
| GET /employees/:id | ✓ | ✓ | ✓ (own) |
| POST /employees | ✓ | ✓ | ✗ |
| PUT /employees/:id | ✓ | ✓ | ✗ |
| DELETE /employees/:id | ✓ | ✗ | ✗ |
| GET /employees/:id/ytd | ✓ | ✓ | ✓ (own) |

## Implementation Files

- **Model:** `src/models/Employee.js`
- **Controller:** `src/controllers/employeeController.js`
- **Routes:** `src/routes/employee.routes.js`
- **Middleware:**
  - `src/middleware/auth.middleware.js` (JWT verification)
  - `src/middleware/rbac.middleware.js` (Role-based access control)
  - `src/middleware/validation.middleware.js` (Request validation)

## Notes

1. **YTD Records**: YTD Statutory records are automatically created and updated when payroll is processed, not during employee creation.

2. **Soft Delete**: Employees are never hard-deleted from the database. Instead, their status is changed to "Resigned" or "Terminated".

3. **Manager Hierarchy**: The `reporting_manager_id` field creates a self-referencing relationship for organizational hierarchy.

4. **Search Functionality**: The search parameter performs a LIKE query across employee_id, full_name, ic_no, and email fields.

5. **Pagination**: Default pagination is 10 items per page, with a maximum of 100 items per page.

6. **Date Formats**: All dates are stored in YYYY-MM-DD format. Timestamps are in ISO 8601 format.

7. **Decimal Precision**: All monetary values use DECIMAL(10, 2) for precise financial calculations.
