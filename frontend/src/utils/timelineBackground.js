// Fond "prédit" de EventTimelineChart : la courbe totale du Predict sauvegardé, tracée en
// teinte claire sur toute la durée de l'événement, sous la courbe réelle empilée.
//
// Fonctions pures (aucun état), séparées du composant pour le garder lisible.

// Teinte du fond : ardoise de la palette Tailwind déjà utilisée par le graphique (ticks
// #64748b / #94a3b8). Version claire du ton "neutre" du graphique, distincte des couleurs
// de séries, qui restent à pleine saturation pour le réel.
export const BACKGROUND_COLORS = Object.freeze({
  light: { fill: 'rgba(148, 163, 184, 0.28)', line: 'rgba(100, 116, 139, 0.75)' },
  dark: { fill: 'rgba(148, 163, 184, 0.22)', line: 'rgba(203, 213, 225, 0.7)' },
})

/**
 * Indexe les lignes de fond par clé d'axe.
 *
 * @param {Array<object>} rows lignes { minute, minuteLocal, totalQuantity, totalRevenue }
 * @param {'totalRevenue'|'totalQuantity'} valueField
 * @param {{ datedKey:(v:any)=>string|null, label:(v:any)=>string|null, keyByLabel?:Map<string,string> }} helpers
 *   datedKey / label : mêmes bucketisations que la série réelle (alignement des minutes).
 *   keyByLabel : HH:MM -> clé datée de la série réelle, pour rattacher un fond NON daté.
 * @returns {{ values: Map<string, number>, labels: Map<string, string> }}
 */
export function indexBackgroundRows(rows, valueField, helpers) {
  const values = new Map()
  const labels = new Map()
  if (!Array.isArray(rows)) return { values, labels }
  for (const r of rows) {
    if (!r) continue
    const label = helpers.label(r.minute)
    if (!label) continue
    const key = helpers.datedKey(r.minuteLocal ?? r.minute) || helpers.keyByLabel?.get(label) || label
    values.set(key, (values.get(key) || 0) + (Number(r[valueField]) || 0))
    if (!labels.has(key)) labels.set(key, label)
  }
  return { values, labels }
}

/**
 * Valeurs d'un jeu de données réel alignées sur l'axe fusionné : les minutes APRÈS la
 * dernière vente réelle restent vides (null), pour que la courbe réelle "avance" sur le
 * fond au lieu de s'écraser à zéro jusqu'à la fin de l'événement.
 */
export function maskFutureReal(values, keys, lastRealKey) {
  if (lastRealKey == null) return values
  return values.map((v, i) => (keys[i] > lastRealKey ? null : v))
}

/**
 * Jeu de données Chart.js du fond. `isBackground` sert à le retirer de la légende native
 * (la légende "Réel / Prédit" est dessinée par le composant).
 */
export function buildBackgroundDataset({ label, values, keys, isDark }) {
  const c = isDark ? BACKGROUND_COLORS.dark : BACKGROUND_COLORS.light
  return {
    label,
    data: keys.map((k) => values.get(k) ?? 0),
    isBackground: true,
    backgroundColor: c.fill,
    borderColor: c.line,
    borderWidth: 1.5,
    borderDash: [5, 4],
    pointRadius: 0,
    pointHoverRadius: 0,
    tension: 0.25,
    fill: 'origin',
    // Pile distincte de celle du réel ('tl') : le fond n'est jamais empilé avec les séries.
    stack: 'bg',
    // Chart.js dessine les `order` les plus élevés en premier : le fond reste derrière.
    order: 10,
  }
}
