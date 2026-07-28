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

/**
 * Génère un id unique. `crypto.randomUUID()` n'existe qu'en contexte SÉCURISÉ
 * (HTTPS ou localhost) ; sur une IP LAN en HTTP (ex. 192.168.x:8080) elle jette
 * « crypto.randomUUID is not a function ». On retombe sur `getRandomValues`
 * (dispo en HTTP), puis en tout dernier recours sur un id horodaté aléatoire.
 */
export function newId() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
  } catch (_) { /* contexte non sécurisé */ }
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const b = crypto.getRandomValues(new Uint8Array(16))
    b[6] = (b[6] & 0x0f) | 0x40
    b[8] = (b[8] & 0x3f) | 0x80
    const h = [...b].map((x) => x.toString(16).padStart(2, '0'))
    return `${h.slice(0, 4).join('')}-${h.slice(4, 6).join('')}-${h.slice(6, 8).join('')}-${h.slice(8, 10).join('')}-${h.slice(10, 16).join('')}`
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
