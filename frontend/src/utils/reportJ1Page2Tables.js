// Fonctions pures de mise en page des tables et légendes de la page 2 du rapport J+1.

/** Nombre de lignes qui tiennent dans une hauteur donnée (jamais négatif). */
export function rowCapacity(heightPx, rowPx, headerPx = 0) {
  const row = Number(rowPx)
  if (!(row > 0)) return 0
  const room = (Number(heightPx) || 0) - (Number(headerPx) || 0)
  return Math.max(0, Math.floor(room / row))
}

/** Garde les `cap` premières lignes ; hiddenCount = lignes non affichées. */
export function paginate(rows, cap) {
  const list = Array.isArray(rows) ? rows : []
  const n = Math.max(0, Math.floor(Number(cap) || 0))
  return { shown: list.slice(0, n), hiddenCount: Math.max(0, list.length - n) }
}

/**
 * Tronque à `maxChars` en coupant à un espace (jamais en plein mot) et ajoute « … » seulement
 * si le texte a été coupé. Un premier mot plus long que la limite est gardé entier.
 */
export function clampAtWord(text, maxChars) {
  const s = String(text ?? '').trim()
  if (s.length <= maxChars) return s
  const cut = s.slice(0, maxChars + 1)
  const idx = cut.lastIndexOf(' ')
  const head = idx > 0 ? cut.slice(0, idx) : s.split(' ')[0]
  const trimmed = head.replace(/[\s,;:.\-]+$/, '')
  return trimmed.length < s.length ? `${trimmed}…` : trimmed
}

/**
 * Légende de donut limitée à `maxRows` lignes : top (maxRows - 1) puis une ligne « Autres »
 * (valeur sommée) si des entrées restent. Les entrées sont supposées triées par valeur décroissante.
 */
export function donutLegend(entries, maxRows, { othersLabel = 'Others', othersColor = '#B0BEC5' } = {}) {
  const list = Array.isArray(entries) ? entries : []
  const max = Math.max(1, Math.floor(Number(maxRows) || 1))
  if (list.length <= max) return list.slice()
  const head = list.slice(0, max - 1)
  const rest = list.slice(max - 1)
  const value = rest.reduce((a, e) => a + (Number(e.value) || 0), 0)
  return [...head, { label: othersLabel, value, color: othersColor, isOthers: true }]
}

/**
 * Colonnes et lignes d'une rangée de pastilles (barres KPI / widgets) : colonnes équilibrées
 * (8 pastilles sur 2 lignes donnent 4 + 4, pas 5 + 3).
 */
export function chipGrid(count, widthPx, { minChip = 130, gap = 8 } = {}) {
  const n = Math.max(0, Math.floor(Number(count) || 0))
  if (!n) return { cols: 0, rows: 0 }
  const fit = Math.max(1, Math.floor(((Number(widthPx) || 0) + gap) / (minChip + gap)))
  const rows = Math.ceil(n / Math.min(n, fit))
  return { cols: Math.ceil(n / rows), rows }
}

/**
 * Barres : trie par valeur décroissante, garde `maxRows` lignes dont la dernière cumule le reste
 * (« Autres ») si besoin. Les valeurs nulles ou négatives sont écartées.
 */
export function barsTopN(bars, maxRows, { othersLabel = 'Others', othersColor = '#B0BEC5' } = {}) {
  const list = (Array.isArray(bars) ? bars : [])
    .filter((b) => Number(b?.value) > 0)
    .sort((a, b) => b.value - a.value)
  const out = donutLegend(list, maxRows, { othersLabel, othersColor })
  return out
}

/** Ligne « + X autres » : réserve la dernière ligne si tout ne tient pas. */
export function paginateWithMore(rows, cap) {
  const list = Array.isArray(rows) ? rows : []
  const n = Math.max(0, Math.floor(Number(cap) || 0))
  if (list.length <= n) return { shown: list.slice(), hiddenCount: 0 }
  return paginate(list, Math.max(0, n - 1))
}

/**
 * Articles par PdV : lignes à plat (en-tête PdV puis articles) réparties en `cols` colonnes de
 * `perCol` lignes. Jamais d'en-tête de PdV orphelin en bas d'une colonne. Si tout ne tient pas,
 * la dernière ligne de la dernière colonne est libérée pour « + X autres » (hiddenItems = articles
 * non affichés).
 * @returns {{ columns: Array<Array<{type:'shop'|'item', shop:string, total?:number, qty:number, name?:string, revenue:number}>>, hiddenItems: number }}
 */
export function layoutItemsByShop(shops, perCol, cols = 1) {
  const per = Math.max(0, Math.floor(Number(perCol) || 0))
  const nCols = Math.max(1, Math.floor(Number(cols) || 1))
  const flat = []
  for (const s of Array.isArray(shops) ? shops : []) {
    const items = Array.isArray(s.items) ? s.items : []
    if (!items.length) continue
    flat.push({
      type: 'shop',
      shop: s.shop,
      revenue: Number(s.total) || 0,
      qty: items.reduce((a, i) => a + (Number(i.qty) || 0), 0),
    })
    for (const i of items) {
      flat.push({ type: 'item', shop: s.shop, name: i.name, qty: Number(i.qty) || 0, revenue: Number(i.revenue) || 0 })
    }
  }
  const countItems = (rows) => rows.filter((r) => r.type === 'item').length
  if (per < 2) return { columns: [[]], hiddenItems: countItems(flat) }

  const columns = [[]]
  let idx = 0
  for (; idx < flat.length; idx++) {
    const row = flat[idx]
    let col = columns[columns.length - 1]
    if (col.length >= per || (row.type === 'shop' && col.length === per - 1)) {
      if (columns.length === nCols) break
      col = []
      columns.push(col)
    }
    col.push(row)
  }
  let remaining = flat.slice(idx)
  if (remaining.length) {
    const last = columns[columns.length - 1]
    if (last.length >= per) remaining = [last.pop(), ...remaining]
    while (last.length && last[last.length - 1].type === 'shop') remaining = [last.pop(), ...remaining]
  }
  return { columns, hiddenItems: countItems(remaining) }
}
