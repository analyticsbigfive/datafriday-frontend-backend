/**
 * useComparisonSession : état partagé (singleton au niveau module) entre le drawer Comparaison
 * et la page Analyse principale. Il ne porte QUE les écarts du principal par rapport au rapport
 * chargé dans le drawer : le lot d'interface (5b) appelle `setMainDeltas` avec
 * `useComparisonReport(...).mainDeltasVsComparison.value`, la page principale les lit.
 *
 * Aucun stockage navigateur : l'état vit en mémoire et disparaît au rechargement.
 *
 * `isActive` vaut true tant que mainDeltas est non null (rapport chargé et comparable). Il
 * verrouille le toggle Précédent / N-1 (décision 4). Tant que mainDeltas est null, la page
 * principale se comporte exactement comme avant.
 */
import { shallowRef, computed } from 'vue'

// Résultat de computeReportDeltas(principal, drawer), ou null.
const mainDeltasRef = shallowRef(null)

const mainDeltas = computed(() => mainDeltasRef.value)
const isActive = computed(() => mainDeltasRef.value != null)

// Écarts des 8 puces du bandeau supérieur, par clé de chip (revenue, avgRevenuePerEvent, cost,
// transactions, avgTransaction, attendees, transferRate, perCapita).
const chipDeltas = computed(() => mainDeltasRef.value?.chips || null)

// Écarts des 5 widgets de FinancialMetricsGrid, dans la forme de sa prop `deltas`.
const widgetDeltas = computed(() => {
  const w = mainDeltasRef.value?.widgets
  if (!w) return null
  return {
    tpe: w.revenuePerTpe || null,
    collaborator: w.revenuePerCollaborator || null,
    margin: w.margin || null,
    transactionRate: w.transactionRate || null,
    stock: w.stockValue || null,
  }
})

/** Pose (ou efface avec null) les écarts du principal. */
export function setMainDeltas(deltas) {
  mainDeltasRef.value = deltas || null
}

/** Fermeture du drawer : le principal retrouve ses variations Précédent / N-1. */
export function clearComparisonSession() {
  mainDeltasRef.value = null
}

export function useComparisonSession() {
  return { mainDeltas, isActive, chipDeltas, widgetDeltas, setMainDeltas, clear: clearComparisonSession }
}
