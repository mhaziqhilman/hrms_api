const { StatutoryConfig } = require('../models');
const logger = require('../utils/logger');

// Default statutory config values (updated Oct 2024: SOCSO/EIS ceiling RM6,000)
const DEFAULT_CONFIGS = [
  { config_key: 'epf_employee_rate', config_value: '0.11', description: 'EPF employee contribution rate (11%)' },
  { config_key: 'epf_employer_rate_below_5000', config_value: '0.13', description: 'EPF employer rate for salary ≤ RM5,000 (13%)' },
  { config_key: 'epf_employer_rate_above_5000', config_value: '0.12', description: 'EPF employer rate for salary > RM5,000 (12%)' },
  { config_key: 'epf_employer_threshold', config_value: '5000', description: 'EPF employer rate salary threshold (RM)' },
  { config_key: 'socso_max_salary', config_value: '6000', description: 'SOCSO maximum salary cap (RM) - uses official wage-band table' },
  { config_key: 'eis_max_salary', config_value: '6000', description: 'EIS maximum salary cap (RM) - uses official wage-band table' }
];

/**
 * Get all statutory configs for the user's company
 * Seeds defaults if none exist
 */
exports.getStatutoryConfig = async (req, res) => {
  try {
    const { company_id } = req.user;

    let configs = await StatutoryConfig.findAll({
      where: { company_id },
      order: [['config_key', 'ASC']]
    });

    // Seed missing defaults (handles both fresh companies and new keys added later)
    const existingKeys = configs.map(c => c.config_key);
    const missingConfigs = DEFAULT_CONFIGS.filter(c => !existingKeys.includes(c.config_key));

    if (missingConfigs.length > 0) {
      const seedData = missingConfigs.map(c => ({ ...c, company_id }));
      await StatutoryConfig.bulkCreate(seedData);
      configs = await StatutoryConfig.findAll({
        where: { company_id },
        order: [['config_key', 'ASC']]
      });
    }

    res.json({ success: true, data: configs });
  } catch (error) {
    logger.error('Error fetching statutory config:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch statutory configuration' });
  }
};

/**
 * Bulk update statutory configs
 * Body: { configs: [{ config_key, config_value, effective_from? }] }
 */
exports.updateStatutoryConfig = async (req, res) => {
  try {
    const { company_id } = req.user;
    const { configs } = req.body;

    if (!Array.isArray(configs) || configs.length === 0) {
      return res.status(400).json({ success: false, message: 'Configs array is required' });
    }

    const validKeys = DEFAULT_CONFIGS.map(c => c.config_key);
    const results = [];

    for (const { config_key, config_value, effective_from } of configs) {
      if (!validKeys.includes(config_key)) {
        continue;
      }

      const [config, created] = await StatutoryConfig.findOrCreate({
        where: { company_id, config_key },
        defaults: {
          config_value: String(config_value),
          effective_from: effective_from || null,
          description: DEFAULT_CONFIGS.find(c => c.config_key === config_key)?.description
        }
      });

      if (!created) {
        await config.update({
          config_value: String(config_value),
          effective_from: effective_from || config.effective_from
        });
      }

      results.push(config);
    }

    logger.info(`Statutory config updated for company ${company_id}: ${configs.length} keys`);
    res.json({ success: true, data: results, message: 'Statutory configuration updated successfully' });
  } catch (error) {
    logger.error('Error updating statutory config:', error);
    res.status(500).json({ success: false, message: 'Failed to update statutory configuration' });
  }
};
