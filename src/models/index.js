const { sequelize } = require('../config/database');
const User = require('./User');
const Employee = require('./Employee');
const YTDStatutory = require('./YTDStatutory');
const Payroll = require('./Payroll');
const LeaveType = require('./LeaveType');
const LeaveEntitlement = require('./LeaveEntitlement');
const Leave = require('./Leave');
const Attendance = require('./Attendance');
const WFHApplication = require('./WFHApplication');
const Claim = require('./Claim');
const ClaimType = require('./ClaimType');
const File = require('./File');
const Memo = require('./Memo');
const MemoReadReceipt = require('./MemoReadReceipt');
const Policy = require('./Policy');
const PolicyAcknowledgment = require('./PolicyAcknowledgment');

// Define associations

// Employee - User (One-to-One)
// In the database schema, employees table has user_id (not users having employee_id)
Employee.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
User.hasOne(Employee, { foreignKey: 'user_id', as: 'employee' });

// Employee - YTDStatutory (One-to-Many)
Employee.hasMany(YTDStatutory, { foreignKey: 'employee_id', as: 'ytd_records' });
YTDStatutory.belongsTo(Employee, { foreignKey: 'employee_id', as: 'employee' });

// Employee - Payroll (One-to-Many)
Employee.hasMany(Payroll, { foreignKey: 'employee_id', as: 'payrolls' });
Payroll.belongsTo(Employee, { foreignKey: 'employee_id', as: 'employee' });

// User - Payroll (processed_by and approved_by)
User.hasMany(Payroll, { foreignKey: 'processed_by', as: 'processed_payrolls' });
Payroll.belongsTo(User, { foreignKey: 'processed_by', as: 'processor' });

User.hasMany(Payroll, { foreignKey: 'approved_by', as: 'approved_payrolls' });
Payroll.belongsTo(User, { foreignKey: 'approved_by', as: 'approver' });

// LeaveType - Leave (One-to-Many)
LeaveType.hasMany(Leave, { foreignKey: 'leave_type_id', as: 'leaves' });
Leave.belongsTo(LeaveType, { foreignKey: 'leave_type_id', as: 'leave_type' });

// Employee - Leave (One-to-Many)
Employee.hasMany(Leave, { foreignKey: 'employee_id', as: 'leaves' });
Leave.belongsTo(Employee, { foreignKey: 'employee_id', as: 'employee' });

// User - Leave Approvals (One-to-Many)
User.hasMany(Leave, { foreignKey: 'approver_id', as: 'approved_leaves' });
Leave.belongsTo(User, { foreignKey: 'approver_id', as: 'approver' });

// LeaveType - LeaveEntitlement (One-to-Many)
LeaveType.hasMany(LeaveEntitlement, { foreignKey: 'leave_type_id', as: 'entitlements' });
LeaveEntitlement.belongsTo(LeaveType, { foreignKey: 'leave_type_id', as: 'leave_type' });

// Employee - LeaveEntitlement (One-to-Many)
Employee.hasMany(LeaveEntitlement, { foreignKey: 'employee_id', as: 'leave_entitlements' });
LeaveEntitlement.belongsTo(Employee, { foreignKey: 'employee_id', as: 'employee' });

// Employee - Attendance (One-to-Many)
Employee.hasMany(Attendance, { foreignKey: 'employee_id', as: 'attendance_records' });
Attendance.belongsTo(Employee, { foreignKey: 'employee_id', as: 'employee' });

// Employee - WFHApplication (One-to-Many)
Employee.hasMany(WFHApplication, { foreignKey: 'employee_id', as: 'wfh_applications' });
WFHApplication.belongsTo(Employee, { foreignKey: 'employee_id', as: 'employee' });

// User - WFHApplication Approvals (One-to-Many)
User.hasMany(WFHApplication, { foreignKey: 'approved_by', as: 'approved_wfh_applications' });
WFHApplication.belongsTo(User, { foreignKey: 'approved_by', as: 'approver' });

// ClaimType - Claim (One-to-Many)
ClaimType.hasMany(Claim, { foreignKey: 'claim_type_id', as: 'claims' });
Claim.belongsTo(ClaimType, { foreignKey: 'claim_type_id', as: 'claimType' });

// Employee - Claim (One-to-Many)
Employee.hasMany(Claim, { foreignKey: 'employee_id', as: 'claims' });
Claim.belongsTo(Employee, { foreignKey: 'employee_id', as: 'employee' });

// User - Claim Manager Approvals (One-to-Many)
User.hasMany(Claim, { foreignKey: 'manager_approved_by', as: 'manager_approved_claims' });
Claim.belongsTo(User, { foreignKey: 'manager_approved_by', as: 'managerApprover' });

// User - Claim Finance Approvals (One-to-Many)
User.hasMany(Claim, { foreignKey: 'finance_approved_by', as: 'finance_approved_claims' });
Claim.belongsTo(User, { foreignKey: 'finance_approved_by', as: 'financeApprover' });

// User - File (One-to-Many) - uploaded_by
User.hasMany(File, { foreignKey: 'uploaded_by', as: 'uploaded_files' });
File.belongsTo(User, { foreignKey: 'uploaded_by', as: 'uploader' });

// Employee - File (One-to-Many)
Employee.hasMany(File, { foreignKey: 'related_to_employee_id', as: 'files' });
File.belongsTo(Employee, { foreignKey: 'related_to_employee_id', as: 'employee' });

// Claim - File (One-to-Many)
Claim.hasMany(File, { foreignKey: 'related_to_claim_id', as: 'files' });
File.belongsTo(Claim, { foreignKey: 'related_to_claim_id', as: 'claim' });

// Leave - File (One-to-Many)
Leave.hasMany(File, { foreignKey: 'related_to_leave_id', as: 'files' });
File.belongsTo(Leave, { foreignKey: 'related_to_leave_id', as: 'leave' });

// Employee - Self-referencing (Reporting Manager)
Employee.hasMany(Employee, { foreignKey: 'reporting_manager_id', as: 'subordinates' });
Employee.belongsTo(Employee, { foreignKey: 'reporting_manager_id', as: 'manager' });

// Memo - User (author)
User.hasMany(Memo, { foreignKey: 'author_id', as: 'authored_memos' });
Memo.belongsTo(User, { foreignKey: 'author_id', as: 'author' });

// Memo - MemoReadReceipt (One-to-Many)
Memo.hasMany(MemoReadReceipt, { foreignKey: 'memo_id', as: 'read_receipts' });
MemoReadReceipt.belongsTo(Memo, { foreignKey: 'memo_id', as: 'memo' });

// Employee - MemoReadReceipt (One-to-Many)
Employee.hasMany(MemoReadReceipt, { foreignKey: 'employee_id', as: 'memo_read_receipts' });
MemoReadReceipt.belongsTo(Employee, { foreignKey: 'employee_id', as: 'employee' });

// Policy - User (author and approver)
User.hasMany(Policy, { foreignKey: 'author_id', as: 'authored_policies' });
Policy.belongsTo(User, { foreignKey: 'author_id', as: 'author' });

User.hasMany(Policy, { foreignKey: 'approved_by', as: 'approved_policies' });
Policy.belongsTo(User, { foreignKey: 'approved_by', as: 'approver' });

// Policy - Self-referencing (versioning)
Policy.hasMany(Policy, { foreignKey: 'parent_policy_id', as: 'versions' });
Policy.belongsTo(Policy, { foreignKey: 'parent_policy_id', as: 'parent' });

// Policy - PolicyAcknowledgment (One-to-Many)
Policy.hasMany(PolicyAcknowledgment, { foreignKey: 'policy_id', as: 'acknowledgments' });
PolicyAcknowledgment.belongsTo(Policy, { foreignKey: 'policy_id', as: 'policy' });

// Employee - PolicyAcknowledgment (One-to-Many)
Employee.hasMany(PolicyAcknowledgment, { foreignKey: 'employee_id', as: 'policy_acknowledgments' });
PolicyAcknowledgment.belongsTo(Employee, { foreignKey: 'employee_id', as: 'employee' });

// Sync database
const syncDatabase = async (options = {}) => {
  try {
    await sequelize.sync(options);
    console.log('✓ Database synchronized successfully');
  } catch (error) {
    console.error('✗ Database sync error:', error.message);
    throw error;
  }
};

module.exports = {
  sequelize,
  User,
  Employee,
  YTDStatutory,
  Payroll,
  LeaveType,
  LeaveEntitlement,
  Leave,
  Attendance,
  WFHApplication,
  Claim,
  ClaimType,
  File,
  Memo,
  MemoReadReceipt,
  Policy,
  PolicyAcknowledgment,
  syncDatabase
};
