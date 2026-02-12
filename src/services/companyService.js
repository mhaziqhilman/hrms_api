const { sequelize, Company, User, Employee, UserCompany } = require('../models');
const logger = require('../utils/logger');

/**
 * Create a company with initial employee (transactional)
 */
const createCompany = async (userId, companyData, initialEmployeeData) => {
  const transaction = await sequelize.transaction();

  try {
    // Fetch current user to check role
    const currentUser = await User.findByPk(userId, { attributes: ['id', 'role'], transaction });

    // Create the company
    const company = await Company.create({
      name: companyData.name,
      registration_no: companyData.registration_no || null,
      description: companyData.description || null,
      industry: companyData.industry || null,
      size: companyData.size || null,
      country: companyData.country || 'Malaysia',
      address: companyData.address || null,
      phone: companyData.phone || null,
      website: companyData.website || null,
      owner_id: userId
    }, { transaction });

    const isSuperAdmin = currentUser.role === 'super_admin';

    // For non-super_admin: set company_id and promote to admin
    // For super_admin: do NOT assign company_id (super_admin stays company-agnostic)
    if (!isSuperAdmin) {
      await User.update(
        {
          company_id: company.id,
          role: 'admin'
        },
        {
          where: { id: userId },
          transaction
        }
      );
    }

    // Create initial employee record if provided
    let employee = null;
    if (initialEmployeeData) {
      employee = await Employee.create({
        user_id: userId,
        company_id: company.id,
        employee_id: initialEmployeeData.employee_id,
        full_name: initialEmployeeData.full_name,
        gender: initialEmployeeData.gender,
        position: initialEmployeeData.position || null,
        department: initialEmployeeData.department || null,
        join_date: initialEmployeeData.join_date,
        basic_salary: initialEmployeeData.basic_salary,
        email: initialEmployeeData.email || null,
        mobile: initialEmployeeData.mobile || null,
        employment_status: 'Active',
        employment_type: 'Permanent'
      }, { transaction });
    }

    // Create UserCompany membership record (always 'admin' for company creator in membership table)
    await UserCompany.create({
      user_id: userId,
      company_id: company.id,
      role: 'admin',
      employee_id: employee ? employee.id : null,
      joined_at: new Date()
    }, { transaction });

    // If super_admin created the company, keep their active role as super_admin
    // (the UserCompany record stores 'admin' for per-company role, but User.role stays super_admin)

    await transaction.commit();

    logger.info(`Company created: ${company.name} (ID: ${company.id}) by user ${userId}`);

    return { company, employee };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

/**
 * Get company by ID
 */
const getCompanyById = async (companyId) => {
  return await Company.findByPk(companyId, {
    include: [{
      model: User,
      as: 'owner',
      attributes: ['id', 'email']
    }]
  });
};

/**
 * Get company by user
 */
const getCompanyByUserId = async (userId) => {
  const user = await User.findByPk(userId, {
    attributes: ['company_id']
  });

  if (!user || !user.company_id) {
    return null;
  }

  return await getCompanyById(user.company_id);
};

/**
 * Update company
 */
const updateCompany = async (companyId, updateData) => {
  const company = await Company.findByPk(companyId);
  if (!company) {
    throw new Error('Company not found');
  }

  const allowedFields = [
    'name', 'registration_no', 'description', 'industry',
    'size', 'country', 'address', 'phone', 'website', 'logo_url'
  ];

  const filteredData = {};
  for (const field of allowedFields) {
    if (updateData[field] !== undefined) {
      filteredData[field] = updateData[field];
    }
  }

  await company.update(filteredData);
  return company;
};

/**
 * Get all companies a user belongs to
 */
const getUserCompanies = async (userId) => {
  return await UserCompany.findAll({
    where: { user_id: userId },
    include: [{
      model: Company,
      as: 'company',
      attributes: ['id', 'name', 'registration_no', 'industry', 'logo_url']
    }],
    order: [['joined_at', 'ASC']]
  });
};

/**
 * Get all companies (super_admin only)
 */
const getAllCompanies = async () => {
  return await Company.findAll({
    attributes: ['id', 'name', 'registration_no', 'industry', 'logo_url'],
    order: [['name', 'ASC']]
  });
};

/**
 * Switch user's active company
 * For super_admin: view-only context (NOT persisted to DB, only reflected in JWT)
 * For others: validates membership, updates User.company_id and User.role
 */
const switchCompany = async (userId, companyId) => {
  // Fetch current user to check role
  const currentUser = await User.findByPk(userId, { attributes: ['id', 'role'] });
  if (!currentUser) throw new Error('User not found');

  const isSuperAdmin = currentUser.role === 'super_admin';
  let membershipRole = null;

  // For super_admin: verify company exists; for others: validate membership
  if (isSuperAdmin) {
    const companyExists = await Company.findByPk(companyId, { attributes: ['id', 'name'] });
    if (!companyExists) throw new Error('Company not found');
  } else {
    const membership = await UserCompany.findOne({
      where: { user_id: userId, company_id: companyId }
    });
    if (!membership) throw new Error('You are not a member of this company');
    membershipRole = membership.role;
  }

  // For super_admin: do NOT persist company_id to DB (view-only context via JWT)
  // For others: update DB with new company_id and role
  if (!isSuperAdmin) {
    await User.update(
      {
        company_id: companyId,
        role: membershipRole
      },
      { where: { id: userId } }
    );
  }

  // Fetch the user (DB company_id stays null for super_admin)
  const updatedUser = await User.findByPk(userId, {
    attributes: { exclude: ['password'] },
    include: [
      {
        model: Employee,
        as: 'employee',
        attributes: ['id', 'full_name', 'employee_id', 'department', 'position'],
        required: false,
        where: { company_id: companyId }
      },
      {
        model: Company,
        as: 'company',
        attributes: ['id', 'name'],
        required: false
      }
    ]
  });

  // For super_admin: override company_id on the returned object for JWT generation
  // This sets the viewing context without persisting to DB
  if (isSuperAdmin) {
    updatedUser.dataValues.company_id = companyId;
    const viewingCompany = await Company.findByPk(companyId, { attributes: ['id', 'name'] });
    updatedUser.dataValues.company = viewingCompany;
  }

  return updatedUser;
};

/**
 * Clear super_admin's viewing company context
 * Returns user with company_id = null for JWT generation
 */
const clearCompanyContext = async (userId) => {
  const user = await User.findByPk(userId, {
    attributes: { exclude: ['password'] }
  });
  if (!user) throw new Error('User not found');
  if (user.role !== 'super_admin') throw new Error('Only super_admin can clear company context');

  // Ensure DB company_id is null (should already be, but just in case)
  if (user.company_id) {
    await User.update({ company_id: null }, { where: { id: userId } });
  }

  // Return user with null company context
  const updatedUser = await User.findByPk(userId, {
    attributes: { exclude: ['password'] }
  });
  updatedUser.dataValues.company = null;
  updatedUser.dataValues.company_id = null;

  return updatedUser;
};

module.exports = {
  createCompany,
  getCompanyById,
  getCompanyByUserId,
  getAllCompanies,
  getUserCompanies,
  switchCompany,
  clearCompanyContext,
  updateCompany
};
