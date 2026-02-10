const { Sequelize } = require('sequelize');
require('dotenv').config();

const dbOptions = {
  dialect: 'postgres',
  logging: process.env.NODE_ENV === 'development' ? console.log : false,
  pool: {
    max: 10,
    min: 0,
    acquire: 30000,
    idle: 10000
  },
  define: {
    timestamps: true,
    underscored: true,
    freezeTableName: true
  },
  timezone: 'Asia/Kuala_Lumpur',
  dialectOptions: {
    ssl: process.env.DB_SSL === 'true' ? { require: true, rejectUnauthorized: false } : false
  }
};

// Support DATABASE_URL connection string (Supabase) or individual params
const sequelize = process.env.DATABASE_URL
  ? new Sequelize(process.env.DATABASE_URL, dbOptions)
  : new Sequelize(
      process.env.DB_NAME || 'hrms_db',
      process.env.DB_USER || 'postgres',
      process.env.DB_PASSWORD || '',
      {
        ...dbOptions,
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 5432
      }
    );

// Test database connection
const testConnection = async () => {
  try {
    await sequelize.authenticate();
    console.log('✓ Database connection established successfully');
  } catch (error) {
    console.error('✗ Unable to connect to database:', error.message);
    process.exit(1);
  }
};

module.exports = { sequelize, testConnection };
