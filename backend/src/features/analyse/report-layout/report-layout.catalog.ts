/** Catalogue des éléments de la page 2 du rapport J+1 (miroir de frontend/src/utils/reportJ1Page2Catalog.js). */
export const REPORT_LAYOUT_KINDS = ['j1-page2'] as const;
export type ReportLayoutKind = (typeof REPORT_LAYOUT_KINDS)[number];

export const GRID_COLS = 2;
export const GRID_ROWS = 3;
export const MAX_SLOTS = 6;
export const MAX_LAYOUT_BYTES = 64 * 1024;

export const SLOT_SIZES: Record<string, { w: number; h: number }> = {
  'kpi-bar': { w: 2, h: 1 },
  'widget-bar': { w: 2, h: 1 },
  donut: { w: 1, h: 1 },
  'perf-table': { w: 1, h: 2 },
  'revenue-bars': { w: 2, h: 2 },
  'items-by-shop': { w: 2, h: 2 },
};

/** Variantes autorisées par kind ; absent du tableau = pas de variante. */
export const SLOT_VARIANTS: Record<string, readonly string[]> = {
  donut: [
    'shop', 'shopType', 'shopArea', 'articleType', 'articleCategory', 'displayName',
    'industrial', 'brand', 'supplier', 'promotion', 'promotionType', 'basketMix', 'basketMixItem',
  ],
  'perf-table': ['shops', 'events', 'items'],
};

/** Clés de filtre figées dans un slot, avec la forme attendue de la valeur. */
export const ARRAY_FILTER_KEYS = [
  'selectedShopIds', 'selectedShopTypes', 'selectedShopAreas',
  'selectedMenuItemIds', 'selectedMenuItemTypes', 'selectedMenuItemCategories',
  'selectedBrands', 'selectedIndustrials', 'selectedSuppliers',
  'selectedPromotions', 'selectedPromotionTypes',
] as const;
export const TIME_RANGE_KEY = 'selectedTimeRange';
export const CONFIGURATION_KEY = 'selectedConfigurationId';
