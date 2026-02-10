const PDFDocument = require('pdfkit');
const { format } = require('date-fns');
const { formatCurrencyMYR, formatDateMY, roundToTwo } = require('../utils/helpers');

/**
 * Report Generator Service
 * Handles PDF generation for Malaysian statutory reports
 */

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

/**
 * Generate EA Form PDF
 * @param {Object} data - EA form data
 * @returns {Promise<Buffer>} PDF buffer
 */
const generateEAFormPDF = async (data) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const buffers = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      // Header
      doc.fontSize(16).font('Helvetica-Bold')
        .text('BORANG EA', { align: 'center' });
      doc.fontSize(10).font('Helvetica')
        .text('PENYATA SARAAN DARIPADA PENGGAJIAN', { align: 'center' });
      doc.text('STATEMENT OF REMUNERATION FROM EMPLOYMENT', { align: 'center' });
      doc.moveDown(0.5);
      doc.text(`Tahun Taksiran / Year of Assessment: ${data.year}`, { align: 'center' });
      doc.moveDown(1.5);

      // Employer Information
      doc.fontSize(11).font('Helvetica-Bold').text('A. MAKLUMAT MAJIKAN / EMPLOYER INFORMATION');
      doc.moveDown(0.5);
      doc.fontSize(10).font('Helvetica');
      drawLabelValue(doc, 'Nama Majikan / Employer Name:', data.employer.name || 'N/A');
      drawLabelValue(doc, 'No. Pendaftaran / Registration No:', data.employer.registration_no || 'N/A');
      drawLabelValue(doc, 'No. Fail E / E File No:', data.employer.e_file_no || 'N/A');
      doc.moveDown(1);

      // Employee Information
      doc.fontSize(11).font('Helvetica-Bold').text('B. MAKLUMAT PEKERJA / EMPLOYEE INFORMATION');
      doc.moveDown(0.5);
      doc.fontSize(10).font('Helvetica');
      drawLabelValue(doc, 'Nama / Name:', data.employee.full_name);
      drawLabelValue(doc, 'No. K/P / IC No:', data.employee.ic_no || 'N/A');
      drawLabelValue(doc, 'No. Cukai / Tax No:', data.employee.tax_no || 'N/A');
      drawLabelValue(doc, 'Jawatan / Position:', data.employee.position || 'N/A');
      doc.moveDown(1);

      // Remuneration Details
      doc.fontSize(11).font('Helvetica-Bold').text('C. BUTIRAN SARAAN / REMUNERATION DETAILS');
      doc.moveDown(0.5);
      doc.fontSize(10).font('Helvetica');

      const y = doc.y;
      doc.text('', 50, y);

      // Table header
      const col1 = 50, col2 = 350, col3 = 450;
      doc.font('Helvetica-Bold');
      doc.text('Jenis / Type', col1, doc.y);
      doc.text('Amaun / Amount (RM)', col2, doc.y - 12, { width: 150, align: 'right' });
      doc.moveDown(0.5);
      doc.moveTo(col1, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown(0.5);

      doc.font('Helvetica');
      // Income items
      drawTableRow(doc, 'Gaji / Salary', data.income.salary, col1, col2);
      drawTableRow(doc, 'Elaun / Allowances', data.income.allowances, col1, col2);
      drawTableRow(doc, 'Bonus', data.income.bonus, col1, col2);
      drawTableRow(doc, 'Komisyen / Commission', data.income.commission, col1, col2);
      drawTableRow(doc, 'Kerja Lebih Masa / Overtime', data.income.overtime, col1, col2);
      doc.moveDown(0.3);
      doc.moveTo(col1, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown(0.3);
      doc.font('Helvetica-Bold');
      drawTableRow(doc, 'JUMLAH PENDAPATAN KASAR / GROSS INCOME', data.income.gross_total, col1, col2);
      doc.moveDown(1);

      // Deductions
      doc.fontSize(11).font('Helvetica-Bold').text('D. POTONGAN / DEDUCTIONS');
      doc.moveDown(0.5);
      doc.fontSize(10).font('Helvetica');
      drawTableRow(doc, 'KWSP Pekerja / Employee EPF', data.deductions.epf_employee, col1, col2);
      drawTableRow(doc, 'PERKESO Pekerja / Employee SOCSO', data.deductions.socso_employee, col1, col2);
      drawTableRow(doc, 'SIP Pekerja / Employee EIS', data.deductions.eis_employee, col1, col2);
      drawTableRow(doc, 'PCB / MTD', data.deductions.pcb, col1, col2);
      doc.moveDown(0.3);
      doc.moveTo(col1, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown(0.3);
      doc.font('Helvetica-Bold');
      drawTableRow(doc, 'JUMLAH POTONGAN / TOTAL DEDUCTIONS', data.deductions.total, col1, col2);
      doc.moveDown(1);

      // Employer Contributions
      doc.fontSize(11).font('Helvetica-Bold').text('E. CARUMAN MAJIKAN / EMPLOYER CONTRIBUTIONS');
      doc.moveDown(0.5);
      doc.fontSize(10).font('Helvetica');
      drawTableRow(doc, 'KWSP Majikan / Employer EPF', data.employer_contributions.epf, col1, col2);
      drawTableRow(doc, 'PERKESO Majikan / Employer SOCSO', data.employer_contributions.socso, col1, col2);
      drawTableRow(doc, 'SIP Majikan / Employer EIS', data.employer_contributions.eis, col1, col2);
      doc.moveDown(1);

      // Footer
      doc.fontSize(8).font('Helvetica')
        .text(`Dijana pada / Generated on: ${format(new Date(), 'dd/MM/yyyy HH:mm:ss')}`, { align: 'right' });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

/**
 * Generate EPF Borang A PDF
 * @param {Object} data - EPF Borang A data
 * @returns {Promise<Buffer>} PDF buffer
 */
const generateEPFBorangAPDF = async (data) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 40, layout: 'landscape' });
      const buffers = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      // Header
      doc.fontSize(14).font('Helvetica-Bold')
        .text('BORANG A', { align: 'center' });
      doc.fontSize(10).font('Helvetica')
        .text('PENYATA CARUMAN BULANAN KWSP', { align: 'center' });
      doc.text('EPF MONTHLY CONTRIBUTION STATEMENT', { align: 'center' });
      doc.moveDown(0.5);
      doc.text(`Bulan / Month: ${MONTH_NAMES[data.month - 1]} ${data.year}`, { align: 'center' });
      doc.moveDown(1);

      // Employer Info
      doc.fontSize(10).font('Helvetica');
      drawLabelValue(doc, 'Nama Majikan / Employer:', data.employer.name || 'N/A');
      drawLabelValue(doc, 'No. KWSP Majikan / Employer EPF No:', data.employer.epf_no || 'N/A');
      doc.moveDown(1);

      // Table
      const tableTop = doc.y;
      const colWidths = [30, 150, 100, 80, 80, 80, 80, 80];
      const headers = ['No', 'Nama Pekerja / Employee Name', 'No. K/P / IC No', 'No. KWSP / EPF No',
                       'Gaji / Wages (RM)', 'Pekerja / Employee (RM)', 'Majikan / Employer (RM)', 'Jumlah / Total (RM)'];

      let x = 40;
      doc.font('Helvetica-Bold').fontSize(8);
      headers.forEach((header, i) => {
        doc.text(header, x, tableTop, { width: colWidths[i], align: 'center' });
        x += colWidths[i];
      });

      doc.moveTo(40, tableTop + 25).lineTo(760, tableTop + 25).stroke();

      // Table rows
      doc.font('Helvetica').fontSize(8);
      let rowY = tableTop + 30;

      data.employees.forEach((emp, index) => {
        if (rowY > 500) {
          doc.addPage({ layout: 'landscape' });
          rowY = 50;
        }

        x = 40;
        doc.text(String(index + 1), x, rowY, { width: colWidths[0], align: 'center' });
        x += colWidths[0];
        doc.text(emp.full_name, x, rowY, { width: colWidths[1] });
        x += colWidths[1];
        doc.text(emp.ic_no || '-', x, rowY, { width: colWidths[2], align: 'center' });
        x += colWidths[2];
        doc.text(emp.epf_no || '-', x, rowY, { width: colWidths[3], align: 'center' });
        x += colWidths[3];
        doc.text(formatAmount(emp.wages), x, rowY, { width: colWidths[4], align: 'right' });
        x += colWidths[4];
        doc.text(formatAmount(emp.employee_epf), x, rowY, { width: colWidths[5], align: 'right' });
        x += colWidths[5];
        doc.text(formatAmount(emp.employer_epf), x, rowY, { width: colWidths[6], align: 'right' });
        x += colWidths[6];
        doc.text(formatAmount(emp.total_epf), x, rowY, { width: colWidths[7], align: 'right' });

        rowY += 15;
      });

      // Totals
      doc.moveTo(40, rowY).lineTo(760, rowY).stroke();
      rowY += 5;
      doc.font('Helvetica-Bold');
      x = 40;
      doc.text('JUMLAH / TOTAL', x, rowY, { width: colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] });
      x += colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3];
      doc.text(formatAmount(data.totals.wages), x, rowY, { width: colWidths[4], align: 'right' });
      x += colWidths[4];
      doc.text(formatAmount(data.totals.employee_epf), x, rowY, { width: colWidths[5], align: 'right' });
      x += colWidths[5];
      doc.text(formatAmount(data.totals.employer_epf), x, rowY, { width: colWidths[6], align: 'right' });
      x += colWidths[6];
      doc.text(formatAmount(data.totals.total_epf), x, rowY, { width: colWidths[7], align: 'right' });

      // Summary
      doc.moveDown(2);
      doc.fontSize(10);
      doc.text(`Bilangan Pekerja / Number of Employees: ${data.employees.length}`);
      doc.text(`Jumlah Caruman / Total Contribution: RM ${formatAmount(data.totals.total_epf)}`);

      // Footer
      doc.fontSize(8).font('Helvetica')
        .text(`Dijana pada / Generated on: ${format(new Date(), 'dd/MM/yyyy HH:mm:ss')}`, 40, 550, { align: 'right' });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

/**
 * Generate SOCSO Form 8A PDF
 * @param {Object} data - SOCSO Form 8A data
 * @returns {Promise<Buffer>} PDF buffer
 */
const generateSOCSOForm8APDF = async (data) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 40, layout: 'landscape' });
      const buffers = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      // Header
      doc.fontSize(14).font('Helvetica-Bold')
        .text('BORANG 8A', { align: 'center' });
      doc.fontSize(10).font('Helvetica')
        .text('PENYATA CARUMAN BULANAN PERKESO', { align: 'center' });
      doc.text('SOCSO MONTHLY CONTRIBUTION STATEMENT', { align: 'center' });
      doc.moveDown(0.5);
      doc.text(`Bulan / Month: ${MONTH_NAMES[data.month - 1]} ${data.year}`, { align: 'center' });
      doc.moveDown(1);

      // Employer Info
      doc.fontSize(10).font('Helvetica');
      drawLabelValue(doc, 'Nama Majikan / Employer:', data.employer.name || 'N/A');
      drawLabelValue(doc, 'No. Kod Majikan / Employer Code:', data.employer.socso_code || 'N/A');
      doc.moveDown(1);

      // Table
      const tableTop = doc.y;
      const colWidths = [30, 150, 100, 100, 80, 80, 80, 80];
      const headers = ['No', 'Nama Pekerja / Employee Name', 'No. K/P / IC No', 'No. PERKESO / SOCSO No',
                       'Gaji / Wages (RM)', 'Pekerja / Employee (RM)', 'Majikan / Employer (RM)', 'Jumlah / Total (RM)'];

      let x = 40;
      doc.font('Helvetica-Bold').fontSize(8);
      headers.forEach((header, i) => {
        doc.text(header, x, tableTop, { width: colWidths[i], align: 'center' });
        x += colWidths[i];
      });

      doc.moveTo(40, tableTop + 25).lineTo(760, tableTop + 25).stroke();

      // Table rows
      doc.font('Helvetica').fontSize(8);
      let rowY = tableTop + 30;

      data.employees.forEach((emp, index) => {
        if (rowY > 500) {
          doc.addPage({ layout: 'landscape' });
          rowY = 50;
        }

        x = 40;
        doc.text(String(index + 1), x, rowY, { width: colWidths[0], align: 'center' });
        x += colWidths[0];
        doc.text(emp.full_name, x, rowY, { width: colWidths[1] });
        x += colWidths[1];
        doc.text(emp.ic_no || '-', x, rowY, { width: colWidths[2], align: 'center' });
        x += colWidths[2];
        doc.text(emp.socso_no || '-', x, rowY, { width: colWidths[3], align: 'center' });
        x += colWidths[3];
        doc.text(formatAmount(emp.wages), x, rowY, { width: colWidths[4], align: 'right' });
        x += colWidths[4];
        doc.text(formatAmount(emp.employee_socso), x, rowY, { width: colWidths[5], align: 'right' });
        x += colWidths[5];
        doc.text(formatAmount(emp.employer_socso), x, rowY, { width: colWidths[6], align: 'right' });
        x += colWidths[6];
        doc.text(formatAmount(emp.total_socso), x, rowY, { width: colWidths[7], align: 'right' });

        rowY += 15;
      });

      // Totals
      doc.moveTo(40, rowY).lineTo(760, rowY).stroke();
      rowY += 5;
      doc.font('Helvetica-Bold');
      x = 40;
      doc.text('JUMLAH / TOTAL', x, rowY, { width: colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] });
      x += colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3];
      doc.text(formatAmount(data.totals.wages), x, rowY, { width: colWidths[4], align: 'right' });
      x += colWidths[4];
      doc.text(formatAmount(data.totals.employee_socso), x, rowY, { width: colWidths[5], align: 'right' });
      x += colWidths[5];
      doc.text(formatAmount(data.totals.employer_socso), x, rowY, { width: colWidths[6], align: 'right' });
      x += colWidths[6];
      doc.text(formatAmount(data.totals.total_socso), x, rowY, { width: colWidths[7], align: 'right' });

      // Summary
      doc.moveDown(2);
      doc.fontSize(10);
      doc.text(`Bilangan Pekerja / Number of Employees: ${data.employees.length}`);
      doc.text(`Jumlah Caruman / Total Contribution: RM ${formatAmount(data.totals.total_socso)}`);

      // Footer
      doc.fontSize(8).font('Helvetica')
        .text(`Dijana pada / Generated on: ${format(new Date(), 'dd/MM/yyyy HH:mm:ss')}`, 40, 550, { align: 'right' });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

/**
 * Generate PCB CP39 PDF
 * @param {Object} data - PCB CP39 data
 * @returns {Promise<Buffer>} PDF buffer
 */
const generatePCBCP39PDF = async (data) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 40, layout: 'landscape' });
      const buffers = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      // Header
      doc.fontSize(14).font('Helvetica-Bold')
        .text('BORANG CP39', { align: 'center' });
      doc.fontSize(10).font('Helvetica')
        .text('PENYATA POTONGAN CUKAI BULANAN (PCB)', { align: 'center' });
      doc.text('MONTHLY TAX DEDUCTION (MTD) STATEMENT', { align: 'center' });
      doc.moveDown(0.5);
      doc.text(`Bulan / Month: ${MONTH_NAMES[data.month - 1]} ${data.year}`, { align: 'center' });
      doc.moveDown(1);

      // Employer Info
      doc.fontSize(10).font('Helvetica');
      drawLabelValue(doc, 'Nama Majikan / Employer:', data.employer.name || 'N/A');
      drawLabelValue(doc, 'No. Fail E / E File No:', data.employer.e_file_no || 'N/A');
      doc.moveDown(1);

      // Table
      const tableTop = doc.y;
      const colWidths = [30, 180, 100, 100, 100, 100, 90];
      const headers = ['No', 'Nama Pekerja / Employee Name', 'No. K/P / IC No', 'No. Cukai / Tax No',
                       'Gaji Kasar / Gross (RM)', 'KWSP Pekerja / EPF (RM)', 'PCB (RM)'];

      let x = 40;
      doc.font('Helvetica-Bold').fontSize(8);
      headers.forEach((header, i) => {
        doc.text(header, x, tableTop, { width: colWidths[i], align: 'center' });
        x += colWidths[i];
      });

      doc.moveTo(40, tableTop + 25).lineTo(760, tableTop + 25).stroke();

      // Table rows
      doc.font('Helvetica').fontSize(8);
      let rowY = tableTop + 30;

      data.employees.forEach((emp, index) => {
        if (rowY > 500) {
          doc.addPage({ layout: 'landscape' });
          rowY = 50;
        }

        x = 40;
        doc.text(String(index + 1), x, rowY, { width: colWidths[0], align: 'center' });
        x += colWidths[0];
        doc.text(emp.full_name, x, rowY, { width: colWidths[1] });
        x += colWidths[1];
        doc.text(emp.ic_no || '-', x, rowY, { width: colWidths[2], align: 'center' });
        x += colWidths[2];
        doc.text(emp.tax_no || '-', x, rowY, { width: colWidths[3], align: 'center' });
        x += colWidths[3];
        doc.text(formatAmount(emp.gross_salary), x, rowY, { width: colWidths[4], align: 'right' });
        x += colWidths[4];
        doc.text(formatAmount(emp.epf_employee), x, rowY, { width: colWidths[5], align: 'right' });
        x += colWidths[5];
        doc.text(formatAmount(emp.pcb), x, rowY, { width: colWidths[6], align: 'right' });

        rowY += 15;
      });

      // Totals
      doc.moveTo(40, rowY).lineTo(760, rowY).stroke();
      rowY += 5;
      doc.font('Helvetica-Bold');
      x = 40;
      doc.text('JUMLAH / TOTAL', x, rowY, { width: colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] });
      x += colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3];
      doc.text(formatAmount(data.totals.gross_salary), x, rowY, { width: colWidths[4], align: 'right' });
      x += colWidths[4];
      doc.text(formatAmount(data.totals.epf_employee), x, rowY, { width: colWidths[5], align: 'right' });
      x += colWidths[5];
      doc.text(formatAmount(data.totals.pcb), x, rowY, { width: colWidths[6], align: 'right' });

      // Summary
      doc.moveDown(2);
      doc.fontSize(10);
      doc.text(`Bilangan Pekerja / Number of Employees: ${data.employees.length}`);
      doc.text(`Jumlah PCB / Total MTD: RM ${formatAmount(data.totals.pcb)}`);

      // Footer
      doc.fontSize(8).font('Helvetica')
        .text(`Dijana pada / Generated on: ${format(new Date(), 'dd/MM/yyyy HH:mm:ss')}`, 40, 550, { align: 'right' });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

/**
 * Generate CSV for e-filing
 * @param {string} type - Report type (epf, socso, pcb)
 * @param {Object} data - Report data
 * @returns {string} CSV content
 */
const generateCSV = (type, data) => {
  let csv = '';

  switch (type) {
    case 'epf':
      csv = 'No,Employee Name,IC No,EPF No,Wages,Employee Contribution,Employer Contribution,Total\n';
      data.employees.forEach((emp, i) => {
        csv += `${i + 1},"${emp.full_name}","${emp.ic_no || ''}","${emp.epf_no || ''}",${emp.wages},${emp.employee_epf},${emp.employer_epf},${emp.total_epf}\n`;
      });
      csv += `\nTOTAL,,,${data.totals.wages},${data.totals.employee_epf},${data.totals.employer_epf},${data.totals.total_epf}\n`;
      break;

    case 'socso':
      csv = 'No,Employee Name,IC No,SOCSO No,Wages,Employee Contribution,Employer Contribution,Total\n';
      data.employees.forEach((emp, i) => {
        csv += `${i + 1},"${emp.full_name}","${emp.ic_no || ''}","${emp.socso_no || ''}",${emp.wages},${emp.employee_socso},${emp.employer_socso},${emp.total_socso}\n`;
      });
      csv += `\nTOTAL,,,${data.totals.wages},${data.totals.employee_socso},${data.totals.employer_socso},${data.totals.total_socso}\n`;
      break;

    case 'pcb':
      csv = 'No,Employee Name,IC No,Tax No,Gross Salary,EPF Employee,PCB\n';
      data.employees.forEach((emp, i) => {
        csv += `${i + 1},"${emp.full_name}","${emp.ic_no || ''}","${emp.tax_no || ''}",${emp.gross_salary},${emp.epf_employee},${emp.pcb}\n`;
      });
      csv += `\nTOTAL,,,${data.totals.gross_salary},${data.totals.epf_employee},${data.totals.pcb}\n`;
      break;

    case 'ea':
      csv = 'Employee ID,Name,IC No,Tax No,Gross Income,EPF Employee,SOCSO Employee,EIS Employee,PCB,Net Income\n';
      csv += `"${data.employee.employee_id}","${data.employee.full_name}","${data.employee.ic_no || ''}","${data.employee.tax_no || ''}",`;
      csv += `${data.income.gross_total},${data.deductions.epf_employee},${data.deductions.socso_employee},${data.deductions.eis_employee},${data.deductions.pcb},`;
      csv += `${data.income.gross_total - data.deductions.total}\n`;
      break;
  }

  return csv;
};

// Helper functions
function drawLabelValue(doc, label, value) {
  const y = doc.y;
  doc.font('Helvetica-Bold').text(label, 50, y, { continued: true });
  doc.font('Helvetica').text(` ${value}`);
}

function drawTableRow(doc, label, value, col1, col2) {
  const y = doc.y;
  doc.text(label, col1, y);
  doc.text(formatAmount(value), col2, y, { width: 150, align: 'right' });
  doc.moveDown(0.3);
}

function formatAmount(value) {
  if (value === null || value === undefined) return '0.00';
  return parseFloat(value).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Generate Analytics Report PDF
 * @param {string} type - Analytics type (payroll, leave, attendance, claims)
 * @param {Object} data - Analytics data
 * @returns {Promise<Buffer>} PDF buffer
 */
const generateAnalyticsReport = async (type, data) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const buffers = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      switch (type) {
        case 'payroll':
          generatePayrollAnalyticsPDF(doc, data);
          break;
        case 'leave':
          generateLeaveAnalyticsPDF(doc, data);
          break;
        case 'attendance':
          generateAttendanceAnalyticsPDF(doc, data);
          break;
        case 'claims':
          generateClaimsAnalyticsPDF(doc, data);
          break;
        default:
          throw new Error(`Unknown analytics type: ${type}`);
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

function generatePayrollAnalyticsPDF(doc, data) {
  // Header
  doc.fontSize(18).font('Helvetica-Bold')
    .text('Payroll Cost Analytics Report', { align: 'center' });
  doc.fontSize(12).font('Helvetica')
    .text(`Year: ${data.year}`, { align: 'center' });
  doc.text(`Period: ${MONTH_NAMES[data.period.startMonth - 1]} - ${MONTH_NAMES[data.period.endMonth - 1]}`, { align: 'center' });
  doc.moveDown(2);

  // Summary Section
  doc.fontSize(14).font('Helvetica-Bold').text('Summary');
  doc.moveDown(0.5);
  doc.fontSize(10).font('Helvetica');

  const summaryItems = [
    ['Total Gross Salary', `RM ${formatAmount(data.summary.total_gross)}`],
    ['Total Net Salary', `RM ${formatAmount(data.summary.total_net)}`],
    ['Total EPF', `RM ${formatAmount(data.summary.total_epf)}`],
    ['Total SOCSO', `RM ${formatAmount(data.summary.total_socso)}`],
    ['Total EIS', `RM ${formatAmount(data.summary.total_eis)}`],
    ['Total PCB', `RM ${formatAmount(data.summary.total_pcb)}`],
    ['Employee Count', data.summary.employee_count]
  ];

  summaryItems.forEach(([label, value]) => {
    doc.text(`${label}: ${value}`);
  });
  doc.moveDown(1.5);

  // Monthly Breakdown
  doc.fontSize(14).font('Helvetica-Bold').text('Monthly Breakdown');
  doc.moveDown(0.5);
  doc.fontSize(9).font('Helvetica');

  if (data.by_month.length > 0) {
    data.by_month.forEach(m => {
      doc.text(`${MONTH_NAMES[m.month - 1]}: Gross RM ${formatAmount(m.total_gross)}, Net RM ${formatAmount(m.total_net)}, ${m.employee_count} employees`);
    });
  } else {
    doc.text('No data available');
  }
  doc.moveDown(1.5);

  // Department Breakdown
  doc.fontSize(14).font('Helvetica-Bold').text('Department Breakdown');
  doc.moveDown(0.5);
  doc.fontSize(9).font('Helvetica');

  if (data.by_department.length > 0) {
    data.by_department.forEach(d => {
      doc.text(`${d.department}: Gross RM ${formatAmount(d.total_gross)}, ${d.employee_count} employees`);
    });
  } else {
    doc.text('No data available');
  }

  // Footer
  doc.fontSize(8).font('Helvetica');
  doc.text(`Generated on: ${format(new Date(), 'dd/MM/yyyy HH:mm:ss')}`, 50, 750, { align: 'right' });
}

function generateLeaveAnalyticsPDF(doc, data) {
  // Header
  doc.fontSize(18).font('Helvetica-Bold')
    .text('Leave Utilization Analytics Report', { align: 'center' });
  doc.fontSize(12).font('Helvetica')
    .text(`Year: ${data.year}`, { align: 'center' });
  doc.moveDown(2);

  // Summary Section
  doc.fontSize(14).font('Helvetica-Bold').text('Summary');
  doc.moveDown(0.5);
  doc.fontSize(10).font('Helvetica');
  doc.text(`Total Leave Days Taken: ${data.summary.total_days_taken}`);
  doc.text(`Total Leave Requests: ${data.summary.total_requests}`);
  doc.moveDown(1.5);

  // By Type
  doc.fontSize(14).font('Helvetica-Bold').text('Leave by Type');
  doc.moveDown(0.5);
  doc.fontSize(9).font('Helvetica');

  if (data.by_type.length > 0) {
    data.by_type.forEach(t => {
      doc.text(`${t.leave_type}: ${t.total_days} days (${t.request_count} requests)`);
    });
  } else {
    doc.text('No data available');
  }
  doc.moveDown(1.5);

  // Monthly Trend
  doc.fontSize(14).font('Helvetica-Bold').text('Monthly Trend');
  doc.moveDown(0.5);
  doc.fontSize(9).font('Helvetica');

  if (data.by_month.length > 0) {
    data.by_month.forEach(m => {
      doc.text(`${MONTH_NAMES[m.month - 1]}: ${m.total_days} days (${m.request_count} requests)`);
    });
  } else {
    doc.text('No data available');
  }
  doc.moveDown(1.5);

  // By Department
  doc.fontSize(14).font('Helvetica-Bold').text('Leave by Department');
  doc.moveDown(0.5);
  doc.fontSize(9).font('Helvetica');

  if (data.by_department.length > 0) {
    data.by_department.forEach(d => {
      doc.text(`${d.department}: ${d.total_days} days (${d.request_count} requests)`);
    });
  } else {
    doc.text('No data available');
  }

  // Footer
  doc.fontSize(8).font('Helvetica');
  doc.text(`Generated on: ${format(new Date(), 'dd/MM/yyyy HH:mm:ss')}`, 50, 750, { align: 'right' });
}

function generateAttendanceAnalyticsPDF(doc, data) {
  // Header
  doc.fontSize(18).font('Helvetica-Bold')
    .text('Attendance Punctuality Analytics Report', { align: 'center' });
  doc.fontSize(12).font('Helvetica')
    .text(`Year: ${data.year}${data.month ? `, Month: ${MONTH_NAMES[data.month - 1]}` : ''}`, { align: 'center' });
  doc.moveDown(2);

  // Summary Section
  doc.fontSize(14).font('Helvetica-Bold').text('Summary');
  doc.moveDown(0.5);
  doc.fontSize(10).font('Helvetica');

  const summaryItems = [
    ['Total Records', data.summary.total_records],
    ['Late Count', data.summary.late_count],
    ['Early Leave Count', data.summary.early_leave_count],
    ['Punctuality Rate', `${data.summary.punctuality_rate}%`],
    ['Average Late Minutes', data.summary.avg_late_minutes],
    ['Average Working Hours', data.summary.avg_working_hours]
  ];

  summaryItems.forEach(([label, value]) => {
    doc.text(`${label}: ${value}`);
  });
  doc.moveDown(1.5);

  // By Department
  doc.fontSize(14).font('Helvetica-Bold').text('Attendance by Department');
  doc.moveDown(0.5);
  doc.fontSize(9).font('Helvetica');

  if (data.by_department.length > 0) {
    data.by_department.forEach(d => {
      doc.text(`${d.department}: ${d.punctuality_rate}% punctuality, ${d.late_count} late, Avg ${d.avg_working_hours} hrs`);
    });
  } else {
    doc.text('No data available');
  }
  doc.moveDown(1.5);

  // Work Type Distribution
  doc.fontSize(14).font('Helvetica-Bold').text('Work Type Distribution');
  doc.moveDown(0.5);
  doc.fontSize(9).font('Helvetica');

  if (data.by_work_type.length > 0) {
    data.by_work_type.forEach(w => {
      doc.text(`${w.type}: ${w.count} records`);
    });
  } else {
    doc.text('No data available');
  }

  // Footer
  doc.fontSize(8).font('Helvetica');
  doc.text(`Generated on: ${format(new Date(), 'dd/MM/yyyy HH:mm:ss')}`, 50, 750, { align: 'right' });
}

function generateClaimsAnalyticsPDF(doc, data) {
  // Header
  doc.fontSize(18).font('Helvetica-Bold')
    .text('Claims Spending Analytics Report', { align: 'center' });
  doc.fontSize(12).font('Helvetica')
    .text(`Year: ${data.year}`, { align: 'center' });
  doc.moveDown(2);

  // Summary Section
  doc.fontSize(14).font('Helvetica-Bold').text('Summary');
  doc.moveDown(0.5);
  doc.fontSize(10).font('Helvetica');
  doc.text(`Total Claim Amount: RM ${formatAmount(data.summary.total_amount)}`);
  doc.text(`Total Claims: ${data.summary.total_claims}`);
  doc.text(`Average Claim Amount: RM ${formatAmount(data.summary.avg_claim_amount)}`);
  doc.moveDown(1.5);

  // By Type
  doc.fontSize(14).font('Helvetica-Bold').text('Claims by Type');
  doc.moveDown(0.5);
  doc.fontSize(9).font('Helvetica');

  if (data.by_type.length > 0) {
    data.by_type.forEach(t => {
      doc.text(`${t.claim_type}: RM ${formatAmount(t.total_amount)} (${t.claim_count} claims, Avg RM ${t.avg_amount})`);
    });
  } else {
    doc.text('No data available');
  }
  doc.moveDown(1.5);

  // Monthly Trend
  doc.fontSize(14).font('Helvetica-Bold').text('Monthly Spending');
  doc.moveDown(0.5);
  doc.fontSize(9).font('Helvetica');

  if (data.by_month.length > 0) {
    data.by_month.forEach(m => {
      doc.text(`${MONTH_NAMES[m.month - 1]}: RM ${formatAmount(m.total_amount)} (${m.claim_count} claims)`);
    });
  } else {
    doc.text('No data available');
  }
  doc.moveDown(1.5);

  // By Department
  doc.fontSize(14).font('Helvetica-Bold').text('Claims by Department');
  doc.moveDown(0.5);
  doc.fontSize(9).font('Helvetica');

  if (data.by_department.length > 0) {
    data.by_department.forEach(d => {
      doc.text(`${d.department}: RM ${formatAmount(d.total_amount)} (${d.claim_count} claims)`);
    });
  } else {
    doc.text('No data available');
  }

  // Footer
  doc.fontSize(8).font('Helvetica');
  doc.text(`Generated on: ${format(new Date(), 'dd/MM/yyyy HH:mm:ss')}`, 50, 750, { align: 'right' });
}

module.exports = {
  generateEAFormPDF,
  generateEPFBorangAPDF,
  generateSOCSOForm8APDF,
  generatePCBCP39PDF,
  generateCSV,
  generateAnalyticsReport
};
