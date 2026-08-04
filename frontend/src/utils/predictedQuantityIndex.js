import { normalizeStr } from './predictiveAnalytics'

/**
 * Indexation des quantités prédites issues de la timeline, PARTAGÉE entre
 * l'écran Menus (EventPredictMenusSection) et l'écran Stock-up
 * (EventPredictStockUpSection).
 *
 * BUG-290-01 : les deux écrans reçoivent la MÊME donnée
 * (`EventPredictView.vue` passe `activeTimelineData` aux deux) mais l'indexaient
 * différemment. Le Stock-up n'indexait que par `shopId` et par
 * `menuItemId || mappedMenuItemId`, sans repli par nom. Or `menuItemId` porte
 * l'id du PRODUIT DE VENTE (Weezevent) et `mappedMenuItemId` l'id CATALOGUE
 * (cf. `timelineBucketing.js` :174 et :204) : interrogé avec l'id catalogue,
 * l'index du Stock-up ne trouvait rien → prédiction 0 → l'article était écarté
 * du stock-up (`shopStockData`, garde `adjustedQty === 0`). Le Menus, lui,
 * indexait aussi par nom et s'en sortait — d'où deux valeurs différentes pour
 * le même couple shop × article.
 *
 * Une seule implémentation ici, consommée par les deux écrans.
 */

/**
 * ⚠️ La MÊME quantité est indexée sous PLUSIEURS clés (id d'item ET nom d'item,
 * pour chaque alias de shop). La lecture doit donc prendre un MAX, jamais une
 * somme — sinon un article présent sous ses deux clés est compté deux fois.
 * C'est exactement le piège qu'il faut éviter en branchant le Stock-up, qui
 * sommait (`q += count`) sur un index qui n'avait qu'une seule clé par item.
 * Utiliser `lookupPredictedQuantity` ci-dessous plutôt que de relire l'index
 * à la main.
 *
 * Clés SHOP : id brut (`shopId`) ET nom normalisé (`normalizeStr(shopName)`).
 * Le nom est la clé STABLE inter-config : les records prédits portent le shopId
 * d'UNE config (celle des ventes passées), mais l'utilisateur peut afficher une
 * AUTRE config dont les elementId diffèrent pour le même shop physique (même
 * nom). Sans la clé nom, tous les items ressortent à 0 sur ces configs.
 *
 * Clés ITEM : id (`menuItemId || mappedMenuItemId`) ET nom en minuscules. La
 * timeline peut ne pas exposer un `menuItemId` mappé au catalogue → repli nom.
 *
 * @param {Array<object>} records - records de timeline prédite
 * @returns {Map<string, number>} Map `${shopKey}|${itemKey}` → quantité
 */
export function buildTimelineQuantityIndex(records) {
  const idx = new Map()
  const data = records || []
  for (const r of data) {
    const qty = r.totalQuantity || 0
    const shopKeys = [
      ...new Set(
        [r.shopId || r.shop, r.shopName ? normalizeStr(r.shopName) : null].filter(Boolean),
      ),
    ]
    if (!shopKeys.length) continue
    const idKey = r.menuItemId || r.mappedMenuItemId
    const nameKey =
      r.itemName || r.menuItemName
        ? String(r.itemName || r.menuItemName).toLowerCase()
        : null
    for (const sk of shopKeys) {
      if (idKey) {
        const k = `${sk}|${idKey}`
        idx.set(k, (idx.get(k) || 0) + qty)
      }
      if (nameKey) {
        const k = `${sk}|${nameKey}`
        idx.set(k, (idx.get(k) || 0) + qty)
      }
    }
  }
  return idx
}

/**
 * Clés SHOP de lecture pour un élément de configuration — miroir de
 * l'indexation ci-dessus (id, registryId, nom normalisé).
 */
export function shopLookupKeys(element) {
  if (!element) return []
  return [
    ...new Set([element.id, element.registryId, normalizeStr(element.name)].filter(Boolean)),
  ]
}

/**
 * Clés ITEM de lecture pour un menu item — id catalogue puis nom en minuscules.
 * L'ordre compte : l'id est la clé la plus spécifique, le nom n'est qu'un repli.
 */
export function itemLookupKeys(menuItemId, menuItem) {
  return [
    ...new Set(
      [
        menuItemId,
        menuItem && menuItem.name ? String(menuItem.name).toLowerCase() : null,
      ].filter(Boolean),
    ),
  ]
}

/**
 * Lit la quantité prédite dans l'index : MAX sur les clés shop, et pour chaque
 * shop on s'arrête à la PREMIÈRE clé item qui matche (`break`) — l'id prime sur
 * le nom, et on ne cumule jamais deux clés qui désignent le même article.
 *
 * @param {Map<string, number>} index - produit par `buildTimelineQuantityIndex`
 * @param {string[]} shopKeys - cf. `shopLookupKeys`
 * @param {string[]} itemKeys - cf. `itemLookupKeys`
 * @returns {number} quantité prédite, arrondie
 */
export function lookupPredictedQuantity(index, shopKeys, itemKeys) {
  if (!index || !index.size) return 0
  let q = 0
  for (const sk of shopKeys) {
    for (const ik of itemKeys) {
      const c = index.get(`${sk}|${ik}`)
      if (c) {
        if (c > q) q = c
        break
      }
    }
  }
  return Math.round(q)
}
