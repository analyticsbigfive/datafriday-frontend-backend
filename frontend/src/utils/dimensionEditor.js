/**
 * dimensionEditor : modèle de l'éditeur de dimension affiché dans la colonne droite quand on clique
 * une puce de filtre (FilterEditorPanel). Deux sources d'options :
 *   - une liste dynamique lue d'un getter du store (équipes, PdV, types...) : valeurs = libellés ;
 *   - une liste de valeurs techniques traduites (jours 'mon'..'sun', météo 'clear'..'storm') :
 *     l'éditeur reçoit alors un `labelFn` (valeur -> texte) et un `iconFn` éventuel.
 */
import { DAY_KEYS, DAY_LABEL_KEYS, WEATHER_CATEGORIES, WEATHER_LABEL_KEYS, WEATHER_ICONS } from '@/utils/eventDayWeatherFilters'

/** Dimensions dont les valeurs sont des clés techniques à traduire. */
export const VALUE_EDITORS = {
  selectedDaysOfWeek: { items: DAY_KEYS, labelKeys: DAY_LABEL_KEYS, icons: null },
  selectedWeather: { items: WEATHER_CATEGORIES, labelKeys: WEATHER_LABEL_KEYS, icons: WEATHER_ICONS },
}

/**
 * @param {string} key  clé d'état du filtre (= chip.key)
 * @param {{ labelKey: string, getter?: string }} def  entrée de DIMENSION_EDITORS
 * @param {{ t: Function, getters: object, filters: object }} ctx  getters = store.getters
 * @returns {{ label: string, items: Array, selected: Array, labelFn: Function|null, iconFn: Function|null }}
 */
export function resolveDimensionEditor(key, def, { t, getters, filters }) {
  const value = VALUE_EDITORS[key]
  return {
    label: t(def.labelKey),
    items: value ? value.items : getters['analyse/' + def.getter] || [],
    selected: filters?.[key] || [],
    labelFn: value ? (k) => t(value.labelKeys[k] || k) : null,
    iconFn: value && value.icons ? (k) => value.icons[k] || '' : null,
  }
}
