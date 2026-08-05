// Composable Réarmement — historique des plans nommés (table RestockPlan).
//
// REST AUTORITAIRE, sans miroir localStorage : contrairement à
// useEventPredictVersions (qui traîne une machinerie de réconciliation née d'un
// bug GET-après-POST), une sauvegarde de plan est un geste EXPLICITE qui
// renvoie un id serveur — rien à réconcilier, rien à mettre en cache.
//   - 404 sur la liste = backend sans le module restock-plans → `available`
//     passe à false, le panneau se masque, le réarmement continue sans plans.
//   - mode démo = indisponible d'emblée (aucun backend).
//   - erreurs réseau/5xx : la liste reste vide, `error` posé, pas de retry auto.
//
// Contrat REST : backend/src/features/restock-plans/ — GET liste = métadonnées
// seules (jamais la photo), GET :id = plan complet. Cf. ADR-0005.

import { ref, shallowRef } from 'vue'
import { isDemoMode } from '@/utils/demoMode'
import {
  listRestockPlans,
  getRestockPlan,
  createRestockPlan,
  patchRestockPlan,
  duplicateRestockPlan,
  deleteRestockPlan,
} from '@/api/endpoints/restock.api'

/** Normalise une entrée de liste (métadonnées) — tolérant aux champs absents. */
function mapPlanMeta(raw) {
  if (!raw || typeof raw !== 'object') return null
  return {
    id: raw.id,
    name: raw.name || '',
    objectiveSource: raw.objectiveSource || 'forecast',
    selectedEventIds: Array.isArray(raw.selectedEventIds) ? raw.selectedEventIds : [],
    eventsSnapshot: Array.isArray(raw.eventsSnapshot) ? raw.eventsSnapshot : [],
    lineCount: Number(raw.lineCount) || 0,
    shoppingItemCount: Number(raw.shoppingItemCount) || 0,
    createdBy: raw.createdBy || null,
    createdAt: raw.createdAt || null,
    updatedAt: raw.updatedAt || null,
  }
}

export function useRestockPlans() {
  // Métadonnées des plans de l'espace courant (jamais les photos).
  const plans = shallowRef([])
  const loading = ref(false)
  // null tant qu'on ne sait pas ; false = module backend absent (404) ou démo.
  const available = ref(isDemoMode() ? false : null)
  const error = ref(null)

  /** Recharge la liste pour un espace. Silencieux : gère 404 (module absent). */
  async function refresh(spaceId) {
    if (!spaceId || available.value === false) return
    loading.value = true
    error.value = null
    try {
      const res = await listRestockPlans(spaceId)
      plans.value = (Array.isArray(res) ? res : []).map(mapPlanMeta).filter(Boolean)
      available.value = true
    } catch (err) {
      if (err?.response?.status === 404) {
        // Backend pas déployé avec le module → panneau masqué, pas d'erreur.
        available.value = false
        plans.value = []
      } else {
        // Lot 3 — réseau coupé / 5xx : le module EXISTE, c'est l'appel qui a
        // échoué. Laisser `available` à `null` masquait panneau ET bouton
        // « Sauvegarder le plan » définitivement, sans message ni retry (le
        // v-if traite null comme faux) — la sauvegarde paraissait cassée.
        // `true` + `error` posé : le panneau reste visible et rend l'échec.
        available.value = true
        error.value = err
        plans.value = []
      }
    } finally {
      loading.value = false
    }
  }

  /** Photo complète d'un plan. 404 → null (supprimé / autre tenant). */
  async function load(planId) {
    if (!planId) return null
    try {
      return await getRestockPlan(planId)
    } catch (err) {
      if (err?.response?.status === 404) return null
      throw err
    }
  }

  /** Crée un plan (payload = buildPlanSnapshot + name), renvoie le plan créé. */
  async function create(spaceId, payload) {
    const created = await createRestockPlan(spaceId, payload)
    await refresh(spaceId)
    return created
  }

  /** Met à jour un plan (rename, nouvelle photo, lineOverrides…). */
  async function update(planId, payload, spaceId) {
    const updated = await patchRestockPlan(planId, payload)
    if (spaceId) await refresh(spaceId)
    return updated
  }

  /** Duplique côté serveur (pas de ré-upload de la photo). */
  async function duplicate(planId, spaceId) {
    const copy = await duplicateRestockPlan(planId)
    if (spaceId) await refresh(spaceId)
    return copy
  }

  /** Supprime un plan. */
  async function remove(planId, spaceId) {
    await deleteRestockPlan(planId)
    if (spaceId) await refresh(spaceId)
  }

  /** Changement d'espace (routes keepAlive) : repartir d'une liste vierge. */
  function reset() {
    plans.value = []
    error.value = null
    if (!isDemoMode()) available.value = null
  }

  return {
    plans,
    loading,
    available,
    error,
    refresh,
    load,
    create,
    update,
    duplicate,
    remove,
    reset,
  }
}
