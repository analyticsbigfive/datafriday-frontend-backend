// Transferts « stockage source vers PDV » de la Ventilation, générés en tâches
// logistiques (LogisticTask, aucune nouvelle table). Le calcul est dans
// utils/ventilationTransfers.js (pur) ; ce composable branche le store, le choix
// du stockage source, les logisticiens et la création du lot.

import { computed, ref, watch } from 'vue'
import { buildTransfers, ownNeedPacks, summarizeSource, toTaskLines, transferKey } from '@/utils/ventilationTransfers'
import { createLogisticTaskBatch } from '@/api/endpoints/logistic-tasks.api'
import { useAssignableStaff } from '@/composables/useAssignableStaff'

const SOURCE_HINT = /container\s*hk/i

/**
 * @param {object} p
 * @param {object} p.store store Vuex
 * @param {() => Array} p.groups groupes « À déposer » (ventilation.visibleGroups)
 * @param {() => Array} p.storages stockages des configs ({id, name})
 * @param {() => string|null} p.spaceId
 * @param {() => void} [p.onGenerated] appelé après création (rafraîchir les tâches)
 */
export function useVentilationTransfers({ store, groups, storages, spaceId, onGenerated }) {
  const { staff, fetchStaff } = useAssignableStaff()
  const sourceId = ref(null)
  const batchAssignee = ref(null)
  const assigneeByKey = ref({})
  const generating = ref(false)
  const error = ref(null)
  const generatedCount = ref(0)
  // Règle « le stockage source garde son besoin propre » : OFF tant que Bertrand n'a pas confirmé.
  const reserveOwnNeed = ref(false)

  const sourceOptions = computed(() => {
    const list = [...(storages() || [])]
    // Container HK proposé en premier, sans jamais l'imposer.
    return list.sort((a, b) => Number(SOURCE_HINT.test(b.name)) - Number(SOURCE_HINT.test(a.name)))
  })

  watch(
    sourceOptions,
    (opts) => {
      if (!opts.some((o) => o.id === sourceId.value)) sourceId.value = opts[0]?.id ?? null
    },
    { immediate: true },
  )

  const storageIds = computed(() => new Set((storages() || []).map((s) => String(s.id))))

  const destinationGroups = computed(() =>
    (groups() || []).map((g) => ({
      ...g,
      rows: (g.rows || []).filter((r) => !storageIds.value.has(String(r.shopId))),
    })),
  )

  const sourcePacks = (itemKey) => {
    if (!sourceId.value) return null
    const level = store.getters['logistics/expectedFor'](sourceId.value, itemKey)
    return level && Number.isFinite(Number(level.packed)) ? Number(level.packed) : null
  }

  const reservedPacks = computed(() =>
    reserveOwnNeed.value && sourceId.value ? ownNeedPacks(groups(), sourceId.value) : () => 0,
  )

  // Sans stockage source, seuls les transferts PDV vers PDV restent calculables
  // (leur source est le PDV cédant) : on ne signale pas « stock illisible » pour autant.
  const result = computed(() => {
    const res = buildTransfers({
      groups: destinationGroups.value,
      sourcePacks: (itemKey) => (sourceId.value ? sourcePacks(itemKey) : null),
      reservedPacks: reservedPacks.value,
    })
    return sourceId.value ? res : { ...res, unknown: res.unknown.filter((u) => u.reason !== 'no-stock') }
  })

  const sourceSummary = computed(() =>
    sourceId.value
      ? summarizeSource({
          groups: destinationGroups.value,
          result: result.value,
          sourcePacks,
          reservedPacks: reservedPacks.value,
        })
      : [],
  )

  // Lignes par PDV : prélevé sur la source et/ou manque (à commander, sans tâche).
  const rows = computed(() => {
    const map = new Map()
    const touch = (t) => {
      const k = transferKey(t)
      if (!map.has(k)) map.set(k, { ...t, packs: 0, taken: 0, short: 0 })
      return map.get(k)
    }
    for (const t of result.value.transfers) touch(t).taken = t.packs
    for (const t of result.value.shortages) touch(t).short = t.packs
    return [...map.values()].map((r) => ({ ...r, packs: r.taken }))
  })

  const assigneeFor = (transfer) => assigneeByKey.value[transferKey(transfer)] || batchAssignee.value
  const setAssignee = (transfer, userId) => {
    assigneeByKey.value = { ...assigneeByKey.value, [transferKey(transfer)]: userId || null }
  }

  const missingAssignee = computed(() => result.value.transfers.some((t) => !assigneeFor(t)))
  const canGenerate = computed(() => result.value.transfers.length > 0 && !missingAssignee.value && !generating.value)

  async function load() {
    await fetchStaff(spaceId())
  }

  async function generate() {
    if (!canGenerate.value) return false
    generating.value = true
    error.value = null
    try {
      const lines = toTaskLines(result.value.transfers, {
        sourceElementId: sourceId.value,
        assigneeFor,
        itemRef: (itemKey) => store.getters['logistics/itemByKey'](itemKey),
      })
      await createLogisticTaskBatch(spaceId(), lines)
      generatedCount.value = lines.length
      assigneeByKey.value = {}
      if (onGenerated) await onGenerated()
      return true
    } catch (e) {
      error.value = e?.userMessage || e?.message || 'error'
      return false
    } finally {
      generating.value = false
    }
  }

  return {
    staff, sourceId, sourceOptions, reserveOwnNeed, sourceSummary, rows, batchAssignee, result, generating, error, generatedCount,
    canGenerate, missingAssignee, assigneeFor, setAssignee, load, generate,
  }
}
