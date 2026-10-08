// src/composables/useKitchenOptions.js
//
// Choix de la cuisine sur les fiches Composant et Menu Item (demande Bertrand
// 2026-10-08) : « Cuisine Locale » ou une cuisine de Settings > Menu F&B > Cuisines.
// Même liste et même codage sur les deux fiches.
//
// Côté serveur : Local = kitchenType 'Local' ; une cuisine = kitchenType 'Central' +
// kitchenId (cf. backend shared/utils/resolve-kitchen.ts). Dans le champ, une seule
// valeur : 'local', l'id de la cuisine, ou null.

import { computed, onMounted, unref } from 'vue'
import { useStore } from 'vuex'
import { useI18n } from '@/i18n/useI18n'

export const KITCHEN_LOCAL = 'local'

/** { kitchenType, kitchenId } (API) -> valeur du champ. */
export function kitchenChoiceFrom(entity) {
  if (entity?.kitchenId) return String(entity.kitchenId)
  if (entity?.kitchenType === 'Local') return KITCHEN_LOCAL
  return null
}

/** Valeur du champ -> { kitchenType, kitchenId } pour l'API. */
export function kitchenPayloadFrom(choice) {
  if (!choice) return { kitchenType: null, kitchenId: null }
  if (choice === KITCHEN_LOCAL) return { kitchenType: 'Local', kitchenId: null }
  return { kitchenType: 'Central', kitchenId: String(choice) }
}

/**
 * Options du champ : « Cuisine Locale » puis les cuisines. Si la fiche a des espaces,
 * seules les cuisines rattachées à l'un d'eux sont proposées ; la valeur actuelle
 * l'est toujours (pas de valeur qui disparaît du champ), avec son nom même si la
 * cuisine est hors des espaces de l'utilisateur (`currentKitchen` = relation
 * `kitchen { id, name }` renvoyée par l'API avec la fiche).
 */
export function buildKitchenOptions(kitchens, spaceIds, current, t, currentKitchen = null) {
  const scope = (spaceIds || []).map(String)
  const visible = (kitchens || []).filter((k) => {
    if (current && String(k.id) === String(current)) return true
    if (!scope.length) return true
    return (k.sites || []).some((sid) => scope.includes(String(sid)))
  })
  if (current && current !== KITCHEN_LOCAL && !visible.some((k) => String(k.id) === String(current))) {
    visible.push({ id: current, name: currentKitchen?.name || current })
  }
  return [
    { value: KITCHEN_LOCAL, title: t('kitchenLocal') },
    ...visible.map((k) => ({ value: String(k.id), title: k.name })),
  ]
}

/**
 * @param {import('vue').Ref<string[]>|(() => string[])} [spaceIds] espaces de la fiche
 * @param {import('vue').Ref<string|null>|(() => string|null)} [current] valeur actuelle
 */
export function useKitchenOptions(spaceIds, current, currentKitchen) {
  const store = useStore()
  const { t } = useI18n()
  const read = (src) => (typeof src === 'function' ? src() : unref(src))

  onMounted(() => {
    store.dispatch('kitchens/fetchKitchens').catch((e) => {
      console.warn('[kitchens] liste indisponible:', e?.message)
    })
  })

  const kitchens = computed(() => store.getters['kitchens/kitchens'] || [])
  const options = computed(() =>
    buildKitchenOptions(kitchens.value, read(spaceIds), read(current), t, read(currentKitchen)),
  )

  return { kitchens, options }
}

const LOCAL_LABELS = ['local', 'cuisine locale', 'local kitchen']

/** Libellé CSV de la cuisine : 'Local', le nom de la cuisine, ou ''. */
export function kitchenCsvLabel(entity, kitchens) {
  const choice = kitchenChoiceFrom(entity)
  if (!choice) return ''
  if (choice === KITCHEN_LOCAL) return 'Local'
  return (kitchens || []).find((k) => String(k.id) === choice)?.name || ''
}

/**
 * Libellé CSV -> valeur du champ : « Local » (ou « Cuisine Locale ») ou le nom d'une
 * cuisine (insensible à la casse). Inconnu : null (champ vide, jamais une erreur).
 */
export function kitchenChoiceFromCsv(label, kitchens) {
  const key = String(label || '').trim().toLowerCase()
  if (!key) return null
  if (LOCAL_LABELS.includes(key)) return KITCHEN_LOCAL
  // Ancienne valeur « Central » : la cuisine créée par la reprise du 2026-10-08.
  const name = key === 'central' ? 'cuisine centrale' : key
  const kitchen = (kitchens || []).find((k) => String(k.name || '').trim().toLowerCase() === name)
  return kitchen ? String(kitchen.id) : null
}
