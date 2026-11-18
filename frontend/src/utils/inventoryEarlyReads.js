// Lectures de l'écran Inventaire qui ne dépendent PAS du référentiel affiché (PdV, articles) :
// elles partent dès que l'event est connu, en parallèle du chargement du contexte, au lieu
// d'attendre sa fin. La mise en forme des réponses reste faite par la vue, au moment où
// elle les consomme : le résultat affiché est identique, seul le départ réseau change.
//
// (Les articles par PdV, lus par useInventoryData, vivent dans inventoryShopItemsBatch.js : ce
// composable ne doit pas tirer les clients API de ce fichier.)
//
// Règle commune : une lecture anticipée ne lève JAMAIS (résultat « réglé » { ok, value | error }),
// sinon une réponse jamais consommée (chargement interrompu) ferait un rejet non géré. Le
// consommateur relit l'erreur avec `takeSettled`, donc ses `try/catch` d'avant restent valables.

import { getPreEventBaseline, getPostEventBaseline } from '@/api/endpoints/inventory.api'
import { listRestockPlans, getRestockPlan } from '@/api/endpoints/restock.api'
import { settle } from '@/utils/inventoryShopItemsBatch'

/** Relit un résultat réglé : renvoie la valeur, ou relance l'erreur d'origine. */
export async function takeSettled(settledPromise) {
  const r = await settledPromise
  if (!r.ok) throw r.error
  return r.value
}

/** Appel brut des attendus : pré-event ou post-event selon l'écran. */
function callBaseline(spaceId, eventId, isPreMode) {
  return isPreMode ? getPreEventBaseline(spaceId, eventId) : getPostEventBaseline(spaceId, eventId)
}

/**
 * Plan de réarmement du match : { matched:false } sans plan, sinon { matched:true, lines }.
 * Même enchaînement que la lecture d'avant (liste des plans, puis le plan retenu).
 */
export async function readRestockLinesForEvent(spaceId, eventId) {
  const plans = await listRestockPlans(spaceId)
  const match = (plans || []).find((p) => (p.selectedEventIds || []).map(String).includes(String(eventId)))
  if (!match) return { matched: false, lines: null }
  const full = await getRestockPlan(match.id)
  return { matched: true, lines: full?.restockLines }
}

/**
 * Lance les lectures anticipées d'un chargement d'écran. Mêmes conditions de départ que les
 * lectures d'origine (permission, event, hors démo) : sinon rien ne part.
 * @returns {{ baseline: object|null, restock: object|null }|null}
 */
export function startInventoryEarlyReads({ spaceId, currentSpaceId, eventId, isPreMode, canSeeExpected, canSeePredicted, demo }) {
  if (!eventId || demo) return null
  return {
    baseline: canSeeExpected && spaceId
      ? { spaceId, eventId, isPreMode, result: settle((async () => callBaseline(spaceId, eventId, isPreMode))()) }
      : null,
    restock: canSeePredicted && currentSpaceId
      ? { spaceId: currentSpaceId, eventId, result: settle(readRestockLinesForEvent(currentSpaceId, eventId)) }
      : null,
  }
}

const sameId = (a, b) => String(a) === String(b)

/** Résultat réglé des attendus s'il correspond exactement à la demande, sinon null. */
export function pickEarlyBaseline(early, { spaceId, eventId, isPreMode }) {
  const b = early?.baseline
  if (!b || !sameId(b.spaceId, spaceId) || !sameId(b.eventId, eventId) || b.isPreMode !== isPreMode) return null
  return b.result
}

/** Résultat réglé du plan de réarmement s'il correspond exactement à la demande, sinon null. */
export function pickEarlyRestock(early, { spaceId, eventId }) {
  const r = early?.restock
  if (!r || !sameId(r.spaceId, spaceId) || !sameId(r.eventId, eventId)) return null
  return r.result
}

/** Attendus : lecture anticipée si elle correspond, sinon l'appel direct (comportement d'avant). */
export function readBaseline(early, { spaceId, eventId, isPreMode }) {
  const result = pickEarlyBaseline(early, { spaceId, eventId, isPreMode })
  return result ? takeSettled(result) : callBaseline(spaceId, eventId, isPreMode)
}

/** Plan de réarmement : lecture anticipée si elle correspond, sinon la lecture directe. */
export function readRestockLines(early, { spaceId, eventId }) {
  const result = pickEarlyRestock(early, { spaceId, eventId })
  return result ? takeSettled(result) : readRestockLinesForEvent(spaceId, eventId)
}
