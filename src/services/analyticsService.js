const { Op, fn, col, literal } = require('sequelize');
const { sequelize, Payroll, Employee, Leave, LeaveType, Attendance, Claim, ClaimType } = require('../models');

/**
 * Analytics Service
 * Provides data aggregation functions for HR analytics dashboard
 */

/**
 * Get payroll cost analytics
 * @param {Number} companyId - Company ID to filter by
 * @param {Number} year - Year to analyze
 * @param {Number} startMonth - Start month (optional, default 1)
 * @param {Number} endMonth - End month (optional, default 12)
 * @returns {Object} Payroll analytics data
 */
const getPayrollCostAnalytics = async (companyId, year, startMonth = 1, endMonth = 12) => {
  // Aggregate by month
  const byMonth = await Payroll.findAll({
    attributes: [
      'month',
      [fn('SUM', col('gross_salary')), 'total_gross'],
      [fn('SUM', col('net_salary')), 'total_net'],
      [fn('SUM', col('epf_employee')), 'total_epf_employee'],
      [fn('SUM', col('epf_employer')), 'total_epf_employer'],
      [fn('SUM', col('socso_employee')), 'total_socso_employee'],
      [fn('SUM', col('socso_employer')), 'total_socso_employer'],
      [fn('SUM', col('eis_employee')), 'total_eis_employee'],
      [fn('SUM', col('eis_employer')), 'total_eis_employer'],
      [fn('SUM', col('pcb_deduction')), 'total_pcb'],
      [fn('COUNT', col('Payroll.id')), 'employee_count']
    ],
    include: [{
      model: Employee,
      as: 'employee',
      where: { company_id: companyId },
      attributes: [],
      required: true
    }],
    where: {
      year,
      month: { [Op.between]: [startMonth, endMonth] },
      status: { [Op.in]: ['Approved', 'Paid'] }
    },
    group: ['month'],
    order: [['month', 'ASC']],
    raw: true
  });

  // Aggregate by department
  const byDepartment = await Payroll.findAll({
    attributes: [
      [col('employee.department'), 'department'],
      [fn('SUM', col('gross_salary')), 'total_gross'],
      [fn('SUM', col('net_salary')), 'total_net'],
      [fn('COUNT', fn('DISTINCT', col('Payroll.employee_id'))), 'employee_count']
    ],
    include: [{
      model: Employee,
      as: 'employee',
      where: { company_id: companyId },
      attributes: []
    }],
    where: {
      year,
      month: { [Op.between]: [startMonth, endMonth] },
      status: { [Op.in]: ['Approved', 'Paid'] }
    },
    group: [col('employee.department')],
    raw: true
  });

  // Calculate summary
  const summary = await Payroll.findOne({
    attributes: [
      [fn('SUM', col('gross_salary')), 'total_gross'],
      [fn('SUM', col('net_salary')), 'total_net'],
      [fn('SUM', literal('epf_employee + epf_employer')), 'total_epf'],
      [fn('SUM', literal('socso_employee + socso_employer')), 'total_socso'],
      [fn('SUM', literal('eis_employee + eis_employer')), 'total_eis'],
      [fn('SUM', col('pcb_deduction')), 'total_pcb'],
      [fn('COUNT', fn('DISTINCT', col('employee_id'))), 'employee_count']
    ],
    include: [{
      model: Employee,
      as: 'employee',
      where: { company_id: companyId },
      attributes: []
    }],
    where: {
      year,
      month: { [Op.between]: [startMonth, endMonth] },
      status: { [Op.in]: ['Approved', 'Paid'] }
    },
    raw: true
  });

  return {
    year,
    period: { startMonth, endMonth },
    summary: {
      total_gross: parseFloat(summary?.total_gross || 0),
      total_net: parseFloat(summary?.total_net || 0),
      total_epf: parseFloat(summary?.total_epf || 0),
      total_socso: parseFloat(summary?.total_socso || 0),
      total_eis: parseFloat(summary?.total_eis || 0),
      total_pcb: parseFloat(summary?.total_pcb || 0),
      employee_count: parseInt(summary?.employee_count || 0)
    },
    by_month: byMonth.map(m => ({
      month: m.month,
      total_gross: parseFloat(m.total_gross || 0),
      total_net: parseFloat(m.total_net || 0),
      total_epf_employee: parseFloat(m.total_epf_employee || 0),
      total_epf_employer: parseFloat(m.total_epf_employer || 0),
      total_socso_employee: parseFloat(m.total_socso_employee || 0),
      total_socso_employer: parseFloat(m.total_socso_employer || 0),
      total_eis_employee: parseFloat(m.total_eis_employee || 0),
      total_eis_employer: parseFloat(m.total_eis_employer || 0),
      total_pcb: parseFloat(m.total_pcb || 0),
      employee_count: parseInt(m.employee_count || 0)
    })),
    by_department: byDepartment.map(d => ({
      department: d.department || 'Unassigned',
      total_gross: parseFloat(d.total_gross || 0),
      total_net: parseFloat(d.total_net || 0),
      employee_count: parseInt(d.employee_count || 0)
    }))
  };
};

/**
 * Get leave utilization analytics
 * @param {Number} companyId - Company ID to filter by
 * @param {Number} year - Year to analyze
 * @returns {Object} Leave analytics data
 */
const getLeaveUtilizationAnalytics = async (companyId, year) => {
  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;

  // Aggregate by leave type
  const byType = await Leave.findAll({
    attributes: [
      [col('leave_type.name'), 'leave_type'],
      [fn('SUM', col('total_days')), 'total_days'],
      [fn('COUNT', col('Leave.id')), 'request_count']
    ],
    include: [
      {
        model: LeaveType,
        as: 'leave_type',
        attributes: []
      },
      {
        model: Employee,
        as: 'employee',
        where: { company_id: companyId },
        attributes: [],
        required: true
      }
    ],
    where: {
      start_date: { [Op.gte]: startDate },
      end_date: { [Op.lte]: endDate },
      status: 'Approved'
    },
    group: [col('leave_type.name')],
    raw: true
  });

  // Monthly trend
  const byMonth = await Leave.findAll({
    attributes: [
      [fn('date_part', literal("'month'"), col('start_date')), 'month'],
      [fn('SUM', col('total_days')), 'total_days'],
      [fn('COUNT', col('Leave.id')), 'request_count']
    ],
    include: [{
      model: Employee,
      as: 'employee',
      where: { company_id: companyId },
      attributes: [],
      required: true
    }],
    where: {
      start_date: { [Op.gte]: startDate },
      end_date: { [Op.lte]: endDate },
      status: 'Approved'
    },
    group: [fn('date_part', literal("'month'"), col('start_date'))],
    order: [[fn('date_part', literal("'month'"), col('start_date')), 'ASC']],
    raw: true
  });

  // By department
  const byDepartment = await Leave.findAll({
    attributes: [
      [col('employee.department'), 'department'],
      [fn('SUM', col('total_days')), 'total_days'],
      [fn('COUNT', col('Leave.id')), 'request_count']
    ],
    include: [{
      model: Employee,
      as: 'employee',
      where: { company_id: companyId },
      attributes: []
    }],
    where: {
      start_date: { [Op.gte]: startDate },
      end_date: { [Op.lte]: endDate },
      status: 'Approved'
    },
    group: [col('employee.department')],
    raw: true
  });

  // Leave status breakdown
  const byStatus = await Leave.findAll({
    attributes: [
      'status',
      [fn('COUNT', col('Leave.id')), 'count']
    ],
    include: [{
      model: Employee,
      as: 'employee',
      where: { company_id: companyId },
      attributes: [],
      required: true
    }],
    where: {
      start_date: { [Op.gte]: startDate }
    },
    group: ['status'],
    raw: true
  });

  // Calculate summary
  const summary = {
    total_days_taken: byType.reduce((acc, t) => acc + parseFloat(t.total_days || 0), 0),
    total_requests: byType.reduce((acc, t) => acc + parseInt(t.request_count || 0), 0)
  };

  return {
    year,
    summary,
    by_type: byType.map(t => ({
      leave_type: t.leave_type,
      total_days: parseFloat(t.total_days || 0),
      request_count: parseInt(t.request_count || 0)
    })),
    by_month: byMonth.map(m => ({
      month: parseInt(m.month),
      total_days: parseFloat(m.total_days || 0),
      request_count: parseInt(m.request_count || 0)
    })),
    by_department: byDepartment.map(d => ({
      department: d.department || 'Unassigned',
      total_days: parseFloat(d.total_days || 0),
      request_count: parseInt(d.request_count || 0)
    })),
    by_status: byStatus.map(s => ({
      status: s.status,
      count: parseInt(s.count || 0)
    }))
  };
};

/**
 * Get attendance punctuality analytics
 * @param {Number} companyId - Company ID to filter by
 * @param {Number} year - Year to analyze
 * @param {Number} month - Month to analyze (optional)
 * @returns {Object} Attendance analytics data
 */
const getAttendancePunctualityAnalytics = async (companyId, year, month = null) => {
  let startDate, endDate;

  if (month) {
    startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;
  } else {
    startDate = `${year}-01-01`;
    endDate = `${year}-12-31`;
  }

  // Overall punctuality stats
  const overallStats = await Attendance.findOne({
    attributes: [
      [fn('COUNT', col('Attendance.id')), 'total_records'],
      [fn('SUM', literal('CASE WHEN is_late = true THEN 1 ELSE 0 END')), 'late_count'],
      [fn('SUM', literal('CASE WHEN is_early_leave = true THEN 1 ELSE 0 END')), 'early_leave_count'],
      [fn('AVG', col('late_minutes')), 'avg_late_minutes'],
      [fn('AVG', col('total_hours')), 'avg_working_hours']
    ],
    include: [{
      model: Employee,
      as: 'employee',
      where: { company_id: companyId },
      attributes: []
    }],
    where: {
      date: { [Op.between]: [startDate, endDate] }
    },
    raw: true
  });

  // By department
  const byDepartment = await Attendance.findAll({
    attributes: [
      [col('employee.department'), 'department'],
      [fn('COUNT', col('Attendance.id')), 'total_records'],
      [fn('SUM', literal('CASE WHEN is_late = true THEN 1 ELSE 0 END')), 'late_count'],
      [fn('AVG', col('total_hours')), 'avg_working_hours']
    ],
    include: [{
      model: Employee,
      as: 'employee',
      where: { company_id: companyId },
      attributes: []
    }],
    where: {
      date: { [Op.between]: [startDate, endDate] }
    },
    group: [col('employee.department')],
    raw: true
  });

  // Daily trend (last 30 days if month specified, otherwise monthly average)
  let trend;
  if (month) {
    trend = await Attendance.findAll({
      attributes: [
        'date',
        [fn('COUNT', col('Attendance.id')), 'total_records'],
        [fn('SUM', literal('CASE WHEN is_late = true THEN 1 ELSE 0 END')), 'late_count']
      ],
      include: [{
        model: Employee,
        as: 'employee',
        where: { company_id: companyId },
        attributes: [],
        required: true
      }],
      where: {
        date: { [Op.between]: [startDate, endDate] }
      },
      group: ['date'],
      order: [['date', 'ASC']],
      raw: true
    });
  } else {
    trend = await Attendance.findAll({
      attributes: [
        [fn('date_part', literal("'month'"), col('date')), 'month'],
        [fn('COUNT', col('Attendance.id')), 'total_records'],
        [fn('SUM', literal('CASE WHEN is_late = true THEN 1 ELSE 0 END')), 'late_count'],
        [fn('AVG', col('total_hours')), 'avg_working_hours']
      ],
      include: [{
        model: Employee,
        as: 'employee',
        where: { company_id: companyId },
        attributes: [],
        required: true
      }],
      where: {
        date: { [Op.between]: [startDate, endDate] }
      },
      group: [fn('date_part', literal("'month'"), col('date'))],
      order: [[fn('date_part', literal("'month'"), col('date')), 'ASC']],
      raw: true
    });
  }

  // Work type distribution (Office vs WFH)
  const byWorkType = await Attendance.findAll({
    attributes: [
      'type',
      [fn('COUNT', col('Attendance.id')), 'count']
    ],
    include: [{
      model: Employee,
      as: 'employee',
      where: { company_id: companyId },
      attributes: [],
      required: true
    }],
    where: {
      date: { [Op.between]: [startDate, endDate] }
    },
    group: ['type'],
    raw: true
  });

  const totalRecords = parseInt(overallStats?.total_records || 0);
  const lateCount = parseInt(overallStats?.late_count || 0);

  return {
    year,
    month,
    period: { startDate, endDate },
    summary: {
      total_records: totalRecords,
      late_count: lateCount,
      early_leave_count: parseInt(overallStats?.early_leave_count || 0),
      punctuality_rate: totalRecords > 0 ? Math.round(((totalRecords - lateCount) / totalRecords) * 100) : 0,
      avg_late_minutes: parseFloat(overallStats?.avg_late_minutes || 0).toFixed(1),
      avg_working_hours: parseFloat(overallStats?.avg_working_hours || 0).toFixed(2)
    },
    by_department: byDepartment.map(d => ({
      department: d.department || 'Unassigned',
      total_records: parseInt(d.total_records || 0),
      late_count: parseInt(d.late_count || 0),
      punctuality_rate: d.total_records > 0 ? Math.round(((d.total_records - d.late_count) / d.total_records) * 100) : 0,
      avg_working_hours: parseFloat(d.avg_working_hours || 0).toFixed(2)
    })),
    trend: trend.map(t => month ? ({
      date: t.date,
      total_records: parseInt(t.total_records || 0),
      late_count: parseInt(t.late_count || 0)
    }) : ({
      month: parseInt(t.month),
      total_records: parseInt(t.total_records || 0),
      late_count: parseInt(t.late_count || 0),
      avg_working_hours: parseFloat(t.avg_working_hours || 0).toFixed(2)
    })),
    by_work_type: byWorkType.map(w => ({
      type: w.type,
      count: parseInt(w.count || 0)
    }))
  };
};

/**
 * Get claims spending analytics
 * @param {Number} companyId - Company ID to filter by
 * @param {Number} year - Year to analyze
 * @returns {Object} Claims analytics data
 */
const getClaimsSpendingAnalytics = async (companyId, year) => {
  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;

  // By claim type
  const byType = await Claim.findAll({
    attributes: [
      [col('claimType.name'), 'claim_type'],
      [fn('SUM', col('amount')), 'total_amount'],
      [fn('COUNT', col('Claim.id')), 'claim_count'],
      [fn('AVG', col('amount')), 'avg_amount']
    ],
    include: [
      {
        model: ClaimType,
        as: 'claimType',
        attributes: []
      },
      {
        model: Employee,
        as: 'employee',
        where: { company_id: companyId },
        attributes: [],
        required: true
      }
    ],
    where: {
      date: { [Op.between]: [startDate, endDate] },
      status: { [Op.in]: ['Finance_Approved', 'Paid'] }
    },
    group: [col('claimType.name')],
    raw: true
  });

  // Monthly trend
  const byMonth = await Claim.findAll({
    attributes: [
      [fn('date_part', literal("'month'"), col('date')), 'month'],
      [fn('SUM', col('amount')), 'total_amount'],
      [fn('COUNT', col('Claim.id')), 'claim_count']
    ],
    include: [{
      model: Employee,
      as: 'employee',
      where: { company_id: companyId },
      attributes: [],
      required: true
    }],
    where: {
      date: { [Op.between]: [startDate, endDate] },
      status: { [Op.in]: ['Finance_Approved', 'Paid'] }
    },
    group: [fn('date_part', literal("'month'"), col('date'))],
    order: [[fn('date_part', literal("'month'"), col('date')), 'ASC']],
    raw: true
  });

  // By department
  const byDepartment = await Claim.findAll({
    attributes: [
      [col('employee.department'), 'department'],
      [fn('SUM', col('amount')), 'total_amount'],
      [fn('COUNT', col('Claim.id')), 'claim_count']
    ],
    include: [{
      model: Employee,
      as: 'employee',
      where: { company_id: companyId },
      attributes: []
    }],
    where: {
      date: { [Op.between]: [startDate, endDate] },
      status: { [Op.in]: ['Finance_Approved', 'Paid'] }
    },
    group: [col('employee.department')],
    raw: true
  });

  // Status breakdown (all claims regardless of status)
  const byStatus = await Claim.findAll({
    attributes: [
      'status',
      [fn('COUNT', col('Claim.id')), 'count'],
      [fn('SUM', col('amount')), 'total_amount']
    ],
    include: [{
      model: Employee,
      as: 'employee',
      where: { company_id: companyId },
      attributes: [],
      required: true
    }],
    where: {
      date: { [Op.between]: [startDate, endDate] }
    },
    group: ['status'],
    raw: true
  });

  // Calculate summary
  const summary = {
    total_amount: byType.reduce((acc, t) => acc + parseFloat(t.total_amount || 0), 0),
    total_claims: byType.reduce((acc, t) => acc + parseInt(t.claim_count || 0), 0),
    avg_claim_amount: byType.length > 0
      ? byType.reduce((acc, t) => acc + parseFloat(t.total_amount || 0), 0) / byType.reduce((acc, t) => acc + parseInt(t.claim_count || 0), 0)
      : 0
  };

  return {
    year,
    summary: {
      total_amount: parseFloat(summary.total_amount.toFixed(2)),
      total_claims: summary.total_claims,
      avg_claim_amount: parseFloat(summary.avg_claim_amount.toFixed(2))
    },
    by_type: byType.map(t => ({
      claim_type: t.claim_type,
      total_amount: parseFloat(t.total_amount || 0),
      claim_count: parseInt(t.claim_count || 0),
      avg_amount: parseFloat(t.avg_amount || 0).toFixed(2)
    })),
    by_month: byMonth.map(m => ({
      month: parseInt(m.month),
      total_amount: parseFloat(m.total_amount || 0),
      claim_count: parseInt(m.claim_count || 0)
    })),
    by_department: byDepartment.map(d => ({
      department: d.department || 'Unassigned',
      total_amount: parseFloat(d.total_amount || 0),
      claim_count: parseInt(d.claim_count || 0)
    })),
    by_status: byStatus.map(s => ({
      status: s.status,
      count: parseInt(s.count || 0),
      total_amount: parseFloat(s.total_amount || 0)
    }))
  };
};

/**
 * Get dashboard summary with key metrics
 * @param {Number} companyId - Company ID to filter by
 * @param {Number} year - Year to analyze
 * @param {Number} month - Month to analyze
 * @returns {Object} Dashboard summary data
 */
const getDashboardSummary = async (companyId, year, month) => {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;

  // Payroll summary for the month
  const payrollSummary = await Payroll.findOne({
    attributes: [
      [fn('SUM', col('gross_salary')), 'total_gross'],
      [fn('SUM', col('net_salary')), 'total_net'],
      [fn('COUNT', fn('DISTINCT', col('employee_id'))), 'employee_count']
    ],
    include: [{
      model: Employee,
      as: 'employee',
      where: { company_id: companyId },
      attributes: []
    }],
    where: {
      year,
      month,
      status: { [Op.in]: ['Approved', 'Paid'] }
    },
    raw: true
  });

  // Active employees count
  const activeEmployees = await Employee.count({
    where: {
      employment_status: 'Active',
      company_id: companyId
    }
  });

  // Leave count for the month
  const leaveCount = await Leave.count({
    include: [{
      model: Employee,
      as: 'employee',
      where: { company_id: companyId },
      attributes: []
    }],
    where: {
      start_date: { [Op.between]: [startDate, endDate] },
      status: 'Approved'
    }
  });

  // Pending claims
  const pendingClaims = await Claim.count({
    include: [{
      model: Employee,
      as: 'employee',
      where: { company_id: companyId },
      attributes: []
    }],
    where: {
      status: { [Op.in]: ['Pending', 'Manager_Approved'] }
    }
  });

  // Attendance for the month
  const attendanceStats = await Attendance.findOne({
    attributes: [
      [fn('COUNT', col('Attendance.id')), 'total_records'],
      [fn('SUM', literal('CASE WHEN is_late = true THEN 1 ELSE 0 END')), 'late_count']
    ],
    include: [{
      model: Employee,
      as: 'employee',
      where: { company_id: companyId },
      attributes: []
    }],
    where: {
      date: { [Op.between]: [startDate, endDate] }
    },
    raw: true
  });

  const totalRecords = parseInt(attendanceStats?.total_records || 0);
  const lateCount = parseInt(attendanceStats?.late_count || 0);

  return {
    year,
    month,
    payroll: {
      total_gross: parseFloat(payrollSummary?.total_gross || 0),
      total_net: parseFloat(payrollSummary?.total_net || 0),
      processed_count: parseInt(payrollSummary?.employee_count || 0)
    },
    employees: {
      active_count: activeEmployees
    },
    leave: {
      approved_count: leaveCount
    },
    claims: {
      pending_count: pendingClaims
    },
    attendance: {
      total_records: totalRecords,
      late_count: lateCount,
      punctuality_rate: totalRecords > 0 ? Math.round(((totalRecords - lateCount) / totalRecords) * 100) : 0
    }
  };
};

module.exports = {
  getPayrollCostAnalytics,
  getLeaveUtilizationAnalytics,
  getAttendancePunctualityAnalytics,
  getClaimsSpendingAnalytics,
  getDashboardSummary
};
