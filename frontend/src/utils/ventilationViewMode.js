// Bascule « Par PdV / Par article » du mode Ventilation, mémorisée sur l'appareil
// (écran Logistique et page des logisticiens). « Par article » (menu items) par
// défaut (décision Ulrich du 2026-10-09).

import { VENTILATION_VIEW_BY_ITEM, VENTILATION_VIEW_BY_SHOP } from '@/utils/ventilationViews'

const VIEW_MODE_KEY = 'logistic.ventilation.viewMode'

export function normalizeViewMode(mode) {
  return mode === VENTILATION_VIEW_BY_SHOP ? VENTILATION_VIEW_BY_SHOP : VENTILATION_VIEW_BY_ITEM
}

export function readViewMode() {
  try {
    return normalizeViewMode(localStorage.getItem(VIEW_MODE_KEY))
  } catch {
    return VENTILATION_VIEW_BY_ITEM
  }
}

export function writeViewMode(mode) {
  try {
    localStorage.setItem(VIEW_MODE_KEY, normalizeViewMode(mode))
  } catch {
    /* stockage indisponible : la bascule reviendra au défaut */
  }
}
