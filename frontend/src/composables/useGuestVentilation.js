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

  const plan = computed(() => sheet.value?.plan || null)
  const lines = computed(() => buildDepositLines(plan.value, sheet.value?.deposits || []))
  const groups = computed(() => groupDepositLinesByItem(lines.value))
  const movements = computed(() => sheet.value?.movements || [])

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

  async function deposit({ rowKey, packed, loose, depositorName }) {
    await createGuestVentilationDeposit({ rowKey, packed, loose, depositorName })
    await load({ silent: true })
  }

  async function cancel(movementId) {
    await cancelGuestVentilationDeposit(movementId)
    await load({ silent: true })
  }

  return { sheet, plan, groups, movements, loading, error, load, deposit, cancel }
}
