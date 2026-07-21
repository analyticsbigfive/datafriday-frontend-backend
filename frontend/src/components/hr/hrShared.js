// Partagé entre les onglets RH (HrSuppliersTab / HrPositionsTab).
// Secteurs = liste fermée héritée du prototype (validée par l'usage, cf. modules/11 §6).

export const HR_SECTORS = ['F&B', 'Hospitality', 'Merch', 'Ticketing', 'Access', 'Kitchen', 'Entertainment']

export function csvEscape(value) {
  const v = value == null ? '' : String(value)
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

export function downloadCsv(filename, content) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// Parseur CSV minimal avec guillemets ("" = échappement). Retourne
// { headers: string[] (trim), rows: string[][] } ; lignes vides ignorées.
export function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1 } else inQuotes = false
      } else field += c
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field); field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i += 1
      row.push(field); field = ''
      if (row.some((v) => v !== '')) rows.push(row)
      row = []
    } else field += c
  }
  row.push(field)
  if (row.some((v) => v !== '')) rows.push(row)
  const headers = (rows.shift() || []).map((h) => h.trim())
  return { headers, rows }
}
