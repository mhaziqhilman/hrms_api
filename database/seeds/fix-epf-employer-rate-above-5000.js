/**
 * Fix EPF Employer contributions after rate change for salary > RM5,000 (13% -> 12%).
 *
 * The statutory config `epf_employer_rate_above_5000` was changed to 0.12, but existing
 * payroll + YTD statutory records for high earners were calculated at the old 0.13 rate.
 *
 * This recomputes EPF EMPLOYER amounts using the current company config (canonical
 * calculateEPF logic), so records with gross > threshold drop to 12% while records
 * <= threshold remain at 13% (unchanged). Only employer-side fields are touched:
 *   payroll.epf_employer
 *   ytd_statutory.employer_epf, total_epf, ytd_employer_epf
 * Employer EPF is NOT part of total_deductions / net_salary, so net pay is unaffected.
 *
 * Targets these 5 staff (by full_name):
 *   - Ungku Mohamed Ismail Adrian bin Ungku Abdul Rahman
 *   - Shahrulnizam Bin Ibrahim
 *   - Muhamad Akram Hakim bin Jamaludin
 *   - Mohammad Amier Akram bin Mohd Zaki
 *   - Muhammad Haziq Hilman
 *
 * Usage:
 *   node database/seeds/fix-epf-employer-rate-above-5000.js          # DRY RUN (no writes)
 *   node database/seeds/fix-epf-employer-rate-above-5000.js --apply  # commit changes
 */

require('dotenv').config();
const { sequelize } = require('../../src/config/database');
const Payroll = require('../../src/models/Payroll');
const Employee = require('../../src/models/Employee');
const YTDStatutory = require('../../src/models/YTDStatutory');
const { calculateEPF, getCompanyRates } = require('../../src/utils/statutoryCalculations');
const { Op } = require('sequelize');

const APPLY = process.argv.includes('--apply');

// All target staff belong to company 1 (VLX). Scoping by company guards against
// same-name employees in other companies (e.g. there is a duplicate
// "Muhammad Haziq Hilman bin Hamzan" in company 2 we must NOT touch).
const TARGET_COMPANY_ID = 1;

const TARGET_NAMES = [
  'Ungku Mohamed Ismail Adrian bin Ungku Abdul Rahman',
  'Shahrulnizam Bin Ibrahim',
  'Muhamad Akram Hakim bin Jamaludin',
  'Mohammad Amier Akram bin Mohd Zaki',
  'Muhammad Haziq Hilman bin Hamzan'
];

const r = (v) => Math.round(v * 100) / 100;

async function run() {
  try {
    await sequelize.authenticate();
    console.log(`Database connected. Mode: ${APPLY ? 'APPLY (writing changes)' : 'DRY RUN (no writes)'}\n`);

    const ratesCache = {};
    const getRates = async (companyId) => {
      if (!ratesCache[companyId]) ratesCache[companyId] = await getCompanyRates(companyId);
      return ratesCache[companyId];
    };

    let grandPayrollUpdates = 0;
    let grandYtdUpdates = 0;

    for (const name of TARGET_NAMES) {
      console.log(`\n========== ${name} ==========`);

      // Case-insensitive exact match on full_name, scoped to the target company
      const employee = await Employee.findOne({
        where: { full_name: { [Op.iLike]: name }, company_id: TARGET_COMPANY_ID }
      });

      if (!employee) {
        console.warn(`  !! NOT FOUND — no employee with full_name = "${name}". Skipping.`);
        continue;
      }

      console.log(`  Found: ${employee.full_name} (db id=${employee.id}, employee_id=${employee.employee_id}, company_id=${employee.company_id})`);

      const rates = await getRates(employee.company_id);
      console.log(
        `  Rates: threshold=RM${rates.epf_employer_threshold}, ` +
        `<= -> ${(rates.epf_employer_rate_below_5000 * 100).toFixed(1)}%, ` +
        `> -> ${(rates.epf_employer_rate_above_5000 * 100).toFixed(1)}%`
      );

      // All non-cancelled payroll records, ordered for YTD recompute
      const payrolls = await Payroll.findAll({
        where: {
          employee_id: employee.id,
          status: { [Op.notIn]: ['Cancelled'] }
        },
        order: [['year', 'ASC'], ['month', 'ASC']]
      });

      // ---- Recompute payroll.epf_employer (driven by each payroll's gross) ----
      if (payrolls.length === 0) {
        console.log('  No payroll records found.');
      }
      for (const p of payrolls) {
        const gross = parseFloat(p.gross_salary) || 0;
        const oldEr = parseFloat(p.epf_employer) || 0;
        const newEr = calculateEPF(gross, rates).employer;

        if (r(oldEr) !== r(newEr)) {
          console.log(
            `  payroll ${String(p.month).padStart(2, '0')}/${p.year}: gross=RM${gross.toFixed(2)} ` +
            `| epf_employer ${oldEr.toFixed(2)} -> ${newEr.toFixed(2)} (Δ ${(newEr - oldEr).toFixed(2)})`
          );
          if (APPLY) await p.update({ epf_employer: newEr });
          grandPayrollUpdates++;
        }
      }

      // ---- Recompute YTD statutory employer-EPF (driven by each YTD row's own
      //      gross; independent of payroll since the two tables diverge here) ----
      const ytdRows = await YTDStatutory.findAll({
        where: { employee_id: employee.id },
        order: [['year', 'ASC'], ['month', 'ASC']]
      });

      // Group by year for the per-year cumulative (ytd_employer_epf resets each Jan)
      const byYear = {};
      for (const y of ytdRows) {
        (byYear[y.year] ||= []).push(y);
      }

      for (const year of Object.keys(byYear).sort()) {
        const rows = byYear[year].sort((a, b) => a.month - b.month);
        let cumEmployerEpf = 0;

        for (const y of rows) {
          const gross = parseFloat(y.gross_salary) || 0;
          const empEpf = parseFloat(y.employee_epf) || 0; // employee side unchanged
          const newEr = gross > 0 ? calculateEPF(gross, rates).employer : (parseFloat(y.employer_epf) || 0);
          const newTotal = r(empEpf + newEr);
          cumEmployerEpf += newEr;
          const newYtdEr = r(cumEmployerEpf);

          const oldEr = parseFloat(y.employer_epf) || 0;
          const oldTotal = parseFloat(y.total_epf) || 0;
          const oldYtdEr = parseFloat(y.ytd_employer_epf) || 0;

          const changed = r(oldEr) !== r(newEr) || r(oldTotal) !== newTotal || r(oldYtdEr) !== newYtdEr;
          if (!changed) continue;

          if (APPLY) {
            await y.update({
              employer_epf: newEr,
              total_epf: newTotal,
              ytd_employer_epf: newYtdEr
            });
          }

          console.log(
            `    YTD ${String(y.month).padStart(2, '0')}/${year}: gross=RM${gross.toFixed(2)} | ` +
            `employer_epf ${oldEr.toFixed(2)} -> ${newEr.toFixed(2)}, ` +
            `total_epf ${oldTotal.toFixed(2)} -> ${newTotal.toFixed(2)}, ` +
            `ytd_employer_epf ${oldYtdEr.toFixed(2)} -> ${newYtdEr.toFixed(2)}`
          );
          grandYtdUpdates++;
        }
      }
    }

    console.log(
      `\n\n${APPLY ? 'APPLIED' : 'DRY RUN'} — payroll rows changed: ${grandPayrollUpdates}, ` +
      `YTD rows changed: ${grandYtdUpdates}.`
    );
    if (!APPLY) console.log('Re-run with --apply to commit these changes.');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

run();
