/**
 * Seed default announcement categories for all existing companies
 * Run with: node database/seeds/seed-announcement-categories.js
 */
require('dotenv').config();
const { sequelize } = require('../../src/config/database');
const Company = require('../../src/models/Company');
const AnnouncementCategory = require('../../src/models/AnnouncementCategory');

const DEFAULT_CATEGORIES = [
  { name: 'General', slug: 'general', color: '#6B7280', icon: 'info', sort_order: 0 },
  { name: 'New Hire', slug: 'new-hire', color: '#10B981', icon: 'user-plus', sort_order: 1 },
  { name: 'SOP Updates', slug: 'sop-updates', color: '#F59E0B', icon: 'file-text', sort_order: 2 },
  { name: 'Policy Updates', slug: 'policy-updates', color: '#EF4444', icon: 'shield', sort_order: 3 },
  { name: 'Promotion', slug: 'promotion', color: '#8B5CF6', icon: 'trophy', sort_order: 4 },
  { name: 'Transfer', slug: 'transfer', color: '#3B82F6', icon: 'arrow-right-left', sort_order: 5 },
  { name: 'Training', slug: 'training', color: '#EC4899', icon: 'graduation-cap', sort_order: 6 },
  { name: 'Special', slug: 'special', color: '#F97316', icon: 'star', sort_order: 7 }
];

async function seedCategories() {
  try {
    console.log('Seeding announcement categories...');

    const companies = await Company.findAll({ attributes: ['id', 'name'] });
    console.log(`Found ${companies.length} companies`);

    for (const company of companies) {
      console.log(`\nProcessing company: ${company.name} (ID: ${company.id})`);

      for (const cat of DEFAULT_CATEGORIES) {
        const [category, created] = await AnnouncementCategory.findOrCreate({
          where: { company_id: company.id, slug: cat.slug },
          defaults: { ...cat, company_id: company.id }
        });

        if (created) {
          console.log(`  ✓ Created: ${cat.name}`);
        } else {
          console.log(`  ⚠ Already exists: ${cat.name}`);
        }
      }
    }

    console.log('\n✅ Announcement categories seeded successfully!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Seeding failed:', error.message);
    process.exit(1);
  }
}

seedCategories();
