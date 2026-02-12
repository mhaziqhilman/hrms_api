# Payroll Statutory Calculations

Documentation for the Malaysian statutory deduction engine used in payroll processing.

**Last Updated:** February 2026
**Effective Rates:** YA 2024/2025/2026 (SOCSO/EIS tables updated for Oct 2024 wage ceiling increase)

---

## Overview

The payroll system calculates four Malaysian statutory contributions:

| Contribution | Method | Wage Ceiling | Source |
|---|---|---|---|
| **EPF (KWSP)** | Percentage-based | No ceiling | Configurable per company |
| **SOCSO (PERKESO)** | Official 65-tier wage-band table | RM6,000 | Category 1 (Oct 2024) |
| **EIS (SIP)** | Official 65-tier wage-band table | RM6,000 | Oct 2024 table |
| **PCB (Income Tax)** | Full LHDN e-CP39 algorithm | N/A | YA 2024 progressive rates |

**Calculation Flow:**
```
Gross Salary → EPF → SOCSO → EIS → PCB (uses EPF result) → Net Salary
```

---

## File Structure

| File | Purpose |
|---|---|
| `src/utils/statutoryCalculations.js` | Main calculation engine (EPF, SOCSO, EIS, PCB) |
| `src/controllers/payrollController.js` | Orchestrates calculation with employee/YTD data |
| `src/controllers/statutoryConfigController.js` | Company-specific rate overrides (EPF rates) |
| `src/models/Employee.js` | Employee fields including PCB profile (tax_category, children, etc.) |
| `src/models/StatutoryConfig.js` | Per-company configurable rates |

---

## 1. EPF (KWSP) — Employees Provident Fund

### Rates
| Component | Rate | Notes |
|---|---|---|
| Employee | **11%** | Configurable via `epf_employee_rate` |
| Employer (salary <= RM5,000) | **13%** | Configurable via `epf_employer_rate_below_5000` |
| Employer (salary > RM5,000) | **12%** | Configurable via `epf_employer_rate_above_5000` |

### Calculation
```
EPF Employee = grossSalary * 0.11
EPF Employer = grossSalary * 0.13  (if salary <= RM5,000)
             = grossSalary * 0.12  (if salary > RM5,000)
```

### Rounding
- Rounded to 2 decimal places (nearest sen).

### Company Override
Rates are configurable per company via the `statutory_configs` table. The system reads these at calculation time and falls back to defaults if not set.

---

## 2. SOCSO (PERKESO) — Social Security Organization

### Category 1: Employment Injury + Invalidity Scheme
- For employees **under 60 years old**
- Uses **official 65-tier wage-band contribution table**
- Wage ceiling: **RM6,000** (effective 1 October 2024, previously RM5,000)

### How It Works
The system looks up the employee's gross salary in the 65-tier table and returns fixed RM amounts for both employee and employer. This is **not** a percentage calculation.

### Key Tiers (Examples)

| Wage Range (RM) | Employee (RM) | Employer (RM) |
|---|---|---|
| 0 – 30.00 | 0.10 | 0.40 |
| 1,000.01 – 1,100.00 | 5.25 | 18.35 |
| 3,000.01 – 3,100.00 | 15.25 | 53.35 |
| 3,400.01 – 3,500.00 | 17.25 | 60.35 |
| 5,000.01 – 5,100.00 | 25.25 | 88.35 |
| 5,900.01 – 6,000.00 | 29.75 | 104.15 |
| > 6,000.00 | **29.75** (cap) | **104.15** (cap) |

### Cap
For salaries above RM6,000, the maximum tier applies:
- Employee: **RM29.75**
- Employer: **RM104.15**

---

## 3. EIS (SIP) — Employment Insurance System

### Eligibility
- Employees aged **18–60 years old**

### Method
- Uses **official 65-tier wage-band contribution table** (same wage bands as SOCSO)
- Wage ceiling: **RM6,000** (effective 1 October 2024, previously RM4,000)
- Employee and employer contributions are **equal** amounts

### Key Tiers (Examples)

| Wage Range (RM) | Employee (RM) | Employer (RM) |
|---|---|---|
| 0 – 30.00 | 0.05 | 0.05 |
| 1,000.01 – 1,100.00 | 2.10 | 2.10 |
| 3,000.01 – 3,100.00 | 6.10 | 6.10 |
| 5,000.01 – 5,100.00 | 10.10 | 10.10 |
| 5,900.01 – 6,000.00 | 11.90 | 11.90 |
| > 6,000.00 | **11.90** (cap) | **11.90** (cap) |

### Cap
For salaries above RM6,000:
- Employee: **RM11.90**
- Employer: **RM11.90**

---

## 4. PCB — Monthly Tax Deduction (Potongan Cukai Bulanan)

### Algorithm
Implements the **full LHDN computerised calculation algorithm (e-CP39)** with YTD-based self-correcting formula.

### Tax Categories

| Code | Description | Reliefs |
|---|---|---|
| **KA** | Single / Divorced / Widowed | Individual relief only |
| **KB** | Married, spouse **not** working | Individual + spouse + spouse disabled relief |
| **KC** | Married, spouse **is** working | Individual relief only (same as KA for deduction purposes) |

### Employee Fields Required for PCB

These fields are stored in the `employees` table:

| Field | Type | Default | Description |
|---|---|---|---|
| `tax_category` | STRING | `'KA'` | Tax category: KA, KB, or KC |
| `number_of_children` | INTEGER | `0` | Total qualifying children |
| `children_in_higher_education` | INTEGER | `0` | Children in diploma/degree (RM8,000 relief each) |
| `disabled_self` | BOOLEAN | `false` | Employee has disability |
| `disabled_spouse` | BOOLEAN | `false` | Spouse has disability (KB only) |
| `disabled_children` | INTEGER | `0` | Number of disabled children (RM6,000 additional each) |

### Relief Amounts

| Relief | Amount (RM) | Condition |
|---|---|---|
| Individual (D) | 9,000 | Always |
| Spouse (S) | 4,000 | KB only |
| Disabled self (DU) | 6,000 | If `disabled_self = true` |
| Disabled spouse (SU) | 5,000 | KB only, if `disabled_spouse = true` |
| Child (normal) | 2,000 | Per qualifying child under 18 |
| Child (higher education) | 8,000 | Per child in diploma/degree |
| Disabled child | 6,000 | Per disabled child (additional) |
| EPF relief cap | 4,000 | Max EPF claimable for PCB |

### PCB Calculation Steps

```
Input:
  Y1 = current month gross salary
  Y  = YTD gross salary (previous months)
  K  = YTD EPF contributions (previous months)
  K1 = current month EPF contribution
  X  = YTD PCB already deducted
  Z  = YTD zakat paid
  n  = 12 - currentMonth (remaining months)

Step 1: Project annual gross
  totalGross = Y + Y1 + (Y1 * n)

Step 2: Project annual EPF (capped at RM4,000)
  totalEpf = min(K + K1 + (K1 * n), 4000)

Step 3: Net income
  netIncome = totalGross - totalEpf

Step 4: Total reliefs/deductions
  D = 9000 (individual)
  + S = 4000 (if KB)
  + DU = 6000 (if disabled self)
  + SU = 5000 (if KB + disabled spouse)
  + QC = (normalChildren * 2000) + (higherEdChildren * 8000) + (disabledChildren * 6000)

Step 5: Chargeable income
  P = max(netIncome - totalDeductions, 0)

Step 6: Look up tax bracket → get M, rate, cumTax

Step 7: Get B value (cumulative tax with rebate)
  if P <= 35000: B = max(cumTax - rebate, 0)
    rebate = 400 (individual) + 400 (spouse, if KB)
  if P > 35000: B = cumTax

Step 8: Annual tax on normal remuneration
  T = ((P - M) * rate / 100) + B    (min 0)

Step 9: Monthly PCB
  PCB = (T - Z - X) / (n + 1)    (min 0)

Step 10: Additional remuneration (bonus, arrears)
  If present: recalculate P with additional amount,
  compute T_with_additional, then:
  PCB_additional = T_with_additional - T_normal

Step 11: Total PCB = PCB_normal + PCB_additional

Step 12: Minimum threshold
  if totalPCB < 10: totalPCB = 0

Step 13: PCB rounding
  Truncate to 2 decimal places, then round UP to nearest 5 sen
```

### Tax Brackets (YA 2024/2025/2026)

| Chargeable Income (RM) | M (RM) | Rate (%) | Cumulative Tax (RM) |
|---|---|---|---|
| 0 – 5,000 | 0 | 0 | 0 |
| 5,001 – 20,000 | 5,000 | 1 | 0 |
| 20,001 – 35,000 | 20,000 | 3 | 150 |
| 35,001 – 50,000 | 35,000 | 6 | 600 |
| 50,001 – 70,000 | 50,000 | 11 | 1,500 |
| 70,001 – 100,000 | 70,000 | 19 | 3,700 |
| 100,001 – 400,000 | 100,000 | 25 | 9,400 |
| 400,001 – 600,000 | 400,000 | 26 | 84,400 |
| 600,001 – 2,000,000 | 600,000 | 28 | 136,400 |
| > 2,000,000 | 2,000,000 | 30 | 528,400 |

### Non-Resident Tax
If employee is non-resident, a flat **30%** rate is applied instead of the progressive table.

---

## 5. Payroll Controller Flow

### `calculatePayroll()` — Create New Payroll

1. Validate employee belongs to the user's company and is active
2. Check for duplicate (same employee + month + year)
3. Calculate gross salary: `basic_salary + allowances + overtime_pay + bonus + commission`
4. Fetch **YTD data** from previous payroll records in the same year:
   - `ytdGross` — Sum of `gross_salary` from previous months
   - `ytdEpf` — Sum of `epf_employee` from previous months
   - `ytdPcbDeducted` — Sum of `pcb_deduction` from previous months
5. Call `calculateAllStatutory(grossSalary, options)` with:
   - Employee PCB profile (tax_category, children, disabilities)
   - YTD data (gross, EPF, PCB)
   - Current month
   - Additional remuneration (bonus + commission)
6. Calculate net salary: `gross_salary - totalEmployeeDeduction - unpaid_leave_deduction - other_deductions`
7. Create payroll record with full statutory breakdown
8. Update YTD statutory summary

### `updatePayroll()` — Edit Existing Payroll

Same flow as calculate, but:
- Cannot update payrolls with status `Paid`
- Recalculates statutory deductions when any salary component changes
- Fetches YTD from payrolls **before** the current payroll's month

---

## 6. `calculateAllStatutory()` API

### Signature
```javascript
calculateAllStatutory(monthlySalary, options = {})
```

### Options

| Parameter | Type | Default | Description |
|---|---|---|---|
| `hasEPF` | boolean | `true` | Include EPF calculation |
| `hasSOCSO` | boolean | `true` | Include SOCSO calculation |
| `hasEIS` | boolean | `true` | Include EIS calculation |
| `hasPCB` | boolean | `true` | Include PCB calculation |
| `rateOverrides` | object | `null` | Company-specific EPF rates |
| `employee` | object | `{}` | Employee PCB profile |
| `ytd` | object | `{}` | YTD data for PCB |
| `currentMonth` | number | Current month | 1–12 |
| `additionalRemuneration` | number | `0` | Bonus/arrears for PCB |

### Return Value
```javascript
{
  epf:    { employee: number, employer: number },
  socso:  { employee: number, employer: number },
  eis:    { employee: number, employer: number },
  pcb:    number,
  totalEmployeeDeduction: number,   // EPF + SOCSO + EIS + PCB (employee portion)
  totalEmployerContribution: number // EPF + SOCSO + EIS (employer portion)
}
```

---

## 7. Frontend Estimation

The payroll form shows **estimated** deductions as the user fills in salary fields. These are simplified approximations — final amounts are calculated by the backend.

| Contribution | Frontend Estimate |
|---|---|
| EPF | `grossSalary * 0.11` |
| SOCSO | `grossSalary > 6000 ? 29.75 : grossSalary * 0.005` |
| EIS | `grossSalary > 6000 ? 11.90 : grossSalary * 0.002` |
| PCB | Not estimated (backend only) |

A note is displayed: *"This is an estimated calculation. Final statutory deductions will be calculated precisely by the system."*

---

## 8. Database Migration

### Migration 006: PCB Employee Fields

Added the following columns to the `employees` table:

```sql
ALTER TABLE employees ALTER COLUMN tax_category SET DEFAULT 'KA';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS number_of_children INTEGER DEFAULT 0;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS children_in_higher_education INTEGER DEFAULT 0;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS disabled_self BOOLEAN DEFAULT false;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS disabled_spouse BOOLEAN DEFAULT false;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS disabled_children INTEGER DEFAULT 0;
UPDATE employees SET tax_category = 'KA' WHERE tax_category = 'Individual' OR tax_category IS NULL;
```

**Runner:** `database/migrations/run-006-migration.js`

---

## 9. Configurable Rates (Statutory Config)

The following rates are stored per-company in the `statutory_configs` table and can be adjusted by admins:

| Config Key | Default | Description |
|---|---|---|
| `epf_employee_rate` | `0.11` | EPF employee rate (11%) |
| `epf_employer_rate_below_5000` | `0.13` | EPF employer rate for salary <= RM5,000 |
| `epf_employer_rate_above_5000` | `0.12` | EPF employer rate for salary > RM5,000 |
| `epf_employer_threshold` | `5000` | EPF employer rate salary threshold |
| `socso_max_salary` | `6000` | SOCSO wage ceiling |
| `eis_max_salary` | `6000` | EIS wage ceiling |

SOCSO and EIS use fixed contribution tables and are **not** configurable via percentage — only the wage ceiling is stored for reference.

---

## 10. Verification Scenarios

| Scenario | EPF (Employee) | SOCSO (Employee) | EIS (Employee) | Notes |
|---|---|---|---|---|
| RM3,500 salary | RM385.00 | RM17.25 | RM6.90 | SOCSO tier 39, EIS tier 39 |
| RM5,000 salary | RM550.00 | RM24.75 | RM9.90 | EPF employer 13% |
| RM5,500 salary | RM605.00 | RM27.25 | RM10.90 | SOCSO tier 59 |
| RM6,000 salary | RM660.00 | RM29.75 | RM11.90 | At wage ceiling |
| RM8,000 salary | RM880.00 | RM29.75 | RM11.90 | Above ceiling, capped |
| RM10,000 salary | RM1,100.00 | RM29.75 | RM11.90 | EPF employer 12% |

PCB verification should be cross-checked with the LHDN e-CP39 calculator.
