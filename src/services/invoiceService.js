const { Op } = require('sequelize');
const { sequelize, Invoice, InvoiceItem, InvoicePayment, Company, Payroll, Claim, Employee, User } = require('../models');
const logger = require('../utils/logger');

class InvoiceService {

  // ─── Invoice Number Generation ──────────────────────────────

  async generateInvoiceNumber(companyId) {
    const result = await sequelize.transaction(async (t) => {
      const company = await Company.findByPk(companyId, {
        attributes: ['id', 'invoice_prefix', 'next_invoice_number'],
        lock: t.LOCK.UPDATE,
        transaction: t
      });

      if (!company) throw new Error('Company not found');

      const prefix = company.invoice_prefix || 'INV';
      const year = new Date().getFullYear();
      const seq = String(company.next_invoice_number || 1).padStart(5, '0');
      const invoiceNumber = `${prefix}-${year}-${seq}`;

      await company.update(
        { next_invoice_number: (company.next_invoice_number || 1) + 1 },
        { transaction: t }
      );

      return invoiceNumber;
    });

    return result;
  }

  // ─── Calculate Line Item Totals ─────────────────────────────

  calculateItemTotals(item) {
    const qty = parseFloat(item.quantity) || 1;
    const unitPrice = parseFloat(item.unit_price) || 0;
    const discountRate = parseFloat(item.discount_rate) || 0;
    const discountAmount = parseFloat(item.discount_amount) || 0;
    const taxRate = parseFloat(item.tax_rate) || 0;

    const lineTotal = qty * unitPrice;
    const discount = discountAmount > 0 ? discountAmount : (lineTotal * discountRate / 100);
    const subtotal = lineTotal - discount;
    const taxAmount = subtotal * taxRate / 100;
    const total = subtotal + taxAmount;

    return {
      ...item,
      quantity: qty,
      unit_price: unitPrice,
      discount_amount: parseFloat(discount.toFixed(2)),
      discount_rate: discountRate,
      tax_rate: taxRate,
      tax_amount: parseFloat(taxAmount.toFixed(2)),
      subtotal: parseFloat(subtotal.toFixed(2)),
      total: parseFloat(total.toFixed(2))
    };
  }

  calculateInvoiceTotals(items) {
    let subtotal = 0;
    let totalDiscount = 0;
    let totalTax = 0;

    for (const item of items) {
      subtotal += parseFloat(item.subtotal) || 0;
      totalDiscount += parseFloat(item.discount_amount) || 0;
      totalTax += parseFloat(item.tax_amount) || 0;
    }

    const totalAmount = subtotal + totalTax;

    return {
      subtotal: parseFloat(subtotal.toFixed(2)),
      total_discount: parseFloat(totalDiscount.toFixed(2)),
      total_tax: parseFloat(totalTax.toFixed(2)),
      total_amount: parseFloat(totalAmount.toFixed(2))
    };
  }

  // ─── Generate from Payroll ──────────────────────────────────

  async generateFromPayroll(payrollId, companyId, userId) {
    const payroll = await Payroll.findOne({
      where: { id: payrollId },
      include: [{
        model: Employee,
        as: 'employee',
        include: [{ model: User, as: 'user', attributes: ['id', 'email', 'first_name', 'last_name'] }]
      }]
    });

    if (!payroll) throw new Error('Payroll record not found');
    if (payroll.status !== 'Paid') throw new Error('Payroll must be in Paid status to generate invoice');

    // Check if invoice already exists for this payroll
    const existing = await Invoice.findOne({
      where: { source_type: 'payroll', source_id: payrollId, company_id: companyId }
    });
    if (existing) throw new Error('Invoice already exists for this payroll record');

    const company = await Company.findByPk(companyId);
    if (!company) throw new Error('Company not found');

    const employee = payroll.employee;
    const user = employee?.user;
    const invoiceNumber = await this.generateInvoiceNumber(companyId);
    const monthName = new Date(payroll.year, payroll.month - 1).toLocaleString('en', { month: 'long' });

    // Build line items from payroll components
    const rawItems = [];
    let itemNum = 1;

    const addItem = (desc, amount) => {
      if (parseFloat(amount) > 0) {
        rawItems.push({
          item_number: itemNum++,
          description: desc,
          quantity: 1,
          unit_price: parseFloat(amount),
          tax_type: 'Exempt',
          tax_rate: 0,
          unit_of_measurement: 'MTH'
        });
      }
    };

    addItem(`Basic Salary - ${monthName} ${payroll.year}`, payroll.basic_salary);
    addItem('Allowances', payroll.allowances);
    addItem('Overtime Payment', payroll.overtime_pay);
    addItem('Performance Bonus', payroll.bonus);
    addItem('Sales Commission', payroll.commission);
    addItem('EPF Employer Contribution', payroll.epf_employer);
    addItem('SOCSO Employer Contribution', payroll.socso_employer);
    addItem('EIS Employer Contribution', payroll.eis_employer);

    const calculatedItems = rawItems.map(item => this.calculateItemTotals(item));
    const totals = this.calculateInvoiceTotals(calculatedItems);

    const invoice = await sequelize.transaction(async (t) => {
      const inv = await Invoice.create({
        company_id: companyId,
        invoice_number: invoiceNumber,
        invoice_date: payroll.payment_date || new Date(),
        invoice_type: '01',
        is_self_billed: true,
        currency: 'MYR',
        supplier_name: user ? `${user.first_name || ''} ${user.last_name || ''}`.trim() : 'Employee',
        supplier_email: user?.email || null,
        buyer_name: company.name,
        buyer_tin: company.tin || null,
        buyer_brn: company.brn || company.registration_no || null,
        buyer_address: company.address || null,
        buyer_phone: company.phone || null,
        buyer_email: null,
        ...totals,
        balance_due: totals.total_amount,
        source_type: 'payroll',
        source_id: payrollId,
        status: 'Draft',
        created_by: userId,
        notes: `Auto-generated from payroll: ${monthName} ${payroll.year}`
      }, { transaction: t });

      await InvoiceItem.bulkCreate(
        calculatedItems.map(item => ({ ...item, invoice_id: inv.id })),
        { transaction: t }
      );

      return inv;
    });

    return Invoice.findByPk(invoice.id, {
      include: [{ model: InvoiceItem, as: 'items' }]
    });
  }

  // ─── Generate from Claim ────────────────────────────────────

  async generateFromClaim(claimId, companyId, userId) {
    const claim = await Claim.findOne({
      where: { id: claimId },
      include: [{
        model: Employee,
        as: 'employee',
        include: [{ model: User, as: 'user', attributes: ['id', 'email', 'first_name', 'last_name'] }]
      }]
    });

    if (!claim) throw new Error('Claim record not found');
    if (claim.status !== 'Paid') throw new Error('Claim must be in Paid status to generate invoice');

    const existing = await Invoice.findOne({
      where: { source_type: 'claim', source_id: claimId, company_id: companyId }
    });
    if (existing) throw new Error('Invoice already exists for this claim record');

    const company = await Company.findByPk(companyId);
    const employee = claim.employee;
    const user = employee?.user;
    const invoiceNumber = await this.generateInvoiceNumber(companyId);

    const rawItem = {
      item_number: 1,
      description: `Claim Reimbursement: ${claim.description}`,
      quantity: 1,
      unit_price: parseFloat(claim.amount),
      tax_type: 'Exempt',
      tax_rate: 0,
      unit_of_measurement: 'EA'
    };

    const calculatedItem = this.calculateItemTotals(rawItem);
    const totals = this.calculateInvoiceTotals([calculatedItem]);

    const invoice = await sequelize.transaction(async (t) => {
      const inv = await Invoice.create({
        company_id: companyId,
        invoice_number: invoiceNumber,
        invoice_date: claim.paid_at || new Date(),
        invoice_type: '01',
        is_self_billed: true,
        currency: 'MYR',
        supplier_name: user ? `${user.first_name || ''} ${user.last_name || ''}`.trim() : 'Employee',
        supplier_email: user?.email || null,
        buyer_name: company.name,
        buyer_tin: company.tin || null,
        buyer_brn: company.brn || company.registration_no || null,
        buyer_address: company.address || null,
        buyer_phone: company.phone || null,
        ...totals,
        balance_due: totals.total_amount,
        source_type: 'claim',
        source_id: claimId,
        status: 'Draft',
        created_by: userId,
        notes: `Auto-generated from claim #${claim.id}`
      }, { transaction: t });

      await InvoiceItem.create(
        { ...calculatedItem, invoice_id: inv.id },
        { transaction: t }
      );

      return inv;
    });

    return Invoice.findByPk(invoice.id, {
      include: [{ model: InvoiceItem, as: 'items' }]
    });
  }

  // ─── Analytics ──────────────────────────────────────────────

  async getAnalytics(companyId) {
    const { fn, col, literal } = require('sequelize');

    // Status counts
    const statusCounts = await Invoice.findAll({
      where: { company_id: companyId },
      attributes: ['status', [fn('COUNT', col('id')), 'count']],
      group: ['status'],
      raw: true
    });

    const statusMap = {};
    for (const row of statusCounts) {
      statusMap[row.status] = parseInt(row.count);
    }

    // Total amounts
    const totals = await Invoice.findOne({
      where: { company_id: companyId },
      attributes: [
        [fn('SUM', col('total_amount')), 'total_invoiced'],
        [fn('SUM', col('amount_paid')), 'total_paid'],
        [fn('SUM', col('balance_due')), 'total_outstanding']
      ],
      raw: true
    });

    // Monthly totals (last 12 months)
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const monthlyTotals = await Invoice.findAll({
      where: {
        company_id: companyId,
        invoice_date: { [Op.gte]: twelveMonthsAgo.toISOString().split('T')[0] }
      },
      attributes: [
        [fn('date_part', literal("'year'"), col('invoice_date')), 'year'],
        [fn('date_part', literal("'month'"), col('invoice_date')), 'month'],
        [fn('COUNT', col('id')), 'count'],
        [fn('SUM', col('total_amount')), 'total']
      ],
      group: [
        fn('date_part', literal("'year'"), col('invoice_date')),
        fn('date_part', literal("'month'"), col('invoice_date'))
      ],
      order: [
        [fn('date_part', literal("'year'"), col('invoice_date')), 'ASC'],
        [fn('date_part', literal("'month'"), col('invoice_date')), 'ASC']
      ],
      raw: true
    });

    // Aging breakdown (based on invoice_date for outstanding invoices)
    const today = new Date();
    const aging = { current: 0, days_31_60: 0, days_61_90: 0, days_over_90: 0 };

    const outstandingInvoices = await Invoice.findAll({
      where: {
        company_id: companyId,
        balance_due: { [Op.gt]: 0 },
        status: { [Op.in]: ['Valid', 'Pending', 'Submitted'] }
      },
      attributes: ['invoice_date', 'balance_due'],
      raw: true
    });

    for (const inv of outstandingInvoices) {
      const daysDiff = Math.floor((today - new Date(inv.invoice_date)) / (1000 * 60 * 60 * 24));
      const balance = parseFloat(inv.balance_due);
      if (daysDiff <= 30) aging.current += balance;
      else if (daysDiff <= 60) aging.days_31_60 += balance;
      else if (daysDiff <= 90) aging.days_61_90 += balance;
      else aging.days_over_90 += balance;
    }

    return {
      statusCounts: statusMap,
      totals: {
        total_invoiced: parseFloat(totals?.total_invoiced || 0),
        total_paid: parseFloat(totals?.total_paid || 0),
        total_outstanding: parseFloat(totals?.total_outstanding || 0)
      },
      monthlyTotals,
      aging: {
        current: parseFloat(aging.current.toFixed(2)),
        days_31_60: parseFloat(aging.days_31_60.toFixed(2)),
        days_61_90: parseFloat(aging.days_61_90.toFixed(2)),
        days_over_90: parseFloat(aging.days_over_90.toFixed(2))
      }
    };
  }
}

module.exports = new InvoiceService();
