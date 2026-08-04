// src/utils/menuItemExpansion.js
//
// RÈGLE UNIQUE de décomposition d'un menu item en articles à manipuler
// physiquement — BUG-292-01.
//
// Elle répond à une seule question, posée à l'identique par quatre écrans :
// « qu'est-ce qu'on charge / compte / réarme pour vendre N fois cet article ? ».
// Jusqu'ici chacun portait sa propre copie de la règle, et les copies avaient
// divergé (stock-up, réarmement, inventaire pré/post). Ce module est la copie
// de référence ; les écrans le consomment au lieu de le réimplémenter.
//
//   1. combo               → on OUVRE le panier : chaque constituant est ensuite
//                            retraité comme un menu item normal (récursion).
//   2. readyForSale='Yes'  → 1 ligne, l'article lui-même, en `pcs`.
//                            Packaging NON séparé : l'article arrive emballé.
//   3. readyForSale='No'   → 1 ligne par ligne de recette (Ingredient, Component
//                            ou Packaging), quantité
//                            (numberOfUnits × quantité) / numberOfPiecesRecipe.
//                            On ne descend JAMAIS dans un Component.
//   4. 'No' + catalogue recette pas encore chargé → AUCUNE ligne (garde S4).
//   5. 'No' + recette réellement vide             → l'article lui-même (filet).
//
// Les points 4 et 5 sont deux situations DIFFÉRENTES qui se ressemblent : « je ne
// sais pas encore » et « il n'y a rien à savoir ». Les confondre est le bug S4 du
// lot BUG-290-01 (« Burger seul » après un hard refresh).
//
// Décision métier (Bertrand, 2026-07-24 précisée le 2026-08-04, Question #18) :
// « pour un combo on prend chaque menu item qui le compose et on les traite de la
// même façon que les menu items normaux […] on n'éclate toujours pas les
// composants ! ». La récursion dépend donc de la nature du PARENT, jamais du
// `readyForSale` de l'enfant : on ouvre le panier, pas les articles dedans. La
// sauce pickle arrive prête de la cuisine centrale — on la stocke, on ne va pas
// chercher son ail.
//
// ⚠️ L'éclatement jusqu'aux ingrédients existe, mais il vit AILLEURS : uniquement
// dans la feuille de course (`bomPlanning.buildIngredientRequirements`), parce
// qu'on n'achète pas un composant chez un fournisseur. Ne pas le réintroduire ici.

import { componentIngredientId } from './inventoryUtils'

const MAX_DEPTH = 10

/**
 * Index de résolution composant → menu item, en O(1).
 *
 * Sémantique à préserver : « le PREMIER élément du tableau dont le `name` OU le
 * `sourceId` matche ». `byName` garde la 1re occurrence d'un nom, `idxById` donne
 * la position d'un id — c'est ce qui permet de départager quand un composant
 * matche par nom ET par sourceId vers deux articles différents.
 *
 * @param {Array<object>} menuItems catalogue
 * @returns {{ byId: Map, byName: Map, idxById: Map }}
 */
export function buildComponentLookup(menuItems = []) {
  const byId = new Map()
  const byName = new Map()
  const idxById = new Map()
  ;(menuItems || []).forEach((mi, idx) => {
    if (!mi) return
    if (mi.id != null) {
      byId.set(mi.id, mi)
      idxById.set(mi.id, idx)
    }
    if (mi.name != null && !byName.has(mi.name)) byName.set(mi.name, { item: mi, idx })
  })
  return { byId, byName, idxById }
}

/**
 * Résout le menu item référencé par une ligne de recette, si elle en référence un.
 * Extrait pour être testable seul : c'est cette résolution qui décide si une ligne
 * est « un article » (donc potentiellement un panier à ouvrir) ou « de la matière ».
 */
function resolveComponentMenuItem(component, lookup) {
  const nameHit = component?.name != null ? lookup.byName.get(component.name) : undefined
  const idItem = component?.sourceId != null ? lookup.byId.get(component.sourceId) : undefined
  if (nameHit && idItem) {
    const idIdx = lookup.idxById.get(component.sourceId)
    return nameHit.idx <= idIdx ? nameHit.item : idItem
  }
  return nameHit ? nameHit.item : idItem || null
}

/**
 * Décompose un menu item en lignes de stock, sur UN SEUL niveau (sauf combo).
 *
 * Fonction PURE : toutes les dépendances écran (coût, état d'hydratation) sont
 * injectées, jamais lues d'un `this`.
 *
 * @param {object}  p
 * @param {string}  p.menuItemId
 * @param {number}  p.quantity            nombre de ventes prédites/ajustées
 * @param {string}  p.rootMenuItemName    PLAT d'origine, conservé à travers la
 *                                        récursion combo — c'est lui qu'on affiche
 *                                        en « utilisé dans », pas le sous-article.
 * @param {Map}     p.menuItemsById
 * @param {object}  p.lookup              cf. buildComponentLookup
 * @param {number}  [p.depth=0]
 * @param {boolean} [p.recipeCatalogLoaded=true]  false → un article composé dont la
 *                                        recette n'est pas arrivée n'émet RIEN
 *                                        (garde S4). `true` par défaut : les
 *                                        appelants qui n'ont pas ce signal gardent
 *                                        leur comportement historique.
 * @param {boolean} [p.fallbackWhenEmpty=true]  une expansion qui ne produit aucune
 *                                        ligne exploitable retombe sur l'article
 *                                        lui-même. Filet pour données dégradées ;
 *                                        explicite car les appelants divergeaient.
 * @param {(mi:object)=>number} [p.resolveMenuItemUnitCost]  coût d'UN article fini.
 * @returns {Array<object>} lignes `{ id, sourceId, name, totalQuantity, unit,
 *                          itemType, unitCost, isExpanded, sources[] }`
 */
export function expandMenuItem({
  menuItemId,
  quantity,
  rootMenuItemName,
  menuItemsById,
  lookup,
  depth = 0,
  recipeCatalogLoaded = true,
  fallbackWhenEmpty = true,
  resolveMenuItemUnitCost = () => 0,
}) {
  if (depth > MAX_DEPTH) return []
  const menuItem = menuItemsById?.get(menuItemId)
  if (!menuItem) return []

  const isCombo = menuItem.comboItem === 'Yes'

  // Ligne « l'article lui-même », partagée par la branche readyForSale='Yes' et
  // par le filet de sécurité : les deux décrivent le même objet physique.
  const selfRow = () => ({
    id: menuItem.id,
    sourceId: menuItem.id,
    name: menuItem.name,
    totalQuantity: quantity,
    unit: 'pcs',
    itemType: 'MenuItem',
    unitCost: resolveMenuItemUnitCost(menuItem) || 0,
    isExpanded: false,
    sources: [
      {
        menuItemId,
        menuItemName: rootMenuItemName,
        menuItemQuantity: quantity,
        componentQuantity: quantity,
        unit: 'pcs',
      },
    ],
  })

  // Règle 2 — un combo n'est jamais « prêt à vendre » au sens du stock : c'est un
  // panier, on l'ouvre même s'il est marqué readyForSale='Yes'.
  if (menuItem.readyForSale === 'Yes' && !isCombo) return [selfRow()]

  // Règles 1 et 3.
  if (
    (menuItem.readyForSale === 'No' || isCombo) &&
    Array.isArray(menuItem.components) &&
    menuItem.components.length > 0
  ) {
    const out = []
    const numberOfPiecesRecipe = Number(menuItem.numberOfPiecesRecipe) || 1

    menuItem.components.forEach((component) => {
      const numberOfUnits = Number(component?.numberOfUnits) || 0
      const calculatedQuantity = (numberOfUnits * quantity) / numberOfPiecesRecipe
      const componentUnit = component?.unit || 'unit'
      const componentMenuItem = resolveComponentMenuItem(component, lookup)

      if (componentMenuItem && (isCombo || componentMenuItem.comboItem === 'Yes')) {
        // On redescend UNIQUEMENT parce que le parent est un panier, ou parce que
        // l'enfant en est un. Jamais sur le readyForSale de l'enfant : c'est ce
        // qui dissolvait la sauce pickle en son ail (BUG-290-01).
        out.push(
          ...expandMenuItem({
            menuItemId: componentMenuItem.id,
            quantity: calculatedQuantity,
            rootMenuItemName,
            menuItemsById,
            lookup,
            depth: depth + 1,
            recipeCatalogLoaded,
            fallbackWhenEmpty,
            resolveMenuItemUnitCost,
          }),
        )
      } else if (component?.name || componentMenuItem?.name) {
        out.push({
          // Identité CATALOGUE (marketPriceId → sourceId → id), jamais la PK de la
          // ligne de recette : celle-ci est unique par (menu item, article), donc
          // un gobelet partagé par 3 recettes produisait 3 lignes que rien ne
          // fusionnait — 3 arrondis carton et 3 déductions du restant (BUG-288-01).
          // C'est aussi la clé sur laquelle le comptage d'inventaire joint.
          id: componentIngredientId(component),
          sourceId: component?.sourceId ?? null,
          name: component?.name || componentMenuItem.name,
          totalQuantity: calculatedQuantity,
          unit: componentUnit,
          itemType: component?.itemType || null,
          // Coût d'UNE unité de recette (€/Kg, €/Pc…), porté par la ligne de
          // relation : le coût de la ligne vaut `unitCost × totalQuantity`, jamais
          // × le nombre de menu items.
          unitCost: Number(component?.unitCost) || 0,
          isExpanded: true,
          sources: [
            {
              menuItemId,
              menuItemName: rootMenuItemName,
              menuItemQuantity: quantity,
              componentQuantity: calculatedQuantity,
              unit: componentUnit,
            },
          ],
        })
      } else {
        // Référence backend non jointe → pas de nom. Une ligne anonyme n'est pas
        // inoffensive : les agrégations keyées sur le nom fusionnaient TOUS les
        // composants anonymes de TOUTES les recettes du stand en une seule ligne
        // fantôme (BUG-291-01), et le tri plantait sur `undefined` (BUG-289-01).
        // On saute, avec une trace.
        console.log(
          `[menuItemExpansion] Composant sans nom ignoré dans "${rootMenuItemName}" (id=${component?.id ?? '?'}, sourceId=${component?.sourceId ?? '?'})`,
        )
      }
    })

    // Règle 5 — données dégradées (recette entièrement anonyme) : un article vendu
    // ne peut pas produire zéro ligne de stock.
    if (!out.length && fallbackWhenEmpty) return [selfRow()]
    return out
  }

  // Règle 4 — « je ne sais pas encore » ≠ « il n'y a rien ». `useSpaceData` charge
  // en deux vagues : la 2a livre les menu items, la 2b seulement les catalogues
  // recette et RÉÉMET `menuItems` avec les refs résolues. Entre les deux, un
  // article readyForSale='No' n'a pas de recette exploitable. Émettre l'article
  // fini ici afficherait un objet qui n'existe pas, puis le remplacerait par ses
  // ingrédients au tick suivant — deux listes sur le même écran (S4, BUG-290-01).
  if (menuItem.readyForSale === 'No' && !recipeCatalogLoaded) return []

  // Règle 5 — readyForSale non renseigné, ou composé sans aucune ligne de recette.
  return [selfRow()]
}
