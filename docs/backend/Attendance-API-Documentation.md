# Attendance & WFH API Documentation

## Overview
The Attendance API provides comprehensive attendance tracking functionality including clock in/out management, Work From Home (WFH) applications, attendance reports, and automatic late/early leave detection. The system supports both office and WFH attendance types with location tracking.

## Base URL
```
http://localhost:3000/api/attendance
```

## Authentication
All endpoints require JWT authentication via the `Authorization` header:
```
Authorization: Bearer <jwt_token>
```

## Endpoints

### 1. Clock In
Record employee clock-in time. The system automatically:
- Detects late arrivals (after 9:00 AM for office)
- Validates WFH approval for WFH type
- Records location information
- Prevents duplicate clock-ins

**Endpoint:** `POST /api/attendance/clock-in`

**Access:** All authenticated users

**Request Body:**
```json
{
  "employee_id": 1,
  "type": "Office",
  "location_lat": 3.1390,
  "location_long": 101.6869,
  "location_address": "KLCC, Kuala Lumpur"
}
```

**Validation Rules:**
- `employee_id`: Required, must be an integer
- `type`: Optional, must be "Office" or "WFH" (default: "Office")
- `location_lat`: Optional, decimal number
- `location_long`: Optional, decimal number
- `location_address`: Optional, string

**Business Rules:**
- Staff can only clock in for themselves
- Cannot clock in twice without clocking out
- WFH type requires approved WFH application for the day
- Late detection: Office clock-ins after 9:00 AM are flagged

**Response:**
```json
{
  "success": true,
  "message": "Clocked in successfully",
  "data": {
    "id": 1,
    "employee_id": 1,
    "date": "2024-12-05",
    "clock_in_time": "2024-12-05T09:15:00.000Z",
    "clock_out_time": null,
    "total_hours": null,
    "type": "Office",
    "location_lat": "3.13900000",
    "location_long": "101.68690000",
    "location_address": "KLCC, Kuala Lumpur",
    "is_late": true,
    "is_early_leave": false,
    "remarks": null,
    "created_at": "2024-12-05T09:15:00.000Z",
    "updated_at": "2024-12-05T09:15:00.000Z"
  }
}
```

---

### 2. Clock Out
Record employee clock-out time. The system automatically:
- Calculates total working hours
- Detects early leave (before 6:00 PM for office)
- Updates attendance record

**Endpoint:** `POST /api/attendance/clock-out`

**Access:** All authenticated users

**Request Body:**
```json
{
  "employee_id": 1,
  "location_lat": 3.1390,
  "location_long": 101.6869,
  "location_address": "KLCC, Kuala Lumpur"
}
```

**Validation Rules:**
- `employee_id`: Required, must be an integer
- `location_lat`: Optional, decimal number
- `location_long`: Optional, decimal number
- `location_address`: Optional, string

**Business Rules:**
- Staff can only clock out for themselves
- Must have clocked in today before clocking out
- Cannot clock out twice
- Early leave detection: Office clock-outs before 6:00 PM are flagged

**Response:**
```json
{
  "success": true,
  "message": "Clocked out successfully",
  "data": {
    "id": 1,
    "employee_id": 1,
    "date": "2024-12-05",
    "clock_in_time": "2024-12-05T09:15:00.000Z",
    "clock_out_time": "2024-12-05T18:30:00.000Z",
    "total_hours": "9.25",
    "type": "Office",
    "location_lat": "3.13900000",
    "location_long": "101.68690000",
    "location_address": "KLCC, Kuala Lumpur",
    "is_late": true,
    "is_early_leave": false,
    "remarks": null
  }
}
```

---

### 3. Get All Attendance Records
Retrieve a paginated list of attendance records with optional filtering.

**Endpoint:** `GET /api/attendance`

**Access:** Admin, Manager, Staff (own records only)

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| page | integer | No | Page number (default: 1, min: 1) |
| limit | integer | No | Items per page (default: 10, max: 100) |
| employee_id | integer | No | Filter by employee ID |
| type | string | No | Filter by type (Office, WFH) |
| start_date | date | No | Filter from date (YYYY-MM-DD) |
| end_date | date | No | Filter to date (YYYY-MM-DD) |
| is_late | boolean | No | Filter by late status |
| is_early_leave | boolean | No | Filter by early leave status |

**Response:**
```json
{
  "success": true,
  "data": {
    "attendance": [
      {
        "id": 1,
        "employee_id": 1,
        "date": "2024-12-05",
        "clock_in_time": "2024-12-05T09:15:00.000Z",
        "clock_out_time": "2024-12-05T18:30:00.000Z",
        "total_hours": "9.25",
        "type": "Office",
        "location_lat": "3.13900000",
        "location_long": "101.68690000",
        "location_address": "KLCC, Kuala Lumpur",
        "is_late": true,
        "is_early_leave": false,
        "remarks": null,
        "employee": {
          "id": 1,
          "employee_id": "EMP001",
          "full_name": "John Doe",
          "department": "IT",
          "position": "Software Engineer"
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

### 4. Get Attendance by ID
Retrieve a specific attendance record.

**Endpoint:** `GET /api/attendance/:id`

**Access:** Admin, Manager, Staff (own record only)

**URL Parameters:**
- `id` (integer) - Attendance record ID

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "employee_id": 1,
    "date": "2024-12-05",
    "clock_in_time": "2024-12-05T09:15:00.000Z",
    "clock_out_time": "2024-12-05T18:30:00.000Z",
    "total_hours": "9.25",
    "type": "Office",
    "location_lat": "3.13900000",
    "location_long": "101.68690000",
    "location_address": "KLCC, Kuala Lumpur",
    "is_late": true,
    "is_early_leave": false,
    "remarks": null,
    "employee": {
      "id": 1,
      "employee_id": "EMP001",
      "full_name": "John Doe",
      "department": "IT",
      "position": "Software Engineer"
    }
  }
}
```

---

### 5. Update Attendance Record
Manually adjust attendance record (admin/manager only). The system automatically recalculates total hours if times are updated.

**Endpoint:** `PUT /api/attendance/:id`

**Access:** Admin, Manager only

**URL Parameters:**
- `id` (integer) - Attendance record ID

**Request Body:**
```json
{
  "clock_in_time": "2024-12-05T09:00:00.000Z",
  "clock_out_time": "2024-12-05T18:00:00.000Z",
  "type": "Office",
  "remarks": "Manual adjustment - system error"
}
```

**Note:**
- All fields are optional
- Total hours are automatically recalculated if times change
- Used for manual corrections

**Response:**
```json
{
  "success": true,
  "message": "Attendance record updated successfully",
  "data": {
    "id": 1,
    "total_hours": "9.00",
    "remarks": "Manual adjustment - system error",
    ...
  }
}
```

---

### 6. Delete Attendance Record
Delete an attendance record (admin only).

**Endpoint:** `DELETE /api/attendance/:id`

**Access:** Admin only

**URL Parameters:**
- `id` (integer) - Attendance record ID

**Response:**
```json
{
  "success": true,
  "message": "Attendance record deleted successfully"
}
```

---

### 7. Get Attendance Summary
Retrieve monthly attendance summary with statistics for an employee.

**Endpoint:** `GET /api/attendance/summary/:employee_id`

**Access:** Admin, Manager, Staff (own summary only)

**URL Parameters:**
- `employee_id` (integer) - Employee ID

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| month | integer | No | Month (1-12, default: current month) |
| year | integer | No | Year (2020-2100, default: current year) |

**Response:**
```json
{
  "success": true,
  "data": {
    "employee": {
      "id": 1,
      "employee_id": "EMP001",
      "full_name": "John Doe",
      "department": "IT"
    },
    "period": {
      "month": 12,
      "year": 2024
    },
    "summary": {
      "total_working_days": 20,
      "total_hours": "180.50",
      "office_days": 15,
      "wfh_days": 5,
      "late_count": 2,
      "early_leave_count": 1,
      "records": [
        {
          "date": "2024-12-01",
          "clock_in_time": "2024-12-01T09:00:00.000Z",
          "clock_out_time": "2024-12-01T18:00:00.000Z",
          "total_hours": 9.00,
          "type": "Office",
          "is_late": false,
          "is_early_leave": false
        },
        ...
      ]
    }
  }
}
```

---

### 8. Apply for WFH
Submit a Work From Home application.

**Endpoint:** `POST /api/attendance/wfh`

**Access:** All authenticated users

**Request Body:**
```json
{
  "employee_id": 1,
  "date": "2024-12-10",
  "reason": "Home internet installation scheduled"
}
```

**Validation Rules:**
- `employee_id`: Required, must be an integer
- `date`: Required, must be ISO8601 date (YYYY-MM-DD)
- `reason`: Required, non-empty string

**Business Rules:**
- Staff can only apply for themselves
- Cannot apply for dates with existing WFH application
- WFH status starts as "Pending"

**Response:**
```json
{
  "success": true,
  "message": "WFH application submitted successfully",
  "data": {
    "id": 1,
    "employee_id": 1,
    "date": "2024-12-10",
    "reason": "Home internet installation scheduled",
    "status": "Pending",
    "approver_id": null,
    "approved_at": null,
    "rejection_reason": null,
    "created_at": "2024-12-05T10:00:00.000Z",
    "updated_at": "2024-12-05T10:00:00.000Z",
    "employee": {
      "id": 1,
      "employee_id": "EMP001",
      "full_name": "John Doe",
      "department": "IT"
    }
  }
}
```

---

### 9. Get All WFH Applications
Retrieve a paginated list of WFH applications with optional filtering.

**Endpoint:** `GET /api/attendance/wfh`

**Access:** Admin, Manager, Staff (own records only)

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| page | integer | No | Page number (default: 1, min: 1) |
| limit | integer | No | Items per page (default: 10, max: 100) |
| status | string | No | Filter by status (Pending, Approved, Rejected) |
| employee_id | integer | No | Filter by employee ID |
| start_date | date | No | Filter from date (YYYY-MM-DD) |
| end_date | date | No | Filter to date (YYYY-MM-DD) |

**Response:**
```json
{
  "success": true,
  "data": {
    "wfh_applications": [
      {
        "id": 1,
        "employee_id": 1,
        "date": "2024-12-10",
        "reason": "Home internet installation scheduled",
        "status": "Approved",
        "approver_id": 2,
        "approved_at": "2024-12-05T14:00:00.000Z",
        "rejection_reason": null,
        "employee": {
          "id": 1,
          "employee_id": "EMP001",
          "full_name": "John Doe",
          "department": "IT",
          "position": "Software Engineer"
        },
        "approver": {
          "id": 2,
          "username": "manager",
          "full_name": "Manager Name"
        }
      }
    ],
    "pagination": {
      "total": 15,
      "currentPage": 1,
      "limit": 10,
      "totalPages": 2
    }
  }
}
```

---

### 10. Approve or Reject WFH Application
Approve or reject a pending WFH application.

**Endpoint:** `PATCH /api/attendance/wfh/:id/approve-reject`

**Access:** Admin, Manager only

**URL Parameters:**
- `id` (integer) - WFH application ID

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
  "rejection_reason": "WFH quota exceeded for this month"
}
```

**Validation:**
- `action`: Required, must be "approve" or "reject"
- `rejection_reason`: Required if action is "reject"

**Business Rules:**
- Only pending WFH applications can be approved/rejected
- Rejection reason is mandatory when rejecting

**Response:**
```json
{
  "success": true,
  "message": "WFH application approved successfully",
  "data": {
    "id": 1,
    "status": "Approved",
    "approver_id": 2,
    "approved_at": "2024-12-05T14:00:00.000Z",
    "employee": {
      "id": 1,
      "employee_id": "EMP001",
      "full_name": "John Doe",
      "department": "IT"
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

## Data Models

### Attendance Model
```javascript
{
  id: INTEGER (Primary Key, Auto Increment),
  employee_id: INTEGER (Foreign Key, Not Null),
  date: DATEONLY (Not Null),
  clock_in_time: DATE,
  clock_out_time: DATE,
  total_hours: DECIMAL(5, 2),
  type: ENUM('Office', 'WFH') (Default: 'Office'),
  location_lat: DECIMAL(10, 8),
  location_long: DECIMAL(11, 8),
  location_address: STRING(255),
  is_late: BOOLEAN (Default: false),
  is_early_leave: BOOLEAN (Default: false),
  remarks: TEXT,
  created_at: TIMESTAMP,
  updated_at: TIMESTAMP,
  UNIQUE (employee_id, date)
}
```

### WFHApplication Model
```javascript
{
  id: INTEGER (Primary Key, Auto Increment),
  employee_id: INTEGER (Foreign Key, Not Null),
  date: DATEONLY (Not Null),
  reason: TEXT (Not Null),
  status: ENUM('Pending', 'Approved', 'Rejected') (Default: 'Pending'),
  approver_id: INTEGER (Foreign Key),
  approved_at: DATE,
  rejection_reason: TEXT,
  created_at: TIMESTAMP,
  updated_at: TIMESTAMP
}
```

## Business Logic

### Clock In Process
1. Validate employee exists
2. Check for existing clock-in today (prevent duplicates)
3. If type is WFH, validate approved WFH application for the date
4. Record clock-in time with location
5. Detect late arrival: Office type after 9:00 AM

### Clock Out Process
1. Validate employee has clocked in today
2. Check if already clocked out (prevent duplicates)
3. Record clock-out time with location
4. Calculate total working hours
5. Detect early leave: Office type before 6:00 PM

### Office Hours
- **Start Time:** 9:00 AM
- **End Time:** 6:00 PM
- **Late Detection:** Clock-in after 9:00 AM (Office only)
- **Early Leave Detection:** Clock-out before 6:00 PM (Office only)

### WFH Application Workflow
```
Pending → Approved
   ↓
Rejected
```

1. Employee applies for WFH
2. Manager/Admin approves or rejects
3. If approved, employee can clock in with type "WFH"
4. WFH attendance has no late/early leave restrictions

### Attendance Summary Calculation
- **Total Working Days:** Number of attendance records in period
- **Total Hours:** Sum of all total_hours
- **Office Days:** Count of type="Office"
- **WFH Days:** Count of type="WFH"
- **Late Count:** Count of is_late=true
- **Early Leave Count:** Count of is_early_leave=true

## Error Responses

### 403 Forbidden
```json
{
  "success": false,
  "message": "You can only clock in for yourself"
}
```

### 404 Not Found
```json
{
  "success": false,
  "message": "You have not clocked in today"
}
```

### 409 Conflict
```json
{
  "success": false,
  "message": "You have already clocked in today"
}
```

```json
{
  "success": false,
  "message": "You do not have an approved WFH application for today"
}
```

## Permissions

| Endpoint | Admin | Manager | Staff |
|----------|-------|---------|-------|
| POST /attendance/clock-in | ✓ | ✓ | ✓ |
| POST /attendance/clock-out | ✓ | ✓ | ✓ |
| GET /attendance | ✓ | ✓ | ✓ (own) |
| GET /attendance/:id | ✓ | ✓ | ✓ (own) |
| PUT /attendance/:id | ✓ | ✓ | ✗ |
| DELETE /attendance/:id | ✓ | ✗ | ✗ |
| GET /attendance/summary/:employee_id | ✓ | ✓ | ✓ (own) |
| POST /attendance/wfh | ✓ | ✓ | ✓ |
| GET /attendance/wfh | ✓ | ✓ | ✓ (own) |
| PATCH /attendance/wfh/:id/approve-reject | ✓ | ✓ | ✗ |

## Implementation Files

- **Models:**
  - `src/models/Attendance.js`
  - `src/models/WFHApplication.js`
- **Controller:** `src/controllers/attendanceController.js`
- **Routes:** `src/routes/attendance.routes.js`
- **Middleware:**
  - `src/middleware/auth.middleware.js` (JWT verification)
  - `src/middleware/rbac.middleware.js` (Role-based access control)

## Notes

1. **Location Tracking:** GPS coordinates and address are captured for both clock-in and clock-out.

2. **Automatic Detection:** Late arrivals and early leaves are automatically detected based on office hours (9 AM - 6 PM).

3. **WFH Integration:** WFH type requires prior approval. No late/early leave flags for WFH.

4. **Hours Calculation:** Total hours automatically calculated: (clock_out_time - clock_in_time) in hours.

5. **Duplicate Prevention:** System prevents clocking in twice or clocking out without clocking in.

6. **Date-based Uniqueness:** Only one attendance record per employee per date.

7. **Manual Adjustments:** Admin/Manager can manually adjust attendance times with remarks.

8. **Monthly Summary:** Provides comprehensive monthly statistics including hours, days, and flags.

9. **WFH Workflow:** Simple one-level approval workflow for WFH applications.

10. **Staff Restrictions:** Staff can only view and manage their own attendance records.
