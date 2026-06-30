const cashFlowService = require('../services/cashFlowService');
const cashFlowPdfService = require('../services/cashFlowPdfService');
const { Company } = require('../models');

// GET /api/cashflow
const list = async (req, res, next) => {
  try {
    const data = await cashFlowService.listStatements(req.user.company_id);
    res.json({ success: true, data });
  } catch (error) { next(error); }
};

// GET /api/cashflow/template — default line-item template (for "new from template")
const getTemplate = async (req, res, next) => {
  try {
    res.json({ success: true, data: cashFlowService.DEFAULT_TEMPLATE });
  } catch (error) { next(error); }
};

// GET /api/cashflow/:id
const getOne = async (req, res, next) => {
  try {
    const data = await cashFlowService.getStatement(req.user.company_id, req.params.id);
    if (!data) return res.status(404).json({ success: false, message: 'Cash flow statement not found' });
    res.json({ success: true, data });
  } catch (error) { next(error); }
};

// POST /api/cashflow
const create = async (req, res, next) => {
  try {
    if (!req.body.start_month) {
      return res.status(400).json({ success: false, message: 'start_month is required' });
    }
    const data = await cashFlowService.createStatement(req.user.company_id, req.user.id, req.body);
    res.status(201).json({ success: true, message: 'Cash flow statement created', data });
  } catch (error) { next(error); }
};

// PUT /api/cashflow/:id
const update = async (req, res, next) => {
  try {
    const data = await cashFlowService.updateStatement(req.user.company_id, req.params.id, req.body);
    if (!data) return res.status(404).json({ success: false, message: 'Cash flow statement not found' });
    res.json({ success: true, message: 'Cash flow statement updated', data });
  } catch (error) { next(error); }
};

// DELETE /api/cashflow/:id
const remove = async (req, res, next) => {
  try {
    const ok = await cashFlowService.deleteStatement(req.user.company_id, req.params.id);
    if (!ok) return res.status(404).json({ success: false, message: 'Cash flow statement not found' });
    res.json({ success: true, message: 'Cash flow statement deleted' });
  } catch (error) { next(error); }
};

// PUT /api/cashflow/:id/lines — bulk replace all line items (grid save)
const saveLines = async (req, res, next) => {
  try {
    const lines = Array.isArray(req.body.lines) ? req.body.lines : [];
    const data = await cashFlowService.saveLines(req.user.company_id, req.params.id, lines);
    if (!data) return res.status(404).json({ success: false, message: 'Cash flow statement not found' });
    res.json({ success: true, message: 'Line items saved', data });
  } catch (error) { next(error); }
};

// POST /api/cashflow/:id/actuals — refresh actuals from real cash movements
const pullActuals = async (req, res, next) => {
  try {
    const data = await cashFlowService.pullActuals(req.user.company_id, req.params.id);
    if (!data) return res.status(404).json({ success: false, message: 'Cash flow statement not found' });
    res.json({ success: true, message: 'Actuals refreshed', data });
  } catch (error) { next(error); }
};

// GET /api/cashflow/:id/pdf?view=projected|actual — solvency-test PDF
const downloadPdf = async (req, res, next) => {
  try {
    const statement = await cashFlowService.getStatement(req.user.company_id, req.params.id);
    if (!statement) return res.status(404).json({ success: false, message: 'Cash flow statement not found' });

    const company = await Company.findByPk(req.user.company_id, { attributes: ['name'] });
    const view = req.query.view === 'actual' ? 'actual' : 'projected';
    const ALLOWED_FONTS = ['plus-jakarta-sans', 'geist', 'figtree'];
    const font = ALLOWED_FONTS.includes(req.query.font) ? req.query.font : 'plus-jakarta-sans';

    const model = cashFlowService.buildPrintModel(statement, company ? company.name : '', view);
    const pdfBuffer = await cashFlowPdfService.generatePdf(model, font);

    const safeTitle = (statement.title || 'cash-flow').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeTitle || 'cash-flow'}-${view}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (error) { next(error); }
};

module.exports = {
  list,
  getTemplate,
  getOne,
  create,
  update,
  remove,
  saveLines,
  pullActuals,
  downloadPdf
};
