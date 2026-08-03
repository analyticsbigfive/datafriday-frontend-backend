/**
 * useAnalyseExport — sérialise le dataset Analyse (`useAnalyseDataset`) en
 * classeur `.xlsx` (un onglet par table) ou en `.csv` unique (tables empilées).
 *
 * Le composable ne calcule RIEN : il appelle `ensureDataset()` et met en forme.
 * Toute agrégation qui apparaîtrait ici serait une seconde vérité, invisible de
 * l'assistant qui lit le même dataset.
 *
 * Deux invariants tiennent la qualité du fichier produit :
 *
 * 1. **Les cellules numériques sont des `Number`**, jamais des chaînes déjà
 *    formatées. Le format d'affichage passe par `cell.z`. Sans ça, Excel traite
 *    « 1 234,56 € » comme du texte : ni somme, ni tableau croisé — c'est-à-dire
 *    exactement l'usage pour lequel on exporte.
 * 2. **Les noms d'onglets passent par `safeSheetName`.** Reprendre les titres
 *    affichés (décision produit) fait dépasser les 31 caractères d'Excel dès le
 *    premier export, et un nom d'événement saisi librement peut contenir
 *    n'importe lequel des caractères interdits.
 */

import { ref } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import { safeSheetName } from '@/utils/analyseAggregations'

/** Formats Excel par type de colonne. `null` = texte, aucun format appliqué. */
const CELL_FORMAT = {
  currency: '#,##0.00 €',
  number: '#,##0.00',
  int: '#,##0',
  // Format littéral et NON le format pourcentage natif d'Excel : celui-ci
  // attendrait 0.273 pour afficher 27,3 %. Le dataset porte 27.3, une seule
  // convention partout.
  percent: '0.0"%"',
}

const NUMERIC_FORMATS = new Set(['currency', 'number', 'int', 'percent'])

/** Séparateur et BOM d'Excel FR : sans eux, le double-clic casse accents et colonnes. */
const CSV_SEP = ';'
const CSV_BOM = '\uFEFF'

export function useAnalyseExport({ ensureDataset, spaceName, isPredictMode, notify }) {
  const { t } = useI18n()
  const exporting = ref(false)

  function fileBase() {
    const slug = String(spaceName.value || 'analyse')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'analyse'
    const day = new Date().toISOString().split('T')[0]
    // Suffixe explicite : un classeur de prévisions transféré sans mention se lit
    // comme du réalisé.
    return `analyse-${slug}-${day}${isPredictMode.value ? '-predict' : ''}`
  }

  function download(blob, filename) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  /** Une table → matrice de cellules, en-têtes compris. */
  function tableToAoa(table) {
    const header = table.columns.map((c) => c.label)
    const body = table.rows.map((row) =>
      table.columns.map((c) => {
        const v = row[c.key]
        if (v == null) return null
        return NUMERIC_FORMATS.has(c.format) ? Number(v) : String(v)
      }),
    )
    return [header, ...body]
  }

  async function onExportXlsx() {
    if (exporting.value) return
    exporting.value = true
    try {
      const dataset = ensureDataset()
      const XLSX = await import('xlsx')
      const wb = XLSX.utils.book_new()
      const used = new Set()

      for (const table of dataset.tables) {
        const ws = XLSX.utils.aoa_to_sheet(tableToAoa(table))

        // Formats numériques, colonne par colonne. `aoa_to_sheet` a déjà typé les
        // cellules ('n' vs 's') — on ne fait qu'ajouter l'affichage.
        table.columns.forEach((c, colIndex) => {
          const fmt = CELL_FORMAT[c.format]
          if (!fmt) return
          for (let r = 1; r <= table.rows.length; r += 1) {
            const cell = ws[XLSX.utils.encode_cell({ r, c: colIndex })]
            if (cell && cell.t === 'n') cell.z = fmt
          }
        })

        // Largeurs approchées : le contenu le plus long de la colonne, borné.
        ws['!cols'] = table.columns.map((c) => {
          const longest = table.rows.reduce(
            (max, row) => Math.max(max, String(row[c.key] ?? '').length),
            c.label.length,
          )
          return { wch: Math.min(Math.max(longest + 2, 10), 44) }
        })

        XLSX.utils.book_append_sheet(wb, ws, safeSheetName(table.title, used))
      }

      XLSX.writeFile(wb, `${fileBase()}.xlsx`)
      notify(t('anExportDone'))
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[useAnalyseExport] xlsx', e)
      notify(t('anExportError'), 'error')
    } finally {
      exporting.value = false
    }
  }

  /** Échappement RFC 4180 appliqué au séparateur `;`. */
  function csvCell(value, format) {
    if (value == null) return ''
    if (NUMERIC_FORMATS.has(format)) {
      // Décimales en virgule : c'est ce qu'Excel FR attend d'un CSV. La cellule
      // reste numérique à l'ouverture, donc sommable.
      return String(value).replace('.', ',')
    }
    const s = String(value)
    return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }

  function onExportCsv() {
    if (exporting.value) return
    exporting.value = true
    try {
      const dataset = ensureDataset()
      const blocks = dataset.tables.map((table) => {
        const lines = []
        // Le titre COMPLET, non tronqué : aucune des limites d'Excel sur les noms
        // d'onglets ne s'applique ici.
        lines.push(`# ${csvCell(table.title)}`)
        lines.push(table.columns.map((c) => csvCell(c.label)).join(CSV_SEP))
        for (const row of table.rows) {
          lines.push(table.columns.map((c) => csvCell(row[c.key], c.format)).join(CSV_SEP))
        }
        return lines.join('\r\n')
      })

      const content = CSV_BOM + blocks.join('\r\n\r\n') + '\r\n'
      download(new Blob([content], { type: 'text/csv;charset=utf-8;' }), `${fileBase()}.csv`)
      notify(t('anExportDone'))
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[useAnalyseExport] csv', e)
      notify(t('anExportError'), 'error')
    } finally {
      exporting.value = false
    }
  }

  return {
    exporting,
    onExportXlsx,
    onExportCsv,
  }
}
