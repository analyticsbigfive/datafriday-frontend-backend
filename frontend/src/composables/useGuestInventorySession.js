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
// dans ses refs : ce dernier construit `consolidatedInventory` par explosion BOM
// (menu vendu → composants/emballages, cf. buildConsolidatedInventory) à partir du
// catalogue STAFF (store.state.analyse.menuItems, jamais chargé côté invité). Le
// backend invité (GuestPinAccessService.getInventory) a déjà fait ce travail
// serveur (SpaceMenusService.getShopInventory) : les items reçus sont DÉJÀ au
// niveau "article à compter", prêts à consommer directement.

import { ref, computed } from 'vue'
import { useStore } from 'vuex'
import { useRoute } from 'vue-router'
import {
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
  const submittedAt = computed(() => session.value?.submittedAt ?? null)
  // Gelé (a cliqué "J'ai terminé") — la fenêtre elle-même reste ouverte pour les
  // autres PDV, seul CET accès passe en lecture seule. La clôture globale (window
  // fermée) se traduit par une session invalidée ailleurs (401 → redirection
  // /login/pin par l'intercepteur Axios), pas par ce flag.
  const isReadonly = computed(() => !!submittedAt.value)

  const guestSpaceId = computed(() => session.value?.spaceId ?? null)
  const guestElementId = computed(() => session.value?.elementId ?? null)
  const guestElementName = computed(() => session.value?.elementName ?? null)
  const guestEventId = computed(() => session.value?.eventId ?? null)
  const guestShowExpected = computed(() => session.value?.showExpected ?? false)

  // { [elementId]: { [itemId]: { packedUnits, looseUnits, isCounted, storageLocation, countingStatus } } }
  // Même forme que store.state.inventory.inventoryCounts (staff) — c'est ce qui
  // permet à getCount/isItemCounted/totalForItem (SpaceInventoryView.vue) de rester
  // INCHANGÉS : ils ne savent pas d'où vient la donnée, juste sa forme.
  const guestInventoryCounts = ref({})
  // [{ element: {id, name, isOpen}, consolidatedInventory: [{id, name, unit, picture}] }]
  // Toujours 0 ou 1 entrée — un manager invité ne voit jamais qu'un seul PDV.
  const guestCards = ref([])

  /** Charge le catalogue + comptages du PDV de l'invité (et les quantités attendues
   *  si autorisées) — équivalent invité de `loadForSpace`, mais sans AUCUN des
   *  chargements staff (analyse/loadSpace, events, logistics, market prices...) qui
   *  partiraient en 401 sous JWT invité. */
  async function loadGuestInventory() {
    const [inventory, baseline] = await Promise.all([
      getGuestInventory(),
      guestShowExpected.value ? getGuestBaseline() : Promise.resolve({ expected: {} }),
    ])
    const items = inventory?.items ?? []
    const elementId = guestElementId.value

    const counts = {}
    for (const item of items) {
      counts[item.itemId] = {
        itemId: item.itemId,
        packedUnits: item.packedUnits ?? 0,
        looseUnits: item.looseUnits ?? 0,
        isCounted: !!item.isCounted,
        storageLocation: item.storageLocation ?? null,
        countingStatus: item.countingStatus ?? 'pending',
      }
    }
    guestInventoryCounts.value = { [elementId]: counts }

    guestCards.value = [{
      element: {
        id: elementId,
        name: inventory?.elementName ?? guestElementName.value,
        isOpen: true,
      },
      consolidatedInventory: items.map((item) => ({
        id: item.itemId,
        name: item.name,
        unit: item.unit,
        // Absents côté invité (le backend n'expose pas encore le conditionnement
        // packagé, cf. GuestPinAccessService.getInventory) : dégrade proprement
        // vers le libellé générique "Number of packed units" et un ratio 1:1,
        // jamais une erreur.
        inventoryPackaging: null,
        inventoryQuantityPackaged: null,
        picture: null,
      })),
    }]

    return { expected: baseline?.expected?.[elementId] ?? {} }
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
  }

  /** "J'ai terminé" : gèle ce PDV, revalide la session pour refléter `submittedAt`. */
  async function submitGuestInventory() {
    await submitGuestCount()
    await store.dispatch('guestPin/refreshSession')
  }

  return {
    isGuestMode,
    isReadonly,
    submittedAt,
    guestSpaceId,
    guestElementId,
    guestElementName,
    guestEventId,
    guestShowExpected,
    guestInventoryCounts,
    guestCards,
    loadGuestInventory,
    upsertGuestCount,
    submitGuestInventory,
  }
}
