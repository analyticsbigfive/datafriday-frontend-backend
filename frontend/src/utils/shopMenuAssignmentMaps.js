/**
 * Dérivation des 4 index d'assignation shop ↔ menu-items d'Event Predict, à partir
 * des lignes `GET /space-menu/shop/:id/items` (store `shopMenuAvailability`).
 *
 * Extrait de `EventPredictView.loadShopMenuAssignment` (BUG-387-02) pour deux raisons :
 *
 *  1. UNE seule implémentation. Cocher un article ne doit plus relire le menu de TOUS
 *     les PdV de la config (1 + N requêtes, 3 en vol) : seul le PdV touché est
 *     reconstruit, en mémoire. Deux dérivations séparées, une pour le chargement
 *     complet et une pour le patch, divergeraient au premier changement de règle
 *     (la règle d'affichage des articles indisponibles a déjà bougé deux fois,
 *     cf. BUG-291-02) et l'écran afficherait un article différent selon qu'on vient
 *     de le cocher ou qu'on a rechargé la page ;
 *  2. testabilité : les règles d'inclusion tiennent en 4 filtres, tous porteurs, et
 *     méritent des tests sans monter un SFC de 6 000 lignes.
 *
 * Les 4 index, tous clés par `normalizeStr(shopName)` :
 *  - `ids`         : ids AUTO-SÉLECTIONNABLES (activés ET disponibles) ;
 *  - `items`       : liste AFFICHÉE (activés + assignés-désactivés-improduisibles) ;
 *  - `membership`  : appartenance COMPLÈTE au Space Menu du shop, garde-fou
 *                    anti-ouverture avec un article hors menu ;
 *  - `unavailable` : index d'indisponibilité, lu par le Stock-up qui ne reçoit que
 *                    des ids.
 */
import { normalizeStr } from '@/utils/predictiveAnalytics'

/**
 * Entrée des 4 index pour UN shop. `null` sur un index = pas d'entrée pour ce shop
 * (équivalent du `continue` de la boucle d'origine, et de la SUPPRESSION de la clé
 * lors d'un patch : un shop dont on vient de décocher le dernier article ne doit pas
 * garder un Set vide, que `ids.size` ne distinguerait pas d'un shop non chargé).
 *
 * @param {Array<object>} rawItems lignes /items : { id, name, enabled, assigned, available, … }
 * @returns {{ enabledIds: Set|null, displayItems: Array|null,
 *             membership: {ids:Set,names:Set}|null, unavailable: {ids:Set,names:Set}|null }}
 */
export function deriveShopMenuEntry(rawItems) {
  const items = Array.isArray(rawItems) ? rawItems : []
  const empty = { enabledIds: null, displayItems: null, membership: null, unavailable: null }
  if (!items.length) return empty

  const membership = {
    ids: new Set(items.map((it) => String(it.id))),
    names: new Set(items.map((it) => normalizeStr(it.name)).filter(Boolean)),
  }

  // `available === false` STRICT (garde anti-backend-legacy : un backend qui
  // n'enverrait pas le champ ne doit pas tout déclarer indisponible), et calculé
  // AVANT le retour anticipé ci-dessous : un shop sans article activé doit quand
  // même enregistrer ses indisponibles.
  const unavailableItems = items.filter((it) => it && it.available === false)
  const unavailable = unavailableItems.length
    ? {
        ids: new Set(unavailableItems.map((it) => String(it.id))),
        names: new Set(unavailableItems.map((it) => normalizeStr(it.name)).filter(Boolean)),
      }
    : null

  // BUG-291-02 (décision JLH 2026-08-04) — un article marqué NON DISPONIBLE par le
  // serveur (pas de recette, ingrédient inactif, fournisseur non résolu ou ne livrant
  // pas l'espace) ne doit compter dans AUCUNE vente prédite, ni entrer dans le stock-up,
  // ni dans le réarmement. C'est `available` qui fait foi, PAS `unmapped`, qui signifie
  // « vendu sur Weezevent mais non assigné », un tout autre sujet.
  //
  // Le filtre a d'abord été appliqué AUX DEUX index, ce qui sortait l'article du menu
  // assigné et le faisait reclasser en « non attaché » AVEC sa quantité intacte : il
  // ressortait par une autre porte. D'où la séparation des trois usages : `displayItems`
  // garde les indisponibles (visibles avec leur raison), `enabledIds` les exclut (jamais
  // cochés d'office, c'est aussi la source de `derivedMenuConfigFromRecords`), et
  // `unavailable` porte l'index pour le Stock-up, qui ne reçoit que des ids.
  const assignedEnabled = items.filter((it) => it && it.enabled === true)
  if (!assignedEnabled.length) return { ...empty, membership, unavailable }

  return {
    membership,
    unavailable,
    // `available !== false` (et non `=== true`) : même garde anti-backend-legacy.
    enabledIds: new Set(assignedEnabled.filter((it) => it.available !== false).map((it) => it.id)),
    // Liste affichée = activés + assignés-désactivés-IMPRODUISIBLES : ces derniers
    // doivent apparaître en « Sans ventes prévues » avec leur raison, et non en
    // « Non attachés » avec le flux réactiver. Un non-assigné improduisible reste
    // hors liste.
    displayItems: items
      .filter((it) => it && (it.enabled === true || (it.assigned === true && it.available === false)))
      .map((it) => ({
        id: it.id,
        name: it.name,
        // `price` de /items est TTC ; `basePrice` reste lu en premier au cas où le
        // backend l'expose. On ne substitue JAMAIS l'un à l'autre en silence (cela
        // injecterait de la TVA dans le CA des items synthétiques).
        basePrice: it.basePrice,
        category: it.productCategory?.name || it.category || '',
        picture: it.picture || null,
        // Vérité SERVEUR de disponibilité, transportée jusqu'à la section Menus qui
        // l'oppose à sa propre dérivation front (obsolète). `missingIngredients` est
        // APLATI EN NOMS : le backend renvoie des objets et le template fait `.join()`.
        available: it.available,
        hasRecipe: it.hasRecipe,
        missingIngredients: Array.isArray(it.missingIngredients)
          ? it.missingIngredients.map((m) => (typeof m === 'string' ? m : m?.name)).filter(Boolean)
          : [],
      })),
  }
}

/**
 * Réécrit l'entrée d'UN shop dans les 4 index, sans toucher aux autres.
 *
 * Renvoie des Map NEUVES (jamais de mutation en place) : les index sont consommés par
 * des computed lourds de la section Configuration, qui doivent se réévaluer sur un
 * changement de référence, et par le cache `_shopMenuAssignmentCache` qui partage ces
 * mêmes références entre configs.
 *
 * @param {{ids:Map|null, items:Map|null, membership:Map|null, unavailable:Map|null}} maps
 * @param {string} shopName nom BRUT du shop (normalisé ici, comme à la lecture)
 * @param {ReturnType<typeof deriveShopMenuEntry>} entry
 * @returns {{ids:Map, items:Map, membership:Map, unavailable:Map}}
 */
export function patchShopMenuMaps(maps, shopName, entry) {
  const key = normalizeStr(shopName)
  const ids = new Map(maps?.ids || [])
  const items = new Map(maps?.items || [])
  const membership = new Map(maps?.membership || [])
  const unavailable = new Map(maps?.unavailable || [])
  if (!key) return { ids, items, membership, unavailable }

  const put = (map, value) => {
    if (value == null) map.delete(key)
    else map.set(key, value)
  }
  put(ids, entry?.enabledIds ?? null)
  put(items, entry?.displayItems ?? null)
  put(membership, entry?.membership ?? null)
  put(unavailable, entry?.unavailable ?? null)
  return { ids, items, membership, unavailable }
}

/**
 * Applique des changements d'activation `{ [menuItemId]: boolean }` à des lignes
 * /items, SANS aller au réseau. Seul `enabled` bouge : `assigned` et `available`
 * sont des vérités serveur (appartenance au menu, produisibilité) qu'un simple
 * cochage ne change pas.
 *
 * Un id absent des lignes est ignoré : on ne fabrique pas de ligne sans nom ni prix,
 * l'appelant retombe alors sur un rechargement complet.
 *
 * @returns {{rows: Array<object>, applied: boolean}} `applied` = tous les ids changés
 *   ont trouvé leur ligne (sinon l'appelant doit refetcher).
 */
export function applyEnabledChanges(rawItems, changes) {
  const rows = Array.isArray(rawItems) ? rawItems : []
  const wanted = new Map(Object.entries(changes || {}).map(([id, v]) => [String(id), v === true]))
  if (!wanted.size) return { rows, applied: true }
  const seen = new Set()
  const next = rows.map((it) => {
    const id = String(it?.id ?? '')
    if (!wanted.has(id)) return it
    seen.add(id)
    return { ...it, enabled: wanted.get(id) }
  })
  return { rows: next, applied: seen.size === wanted.size }
}
