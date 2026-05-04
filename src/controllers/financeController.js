const financeService = require('../services/financeService');
const { Project } = require('../models');

// GET /api/finance/pnl
const getPnl = async (req, res, next) => {
  try {
    const { project_id, from, to, include_payroll } = req.query;
    const data = await financeService.getPnl(req.user.company_id, {
      project_id: project_id || null,
      from: from || null,
      to: to || null,
      include_payroll: include_payroll !== 'false'
    });
    res.json({ success: true, data });
  } catch (error) { next(error); }
};

// GET /api/finance/sales
const getSales = async (req, res, next) => {
  try {
    const year = parseInt(req.query.year, 10) || new Date().getFullYear();
    let projectInternalId = null;
    if (req.query.project_id) {
      const project = await Project.findOne({
        where: { public_id: req.query.project_id, company_id: req.user.company_id }
      });
      if (project) projectInternalId = project.id;
    }
    const by_month = await financeService.getSalesByMonth(req.user.company_id, year, projectInternalId);
    res.json({ success: true, data: { year, by_month } });
  } catch (error) { next(error); }
};

// GET /api/finance/expenses
const getExpenses = async (req, res, next) => {
  try {
    const { from, to, project_id } = req.query;
    let projectInternalId = null;
    if (project_id) {
      const project = await Project.findOne({
        where: { public_id: project_id, company_id: req.user.company_id }
      });
      if (project) projectInternalId = project.id;
    }
    const by_category = await financeService.getExpensesByCategory(
      req.user.company_id, from || null, to || null, projectInternalId
    );
    res.json({ success: true, data: { by_category } });
  } catch (error) { next(error); }
};

// GET /api/finance/projects-pnl
const getProjectsPnl = async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const data = await financeService.getPnlByProject(req.user.company_id, from || null, to || null);
    res.json({ success: true, data });
  } catch (error) { next(error); }
};

module.exports = {
  getPnl,
  getSales,
  getExpenses,
  getProjectsPnl
};
