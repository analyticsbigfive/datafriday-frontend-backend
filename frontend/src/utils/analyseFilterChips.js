/**
 * analyseFilterChips : construction pure de la liste des puces de filtres
 * actifs du rapport Analyse (extrait du getter activeFilterChips du store).
 */
import { NOT_SET_KEY } from '@/utils/articleDimensionBreakdown'
import {
  DATE_RANGE_LABEL_FR_MAP,
  PREDICT_DATE_RANGE_LABEL_FR_MAP,
  PRESET_I18N_KEYS,
} from '@/constants/dateRangePresets'
import {
  isTemperatureFilterActive,
  DEFAULT_TEMPERATURE_RANGE,
  DAY_LABEL_KEYS,
  WEATHER_LABEL_KEYS,
} from '@/utils/eventDayWeatherFilters'

/**
 * @param {object} filters  state.filters ou filtres de comparaison
 * @param {(key: string) => string} translate  fonction de traduction (clé -> texte)
 * @param {{activeConfiguration?: object|null, seasons?: Array, defaultTimeRange?: string}} [context]
 *   defaultTimeRange : preset par défaut (pas de puce Période tant qu'il est actif).
 *   formatDate : mise en forme des bornes de dates de la puce « Dates » (défaut : valeur brute, le
 *   principal est inchangé ; la comparaison passe un formateur JJ/MM/AAAA).
 * @returns {Array<{key: string, label: string, clearValue?: any}>}
 */
export function buildActiveFilterChips(filters, translate, context = {}) {
  const { activeConfiguration = null, seasons = [], defaultTimeRange, formatDate = (v) => v } = context
  const T = translate
  const chips = []
  if (filters.selectedConfigurationId && activeConfiguration) {
    chips.push({
      key: 'selectedConfigurationId',
      label: `${T('anConfiguration')}: ${activeConfiguration.name}`,
      clearValue: null,
    })
  }
  // selectedEventIds : PAS de chip ici (FilterSummary a son chip dédié).
  if (filters.selectedShopIds.length)
    chips.push({ key: 'selectedShopIds', label: `${filters.selectedShopIds.length} ${T('anShops')}` })
  if (filters.selectedShopTypes.length)
    chips.push({ key: 'selectedShopTypes', label: `${T('anTypes')}: ${filters.selectedShopTypes.join(', ')}` })
  if (filters.selectedShopAreas.length)
    chips.push({ key: 'selectedShopAreas', label: `${T('anZones')}: ${filters.selectedShopAreas.join(', ')}` })
  if (filters.selectedMenuItemTypes.length)
    chips.push({ key: 'selectedMenuItemTypes', label: `${T('anItemType')}: ${filters.selectedMenuItemTypes.join(', ')}` })
  if (filters.selectedMenuItemCategories.length)
    chips.push({ key: 'selectedMenuItemCategories', label: `${T('anCategory')}: ${filters.selectedMenuItemCategories.join(', ')}` })
  // Dimensions article rendement : « Non renseigné » est une clé technique, traduite ici.
  const dimLabel = (v) => (v === NOT_SET_KEY ? T('anNotSet') : v === 'promo' ? T('anPromoYes') : v === 'normal' ? T('anPromoNo') : v)
  for (const [key, labelKey] of [
    ['selectedBrands', 'anFilterBrand'],
    ['selectedIndustrials', 'anFilterIndustrial'],
    ['selectedSuppliers', 'anFilterSupplier'],
    ['selectedPromotions', 'anFilterPromotion'],
    ['selectedPromotionTypes', 'anFilterPromotionType'],
  ]) {
    if (filters[key]?.length) chips.push({ key, label: `${T(labelKey)}: ${filters[key].map(dimLabel).join(', ')}` })
  }
  if (filters.selectedEventCategories.length)
    chips.push({ key: 'selectedEventCategories', label: `${T('anEventCategory')}: ${filters.selectedEventCategories.join(', ')}` })
  if (filters.selectedEventTypes.length)
    chips.push({ key: 'selectedEventTypes', label: `${T('anEventType')}: ${filters.selectedEventTypes.join(', ')}` })
  if (filters.selectedTeams.length)
    chips.push({ key: 'selectedTeams', label: `${T('anTeam')}: ${filters.selectedTeams.join(', ')}` })
  if (filters.selectedSponsors.length)
    chips.push({ key: 'selectedSponsors', label: `${T('anSponsor')}: ${filters.selectedSponsors.join(', ')}` })
  if (filters.selectedSubcategories.length)
    chips.push({ key: 'selectedSubcategories', label: `${T('anSubcategory')}: ${filters.selectedSubcategories.join(', ')}` })
  if (filters.selectedSessions.length)
    chips.push({ key: 'selectedSessions', label: `${T('anSessions')}: ${filters.selectedSessions.join(', ')}` })
  if (filters.selectedDoorsOpenings.length)
    chips.push({ key: 'selectedDoorsOpenings', label: `${T('anDoorsOpening')}: ${filters.selectedDoorsOpenings.join(', ')}` })
  if (filters.selectedShowTimes.length)
    chips.push({ key: 'selectedShowTimes', label: `${T('anShowTime')}: ${filters.selectedShowTimes.join(', ')}` })
  // Jour / météo / température : mêmes puces que les autres dimensions.
  if (filters.selectedDaysOfWeek?.length)
    chips.push({ key: 'selectedDaysOfWeek', label: `${T('anDaysOfWeek')}: ${filters.selectedDaysOfWeek.map((k) => T(DAY_LABEL_KEYS[k] || k)).join(', ')}` })
  if (filters.selectedWeather?.length)
    chips.push({ key: 'selectedWeather', label: `${T('anWeatherShort')}: ${filters.selectedWeather.map((k) => T(WEATHER_LABEL_KEYS[k] || k)).join(', ')}` })
  if (isTemperatureFilterActive(filters.temperatureRange))
    chips.push({
      key: 'temperatureRange',
      label: `${T('anTempShort')}: ${filters.temperatureRange[0]} ${T('anTempTo')} ${filters.temperatureRange[1]} °C`,
      clearValue: [...DEFAULT_TEMPERATURE_RANGE],
    })
  if (filters.selectedPerformerNames.length)
    chips.push({ key: 'selectedPerformerNames', label: `${T('anPerformer')}: ${filters.selectedPerformerNames.join(', ')}` })
  if (filters.selectedVisitingTeams.length)
    chips.push({ key: 'selectedVisitingTeams', label: `${T('anVisitingTeam')}: ${filters.selectedVisitingTeams.join(', ')}` })
  if (filters.selectedOpeningActs.length)
    chips.push({ key: 'selectedOpeningActs', label: `${T('anOpeningAct')}: ${filters.selectedOpeningActs.join(', ')}` })
  if (filters.selectedIntermissions.length)
    chips.push({ key: 'selectedIntermissions', label: `${T('anIntermission')}: ${filters.selectedIntermissions.map((v) => v === 'yes' ? T('anYes') : T('anNo')).join(', ')}` })
  // Filtre de période (preset dates) : puce visible dès que le preset diffère du
  // défaut, sinon le filtre est invisible dans le bandeau. clearValue = défaut.
  if (filters.timeRange && filters.timeRange !== defaultTimeRange) {
    // Saison (`season:<id>`) : libellé = nom de la saison.
    const seasonId = String(filters.timeRange).startsWith('season:')
      ? String(filters.timeRange).slice('season:'.length)
      : null
    const seasonName = seasonId
      ? (seasons || []).find((s) => s.id === seasonId)?.name || seasonId
      : null
    const rangeLabel = seasonName
      || (PRESET_I18N_KEYS[filters.timeRange] && T(PRESET_I18N_KEYS[filters.timeRange]))
      || DATE_RANGE_LABEL_FR_MAP[filters.timeRange]
      || PREDICT_DATE_RANGE_LABEL_FR_MAP[filters.timeRange]
      || filters.timeRange
    const label = filters.timeRange === 'custom'
      ? `${T('anChipDates')} : ${formatDate(filters.startDate) || '—'} → ${formatDate(filters.endDate) || '—'}`
      : `${T('anPeriod')} : ${rangeLabel}`
    chips.push({ key: 'timeRange', label, clearValue: defaultTimeRange })
  }
  if (filters.selectedTimeRange && (filters.selectedTimeRange.start || filters.selectedTimeRange.end)) {
    const s = filters.selectedTimeRange.start || '—'
    const e = filters.selectedTimeRange.end || '—'
    chips.push({
      key: 'selectedTimeRange',
      label: `${T('anChipTimeRange')} : ${s} → ${e}`,
      clearValue: { start: null, end: null },
    })
  }
  return chips
}
