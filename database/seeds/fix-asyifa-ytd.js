/**
 * Fix Asyifa binti Abd Malik (AVS004) YTD Statutory records
 * Recalculates YTD totals based on corrected payroll data (PCB = 244.20, net = 5499.15)
 *
 * Usage: node database/seeds/fix-asyifa-ytd.js
 */

require('dotenv').config();
const { sequelize } = require('../../src/config/database');
const Payroll = require('../../src/models/Payroll');
const Employee = require('../../src/models/Employee');
const YTDStatutory = require('../../src/models/YTDStatutory');
const { Op } = require('sequelize');

async function fixYTD() {
  try {
    await sequelize.authenticate();
    console.log('Database connected.');

    const employee = await Employee.findOne({
      where: { employee_id: 'AVS004' }
    });

    if (!employee) {
      console.error('Employee AVS004 not found!');
      process.exit(1);
    }

    console.log(`Found employee: ${employee.full_name} (ID: ${employee.id})`);

    // Get all her payroll records (corrected), ordered by month
    const payrolls = await Payroll.findAll({
      where: {
        employee_id: employee.id,
        status: { [Op.notIn]: ['Cancelled'] }
      },
      order: [['year', 'ASC'], ['month', 'ASC']],
      raw: true
    });

    console.log(`Found ${payrolls.length} payroll records.`);

    // Group by year
    const byYear = {};
    for (const p of payrolls) {
      if (!byYear[p.year]) byYear[p.year] = [];
      byYear[p.year].push(p);
    }

    let totalUpdated = 0;
    let totalCreated = 0;

    for (const [year, yearPayrolls] of Object.entries(byYear)) {
      console.log(`\nProcessing year ${year} (${yearPayrolls.length} months)...`);

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
        const gross = parseFloat(p.gross_salary);
        const net = parseFloat(p.net_salary);
        const epfEmp = parseFloat(p.epf_employee);
        const epfEr = parseFloat(p.epf_employer);
        const socsoEmp = parseFloat(p.socso_employee);
        const socsoEr = parseFloat(p.socso_employer);
        const eisEmp = parseFloat(p.eis_employee);
        const eisEr = parseFloat(p.eis_employer);
        const pcb = parseFloat(p.pcb_deduction);

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

        // Find or create YTD record
        const [ytdRecord, created] = await YTDStatutory.findOrCreate({
          where: { employee_id: employee.id, year: parseInt(year), month: p.month },
          defaults: {
            employee_id: employee.id,
            year: parseInt(year),
            month: p.month,
            gross_salary: 0,
            net_salary: 0,
            employee_epf: 0,
            employer_epf: 0,
            employee_socso: 0,
            employer_socso: 0,
            employee_eis: 0,
            employer_eis: 0,
            pcb_deduction: 0,
            ytd_gross: 0,
            ytd_net: 0,
            ytd_employee_epf: 0,
            ytd_employer_epf: 0,
            ytd_employee_socso: 0,
            ytd_employer_socso: 0,
            ytd_employee_eis: 0,
            ytd_employer_eis: 0,
            ytd_pcb: 0
          }
        });

        if (created) totalCreated++;

        // Round to 2 decimals to avoid float drift
        const r = (v) => Math.round(v * 100) / 100;

        await ytdRecord.update({
          gross_salary: gross,
          net_salary: net,
          employee_epf: epfEmp,
          employer_epf: epfEr,
          employee_socso: socsoEmp,
          employer_socso: socsoEr,
          employee_eis: eisEmp,
          employer_eis: eisEr,
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
          `  ${p.month}/${year}: ` +
          `PCB=${pcb}, Net=${net}, ` +
          `YTD Gross=${r(ytdGross)}, YTD Net=${r(ytdNet)}, YTD PCB=${r(ytdPcb)}`
        );
      }
    }

    console.log(`\nDone! Updated ${totalUpdated} YTD records (${totalCreated} newly created).`);
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

fixYTD();
