// src/composables/useLogisticVentilation.js
//
// Mode « Ventilation » de l'écran Logistique (chantier logistic_ventilation, v2 du
// 2026-10-09) : feuilles de réarmement des matchs choisis, reste à déposer, dépôts
// « Ventilation » (confirmation, liste, annulation), index « À déposer » des fiches
// PDV, bascule Par PdV / Par article et filtre Fournisseur. Sorti de
// SpaceLogisticView.vue pour ne pas grossir la vue hôte ; la vue garde l'affichage,
// les notifications et la correspondance avec son référentiel d'articles.

import { ref, shallowRef, computed } from 'vue'
import { listRestockPlans, getRestockPlan } from '@/api/endpoints/restock.api'
import {
  getVentilationDeposits,
  listVentilationMovements,
  cancelVentilationDeposit,
  getVentilationStorages,
} from '@/api/endpoints/logistics.api'
import { buildDepositLines, groupDepositLinesByItem, depositPrefill } from '@/utils/restockDepositSheet'
import { buildRestockNeedIndex } from '@/composables/usePredictedNeed'
import { readViewMode, writeViewMode, normalizeViewMode } from '@/utils/ventilationViewMode'
import { buildSupplierIndex, supplierOptions as buildSupplierOptions, filterGroupsBySupplier } from '@/utils/ventilationSuppliers'
import {
  pickPlansForEvents,
  mergeRestockPlans,
  depositEventForPlan,
  allocateDeposit,
  splitMergedRowKey,
} from '@/utils/ventilationPlans'

/**
 * @param {Object} deps
 * @param {import('vuex').Store} deps.store store racine (niveaux Logistic, création de mouvement)
 * @param {(key:string) => string} deps.t traduction (message d'erreur par défaut)
 */
export function useLogisticVentilation({ store, t }) {
  // Feuille fusionnée des matchs choisis (utils/ventilationPlans.js), gardée pour
  // recalculer le reste à déposer après chaque dépôt sans la relire.
  const plan = shallowRef(null)
  const planName = ref(null)
  // Matchs choisis, ordre chronologique ; le premier porte le PIN de la sélection.
  const eventIds = ref([])
  const eventId = computed(() => eventIds.value[0] || null)
  const loading = ref(false)
  const lines = shallowRef([])
  // Stockages des configurations des matchs choisis (pas de configuration en Ventilation).
  const storages = ref([])
  // Dépôts des matchs un par un (liste « Déjà déposé », annulation, décision #76).
  const movements = ref([])
  const cancellingId = ref(null)
  // Drawer de confirmation de dépôt.
  const dialog = ref(false)
  const target = ref(null)
  const saving = ref(false)
  const error = ref(null)
  // Dialogue QR / PIN des logisticiens.
  const accessDialog = ref(false)
  // Bascule Par PdV / Par article.
  const viewMode = ref(readViewMode())
  // Filtre Fournisseur : fiches articles (repli) et fournisseurs choisis.
  const marketPrices = shallowRef([])
  const supplierFilter = ref([])
  // Espace affiché : le repli du filtre ne garde que ses fournisseurs.
  const shownSpaceId = ref(null)
  // Dernière sélection demandée : la réponse lente d'une ancienne sélection est ignorée.
  let loadSeq = 0

  const groups = computed(() => groupDepositLinesByItem(lines.value))
  const supplierList = computed(() => (store.getters['suppliers/suppliers'] || []).filter((x) => x?.id))
  // Noms des fournisseurs (les fiches articles n'ont souvent que l'id).
  const supplierNames = computed(() => new Map(supplierList.value.map((x) => [String(x.id), x.name || x.supplierName || ''])))
  // Fournisseurs rattachés à l'espace (`sites`) ; null tant que la liste ou l'espace manque.
  const spaceSupplierIds = computed(() => {
    if (!shownSpaceId.value || !supplierList.value.length) return null
    return new Set(supplierList.value.filter((x) => (x.sites || []).map(String).includes(String(shownSpaceId.value))).map((x) => String(x.id)))
  })
  const supplierIndex = computed(() =>
    buildSupplierIndex(plan.value, marketPrices.value, supplierNames.value, { lines: lines.value, spaceSupplierIds: spaceSupplierIds.value }),
  )
  const supplierOptions = computed(() => buildSupplierOptions(groups.value, supplierIndex.value))
  /** Groupes affichés : filtre Fournisseur appliqué (la recherche reste à la vue). */
  const visibleGroups = computed(() => filterGroupsBySupplier(groups.value, supplierIndex.value, supplierFilter.value))
  /** Index « À déposer » des fiches PDV et de By Item (null si rien à déposer). */
  const needIndex = computed(() => buildRestockNeedIndex(lines.value))

  function setViewMode(mode) {
    viewMode.value = normalizeViewMode(mode)
    writeViewMode(viewMode.value)
  }

  /** Fiches articles `{ id, itemName, supplier, supplierId }` (repli du fournisseur). */
  function setMarketPrices(list) {
    marketPrices.value = Array.isArray(list) ? list : []
  }

  function reset(nextEventIds = []) {
    plan.value = null
    planName.value = null
    lines.value = []
    movements.value = []
    storages.value = []
    supplierFilter.value = []
    eventIds.value = [...(nextEventIds || [])].map(String)
  }

  /**
   * Charge les feuilles de réarmement des matchs choisis (pour chacun, la plus
   * récemment modifiée qui le contient, même règle que le serveur) et les fusionne.
   * @param {string} spaceId
   * @param {string[]} orderedEventIds matchs choisis, ordre chronologique
   * @returns {Promise<boolean>} true si au moins une feuille existe
   */
  async function loadForEvents(spaceId, orderedEventIds) {
    const seq = ++loadSeq
    reset(orderedEventIds)
    shownSpaceId.value = spaceId || null
    if (!spaceId || !eventIds.value.length) return false
    loading.value = true
    // Indépendant des feuilles : la section s'affiche dès qu'il y a quelque chose à déposer.
    getVentilationStorages(spaceId, eventIds.value)
      .then((list) => { if (seq === loadSeq) storages.value = Array.isArray(list) ? list : [] })
      .catch((e) => console.warn('[logistics] stockages de ventilation indisponibles :', e?.message))
    try {
      const list = await listRestockPlans(spaceId)
      const picked = pickPlansForEvents(list || [], eventIds.value)
      if (!picked.length || seq !== loadSeq) return false
      const full = (await Promise.all(picked.map((p) => getRestockPlan(p.id).catch(() => null)))).filter(Boolean)
      const merged = mergeRestockPlans(full, eventIds.value)
      if (!merged || seq !== loadSeq) return false
      plan.value = merged
      planName.value = merged.name
      await refresh(spaceId)
      return true
    } finally {
      if (seq === loadSeq) loading.value = false
    }
  }

  /** Matchs dont les dépôts comptent : ceux des feuilles et ceux choisis (un dépôt en
   *  stockage hors feuille est enregistré sur le premier match choisi). */
  function depositEventIds() {
    return [...new Set([...(plan.value?.eventIds || []), ...eventIds.value])]
  }

  /** Relit les dépôts de tous les matchs des feuilles et recalcule le reste à déposer. */
  async function refresh(spaceId) {
    if (!plan.value || !spaceId) return
    let sums = []
    try {
      const [s, list] = await Promise.all([
        getVentilationDeposits(spaceId, depositEventIds()),
        listVentilationMovements(spaceId, depositEventIds()),
      ])
      sums = Array.isArray(s) ? s : []
      // Un utilisateur Logistique peut annuler tout dépôt (décision #76).
      movements.value = (Array.isArray(list) ? list : []).map((m) => ({ ...m, cancellable: !m.cancelled }))
    } catch (e) {
      console.warn('[logistics] dépôts de ventilation indisponibles :', e?.message)
    }
    const enriched = sums.map((d) => ({
      ...d,
      unitsPerPack: store.getters['logistics/levelFor'](d.elementId, d.itemKey)?.unitsPerPack || null,
    }))
    lines.value = buildDepositLines(plan.value, enriched)
  }

  /**
   * Ouvre le drawer pour une ligne.
   * @param {{group:object, row:object}} payload ligne de la vue Ventilation
   * @param {{item:object|null, logisticUnitsPerPack:number|null}} logistic article
   *   Logistic de la destination (identité par nom) et sa taille de pack
   */
  function openConfirm({ group, row }, { item = null, logisticUnitsPerPack = null } = {}) {
    const prefill = depositPrefill(row, logisticUnitsPerPack, group.unitsPerPack)
    target.value = {
      itemName: group.itemName,
      shopName: row.shopName,
      unit: item?.unit || group.unit,
      packagingType: item?.packagingType || group.packagingType,
      unitsPerPack: prefill.unitsPerPack,
      quantity: row.quantity,
      packs: prefill.packs,
      elementId: row.shopId,
      // Feuilles concernées (plusieurs matchs) ; vide pour un stockage sans ligne prévue.
      parts: row.parts || [],
      item,
    }
    error.value = null
    dialog.value = true
  }

  /**
   * Mouvements « Ventilation » d'une saisie : répartis entre les feuilles de la
   * destination (match le plus proche d'abord), chacun sur un match de sa feuille.
   * Stockage sans ligne prévue : un seul mouvement, sur le premier match choisi.
   */
  function depositMovements({ packed, loose }, current) {
    const parts = current.parts || []
    if (!parts.length) return [{ packed, loose, eventId: eventId.value }]
    const plans = plan.value?.plans || []
    return allocateDeposit({ packed, loose }, parts, current.unitsPerPack).map((share) => {
      const { planId } = splitMergedRowKey(share.rowKey)
      const owner = plans.find((p) => p.id === planId)
      return { packed: share.packed, loose: share.loose, eventId: depositEventForPlan(owner, eventIds.value) || eventId.value }
    })
  }

  /** Crée le ou les mouvements « Ventilation ». @returns {Promise<boolean>} succès */
  async function submit({ packed, loose }, spaceId) {
    const current = target.value
    if (!current || !spaceId || !eventId.value) return false
    saving.value = true
    error.value = null
    let written = 0
    try {
      for (const share of depositMovements({ packed, loose }, current)) {
        // eslint-disable-next-line no-await-in-loop -- mouvements du même niveau de stock, dans l'ordre
        await store.dispatch('logistics/createMovement', {
          spaceId,
          elementId: current.elementId,
          itemKey: current.item?.name || current.itemName,
          itemKind: current.item?.refKind ?? undefined,
          itemRefId: current.item?.refKind ? current.item.id : undefined,
          direction: 'add',
          packed: share.packed,
          loose: share.loose,
          reason: 'VENTILATION',
          eventId: share.eventId,
        })
        written += 1
      }
      dialog.value = false
      await refresh(spaceId)
      return true
    } catch (e) {
      error.value = e?.response?.data?.message || e?.userMessage || t('logiMovementError')
      // Dépôt réparti en partie enregistré : fenêtre fermée et feuille relue, pour ne
      // pas réenregistrer la première part en réessayant.
      if (written) {
        dialog.value = false
        await refresh(spaceId)
      }
      return false
    } finally {
      saving.value = false
    }
  }

  /** Annule un dépôt (mouvement inverse). Lève en cas de refus serveur. */
  async function cancel(movement, spaceId) {
    if (!movement?.id || cancellingId.value) return false
    cancellingId.value = movement.id
    try {
      await cancelVentilationDeposit(movement.id)
      await refresh(spaceId)
      return true
    } finally {
      cancellingId.value = null
    }
  }

  return {
    plan,
    planName,
    eventIds,
    eventId,
    loading,
    storages,
    groups,
    visibleGroups,
    supplierIndex,
    supplierOptions,
    supplierFilter,
    viewMode,
    setViewMode,
    setMarketPrices,
    needIndex,
    movements,
    cancellingId,
    dialog,
    target,
    saving,
    error,
    accessDialog,
    reset,
    loadForEvents,
    refresh,
    openConfirm,
    submit,
    cancel,
  }
}
