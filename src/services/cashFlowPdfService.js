const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const logger = require('../utils/logger');

// UI fonts matching the web app's font-family presets (ThemeService.FontFamilyPreset).
// Bundled TTFs so the PDF renders identically server-side; falls back to Helvetica
// if a file is missing. The user's chosen preset is passed through from the client.
const FONT_DIR = path.join(__dirname, '..', 'assets', 'fonts');
const FONT_PRESETS = {
  'plus-jakarta-sans': {
    regular: path.join(FONT_DIR, 'PlusJakartaSans-Regular.ttf'),
    bold: path.join(FONT_DIR, 'PlusJakartaSans-Bold.ttf')
  },
  'geist': {
    regular: path.join(FONT_DIR, 'Geist-Regular.ttf'),
    bold: path.join(FONT_DIR, 'Geist-Bold.ttf')
  },
  'figtree': {
    regular: path.join(FONT_DIR, 'Figtree-Regular.ttf'),
    bold: path.join(FONT_DIR, 'Figtree-Bold.ttf')
  }
};
const DEFAULT_FONT_PRESET = 'plus-jakarta-sans';

/**
 * Renders a cash-flow / solvency-test statement as a landscape A4 PDF,
 * mirroring the AVERROES solvency-test layout: a month-by-month grid with
 * Cash Inflows / Cash Outflows sections, SUM rows, Net, and rolling
 * Opening / Closing cash balances, plus a TOTAL column.
 *
 * Input is the object returned by cashFlowService.buildPrintModel().
 */
class CashFlowPdfService {
  // palette
  COLORS = {
    text: '#111827',
    muted: '#6b7280',
    line: '#d1d5db',
    inflowHead: '#ecfdf5',
    inflowSum: '#d1fae5',
    outflowHead: '#fef2f2',
    outflowSum: '#fee2e2',
    sectionText: '#065f46',
    sectionTextOut: '#991b1b',
    totalFill: '#f3f4f6',
    netFill: '#eef2ff',
    closeFill: '#e5e7eb',
    neg: '#b91c1c'
  };

  // Register the requested UI font preset on the doc; returns { regular, bold }
  // font keys, falling back to Plus Jakarta Sans then PDFKit's Helvetica.
  _registerFonts(doc, preset) {
    const candidates = [preset, DEFAULT_FONT_PRESET];
    for (const key of candidates) {
      const files = FONT_PRESETS[key];
      if (!files) continue;
      try {
        if (fs.existsSync(files.regular) && fs.existsSync(files.bold)) {
          doc.registerFont('UIFont', files.regular);
          doc.registerFont('UIFont-Bold', files.bold);
          return { regular: 'UIFont', bold: 'UIFont-Bold' };
        }
      } catch (e) {
        logger.warn(`Cash flow PDF: font "${key}" registration failed —`, e.message);
      }
    }
    return { regular: 'Helvetica', bold: 'Helvetica-Bold' };
  }

  async generatePdf(model, fontPreset = DEFAULT_FONT_PRESET) {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 28 });
        const buffers = [];
        doc.on('data', (c) => buffers.push(c));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', reject);

        this.fonts = this._registerFonts(doc, fontPreset);
        this._render(doc, model);
        doc.end();
      } catch (error) {
        logger.error('Cash flow PDF generation error:', error.message);
        reject(error);
      }
    });
  }

  _money(v) {
    const n = Number(v) || 0;
    if (Math.abs(n) < 0.005) return '-';
    const s = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return n < 0 ? `(${s})` : s;
  }

  _render(doc, model) {
    const pageW = doc.page.width;
    const margin = doc.page.margins.left;
    const left = margin;
    const right = pageW - margin;
    const usableW = right - left;

    const n = model.months.length;
    const labelW = Math.min(150, Math.max(110, usableW * 0.16));
    const totalW = 66;
    const monthsW = usableW - labelW - totalW;
    const colW = monthsW / n;

    // Scale font to the column width so figures don't collide.
    const fontSize = colW >= 46 ? 7 : colW >= 38 ? 6.5 : colW >= 31 ? 6 : colW >= 26 ? 5.5 : 5;
    const rowH = Math.max(13, fontSize + 7);

    // ── title block ──
    doc.fillColor(this.COLORS.text).font(this.fonts.bold).fontSize(12)
      .text(model.meta.companyName, left, margin, { width: usableW, align: 'left' });
    doc.font(this.fonts.bold).fontSize(8.5).fillColor(this.COLORS.text)
      .text(model.meta.subtitle, left, doc.y + 1, { width: usableW, align: 'left' });
    doc.font(this.fonts.regular).fontSize(7.5).fillColor(this.COLORS.muted)
      .text(
        `${model.meta.title}  ·  ${model.meta.view} figures  ·  Values in ${model.meta.currency}  ·  Status: ${model.meta.status}`,
        left, doc.y + 1, { width: usableW, align: 'left' }
      );

    let y = doc.y + 6;

    // column x positions
    const colX = (i) => left + labelW + i * colW;
    const totalX = left + labelW + monthsW;

    // ── drawing helpers ──
    const drawHeader = (yPos) => {
      doc.save();
      doc.rect(left, yPos, usableW, rowH).fill(this.COLORS.totalFill);
      doc.restore();
      doc.fillColor(this.COLORS.text).font(this.fonts.bold).fontSize(fontSize);
      doc.text('CASH FLOW', left + 3, yPos + (rowH - fontSize) / 2 - 0.5, { width: labelW - 6 });
      for (let i = 0; i < n; i++) {
        doc.text(model.months[i], colX(i), yPos + (rowH - fontSize) / 2 - 0.5, { width: colW - 3, align: 'right' });
      }
      doc.text('TOTAL', totalX, yPos + (rowH - fontSize) / 2 - 0.5, { width: totalW - 4, align: 'right' });
      // verticals + bottom border
      doc.strokeColor(this.COLORS.line).lineWidth(0.4);
      doc.moveTo(left, yPos + rowH).lineTo(right, yPos + rowH).stroke();
      return yPos + rowH;
    };

    const ensureSpace = () => {
      if (y + rowH > doc.page.height - margin) {
        doc.addPage();
        y = margin;
        y = drawHeader(y);
      }
    };

    // Generic data row. opts: { fill, bold, indent, labelColor, showTotal, total }
    const drawRow = (label, values, total, opts = {}) => {
      ensureSpace();
      const { fill, bold = false, indent = 0, labelColor, showTotal = true } = opts;
      if (fill) { doc.save(); doc.rect(left, y, usableW, rowH).fill(fill); doc.restore(); }

      const ty = y + (rowH - fontSize) / 2 - 0.5;
      doc.font(bold ? this.fonts.bold : this.fonts.regular).fontSize(fontSize);
      doc.fillColor(labelColor || this.COLORS.text);
      doc.text(label, left + 3 + indent, ty, { width: labelW - 6 - indent, ellipsis: true });

      doc.fillColor(this.COLORS.text);
      if (values) {
        for (let i = 0; i < n; i++) {
          const v = values[i];
          doc.fillColor(Number(v) < 0 ? this.COLORS.neg : (labelColor || this.COLORS.text));
          doc.text(this._money(v), colX(i), ty, { width: colW - 3, align: 'right' });
        }
      }
      if (showTotal && total !== undefined && total !== null) {
        doc.fillColor(Number(total) < 0 ? this.COLORS.neg : this.COLORS.text);
        doc.font(this.fonts.bold);
        doc.text(this._money(total), totalX, ty, { width: totalW - 4, align: 'right' });
      }

      doc.strokeColor(this.COLORS.line).lineWidth(0.25);
      doc.moveTo(left, y + rowH).lineTo(right, y + rowH).stroke();
      y += rowH;
    };

    const drawSectionLabel = (text, fill, color) => {
      ensureSpace();
      doc.save(); doc.rect(left, y, usableW, rowH).fill(fill); doc.restore();
      doc.font(this.fonts.bold).fontSize(fontSize).fillColor(color)
        .text(text, left + 3, y + (rowH - fontSize) / 2 - 0.5, { width: usableW - 6 });
      y += rowH;
    };

    // ── render ──
    y = drawHeader(y);

    // Inflows
    drawSectionLabel('Cash Inflows', this.COLORS.inflowHead, this.COLORS.sectionText);
    for (const l of model.inflow.lines) drawRow(l.label, l.values, l.total, { indent: 6 });
    drawRow('SUM (Inflows)', model.inflow.sumValues, model.inflow.sumTotal, { fill: this.COLORS.inflowSum, bold: true, labelColor: this.COLORS.sectionText });

    // Outflows
    drawSectionLabel('Cash Outflows', this.COLORS.outflowHead, this.COLORS.sectionTextOut);
    for (const l of model.outflow.lines) drawRow(l.label, l.values, l.total, { indent: 6 });
    drawRow('SUM (Outflows)', model.outflow.sumValues, model.outflow.sumTotal, { fill: this.COLORS.outflowSum, bold: true, labelColor: this.COLORS.sectionTextOut });

    // Net / Opening / Closing
    drawRow('Net Cash inflow/(outflow)', model.net.values, model.net.total, { fill: this.COLORS.netFill, bold: true });
    drawRow('Opening cash balance', model.opening.values, null, { labelColor: this.COLORS.muted, showTotal: false });
    drawRow('Closing cash balance', model.closing.values, model.closing.final, { fill: this.COLORS.closeFill, bold: true });

    // footer note
    doc.font(this.fonts.regular).fontSize(6.5).fillColor(this.COLORS.muted)
      .text('Figures in parentheses are negative. Closing balance = opening + net cash flow, carried forward each month.', left, y + 6, { width: usableW });
  }
}

module.exports = new CashFlowPdfService();
