/**
 * Seed: Velarix Technology company policies (from LOE_VLX-010)
 *
 * Inserts 11 draft policies derived from the Letter of Employment.
 * References to deployment are generic ("the client"); contract-specific
 * terms are softened to apply to general staff.
 *
 * Idempotent — skips any policy whose (policy_code, company_id) already exists.
 *
 * Resolution:
 *   company_id : ILIKE '%velarix%' on companies.name, or registration_no '1606168'
 *                (override with --company-id=N)
 *   author_id  : the company's owner_id, else the first super_admin user
 *                (override with --author-id=N)
 *
 * Usage:
 *   node database/seeds/seed-velarix-policies.js
 *   node database/seeds/seed-velarix-policies.js --company-id=2 --author-id=1
 */

require('dotenv').config();
const { Sequelize, QueryTypes } = require('sequelize');

// --- DB connection (mirrors config/database.js) ---
let sequelize;
if (process.env.DATABASE_URL) {
  sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    dialectOptions: process.env.DB_SSL !== 'false' ? {
      ssl: { require: true, rejectUnauthorized: false }
    } : {},
    logging: false
  });
} else {
  sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASS,
    {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      dialect: 'postgres',
      logging: false
    }
  );
}

const arg = (flag) => {
  const a = process.argv.find(x => x.startsWith(`${flag}=`));
  return a ? parseInt(a.split('=')[1], 10) : null;
};
const overrideCompanyId = arg('--company-id');
const overrideAuthorId = arg('--author-id');

// --- Policy definitions (content as plain markdown text) ---
const POLICIES = [
  {
    policy_code: 'POL-EMP-001',
    title: 'Appointment & Probation Policy',
    category: 'HR',
    requires_acknowledgment: true,
    description: 'Terms governing appointment, contract basis, probation, and confirmation.',
    content: `1. Employees may be engaged on a permanent or fixed-term contract basis as stated in their Letter of Employment. Contract employees serve for the defined start and end dates specified in their letter.
2. New employees serve a probation period of three (3) months. During probation, either party may terminate the employment by giving one (1) month's written notice or salary in lieu.
3. The Company may, at its absolute discretion, reduce or extend the probation period.
4. Upon successful completion of probation and satisfactory performance, the employee will be notified of confirmation in writing.
5. Duties are as set out in the job description, plus any reasonable duties required by management from time to time.`
  },
  {
    policy_code: 'POL-EMP-002',
    title: 'Compensation & Salary Review Policy',
    category: 'HR',
    requires_acknowledgment: true,
    description: 'Salary payment terms and performance-based salary review.',
    content: `1. Salary is paid monthly in arrears at the rate stated in the Letter of Employment.
2. A performance review is conducted upon completion of the three (3) month probation period. Salary may be adjusted based on the outcome, which assesses performance, contributions, and overall fit.
3. Salary reviews may also be conducted periodically at the Company's discretion, subject to performance and, where applicable, the requirements of the engagement or client contract.
4. Salary amounts and adjustments are confidential and may be varied only by written agreement.`
  },
  {
    policy_code: 'POL-HR-003',
    title: 'Working Hours, Timesheet & Overtime Policy',
    category: 'HR',
    requires_acknowledgment: true,
    description: 'Working hours, flexible-hours obligation, timesheet submission, and overtime.',
    content: `1. Official working hours, lunch breaks, and rest days follow the Company's schedule or, for employees deployed to a client, the client's instructions and requirements.
2. The Company or client reserves the right to require flexible working hours from time to time.
3. Where required by the Company or the client, employees must complete a daily/monthly timesheet with monthly reporting, obtain the relevant approval, and submit it to the Company by the 25th of the working month (or the last day of employment).
4. Additional hours may be required to complete necessary work. Overtime eligibility is as stated in the employee's Letter of Employment; certain contract roles are not entitled to overtime claims.`
  },
  {
    policy_code: 'POL-HR-004',
    title: 'Leave Policy (Annual, Medical & Public Holidays)',
    category: 'HR',
    requires_acknowledgment: true,
    description: 'Annual leave, medical leave, public holidays, and unpaid-absence deductions.',
    content: `1. Annual leave: 15 days paid annual leave per year, subject to approval. Entitlement accrues on a pro-rata basis at 1.25 days for each completed month of service.
2. Medical leave: 14 days paid medical leave per year.
3. Public & company holidays: Public and company holidays observed (by the Company or the client where deployed) are treated as paid leave.
4. Unpaid absence: Absence without approval, or leave taken in excess of the annual/medical entitlement, may be deducted from salary based on the number of days absent.`
  },
  {
    policy_code: 'POL-HR-005',
    title: 'Medical & Insurance Coverage Policy',
    category: 'HR',
    requires_acknowledgment: true,
    description: 'Medical benefits and the Company\'s right to amend them.',
    content: `1. Subject to Company rules, employees are entitled to medical consultations and prescribed medicines covered under the Company's medical insurance scheme.
2. The Company reserves the right to change, modify, discontinue, or terminate the medical benefits policy at its sole discretion.
3. Employees are not entitled to compensation for loss or prospective loss of these benefits arising from any employment action, including termination.`
  },
  {
    policy_code: 'POL-FIN-006',
    title: 'Statutory Contributions & Tax Policy',
    category: 'Finance',
    requires_acknowledgment: false,
    description: 'EPF, SOCSO, and income tax deductions.',
    content: `1. Both the employee and the Company contribute to EPF and SOCSO in accordance with applicable statutory legislation.
2. The Company deducts monthly income tax (PCB/MTD) at the prevailing rate and remits it to the Inland Revenue Board of Malaysia (LHDN).`
  },
  {
    policy_code: 'POL-FIN-007',
    title: 'Business Travel & Outstation Allowance Policy',
    category: 'Finance',
    requires_acknowledgment: false,
    description: 'Reimbursement for official business trips.',
    content: `1. Official business trips, lodging, transport, and related expenses are compensated where applicable, in accordance with Company policy or the governing client policy where the employee is deployed.`
  },
  {
    policy_code: 'POL-HR-008',
    title: 'Termination & Notice Policy',
    category: 'HR',
    requires_acknowledgment: true,
    description: 'Notice periods and grounds for termination.',
    content: `1. After confirmation, either party may terminate employment by giving one (1) month's written notice or payment of one (1) month's salary in lieu of notice.
2. The Company may terminate immediately, without notice, in cases of serious misconduct or breach of the employment agreement.
3. Where an employee is deployed to a client and the client no longer requires the employee's services, the Company may reassign the employee or, where no suitable role is available, terminate employment in accordance with the Letter of Employment.`
  },
  {
    policy_code: 'POL-COMP-009',
    title: 'Confidentiality & Proprietary Information Policy',
    category: 'Compliance',
    requires_acknowledgment: true,
    description: 'Protection of Company and client proprietary information.',
    content: `1. Employees must preserve the secrecy of all Proprietary Information except where it is lawfully in the Company's unrestricted possession or is public knowledge. This obligation continues so long as the information has not become public through no fault of the Company.
2. Employees must not, during or after employment, directly or indirectly divulge any confidential knowledge, information, or secrets acquired in the course of employment to any person, firm, or company, except in the course of their duties.
3. Title to all property supplied by the Company or the client remains exclusively with the Company or the client.
4. Employees deployed to a client site must keep confidential any technical or other information not publicly disclosed by the client or the Company.`
  },
  {
    policy_code: 'POL-HR-010',
    title: 'Code of Conduct & Outside Engagement Policy',
    category: 'HR',
    requires_acknowledgment: true,
    description: 'Standards of conduct, exclusivity, and compliance with Company rules.',
    content: `1. Employees must conduct themselves in an orderly, honest, and sober manner towards fellow employees and must not engage in conduct prejudicial to the image and respectability of the Company.
2. Employees must not, during employment, directly or indirectly engage in any other work or business (for reward or otherwise) without the prior consent of the Company.
3. Employees must comply with all Company rules, instructions, and regulations in force from time to time. The Company reserves the right to alter or amend its rules, regulations, and the terms of employment, and such amendments become binding.
4. Employees deployed to a client site must obey the policies and procedures of the client and abide by the laws of Malaysia and applicable state laws.`
  },
  {
    policy_code: 'POL-OPS-011',
    title: 'Client Site Deployment Policy',
    category: 'Operations',
    requires_acknowledgment: true,
    description: 'Obligations for employees deployed to client premises.',
    content: `1. Deployed employees report to the designated client representative at the specified work location; specified duties are advised by the client.
2. Employees must comply with all client policies, procedures, security, and access requirements at the client site.
3. Working hours, leave approvals, and timesheets are subject to client approval as set out in the relevant HR policies.
4. Title to all client-supplied property remains with the client and must be returned on completion or termination.`
  }
];

async function resolveCompanyId() {
  if (overrideCompanyId) {
    console.log(`  Using --company-id=${overrideCompanyId} from CLI override.`);
    return overrideCompanyId;
  }
  const rows = await sequelize.query(
    `SELECT id, name FROM companies
     WHERE name ILIKE '%velarix%' OR registration_no ILIKE '%1606168%'
     ORDER BY id ASC LIMIT 1`,
    { type: QueryTypes.SELECT }
  );
  if (!rows.length) {
    throw new Error('No Velarix company found. Create it first, or pass --company-id=N.');
  }
  console.log(`  Matched company: id=${rows[0].id} name="${rows[0].name}"`);
  return rows[0].id;
}

async function resolveAuthorId(companyId) {
  if (overrideAuthorId) {
    console.log(`  Using --author-id=${overrideAuthorId} from CLI override.`);
    return overrideAuthorId;
  }
  const owner = await sequelize.query(
    `SELECT owner_id FROM companies WHERE id = :cid AND owner_id IS NOT NULL`,
    { replacements: { cid: companyId }, type: QueryTypes.SELECT }
  );
  if (owner.length && owner[0].owner_id) {
    console.log(`  Using company owner as author: id=${owner[0].owner_id}`);
    return owner[0].owner_id;
  }
  const sa = await sequelize.query(
    `SELECT id, email FROM users WHERE role = 'super_admin' ORDER BY id ASC LIMIT 1`,
    { type: QueryTypes.SELECT }
  );
  if (!sa.length) {
    throw new Error('No owner and no super_admin user found. Pass --author-id=N.');
  }
  console.log(`  Using super_admin as author: id=${sa[0].id} (${sa[0].email})`);
  return sa[0].id;
}

async function run() {
  try {
    await sequelize.authenticate();
    console.log('Database connection established.\n');

    const companyId = await resolveCompanyId();
    const authorId = await resolveAuthorId(companyId);
    console.log();

    let inserted = 0, skipped = 0;
    for (const p of POLICIES) {
      const exists = await sequelize.query(
        `SELECT id FROM policies WHERE policy_code = :code AND company_id = :cid LIMIT 1`,
        { replacements: { code: p.policy_code, cid: companyId }, type: QueryTypes.SELECT }
      );
      if (exists.length) {
        console.log(`  - ${p.policy_code} already exists, skipping`);
        skipped++;
        continue;
      }
      await sequelize.query(
        `INSERT INTO policies
          (public_id, policy_code, company_id, title, description, content,
           category, version, status, author_id, requires_acknowledgment,
           view_count, acknowledgment_count, created_at, updated_at)
         VALUES
          (gen_random_uuid(), :code, :cid, :title, :description, :content,
           :category, '1.0', 'Draft', :authorId, :ack,
           0, 0, NOW(), NOW())`,
        {
          replacements: {
            code: p.policy_code,
            cid: companyId,
            title: p.title,
            description: p.description,
            content: p.content,
            category: p.category,
            authorId,
            ack: p.requires_acknowledgment
          }
        }
      );
      console.log(`  + ${p.policy_code}  ${p.title}`);
      inserted++;
    }

    console.log(`\nDone. Inserted ${inserted}, skipped ${skipped} (of ${POLICIES.length}).`);
    console.log('All policies created with status="Draft" — review and publish from the Policy UI.');
  } catch (error) {
    console.error('Seed failed:', error.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

run();
