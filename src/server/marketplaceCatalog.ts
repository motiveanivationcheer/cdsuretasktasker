// Authoritative Premium Marketplace Catalog & Categories
// Synced with schema.sql marketplace_products seed data

export type MarketplaceCategory =
  | 'digital_product'
  | 'premium_tool'
  | 'football_analysis'
  | 'casino_education'
  | 'screenshot_package'
  | 'subscription'
  | 'vendor_package';

export interface MarketplaceProduct {
  id: string;
  title: string;
  description: string;
  category: MarketplaceCategory;
  categoryLabel: string;
  price_ngn: number;
  vendor_id: string;
  vendor_name: string;
  commission_rate: number;
  r2_file_key: string;
  delivery_type: 'download' | 'tool_access' | 'subscription';
  badge: string;
  is_active: number;
}

export const MARKETPLACE_CATALOG: MarketplaceProduct[] = [
  {
    id: 'prod_digital_playbook',
    title: 'Social Media Growth & Micro-Task Mastery Playbook',
    description:
      'Complete 80-page digital PDF guide covering high-paying campaign approval tactics, audience growth funnels, and verified proof formatting.',
    category: 'digital_product',
    categoryLabel: 'Digital Products',
    price_ngn: 2500,
    vendor_id: 'vendor_cdsure_official',
    vendor_name: 'CDSure Official',
    commission_rate: 0.3,
    r2_file_key: 'marketplace/digital-growth-playbook.pdf',
    delivery_type: 'download',
    badge: 'Bestseller',
    is_active: 1,
  },
  {
    id: 'prod_tool_verifier',
    title: 'Auto-Proof Link & Campaign Checker Pro Tool',
    description:
      'Web and desktop utility suite for employers and earners to batch-verify social URLs, timestamps, and proof metadata before submission.',
    category: 'premium_tool',
    categoryLabel: 'Premium Tools',
    price_ngn: 4000,
    vendor_id: 'vendor_tools_lab',
    vendor_name: 'Apex Dev Tools',
    commission_rate: 0.3,
    r2_file_key: 'marketplace/proof-verifier-pro-suite.zip',
    delivery_type: 'tool_access',
    badge: 'Pro Tool',
    is_active: 1,
  },
  {
    id: 'prod_football_vip',
    title: 'Weekend Pro Football Match Analytics & Stats Package',
    description:
      'Statistical breakdown covering xG metrics, team form indices, corner frequencies, and injury reports across top 5 European leagues.',
    category: 'football_analysis',
    categoryLabel: 'Football Analysis',
    price_ngn: 5000,
    vendor_id: 'vendor_pitch_quant',
    vendor_name: 'PitchQuant Analytics',
    commission_rate: 0.3,
    r2_file_key: 'marketplace/football-analytics-weekly-pack.pdf',
    delivery_type: 'download',
    badge: 'Weekly Pack',
    is_active: 1,
  },
  {
    id: 'prod_casino_edu',
    title: 'Probability, House Edge & Bankroll Educational Package',
    description:
      'Educational mathematics course explaining RTP variance, Kelly Criterion staking discipline, risk-of-ruin formulas, and bankroll preservation.',
    category: 'casino_education',
    categoryLabel: 'Casino Analysis Education',
    price_ngn: 6000,
    vendor_id: 'vendor_quant_edu',
    vendor_name: 'QuantEdu Academy',
    commission_rate: 0.3,
    r2_file_key: 'marketplace/probability-bankroll-education.pdf',
    delivery_type: 'download',
    badge: 'Educational',
    is_active: 1,
  },
  {
    id: 'prod_screenshot_pack',
    title: 'Verified Campaign Proof Template & Watermark Bundle',
    description:
      '60+ structured screenshot framing templates, annotation overlays, and timestamp watermark assets delivered directly from Cloudflare R2.',
    category: 'screenshot_package',
    categoryLabel: 'Screenshot Packages',
    price_ngn: 1500,
    vendor_id: 'vendor_design_hub',
    vendor_name: 'Naija Creator Studio',
    commission_rate: 0.3,
    r2_file_key: 'marketplace/screenshot-template-bundle.zip',
    delivery_type: 'download',
    badge: 'Instant R2',
    is_active: 1,
  },
  {
    id: 'prod_sub_pro',
    title: 'CDSure VIP Pro Membership (30-Day Priority Pass)',
    description:
      'Unlocks priority access to ₦3,500+ high-reward micro-tasks, fast-track review queue status, and exclusive marketplace drops for 30 days.',
    category: 'subscription',
    categoryLabel: 'Premium Subscriptions',
    price_ngn: 3500,
    vendor_id: 'vendor_cdsure_official',
    vendor_name: 'CDSure Official',
    commission_rate: 0.3,
    r2_file_key: 'marketplace/vip-pro-welcome-kit.pdf',
    delivery_type: 'subscription',
    badge: 'VIP 30 Days',
    is_active: 1,
  },
  {
    id: 'prod_vendor_toolkit',
    title: 'Affiliate & Freelance Campaign Launch Vendor Kit',
    description:
      'Curated partner-vendor digital toolkit containing conversion scripts, UTM campaign sheets, and payout reconciliation calculators.',
    category: 'vendor_package',
    categoryLabel: 'Vendor Packages',
    price_ngn: 3000,
    vendor_id: 'vendor_lagos_growth',
    vendor_name: 'Lagos Digital Guild',
    commission_rate: 0.3,
    r2_file_key: 'marketplace/vendor-campaign-toolkit.zip',
    delivery_type: 'download',
    badge: 'Partner Vendor',
    is_active: 1,
  },
];

export function getCatalogProductById(productId: string): MarketplaceProduct | undefined {
  return MARKETPLACE_CATALOG.find((p) => p.id === productId && p.is_active === 1);
}

/**
 * Resolves a product from Cloudflare D1 first, falling back to the catalog seed
 */
export async function resolveProductFromDbOrCatalog(
  db: any,
  productId: string
): Promise<MarketplaceProduct | null> {
  if (db) {
    try {
      const row: any = await db
        .prepare('SELECT * FROM marketplace_products WHERE id = ? AND is_active = 1')
        .bind(productId)
        .first();
      if (row) {
        return {
          id: row.id,
          title: row.title,
          description: row.description,
          category: row.category,
          categoryLabel: getCategoryLabel(row.category),
          price_ngn: Number(row.price_ngn),
          vendor_id: row.vendor_id,
          vendor_name: row.vendor_name,
          commission_rate: Number(row.commission_rate ?? 0.3),
          r2_file_key: row.r2_file_key || '',
          delivery_type: row.delivery_type || 'download',
          badge: row.badge || 'Digital',
          is_active: Number(row.is_active ?? 1),
        };
      }
    } catch {
      // Fallback below
    }
  }
  return getCatalogProductById(productId) || null;
}

export function getCategoryLabel(category: string): string {
  switch (category) {
    case 'digital_product':
      return 'Digital Products';
    case 'premium_tool':
      return 'Premium Tools';
    case 'football_analysis':
      return 'Football Analysis';
    case 'casino_education':
      return 'Casino Analysis Education';
    case 'screenshot_package':
      return 'Screenshot Packages';
    case 'subscription':
      return 'Premium Subscriptions';
    case 'vendor_package':
      return 'Vendor Packages';
    default:
      return 'Marketplace';
  }
}
