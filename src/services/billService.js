const { Bill } = require('../models');

const calculateItemTotals = (item) => {
  const qty = parseFloat(item.quantity || 1);
  const price = parseFloat(item.unit_price || 0);
  const taxRate = parseFloat(item.tax_rate || 0);

  const lineSubtotal = parseFloat((qty * price).toFixed(2));
  const taxAmount = parseFloat((lineSubtotal * (taxRate / 100)).toFixed(2));
  const lineTotal = parseFloat((lineSubtotal + taxAmount).toFixed(2));

  return {
    item_number: item.item_number,
    description: item.description,
    quantity: qty,
    unit_price: price,
    tax_rate: taxRate,
    tax_amount: taxAmount,
    line_subtotal: lineSubtotal,
    line_total: lineTotal
  };
};

const calculateBillTotals = (items) => {
  const subtotal = items.reduce((s, i) => s + parseFloat(i.line_subtotal || 0), 0);
  const total_tax = items.reduce((s, i) => s + parseFloat(i.tax_amount || 0), 0);
  const total_amount = items.reduce((s, i) => s + parseFloat(i.line_total || 0), 0);
  return {
    subtotal: parseFloat(subtotal.toFixed(2)),
    total_tax: parseFloat(total_tax.toFixed(2)),
    total_amount: parseFloat(total_amount.toFixed(2))
  };
};

const generateBillNumber = async (companyId, billType = 'Bill') => {
  const year = new Date().getFullYear();
  const prefix = billType === 'PO' ? `PO-${year}-` : `BILL-${year}-`;

  const last = await Bill.findOne({
    where: { company_id: companyId },
    order: [['created_at', 'DESC']]
  });

  let next = 1;
  if (last && last.bill_number && last.bill_number.startsWith(prefix)) {
    const seq = parseInt(last.bill_number.split('-').pop(), 10);
    if (!isNaN(seq)) next = seq + 1;
  }
  return `${prefix}${String(next).padStart(4, '0')}`;
};

module.exports = {
  calculateItemTotals,
  calculateBillTotals,
  generateBillNumber
};
