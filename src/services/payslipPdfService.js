const PDFDocument = require('pdfkit');
const { format } = require('date-fns');

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

/**
 * Generate Payslip PDF matching the professional template layout
 * @param {Object} data - Payslip data (same structure as generatePayslip() returns)
 * @param {String} companyName - Company name
 * @param {String} registrationNo - Company registration number
 * @returns {Promise<Buffer>} PDF buffer
 */
const generatePayslipPDF = async (data, companyName = 'Company', registrationNo = '') => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 45 });
      const buffers = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const L = 45;       // left margin
      const R = 550;      // right edge
      const W = R - L;    // usable width

      // ── HEADER ──
      doc.fontSize(14).font('Helvetica-Bold').text('PAYSLIP', L, 45);
      doc.fontSize(10).font('Helvetica').text(companyName, L, 61);
      if (registrationNo) {
        doc.fontSize(9).fillColor('#555').text(`Registration No. ${registrationNo}`, L, 74);
      }

      const periodMonth = MONTH_NAMES[data.pay_period.month - 1];
      doc.fontSize(10).fillColor('#000').font('Helvetica')
        .text('Payslip for ', 0, 45, { width: R, align: 'right', continued: true })
        .font('Helvetica-Bold').text(`${periodMonth} ${data.pay_period.year}`);

      const issuedText = data.issued_by
        ? `Issued on ${format(new Date(data.generated_at || new Date()), 'd MMMM yyyy')} by ${data.issued_by}`
        : `Issued on ${format(new Date(data.generated_at || new Date()), 'd MMMM yyyy')}`;
      doc.fontSize(9).font('Helvetica').fillColor('#555')
        .text(issuedText, 0, 59, { width: R, align: 'right' });

      doc.fillColor('#000');

      // Red divider
      const divY = registrationNo ? 90 : 82;
      doc.moveTo(L, divY).lineTo(R, divY).lineWidth(1.5).strokeColor('#c0392b').stroke();
      doc.strokeColor('#000').lineWidth(0.5);

      // ── EMPLOYEE INFO ──
      let y = divY + 14;
      const col1Label = L;
      const col1Colon = L + 100;
      const col1Val = L + 112;
      const col2Label = 310;
      const col2Colon = 410;
      const col2Val = 422;

      const infoRows = [
        ['Employee Name', data.employee.full_name, 'Employee ID', data.employee.employee_id],
        ['I/C No', data.employee.ic_no || 'N/A', 'Designation', data.employee.position || 'N/A'],
        ['Bank Name', data.bank_details?.bank_name || 'N/A', 'Department', data.employee.department || 'N/A'],
        ['Account No', data.bank_details?.account_no || 'N/A', '', '']
      ];

      doc.fontSize(9);
      infoRows.forEach(([lbl1, val1, lbl2, val2]) => {
        doc.font('Helvetica').text(lbl1, col1Label, y);
        doc.text(':', col1Colon, y);
        doc.font('Helvetica-Bold').text(val1 || 'N/A', col1Val, y);
        if (lbl2) {
          doc.font('Helvetica').text(lbl2, col2Label, y);
          doc.text(':', col2Colon, y);
          doc.font('Helvetica-Bold').text(val2 || 'N/A', col2Val, y);
        }
        y += 16;
      });

      // Dashed divider
      y += 4;
      doc.save();
      doc.lineWidth(0.8).dash(4, { space: 3 }).moveTo(L, y).lineTo(R, y).strokeColor('#bbb').stroke();
      doc.restore();
      doc.strokeColor('#000');
      y += 12;

      // ── EARNINGS / DEDUCTIONS / CONTRIBUTIONS TABLE ──
      const colW = W / 6;
      const c = [L, L + colW, L + colW * 2, L + colW * 2 + colW, L + colW * 4, L + colW * 4 + colW];

      // Header row
      doc.rect(L, y, W, 18).fillAndStroke('#f5f5f5', '#d0d0d0');
      doc.fillColor('#000').fontSize(9).font('Helvetica-Bold');
      doc.text('Earnings', c[0] + 6, y + 4);
      doc.text('Deductions', c[2] + 6, y + 4);
      doc.text('Employer Contributions', c[4] + 6, y + 4);
      y += 18;

      // Table body
      const earnings = [
        ['Basic Salary', data.earnings.basic_salary],
        ['Allowances', data.earnings.allowances],
        ['Overtime Pay', data.earnings.overtime_pay],
        ['Bonus', data.earnings.bonus],
        ['Commission', data.earnings.commission]
      ];
      const deductions = [
        ['EPF', data.deductions.epf_employee],
        ['SOCSO', data.deductions.socso_employee],
        ['EIS', data.deductions.eis_employee],
        ['PCB', data.deductions.pcb_deduction],
        ['Unpaid Leave', data.deductions.unpaid_leave_deduction],
        ['Other', data.deductions.other_deductions]
      ];
      const contributions = [
        ['EPF', data.employer_contributions.epf_employer],
        ['SOCSO', data.employer_contributions.socso_employer],
        ['EIS', data.employer_contributions.eis_employer]
      ];

      const maxRows = Math.max(earnings.length, deductions.length, contributions.length) + 2;
      const rowH = 15;

      doc.font('Helvetica').fontSize(9);
      for (let i = 0; i < maxRows; i++) {
        const ry = y + i * rowH;
        // vertical borders
        doc.moveTo(c[0], ry).lineTo(c[0], ry + rowH).stroke();
        doc.moveTo(c[2], ry).lineTo(c[2], ry + rowH).stroke();
        doc.moveTo(c[4], ry).lineTo(c[4], ry + rowH).stroke();
        doc.moveTo(R, ry).lineTo(R, ry + rowH).stroke();

        // Earnings
        if (i < earnings.length && earnings[i][1] > 0) {
          doc.text(earnings[i][0], c[0] + 6, ry + 3);
          doc.text(formatAmount(earnings[i][1]), c[1] - 6, ry + 3, { width: colW - 6, align: 'right' });
        }
        // Deductions
        if (i < deductions.length && deductions[i][1] > 0) {
          doc.text(deductions[i][0], c[2] + 6, ry + 3);
          doc.text(formatAmount(deductions[i][1]), c[3] - 6, ry + 3, { width: colW - 6, align: 'right' });
        }
        // Contributions
        if (i < contributions.length && contributions[i][1] > 0) {
          doc.text(contributions[i][0], c[4] + 6, ry + 3);
          doc.text(formatAmount(contributions[i][1]), c[5] - 6, ry + 3, { width: colW - 6, align: 'right' });
        }
      }
      y += maxRows * rowH;

      // Totals row
      doc.rect(L, y, W, 20).fillAndStroke('#f5f5f5', '#d0d0d0');
      doc.fillColor('#000').font('Helvetica-Bold').fontSize(8.5);
      doc.text('Gross Earnings (RM)', c[0] + 6, y + 5);
      doc.text(formatAmount(data.earnings.gross_salary), c[1] - 6, y + 5, { width: colW - 6, align: 'right' });
      doc.text('Total Deductions (RM)', c[2] + 6, y + 5);
      doc.text(formatAmount(data.deductions.total_deductions), c[3] - 6, y + 5, { width: colW - 6, align: 'right' });
      const totalContrib = (parseFloat(data.employer_contributions.epf_employer) || 0)
        + (parseFloat(data.employer_contributions.socso_employer) || 0)
        + (parseFloat(data.employer_contributions.eis_employer) || 0);
      doc.text('Total Contributions (RM)', c[4] + 6, y + 5);
      doc.text(formatAmount(totalContrib), c[5] - 6, y + 5, { width: colW - 6, align: 'right' });
      y += 20;

      // ── NET PAYABLE ──
      y += 10;
      doc.lineWidth(1.2);
      doc.rect(L, y, W, 32).stroke();
      doc.moveTo(L + W / 2, y).lineTo(L + W / 2, y + 32).stroke();
      doc.lineWidth(0.5);

      doc.font('Helvetica-Bold').fontSize(11).text('Total Net Payable (RM)', L + 8, y + 6);
      doc.font('Helvetica').fontSize(8.5).fillColor('#666').text('Gross Earning - Total Deduction', L + 8, y + 19);
      doc.fillColor('#000').font('Helvetica-Bold').fontSize(14)
        .text(`RM${formatAmount(data.net_salary)}`, L + W / 2, y + 8, { width: W / 2, align: 'center' });
      y += 32;

      // ── AMOUNT IN WORDS ──
      y += 12;
      doc.font('Helvetica-Oblique').fontSize(9).fillColor('#444')
        .text(`Amount in Words: ${numberToWords(parseFloat(data.net_salary))}`, L, y, { width: W, align: 'center' });
      doc.fillColor('#000');
      y += 18;

      // ── YTD SECTION ──
      if (data.ytd) {
        doc.font('Helvetica').fontSize(9);
        const ytdL1 = L;
        const ytdRm1 = L + 175;
        const ytdV1 = ytdRm1 + 30;
        const ytdL2 = 310;
        const ytdRm2 = 310 + 145;
        const ytdV2 = ytdRm2 + 30;

        const ytdRows = [
          ['YTD Employee EPF', data.ytd.epf_employee, 'YTD Employer EPF', data.ytd.epf_employer],
          ['YTD Employee SOCSO', data.ytd.socso_employee, 'YTD Employer SOCSO', data.ytd.socso_employer],
          ['YTD Employee EIS', data.ytd.eis_employee, 'YTD Employer EIS', data.ytd.eis_employer],
          ['YTD Employee Income Tax PCB', data.ytd.pcb, '', null]
        ];

        ytdRows.forEach(([lbl1, val1, lbl2, val2]) => {
          doc.text(lbl1, ytdL1, y);
          doc.text(':RM', ytdRm1, y, { width: 28, align: 'right' });
          doc.text(formatAmount(val1), ytdV1, y, { width: 70, align: 'right' });
          if (lbl2 && val2 !== null) {
            doc.text(lbl2, ytdL2, y);
            doc.text(':RM', ytdRm2, y, { width: 28, align: 'right' });
            doc.text(formatAmount(val2), ytdV2, y, { width: 70, align: 'right' });
          }
          y += 14;
        });
      }

      // ── CONFIDENTIAL ──
      y += 20;
      doc.font('Helvetica-Oblique').fontSize(8.5).fillColor('#c0392b')
        .text('This payslip is confidential and intended only for the recipient. Unauthorized disclosure is prohibited.', L, y, { width: W, align: 'center' });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

function formatAmount(value) {
  if (value === null || value === undefined) return '0.00';
  return parseFloat(value).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function numberToWords(amount) {
  if (!amount || isNaN(amount)) return 'Ringgit Malaysia Zero';

  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const convertGroup = (n) => {
    if (n === 0) return '';
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? '-' + ones[n % 10] : '');
    return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + convertGroup(n % 100) : '');
  };

  const ringgit = Math.floor(amount);
  const sen = Math.round((amount - ringgit) * 100);

  let result = 'Ringgit Malaysia ';

  if (ringgit === 0) {
    result += 'Zero';
  } else {
    const millions = Math.floor(ringgit / 1000000);
    const thousands = Math.floor((ringgit % 1000000) / 1000);
    const remainder = ringgit % 1000;

    if (millions) result += convertGroup(millions) + ' Million ';
    if (thousands) result += convertGroup(thousands) + ' Thousand ';
    if (remainder) result += convertGroup(remainder);
  }

  result = result.trim();

  if (sen > 0) {
    result += ' and ' + convertGroup(sen) + ' Sen';
  }

  return result;
}

module.exports = { generatePayslipPDF };
