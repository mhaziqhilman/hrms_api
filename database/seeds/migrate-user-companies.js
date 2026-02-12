/**
 * One-time migration script: Populate user_companies join table
 * from existing User.company_id + User.role data.
 *
 * Run after DB_SYNC creates the user_companies table:
 *   node database/seeds/migrate-user-companies.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const { sequelize, User, Employee, UserCompany } = require('../../src/models');

const migrate = async () => {
  try {
    await sequelize.authenticate();
    console.log('Database connected.');

    // Find all users with a company_id
    const users = await User.findAll({
      where: {
        company_id: { [require('sequelize').Op.ne]: null }
      },
      attributes: ['id', 'company_id', 'role']
    });

    console.log(`Found ${users.length} users with company assignments.`);

    let created = 0;
    let skipped = 0;

    for (const user of users) {
      // Check if membership already exists
      const existing = await UserCompany.findOne({
        where: { user_id: user.id, company_id: user.company_id }
      });

      if (existing) {
        skipped++;
        continue;
      }

      // Look up the employee record for this user + company
      const employee = await Employee.findOne({
        where: { user_id: user.id, company_id: user.company_id },
        attributes: ['id']
      });

      await UserCompany.create({
        user_id: user.id,
        company_id: user.company_id,
        role: user.role === 'super_admin' ? 'admin' : user.role,
        employee_id: employee ? employee.id : null,
        joined_at: new Date()
      });

      created++;
    }

    console.log(`Migration complete: ${created} memberships created, ${skipped} already existed.`);
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  }
};

migrate();
