const PayRun = require('../models/PayRun');
const Payroll = require('../models/Payroll');
const Employee = require('../models/Employee');
const User = require('../models/User');
const { Op } = require('sequelize');
const { sequelize } = require('../config/database');
const logger = require('../utils/logger');

/**
 * Get all pay runs for the company with optional year filter
 */
exports.getPayRuns = async (req, res, next) => {
  try {
    const { year, status } = req.query;
    const where = { company_id: req.user.company_id };

    if (year) where.year = parseInt(year);
    if (status) where.status = status;

    const payRuns = await PayRun.findAll({
      where,
      order: [['year', 'DESC'], ['month', 'DESC']],
      include: [
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'email']
        }
      ]
    });

    res.status(200).json({
      success: true,
      data: payRuns
    });
  } catch (error) {
    logger.error('Error fetching pay runs:', error);
    next(error);
  }
};

/**
 * Get single pay run with its payrolls
 */
exports.getPayRunById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const payRun = await PayRun.findOne({
      where: { public_id: id, company_id: req.user.company_id },
      include: [
        {
          model: Payroll,
          as: 'payrolls',
          include: [{
            model: Employee,
            as: 'employee',
            attributes: ['id', 'public_id', 'employee_id', 'full_name', 'department', 'position']
          }]
        },
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'email']
        }
      ]
    });

    if (!payRun) {
      return res.status(404).json({ success: false, message: 'Pay run not found' });
    }

    res.status(200).json({ success: true, data: payRun });
  } catch (error) {
    logger.error('Error fetching pay run:', error);
    next(error);
  }
};

/**
 * Recalculate pay run totals from its linked payrolls
 */
exports.recalculatePayRunTotals = async (payRunId, transaction = null) => {
  const payrolls = await Payroll.findAll({
    where: { pay_run_id: payRunId, status: { [Op.notIn]: ['Cancelled'] } },
    attributes: ['gross_salary', 'total_deductions', 'net_salary', 'epf_employer', 'socso_employer', 'eis_employer', 'status'],
    ...(transaction ? { transaction } : {})
  });

  const totalGross = payrolls.reduce((sum, p) => sum + parseFloat(p.gross_salary || 0), 0);
  const totalDeductions = payrolls.reduce((sum, p) => sum + parseFloat(p.total_deductions || 0), 0);
  const totalNet = payrolls.reduce((sum, p) => sum + parseFloat(p.net_salary || 0), 0);
  const totalEmployerCost = payrolls.reduce((sum, p) =>
    sum + parseFloat(p.epf_employer || 0) + parseFloat(p.socso_employer || 0) + parseFloat(p.eis_employer || 0), 0);

  // Derive pay run status from individual payrolls
  const statuses = new Set(payrolls.map(p => p.status));
  let status = 'Draft';
  if (statuses.size === 1) {
    const s = [...statuses][0];
    if (s === 'Paid' || s === 'Approved') status = s;
    else if (s === 'Pending') status = 'Pending';
    else if (s === 'Draft') status = 'Draft';
    else if (s === 'Cancelled') status = 'Cancelled';
  } else if (statuses.has('Paid') && !statuses.has('Draft') && !statuses.has('Pending')) {
    status = 'Paid';
  } else if (statuses.has('Pending') || statuses.has('Approved')) {
    status = 'Pending';
  }

  await PayRun.update({
    total_employees: payrolls.length,
    total_gross: totalGross.toFixed(2),
    total_deductions: totalDeductions.toFixed(2),
    total_net: totalNet.toFixed(2),
    total_employer_cost: totalEmployerCost.toFixed(2),
    status
  }, {
    where: { id: payRunId },
    ...(transaction ? { transaction } : {})
  });
};

/**
 * Delete a pay run.
 * - Draft / Pending  → hard delete pay run + all linked payrolls
 * - Approved         → soft cancel: set pay run and all payrolls to 'Cancelled'
 * - Paid / Cancelled → blocked
 */
exports.deletePayRun = async (req, res, next) => {
  const transaction = await sequelize.transaction();

  try {
    const { id } = req.params;

    const payRun = await PayRun.findOne({
      where: { public_id: id, company_id: req.user.company_id },
      transaction
    });

    if (!payRun) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Pay run not found' });
    }

    if (payRun.status === 'Paid') {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Cannot delete a paid pay run. Payment has already been disbursed.'
      });
    }

    if (payRun.status === 'Cancelled') {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Pay run is already cancelled.'
      });
    }

    const linkedPayrolls = await Payroll.findAll({
      where: { pay_run_id: payRun.id },
      transaction
    });

    if (payRun.status === 'Approved') {
      // Soft cancel — cancel pay run and all its payrolls (preserves audit trail)
      await Payroll.update(
        { status: 'Cancelled' },
        { where: { pay_run_id: payRun.id, status: { [Op.ne]: 'Cancelled' } }, transaction }
      );
      await payRun.update({ status: 'Cancelled' }, { transaction });

      await transaction.commit();

      logger.info(`Pay run ${id} cancelled (soft-delete) by user ${req.user.id}`, {
        affected_payrolls: linkedPayrolls.length
      });

      return res.status(200).json({
        success: true,
        message: `Pay run cancelled. ${linkedPayrolls.length} linked payroll${linkedPayrolls.length > 1 ? 's' : ''} also cancelled.`,
        data: { mode: 'cancelled', affected: linkedPayrolls.length }
      });
    }

    // Draft / Pending — hard delete
    await Payroll.destroy({
      where: { pay_run_id: payRun.id },
      transaction
    });
    await payRun.destroy({ transaction });

    await transaction.commit();

    logger.info(`Pay run ${id} permanently deleted by user ${req.user.id}`, {
      affected_payrolls: linkedPayrolls.length
    });

    res.status(200).json({
      success: true,
      message: `Pay run deleted. ${linkedPayrolls.length} linked payroll${linkedPayrolls.length > 1 ? 's' : ''} removed.`,
      data: { mode: 'deleted', affected: linkedPayrolls.length }
    });
  } catch (error) {
    await transaction.rollback();
    logger.error('Error deleting pay run:', error);
    next(error);
  }
};

module.exports = exports;
