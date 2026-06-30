/**
 * One-time migration: give every existing user a Basic subscription.
 *
 * During the Basic-open phase, Basic already grants all features, so every
 * grandfathered user keeps full access. (When real tiers launch, you can
 * re-grant select users via the admin override UI.)
 *
 * Idempotent — users that already have a subscription are skipped.
 *
 * Run AFTER the subscriptions/packages tables exist and seed-packages.js
 * has been run:
 *   node database/seeds/backfill-subscriptions.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const { sequelize, User, Subscription } = require('../../src/models');
const subscriptionService = require('../../src/services/subscriptionService');

const SLUG = process.env.DEFAULT_PACKAGE_SLUG || 'basic';

const backfill = async () => {
  try {
    await sequelize.authenticate();
    console.log('Database connected.\n');

    const users = await User.findAll({ attributes: ['id', 'email'] });
    console.log(`Found ${users.length} users.`);

    let created = 0;
    let skipped = 0;

    for (const user of users) {
      const existing = await Subscription.findOne({ where: { user_id: user.id } });
      if (existing) {
        skipped++;
        continue;
      }
      await subscriptionService.subscribe(user.id, SLUG, {
        action: 'created',
        reason: 'Backfill — grandfathered existing user'
      });
      created++;
      console.log(`  + ${user.email} → ${SLUG}`);
    }

    console.log(`\nBackfill complete: ${created} created, ${skipped} already had a subscription.`);
    process.exit(0);
  } catch (error) {
    console.error('Backfill failed:', error.message);
    process.exit(1);
  }
};

backfill();
