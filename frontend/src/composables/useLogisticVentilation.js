// src/composables/useLogisticVentilation.js
//
// Mode « Ventilation » de l'écran Logistique (chantier logistic_ventilation) : feuille
// de réarmement du match, reste à déposer, dépôts « Ventilation » (confirmation,
// liste, annulation) et index « À déposer » des fiches PDV. Sorti de
// SpaceLogisticView.vue pour ne pas grossir la vue hôte ; la vue garde l'affichage,
// les notifications et la correspondance avec son référentiel d'articles.

import { ref, shallowRef, computed } from 'vue'
import { listRestockPlans, getRestockPlan } from '@/api/endpoints/restock.api'
import {
  getVentilationDeposits,
  listVentilationMovements,
  cancelVentilationDeposit,
} from '@/api/endpoints/logistics.api'
import { buildDepositLines, groupDepositLinesByItem, depositPrefill } from '@/utils/restockDepositSheet'
import { buildRestockNeedIndex } from '@/composables/usePredictedNeed'

/**
 * @param {Object} deps
 * @param {import('vuex').Store} deps.store store racine (niveaux Logistic, création de mouvement)
 * @param {(key:string) => string} deps.t traduction (message d'erreur par défaut)
 */
export function useLogisticVentilation({ store, t }) {
  // Feuille de réarmement complète du match, gardée pour recalculer le reste à
  // déposer après chaque dépôt sans la relire.
  const plan = shallowRef(null)
  const planName = ref(null)
  // Match dont la Ventilation est affichée (`?event=` ou prochain match).
  const eventId = ref(null)
  const loading = ref(false)
  const lines = shallowRef([])
  // Dépôts du match un par un (liste « Déjà déposé », annulation, décision #76).
  const movements = ref([])
  const cancellingId = ref(null)
  // Drawer de confirmation de dépôt.
  const dialog = ref(false)
  const target = ref(null)
  const saving = ref(false)
  const error = ref(null)
  // Dialogue QR / PIN des logisticiens.
  const accessDialog = ref(false)

  const groups = computed(() => groupDepositLinesByItem(lines.value))
  /** Index « À déposer » des fiches PDV et de By Item (null si rien à déposer). */
  const needIndex = computed(() => buildRestockNeedIndex(lines.value))

  function reset(nextEventId = null) {
    plan.value = null
    planName.value = null
    lines.value = []
    movements.value = []
    eventId.value = nextEventId
  }

  /**
   * Charge la feuille de réarmement du match (la plus récemment modifiée qui le
   * contient, même règle que le serveur pour l'accès PIN).
   * @returns {Promise<boolean>} true si une feuille existe pour ce match
   */
  async function loadForEvent(spaceId, nextEventId) {
    reset(nextEventId)
    if (!spaceId || !nextEventId) return false
    loading.value = true
    try {
      const plans = await listRestockPlans(spaceId)
      const match = (plans || []).find((p) => (p.selectedEventIds || []).map(String).includes(String(nextEventId)))
      if (!match) return false
      const full = await getRestockPlan(match.id)
      if (!full) return false
      plan.value = full
      planName.value = full.name || match.name || null
      await refresh(spaceId)
      return true
    } finally {
      loading.value = false
    }
  }

  /** Relit les dépôts du match et recalcule le reste à déposer. */
  async function refresh(spaceId) {
    if (!plan.value || !spaceId) return
    let sums = []
    try {
      const [s, list] = await Promise.all([
        getVentilationDeposits(spaceId, eventId.value),
        listVentilationMovements(spaceId, eventId.value),
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
      item,
    }
    error.value = null
    dialog.value = true
  }

  /** Crée le mouvement « Ventilation ». @returns {Promise<boolean>} succès */
  async function submit({ packed, loose }, spaceId) {
    const current = target.value
    if (!current || !spaceId || !eventId.value) return false
    saving.value = true
    error.value = null
    try {
      await store.dispatch('logistics/createMovement', {
        spaceId,
        elementId: current.elementId,
        itemKey: current.item?.name || current.itemName,
        itemKind: current.item?.refKind ?? undefined,
        itemRefId: current.item?.refKind ? current.item.id : undefined,
        direction: 'add',
        packed,
        loose,
        reason: 'VENTILATION',
        eventId: eventId.value,
      })
      dialog.value = false
      await refresh(spaceId)
      return true
    } catch (e) {
      error.value = e?.response?.data?.message || e?.userMessage || t('logiMovementError')
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
    eventId,
    loading,
    groups,
    needIndex,
    movements,
    cancellingId,
    dialog,
    target,
    saving,
    error,
    accessDialog,
    reset,
    loadForEvent,
    refresh,
    openConfirm,
    submit,
    cancel,
  }
}
