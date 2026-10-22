/**
 * Période du Cost tracking : mêmes options que l'Analyse (constants/dateRangePresets),
 * converties en dates YYYY-MM-DD. « Tout l'historique » remonte à MAX_PERIOD_DAYS jours.
 */
import { DATE_RANGE_PRESETS, PRESET_I18N_KEYS } from '@/constants/dateRangePresets'
import { resolveDateBounds } from '@/utils/analyseDateBounds'

export const MAX_PERIOD_DAYS = 1830
export const DEFAULT_PERIOD = 'last12months'

/** Valeurs proposées (celles de l'Analyse, sans « Personnalisée » gérée à part). */
export const PERIOD_PRESETS = DATE_RANGE_PRESETS.map((p) => p.value).filter((v) => v !== 'custom')

export const periodI18nKey = (value) => PRESET_I18N_KEYS[value] || 'anRangeCustom'

const pad = (n) => String(n).padStart(2, '0')
const toDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** { from, to } (YYYY-MM-DD) d'un preset, `now` injectable pour les tests. */
export function rangeForPreset(value, now = new Date()) {
  const preset = PERIOD_PRESETS.includes(value) ? value : DEFAULT_PERIOD
  const { start, end } = resolveDateBounds({ timeRange: preset }, { now })
  const to = toDay(end || now)
  const floor = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (MAX_PERIOD_DAYS - 1))
  const from = toDay(start && start > floor ? start : floor)
  return { from, to }
}
