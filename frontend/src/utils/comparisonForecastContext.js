/**
 * Contexte d'affichage et d'export d'une comparaison Forecast : lignes « filtres appliqués »
 * (une par modification), libellé de résumé et lignes de la table des paramètres d'export.
 *
 * Les libellés viennent de modificationLabel : la liste du formulaire, le bandeau du rapport
 * et l'export écrivent exactement les mêmes lignes.
 */
import { effectiveModifications, modificationKey } from '@/utils/forecastModificationModel'
import { modificationLabel } from '@/utils/forecastModificationLabels'

const FILTER_ACTIVE_KEY = 'anExportFilterActive'
const COMPARISON_KEY = 'anCmpExportFilterComparison'
const MODIFICATION_KEY = 'fcstExportModification'
const SUMMARY_KEY = 'anCmpSummaryForecast'
const SEPARATOR = ' · '

/**
 * Une ligne par modification active, au même format que les « filtres appliqués » de la
 * comparaison classique ({ key, label, own }). Toutes sont propres à la comparaison.
 *
 * @param {object[]} modifications
 * @param {Object} ctx
 * @param {(key: string) => string} ctx.t
 * @param {{ items: { id: string, name: string }[] }} [ctx.options]  Options de forecastTargetOptions.
 * @param {(n: number) => string} ctx.formatCurrency
 * @returns {{ key: string, label: string, own: boolean }[]}
 */
export function forecastFilterLines(modifications, { t, options = null, formatCurrency } = {}) {
  return effectiveModifications(modifications).map((m) => ({
    key: modificationKey(m),
    label: modificationLabel(m, { t, options, formatCurrency }),
    own: true,
  }))
}

/** Résumé court de la comparaison : libellés joints, repli générique si aucune modification. */
export function forecastSummaryLabel(lines, t) {
  const labels = (Array.isArray(lines) ? lines : []).map((l) => l?.label).filter(Boolean)
  return labels.length ? labels.join(SEPARATOR) : t(SUMMARY_KEY)
}

/**
 * Adapte les lignes de la table « Paramètres » de l'export : retire la ligne des filtres
 * actifs (sans objet en Forecast) et insère une ligne par modification après la ligne du
 * libellé de comparaison (en fin de table si cette ligne est absente). Nouvelle liste.
 */
export function withForecastModificationRows(rows, lines, t) {
  const activeLabel = t(FILTER_ACTIVE_KEY)
  const comparisonLabel = t(COMPARISON_KEY)
  const kept = (Array.isArray(rows) ? rows : []).filter((r) => r?.parameter !== activeLabel)
  const added = (Array.isArray(lines) ? lines : []).map((l) => ({
    parameter: t(MODIFICATION_KEY),
    value: l.label,
  }))
  const at = kept.findIndex((r) => r?.parameter === comparisonLabel)
  const insertAt = at < 0 ? kept.length : at + 1
  return [...kept.slice(0, insertAt), ...added, ...kept.slice(insertAt)]
}
