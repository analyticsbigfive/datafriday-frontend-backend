// Bornes du curseur « Début – Fin » de l'onglet Staff (Event Predict).
//
// Base = fenêtre suggérée par le serveur (portes − 2 h → fin + 1 h,
// `schedule.startTime/endTime`). Élargie aux horaires des lignes qui en sortent :
// une ligne modifiée à la main AVANT un changement d'heures de l'event garde ses
// horaires (userModified, jamais recalée), et un curseur borné plus étroit que sa
// valeur affichait un thumb collé au bord et une plage fausse.

/**
 * @param {{ min: number, max: number }} base bornes en minutes (fenêtre suggérée)
 * @param {Array<{ lines?: Array<{ startTime?: string|Date|null, endTime?: string|Date|null }> }>} elements
 * @param {(iso: string|Date) => number} toMin conversion instant → minutes (repère du jour)
 * @returns {{ min: number, max: number }}
 */
export function staffSliderBounds(base, elements, toMin) {
  let { min, max } = base
  for (const el of elements || []) {
    for (const line of el?.lines || []) {
      if (line?.startTime != null) min = Math.min(min, toMin(line.startTime))
      if (line?.endTime != null) max = Math.max(max, toMin(line.endTime))
    }
  }
  return { min, max }
}
