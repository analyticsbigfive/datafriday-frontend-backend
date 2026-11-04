// Export CSV du « Résumé Inventaire » (colonne de droite) : une ligne par carte
// d'article. Mêmes conventions que `exportInventoryCsv` (séparateur « ; », champs
// entre guillemets, BOM UTF-8 pour Excel).

const quote = (col) => `"${String(col ?? '').replace(/"/g, '""')}"`

/**
 * @param {Array<{itemName:string,totalUnits:number,unit?:string,costValue?:number|null}>} rows
 * @param {{item:string, units:string, unit:string, cost:string}} labels en-têtes (i18n)
 */
export function buildSummaryCsv(rows = [], labels) {
  const header = [labels.item, labels.units, labels.unit, labels.cost]
  const body = (rows || []).map((r) => [
    r.itemName,
    Math.round(Number(r.totalUnits || 0) * 100) / 100,
    r.unit || '',
    // Coût absent ou nul : cellule vide, jamais un 0 inventé.
    Number(r.costValue) > 0 ? Number(r.costValue).toFixed(2) : '',
  ])
  return [header, ...body].map((cols) => cols.map(quote).join(';')).join('\n')
}

export function downloadCsv(filename, csv) {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** Nom de fichier sûr : « resume-inventaire-<suffixe>.csv ». */
export function summaryCsvFilename(suffix) {
  const slug = String(suffix || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
  return `resume-inventaire${slug ? `-${slug}` : ''}.csv`
}
