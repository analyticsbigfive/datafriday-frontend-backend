// src/composables/useVentilationDepositChecks.js
//
// Checkmark de la Ventilation = dépôt réel (retour Bertrand 2026-11-10). Avant, la coche
// n'écrivait qu'une ligne de pointage (VentilationDepositCheck) : le stock des PDV ne
// bougeait pas. Ici l'état « coché » est DÉDUIT des dépôts (ligne entièrement couverte
// par les mouvements « Ventilation ») et chaque geste écrit ou annule un dépôt :
//   - cocher une ligne : dépose la quantité exacte restante (même chemin que le crayon) ;
//   - décocher : annule les dépôts de la ligne (mouvement inverse) ;
//   - cocher une carte PDV, un article ou tous les PDV : un dépôt par ligne, une à une.
// Même interface que useVentilationChecks (les composants de la liste ne changent pas) ;
// le crayon (confirmRow : quantité modifiée, commentaire) reste celui du composable de base.
// Les hôtes (Logistique, page PIN) fournissent l'écriture, l'annulation et la relecture.

import { computed, ref } from 'vue'
import { indexVentilationRows, rowId, hasPlannedQuantity } from '@/utils/ventilationRowDeposit'

/**
 * @param {Object} deps
 * @param {ReturnType<import('./useVentilationChecks').useVentilationChecks>} deps.base validations (commentaire, quantité)
 * @param {() => Array<object>} deps.groups groupes de la Ventilation affichée (lignes `covered` comprises)
 * @param {(payload:{group:object,row:object}) => Promise<void>} deps.deposit dépose la quantité restante
 * @param {(payload:{group:object,row:object}) => Promise<void>} deps.cancel annule les dépôts de la ligne
 * @param {(summary:{deposited:number, cancelled:number}) => Promise<void>} deps.afterBatch relit feuille et stock
 * @param {(error:Error) => void} deps.onError message d'erreur (les composants avalent les rejets)
 */
export function useVentilationDepositChecks({ base, groups, deposit, cancel, afterBatch, onError }) {
  const rowIndex = computed(() => indexVentilationRows(groups()))
  // Un geste à la fois : un double clic ne doit jamais déposer deux fois.
  const busy = ref(false)

  const find = (itemKey, elementId) => rowIndex.value.get(rowId(itemKey, elementId)) || null
  const isCovered = (itemKey, elementId) => find(itemKey, elementId)?.row.covered === true

  /** Ligne cochée = entièrement déposée. Le commentaire et la quantité viennent de la base. */
  function entry(itemKey, elementId) {
    return { ...base.entry(itemKey, elementId), checked: isCovered(itemKey, elementId) }
  }

  const isRowChecked = (itemKey, elementId) => isCovered(itemKey, elementId)

  /** Article coché = toutes ses lignes à déposer sont déposées. */
  function isItemChecked(itemKey) {
    const rows = [...rowIndex.value.values()].filter((e) => e.group.itemKey === itemKey && (e.row.covered || hasPlannedQuantity(e.row)))
    return rows.length > 0 && rows.every((e) => e.row.covered)
  }

  const areRowsChecked = (pairs) => pairs.length > 0 && pairs.every(([i, e]) => isCovered(i, e))

  /** Coche (next = true) ou décoche (false) les lignes données, une à une. */
  async function setRows(pairs, next) {
    if (busy.value) return
    const todo = pairs
      .map(([itemKey, elementId]) => find(itemKey, elementId))
      .filter(Boolean)
      .filter((hit) => (next ? !hit.row.covered && hasPlannedQuantity(hit.row) : hit.row.covered))
    if (!todo.length) return
    busy.value = true
    const summary = { deposited: 0, cancelled: 0 }
    try {
      for (const hit of todo) {
        // eslint-disable-next-line no-await-in-loop -- un mouvement après l'autre, même niveau de stock possible
        if (next) {
          await deposit(hit)
          summary.deposited += 1
        } else {
          await cancel(hit)
          summary.cancelled += 1
        }
      }
    } catch (e) {
      onError?.(e)
    } finally {
      // Relue même après un échec : les lignes déjà écrites doivent apparaître cochées.
      try {
        await afterBatch(summary)
      } catch (e) {
        onError?.(e)
      }
      busy.value = false
    }
  }

  const toggleRow = (itemKey, elementId) => setRows([[itemKey, elementId]], !isCovered(itemKey, elementId))
  // L'état de l'article se déduit de ses lignes : plus de coche d'article à enregistrer.
  const toggleItem = () => Promise.resolve()

  return {
    ...base,
    busy,
    entry,
    isRowChecked,
    isItemChecked,
    areRowsChecked,
    setRows,
    toggleRow,
    toggleItem,
  }
}
