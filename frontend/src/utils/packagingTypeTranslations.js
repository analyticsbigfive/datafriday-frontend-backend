/**
 * Traduction 100% front des noms de conditionnement les plus courants —
 * `MarketPrice.inventoryPackaging` est du texte libre non lié à un référentiel
 * traduit ; ce petit dictionnaire évite les libellés mi-anglais mi-français
 * (ex. « TRAY de 24pcs ») sans dépendre du backend. Mots inconnus → texte brut.
 */
const PACKAGING_TYPE_TRANSLATIONS = {
  tray: { fr: 'Plateau', en: 'Tray' },
  crate: { fr: 'Caisse', en: 'Crate' },
  bag: { fr: 'Sac', en: 'Bag' },
  box: { fr: 'Carton', en: 'Box' },
  carton: { fr: 'Carton', en: 'Box' },
  bottle: { fr: 'Bouteille', en: 'Bottle' },
  keg: { fr: 'Fût', en: 'Keg' },
  fût: { fr: 'Fût', en: 'Keg' },
  fut: { fr: 'Fût', en: 'Keg' },
  cup: { fr: 'Gobelet', en: 'Cup' },
  can: { fr: 'Canette', en: 'Can' },
}

export function translatePackagingType(raw, locale) {
  if (!raw) return raw
  const entry = PACKAGING_TYPE_TRANSLATIONS[raw.trim().toLowerCase()]
  return entry?.[locale] || raw
}

/** Pluriel naïf (Bag → Bags, Sac → Sacs) — même heuristique que packedUnitsLabel
 *  (InventoryCountingInterface.vue), pour un libellé cohérent entre les deux écrans. */
export function pluralize(name) {
  const n = String(name || '').trim()
  if (!n) return n
  return /s$/i.test(n) ? n : `${n}s`
}
