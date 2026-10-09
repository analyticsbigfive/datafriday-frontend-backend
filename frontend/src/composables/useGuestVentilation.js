// src/composables/useGuestVentilation.js
//
// Feuille de ventilation du logisticien connecté par PIN (chantier logistic_ventilation,
// partie 3). Le serveur renvoie les données brutes (feuille de réarmement du match,
// corrections, lignes cochées « réarmé », dépôts) ; le reste à déposer est calculé
// ICI avec le même code que l'écran Logistique (utils/restockDepositSheet.js), pour
// que les deux écrans affichent toujours le même chiffre.

import { ref, computed } from 'vue'
import {
  getGuestVentilationSheet,
  createGuestVentilationDeposit,
  cancelGuestVentilationDeposit,
} from '@/api/endpoints/guestPin.api'
import { buildDepositLines, groupDepositLinesByItem } from '@/utils/restockDepositSheet'
import { mergeRestockPlans, allocateDeposit } from '@/utils/ventilationPlans'
import { readViewMode, writeViewMode, normalizeViewMode } from '@/utils/ventilationViewMode'

const DEPOSITOR_KEY = 'guestPin.depositorName'

/** Prénom du logisticien, gardé sur l'appareil (décision #78). */
export function readDepositorName() {
  try {
    return localStorage.getItem(DEPOSITOR_KEY) || ''
  } catch {
    return ''
  }
}

export function writeDepositorName(name) {
  try {
    localStorage.setItem(DEPOSITOR_KEY, String(name || '').trim())
  } catch {
    /* stockage indisponible : le prénom sera redemandé */
  }
}

export function useGuestVentilation() {
  const sheet = ref(null)
  const loading = ref(false)
  const error = ref(null)

  // Feuilles des matchs de l'accès (PIN du premier match d'une sélection), fusionnées
  // comme sur l'écran Logistique (utils/ventilationPlans.js).
  const plan = computed(() => mergeRestockPlans(sheet.value?.plans || [], sheet.value?.eventOrder || []))
  const lines = computed(() => buildDepositLines(plan.value, sheet.value?.deposits || []))
  const groups = computed(() => groupDepositLinesByItem(lines.value))
  const movements = computed(() => sheet.value?.movements || [])
  // Stockages du match : section « Espaces de stockage », même sans rien à y déposer.
  const storages = computed(() => sheet.value?.storages || [])
  const viewMode = ref(readViewMode())

  function setViewMode(mode) {
    viewMode.value = normalizeViewMode(mode)
    writeViewMode(viewMode.value)
  }

  async function load({ silent = false } = {}) {
    if (!silent) loading.value = true
    try {
      sheet.value = await getGuestVentilationSheet()
      error.value = null
    } catch (e) {
      error.value = e?.response?.data?.message || e?.message || 'error'
    } finally {
      loading.value = false
    }
  }

  /**
   * Dépôt sur une destination de la feuille (réparti entre les feuilles qui la
   * portent, match le plus proche d'abord) ou dans un stockage sans ligne prévue
   * (`storageId` + `itemName`).
   */
  async function deposit({ parts = [], unitsPerPack = null, storageId, itemName, packed, loose, depositorName }) {
    let written = 0
    try {
      if (!parts.length) {
        await createGuestVentilationDeposit({ storageId, itemName, packed, loose, depositorName })
      } else {
        for (const share of allocateDeposit({ packed, loose }, parts, unitsPerPack)) {
          // eslint-disable-next-line no-await-in-loop -- mouvements du même niveau de stock, dans l'ordre
          await createGuestVentilationDeposit({ rowKey: share.rowKey, packed: share.packed, loose: share.loose, depositorName })
          written += 1
        }
      }
    } catch (e) {
      // Une part déjà enregistrée : l'appelant ferme la saisie (réessayer la doublerait).
      e.partialDeposit = written > 0
      throw e
    } finally {
      // Relue même après un échec : une part déjà enregistrée apparaît dans « Déjà déposé ».
      await load({ silent: true })
    }
  }

  async function cancel(movementId) {
    await cancelGuestVentilationDeposit(movementId)
    await load({ silent: true })
  }

  return { sheet, plan, groups, movements, storages, viewMode, setViewMode, loading, error, load, deposit, cancel }
}
