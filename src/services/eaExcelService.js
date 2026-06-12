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
 * @param {string} [data.formDate] - Optional YYYY-MM-DD date for the form's "Tarikh" (defaults to today)
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

  // Section 9 — "Jika bekerja tidak genap setahun, nyatakan" (if not employed
  // for the full tax year, state the dates).

  // 9(a): Tarikh mula bekerja — only when the employee STARTED during this tax
  // year. If they joined in a prior year they were employed from 1 Jan, so the
  // start date is left blank.
  if (employee.join_date && new Date(employee.join_date).getFullYear() === year) {
    const joinCell = ws.getCell('AI16');
    joinCell.value = format(new Date(employee.join_date), 'dd/MM/yyyy');
    joinCell.font = { ...joinCell.font, size: 10 };
  }

  // 9(b): Tarikh berhenti bekerja — the employee's last working day. Prefer the
  // recorded end_date; fall back to updated_at for legacy records that left
  // before end_date was tracked. Only shown when they left during this tax year.
  const lastWorkingDay = employee.end_date
    || ((employee.employment_status === 'Resigned' || employee.employment_status === 'Terminated')
          ? employee.updated_at
          : null);
  if (lastWorkingDay && new Date(lastWorkingDay).getFullYear() === year) {
    const endCell = ws.getCell('AI17');
    endCell.value = format(new Date(lastWorkingDay), 'dd/MM/yyyy');
    endCell.font = { ...endCell.font, size: 10 };
  }

  // ─── Section B — Income ──────────────────────────────────────
  // B1a: Gross salary + overtime
  const b1a = income.salary + income.overtime;
  setCell('AK22', b1a);
  // B1b: Commission + bonus
  const b1b = income.commission + income.bonus;
  setCell('AK23', b1b);
  // B1c: Allowances / tips / perquisites
  const b1c = income.allowances;
  setCell('AK24', b1c);
  // B1d–B1f, B2–B6: Not currently tracked — leave as 0/blank

  // ─── Section C — Pension ─────────────────────────────────────
  // Not tracked — leave as 0/blank

  // JUMLAH (row 44): the template carries a SUM formula but with no cached
  // result. ExcelJS does not evaluate formulas, and LibreOffice's headless
  // PDF conversion renders the stale cached value (0.00) instead of
  // recalculating. So we write the formula back WITH a computed result —
  // the PDF shows the correct total and Excel still recalculates on open.
  const jumlah = b1a + b1b + b1c;
  const jumlahFormula = 'SUM(AK22:AP27,AK31:AP33,AK35:AP37,AK39:AP39,AK42:AP43)';
  ws.getCell('AK44').value = { formula: jumlahFormula, result: jumlah };

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
  // Tarikh — use the caller-supplied form date (for back-dating older forms),
  // falling back to today. Parsed component-wise to stay timezone-safe.
  let tarikh = new Date();
  if (data.formDate) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(data.formDate));
    if (m) tarikh = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  setCell('C73', format(tarikh, 'dd/MM/yyyy'));
  setCell('X73', company.employer_phone || company.phone || '');

  // Generate buffer
  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
};

module.exports = { generateEAFormExcel };
