/**
 * useForecastModificationsForm : brouillon du formulaire de modifications de l'outil Forecast
 * (drawer Comparaison), sans rendu.
 *
 * Deux états : la SAISIE en cours (type, cible, valeur, mode) et la LISTE des modifications
 * déjà ajoutées. Les règles (validation, une modification par cible, nombre minimal pour
 * appliquer) viennent du modèle pur utils/forecastModificationModel ; ici on ne fait que les
 * orchestrer.
 *
 * À instancier dans un composant qui SURVIT à la fermeture du drawer (AnalyseView) : le
 * brouillon et la liste restent quand on ferme puis rouvre le drawer.
 *
 * @param {Object} p
 * @param {import('vue').Ref<Array>|Array} p.articleRecords  Records au grain article du principal.
 * @param {import('vue').Ref<Map>|Map} [p.catalogById]  menuItemId (chaîne) vers Menu Item.
 * @param {import('vue').Ref<string|null>|string|null} [p.spaceId]  Espace courant.
 */
import { computed, reactive, ref, unref } from 'vue'
import { forecastTargetOptions } from '@/utils/forecastTargetOptions'
import {
  FORECAST_MODIFICATION_TYPES,
  PRICE_MODIFICATION_TYPES,
  addModification,
  canApplyModifications,
  createModification,
  modificationKey,
  removeModification,
  validateModification,
} from '@/utils/forecastModificationModel'
import { ELASTICITY_DEFAULT, clampElasticity } from '@/utils/forecastElasticity'
import { SCOPE_DEFAULT, normalizeScope } from '@/utils/forecastScope'

const T = FORECAST_MODIFICATION_TYPES

/** Saisie vide d'un type : cible vide, curseurs à 0, prix vide, mode Percap à choisir. */
function emptyDraft(type) {
  const isPrice = type === T.ITEM_PRICE
  return { type, target: '', value: isPrice ? '' : 0, mode: null }
}

export function useForecastModificationsForm({ articleRecords, catalogById = null, spaceId = null } = {}) {
  const options = computed(() =>
    forecastTargetOptions({
      articleRecords: unref(articleRecords),
      catalogById: unref(catalogById),
      spaceId: unref(spaceId),
    }),
  )

  const draft = reactive(emptyDraft(T.ITEM_PRICE))
  const list = ref([])
  // Modification retirée par la dernière saisie de même cible (information discrète).
  const replaced = ref(null)
  // Élasticité prix, un réglage pour toute la liste (0 : les quantités ne bougent pas).
  const elasticity = ref(ELASTICITY_DEFAULT)

  function setElasticity(v) {
    elasticity.value = clampElasticity(v)
  }

  // Portée de toute la liste : 'all' (tous les events affichés, défaut) ou 'predicted'.
  const scope = ref(SCOPE_DEFAULT)

  function setScope(v) {
    scope.value = normalizeScope(v)
  }

  function resetDraft(type = draft.type) {
    Object.assign(draft, emptyDraft(type))
  }

  /** Change le type : la saisie repart de zéro (cible, valeur et mode ne se transposent pas). */
  function setType(type) {
    replaced.value = null
    resetDraft(type)
  }

  /** Prix TTC actuel d'un article chiffrable, arrondi au centime ('' si inconnu). */
  function currentPriceOf(id) {
    const item = options.value.items.find((i) => i.id === id)
    const ttc = item && item.priceable ? Number(item.currentTtc) : NaN
    return Number.isFinite(ttc) && ttc > 0 ? Math.round(ttc * 100) / 100 : ''
  }

  /** Met à jour des champs de la saisie : { target?, value?, mode? }. */
  function patch(fields = {}) {
    if ('target' in fields) {
      draft.target = fields.target == null ? '' : String(fields.target)
      // Prix : un nouvel article choisi pré-remplit le champ avec son prix TTC actuel.
      if (draft.type === T.ITEM_PRICE && !('value' in fields)) draft.value = currentPriceOf(draft.target)
    }
    if ('value' in fields) draft.value = fields.value
    if ('mode' in fields) draft.mode = fields.mode
  }

  /** La cible choisie existe dans les options courantes (et l'article est chiffrable). */
  function isKnownTarget() {
    const { items, categories, types } = options.value
    if (draft.type === T.ITEM_PRICE) return items.some((i) => i.id === draft.target && i.priceable)
    if (draft.type === T.CATEGORY_PCT) return categories.includes(draft.target)
    if (draft.type === T.TYPE_PCT) return types.includes(draft.target)
    return true
  }

  const canAdd = computed(() => validateModification({ ...draft }).valid && isKnownTarget())

  /** Ajoute la saisie à la liste (remplace une modification de même cible), puis la remet à zéro. */
  function add() {
    if (!canAdd.value) return false
    const modification = createModification(draft.type, {
      target: draft.target,
      value: draft.value,
      mode: draft.mode,
    })
    const key = modificationKey(modification)
    replaced.value = list.value.find((m) => modificationKey(m) === key) || null
    list.value = addModification(list.value, modification)
    resetDraft()
    return true
  }

  function remove(id) {
    replaced.value = null
    list.value = removeModification(list.value, id)
  }

  /** Tout effacer : la liste, la saisie en cours, l'élasticité et la portée. */
  function clear() {
    replaced.value = null
    list.value = []
    elasticity.value = ELASTICITY_DEFAULT
    scope.value = SCOPE_DEFAULT
    resetDraft()
  }

  /** L'élasticité n'a d'effet que s'il y a au moins une modification de prix dans la liste. */
  const hasPriceModification = computed(() =>
    list.value.some((m) => PRICE_MODIFICATION_TYPES.includes(m.type)),
  )

  const canApply = computed(() => canApplyModifications(list.value))

  /** Modèle émis par `run` : copie indépendante de l'état du brouillon. */
  function toRunModel() {
    return {
      kind: 'forecast',
      modifications: list.value.map((m) => ({ ...m })),
      elasticity: elasticity.value,
      scope: scope.value,
    }
  }

  return {
    options, draft, list, replaced, elasticity, scope, hasPriceModification,
    setType, patch, setElasticity, setScope, canAdd, add, remove, clear, canApply, toRunModel,
  }
}
