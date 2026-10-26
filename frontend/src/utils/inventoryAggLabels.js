/**
 * Libellés de l'agrégat inventaire (colonne de droite, pré et post event).
 *
 * Le nom du packaging (« Fût », « Carton ») et l'unité (« L », « kg ») viennent
 * de l'article. Sans eux on retombe sur les libellés génériques « Emballées »
 * et « Vrac », et sur « Total unités » pour le total.
 */
const clean = (value) => String(value ?? '').trim()

export function aggPackagingLabel(item, fallback) {
  return clean(item?.packagingLabel) || fallback
}

export function aggUnitLabel(item, fallback) {
  return clean(item?.unit) || fallback
}
