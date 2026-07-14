const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * Overtime request (table: overtime_requests)
 *
 * An employee (or admin on their behalf) files an OT request for a given day.
 * The amount is auto-computed from Malaysian Employment Act multipliers:
 *   hourly_rate = basic_salary / 26 / 8
 *   amount      = hours * multiplier * hourly_rate
 *   multiplier  = 1.5 (normal) | 2.0 (rest day) | 3.0 (public holiday)
 *
 * Single-level approval by the reporting manager (admins can also approve).
 * Approved OT auto-sums into payroll.overtime_pay when a pay run is generated;
 * `payroll_id` marks a record as consumed so it is never paid twice.
 */
const Overtime = sequelize.define('Overtime', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  public_id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    allowNull: true,
    unique: true
  },
  company_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'companies',
      key: 'id'
    }
  },
  employee_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'employees',
      key: 'id'
    }
  },
  date: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  // Derived from `date` at submit time, indexed for pay-run period lookups
  period_year: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  period_month: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  day_type: {
    type: DataTypes.ENUM('normal', 'rest_day', 'public_holiday'),
    allowNull: false,
    defaultValue: 'normal'
  },
  hours: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: false
  },
  // Optional worked time range (for display); hours is the source of truth for pay
  start_time: {
    type: DataTypes.TIME,
    allowNull: true
  },
  end_time: {
    type: DataTypes.TIME,
    allowNull: true
  },
  // Snapshots taken at submit time so historical records stay accurate
  multiplier: {
    type: DataTypes.DECIMAL(3, 2),
    allowNull: false
  },
  hourly_rate: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  reason: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  source: {
    type: DataTypes.ENUM('manual', 'attendance'),
    allowNull: false,
    defaultValue: 'manual'
  },
  attendance_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'attendance',
      key: 'id'
    }
  },
  status: {
    type: DataTypes.ENUM('Pending', 'Approved', 'Rejected'),
    allowNull: false,
    defaultValue: 'Pending'
  },
  manager_approved_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  manager_approved_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  rejection_reason: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  // Set when the approved OT is pulled into a generated pay run (prevents double-counting)
  payroll_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'payroll',
      key: 'id'
    }
  }
}, {
  tableName: 'overtime_requests',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      fields: ['employee_id', 'status']
    },
    {
      fields: ['company_id', 'period_year', 'period_month']
    },
    {
      fields: ['date']
    }
  ]
});

module.exports = Overtime;
