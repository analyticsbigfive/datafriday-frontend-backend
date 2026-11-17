// Implémentation de RÉFÉRENCE (avant le chantier perf/commandes-recompute) de
// `buildStockRequirements` et `buildMenuItemDemand`, copiée telle quelle de
// `stockPlanning.js` au commit 8d4a642d, avec les fonctions renommées `legacy*`.
// Elle sert uniquement de témoin à `stockRecordIndex.spec.js` : le nouveau code
// doit produire EXACTEMENT les mêmes lignes, dans le même ordre, avec les mêmes
// sommes. Ne pas la « corriger » ni la factoriser avec le code de production.
import { expandMenuItem, buildComponentLookup } from '@/utils/menuItemExpansion'
import { normalizeName } from '@/utils/stockReferenceIndex'
import { collectFbElements, normalizeSelectedIds, stockItemKey } from '@/utils/stockPlanning'

function buildUnavailableIndex(unavailableItems) {
  return {
    ids: new Set((unavailableItems?.ids || []).map((id) => String(id))),
    names: new Set(
      (unavailableItems?.names || []).map((n) => normalizeName(n)).filter(Boolean),
    ),
  }
}

function isUnavailableItem(index, menuItemId, catalogId, itemName) {
  if (!index.ids.size && !index.names.size) return false
  if (index.ids.has(String(menuItemId))) return true
  if (catalogId && index.ids.has(String(catalogId))) return true
  const nm = normalizeName(itemName)
  return !!(nm && index.names.has(nm))
}

function toNumber(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

export function legacyShopRecordMatchesElement(record, element) {
  if (!record || !element) return false
  const recordKeys = [
    record.shopId,
    record.elementId,
    record.shop,
    record.shopName,
    record.elementName,
    record.registryId,
  ].filter(Boolean).map(String)
  const elementKeys = [
    element.id,
    element.registryId,
    element.name,
    element.shopName,
  ].filter(Boolean).map(String)
  return recordKeys.some((rk) => elementKeys.includes(rk))
}

export function legacyGetRecordMenuItemId(record) {
  return record?.menuItemId || record?.mappedMenuItemId || record?.itemId || ''
}

export function legacyGetRecordQuantity(record) {
  return toNumber(
    record?.totalQuantity ??
      record?.adjustedQuantity ??
      record?.quantity ??
      record?.qty,
  )
}

export function legacyGetPredictedQuantityForElement(records, element, menuItemId) {
  return (records || []).reduce((sum, record) => {
    if (legacyGetRecordMenuItemId(record) !== menuItemId) return sum
    if (!legacyShopRecordMatchesElement(record, element)) return sum
    return sum + legacyGetRecordQuantity(record)
  }, 0)
}

/**
 * Vrai quand la quantité de ce couple (PDV, item) provient EXCLUSIVEMENT de
 * lignes manuelles (`isManual: true`, Estimation 0, fiche 311_02). Ces lignes
 * sortent de `manualQuantityRecords` / `withManualRecords` DÉJÀ mises à
 * l'échelle par le slider % : ré-appliquer `quantityAdjustments` dessus les
 * compterait DEUX fois (150 % → 225 %). Un couple mixte manuel + prédit
 * n'existe pas (`manualQuantityRecords` saute les clés couvertes par la
 * prédiction) ; s'il apparaissait, on retombe sur le comportement historique
 * (% appliqué), le prédit fait foi.
 */
export function legacyIsManualOnlyForElement(records, element, menuItemId) {
  let seen = false
  for (const record of records || []) {
    if (legacyGetRecordMenuItemId(record) !== menuItemId) continue
    if (!legacyShopRecordMatchesElement(record, element)) continue
    if (record.isManual !== true) return false
    seen = true
  }
  return seen
}

export function legacyDeriveSelectedMenuItemsByShop(configuration, records) {
  const out = {}
  collectFbElements(configuration).forEach((element) => {
    const ids = []
    ;(records || []).forEach((record) => {
      if (!legacyShopRecordMatchesElement(record, element)) return
      if (legacyGetRecordQuantity(record) <= 0) return
      const menuItemId = legacyGetRecordMenuItemId(record)
      if (menuItemId && !ids.includes(menuItemId)) ids.push(menuItemId)
    })
    if (ids.length) out[element.id] = ids
  })
  return out
}

export function legacyExpandMenuItemStock(
  menuItemId,
  menuItemQuantity,
  rootMenuItemName,
  menuItems,
  // eslint-disable-next-line no-unused-vars
  components = [],
  depth = 0,
) {
  // BUG-292-01, la règle de décomposition vit dans `utils/menuItemExpansion`, une
  // seule fois pour les quatre écrans. Cette fonction n'est plus qu'un adaptateur
  // de signature : elle existe parce que trois appelants la consomment
  // (`legacyBuildStockRequirements`, `useShoppingList`, `usePredictedNeed`).
  //
  // Trois comportements ont changé ici, tous voulus :
  //  1. la récursion suit désormais le PARENT (combo), plus le `readyForSale` de
  //     l'enfant, un composant préparé en cuisine centrale (sauce pickle) reste
  //     UNE LIGNE au lieu d'être dissous en son ail (symptôme S2) ;
  //  2. un ComponentDefinition n'est PLUS éclaté en ingrédients feuilles. Cet
  //     éclatement n'a pas disparu : il a été DÉPLACÉ dans la feuille de course
  //     (`bomPlanning`), seul écran où l'on achète, on ne commande pas un
  //     composant. ⚠️ Ce n'était pas un no-op : `useSpaceData` hydrate les
  //     `subComponents` et les réinjecte dans `analyse.components`, donc la
  //     branche s'exécutait bel et bien (cf. fiche BUG-292-01, cause B) ;
  //  3. un combo est ouvert, comme sur le Stock-up (Question #18, Bertrand).
  //
  // `components` devient inutile ici, paramètre CONSERVÉ pour ne pas casser les
  // appelants, dont la signature positionnelle place `depth` juste après.
  const menuItemsById = new Map((menuItems || []).map((mi) => [mi.id, mi]))
  return expandMenuItem({
    menuItemId,
    quantity: menuItemQuantity,
    rootMenuItemName,
    menuItemsById,
    lookup: buildComponentLookup(menuItems),
    depth,
    // Le réarmement n'a pas de signal d'hydratation : `true` préserve son
    // comportement historique (le filet de sécurité reste disponible).
    recipeCatalogLoaded: true,
    fallbackWhenEmpty: true,
  })
}

export function legacyBuildStockRequirements({
  configuration,
  menuItems = [],
  components = [],
  predictedRecords = [],
  selectedMenuItems = {},
  quantityAdjustments = {},
  closedShopNames = [],
  // BUG-291-02, cf. buildUnavailableIndex. Défaut vide → sortie strictement
  // identique pour tout appelant qui ne le passe pas.
  unavailableItems = null,
  // Module Live (docs/modules/11_LIVE.md), quantités absolues forcées à la
  // main pour un item à prédiction 0, même clé/sémantique que
  // `EventPredictStockUpSection.getAdjustedQuantity()` (`${shopId}-${menuItemId}`
  // → unités, mises à l'échelle par le même slider % que la prédiction). Défaut
  // `{}` → sortie strictement identique pour Restock, qui ne le passe pas.
  manualQuantities = {},
} = {}) {
  const rowsByKey = new Map()
  const menuItemsById = new Map(menuItems.map((mi) => [mi.id, mi]))
  // Index par NOM normalisé : les records EventPredict portent un menuItemId issu
  // de la timeline (UUID/weezevent) qui peut différer de l'id catalogue (cuid DB)
  // → on rattrape par mappedMenuItemId puis par nom avant d'abandonner.
  const menuItemsByName = new Map(
    menuItems.filter((mi) => mi?.name).map((mi) => [normalizeName(mi.name), mi]),
  )
  // PdV fermés pour cet event → EXCLUS du réarmement (« on ne vend pas sur des
  // points fermés »). Noms bruts normalisés ici pour matcher `shop.name` avec le
  // MÊME normaliseur, quel que soit le normaliseur de l'appelant.
  const closedSet = new Set((closedShopNames || []).map((n) => normalizeName(n)).filter(Boolean))
  const unavailableIndex = buildUnavailableIndex(unavailableItems)

  collectFbElements(configuration).forEach((shop) => {
    if (closedSet.size && shop?.name && closedSet.has(normalizeName(shop.name))) return
    const explicitIds = normalizeSelectedIds(selectedMenuItems[shop.id])
    const selectedIds = explicitIds.length
      ? explicitIds
      : normalizeSelectedIds(legacyDeriveSelectedMenuItemsByShop(configuration, predictedRecords)[shop.id])

    selectedIds.forEach((menuItemId) => {
      // Record représentatif (shop + item) → nom + mappedMenuItemId pour
      // rattraper le catalogue quand l'id timeline ≠ id catalogue.
      const sample = (predictedRecords || []).find(
        (r) => legacyGetRecordMenuItemId(r) === menuItemId && legacyShopRecordMatchesElement(r, shop),
      )
      const recordName = sample?.itemName || sample?.mappedMenuItemName || ''
      const menuItem =
        menuItemsById.get(menuItemId) ||
        (sample?.mappedMenuItemId ? menuItemsById.get(sample.mappedMenuItemId) : null) ||
        (recordName ? menuItemsByName.get(normalizeName(recordName)) : null) ||
        null

      // BUG-291-02 : placé APRÈS la résolution catalogue (on dispose alors des
      // deux ids et du nom) et AVANT le calcul de quantité, un article qu'on ne
      // peut pas fabriquer ne produit ni sa ligne ni celles de ses ingrédients.
      if (
        isUnavailableItem(unavailableIndex, menuItemId, menuItem?.id, recordName || menuItem?.name)
      ) {
        return
      }

      const predictedQuantity = legacyGetPredictedQuantityForElement(
        predictedRecords,
        shop,
        menuItemId,
      )
      // Lignes manuelles (records isManual) = DÉJÀ ajustées à la construction →
      // % neutralisé ici, sinon double application (fiche 311_02).
      const adjustment = legacyIsManualOnlyForElement(predictedRecords, shop, menuItemId)
        ? 100
        : toNumber(quantityAdjustments[`${shop.id}-${menuItemId}`], 100)
      // Parité EventPredictStockUpSection.getAdjustedQuantity() : sans prédiction,
      // la quantité MANUELLE (unités absolues) sert de base, mise à l'échelle par
      // le même slider % shop, pas un simple override du résultat final.
      const base = predictedQuantity || Math.max(0, toNumber(manualQuantities[`${shop.id}-${menuItemId}`], 0))
      const adjustedQuantity = Math.round((base * adjustment) / 100)
      if (!adjustedQuantity) return

      // Catalogue trouvé → expansion recette/packaging (id catalogue, PAS l'id
      // timeline). Sinon (catalogue incomplet ou id orphelin) → ligne feuille
      // directe depuis le record (nom + quantité prédite) pour que la prévision
      // s'affiche au lieu d'un « No forecast ».
      const expansion = menuItem
        ? legacyExpandMenuItemStock(menuItem.id, adjustedQuantity, menuItem.name, menuItems, components)
        : []
      const itemLabel = recordName || menuItem?.name || menuItemId
      const expanded = expansion.length
        ? expansion
        : [
            {
              id: menuItem?.id || menuItemId,
              name: itemLabel,
              totalQuantity: adjustedQuantity,
              unit: 'pcs',
              isExpanded: false,
              sources: [
                {
                  menuItemId,
                  menuItemName: itemLabel,
                  menuItemQuantity: adjustedQuantity,
                  componentQuantity: adjustedQuantity,
                  unit: 'pcs',
                },
              ],
            },
          ]

      expanded.forEach((item) => {
        const itemKey = stockItemKey(item)
        const key = `${shop.id}|||${itemKey}`
        const existing = rowsByKey.get(key)
        if (existing) {
          existing.totalQuantity += item.totalQuantity
          item.sources.forEach((source) => {
            const sourceKey = `${source.menuItemId}|||${source.unit}`
            const previous = existing.sources.find(
              (s) => `${s.menuItemId}|||${s.unit}` === sourceKey,
            )
            if (previous) {
              previous.menuItemQuantity += source.menuItemQuantity
              previous.componentQuantity += source.componentQuantity
            } else {
              existing.sources.push({ ...source })
            }
          })
        } else {
          rowsByKey.set(key, {
            shopId: shop.id,
            shopName: shop.name,
            shopType: shop.shopType,
            itemKey,
            itemId: item.id,
            sourceId: item.sourceId || null,
            itemName: item.name,
            unit: item.unit,
            totalQuantity: item.totalQuantity,
            isExpanded: !!item.isExpanded,
            sources: item.sources.map((source) => ({ ...source })),
          })
        }
      })
    })
  })

  return Array.from(rowsByKey.values()).sort((a, b) => {
    const shopCmp = String(a.shopName || '').localeCompare(String(b.shopName || ''))
    if (shopCmp) return shopCmp
    return String(a.itemName || '').localeCompare(String(b.itemName || ''))
  })
}

/**
 * Demande au niveau MENU ITEM (avant explosion), pour l'achat/production (BOM).
 *
 * Identique à legacyBuildStockRequirements mais SANS expansion : on s'arrête au plat
 * vendu/prédit. Renvoie la quantité de chaque menu item par PDV, c'est l'entrée
 * de bomPlanning.buildIngredientRequirements, qui éclate ensuite jusqu'aux
 * ingrédients (cuisine centrale), indépendamment de readyForSale.
 *
 * @returns {Array<{shopId, shopName, menuItemId, menuItemName, quantity}>}
 */
export function legacyBuildMenuItemDemand({
  configuration,
  menuItems = [],
  predictedRecords = [],
  selectedMenuItems = {},
  quantityAdjustments = {},
  closedShopNames = [],
  // BUG-291-02, parité legacyBuildStockRequirements : on n'achète pas non plus les
  // ingrédients d'un plat qu'on ne peut pas produire.
  unavailableItems = null,
} = {}) {
  const out = new Map()
  const menuItemsById = new Map(menuItems.map((mi) => [mi.id, mi]))
  // PdV fermés exclus (parité legacyBuildStockRequirements) : pas d'achat pour un point fermé.
  const closedSet = new Set((closedShopNames || []).map((n) => normalizeName(n)).filter(Boolean))
  const unavailableIndex = buildUnavailableIndex(unavailableItems)

  collectFbElements(configuration).forEach((shop) => {
    if (closedSet.size && shop?.name && closedSet.has(normalizeName(shop.name))) return
    const explicitIds = normalizeSelectedIds(selectedMenuItems[shop.id])
    const selectedIds = explicitIds.length
      ? explicitIds
      : normalizeSelectedIds(legacyDeriveSelectedMenuItemsByShop(configuration, predictedRecords)[shop.id])

    selectedIds.forEach((menuItemId) => {
      const menuItem = menuItemsById.get(menuItemId)
      if (!menuItem) return
      if (isUnavailableItem(unavailableIndex, menuItemId, menuItem.id, menuItem.name)) {
        return
      }
      const predictedQuantity = legacyGetPredictedQuantityForElement(predictedRecords, shop, menuItemId)
      // Parité legacyBuildStockRequirements : lignes manuelles déjà ajustées → % neutralisé.
      const adjustment = legacyIsManualOnlyForElement(predictedRecords, shop, menuItemId)
        ? 100
        : toNumber(quantityAdjustments[`${shop.id}-${menuItemId}`], 100)
      const adjustedQuantity = Math.round((predictedQuantity * adjustment) / 100)
      if (!adjustedQuantity) return

      const key = `${shop.id}|||${menuItemId}`
      const prev = out.get(key)
      if (prev) {
        prev.quantity += adjustedQuantity
      } else {
        out.set(key, {
          shopId: shop.id,
          shopName: shop.name,
          menuItemId,
          menuItemName: menuItem.name,
          quantity: adjustedQuantity,
        })
      }
    })
  })

  return Array.from(out.values())
}

