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
 * Tokenise le texte BRUT complet (pas de split préalable par `\n`) pour ne
 * pas couper un champ entre guillemets contenant un retour à la ligne, et
 * gère l'échappement `""` à l'intérieur d'un champ entre guillemets.
 *
 * @param {string} text
 * @returns {Array<Array<string>>}
 */
export function parseCSV(text) {
  const rows = []
  let row = []
  let cur = ''
  let inQuote = false
  const str = String(text ?? '')

  for (let i = 0; i < str.length; i++) {
    const ch = str[i]
    if (inQuote) {
      if (ch === '"') {
        if (str[i + 1] === '"') { cur += '"'; i++ }
        else inQuote = false
      } else {
        cur += ch
      }
    } else if (ch === '"') {
      inQuote = true
    } else if (ch === ',') {
      row.push(cur.trim()); cur = ''
    } else if (ch === '\r') {
      // ignoré — géré via \n (CRLF) ou fin de fichier
    } else if (ch === '\n') {
      row.push(cur.trim()); cur = ''
      rows.push(row); row = []
    } else {
      cur += ch
    }
  }
  // Dernière ligne sans retour à la ligne final
  if (cur.length > 0 || row.length > 0) {
    row.push(cur.trim())
    rows.push(row)
  }

  return rows.filter((r) => r.some((c) => c !== ''))
}
