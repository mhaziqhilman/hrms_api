const { Op, fn, col, literal } = require('sequelize');
const {
  sequelize,
  Employee,
  Payroll,
  Leave,
  LeaveType,
  LeaveEntitlement,
  Attendance,
  WFHApplication,
  Claim,
  ClaimType,
  Memo,
  User
} = require('../models');

/**
 * Dashboard Service
 * Provides role-specific dashboard data from real database
 */

/**
 * Get today's date string in YYYY-MM-DD format
 */
const getTodayString = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

/**
 * Admin Dashboard - Organization-wide overview (scoped to company)
 */
const getAdminDashboard = async (companyId) => {
  const today = getTodayString();
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const firstOfMonth = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`;

  // 1. Employee stats
  const totalEmployees = await Employee.count({ where: { company_id: companyId } });
  const activeEmployees = await Employee.count({ where: { company_id: companyId, employment_status: 'Active' } });

  // On leave today
  const onLeaveToday = await Leave.count({
    where: {
      status: 'Approved',
      start_date: { [Op.lte]: today },
      end_date: { [Op.gte]: today }
    },
    include: [{ model: Employee, as: 'employee', where: { company_id: companyId }, attributes: [], required: true }]
  });

  // New hires this month
  const newHires = await Employee.count({
    where: {
      company_id: companyId,
      join_date: { [Op.gte]: firstOfMonth },
      employment_status: 'Active'
    }
  });

  // 2. Attendance summary for today
  const attendanceToday = await Attendance.findAll({
    where: { date: today },
    include: [{ model: Employee, as: 'employee', where: { company_id: companyId }, attributes: [], required: true }],
    raw: true
  });

  const presentToday = attendanceToday.length;
  const lateToday = attendanceToday.filter(a => a.is_late).length;
  const wfhToday = attendanceToday.filter(a => a.type === 'WFH').length;
  const absentToday = activeEmployees - presentToday - onLeaveToday;
  const attendanceRate = activeEmployees > 0
    ? parseFloat(((presentToday / activeEmployees) * 100).toFixed(1))
    : 0;

  // 3. Payroll summary for current month
  const payrollSummary = await Payroll.findOne({
    attributes: [
      [fn('COUNT', col('Payroll.id')), 'total_count'],
      [fn('SUM', col('gross_salary')), 'total_gross'],
      [fn('SUM', literal('epf_employee + socso_employee + eis_employee')), 'total_statutory'],
      [fn('SUM', col('pcb_deduction')), 'total_pcb'],
      [fn('SUM', col('net_salary')), 'total_net']
    ],
    where: {
      year: currentYear,
      month: currentMonth,
      status: { [Op.in]: ['Approved', 'Paid'] }
    },
    include: [{ model: Employee, as: 'employee', where: { company_id: companyId }, attributes: [], required: true }],
    raw: true
  });

  // Determine payroll status for current month
  const payrollStatusCheck = await Payroll.findOne({
    attributes: ['status'],
    where: { year: currentYear, month: currentMonth },
    include: [{ model: Employee, as: 'employee', where: { company_id: companyId }, attributes: [], required: true }],
    order: [['updated_at', 'DESC']],
    raw: true
  });

  const payrollStatus = payrollStatusCheck?.status || 'Not Started';

  // 4. Claims pending payment (approved but not paid)
  const claimsPendingPayment = await Claim.findAll({
    where: {
      status: { [Op.in]: ['Finance_Approved', 'Manager_Approved'] }
    },
    include: [
      { model: Employee, as: 'employee', where: { company_id: companyId }, attributes: ['full_name'], required: true },
      { model: ClaimType, as: 'claimType', attributes: ['name'] }
    ],
    order: [['date', 'DESC']],
    limit: 5,
    raw: false
  });

  // 5. Recent leave requests (pending)
  const recentLeaveRequests = await Leave.findAll({
    where: { status: 'Pending' },
    include: [
      { model: Employee, as: 'employee', where: { company_id: companyId }, attributes: ['full_name'], required: true },
      { model: LeaveType, as: 'leave_type', attributes: ['name'] }
    ],
    order: [['created_at', 'DESC']],
    limit: 5,
    raw: false
  });

  // 6. Recent activities - derive from recent records
  const recentActivities = [];

  // Check latest payroll activity
  const lastPayroll = await Payroll.findOne({
    where: { status: { [Op.in]: ['Approved', 'Paid'] } },
    include: [{ model: Employee, as: 'employee', where: { company_id: companyId }, attributes: [], required: true }],
    order: [['updated_at', 'DESC']],
    raw: true
  });
  if (lastPayroll) {
    const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    recentActivities.push({
      action: `Payroll ${lastPayroll.status === 'Paid' ? 'paid' : 'processed'} for ${monthNames[lastPayroll.month]} ${lastPayroll.year}`,
      time: lastPayroll.updated_at,
      icon: 'credit-card',
      color: 'success'
    });
  }

  // Recent leave submissions
  const recentLeaveCount = await Leave.count({
    where: {
      created_at: { [Op.gte]: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
    },
    include: [{ model: Employee, as: 'employee', where: { company_id: companyId }, attributes: [], required: true }]
  });
  if (recentLeaveCount > 0) {
    recentActivities.push({
      action: `${recentLeaveCount} leave request${recentLeaveCount > 1 ? 's' : ''} submitted this week`,
      time: new Date(),
      icon: 'calendar',
      color: 'info'
    });
  }

  // Recent claims approved
  const recentClaimsApproved = await Claim.count({
    where: {
      status: { [Op.in]: ['Manager_Approved', 'Finance_Approved', 'Paid'] },
      updated_at: { [Op.gte]: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
    },
    include: [{ model: Employee, as: 'employee', where: { company_id: companyId }, attributes: [], required: true }]
  });
  if (recentClaimsApproved > 0) {
    recentActivities.push({
      action: `${recentClaimsApproved} claim${recentClaimsApproved > 1 ? 's' : ''} approved this week`,
      time: new Date(),
      icon: 'file-text',
      color: 'primary'
    });
  }

  // Recent new employees
  const recentNewEmployees = await Employee.count({
    where: {
      company_id: companyId,
      created_at: { [Op.gte]: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
    }
  });
  if (recentNewEmployees > 0) {
    recentActivities.push({
      action: `${recentNewEmployees} new employee${recentNewEmployees > 1 ? 's' : ''} onboarded this month`,
      time: new Date(),
      icon: 'user-plus',
      color: 'warning'
    });
  }

  return {
    employeeStats: {
      totalEmployees,
      activeEmployees,
      onLeave: onLeaveToday,
      newHires
    },
    attendanceSummary: {
      presentToday,
      lateToday,
      absentToday: Math.max(0, absentToday),
      wfhToday,
      attendanceRate
    },
    payrollSummary: {
      status: payrollStatus,
      totalEmployees: parseInt(payrollSummary?.total_count || 0),
      totalGrossSalary: parseFloat(payrollSummary?.total_gross || 0),
      totalStatutory: parseFloat(payrollSummary?.total_statutory || 0),
      totalPCB: parseFloat(payrollSummary?.total_pcb || 0),
      totalNetSalary: parseFloat(payrollSummary?.total_net || 0)
    },
    claimsPendingPayment: claimsPendingPayment.map(c => ({
      id: c.id,
      employee: c.employee?.full_name || 'Unknown',
      type: c.claimType?.name || 'Unknown',
      amount: parseFloat(c.amount),
      date: c.date,
      status: c.status === 'Finance_Approved' ? 'Approved' : 'Manager Approved'
    })),
    recentLeaveRequests: recentLeaveRequests.map(l => ({
      id: l.id,
      employee: l.employee?.full_name || 'Unknown',
      type: l.leave_type?.name || 'Unknown',
      from: l.start_date,
      to: l.end_date,
      days: parseFloat(l.total_days),
      status: l.status
    })),
    recentActivities,
    currentMonth,
    currentYear
  };
};


/**
 * Manager Dashboard - Team-specific overview (scoped to company)
 */
const getManagerDashboard = async (companyId, userId) => {
  const today = getTodayString();

  // Get the manager's employee record
  const managerEmployee = await Employee.findOne({
    where: { user_id: userId, company_id: companyId },
    raw: true
  });

  if (!managerEmployee) {
    // Return empty dashboard if no employee record found
    return getEmptyManagerDashboard();
  }

  // Get team members (employees reporting to this manager)
  const teamMembers = await Employee.findAll({
    where: {
      company_id: companyId,
      reporting_manager_id: managerEmployee.id,
      employment_status: 'Active'
    },
    include: [{ model: User, as: 'user', attributes: ['id'] }],
    raw: false
  });

  const teamMemberIds = teamMembers.map(m => m.id);
  const totalMembers = teamMembers.length;

  // If no direct reports, fall back to department-based team
  let effectiveTeamIds = teamMemberIds;
  let effectiveTotal = totalMembers;

  if (totalMembers === 0 && managerEmployee.department) {
    const deptMembers = await Employee.findAll({
      where: {
        company_id: companyId,
        department: managerEmployee.department,
        employment_status: 'Active',
        id: { [Op.ne]: managerEmployee.id }
      },
      include: [{ model: User, as: 'user', attributes: ['id'] }],
      raw: false
    });
    effectiveTeamIds = deptMembers.map(m => m.id);
    effectiveTotal = deptMembers.length;
  }

  // Team attendance today
  const teamAttendanceToday = await Attendance.findAll({
    where: {
      employee_id: { [Op.in]: effectiveTeamIds },
      date: today
    },
    include: [{ model: Employee, as: 'employee', attributes: ['full_name'] }],
    order: [['clock_in_time', 'ASC']],
    raw: false
  });

  const presentToday = teamAttendanceToday.length;
  const wfhToday = teamAttendanceToday.filter(a => a.type === 'WFH').length;

  // On leave today
  const onLeaveToday = await Leave.count({
    where: {
      employee_id: { [Op.in]: effectiveTeamIds },
      status: 'Approved',
      start_date: { [Op.lte]: today },
      end_date: { [Op.gte]: today }
    }
  });

  // Pending leave approvals
  const pendingLeaves = await Leave.findAll({
    where: {
      employee_id: { [Op.in]: effectiveTeamIds },
      status: 'Pending'
    },
    include: [
      { model: Employee, as: 'employee', attributes: ['full_name'] },
      { model: LeaveType, as: 'leave_type', attributes: ['name'] }
    ],
    order: [['created_at', 'DESC']],
    limit: 10,
    raw: false
  });

  // Pending claims (Manager_Approved means waiting finance, Pending means waiting manager)
  const pendingClaims = await Claim.findAll({
    where: {
      employee_id: { [Op.in]: effectiveTeamIds },
      status: 'Pending'
    },
    include: [
      { model: Employee, as: 'employee', attributes: ['full_name'] },
      { model: ClaimType, as: 'claimType', attributes: ['name'] }
    ],
    order: [['created_at', 'DESC']],
    limit: 10,
    raw: false
  });

  // Pending WFH requests
  const pendingWfh = await WFHApplication.findAll({
    where: {
      employee_id: { [Op.in]: effectiveTeamIds },
      status: 'Pending'
    },
    include: [{ model: Employee, as: 'employee', attributes: ['full_name'] }],
    order: [['date', 'ASC']],
    limit: 10,
    raw: false
  });

  // Format team attendance for display
  const formattedAttendance = teamAttendanceToday.map(a => {
    const clockIn = a.clock_in_time ? new Date(a.clock_in_time) : null;
    const clockOut = a.clock_out_time ? new Date(a.clock_out_time) : null;

    let hours = '-';
    if (clockIn) {
      const end = clockOut || new Date();
      const diffMs = end.getTime() - clockIn.getTime();
      const h = Math.floor(diffMs / 3600000);
      const m = Math.floor((diffMs % 3600000) / 60000);
      hours = `${h}h ${String(m).padStart(2, '0')}m`;
    }

    return {
      name: a.employee?.full_name || 'Unknown',
      status: a.type === 'WFH' ? 'WFH' : 'Present',
      clockIn: clockIn ? clockIn.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : '-',
      clockOut: clockOut ? clockOut.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : '-',
      hours,
      late: a.is_late || false
    };
  });

  // Add "On Leave" entries for team members on leave
  const onLeaveMembers = await Leave.findAll({
    where: {
      employee_id: { [Op.in]: effectiveTeamIds },
      status: 'Approved',
      start_date: { [Op.lte]: today },
      end_date: { [Op.gte]: today }
    },
    include: [{ model: Employee, as: 'employee', attributes: ['full_name'] }],
    raw: false
  });

  onLeaveMembers.forEach(l => {
    formattedAttendance.push({
      name: l.employee?.full_name || 'Unknown',
      status: 'On Leave',
      clockIn: '-',
      clockOut: '-',
      hours: '-',
      late: false
    });
  });

  return {
    teamStats: {
      totalMembers: effectiveTotal,
      presentToday,
      onLeave: onLeaveToday,
      wfhToday
    },
    pendingApprovals: {
      leaves: pendingLeaves.length,
      claims: pendingClaims.length,
      wfh: pendingWfh.length
    },
    teamAttendance: formattedAttendance,
    leavePendingApproval: pendingLeaves.map(l => ({
      id: l.id,
      employee: l.employee?.full_name || 'Unknown',
      type: l.leave_type?.name || 'Unknown',
      from: l.start_date,
      to: l.end_date,
      days: parseFloat(l.total_days),
      reason: l.reason || '',
      status: l.status
    })),
    claimsPendingApproval: pendingClaims.map(c => ({
      id: c.id,
      employee: c.employee?.full_name || 'Unknown',
      type: c.claimType?.name || 'Unknown',
      amount: parseFloat(c.amount),
      date: c.date,
      description: c.description || '',
      status: c.status
    })),
    wfhRequests: pendingWfh.map(w => ({
      id: w.id,
      employee: w.employee?.full_name || 'Unknown',
      date: w.date,
      reason: w.reason || '',
      status: w.status
    }))
  };
};

const getEmptyManagerDashboard = () => ({
  teamStats: { totalMembers: 0, presentToday: 0, onLeave: 0, wfhToday: 0 },
  pendingApprovals: { leaves: 0, claims: 0, wfh: 0 },
  teamAttendance: [],
  leavePendingApproval: [],
  claimsPendingApproval: [],
  wfhRequests: []
});


/**
 * Staff Dashboard - Personal overview (scoped to company)
 */
const getStaffDashboard = async (companyId, userId) => {
  const today = getTodayString();
  const now = new Date();
  const currentYear = now.getFullYear();

  // Get employee record for this user
  const employee = await Employee.findOne({
    where: { user_id: userId, company_id: companyId },
    raw: true
  });

  if (!employee) {
    return getEmptyStaffDashboard();
  }

  // 1. Today's attendance (clock in/out status)
  const todayAttendance = await Attendance.findOne({
    where: {
      employee_id: employee.id,
      date: today
    },
    raw: true
  });

  // 2. Leave balance from entitlements
  const leaveEntitlements = await LeaveEntitlement.findAll({
    where: {
      employee_id: employee.id,
      year: currentYear
    },
    include: [{ model: LeaveType, as: 'leave_type', attributes: ['name'] }],
    raw: false
  });

  const leaveBalance = leaveEntitlements.map((ent, idx) => {
    const colors = ['primary', 'success', 'warning', 'danger'];
    return {
      type: ent.leave_type?.name || 'Unknown',
      total: parseFloat(ent.total_days),
      used: parseFloat(ent.used_days),
      pending: parseFloat(ent.pending_days),
      available: parseFloat(ent.balance_days),
      color: colors[idx % colors.length]
    };
  });

  // 3. Recent attendance history (last 5 working days)
  const attendanceHistory = await Attendance.findAll({
    where: {
      employee_id: employee.id,
      date: { [Op.lt]: today }
    },
    order: [['date', 'DESC']],
    limit: 5,
    raw: true
  });

  const formattedHistory = attendanceHistory.map(a => {
    const clockIn = a.clock_in_time ? new Date(a.clock_in_time) : null;
    const clockOut = a.clock_out_time ? new Date(a.clock_out_time) : null;

    let hours = '-';
    if (a.total_hours) {
      const h = Math.floor(a.total_hours);
      const m = Math.round((a.total_hours - h) * 60);
      hours = `${h}h ${String(m).padStart(2, '0')}m`;
    } else if (clockIn && clockOut) {
      const diffMs = clockOut.getTime() - clockIn.getTime();
      const h = Math.floor(diffMs / 3600000);
      const m = Math.floor((diffMs % 3600000) / 60000);
      hours = `${h}h ${String(m).padStart(2, '0')}m`;
    }

    let status = 'On Time';
    if (a.is_late) status = 'Late';
    else if (a.is_early_leave) status = 'Early Leave';
    if (a.type === 'WFH') status = 'WFH';

    return {
      date: a.date,
      clockIn: clockIn ? clockIn.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : '-',
      clockOut: clockOut ? clockOut.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : '-',
      hours,
      status
    };
  });

  // 4. Recent claims
  const myClaims = await Claim.findAll({
    where: { employee_id: employee.id },
    include: [{ model: ClaimType, as: 'claimType', attributes: ['name'] }],
    order: [['date', 'DESC']],
    limit: 5,
    raw: false
  });

  // 5. Upcoming leaves (future approved or pending)
  const upcomingLeaves = await Leave.findAll({
    where: {
      employee_id: employee.id,
      start_date: { [Op.gte]: today },
      status: { [Op.in]: ['Approved', 'Pending'] }
    },
    include: [{ model: LeaveType, as: 'leave_type', attributes: ['name'] }],
    order: [['start_date', 'ASC']],
    limit: 5,
    raw: false
  });

  // 6. Recent published memos
  const recentMemos = await Memo.findAll({
    where: {
      status: 'Published',
      [Op.or]: [
        { expires_at: null },
        { expires_at: { [Op.gte]: now } }
      ]
    },
    attributes: ['id', 'title', 'published_at', 'priority'],
    order: [['published_at', 'DESC']],
    limit: 5,
    raw: true
  });

  return {
    todayAttendance: todayAttendance ? {
      isClockedIn: !!todayAttendance.clock_in_time && !todayAttendance.clock_out_time,
      clockInTime: todayAttendance.clock_in_time,
      clockOutTime: todayAttendance.clock_out_time,
      type: todayAttendance.type
    } : {
      isClockedIn: false,
      clockInTime: null,
      clockOutTime: null,
      type: null
    },
    leaveBalance,
    attendanceHistory: formattedHistory,
    myClaims: myClaims.map(c => ({
      id: c.id,
      type: c.claimType?.name || 'Unknown',
      amount: parseFloat(c.amount),
      date: c.date,
      description: c.description || '',
      status: c.status,
      receipt: !!c.receipt_url
    })),
    upcomingLeaves: upcomingLeaves.map(l => ({
      id: l.id,
      type: l.leave_type?.name || 'Unknown',
      from: l.start_date,
      to: l.end_date,
      days: parseFloat(l.total_days),
      status: l.status
    })),
    recentMemos: recentMemos.map(m => ({
      id: m.id,
      title: m.title,
      date: m.published_at,
      urgent: m.priority === 'Urgent' || m.priority === 'High',
      read: false
    }))
  };
};

const getEmptyStaffDashboard = () => ({
  todayAttendance: { isClockedIn: false, clockInTime: null, clockOutTime: null, type: null },
  leaveBalance: [],
  attendanceHistory: [],
  myClaims: [],
  upcomingLeaves: [],
  recentMemos: []
});

module.exports = {
  getAdminDashboard,
  getManagerDashboard,
  getStaffDashboard
};
