// src/utils/componentDetailBatch.js
//
// Détail de plusieurs composants par LOTS, au lieu d'un `GET /menu-components/:id` par composant
// (43 appels à chaque ouverture d'Event Predict ou de Commandes, dont la moitié refusée par le
// limiteur : mesuré le 2026-11-16, MESURES_LOT0.md section 14).
//
// Chaque lot est indépendant : un lot en échec (réseau, 429, backend sans la route `by-ids`
// pas encore déployé) ne perd que ses ids, que l'appelant relit alors un par un comme avant.

/** Plafond serveur : 100 ids par appel ; 50 garde une URL courte. */
export const COMPONENT_DETAIL_BATCH_SIZE = 50

function unwrapRows(res) {
  if (Array.isArray(res)) return res
  if (Array.isArray(res?.data)) return res.data
  if (Array.isArray(res?.data?.data)) return res.data.data
  return null
}

/**
 * @param {Object}   args
 * @param {Array}    args.ids         ids de composants (doublons et vides ignorés)
 * @param {Function} args.fetchBatch  async (ids: string[]) => { data: Object[] }
 * @param {number}   [args.chunkSize]
 * @returns {Promise<{details: Map<string, Object>, failedIds: Set<string>}>}
 *   `details` : id vers détail pour les ids que le serveur a rendus. Un id d'un lot RÉUSSI
 *   mais absent de la réponse est inconnu, supprimé ou hors périmètre : il n'est ni dans
 *   `details` ni dans `failedIds`, et il ne faut pas le relire. `failedIds` : ids des lots
 *   en échec, à relire par un autre chemin.
 */
export async function loadComponentDetails({ ids, fetchBatch, chunkSize = COMPONENT_DETAIL_BATCH_SIZE }) {
  const unique = [...new Set((ids || []).filter((x) => x != null && x !== '').map(String))]
  const details = new Map()
  const failedIds = new Set()
  if (!unique.length) return { details, failedIds }
  if (typeof fetchBatch !== 'function') {
    unique.forEach((id) => failedIds.add(id))
    return { details, failedIds }
  }
  const size = Math.max(1, chunkSize || COMPONENT_DETAIL_BATCH_SIZE)
  const chunks = []
  for (let i = 0; i < unique.length; i += size) chunks.push(unique.slice(i, i + size))
  await Promise.all(
    chunks.map(async (chunk) => {
      try {
        const rows = unwrapRows(await fetchBatch(chunk))
        if (!rows) throw new Error('réponse inattendue')
        for (const row of rows) if (row?.id != null) details.set(String(row.id), row)
      } catch (_) {
        chunk.forEach((id) => failedIds.add(id))
      }
    }),
  )
  return { details, failedIds }
}
