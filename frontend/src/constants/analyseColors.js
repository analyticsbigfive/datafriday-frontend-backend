/**
 * Palette officielle AnalyseView — alignée sur la maquette Figma.
 */

export const SHOP_COLORS = [
  '#5B8DEF', '#FF8A65', '#81C784', '#EF5350', '#AB47BC',
  '#FFD54F', '#F48FB1', '#4DD0E1', '#A1887F', '#7986CB',
  '#4DB6AC', '#FF7043', '#9575CD', '#AED581', '#FFB74D',
  '#64B5F6', '#E57373', '#BA68C8', '#4FC3F7', '#DCE775',
  '#F06292', '#4DD0E1', '#FFD180',
]

// Couleurs des types de PdV keyées sur l'enum canonique (cf. constants/shopTypes.js,
// source unique partagée avec la normalisation Analyse). Le vocabulaire `fnb-*`
// historique était mort (aucune donnée ne l'émettait).
export { SHOP_TYPE_COLORS } from '@/constants/shopTypes'

export const SHOP_AREA_COLORS = {
  'Ground Floor': '#5B8DEF',
  'Forecourt': '#FF8A65',
}

export const MENU_ITEM_TYPE_COLORS = {
  Beverage: '#5B8DEF',
  Food: '#FF8A65',
  Combo: '#66BB6A',
  Glasses: '#EF5350',
}

export const MENU_CATEGORY_CARDS = {
  FOOD: {
    label: 'FOOD',
    icon: '🍕',
    gradient: 'linear-gradient(135deg, #FF6E4A 0%, #FF8A65 100%)',
  },
  BEVERAGE: {
    label: 'BEVERAGE',
    icon: '🍺',
    gradient: 'linear-gradient(135deg, #66BB6A 0%, #81C784 100%)',
  },
  BEER: {
    label: 'BEER',
    icon: '🍺',
    gradient: 'linear-gradient(135deg, #FFA726 0%, #FFB74D 100%)',
  },
  UNCLASSIFIED: {
    label: 'UNCLASSIFIED',
    icon: '?',
    gradient: 'linear-gradient(135deg, #64748B 0%, #94A3B8 100%)',
  },
}

export const RANK_COLORS = {
  1: '#FFD700', // or
  2: '#C0C0C0', // argent
  default: '#9E9E9E',
}

export const KPI_CARDS = [
  {
    key: 'revenue',
    label: 'CA',
    labelKey: 'anHeaderKpiRevenue',
    bg: '#F0FDF4',
    accent: '#10B981',
    labelColor: '#059669',
    icon: 'mdi-trending-up',
    variationColor: '#10B981',
  },
  {
    key: 'perCapita',
    label: 'PERCAP',
    labelKey: 'anHeaderKpiPerCap',
    bg: '#FDF2F8',
    accent: '#EC4899',
    labelColor: '#DB2777',
    icon: 'mdi-account-cash',
    variationColor: '#EC4899',
  },
  {
    key: 'margin',
    label: 'MARGE',
    labelKey: 'anKpiCardMargin',
    bg: '#EFF6FF',
    accent: '#3B82F6',
    labelColor: '#2563EB',
    icon: 'mdi-percent-outline',
    variationColor: '#3B82F6',
  },
  {
    key: 'transactionRate',
    label: 'tx/min',
    labelKey: 'anKpiCardTransactionRate',
    bg: '#FAF5FF',
    accent: '#A855F7',
    labelColor: '#7E22CE',
    icon: 'mdi-pulse',
    variationColor: '#A855F7',
  },
]
