/**
 * Fix YTD Statutory records for employees 2, 18, and 22.
 * Recalculates all YTD totals from payroll data.
 *
 * Usage: node database/seeds/fix-ytd-employees-2-18-22.js
 */

require('dotenv').config();
const { sequelize } = require('../../src/config/database');
const Payroll = require('../../src/models/Payroll');
const YTDStatutory = require('../../src/models/YTDStatutory');
const { Op } = require('sequelize');

const TARGET_EMPLOYEE_IDS = [2, 18, 22];

async function fixYTD() {
  try {
    await sequelize.authenticate();
    console.log('Database connected.\n');

    for (const employeeId of TARGET_EMPLOYEE_IDS) {
      console.log(`\n========== Employee ID: ${employeeId} ==========`);

      // Get all payroll records ordered by year/month
      const payrolls = await Payroll.findAll({
        where: {
          employee_id: employeeId,
          status: { [Op.notIn]: ['Cancelled'] }
        },
        order: [['year', 'ASC'], ['month', 'ASC']],
        raw: true
      });

      if (payrolls.length === 0) {
        console.log('  No payroll records found, skipping.');
        continue;
      }

      console.log(`  Found ${payrolls.length} payroll records.`);

      // Group by year
      const byYear = {};
      for (const p of payrolls) {
        if (!byYear[p.year]) byYear[p.year] = [];
        byYear[p.year].push(p);
      }

      let totalUpdated = 0;
      let totalCreated = 0;

      for (const [year, yearPayrolls] of Object.entries(byYear)) {
        console.log(`  Processing year ${year} (${yearPayrolls.length} months)...`);

        // Running YTD accumulators
        let ytdGross = 0;
        let ytdNet = 0;
        let ytdEmployeeEpf = 0;
        let ytdEmployerEpf = 0;
        let ytdEmployeeSocso = 0;
        let ytdEmployerSocso = 0;
        let ytdEmployeeEis = 0;
        let ytdEmployerEis = 0;
        let ytdPcb = 0;

        for (const p of yearPayrolls) {
          const gross = parseFloat(p.gross_salary) || 0;
          const net = parseFloat(p.net_salary) || 0;
          const epfEmp = parseFloat(p.epf_employee) || 0;
          const epfEr = parseFloat(p.epf_employer) || 0;
          const socsoEmp = parseFloat(p.socso_employee) || 0;
          const socsoEr = parseFloat(p.socso_employer) || 0;
          const eisEmp = parseFloat(p.eis_employee) || 0;
          const eisEr = parseFloat(p.eis_employer) || 0;
          const pcb = parseFloat(p.pcb_deduction) || 0;

          // Accumulate YTD (including current month)
          ytdGross += gross;
          ytdNet += net;
          ytdEmployeeEpf += epfEmp;
          ytdEmployerEpf += epfEr;
          ytdEmployeeSocso += socsoEmp;
          ytdEmployerSocso += socsoEr;
          ytdEmployeeEis += eisEmp;
          ytdEmployerEis += eisEr;
          ytdPcb += pcb;

          const r = (v) => Math.round(v * 100) / 100;

          // Find or create YTD record
          const [ytdRecord, created] = await YTDStatutory.findOrCreate({
            where: { employee_id: employeeId, year: parseInt(year), month: p.month },
            defaults: {
              employee_id: employeeId,
              year: parseInt(year),
              month: p.month,
              gross_salary: 0,
              net_salary: 0,
              employee_epf: 0, employer_epf: 0,
              employee_socso: 0, employer_socso: 0,
              employee_eis: 0, employer_eis: 0,
              pcb_deduction: 0,
              ytd_gross: 0, ytd_net: 0,
              ytd_employee_epf: 0, ytd_employer_epf: 0,
              ytd_employee_socso: 0, ytd_employer_socso: 0,
              ytd_employee_eis: 0, ytd_employer_eis: 0,
              ytd_pcb: 0
            }
          });

          if (created) totalCreated++;

          await ytdRecord.update({
            gross_salary: gross,
            net_salary: net,
            employee_epf: epfEmp,
            employer_epf: epfEr,
            total_epf: r(epfEmp + epfEr),
            employee_socso: socsoEmp,
            employer_socso: socsoEr,
            total_socso: r(socsoEmp + socsoEr),
            employee_eis: eisEmp,
            employer_eis: eisEr,
            total_eis: r(eisEmp + eisEr),
            pcb_deduction: pcb,
            ytd_gross: r(ytdGross),
            ytd_net: r(ytdNet),
            ytd_employee_epf: r(ytdEmployeeEpf),
            ytd_employer_epf: r(ytdEmployerEpf),
            ytd_employee_socso: r(ytdEmployeeSocso),
            ytd_employer_socso: r(ytdEmployerSocso),
            ytd_employee_eis: r(ytdEmployeeEis),
            ytd_employer_eis: r(ytdEmployerEis),
            ytd_pcb: r(ytdPcb)
          });

          totalUpdated++;

          console.log(
            `    ${p.month}/${year}: ` +
            `Gross=${gross}, Net=${net}, EPF_ee=${epfEmp}, SOCSO_ee=${socsoEmp}, EIS_ee=${eisEmp} | ` +
            `YTD: Gross=${r(ytdGross)}, Net=${r(ytdNet)}, EPF_er=${r(ytdEmployerEpf)}, SOCSO_er=${r(ytdEmployerSocso)}, EIS_er=${r(ytdEmployerEis)}`
          );
        }
      }

      console.log(`  Done! Updated ${totalUpdated} records (${totalCreated} newly created).`);
    }

    console.log('\n\nAll employees processed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

fixYTD();
