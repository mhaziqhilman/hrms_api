const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const bcrypt = require('bcryptjs');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  email: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true
    }
  },
  password: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  role: {
    type: DataTypes.ENUM('super_admin', 'admin', 'manager', 'staff'),
    allowNull: false,
    defaultValue: 'staff'
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'is_active'
  },
  failed_login_attempts: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'failed_login_attempts'
  },
  locked_until: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'locked_until'
  },
  last_login_at: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'last_login_at'
  },
  remember_token: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'remember_token'
  }
}, {
  tableName: 'users',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  hooks: {
    beforeCreate: async (user) => {
      if (user.password) {
        user.password = await bcrypt.hash(user.password, 10);
      }
    },
    beforeUpdate: async (user) => {
      if (user.changed('password')) {
        user.password = await bcrypt.hash(user.password, 10);
      }
    }
  }
});

// Instance methods
User.prototype.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

User.prototype.incrementFailedAttempts = async function() {
  this.failed_login_attempts += 1;

  // Lock account after 5 failed attempts for 30 minutes
  if (this.failed_login_attempts >= 5) {
    this.locked_until = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
  }

  await this.save();
};

User.prototype.resetFailedAttempts = async function() {
  this.failed_login_attempts = 0;
  this.locked_until = null;
  await this.save();
};

User.prototype.isLocked = function() {
  return this.locked_until && this.locked_until > new Date();
};

User.prototype.updateLastLogin = async function() {
  this.last_login_at = new Date();
  await this.save();
};

User.prototype.toJSON = function() {
  const values = { ...this.get() };
  delete values.password;
  delete values.remember_token;
  return values;
};

module.exports = User;
