import type { AssetType } from '../../types';

/**
 * Weighted keyword rules for deterministic Outlet/Location → asset classification.
 * Higher weight = more specific. Classifier takes the best score per asset type,
 * then picks the asset with the highest score (specificity wins ties by weight).
 */
export interface AssetKeywordRule {
  assetType: AssetType;
  keyword: string;
  weight: number;
}

export const ASSET_KEYWORD_RULES: readonly AssetKeywordRule[] = [
  // Bib Tap
  { assetType: 'Bib Tap', keyword: 'bib tap', weight: 100 },
  { assetType: 'Bib Tap', keyword: 'bib-tap', weight: 100 },
  { assetType: 'Bib Tap', keyword: 'garden tap', weight: 90 },
  { assetType: 'Bib Tap', keyword: 'external tap', weight: 90 },
  { assetType: 'Bib Tap', keyword: 'bahçe musluk', weight: 90 },
  { assetType: 'Bib Tap', keyword: 'bib', weight: 70 },

  // WHB
  { assetType: 'WHB', keyword: 'wash hand basin', weight: 100 },
  { assetType: 'WHB', keyword: 'whb', weight: 100 },
  { assetType: 'WHB', keyword: 'hand basin', weight: 90 },
  { assetType: 'WHB', keyword: 'sink', weight: 60 },

  // WC
  { assetType: 'WC', keyword: 'water closet', weight: 100 },
  { assetType: 'WC', keyword: 'wc', weight: 100 },
  { assetType: 'WC', keyword: 'tuvalet', weight: 80 },
  { assetType: 'WC', keyword: 'toilet', weight: 50 },
  { assetType: 'WC', keyword: 'toilets', weight: 50 },
  { assetType: 'WC', keyword: 'restroom', weight: 50 },
  { assetType: 'WC', keyword: 'restrooms', weight: 50 },
  { assetType: 'WC', keyword: 'washroom', weight: 50 },
  { assetType: 'WC', keyword: 'washrooms', weight: 50 },

  // Shower (Emergency Shower is a separate type below — longer phrase wins on ties)
  { assetType: 'Shower', keyword: 'shower', weight: 100 },
  { assetType: 'Shower', keyword: 'duş', weight: 100 },
  { assetType: 'Shower', keyword: 'bath+sh', weight: 90 },
  { assetType: 'Shower', keyword: 'bathroom', weight: 50 },
  { assetType: 'Shower', keyword: 'bathrooms', weight: 50 },
  { assetType: 'Shower', keyword: 'en-suite', weight: 50 },
  { assetType: 'Shower', keyword: 'ensuite', weight: 50 },

  // Kitchen Outlet
  { assetType: 'Kitchen Outlet', keyword: 'kitchenette', weight: 80 },
  { assetType: 'Kitchen Outlet', keyword: 'kitchen', weight: 60 },

  // Expansion Vessel
  { assetType: 'Expansion Vessel', keyword: 'expansion vessel', weight: 100 },
  { assetType: 'Expansion Vessel', keyword: 'genleşme tank', weight: 100 },

  // TMV
  { assetType: 'TMV', keyword: 'tmv', weight: 100 },

  // Other common glossary assets (for Outlet/Location text that names them)
  { assetType: 'Washing Machine', keyword: 'washing machine', weight: 100 },
  { assetType: 'Washing Machine', keyword: 'wm', weight: 90 },
  { assetType: 'Dishwasher', keyword: 'dishwasher', weight: 100 },
  { assetType: 'Dishwasher', keyword: 'idwm', weight: 100 },
  { assetType: 'Dishwasher', keyword: 'dw', weight: 70 },
  { assetType: 'Water Boiler', keyword: 'water boiler', weight: 100 },
  { assetType: 'Water Boiler', keyword: 'wb', weight: 70 },
  { assetType: 'Calorifier', keyword: 'calorifier', weight: 100 },
  { assetType: 'Spray Outlet', keyword: 'spray head', weight: 100 },
  { assetType: 'Spray Outlet', keyword: 'spray outlet', weight: 100 },
  { assetType: 'Emergency Shower', keyword: 'emergency shower', weight: 100 },
  { assetType: 'Emergency Eyewash', keyword: 'emergency eyewash', weight: 100 },
  { assetType: 'Hot Drinks Machine', keyword: 'hot drinks machine', weight: 100 },
  { assetType: 'Hot Drinks Machine', keyword: 'hdm', weight: 90 },
  { assetType: 'Ice Machine', keyword: 'ice machine', weight: 100 },
  { assetType: 'Chilled Water Fountain', keyword: 'chilled water fountain', weight: 100 },
  { assetType: 'Chilled Water Fountain', keyword: 'cwf', weight: 90 },
  { assetType: 'Water Fountain', keyword: 'water fountain', weight: 100 },
];

/** Keywords for one asset type — used when stripping fixture words from room text. */
export function keywordsForAssetType(assetType: AssetType): string[] {
  const unique = new Set(
    ASSET_KEYWORD_RULES.filter((rule) => rule.assetType === assetType).map(
      (rule) => rule.keyword,
    ),
  );
  return [...unique].sort((a, b) => b.length - a.length);
}
