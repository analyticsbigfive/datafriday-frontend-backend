// Export d'un tableau simple (Excel, PDF, impression navigateur), utilisé par le
// bouton imprimer de Logistique (maquette Bertrand du 2026-10-09 : « Excel / PDF
// ou impression dans le modal »).
//
// Forme du tableau : { title, subtitle?, columns: [{ key, label }], rows: [{ [key]: valeur }] }.
// Les librairies (xlsx, jspdf) sont chargées à la demande : rien dans le bundle de
// l'écran tant que personne n'exporte.

/** Nom de fichier sûr : « logistique-ventilation-2026-10-09 ». */
export function exportFileName(base, date = new Date()) {
  const day = date.toISOString().slice(0, 10)
  const slug = String(base || 'export')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${slug || 'export'}-${day}`
}

/** Lignes du tableau en matrice (en-tête compris), valeurs vides pour null/undefined. */
export function tableToMatrix(table) {
  const cols = table?.columns || []
  const header = cols.map((c) => c.label)
  const body = (table?.rows || []).map((row) => cols.map((c) => (row[c.key] == null ? '' : row[c.key])))
  return [header, ...body]
}

export async function downloadXlsx(table, fileBase) {
  const XLSX = await import('xlsx')
  const sheet = XLSX.utils.aoa_to_sheet(tableToMatrix(table))
  const book = XLSX.utils.book_new()
  // Excel limite le nom d'onglet à 31 caractères, sans : \ / ? * [ ].
  const sheetName = String(table?.title || 'Export').replace(/[:\\/?*[\]]/g, ' ').slice(0, 31)
  XLSX.utils.book_append_sheet(book, sheet, sheetName)
  XLSX.writeFile(book, `${fileBase}.xlsx`)
}

/** Largeurs de colonnes proportionnelles à la plus longue valeur (bornées). */
function columnWidths(matrix, totalWidth) {
  const lengths = (matrix[0] || []).map((_, i) =>
    Math.min(40, Math.max(6, ...matrix.map((r) => String(r[i] ?? '').length))),
  )
  const sum = lengths.reduce((a, b) => a + b, 0) || 1
  return lengths.map((l) => (l / sum) * totalWidth)
}

export async function downloadPdf(table, fileBase) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const margin = 12
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const matrix = tableToMatrix(table)
  const widths = columnWidths(matrix, pageWidth - margin * 2)
  const lineHeight = 6
  let y = margin

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text(String(table?.title || ''), margin, y + 4)
  y += 9
  if (table?.subtitle) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.text(String(table.subtitle), margin, y + 2)
    y += 7
  }

  const drawRow = (cells, bold) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setFontSize(8.5)
    let x = margin
    cells.forEach((cell, i) => {
      // Une ligne par cellule : texte tronqué à la largeur de sa colonne.
      const text = doc.splitTextToSize(String(cell ?? ''), widths[i] - 2)[0] || ''
      doc.text(text, x + 1, y + 4)
      x += widths[i]
    })
    y += lineHeight
    doc.setDrawColor(229, 231, 235)
    doc.line(margin, y, pageWidth - margin, y)
  }

  const [header, ...body] = matrix
  drawRow(header, true)
  for (const cells of body) {
    if (y + lineHeight > pageHeight - margin) {
      doc.addPage()
      y = margin
      drawRow(header, true)
    }
    drawRow(cells, false)
  }
  doc.save(`${fileBase}.pdf`)
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** HTML imprimable autonome (fenêtre dédiée : l'écran Logistique n'est pas imprimé tel quel). */
export function tableToPrintHtml(table) {
  const [header, ...body] = tableToMatrix(table)
  const th = header.map((h) => `<th>${escapeHtml(h)}</th>`).join('')
  const trs = body.map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`).join('')
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(table?.title)}</title>
<style>
body{font-family:Inter,Arial,sans-serif;margin:16px;color:#111827}
h1{font-size:18px;margin:0 0 4px}p{font-size:12px;color:#6b7280;margin:0 0 12px}
table{border-collapse:collapse;width:100%;font-size:11px}
th,td{border-bottom:1px solid #e5e7eb;padding:5px 6px;text-align:left;vertical-align:top}
th{background:#f9fafb;font-weight:700}
@page{size:landscape;margin:12mm}
</style></head><body>
<h1>${escapeHtml(table?.title)}</h1>${table?.subtitle ? `<p>${escapeHtml(table.subtitle)}</p>` : ''}
<table><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table>
</body></html>`
}

export function printTable(table) {
  const win = window.open('', '_blank')
  if (!win) return false
  win.document.open()
  win.document.write(tableToPrintHtml(table))
  win.document.close()
  win.focus()
  // Laisse le navigateur mettre la page en forme avant d'ouvrir la boîte d'impression.
  win.setTimeout(() => win.print(), 150)
  return true
}
