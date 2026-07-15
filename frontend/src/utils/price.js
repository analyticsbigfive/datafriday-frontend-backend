/**
 * Helpers prix HT/TTC — source de vérité PARTAGÉE.
 *
 * Convention DataFriday : le **HT** est la vérité de tout CA / marge / prédiction.
 * Le backend expose déjà `shopGranularData[].revenueHt` (HT) ; les prix Weezevent
 * (`weezeventProducts[].basePrice`) et les prix catalogue par espace
 * (`spacePrices[].price`) sont en **TTC**, accompagnés d'un `vatRate` en POURCENTAGE
 * (échantillons backend : 10, 5.5, 20).
 *
 * Utiliser `htFromTtc` au SEUL point d'entrée d'un prix TTC (map Weezevent, prix
 * catalogue) — jamais sur une valeur déjà HT (ex. revenueHt / rev÷qty) sous peine
 * de double-détaxe. Cf. docs/HT_TTC_PREDICT.md.
 */

/**
 * Convertit un prix TTC en HT via un taux de TVA exprimé en POURCENTAGE.
 * Garde-fou : taux absent / 0 / non fini → renvoie la valeur telle quelle
 * (pas de division par zéro, pas de détaxe hasardeuse).
 *
 * @param {number|string|null} ttc  Prix TTC.
 * @param {number|string|null} vatRate  Taux de TVA en % (10, 5.5, 20…).
 * @returns {number|null} Prix HT, ou `null` si `ttc` n'est pas un nombre fini.
 */
export function htFromTtc(ttc, vatRate) {
  const t = Number(ttc)
  if (!Number.isFinite(t)) return null
  const v = vatRate != null ? Number(vatRate) : null
  return v != null && Number.isFinite(v) && v > 0 ? t / (1 + v / 100) : t
}

/**
 * Prix unitaire HT d'un menu item, pour un espace donné. Le backend expose
 * DÉJÀ le HT (`pricing.gross.ht`, `spacePricing[spaceId].gross.ht`) — on le
 * lit en priorité ; sinon on détaxe le TTC (`basePrice` / prix par espace) via
 * le `vatRate` effectif. Un item SYNTHÉTIQUE (timeline/Weezevent) n'a ni
 * `pricing` ni `vatRate` : son `basePrice` est déjà HT (map Weezevent détaxée
 * en amont) → repli passthrough, JAMAIS de re-détaxe.
 *
 * Ordre de résolution :
 *  1. HT direct par espace   `spacePricing[spaceId].gross.ht`
 *  2. HT direct global        `pricing.gross.ht`
 *  3. Détaxe TTC par espace   (spacePricing objet OU spaceSpecificPrices[])
 *  4. Détaxe TTC global       `htFromTtc(basePrice, pricing.vatRate ?? vatRate)`
 *  5. Repli                    `basePrice` tel quel (synthétique = déjà HT)
 *
 * @param {object} mi  Menu item normalisé.
 * @param {string|null} spaceId  Espace courant (prix propre à l'espace).
 * @returns {number} Prix unitaire HT (0 si indéterminable).
 */
export function menuItemPriceHt(mi, spaceId = null) {
  if (!mi || typeof mi !== 'object') return 0

  // --- Prix propre à l'espace -------------------------------------------------
  // Forme objet `spacePricing[spaceId] = { gross:{ttc,ht}, vatRate, price }`.
  const spEntry =
    spaceId && mi.spacePricing && typeof mi.spacePricing === 'object'
      ? mi.spacePricing[spaceId]
      : null
  if (spEntry) {
    if (spEntry.gross?.ht != null && Number.isFinite(Number(spEntry.gross.ht))) {
      return Number(spEntry.gross.ht) // (1) HT direct par espace
    }
    const ttc = spEntry.price ?? spEntry.gross?.ttc
    const ht = htFromTtc(ttc, spEntry.vatRate ?? mi.pricing?.vatRate ?? mi.vatRate)
    if (ht != null) return ht // (3a)
  }
  // Forme legacy `spaceSpecificPrices[] = [{ spaceIds:[], price, vatRate }]`.
  if (spaceId && Array.isArray(mi.spaceSpecificPrices)) {
    const e = mi.spaceSpecificPrices.find(
      (p) => Array.isArray(p?.spaceIds) && p.spaceIds.includes(spaceId),
    )
    if (e && e.price != null) {
      const ht = htFromTtc(e.price, e.vatRate ?? mi.pricing?.vatRate ?? mi.vatRate)
      if (ht != null) return ht // (3b)
    }
  }
  // Forme DB brute `spacePrices[spaceId] = { ttc, vatRate }` (colonne MenuItem).
  const spRaw =
    spaceId && mi.spacePrices && typeof mi.spacePrices === 'object'
      ? mi.spacePrices[spaceId]
      : null
  if (spRaw && (spRaw.ttc != null || spRaw.price != null)) {
    const ht = htFromTtc(spRaw.ttc ?? spRaw.price, spRaw.vatRate ?? mi.pricing?.vatRate ?? mi.vatRate)
    if (ht != null) return ht // (3c)
  }

  // --- Prix global ------------------------------------------------------------
  if (mi.pricing?.gross?.ht != null && Number.isFinite(Number(mi.pricing.gross.ht))) {
    return Number(mi.pricing.gross.ht) // (2) HT direct global
  }
  const globalHt = htFromTtc(mi.basePrice, mi.pricing?.vatRate ?? mi.vatRate)
  if (globalHt != null && (mi.pricing?.vatRate != null || mi.vatRate != null)) {
    return globalHt // (4) détaxe TTC global (uniquement si un taux est connu)
  }

  // --- Repli : synthétique (basePrice déjà HT) ou prix nu sans taux -----------
  return Number(mi.basePrice) || 0 // (5)
}
