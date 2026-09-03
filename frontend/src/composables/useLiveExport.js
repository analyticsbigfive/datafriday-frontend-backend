import { ref } from 'vue'
import { safeSheetName } from '@/utils/analyseAggregations'

/**
 * Export xlsx/csv Live — instantané des records item-level (filtrés) de l'event
 * en cours. Volontairement plus simple qu'useAnalyseExport/useAnalyseDataset
 * (dataset multi-table d'Analyse, multi-event) : Live n'a qu'un seul event et
 * qu'une seule table pertinente (PdV × article).
 *
 * @param {import('vue').ComputedRef<string>} spaceName
 * @param {import('vue').ComputedRef<Array<object>>} records
 */
export function useLiveExport({ spaceName, records }) {
  const exporting = ref(false)

  function fileBase() {
    const slug = String(spaceName.value || 'live')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
    return `live-${slug || 'espace'}-${new Date().toISOString().slice(0, 10)}`
  }

  const HEADERS = ['PdV', 'Type', 'Zone', 'Article', 'Type article', 'Catégorie', 'Quantité', 'Transactions', 'CA HT']

  function rows() {
    return records.value.map((r) => [
      r.shopName || '',
      r.shopType || '',
      r.shopArea || '',
      r.menuItemName || '',
      r.menuItemType || '',
      r.menuItemCategory || '',
      Number(r.quantity) || 0,
      Number(r.transactionCount) || 0,
      Number(r.revenue) || 0,
    ])
  }

  async function onExportXlsx() {
    exporting.value = true
    try {
      const XLSX = await import('xlsx')
      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.aoa_to_sheet([HEADERS, ...rows()])
      XLSX.utils.book_append_sheet(wb, ws, safeSheetName('Live', new Set()))
      XLSX.writeFile(wb, `${fileBase()}.xlsx`)
    } finally {
      exporting.value = false
    }
  }

  function onExportCsv() {
    const sep = ';'
    const bom = '﻿'
    const lines = [HEADERS, ...rows()].map((row) =>
      row.map((v) => (typeof v === 'string' && (v.includes(sep) || v.includes('"'))
        ? `"${v.replace(/"/g, '""')}"`
        : v)).join(sep),
    )
    const blob = new Blob([bom + lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${fileBase()}.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  return { exporting, onExportXlsx, onExportCsv }
}
