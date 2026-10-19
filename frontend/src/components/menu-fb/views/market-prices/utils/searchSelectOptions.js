/**
 * Helpers purs de MarketPriceSearchSelect : normalisation des options et filtre de recherche.
 */

/** Minuscules sans accents, pour qu'une recherche « cafe » trouve « Café ». */
export function normalizeSearchText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Accepte des chaînes ou des objets et renvoie `{ key, title, value, search }`.
 * Les options sans titre exploitable sont écartées.
 */
export function normalizeSearchSelectOptions(items, itemTitle = 'title', itemValue = 'value') {
  const out = [];
  (items || []).forEach((item, index) => {
    const isObject = item !== null && typeof item === 'object';
    const title = isObject ? item[itemTitle] : item;
    const value = isObject ? item[itemValue] : item;
    const label = String(title ?? '').trim();
    if (!label) return;
    out.push({ key: `${index}:${String(value)}`, title: label, value, search: normalizeSearchText(label) });
  });
  return out;
}

export function filterSearchSelectOptions(options, query) {
  const q = normalizeSearchText(query);
  if (!q) return options;
  return options.filter((o) => o.search.includes(q));
}
