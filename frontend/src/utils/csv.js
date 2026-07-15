/**
 * Sérialise un tableau de lignes (chaque ligne = tableau de valeurs) en CSV
 * et déclenche le téléchargement. Gère l'échappement RFC 4180 et révoque
 * l'URL objet après le clic pour éviter les fuites mémoire.
 *
 * @param {Array<Array<string>>} rows  En-tête inclus en première ligne
 * @param {string} filename            Nom du fichier sans extension
 */
export function downloadCSV(rows, filename) {
  const content = rows
    .map((row) =>
      row
        .map((cell) => {
          const s = String(cell ?? '')
          return s.includes(',') || s.includes('"') || s.includes('\n')
            ? '"' + s.replace(/"/g, '""') + '"'
            : s
        })
        .join(',')
    )
    .join('\n')

  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.setAttribute('href', url)
  link.setAttribute('download', `${filename}-${new Date().toISOString().split('T')[0]}.csv`)
  link.style.visibility = 'hidden'

  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Parse un texte CSV (RFC 4180) en tableau de lignes.
 * Gère les guillemets doubles échappés et les virgules dans les champs.
 *
 * @param {string} text
 * @returns {Array<Array<string>>}
 */
export function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  return lines.map((line) => {
    const row = []
    let cur = ''
    let inQuote = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { cur += '"'; i++ }
        else inQuote = !inQuote
      } else if (ch === ',' && !inQuote) {
        row.push(cur.trim()); cur = ''
      } else {
        cur += ch
      }
    }
    row.push(cur.trim())
    return row
  })
}
