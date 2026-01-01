# Leave API Documentation

## Overview
The Leave API provides comprehensive leave management functionality including leave applications, approval workflows, leave balance tracking, and entitlement management. The system supports multiple leave types, half-day leaves, and automatic balance calculations.

## Base URL
```
http://localhost:3000/api/leaves
```

## Authentication
All endpoints require JWT authentication via the `Authorization` header:
```
Authorization: Bearer <jwt_token>
```

## Endpoints

### 1. Get All Leave Applications
Retrieve a paginated list of leave applications with optional filtering.

**Endpoint:** `GET /api/leaves`

**Access:** Admin, Manager, Staff (own records only)

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| page | integer | No | Page number (default: 1, min: 1) |
| limit | integer | No | Items per page (default: 10, max: 100) |
| status | string | No | Filter by status (Pending, Approved, Rejected, Cancelled) |
| employee_id | integer | No | Filter by employee ID |
| leave_type_id | integer | No | Filter by leave type ID |
| start_date | date | No | Filter by start date (YYYY-MM-DD) |
| end_date | date | No | Filter by end date (YYYY-MM-DD) |

**Response:**
```json
{
  "success": true,
  "data": {
    "leaves": [
      {
        "id": 1,
        "employee_id": 1,
        "leave_type_id": 1,
        "start_date": "2024-12-20",
        "end_date": "2024-12-22",
        "total_days": "3.00",
        "is_half_day": false,
        "half_day_period": null,
        "reason": "Family vacation",
        "attachment_url": null,
        "status": "Approved",
        "approver_id": 2,
        "approved_at": "2024-12-15T10:00:00.000Z",
        "rejection_reason": null,
        "created_at": "2024-12-10T08:00:00.000Z",
        "updated_at": "2024-12-15T10:00:00.000Z",
        "employee": {
          "id": 1,
          "employee_id": "EMP001",
          "full_name": "John Doe",
          "department": "IT",
          "position": "Software Engineer"
        },
        "leave_type": {
          "id": 1,
          "name": "Annual Leave",
          "is_paid": true
        },
        "approver": {
          "id": 2,
          "username": "manager",
          "full_name": "Manager Name"
        }
      }
    ],
    "pagination": {
      "total": 25,
      "currentPage": 1,
      "limit": 10,
      "totalPages": 3
    }
  }
}
```

---

### 2. Get Leave Application by ID
Retrieve detailed information for a specific leave application.

**Endpoint:** `GET /api/leaves/:id`

**Access:** Admin, Manager, Staff (own record only)

**URL Parameters:**
- `id` (integer) - Leave application ID

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "employee_id": 1,
    "leave_type_id": 1,
    "start_date": "2024-12-20",
    "end_date": "2024-12-22",
    "total_days": "3.00",
    "is_half_day": false,
    "half_day_period": null,
    "reason": "Family vacation",
    "attachment_url": null,
    "status": "Approved",
    "approver_id": 2,
    "approved_at": "2024-12-15T10:00:00.000Z",
    "rejection_reason": null,
    "employee": {
      "id": 1,
      "employee_id": "EMP001",
      "full_name": "John Doe",
      "department": "IT",
      "position": "Software Engineer",
      "reporting_manager_id": 2
    },
    "leave_type": {
      "id": 1,
      "name": "Annual Leave",
      "is_paid": true,
      "requires_document": false
    },
    "approver": {
      "id": 2,
      "username": "manager",
      "full_name": "Manager Name"
    }
  }
}
```

---

### 3. Apply for Leave
Submit a new leave application. The system automatically:
- Validates leave balance
- Checks for overlapping leave applications
- Updates leave entitlement (moves days from available to pending)
- Calculates total days including half-day support

**Endpoint:** `POST /api/leaves`

**Access:** All authenticated users

**Request Body:**
```json
{
  "employee_id": 1,
  "leave_type_id": 1,
  "start_date": "2024-12-20",
  "end_date": "2024-12-22",
  "is_half_day": false,
  "half_day_period": null,
  "reason": "Family vacation",
  "attachment_url": null
}
```

**Validation Rules:**
- `employee_id`: Required, must be an integer
- `leave_type_id`: Required, must be an integer
- `start_date`: Required, must be ISO8601 date (YYYY-MM-DD)
- `end_date`: Required, must be ISO8601 date (YYYY-MM-DD)
- `is_half_day`: Optional, boolean (default: false)
- `half_day_period`: Optional, must be "AM" or "PM" (required if is_half_day is true)
- `reason`: Required, non-empty string
- `attachment_url`: Optional, must be valid URL

**Business Rules:**
- Staff can only apply for their own leave
- Employee and leave type must exist
- Sufficient leave balance required
- No overlapping leave applications allowed
- Total days automatically calculated

**Response:**
```json
{
  "success": true,
  "message": "Leave application submitted successfully",
  "data": {
    "id": 1,
    "employee_id": 1,
    "leave_type_id": 1,
    "start_date": "2024-12-20",
    "end_date": "2024-12-22",
    "total_days": "3.00",
    "status": "Pending",
    "employee": {
      "id": 1,
      "employee_id": "EMP001",
      "full_name": "John Doe",
      "department": "IT"
    },
    "leave_type": {
      "id": 1,
      "name": "Annual Leave",
      "is_paid": true
    }
  }
}
```

---

### 4. Update Leave Application
Update a pending leave application. Only pending leaves can be updated.

**Endpoint:** `PUT /api/leaves/:id`

**Access:** Admin, Manager, Staff (own record only)

**URL Parameters:**
- `id` (integer) - Leave application ID

**Request Body:**
```json
{
  "start_date": "2024-12-21",
  "end_date": "2024-12-23",
  "reason": "Extended family vacation",
  "attachment_url": "https://example.com/medical-certificate.pdf"
}
```

**Note:**
- Only pending leaves can be updated
- All fields are optional
- If dates change, leave balance is automatically recalculated
- Entitlement is updated accordingly

**Response:**
```json
{
  "success": true,
  "message": "Leave application updated successfully",
  "data": {
    "id": 1,
    "employee_id": 1,
    "total_days": "3.00",
    "status": "Pending",
    ...
  }
}
```

---

### 5. Approve or Reject Leave Application
Approve or reject a pending leave application. The system automatically updates leave entitlements:
- **Approve**: Moves days from pending to used
- **Reject**: Restores days from pending back to balance

**Endpoint:** `PATCH /api/leaves/:id/approve-reject`

**Access:** Admin, Manager only

**URL Parameters:**
- `id` (integer) - Leave application ID

**Request Body:**
```json
{
  "action": "approve",
  "rejection_reason": null
}
```

**OR**

```json
{
  "action": "reject",
  "rejection_reason": "Insufficient staffing during this period"
}
```

**Validation:**
- `action`: Required, must be "approve" or "reject"
- `rejection_reason`: Required if action is "reject"

**Business Rules:**
- Only pending leaves can be approved/rejected
- Rejection reason is mandatory when rejecting
- Entitlement automatically updated based on action

**Response:**
```json
{
  "success": true,
  "message": "Leave application approved successfully",
  "data": {
    "id": 1,
    "status": "Approved",
    "approver_id": 2,
    "approved_at": "2024-12-15T10:00:00.000Z",
    "employee": {
      "id": 1,
      "employee_id": "EMP001",
      "full_name": "John Doe",
      "department": "IT"
    },
    "leave_type": {
      "id": 1,
      "name": "Annual Leave",
      "is_paid": true
    },
    "approver": {
      "id": 2,
      "username": "manager",
      "full_name": "Manager Name"
    }
  }
}
```

---

### 6. Cancel Leave Application
Cancel a pending or approved leave application. The system automatically restores leave balance.

**Endpoint:** `DELETE /api/leaves/:id`

**Access:** Admin, Staff (own record only)

**URL Parameters:**
- `id` (integer) - Leave application ID

**Business Rules:**
- Only pending or approved leaves can be cancelled
- Balance is restored based on previous status:
  - Pending: Restores from pending to balance
  - Approved: Restores from used to balance

**Response:**
```json
{
  "success": true,
  "message": "Leave application cancelled successfully"
}
```

---

### 7. Get Leave Balance
Retrieve leave balance and entitlements for an employee.

**Endpoint:** `GET /api/leaves/balance/:employee_id`

**Access:** Admin, Manager, Staff (own balance only)

**URL Parameters:**
- `employee_id` (integer) - Employee ID

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| year | integer | No | Year (default: current year, 2020-2100) |

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
    "year": 2024,
    "entitlements": [
      {
        "leave_type": {
          "id": 1,
          "name": "Annual Leave",
          "is_paid": true,
          "carry_forward_allowed": true
        },
        "total_days": 14.00,
        "used_days": 5.00,
        "pending_days": 2.00,
        "balance_days": 7.00,
        "carry_forward_days": 0.00
      },
      {
        "leave_type": {
          "id": 2,
          "name": "Medical Leave",
          "is_paid": true,
          "carry_forward_allowed": false
        },
        "total_days": 14.00,
        "used_days": 1.00,
        "pending_days": 0.00,
        "balance_days": 13.00,
        "carry_forward_days": 0.00
      }
    ]
  }
}
```

---

## Data Models

### Leave Model
```javascript
{
  id: INTEGER (Primary Key, Auto Increment),
  employee_id: INTEGER (Foreign Key, Not Null),
  leave_type_id: INTEGER (Foreign Key, Not Null),
  start_date: DATEONLY (Not Null),
  end_date: DATEONLY (Not Null),
  total_days: DECIMAL(5, 2) (Not Null),
  is_half_day: BOOLEAN (Default: false),
  half_day_period: ENUM('AM', 'PM'),
  reason: TEXT (Not Null),
  attachment_url: STRING(255),
  status: ENUM('Pending', 'Approved', 'Rejected', 'Cancelled') (Default: 'Pending'),
  approver_id: INTEGER (Foreign Key),
  approved_at: DATE,
  rejection_reason: TEXT,
  created_at: TIMESTAMP,
  updated_at: TIMESTAMP
}
```

### LeaveType Model
```javascript
{
  id: INTEGER (Primary Key, Auto Increment),
  name: STRING(50) (Not Null, Unique),
  days_per_year: INTEGER (Default: 0),
  is_paid: BOOLEAN (Default: true),
  carry_forward_allowed: BOOLEAN (Default: false),
  carry_forward_max_days: INTEGER (Default: 0),
  prorate_for_new_joiners: BOOLEAN (Default: true),
  requires_document: BOOLEAN (Default: false),
  description: TEXT,
  created_at: TIMESTAMP,
  updated_at: TIMESTAMP
}
```

### LeaveEntitlement Model
```javascript
{
  id: INTEGER (Primary Key, Auto Increment),
  employee_id: INTEGER (Foreign Key, Not Null),
  leave_type_id: INTEGER (Foreign Key, Not Null),
  year: INTEGER (Not Null),
  total_days: DECIMAL(5, 2) (Not Null),
  used_days: DECIMAL(5, 2) (Default: 0),
  pending_days: DECIMAL(5, 2) (Default: 0),
  balance_days: DECIMAL(5, 2) (Not Null),
  carry_forward_days: DECIMAL(5, 2) (Default: 0),
  created_at: TIMESTAMP,
  updated_at: TIMESTAMP,
  UNIQUE (employee_id, leave_type_id, year)
}
```

## Leave Status Workflow

```
Pending → Approved
   ↓         ↓
Rejected  Cancelled
   ↓         ↓
Cancelled  Cancelled
```

**Status Descriptions:**
- **Pending:** Initial state when leave is applied. Can be updated, approved, rejected, or cancelled.
- **Approved:** Leave approved by manager. Can only be cancelled.
- **Rejected:** Leave rejected by manager with reason. Cannot be modified.
- **Cancelled:** Leave cancelled by employee or admin. Cannot be modified.

## Business Logic

### Leave Application Process
1. Validate employee and leave type exist
2. Calculate total days based on date range and half-day flag
3. Check if employee has sufficient leave balance
4. Check for overlapping leave applications
5. Create leave application with status "Pending"
6. Update entitlement: move days from balance to pending

### Leave Approval Process
1. Validate leave is in "Pending" status
2. Update status to "Approved"
3. Record approver and approval timestamp
4. Update entitlement: move days from pending to used

### Leave Rejection Process
1. Validate leave is in "Pending" status
2. Update status to "Rejected"
3. Record rejection reason, approver, and timestamp
4. Update entitlement: restore days from pending to balance

### Leave Cancellation Process
1. Validate leave is in "Pending" or "Approved" status
2. Update status to "Cancelled"
3. Update entitlement based on previous status:
   - If was Pending: restore from pending to balance
   - If was Approved: restore from used to balance

### Leave Balance Calculation
- **Total Days:** Annual entitlement for the leave type
- **Used Days:** Approved leaves that have been consumed
- **Pending Days:** Leaves awaiting approval
- **Balance Days:** Available = Total - Used - Pending
- **Carry Forward Days:** Unused days from previous year (if allowed)

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

### 403 Forbidden
```json
{
  "success": false,
  "message": "You can only apply for your own leave"
}
```

### 404 Not Found
```json
{
  "success": false,
  "message": "Leave application not found"
}
```

### 409 Conflict
```json
{
  "success": false,
  "message": "You already have a leave application for this date range"
}
```

### 422 Unprocessable Entity
```json
{
  "success": false,
  "message": "Insufficient leave balance. Available: 2.00 days, Requested: 3.00 days"
}
```

## Permissions

| Endpoint | Admin | Manager | Staff |
|----------|-------|---------|-------|
| GET /leaves | ✓ | ✓ | ✓ (own) |
| GET /leaves/:id | ✓ | ✓ | ✓ (own) |
| POST /leaves | ✓ | ✓ | ✓ |
| PUT /leaves/:id | ✓ | ✓ | ✓ (own) |
| PATCH /leaves/:id/approve-reject | ✓ | ✓ | ✗ |
| DELETE /leaves/:id | ✓ | ✗ | ✓ (own) |
| GET /leaves/balance/:employee_id | ✓ | ✓ | ✓ (own) |

## Implementation Files

- **Models:**
  - `src/models/Leave.js`
  - `src/models/LeaveType.js`
  - `src/models/LeaveEntitlement.js`
- **Controller:** `src/controllers/leaveController.js`
- **Routes:** `src/routes/leave.routes.js`
- **Middleware:**
  - `src/middleware/auth.middleware.js` (JWT verification)
  - `src/middleware/rbac.middleware.js` (Role-based access control)

## Notes

1. **Transaction Safety:** All operations that modify leave balance use database transactions to ensure data integrity.

2. **Automatic Balance Management:** The system automatically manages leave balances throughout the leave lifecycle without manual intervention.

3. **Half-Day Leave Support:** The system supports half-day leaves (AM/PM) which count as 0.5 days.

4. **Overlap Detection:** The system prevents employees from applying for overlapping leave periods.

5. **Leave Balance Validation:** The system validates available balance before allowing leave applications.

6. **Entitlement Tracking:** Entitlements track four states: total, used, pending, and balance days.

7. **Carry Forward:** Leave types can be configured to allow carry forward with maximum limits.

8. **Proration:** Leave entitlements can be prorated for employees who join mid-year.

9. **Document Requirements:** Leave types can require document attachments (e.g., medical certificates).

10. **Approval Workflow:** Simple one-level approval workflow (manager/admin approves).
