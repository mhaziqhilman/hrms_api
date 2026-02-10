const XLSX = require('xlsx');

/**
 * Excel Export Service
 * Generates Excel files for analytics data export
 */

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

/**
 * Generate analytics Excel workbook
 * @param {String} type - Analytics type (payroll, leave, attendance, claims)
 * @param {Object} data - Analytics data
 * @returns {Buffer} Excel file buffer
 */
const generateAnalyticsExcel = async (type, data) => {
  const workbook = XLSX.utils.book_new();

  switch (type) {
    case 'payroll':
      generatePayrollSheets(workbook, data);
      break;
    case 'leave':
      generateLeaveSheets(workbook, data);
      break;
    case 'attendance':
      generateAttendanceSheets(workbook, data);
      break;
    case 'claims':
      generateClaimsSheets(workbook, data);
      break;
    default:
      throw new Error(`Unknown analytics type: ${type}`);
  }

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
};

/**
 * Generate payroll analytics sheets
 */
const generatePayrollSheets = (workbook, data) => {
  // Summary Sheet
  const summaryData = [
    ['Payroll Cost Analytics Summary'],
    [`Year: ${data.year}`],
    [`Period: Month ${data.period.startMonth} - ${data.period.endMonth}`],
    [],
    ['Metric', 'Value'],
    ['Total Gross Salary', formatCurrency(data.summary.total_gross)],
    ['Total Net Salary', formatCurrency(data.summary.total_net)],
    ['Total EPF (Employee + Employer)', formatCurrency(data.summary.total_epf)],
    ['Total SOCSO (Employee + Employer)', formatCurrency(data.summary.total_socso)],
    ['Total EIS (Employee + Employer)', formatCurrency(data.summary.total_eis)],
    ['Total PCB', formatCurrency(data.summary.total_pcb)],
    ['Employee Count', data.summary.employee_count]
  ];
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

  // Monthly Breakdown Sheet
  const monthlyHeaders = ['Month', 'Gross Salary', 'Net Salary', 'EPF (Employee)', 'EPF (Employer)',
    'SOCSO (Employee)', 'SOCSO (Employer)', 'EIS (Employee)', 'EIS (Employer)', 'PCB', 'Employees'];
  const monthlyData = [
    ['Monthly Payroll Breakdown'],
    [],
    monthlyHeaders,
    ...data.by_month.map(m => [
      MONTH_NAMES[m.month - 1],
      m.total_gross,
      m.total_net,
      m.total_epf_employee,
      m.total_epf_employer,
      m.total_socso_employee,
      m.total_socso_employer,
      m.total_eis_employee,
      m.total_eis_employer,
      m.total_pcb,
      m.employee_count
    ])
  ];
  const monthlySheet = XLSX.utils.aoa_to_sheet(monthlyData);
  XLSX.utils.book_append_sheet(workbook, monthlySheet, 'By Month');

  // Department Breakdown Sheet
  const deptHeaders = ['Department', 'Gross Salary', 'Net Salary', 'Employee Count'];
  const deptData = [
    ['Department Payroll Breakdown'],
    [],
    deptHeaders,
    ...data.by_department.map(d => [
      d.department,
      d.total_gross,
      d.total_net,
      d.employee_count
    ])
  ];
  const deptSheet = XLSX.utils.aoa_to_sheet(deptData);
  XLSX.utils.book_append_sheet(workbook, deptSheet, 'By Department');
};

/**
 * Generate leave analytics sheets
 */
const generateLeaveSheets = (workbook, data) => {
  // Summary Sheet
  const summaryData = [
    ['Leave Utilization Analytics Summary'],
    [`Year: ${data.year}`],
    [],
    ['Metric', 'Value'],
    ['Total Leave Days Taken', data.summary.total_days_taken],
    ['Total Leave Requests', data.summary.total_requests]
  ];
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

  // By Type Sheet
  const typeHeaders = ['Leave Type', 'Total Days', 'Request Count'];
  const typeData = [
    ['Leave Breakdown by Type'],
    [],
    typeHeaders,
    ...data.by_type.map(t => [
      t.leave_type,
      t.total_days,
      t.request_count
    ])
  ];
  const typeSheet = XLSX.utils.aoa_to_sheet(typeData);
  XLSX.utils.book_append_sheet(workbook, typeSheet, 'By Type');

  // Monthly Trend Sheet
  const monthHeaders = ['Month', 'Total Days', 'Request Count'];
  const monthData = [
    ['Monthly Leave Trend'],
    [],
    monthHeaders,
    ...data.by_month.map(m => [
      MONTH_NAMES[m.month - 1],
      m.total_days,
      m.request_count
    ])
  ];
  const monthSheet = XLSX.utils.aoa_to_sheet(monthData);
  XLSX.utils.book_append_sheet(workbook, monthSheet, 'By Month');

  // By Department Sheet
  const deptHeaders = ['Department', 'Total Days', 'Request Count'];
  const deptData = [
    ['Leave by Department'],
    [],
    deptHeaders,
    ...data.by_department.map(d => [
      d.department,
      d.total_days,
      d.request_count
    ])
  ];
  const deptSheet = XLSX.utils.aoa_to_sheet(deptData);
  XLSX.utils.book_append_sheet(workbook, deptSheet, 'By Department');

  // Status Breakdown Sheet
  const statusHeaders = ['Status', 'Count'];
  const statusData = [
    ['Leave Status Breakdown'],
    [],
    statusHeaders,
    ...data.by_status.map(s => [s.status, s.count])
  ];
  const statusSheet = XLSX.utils.aoa_to_sheet(statusData);
  XLSX.utils.book_append_sheet(workbook, statusSheet, 'By Status');
};

/**
 * Generate attendance analytics sheets
 */
const generateAttendanceSheets = (workbook, data) => {
  // Summary Sheet
  const summaryData = [
    ['Attendance Punctuality Analytics Summary'],
    [`Year: ${data.year}${data.month ? `, Month: ${MONTH_NAMES[data.month - 1]}` : ''}`],
    [`Period: ${data.period.startDate} to ${data.period.endDate}`],
    [],
    ['Metric', 'Value'],
    ['Total Attendance Records', data.summary.total_records],
    ['Late Count', data.summary.late_count],
    ['Early Leave Count', data.summary.early_leave_count],
    ['Punctuality Rate', `${data.summary.punctuality_rate}%`],
    ['Average Late Minutes', data.summary.avg_late_minutes],
    ['Average Working Hours', data.summary.avg_working_hours]
  ];
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

  // By Department Sheet
  const deptHeaders = ['Department', 'Total Records', 'Late Count', 'Punctuality Rate', 'Avg Hours'];
  const deptData = [
    ['Attendance by Department'],
    [],
    deptHeaders,
    ...data.by_department.map(d => [
      d.department,
      d.total_records,
      d.late_count,
      `${d.punctuality_rate}%`,
      d.avg_working_hours
    ])
  ];
  const deptSheet = XLSX.utils.aoa_to_sheet(deptData);
  XLSX.utils.book_append_sheet(workbook, deptSheet, 'By Department');

  // Trend Sheet
  const trendHeaders = data.month
    ? ['Date', 'Total Records', 'Late Count']
    : ['Month', 'Total Records', 'Late Count', 'Avg Hours'];
  const trendData = [
    [data.month ? 'Daily Attendance Trend' : 'Monthly Attendance Trend'],
    [],
    trendHeaders,
    ...data.trend.map(t => data.month
      ? [t.date, t.total_records, t.late_count]
      : [MONTH_NAMES[t.month - 1], t.total_records, t.late_count, t.avg_working_hours]
    )
  ];
  const trendSheet = XLSX.utils.aoa_to_sheet(trendData);
  XLSX.utils.book_append_sheet(workbook, trendSheet, 'Trend');

  // Work Type Sheet
  const workTypeHeaders = ['Work Type', 'Count'];
  const workTypeData = [
    ['Work Type Distribution'],
    [],
    workTypeHeaders,
    ...data.by_work_type.map(w => [w.type, w.count])
  ];
  const workTypeSheet = XLSX.utils.aoa_to_sheet(workTypeData);
  XLSX.utils.book_append_sheet(workbook, workTypeSheet, 'Work Type');
};

/**
 * Generate claims analytics sheets
 */
const generateClaimsSheets = (workbook, data) => {
  // Summary Sheet
  const summaryData = [
    ['Claims Spending Analytics Summary'],
    [`Year: ${data.year}`],
    [],
    ['Metric', 'Value'],
    ['Total Claim Amount', formatCurrency(data.summary.total_amount)],
    ['Total Claims', data.summary.total_claims],
    ['Average Claim Amount', formatCurrency(data.summary.avg_claim_amount)]
  ];
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

  // By Type Sheet
  const typeHeaders = ['Claim Type', 'Total Amount', 'Claim Count', 'Average Amount'];
  const typeData = [
    ['Claims by Type'],
    [],
    typeHeaders,
    ...data.by_type.map(t => [
      t.claim_type,
      t.total_amount,
      t.claim_count,
      t.avg_amount
    ])
  ];
  const typeSheet = XLSX.utils.aoa_to_sheet(typeData);
  XLSX.utils.book_append_sheet(workbook, typeSheet, 'By Type');

  // Monthly Trend Sheet
  const monthHeaders = ['Month', 'Total Amount', 'Claim Count'];
  const monthData = [
    ['Monthly Claims Trend'],
    [],
    monthHeaders,
    ...data.by_month.map(m => [
      MONTH_NAMES[m.month - 1],
      m.total_amount,
      m.claim_count
    ])
  ];
  const monthSheet = XLSX.utils.aoa_to_sheet(monthData);
  XLSX.utils.book_append_sheet(workbook, monthSheet, 'By Month');

  // By Department Sheet
  const deptHeaders = ['Department', 'Total Amount', 'Claim Count'];
  const deptData = [
    ['Claims by Department'],
    [],
    deptHeaders,
    ...data.by_department.map(d => [
      d.department,
      d.total_amount,
      d.claim_count
    ])
  ];
  const deptSheet = XLSX.utils.aoa_to_sheet(deptData);
  XLSX.utils.book_append_sheet(workbook, deptSheet, 'By Department');

  // Status Breakdown Sheet
  const statusHeaders = ['Status', 'Count', 'Total Amount'];
  const statusData = [
    ['Claims Status Breakdown'],
    [],
    statusHeaders,
    ...data.by_status.map(s => [s.status, s.count, s.total_amount])
  ];
  const statusSheet = XLSX.utils.aoa_to_sheet(statusData);
  XLSX.utils.book_append_sheet(workbook, statusSheet, 'By Status');
};

/**
 * Format number as currency (RM)
 */
const formatCurrency = (amount) => {
  return `RM ${parseFloat(amount || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
};

module.exports = {
  generateAnalyticsExcel
};
