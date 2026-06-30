/**
 * Seed the subscription package catalog (Basic / Professional / Enterprise).
 *
 * CURRENT ROLLOUT (Basic-open phase):
 *   - Basic         => ALL features true, UNLIMITED limits, is_available = true.
 *                      Everyone runs on Basic and gets the full product today.
 *   - Professional  => real feature subset + limits, is_available = FALSE
 *                      ("Coming Soon" — users cannot self-subscribe).
 *   - Enterprise    => all features, unlimited, is_available = FALSE.
 *
 * TO LAUNCH PRO/ENTERPRISE LATER (no code change elsewhere):
 *   1. Edit BASIC_FEATURES / BASIC_LIMITS below to the real Basic tier.
 *   2. Flip is_available to true for the tier you're launching.
 *   3. Re-run this script (it upserts by slug) and set PACKAGE_ENFORCEMENT=true.
 *
 * Idempotent — safe to re-run; updates existing rows (matched by slug).
 *
 * Usage:
 *   node database/seeds/seed-packages.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const { sequelize, Package } = require('../../src/models');

// Canonical list of every gated feature flag in the platform.
// Add new feature keys here as new gated modules are built.
const ALL_FEATURES = [
  'employee_management',
  'leave_management',
  'attendance',
  'wfh',
  'memos',
  'policies',
  'personal_pages',
  'notifications',
  'feedback',
  'claims',
  'payroll',
  'statutory_reports',
  'analytics',
  'document_management',
  'oauth_login',
  'multi_company',
  'custom_email_templates',
  'audit_log',
  'e_invoice',
  'advanced_analytics',
  'scheduled_reports',
  'priority_support',
  'api_access'
];

// Helper: build a features object with every key set to `value`.
const allFeatures = (value) =>
  ALL_FEATURES.reduce((acc, key) => ({ ...acc, [key]: value }), {});

// --- BASIC (open for everything during this phase) ---
const BASIC_FEATURES = allFeatures(true);
const BASIC_LIMITS = { max_companies: -1, max_employees_per_company: -1 }; // -1 = unlimited

// --- PROFESSIONAL (locked / "Coming Soon") ---
// Realistic future feature set, so the seed is ready when the tier launches.
const PROFESSIONAL_FEATURES = {
  ...allFeatures(false),
  employee_management: true,
  leave_management: true,
  attendance: true,
  wfh: true,
  memos: true,
  policies: true,
  personal_pages: true,
  notifications: true,
  feedback: true,
  claims: true,
  payroll: true,
  statutory_reports: true,
  analytics: true,
  document_management: true,
  oauth_login: true,
  multi_company: true,
  custom_email_templates: true
};
const PROFESSIONAL_LIMITS = { max_companies: 3, max_employees_per_company: 100 };

// --- ENTERPRISE (locked / "Coming Soon") ---
const ENTERPRISE_FEATURES = allFeatures(true);
const ENTERPRISE_LIMITS = { max_companies: -1, max_employees_per_company: -1 };

const PACKAGES = [
  {
    slug: 'basic',
    name: 'Basic',
    tier: 1,
    description: 'Everything you need to run HR — free during launch.',
    price_monthly: 0,
    price_yearly: 0,
    currency: 'MYR',
    features: BASIC_FEATURES,
    limits: BASIC_LIMITS,
    trial_days: 0,
    is_active: true,
    is_available: true,
    sort_order: 1
  },
  {
    slug: 'professional',
    name: 'Professional',
    tier: 2,
    description: 'For growing teams that need payroll, claims and analytics.',
    price_monthly: 49,
    price_yearly: 490,
    currency: 'MYR',
    features: PROFESSIONAL_FEATURES,
    limits: PROFESSIONAL_LIMITS,
    trial_days: 14,
    is_active: true,
    is_available: false, // Coming Soon
    sort_order: 2
  },
  {
    slug: 'enterprise',
    name: 'Enterprise',
    tier: 3,
    description: 'Unlimited scale with audit logs, e-invoicing and priority support.',
    price_monthly: 149,
    price_yearly: 1490,
    currency: 'MYR',
    features: ENTERPRISE_FEATURES,
    limits: ENTERPRISE_LIMITS,
    trial_days: 0,
    is_active: true,
    is_available: false, // Coming Soon
    sort_order: 3
  }
];

const seed = async () => {
  try {
    await sequelize.authenticate();
    console.log('Database connected.\n');

    for (const pkg of PACKAGES) {
      const [row, created] = await Package.findOrCreate({
        where: { slug: pkg.slug },
        defaults: pkg
      });

      if (!created) {
        // Upsert: keep catalog in sync with this file on re-run.
        await row.update(pkg);
        console.log(`  Updated package "${pkg.name}" (slug=${pkg.slug}, available=${pkg.is_available}).`);
      } else {
        console.log(`  Created package "${pkg.name}" (slug=${pkg.slug}, available=${pkg.is_available}).`);
      }
    }

    console.log('\nPackage catalog seeded successfully.');
    process.exit(0);
  } catch (error) {
    console.error('Package seed failed:', error.message);
    process.exit(1);
  }
};

seed();
