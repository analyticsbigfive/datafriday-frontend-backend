// src/composables/useGuestInventorySession.js
//
// Mode invité de SpaceInventoryView.vue (manager PDV sans compte, accès par PIN).
// Un SEUL point d'entrée pour toute la logique spécifique au mode invité : la vue
// lit `isGuestMode`/`isReadonly` et délègue via 3 points d'intégration précis
// (inventoryCounts, realShops, onCountValue/markCounted) — aucune branche invité
// éparpillée ailleurs dans le fichier.
//
// Le mode est déterminé par `route.meta.guestMode` (posé sur les 2 routes dédiées
// `/guest/pre-inventory` et `/guest/inventory`, cf. router/index.js), jamais par la
// présence d'une session guestPin seule : un manager qui resterait connecté ne doit
// jamais faire basculer par erreur l'écran STAFF en mode invité.
//
// Pourquoi une structure parallèle à useInventoryData.js plutôt qu'une injection
// dans ses refs : ce dernier lit son catalogue depuis store.state.analyse
// (jamais chargé côté invité, tout le bootstrap analyse/loadSpace partirait en
// 401 sous JWT invité). Mais l'EXPLOSION combo/BOM elle-même doit être identique
// des deux côtés — décision du 2026-09-08 après un désaccord staff/invité sur le
// nombre d'articles à compter pour un même PDV : `buildConsolidatedInventory` est
// donc appelée ICI aussi, tel quel, nourrie par /guest-pin/catalog (mêmes données
// brutes que le staff, cf. GuestPinAccessService.getCatalog) — jamais une resucée
// de l'algorithme.

import { ref, computed } from 'vue'
import { useStore } from 'vuex'
import { useRoute } from 'vue-router'
import { buildConsolidatedInventory } from '@/utils/inventoryUtils'
import {
  getGuestCatalog,
  getGuestInventory,
  getGuestBaseline,
  saveGuestCount,
  submitGuestCount,
} from '@/api/endpoints/guestPin.api'

export function useGuestInventorySession() {
  const store = useStore()
  const route = useRoute()

  const isGuestMode = computed(() => !!route.meta?.guestMode)
  const session = computed(() => store.getters['guestPin/session'])
  const guestSlug = computed(() => store.getters['guestPin/slug'])
  const submittedAt = computed(() => session.value?.submittedAt ?? null)
  const validatedAt = computed(() => session.value?.validatedAt ?? null)
  // "J'ai terminé" est un SIGNAL (le manager reste modifiable), PAS un verrou —
  // décision produit 2026-09-08, revenue sur le gel immédiat initial ("c'est le
  // directeur qui doit vérifier et valider, pas le manager qui se verrouille
  // lui-même"). Seule une validation directeur (validatedAt) verrouille vraiment.
  const isSubmitted = computed(() => !!submittedAt.value && !validatedAt.value)
  const isReadonly = computed(() => !!validatedAt.value)

  const guestSpaceId = computed(() => session.value?.spaceId ?? null)
  const guestElementId = computed(() => session.value?.elementId ?? null)
  const guestElementName = computed(() => session.value?.elementName ?? null)
  const guestEventId = computed(() => session.value?.eventId ?? null)

  // { [elementId]: { [itemId]: { packedUnits, looseUnits, isCounted, storageLocation, countingStatus } } }
  // Même forme que store.state.inventory.inventoryCounts (staff) — c'est ce qui
  // permet à getCount/isItemCounted/totalForItem (SpaceInventoryView.vue) de rester
  // INCHANGÉS : ils ne savent pas d'où vient la donnée, juste sa forme.
  const guestInventoryCounts = ref({})
  // [{ element: {id, name, isOpen}, consolidatedInventory: [{id, name, unit, picture}] }]
  // Toujours 0 ou 1 entrée — un manager invité ne voit jamais qu'un seul PDV.
  const guestCards = ref([])
  // { [itemId]: { packed, loose, units, unitsPerPack } } — état Logistic réel pour
  // le PDV de l'invité. Toujours chargé et affiché (décision produit 2026-09-08 :
  // pas d'option, le manager voit systématiquement le stock Logistic). Même
  // donnée que le chip staff "État Logistic" (logisticStockFor), pas le "Besoin
  // prédit" (source Restock/Event Predict, sans rapport).
  const guestExpected = ref({})

  /** Charge le catalogue + comptages + quantités attendues du PDV de l'invité —
   *  équivalent invité de `loadForSpace`, mais sans AUCUN des chargements staff
   *  (analyse/loadSpace, events, logistics...) qui partiraient en 401 sous JWT
   *  invité. Le catalogue brut (/guest-pin/catalog) est explosé ICI par la MÊME
   *  fonction que le staff (`buildConsolidatedInventory`) : mêmes articles,
   *  mêmes images, mêmes libellés de conditionnement des deux côtés. */
  async function loadGuestInventory() {
    const [catalog, inventory, baseline] = await Promise.all([
      getGuestCatalog(),
      getGuestInventory(),
      getGuestBaseline(),
    ])
    const elementId = guestElementId.value

    const consolidatedInventory = buildConsolidatedInventory(
      catalog?.availableMenuItems ?? [],
      catalog?.allMenuItemsData ?? [],
      catalog?.marketPrices ?? [],
      false,
      catalog?.components ?? [],
    )

    const savedCounts = inventory?.savedCounts ?? {}
    const counts = {}
    for (const item of consolidatedInventory) {
      const saved = savedCounts[item.id] ?? {}
      counts[item.id] = {
        itemId: item.id,
        packedUnits: saved.packedUnits ?? 0,
        looseUnits: saved.looseUnits ?? 0,
        isCounted: !!saved.isCounted,
        storageLocation: saved.storageLocation ?? null,
        countingStatus: saved.countingStatus ?? 'pending',
      }
    }
    guestInventoryCounts.value = { [elementId]: counts }

    guestCards.value = [{
      element: {
        id: elementId,
        name: catalog?.elementName ?? guestElementName.value,
        isOpen: true,
      },
      consolidatedInventory,
    }]

    guestExpected.value = baseline?.expected?.[elementId] ?? {}
  }

  /** Équivalent invité de `logisticStockFor(elementId, item)` (staff) — même
   *  contrat d'appel (élément ignoré, un seul PDV possible côté invité), même
   *  calcul (packed × conditionnement + loose). null = article absent du registre
   *  Logistic (jamais compté ici, distinct de "pas encore de mouvement" → 0). */
  function guestExpectedFor(elementId, item) {
    const exp = guestExpected.value[item?.id]
    if (!exp) return null
    const upp = Number(exp.unitsPerPack) > 0 ? Number(exp.unitsPerPack) : 1
    return (Number(exp.packed) || 0) * upp + (Number(exp.loose) || 0)
  }

  /** Écriture optimiste locale + sauvegarde serveur — équivalent invité de
   *  `inventory/upsertCount` (staff), même contrat d'appel (shopId/itemId/patch),
   *  shopId ignoré ici (un seul élément possible côté invité). */
  async function upsertGuestCount({ itemId, patch }) {
    const elementId = guestElementId.value
    const current = guestInventoryCounts.value[elementId]?.[itemId] ?? {
      itemId, packedUnits: 0, looseUnits: 0, isCounted: false, storageLocation: null, countingStatus: 'pending',
    }
    const next = { ...current, ...patch }
    guestInventoryCounts.value = {
      ...guestInventoryCounts.value,
      [elementId]: { ...guestInventoryCounts.value[elementId], [itemId]: next },
    }
    await saveGuestCount({
      itemId,
      packedUnits: next.packedUnits,
      looseUnits: next.looseUnits,
      isCounted: next.isCounted,
      storageLocation: next.storageLocation,
      countingStatus: next.countingStatus,
    })
    // Le backend réarme submittedAt=null si on écrit après "J'ai terminé" (pas
    // encore validé) — sans ce refresh, le badge "Soumis" resterait affiché à tort
    // pendant que le manager modifie déjà ses chiffres.
    if (isSubmitted.value) {
      await store.dispatch('guestPin/refreshSession')
    }
  }

  /** "J'ai terminé" : signale au directeur que ce PDV est prêt à vérifier — NE
   *  verrouille pas (cf. isReadonly, basé sur validatedAt, pas submittedAt). */
  async function submitGuestInventory() {
    await submitGuestCount()
    await store.dispatch('guestPin/refreshSession')
  }

  /** Déconnexion explicite du responsable PDV — purge la session invité. Ne fait
   *  QUE ça (pas de navigation ici) : c'est à l'appelant (vue) de rediriger. */
  async function logout() {
    await store.dispatch('guestPin/clear')
  }

  return {
    isGuestMode,
    isReadonly,
    isSubmitted,
    submittedAt,
    validatedAt,
    guestSlug,
    guestSpaceId,
    guestElementId,
    guestElementName,
    guestEventId,
    guestInventoryCounts,
    guestCards,
    guestExpectedFor,
    loadGuestInventory,
    upsertGuestCount,
    submitGuestInventory,
    logout,
  }
}
