/**
 * EA Form Excel Service
 * Generates EA Form (C.P.8A - Pin. 2023) by filling the official LHDN template.
 */
const ExcelJS = require('exceljs');
const path = require('path');
const { format } = require('date-fns');

const TEMPLATE_PATH = path.join(__dirname, '..', '..', 'docs', 'template', 'ea_pin2023.xlsx');

/**
 * Generate an EA Form Excel file from the LHDN template.
 *
 * @param {Object} data
 * @param {Object} data.company   - Company record (with statutory fields)
 * @param {Object} data.employee  - Employee record
 * @param {number} data.year      - Tax year
 * @param {Object} data.income    - Aggregated income totals
 * @param {Object} data.deductions - Aggregated deduction totals
 * @param {Object} data.employer_contributions - Employer contribution totals
 * @param {number} data.serialNo  - Sequential serial number for this EA form
 * @returns {Promise<Buffer>}     - Excel file buffer
 */
const generateEAFormExcel = async (data) => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(TEMPLATE_PATH);

  const ws = wb.getWorksheet('C.P. 8A - Pin. 2021');
  if (!ws) throw new Error('Template worksheet not found');

  // Force fit-to-one-page so LibreOffice scales correctly on any OS/font environment
  ws.pageSetup.fitToPage = true;
  ws.pageSetup.fitToWidth = 1;
  ws.pageSetup.fitToHeight = 1;
  ws.pageSetup.horizontalCentered = true;
  ws.pageSetup.margins = {
    left: 0.4, right: 0.4,
    top: 0.3, bottom: 0.3,
    header: 0.1, footer: 0.1
  };

  const { company, employee, year, income, deductions, employer_contributions, serialNo, signatory } = data;

  // Helper to safely set cell value
  const setCell = (addr, value) => {
    if (value !== null && value !== undefined) {
      ws.getCell(addr).value = value;
    }
  };

  // ─── Header Area ─────────────────────────────────────────────
  setCell('E3', serialNo ? `EA/${year}/${String(serialNo).padStart(3, '0')}` : '');
  setCell('E4', company.e_file_no || '');
  setCell('Z4', year);
  setCell('AK4', company.lhdn_branch || '');
  setCell('AE3', employee.tax_no || '');

  // ─── Section A — Employee Details ────────────────────────────
  setCell('Q10', employee.full_name || '');
  setCell('F12', employee.position || '');
  setCell('AI12', employee.employee_id || '');
  setCell('H13', employee.ic_no || '');
  setCell('AI13', employee.passport_no || '');
  setCell('H14', employee.epf_no || '');
  setCell('AI14', employee.socso_no || '');
  setCell('K16', employee.number_of_children || 0);

  // A8: Tarikh mula bekerja (start date of work) — always show
  if (employee.join_date) {
    const joinCell = ws.getCell('AI16');
    joinCell.value = format(new Date(employee.join_date), 'dd/MM/yyyy');
    joinCell.font = { ...joinCell.font, size: 10 };
  }
  // If employee resigned during the year
  if (employee.employment_status === 'Resigned' && employee.updated_at) {
    const resignYear = new Date(employee.updated_at).getFullYear();
    if (resignYear === year) {
      setCell('AI17', format(new Date(employee.updated_at), 'dd/MM/yyyy'));
    }
  }

  // ─── Section B — Income ──────────────────────────────────────
  // B1a: Gross salary + overtime
  setCell('AK22', income.salary + income.overtime);
  // B1b: Commission + bonus
  setCell('AK23', income.commission + income.bonus);
  // B1c: Allowances / tips / perquisites
  setCell('AK24', income.allowances);
  // B1d–B1f, B2–B6: Not currently tracked — leave as 0/blank

  // ─── Section C — Pension ─────────────────────────────────────
  // Not tracked — leave as 0/blank

  // JUMLAH (row 44) has a SUM formula and will auto-calculate

  // ─── Section D — Deductions ──────────────────────────────────
  // D1: PCB
  setCell('AK47', deductions.pcb);
  // D2–D6: Not tracked — leave as 0/blank

  // ─── Section E — Employee Contributions ──────────────────────
  // E1: EPF fund name + amount
  setCell('J58', 'KWSP');
  setCell('AJ59', deductions.epf_employee);
  // E2: PERKESO (SOCSO + EIS employee contributions)
  setCell('AJ60', deductions.socso_employee + deductions.eis_employee);

  // ─── Section F — Tax-exempt ──────────────────────────────────
  // Not tracked — leave as 0/blank

  // ─── Footer — Signing ────────────────────────────────────────
  setCell('X65', company.signatory_name || (signatory && signatory.name) || '');
  setCell('X67', company.signatory_position || (signatory && signatory.position) || '');
  setCell('X69', company.name || '');
  if (company.address) {
    // Split address into 2 lines (line 1 → X70, line 2 → X71)
    const addressLines = company.address.split('\n').map(l => l.trim()).filter(Boolean);
    setCell('X70', addressLines[0] || '');
    if (addressLines.length > 1) {
      setCell('X71', addressLines.slice(1).join(', '));
    }
  }
  setCell('C73', format(new Date(), 'dd/MM/yyyy'));
  setCell('X73', company.employer_phone || company.phone || '');

  // Generate buffer
  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
};

module.exports = { generateEAFormExcel };
