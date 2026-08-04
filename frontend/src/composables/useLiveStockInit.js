// Module Live (docs/modules/11_LIVE.md) — initialise le stock affiché dans
// l'onglet Inventaire de Live à partir du plan « Stock Up » par défaut d'Event
// Predict pour l'event en cours, au lieu de partir d'un stock jamais compté.
//
// Réutilise TEL QUEL le mécanisme de reset Logistic déjà en production
// (aucun changement backend) : POST /logistics/:spaceId/reset crée une
// StockReconciliation (nouvelle ancre) + des StockMovement `INVENTORY_RESET` +
// met à jour StockLevel — exactement comme un reset manuel (comptage physique),
// seule la provenance des quantités change. Les mouvements de stock (ventes en
// temps réel, transferts, resets ultérieurs) continuent de s'appliquer par-
// dessus, sans rien de spécifique à écrire pour ça.
import { ref } from 'vue'
import store from '@/store'
import { listEventPredictVersions } from '@/api/endpoints/eventPredict.api'
import { buildStockRequirements } from '@/utils/stockPlanning'

/**
 * Sélectionne la version Event Predict à utiliser : la version par défaut
 * (`isDefault`), sinon la première — même priorité que
 * `SpaceRestockView.activeVersionForEvent` (sans le tiers « scénario choisi »,
 * propre à une session Event Predict ouverte, non pertinent ici).
 */
function pickVersion(versions) {
  if (!Array.isArray(versions) || !versions.length) return null
  return versions.find((v) => v?.isDefault) || versions[0]
}

export function useLiveStockInit() {
  const initializing = ref(false)
  const lastError = ref(null)

  /**
   * @param {string} spaceId
   * @param {string} eventId
   * @param {string} [eventName]
   * @returns {Promise<{ok:boolean, reason?:string, lineCount?:number}>}
   */
  async function initFromEventPredict(spaceId, eventId, eventName) {
    lastError.value = null
    if (!spaceId || !eventId) {
      lastError.value = 'missing-space-or-event'
      return { ok: false, reason: lastError.value }
    }
    initializing.value = true
    try {
      const versions = await listEventPredictVersions(eventId)
      const version = pickVersion(versions)
      if (!version) {
        lastError.value = 'no-event-predict-version'
        return { ok: false, reason: lastError.value }
      }

      const event = (store.state.analyse.events || []).find((e) => e.id === eventId)
      const configuration = event?.configurationId
        ? (store.state.analyse.configurations || []).find((c) => c.id === event.configurationId)
        : null
      if (!configuration) {
        lastError.value = 'no-configuration'
        return { ok: false, reason: lastError.value }
      }

      const requirements = buildStockRequirements({
        configuration,
        menuItems: store.state.analyse.menuItems || [],
        components: store.state.analyse.components || [],
        predictedRecords: version.predictedRecords || [],
        selectedMenuItems: version.menuConfig || {},
        quantityAdjustments: version.quantityAdjustments || {},
        manualQuantities: version.manualQuantities || {},
      })
      if (!requirements.length) {
        lastError.value = 'no-requirements'
        return { ok: false, reason: lastError.value }
      }

      // countedPacked à 0 : buildStockRequirements ne connaît pas de notion de
      // « pack » (c'est une quantité prédite, pas un comptage physique) — tout
      // part en vrac, unitsPerPack est retrouvé par le référentiel côté backend/
      // affichage (cf. LiveInventoryPanel), pas dupliqué ici.
      const lines = requirements.map((r) => ({
        elementId: r.shopId,
        itemKey: r.itemKey,
        countedPacked: 0,
        countedLoose: r.totalQuantity,
      }))

      await store.dispatch('logistics/reset', { spaceId, eventId, eventName, lines })
      return { ok: true, lineCount: lines.length }
    } catch (err) {
      lastError.value = err?.response?.data?.message || err?.message || 'init-failed'
      return { ok: false, reason: lastError.value }
    } finally {
      initializing.value = false
    }
  }

  return { initializing, lastError, initFromEventPredict }
}
