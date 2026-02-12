const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Attendance = sequelize.define('Attendance', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
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
  clock_in_time: {
    type: DataTypes.DATE,
    allowNull: true
  },
  clock_out_time: {
    type: DataTypes.DATE,
    allowNull: true
  },
  total_hours: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true,
  },
  type: {
    type: DataTypes.ENUM('Office', 'WFH'),
    defaultValue: 'Office'
  },
  location_lat: {
    type: DataTypes.DECIMAL(10, 8),
    allowNull: true
  },
  location_long: {
    type: DataTypes.DECIMAL(11, 8),
    allowNull: true
  },
  location_address: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  is_late: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  late_minutes: {
    type: DataTypes.INTEGER,
    allowNull: true,
    _comment: 'Minutes late from standard start time (9:00 AM)'
  },
  is_early_leave: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  early_leave_minutes: {
    type: DataTypes.INTEGER,
    allowNull: true,
    _comment: 'Minutes early from standard end time (6:00 PM)'
  },
  remarks: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'attendance',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      unique: true,
      fields: ['employee_id', 'date']
    },
    {
      fields: ['date']
    }
  ]
});

module.exports = Attendance;
