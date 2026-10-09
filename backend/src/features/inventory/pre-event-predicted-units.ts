/** Besoin prédit archivé sur une feuille existante → blob attendu par
 *  createPreEventReconciliation ({ elementId: { itemId: unités } }). null si
 *  aucune ligne n'en porte (colonnes prédit vides, comme aujourd'hui). */
export function extractPredictedUnits(lines: unknown): Record<string, Record<string, number>> | null {
  if (!Array.isArray(lines)) return null;
  const out: Record<string, Record<string, number>> = {};
  let found = false;
  for (const l of lines as Array<Record<string, unknown>>) {
    const elementId = l?.elementId;
    const itemKey = l?.itemKey;
    const predicted = Number(l?.predictedUnits);
    if (
      typeof elementId !== 'string' ||
      typeof itemKey !== 'string' ||
      !Number.isFinite(predicted)
    )
      continue;
    (out[elementId] ??= {})[itemKey] = predicted;
    found = true;
  }
  return found ? out : null;
}
