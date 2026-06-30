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
  PublicHoliday,
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
      [fn('SUM', col('epf_employee')), 'total_epf_employee'],
      [fn('SUM', col('epf_employer')), 'total_epf_employer'],
      [fn('SUM', col('socso_employee')), 'total_socso_employee'],
      [fn('SUM', col('socso_employer')), 'total_socso_employer'],
      [fn('SUM', col('eis_employee')), 'total_eis_employee'],
      [fn('SUM', col('eis_employer')), 'total_eis_employer'],
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

  // 3b. Payroll trend — last 6 months net salary
  const trendMonths = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(currentYear, currentMonth - 1 - i, 1);
    trendMonths.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }

  const trendRows = await Payroll.findAll({
    attributes: [
      'year',
      'month',
      [fn('SUM', col('gross_salary')), 'total_gross'],
      [fn('SUM', literal('epf_employee + socso_employee + eis_employee')), 'total_statutory'],
      [fn('SUM', col('pcb_deduction')), 'total_pcb'],
      [fn('SUM', col('epf_employee')), 'total_epf_employee'],
      [fn('SUM', col('epf_employer')), 'total_epf_employer'],
      [fn('SUM', col('socso_employee')), 'total_socso_employee'],
      [fn('SUM', col('socso_employer')), 'total_socso_employer'],
      [fn('SUM', col('eis_employee')), 'total_eis_employee'],
      [fn('SUM', col('eis_employer')), 'total_eis_employer'],
      [fn('SUM', col('net_salary')), 'total_net']
    ],
    where: {
      [Op.or]: trendMonths.map(t => ({ year: t.year, month: t.month })),
      status: { [Op.in]: ['Approved', 'Paid'] }
    },
    include: [{ model: Employee, as: 'employee', where: { company_id: companyId }, attributes: [], required: true }],
    group: ['Payroll.year', 'Payroll.month'],
    raw: true
  });

  const monthShort = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const trendMap = new Map(trendRows.map(r => [`${r.year}-${r.month}`, {
    gross: parseFloat(r.total_gross) || 0,
    statutory: parseFloat(r.total_statutory) || 0,
    pcb: parseFloat(r.total_pcb) || 0,
    net: parseFloat(r.total_net) || 0,
    epfEmployee: parseFloat(r.total_epf_employee) || 0,
    epfEmployer: parseFloat(r.total_epf_employer) || 0,
    socsoEmployee: parseFloat(r.total_socso_employee) || 0,
    socsoEmployer: parseFloat(r.total_socso_employer) || 0,
    eisEmployee: parseFloat(r.total_eis_employee) || 0,
    eisEmployer: parseFloat(r.total_eis_employer) || 0
  }]));
  const emptyTrend = { gross: 0, statutory: 0, pcb: 0, net: 0, epfEmployee: 0, epfEmployer: 0, socsoEmployee: 0, socsoEmployer: 0, eisEmployee: 0, eisEmployer: 0 };
  const payrollTrend = trendMonths.map((t, i) => {
    const row = trendMap.get(`${t.year}-${t.month}`) || emptyTrend;
    return {
      year: t.year,
      month: t.month,
      label: monthShort[t.month],
      total: row.net,
      gross: row.gross,
      statutory: row.statutory,
      pcb: row.pcb,
      epfEmployee: row.epfEmployee,
      epfEmployer: row.epfEmployer,
      socsoEmployee: row.socsoEmployee,
      socsoEmployer: row.socsoEmployer,
      eisEmployee: row.eisEmployee,
      eisEmployer: row.eisEmployer,
      isCurrent: i === trendMonths.length - 1
    };
  });

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

  // 6. Employee by type (for donut chart)
  const employeeByType = await Employee.findAll({
    attributes: [
      'employment_type',
      [fn('COUNT', col('id')), 'count']
    ],
    where: { company_id: companyId, employment_status: 'Active' },
    group: ['employment_type'],
    raw: true
  });

  // 7. Gender diversity (for horizontal bar chart)
  const genderDiversity = await Employee.findAll({
    attributes: [
      'gender',
      [fn('COUNT', col('id')), 'count']
    ],
    where: { company_id: companyId, employment_status: 'Active' },
    group: ['gender'],
    raw: true
  });

  // 8. Department distribution (for bar chart)
  const departmentDistribution = await Employee.findAll({
    attributes: [
      'department',
      [fn('COUNT', col('id')), 'count']
    ],
    where: {
      company_id: companyId,
      employment_status: 'Active',
      department: { [Op.ne]: null }
    },
    group: ['department'],
    order: [[literal('count'), 'DESC']],
    limit: 8,
    raw: true
  });

  // 9. Recent activities - derive from recent records
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
      totalNetSalary: parseFloat(payrollSummary?.total_net || 0),
      epfEmployee: parseFloat(payrollSummary?.total_epf_employee || 0),
      epfEmployer: parseFloat(payrollSummary?.total_epf_employer || 0),
      socsoEmployee: parseFloat(payrollSummary?.total_socso_employee || 0),
      socsoEmployer: parseFloat(payrollSummary?.total_socso_employer || 0),
      eisEmployee: parseFloat(payrollSummary?.total_eis_employee || 0),
      eisEmployer: parseFloat(payrollSummary?.total_eis_employer || 0),
      pcbEmployee: parseFloat(payrollSummary?.total_pcb || 0)
    },
    payrollTrend,
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
    currentYear,
    employeeByType: employeeByType.map(e => ({
      type: e.employment_type || 'Unknown',
      count: parseInt(e.count)
    })),
    genderDiversity: genderDiversity.map(g => ({
      gender: g.gender || 'Unknown',
      count: parseInt(g.count)
    })),
    departmentDistribution: departmentDistribution.map(d => ({
      department: d.department || 'Unknown',
      count: parseInt(d.count)
    })),
    lastUpdated: new Date().toISOString()
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
  let effectiveTeamMembers = teamMembers;

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
    effectiveTeamMembers = deptMembers;
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

  // ─── Team roster — full team list with each member's status today ──────
  const STATUS_RANK = { Present: 0, WFH: 1, Leave: 2, Absent: 3 };
  const teamRoster = effectiveTeamMembers
    .map(m => {
      const att = teamAttendanceToday.find(a => a.employee_id === m.id);
      const leaveRec = onLeaveMembers.find(l => l.employee_id === m.id);
      let status = 'Absent';
      let clockIn = null;
      let late = false;
      if (att) {
        status = att.type === 'WFH' ? 'WFH' : 'Present';
        late = att.is_late || false;
        if (att.clock_in_time) {
          const ci = new Date(att.clock_in_time);
          clockIn = `${String(ci.getHours()).padStart(2, '0')}:${String(ci.getMinutes()).padStart(2, '0')}`;
        }
      } else if (leaveRec) {
        status = 'Leave';
      }
      return { name: m.full_name || 'Unknown', status, clockIn, late };
    })
    .sort((a, b) => {
      const rank = STATUS_RANK[a.status] - STATUS_RANK[b.status];
      if (rank !== 0) return rank;
      if (a.clockIn && b.clockIn) return a.clockIn.localeCompare(b.clockIn);
      return a.name.localeCompare(b.name);
    });

  // ─── Week ahead — planned leave & WFH for this week + next week ────────
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const toDateStr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const firstName = (full) => (full || 'Unknown').trim().split(/\s+/)[0];

  const todayDate = new Date(`${today}T00:00:00`);
  const dow = todayDate.getDay();
  const thisWeekMonday = new Date(todayDate);
  thisWeekMonday.setDate(todayDate.getDate() + (dow === 0 ? -6 : 1 - dow));
  const nextWeekMonday = new Date(thisWeekMonday);
  nextWeekMonday.setDate(thisWeekMonday.getDate() + 7);

  const buildWeek = (weekMonday) => {
    const days = [];
    for (let i = 0; i < 5; i++) {
      const d = new Date(weekMonday);
      d.setDate(weekMonday.getDate() + i);
      const key = toDateStr(d);
      days.push({ key, label: `${DAY_SHORT[d.getDay()]} ${d.getDate()}`, isToday: key === today, events: [] });
    }
    return days;
  };

  const thisWeekDays = buildWeek(thisWeekMonday);
  const nextWeekDays = buildWeek(nextWeekMonday);
  const allWeekDays = [...thisWeekDays, ...nextWeekDays];
  const rangeStart = allWeekDays[0].key;
  const rangeEnd = allWeekDays[allWeekDays.length - 1].key;

  let weekWfh = [];
  let weekLeaves = [];
  if (effectiveTeamIds.length > 0) {
    weekWfh = await WFHApplication.findAll({
      where: {
        employee_id: { [Op.in]: effectiveTeamIds },
        status: 'Approved',
        date: { [Op.between]: [rangeStart, rangeEnd] }
      },
      include: [{ model: Employee, as: 'employee', attributes: ['full_name'] }],
      raw: false
    });
    weekLeaves = await Leave.findAll({
      where: {
        employee_id: { [Op.in]: effectiveTeamIds },
        status: 'Approved',
        start_date: { [Op.lte]: rangeEnd },
        end_date: { [Op.gte]: rangeStart }
      },
      include: [
        { model: Employee, as: 'employee', attributes: ['full_name'] },
        { model: LeaveType, as: 'leave_type', attributes: ['name'] }
      ],
      raw: false
    });
  }

  allWeekDays.forEach(day => {
    weekWfh.forEach(w => {
      if (w.date === day.key) {
        day.events.push({ employee: firstName(w.employee?.full_name), type: 'WFH', detail: 'WFH' });
      }
    });
    weekLeaves.forEach(l => {
      if (l.start_date <= day.key && l.end_date >= day.key) {
        day.events.push({ employee: firstName(l.employee?.full_name), type: 'Leave', detail: l.leave_type?.name || 'Leave' });
      }
    });
  });

  const rangeLabel = (days) => {
    const first = new Date(`${days[0].key}T00:00:00`);
    const last = new Date(`${days[days.length - 1].key}T00:00:00`);
    return `${first.getDate()} ${MONTHS[first.getMonth()]} – ${last.getDate()} ${MONTHS[last.getMonth()]}`;
  };

  // Coverage note — the weekday with the most people on leave this week
  let heaviest = null;
  thisWeekDays.forEach(day => {
    const leaveCount = day.events.filter(e => e.type === 'Leave').length;
    if (leaveCount > 0 && (!heaviest || leaveCount > heaviest.count)) {
      heaviest = { label: day.label, count: leaveCount };
    }
  });
  const coverageNote = heaviest
    ? `Heaviest day: ${heaviest.label} · ${heaviest.count} on leave`
    : 'No planned leave this week — full coverage';

  const weekAhead = {
    thisWeek: { rangeLabel: rangeLabel(thisWeekDays), days: thisWeekDays },
    nextWeek: { rangeLabel: rangeLabel(nextWeekDays), days: nextWeekDays },
    coverageNote
  };

  // ─── Team pulse — rolling 30-day metrics ───────────────────────────────
  const start30 = new Date(todayDate);
  start30.setDate(todayDate.getDate() - 30);
  const start30Str = toDateStr(start30);

  let attCount = 0;
  let lateCount = 0;
  let decisions = 0;
  if (effectiveTeamIds.length > 0) {
    attCount = await Attendance.count({
      where: { employee_id: { [Op.in]: effectiveTeamIds }, date: { [Op.between]: [start30Str, today] } }
    });
    lateCount = await Attendance.count({
      where: { employee_id: { [Op.in]: effectiveTeamIds }, date: { [Op.between]: [start30Str, today] }, is_late: true }
    });
    const decidedLeaves = await Leave.count({
      where: { employee_id: { [Op.in]: effectiveTeamIds }, status: { [Op.in]: ['Approved', 'Rejected'] }, updated_at: { [Op.gte]: start30 } }
    });
    const decidedClaims = await Claim.count({
      where: { employee_id: { [Op.in]: effectiveTeamIds }, status: { [Op.ne]: 'Pending' }, updated_at: { [Op.gte]: start30 } }
    });
    const decidedWfh = await WFHApplication.count({
      where: { employee_id: { [Op.in]: effectiveTeamIds }, status: { [Op.in]: ['Approved', 'Rejected'] }, updated_at: { [Op.gte]: start30 } }
    });
    decisions = decidedLeaves + decidedClaims + decidedWfh;
  }

  let workingDays = 0;
  for (let i = 0; i < 30; i++) {
    const d = new Date(todayDate);
    d.setDate(todayDate.getDate() - i);
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) workingDays++;
  }
  const expectedAtt = effectiveTotal * workingDays;
  const teamPulse = {
    attendanceRate: expectedAtt > 0 ? Math.min(100, Math.round((attCount / expectedAtt) * 100)) : 0,
    onTimeRate: attCount > 0 ? Math.round(((attCount - lateCount) / attCount) * 100) : 0,
    decisions
  };

  // Leave requests starting within 2 days are flagged urgent
  const urgentCutoff = new Date(todayDate);
  urgentCutoff.setDate(todayDate.getDate() + 2);
  const urgentCutoffStr = toDateStr(urgentCutoff);

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
    teamRoster,
    weekAhead,
    teamPulse,
    leavePendingApproval: pendingLeaves.map(l => ({
      id: l.id,
      public_id: l.public_id,
      employee: l.employee?.full_name || 'Unknown',
      type: l.leave_type?.name || 'Unknown',
      from: l.start_date,
      to: l.end_date,
      days: parseFloat(l.total_days),
      reason: l.reason || '',
      status: l.status,
      urgent: l.start_date <= urgentCutoffStr
    })),
    claimsPendingApproval: pendingClaims.map(c => ({
      id: c.id,
      public_id: c.public_id,
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
  teamRoster: [],
  weekAhead: {
    thisWeek: { rangeLabel: '', days: [] },
    nextWeek: { rangeLabel: '', days: [] },
    coverageNote: 'No planned leave this week — full coverage'
  },
  teamPulse: { attendanceRate: 0, onTimeRate: 0, decisions: 0 },
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

  // 7. Next upcoming public holiday (only if within 30 days)
  const HOLIDAY_WINDOW_DAYS = 30;
  const todayDate = new Date(`${today}T00:00:00`);
  const windowEnd = new Date(todayDate);
  windowEnd.setDate(windowEnd.getDate() + HOLIDAY_WINDOW_DAYS);
  const windowEndStr = `${windowEnd.getFullYear()}-${String(windowEnd.getMonth() + 1).padStart(2, '0')}-${String(windowEnd.getDate()).padStart(2, '0')}`;

  const upcomingHoliday = await PublicHoliday.findOne({
    where: {
      company_id: companyId,
      date: { [Op.between]: [today, windowEndStr] }
    },
    order: [['date', 'ASC']],
    attributes: ['id', 'name', 'date', 'description'],
    raw: true
  });

  let nextPublicHoliday = null;
  if (upcomingHoliday) {
    const hDate = new Date(`${upcomingHoliday.date}T00:00:00`);
    const daysAway = Math.round((hDate.getTime() - todayDate.getTime()) / 86400000);
    nextPublicHoliday = {
      id: upcomingHoliday.id,
      name: upcomingHoliday.name,
      date: upcomingHoliday.date,
      description: upcomingHoliday.description || null,
      daysAway,
      weekday: hDate.toLocaleDateString('en-US', { weekday: 'long' })
    };
  }

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
    })),
    nextPublicHoliday
  };
};

const getEmptyStaffDashboard = () => ({
  todayAttendance: { isClockedIn: false, clockInTime: null, clockOutTime: null, type: null },
  leaveBalance: [],
  attendanceHistory: [],
  myClaims: [],
  upcomingLeaves: [],
  recentMemos: [],
  nextPublicHoliday: null
});

module.exports = {
  getAdminDashboard,
  getManagerDashboard,
  getStaffDashboard
};
