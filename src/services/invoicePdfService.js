const PDFDocument = require('pdfkit');
const logger = require('../utils/logger');

class InvoicePdfService {

  async generatePdf(invoice, items, payments = []) {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        const buffers = [];

        doc.on('data', (chunk) => buffers.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', reject);

        this._renderHeader(doc, invoice);
        this._renderParties(doc, invoice);
        this._renderLineItems(doc, items);
        this._renderTotals(doc, invoice);
        this._renderPayments(doc, payments);
        this._renderLhdnInfo(doc, invoice);
        this._renderFooter(doc, invoice);

        doc.end();
      } catch (error) {
        logger.error('PDF generation error:', error.message);
        reject(error);
      }
    });
  }

  _renderHeader(doc, invoice) {
    // Title
    doc.fontSize(20).font('Helvetica-Bold').text('INVOICE', { align: 'right' });
    doc.moveDown(0.3);

    // Invoice type label
    const typeLabels = { '01': 'Invoice', '02': 'Credit Note', '03': 'Debit Note', '04': 'Refund Note' };
    const typeLabel = typeLabels[invoice.invoice_type] || 'Invoice';
    if (invoice.is_self_billed) {
      doc.fontSize(10).font('Helvetica').text(`Self-Billed ${typeLabel}`, { align: 'right' });
    }

    doc.moveDown(0.5);

    // Invoice details
    doc.fontSize(10).font('Helvetica-Bold');
    doc.text(`Invoice No: ${invoice.invoice_number}`, 50);
    doc.text(`Date: ${this._formatDate(invoice.invoice_date)}`);
    if (invoice.due_date) {
      doc.text(`Due Date: ${this._formatDate(invoice.due_date)}`);
    }
    if (invoice.payment_terms) {
      doc.text(`Terms: ${invoice.payment_terms}`);
    }

    // Status badge
    doc.text(`Status: ${invoice.status}`, { align: 'right' });

    doc.moveDown(1);
    this._drawLine(doc);
    doc.moveDown(0.5);
  }

  _renderParties(doc, invoice) {
    const startY = doc.y;

    // Supplier (left)
    doc.fontSize(9).font('Helvetica-Bold').text(invoice.is_self_billed ? 'SUPPLIER (Employee):' : 'FROM:', 50, startY);
    doc.font('Helvetica').fontSize(9);
    doc.text(invoice.supplier_name, 50, doc.y + 2);
    if (invoice.supplier_tin) doc.text(`TIN: ${invoice.supplier_tin}`);
    if (invoice.supplier_brn) doc.text(`BRN: ${invoice.supplier_brn}`);
    if (invoice.supplier_address) doc.text(invoice.supplier_address);
    if (invoice.supplier_phone) doc.text(`Tel: ${invoice.supplier_phone}`);
    if (invoice.supplier_email) doc.text(invoice.supplier_email);

    const supplierEndY = doc.y;

    // Buyer (right)
    doc.fontSize(9).font('Helvetica-Bold').text(invoice.is_self_billed ? 'BUYER (Company):' : 'TO:', 320, startY);
    doc.font('Helvetica').fontSize(9);
    doc.text(invoice.buyer_name, 320, doc.y + 2);
    if (invoice.buyer_tin) doc.text(`TIN: ${invoice.buyer_tin}`, 320);
    if (invoice.buyer_brn) doc.text(`BRN: ${invoice.buyer_brn}`, 320);
    if (invoice.buyer_address) doc.text(invoice.buyer_address, 320);
    if (invoice.buyer_phone) doc.text(`Tel: ${invoice.buyer_phone}`, 320);
    if (invoice.buyer_email) doc.text(invoice.buyer_email, 320);

    doc.y = Math.max(supplierEndY, doc.y);
    doc.moveDown(1);
    this._drawLine(doc);
    doc.moveDown(0.5);
  }

  _renderLineItems(doc, items) {
    // Table header
    const cols = { num: 50, desc: 75, qty: 280, price: 330, tax: 395, total: 470 };

    doc.fontSize(8).font('Helvetica-Bold');
    doc.text('#', cols.num, doc.y);
    doc.text('Description', cols.desc, doc.y - doc.currentLineHeight());
    doc.text('Qty', cols.qty, doc.y - doc.currentLineHeight());
    doc.text('Unit Price', cols.price, doc.y - doc.currentLineHeight());
    doc.text('Tax', cols.tax, doc.y - doc.currentLineHeight());
    doc.text('Total', cols.total, doc.y - doc.currentLineHeight());

    doc.moveDown(0.3);
    this._drawLine(doc);
    doc.moveDown(0.3);

    // Table rows
    doc.font('Helvetica').fontSize(8);
    for (const item of items) {
      if (doc.y > 680) {
        doc.addPage();
        doc.y = 50;
      }

      const y = doc.y;
      doc.text(String(item.item_number), cols.num, y);
      doc.text(item.description, cols.desc, y, { width: 195 });
      doc.text(String(parseFloat(item.quantity)), cols.qty, y);
      doc.text(this._formatCurrency(item.unit_price), cols.price, y);
      doc.text(item.tax_type !== 'Exempt' ? `${item.tax_rate}%` : '-', cols.tax, y);
      doc.text(this._formatCurrency(item.total), cols.total, y);
      doc.moveDown(0.5);
    }

    doc.moveDown(0.3);
    this._drawLine(doc);
  }

  _renderTotals(doc, invoice) {
    doc.moveDown(0.5);
    const rightCol = 400;
    const valCol = 470;

    doc.fontSize(9).font('Helvetica');
    doc.text('Subtotal:', rightCol, doc.y);
    doc.text(this._formatCurrency(invoice.subtotal), valCol, doc.y - doc.currentLineHeight(), { align: 'right' });

    if (parseFloat(invoice.total_discount) > 0) {
      doc.text('Discount:', rightCol);
      doc.text(`-${this._formatCurrency(invoice.total_discount)}`, valCol, doc.y - doc.currentLineHeight(), { align: 'right' });
    }

    if (parseFloat(invoice.total_tax) > 0) {
      doc.text('Tax:', rightCol);
      doc.text(this._formatCurrency(invoice.total_tax), valCol, doc.y - doc.currentLineHeight(), { align: 'right' });
    }

    doc.moveDown(0.3);
    doc.font('Helvetica-Bold').fontSize(11);
    doc.text('TOTAL:', rightCol);
    doc.text(`${invoice.currency || 'MYR'} ${this._formatCurrency(invoice.total_amount)}`, valCol, doc.y - doc.currentLineHeight(), { align: 'right' });

    doc.font('Helvetica').fontSize(9);
    if (parseFloat(invoice.amount_paid) > 0) {
      doc.moveDown(0.3);
      doc.text('Amount Paid:', rightCol);
      doc.text(this._formatCurrency(invoice.amount_paid), valCol, doc.y - doc.currentLineHeight(), { align: 'right' });
      doc.text('Balance Due:', rightCol);
      doc.font('Helvetica-Bold');
      doc.text(`${invoice.currency || 'MYR'} ${this._formatCurrency(invoice.balance_due)}`, valCol, doc.y - doc.currentLineHeight(), { align: 'right' });
    }
  }

  _renderPayments(doc, payments) {
    if (!payments || payments.length === 0) return;

    doc.moveDown(1.5);
    doc.fontSize(10).font('Helvetica-Bold').text('Payment History');
    doc.moveDown(0.3);

    doc.fontSize(8).font('Helvetica');
    for (const p of payments) {
      doc.text(`${this._formatDate(p.payment_date)} — ${this._formatCurrency(p.amount)} via ${p.payment_method}${p.reference_number ? ` (Ref: ${p.reference_number})` : ''}`);
    }
  }

  _renderLhdnInfo(doc, invoice) {
    if (!invoice.lhdn_uuid) return;

    doc.moveDown(1.5);
    this._drawLine(doc);
    doc.moveDown(0.5);

    doc.fontSize(9).font('Helvetica-Bold').text('LHDN MyInvois Verification');
    doc.moveDown(0.3);

    doc.font('Helvetica').fontSize(8);
    doc.text(`UUID: ${invoice.lhdn_uuid}`);
    doc.text(`Status: ${invoice.lhdn_status || invoice.status}`);
    if (invoice.lhdn_validated_at) {
      doc.text(`Validated: ${new Date(invoice.lhdn_validated_at).toLocaleString()}`);
    }
    if (invoice.lhdn_qr_url) {
      doc.text(`Verification URL: ${invoice.lhdn_qr_url}`);
    }
  }

  _renderFooter(doc, invoice) {
    if (invoice.notes) {
      doc.moveDown(1);
      doc.fontSize(8).font('Helvetica-Bold').text('Notes:');
      doc.font('Helvetica').text(invoice.notes);
    }

    // Footer at bottom
    doc.fontSize(7).font('Helvetica')
      .text('This is a computer-generated document. No signature is required.', 50, 760, { align: 'center' });
  }

  // ─── Helpers ─────────────────────────────────────────────

  _drawLine(doc) {
    doc.strokeColor('#e5e7eb').lineWidth(0.5)
      .moveTo(50, doc.y)
      .lineTo(545, doc.y)
      .stroke();
  }

  _formatCurrency(value) {
    return parseFloat(value || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  _formatDate(date) {
    if (!date) return '';
    return new Date(date).toLocaleDateString('en-MY', { year: 'numeric', month: 'short', day: 'numeric' });
  }
}

module.exports = new InvoicePdfService();
