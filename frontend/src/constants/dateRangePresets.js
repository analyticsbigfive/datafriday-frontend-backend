// Centralized Date Range Preset Configuration
// Vue port aligned with versionReact/Datafriday-main/src/app/constants/dateRangePresets.ts.
// Étend l'original React avec un label FR et un helper getDateRangePresets(toolbox).

export const DATE_RANGE_PRESETS = [
  { value: 'all', label: 'All Time', labelFr: "Tout l'historique" },
  { value: 'today', label: 'Today', labelFr: "Aujourd'hui" },
  { value: 'yesterday', label: 'Yesterday', labelFr: 'Hier' },
  { value: 'thisweek', label: 'This Week', labelFr: 'Cette semaine' },
  { value: 'week', label: 'Last 7 Days', labelFr: '7 derniers jours' },
  { value: 'lastweek', label: 'Last Week', labelFr: 'Semaine dernière' },
  { value: 'thismonth', label: 'This Month', labelFr: 'Ce mois-ci' },
  { value: 'month', label: 'Last 30 Days', labelFr: '30 derniers jours' },
  { value: 'lastmonth', label: 'Last Month', labelFr: 'Mois dernier' },
  { value: 'thisquarter', label: 'This Quarter', labelFr: 'Ce trimestre' },
  { value: 'quarter', label: 'Last 90 Days', labelFr: '90 derniers jours' },
  { value: 'lastquarter', label: 'Last Quarter', labelFr: 'Trimestre dernier' },
  { value: 'thisyear', label: 'This Year', labelFr: 'Cette année' },
  { value: 'year', label: 'Last Year', labelFr: 'Année dernière' },
  { value: 'custom', label: 'Custom Range', labelFr: 'Période personnalisée' }
];

// Predict View Date Range Presets (future-focused)
// 'all' en tête : défaut sans filtre de période (tous les events prédits).
export const PREDICT_DATE_RANGE_PRESETS = [
  { value: 'all', label: 'All Time', labelFr: "Tout l'historique" },
  { value: 'thismonth', label: 'This Month', labelFr: 'Ce mois-ci' },
  { value: 'nextmonth', label: 'Next Month', labelFr: 'Mois prochain' },
  { value: 'thisquarter', label: 'This Quarter', labelFr: 'Ce trimestre' },
  { value: 'nextquarter', label: 'Next Quarter', labelFr: 'Trimestre prochain' },
  { value: 'thisyear', label: 'This Year', labelFr: 'Cette année' },
  { value: 'nextyear', label: 'Next Year', labelFr: 'Année prochaine' },
  { value: 'custom', label: 'Custom Range', labelFr: 'Période personnalisée' }
];

// Extract just the values for validation
export const VALID_DATE_RANGE_VALUES = DATE_RANGE_PRESETS.map(p => p.value);
export const VALID_PREDICT_DATE_RANGE_VALUES = PREDICT_DATE_RANGE_PRESETS.map(p => p.value);

// Create a map for easy label lookup
export const DATE_RANGE_LABEL_MAP = Object.fromEntries(
  DATE_RANGE_PRESETS.map(p => [p.value, p.label])
);

export const PREDICT_DATE_RANGE_LABEL_MAP = Object.fromEntries(
  PREDICT_DATE_RANGE_PRESETS.map(p => [p.value, p.label])
);

export const DATE_RANGE_LABEL_FR_MAP = Object.fromEntries(
  DATE_RANGE_PRESETS.map(p => [p.value, p.labelFr])
);

export const PREDICT_DATE_RANGE_LABEL_FR_MAP = Object.fromEntries(
  PREDICT_DATE_RANGE_PRESETS.map(p => [p.value, p.labelFr])
);

// Filter out 'custom' for preferences (not applicable as a default)
export const PREFERENCE_DATE_RANGE_PRESETS = DATE_RANGE_PRESETS.filter(p => p.value !== 'custom');
export const PREFERENCE_PREDICT_DATE_RANGE_PRESETS = PREDICT_DATE_RANGE_PRESETS.filter(p => p.value !== 'custom');

// Map value → clé i18n (bandeau + dropdown période). Consommé par FilterPanel
// (titres presets) et le getter activeFilterChips (label de période).
export const PRESET_I18N_KEYS = {
  all: 'anRangeAll',
  today: 'anRangeToday',
  yesterday: 'anRangeYesterday',
  thisweek: 'anRangeThisWeek',
  week: 'anRangeLast7Days',
  lastweek: 'anRangeLastWeek',
  thismonth: 'anRangeThisMonth',
  month: 'anRangeLast30Days',
  lastmonth: 'anRangeLastMonth',
  nextmonth: 'anRangeNextMonth',
  thisquarter: 'anRangeThisQuarter',
  quarter: 'anRangeLast90Days',
  lastquarter: 'anRangeLastQuarter',
  thisyear: 'anRangeThisYear',
  year: 'anRangeLastYear',
  nextyear: 'anRangeNextYear',
  custom: 'anRangeCustom',
}

/**
 * Returns the active preset list for the given toolbox.
 * @param {'analyse'|'predict'|'event-predict'|'inventory'} toolbox
 */
export function getDateRangePresets(toolbox) {
  return toolbox === 'predict' || toolbox === 'event-predict'
    ? PREDICT_DATE_RANGE_PRESETS
    : DATE_RANGE_PRESETS;
}