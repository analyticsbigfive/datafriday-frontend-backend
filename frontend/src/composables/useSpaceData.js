/**
 * useSpaceData — chargement des données d'un space via API réelle.
 *
 * Chargement par étapes pour accélérer le premier rendu :
 *   Phase 1  (bloquante)  : GET /spaces/:id + /configurations + /shop-details (shops + events, sans granular) + /events
 *   Phase 2a (background) : /menu-items + /shop-details?granular=1 + taxonomie + produits/mappings Weezevent
 *                           → tout ce dont les GRAPHES ont besoin
 *   Phase 2b (background) : /ingredients + /menu-components (paginé + fan-out détail) + /packaging
 *                           → catalogues RECETTE, consommés par Restock / Stock up uniquement
 *
 * `onEnrichment(data)` est appelé à la fin de 2a PUIS de 2b. La 2e passe ne fait que
 * raffiner (mêmes clés, `menuItems` réémis avec les refs catalogue résolues) : le
 * consommateur n'a rien de spécial à gérer, mais il peut lever ses skeletons dès 2a.
 * Sans callback, tout est attendu et retourné en une fois (rétrocompatible).
 */
import { getSpace, getSpaceConfigurations, getSpaceShopDetails, getSpaceShopGranular } from '@/api/endpoints/space.api'
import { getEvents } from '@/api/endpoints/event.api'
import { getAllMenuItems } from '@/api/endpoints/menu-item.api'
import { normalizeMenuItem, menuItemsCoverage, resolveComponentRefs } from '@/utils/menuItemNormalize'
import { getProductTypes, getProductCategories, getMenuComponents } from '@/api/endpoints/menu.api'
import { getIngredients } from '@/api/endpoints/ingredient.api'
import { getAllPackagingTypes } from '@/api/endpoints/inventory.api'
import { getWeezeventProducts } from '@/api/endpoints/aggregation.api'
import { getProductMappings } from '@/api/endpoints/mapping.api'
import { enrichGranularMenuDimensions } from '@/utils/analyseDimensions'

const normalizeList = (v) => (Array.isArray(v) ? v : v?.data || [])

/**
 * Charge tous les MenuComponents en paginant sur `meta.total` — le backend plafonne
 * chaque appel à `limit` (cf. BUG-054/BUG-105), donc on boucle pour ne pas tronquer
 * silencieusement les tenants ayant plus de `limit` composants. Même boucle que
 * src/store/modules/menuComponents.js (store `/components`).
 */
async function fetchAllMenuComponents() {
  const limit = 100
  const extractRows = (res) => (
    Array.isArray(res)
      ? res
      : Array.isArray(res?.data)
        ? res.data
        : Array.isArray(res?.items)
          ? res.items
          : []
  )
  // Page 1 séquentielle pour connaître `meta.total`, puis pages restantes en
  // PARALLÈLE borné (asyncPool, concurrence 4) au lieu de la boucle page-à-page
  // séquentielle : un tenant à 800 composants passait de 8 allers-retours en
  // série à 1 + 7 en parallèle. Ordre des rows préservé (concat par index).
  const first = await getMenuComponents({ page: 1, limit })
  const firstRows = extractRows(first)
  const total = first?.meta?.total ?? first?.data?.meta?.total
  if (!total || firstRows.length < limit || firstRows.length >= total) return firstRows

  const pageCount = Math.ceil(total / limit)
  const remainingPages = Array.from({ length: pageCount - 1 }, (_, i) => i + 2)
  const { runWithConcurrency } = await import('@/utils/asyncPool')
  const byPage = new Map()
  await runWithConcurrency(remainingPages, 4, async (page) => {
    const res = await getMenuComponents({ page, limit })
    byPage.set(page, extractRows(res))
  })
  let rows = firstRows
  for (const page of remainingPages) rows = rows.concat(byPage.get(page) || [])
  return rows
}

export async function fetchSpaceData(spaceId, onEnrichment = null, { excludeSimulated = true } = {}) {
  // Mode démo retiré : on charge toujours via l'API réelle. Aucune donnée mock.
  console.log('[useSpaceData] 🟢 Fetching from API: /api/v1/spaces/' + spaceId)

  // Posé par le repli du fetch configurations ci-dessous, remonté au store dans
  // `_configurationsFetchFailed` (cf. resolveConfigSelectionAfterLoad).
  let configurationsFetchFailed = false

  try {
    // ── Phase 1 : données critiques pour le premier rendu ──────────────────
    console.log('[useSpaceData] phase 1 — 4 endpoints critiques en parallèle...')
    const _t1 = (typeof performance !== 'undefined' ? performance.now() : Date.now())
    const [space, configurations, details, eventsResponse] = await Promise.all([
      getSpace(spaceId).catch((e) => { console.error('[useSpaceData] ❌ getSpace failed:', e?.response?.status, e?.message); throw e }),
      // Repli `[]` conservé (le reste de la phase 1 doit pouvoir rendre), mais l'échec
      // est SIGNALÉ : le store distingue « cet espace n'a aucune config » (liste vide,
      // fetch OK → purge d'une sélection périmée) de « on ne sait pas » (fetch KO → on
      // conserve la sélection utilisateur, cf. resolveConfigSelectionAfterLoad).
      getSpaceConfigurations(spaceId).catch((e) => {
        console.warn('[useSpaceData] ⚠️ configurations failed:', e?.response?.status, e?.message)
        configurationsFetchFailed = true
        return []
      }),
      // Phase 1: fast — returns shops + weezeventEvents + meta only (no granular join)
      getSpaceShopDetails(spaceId, { page: 1, limit: 20 }).catch((e) => {
        console.warn('[useSpaceData] ⚠️ shopDetails unavailable:', e?.response?.status, e?.message, '— continuing without sales data')
        return {}
      }),
      // Always fetch DataFriday Events (individual matches, not Weezevent seasons)
      // Scopé par spaceId côté backend — avant ce fix, seule la 1re page (50 events)
      // tenant-wide était lue puis filtrée côté client : un tenant avec >50 events
      // au total pouvait perdre silencieusement les events de ce space.
      //
      // `excludeSimulated` — ce chargement alimente le store analyse, donc Analyse,
      // l'écran Live ET EventPredict : les events créés par l'outil QA « simuler une
      // vente » (Event.isSimulated) n'ont rien à faire sur Analyse/EventPredict (ne
      // jamais fausser les vrais chiffres). Sur Live en revanche, voir son propre
      // trafic de test défiler en direct EST le but du widget flask
      // (LiveSaleSimulatorWidget) — l'appelant passe donc `excludeSimulated: false`
      // spécifiquement en mode Live (cf. AnalyseView.vue::isLive). La liste Events
      // (store/modules/events.js) ne passe déjà pas ce paramètre et les garde
      // visibles pour permettre leur suppression manuelle.
      getEvents({ spaceId, limit: 200, excludeSimulated }).catch((e) => { console.warn('[useSpaceData] ⚠️ events failed:', e?.response?.status, e?.message); return null }),
    ])

    // Phase 1 has no granular data (loaded later in background)
    const shopGranularData = []

    const hasMissingWeezeventTable = details?.__softFailureReason === 'missing-weezevent-table'

    // DataFriday Events (individual matches) are the ONLY source for the events list.
    // No fallback to RPC WeezeventEvents (those are seasons, not individual matches).
    // The SQL migration resolves granular record eventId → DataFriday Event UUID via date join.
    // Déjà scopé par spaceId côté backend (getEvents({spaceId})) — pas de refiltrage client.
    const events = normalizeList(eventsResponse?.data ?? eventsResponse)
    const menuItemCostMap = details?.menuItemCostMap || details?.costMap || {}

    const hasData = events.length > 0 || (details?.shops?.length ?? 0) > 0
    const hasConfig = Array.isArray(configurations) && configurations.length > 0

    console.log('[useSpaceData] phase 1 ✅ space:', space?.name, '| events:', events.length, '| cfgs:', configurations?.length || 0,
      `| [perf] phase1 ${Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - _t1)}ms`)

    // ── Diagnostic SPECTATEURS (API /events) ──────────────────────────────
    // KPI perCapita / transfo / spectateurs lisent e.ticketsScanned ?? attendees
    // ?? ticketsSold. On vérifie ici combien d'events les portent réellement.
    const evWithSpectators = events.filter(
      (e) => (e?.ticketsScanned ?? e?.attendees ?? e?.ticketsSold) != null,
    ).length
    console.log(
      `[useSpaceData] 🎟️ spectateurs API — ${evWithSpectators}/${events.length} event(s) avec ticketsScanned/attendees/ticketsSold`,
      events.slice(0, 3).map((e) => ({
        id: e?.id,
        ticketsScanned: e?.ticketsScanned,
        attendees: e?.attendees,
        ticketsSold: e?.ticketsSold,
      })),
    )
    // ── Diagnostic COÛTS (shop-details.menuItemCostMap) ───────────────────
    const costMapKeys = Object.keys(menuItemCostMap)
    console.log(
      `[useSpaceData] 💶 coûts API (shop-details.menuItemCostMap) — ${costMapKeys.length} entrée(s)`,
      costMapKeys.length ? menuItemCostMap : '(vide → fallback sur cost des menu items en phase 2)',
    )

    if (!space) {
      const err = new Error('Space not found in API')
      err.code = 'SPACE_NOT_FOUND'
      throw err
    }

    if (hasMissingWeezeventTable) {
      console.warn(
        '[useSpaceData] ⚠️ Backend incomplete (Weezevent table missing). Returning empty data.',
      )
      // Phase 2 non pertinente si les tables Weezevent manquent
      if (onEnrichment) onEnrichment({ menuItems: [], ingredients: [], components: [], suppliers: [] })
      return {
        space,
        configurations,
        events: [],
        shopGranularData: [],
        menuItemCostMap: {},
        menuItems: [],
        suppliers: [],
        ingredients: [],
        components: [],
        summary: null,
        _fromMock: false,
        _weezeventSetupIncomplete: true,
        _configurationsFetchFailed: configurationsFetchFailed,
      }
    }

    if (!hasData) {
      console.warn(`[useSpaceData] ⚠️ Space "${space?.name}" : 0 events / 0 records. Vérifiez : configs → shops → mappings Weezevent (Step 2) → sync transactions.`)
    }
    if (!hasConfig) {
      console.warn(`[useSpaceData] ⚠️ Space "${space?.name}" : aucune configuration. Créez une configuration dans le builder.`)
    }

    // ── Phase 2 : granular + enrichissement (menu, coûts, ingrédients) ──────
    // Lance les appels en arrière-plan. Si onEnrichment est fourni, on retourne
    // immédiatement avec les données critiques et on rappelle onEnrichment quand
    // les données secondaires arrivent (two-phase rendering).
    const loadEnrichment = async (onPartial = null) => {
      const _t2 = (typeof performance !== 'undefined' ? performance.now() : Date.now())
      // ── Vague 2a : tout ce dont les GRAPHES ont besoin ─────────────────────
      // Séparée de 2b (recettes) pour que `enriching` retombe dès que les ventes
      // détaillées sont là, sans attendre la pagination /menu-components + son
      // fan-out de détails (concurrence 5) qui n'alimente que Restock/Stock up.
      const [apiMenuItems, granularDetails, apiProductTypes, apiProductCategories, apiWeezeventProducts, apiWeezeventProductMappings] = await Promise.all([
        getAllMenuItems(spaceId).catch((e) => { console.warn('[useSpaceData] ⚠️ menuItems failed:', e?.response?.status, e?.message); return [] }),
        // Granular data — heavy join, loaded in background
        getSpaceShopGranular(spaceId, { page: 1, limit: 200 }).catch((e) => {
          console.warn('[useSpaceData] ⚠️ shopGranular failed:', e?.response?.status, e?.message)
          return {}
        }),
        getProductTypes().catch(() => []),
        getProductCategories().catch(() => []),
        // Produits Weezevent → prix réels (basePrice) pour Event Predict + repli
        // dims nature/subnature (réconciliation Analyse). catalogSpaceId filtre le
        // catalogue sur l'intégration Weezevent DE CET ESPACE (requête indexée simple,
        // pas de cascade de prix scopée-espace — cf. gotcha noté après le 1er test :
        // passer `spaceId` ici déclenchait une cascade de repli coûteuse et annulait la
        // requête après >1 min). Le prix reste le prix modal global rapide.
        getWeezeventProducts(null, null, null, true, { catalogSpaceId: spaceId }).catch((e) => { console.warn('[useSpaceData] ⚠️ weezeventProducts failed:', e?.response?.status, e?.message); return [] }),
        // Mappings produit Weezevent → MenuItem (pour récupérer les coûts/marges).
        // NB : `getProductMappings(locationId)` filtre par LOCATION Weezevent (un id
        // Weezevent, pas le spaceId DataFriday) — pas de résolution spaceId→locationId
        // disponible ici sans appel réseau supplémentaire, donc appel volontairement
        // non scopé (backend filtre déjà par tenant).
        getProductMappings().catch((e) => { console.warn('[useSpaceData] ⚠️ productMappings failed:', e?.response?.status, e?.message); return [] }),
      ])
      const menuItems = normalizeList(apiMenuItems)
      const productTypes = normalizeList(apiProductTypes)
      const productCategories = normalizeList(apiProductCategories)
      const weezeventProducts = normalizeList(apiWeezeventProducts)
      const weezeventProductMappings = normalizeList(apiWeezeventProductMappings)

      const rawGranularData =
        granularDetails?.shopGranularData ||
        granularDetails?.records ||
        (Array.isArray(granularDetails) ? granularDetails : [])
      // Normalise revenue field: the SQL RPC historically returned 'revenueHt' only.
      // The new migration adds 'revenue' as an alias, but we normalise defensively
      // here so old cached/pre-migration responses still work correctly.
      // Parenthèses explicites : la version sans parenthèses reposait sur la
      // précédence && > || (comportement identique, lisibilité fragile).
      const revenueNormalizedData = rawGranularData.map((r) => (
        r.revenue == null || (r.revenue === 0 && r.revenueHt != null)
          ? { ...r, revenue: r.revenueHt ?? 0 }
          : r
      ))
      const granularData = enrichGranularMenuDimensions(
        revenueNormalizedData,
        menuItems,
        productTypes,
        productCategories,
        weezeventProducts,
        weezeventProductMappings,
      )
      // Tag each menu item with current spaceId if spaceIds is absent, puis
      // normalise (readyForSale 'Yes'/'No' + components unifiés incluant le
      // packaging) pour que le réarmement et l'inventaire aient une shape stable
      // quelle que soit la sérialisation backend. Voir docs/menuItems.api.md.
      const normalizedMenuItems = menuItems.map((mi) => {
        const tagged =
          Array.isArray(mi.spaceIds) && mi.spaceIds.length
            ? mi
            : { ...mi, spaceIds: [spaceId] }
        return normalizeMenuItem(tagged)
      })
      // ── Coûts unitaires par menu item (pour la MARGE) ─────────────────────
      // Source primaire = shop-details (phase 1). Fallback : champ cost /
      // costPerUnit / unitCost des menu items renvoyés par l'API → permet de
      // calculer la marge même si shop-details ne fournit pas de costMap.
      // Calculé sur `normalizedMenuItems` : la résolution des refs catalogue
      // (vague 2b) ne touche PAS les champs de coût.
      const costFromMenuItems = {}
      for (const mi of normalizedMenuItems) {
        const c = Number(mi?.cost ?? mi?.costPerUnit ?? mi?.unitCost)
        if (mi?.id && Number.isFinite(c) && c > 0) costFromMenuItems[mi.id] = c
      }
      console.log(
        `[useSpaceData] 💶 coûts menu items — ${Object.keys(costFromMenuItems).length}/${normalizedMenuItems.length} item(s) avec cost>0 (fallback costMap)`,
        normalizedMenuItems.slice(0, 3).map((mi) => ({ id: mi?.id, name: mi?.name, cost: mi?.cost, costPerUnit: mi?.costPerUnit, unitCost: mi?.unitCost })),
      )

      // Payload commun aux deux vagues : la 2b ne fera que RAFFINER `menuItems`
      // (noms de composants résolus) et ajouter ingredients/components.
      const chartsPayload = {
        menuItems: normalizedMenuItems,
        menuItemCostMap: costFromMenuItems,
        suppliers: details?.suppliers?.length ? details.suppliers : [],
        // Do not pass events in phase 2 — DataFriday events (individual matches)
        // are already loaded in phase 1 and must not be overwritten by Weezevent seasons.
        events: [],
        shopGranularData: granularData,
        weezeventProducts,
        weezeventProductMappings,
        // Taxonomie catalogue DataFriday → source unique des dimensions item côté
        // store (réconciliation). Jusqu'ici fetchée puis jetée.
        productTypes,
        productCategories,
      }
      console.log(
        `[useSpaceData] phase 2a ✅ ${normalizedMenuItems.length} menu items, ${granularData.length} granular records`,
        `| [perf] phase2a ${Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - _t2)}ms`,
      )
      // Les graphes peuvent peindre : on rend la main AVANT les catalogues recette.
      if (onPartial) onPartial(chartsPayload)

      // ── Vague 2b : catalogues recette (Restock / Stock up) ─────────────────
      // Catalogues ingrédients/composants/packaging : le payload /menu-items ne
      // porte que des REFS ({ingredientId, numberOfUnits}) sans nom — on résout
      // les noms côté front (resolveComponentRefs) tant que le backend ne
      // dénormalise pas components[] (cf. docs/dejaFaits/menuItems.api.md).
      const _t2b = (typeof performance !== 'undefined' ? performance.now() : Date.now())
      const [apiIngredients, apiMenuComponents, apiPackagings] = await Promise.all([
        getIngredients().catch((e) => { console.warn('[useSpaceData] ⚠️ ingredients failed:', e?.response?.status, e?.message); return [] }),
        fetchAllMenuComponents().catch((e) => { console.warn('[useSpaceData] ⚠️ menuComponents failed:', e?.response?.status, e?.message); return [] }),
        getAllPackagingTypes().catch((e) => { console.warn('[useSpaceData] ⚠️ packagings failed:', e?.response?.status, e?.message); return [] }),
      ])

      const catalogIngredients = normalizeList(apiIngredients)
      const catalogComponents = normalizeList(apiMenuComponents)
      const catalogPackagings = normalizeList(apiPackagings)
      // Rétro-compat : les catalogues shop-details restent prioritaires s'ils
      // existent (même source qu'avant), sinon les endpoints dédiés.
      const baseComponents = normalizeList(details?.components).length
        ? normalizeList(details?.components)
        : catalogComponents
      // shop-details ne porte PAS la recette (`subComponents`/`numberOfUnitsRecipe`) :
      // on l'enrichit depuis /menu-components (catalogComponents) par id puis nom.
      // REQUIS à la décomposition composant→ingrédients (Restock, F6) : sans
      // subComponents, un composant reste réarmé en 1 ligne. NB : Space Inventory
      // ne décompose PLUS (décision 2026-07-18) — seul le restock éclate encore.
      const cnorm = (s) => String(s ?? '').trim().toLowerCase()
      const catBy = new Map()
      for (const c of catalogComponents) {
        if (c?.id != null && !catBy.has(`id:${c.id}`)) catBy.set(`id:${c.id}`, c)
        const n = cnorm(c?.name)
        if (n && !catBy.has(`nm:${n}`)) catBy.set(`nm:${n}`, c)
      }
      const components = baseComponents.map((c) => {
        if (Array.isArray(c?.subComponents) && c.subComponents.length) return c
        const hit = catBy.get(`id:${c?.id}`) || catBy.get(`nm:${cnorm(c?.name)}`)
        return hit?.subComponents?.length
          ? { ...c, subComponents: hit.subComponents, numberOfUnitsRecipe: c.numberOfUnitsRecipe ?? hit.numberOfUnitsRecipe }
          : c
      })
      // La LISTE /menu-components ne renvoie PAS `subComponents` (seul le détail
      // /menu-components/:id les porte). On hydrate la recette par fetch détail pour
      // les composants qui en manquent — REQUIS à la décomposition composant→ingrédients
      // côté Restock (F6). Borné (runWithConcurrency) + toléré (échec = composant non éclaté).
      const needDetail = components.filter((c) => c?.id && !(c?.subComponents?.length))
      if (needDetail.length) {
        try {
          const { runWithConcurrency } = await import('@/utils/asyncPool')
          const { getMenuComponent } = await import('@/api/endpoints/menu.api')
          // Résolution des noms d'ingrédients : le détail `ingredients[]` peut ne
          // porter que des refs (ingredientId) sans libellé → on résout via le
          // catalogue ingredients déjà chargé (évite N fetchs getIngredient).
          const ingById = new Map(
            catalogIngredients.filter((x) => x?.id != null).map((x) => [String(x.id), x]),
          )
          const detailById = new Map()
          await runWithConcurrency(needDetail, 5, async (c) => {
            try {
              const d = await getMenuComponent(c.id)
              const full = d?.data ?? d
              // Le détail expose `ingredients[]` + `children[]` (PAS `subComponents`,
              // qui est la shape du builder front). On les fusionne en subComponents
              // normalisés attendus par flattenComponentDef. `ing.ingredientId` EST le
              // marketPriceId (cf. ComponentCreateView) ; `child.componentId` = ref def.
              const ings = Array.isArray(full?.ingredients) ? full.ingredients : []
              const children = Array.isArray(full?.children) ? full.children : []
              const subs = [
                ...ings.map((ing) => {
                  const iid = ing?.ingredientId || ing?.ingredient_id || null
                  const cat = iid != null ? ingById.get(String(iid)) : null
                  return {
                    itemType: 'Ingredient',
                    id: iid,
                    marketPriceId: iid,
                    name:
                      ing?.itemName || ing?.name ||
                      cat?.name || cat?.itemName || cat?.marketPrice?.supplierItem || null,
                    numberOfUnits: Number(ing?.quantity ?? ing?.numberOfUnits ?? 0) || 0,
                    unit: ing?.unit || ing?.recipeUnit || cat?.unit || 'unit',
                  }
                }),
                ...children.map((ch) => {
                  const cid = ch?.componentId || ch?.id || null
                  return {
                    itemType: 'Component',
                    id: cid,
                    sourceId: cid,
                    name: ch?.itemName || ch?.name || null,
                    numberOfUnits: Number(ch?.numberOfUnits ?? 0) || 0,
                    unit: ch?.unit || 'unit',
                  }
                }),
              ].filter((s) => s.name)
              if (subs.length) {
                detailById.set(c.id, { subComponents: subs, numberOfUnitsRecipe: full?.numberOfUnitsRecipe })
              }
            } catch (_) { /* toléré : composant sans détail → non éclaté */ }
          })
          for (let i = 0; i < components.length; i++) {
            const hit = detailById.get(components[i]?.id)
            if (hit) {
              components[i] = {
                ...components[i],
                subComponents: hit.subComponents,
                numberOfUnitsRecipe: components[i].numberOfUnitsRecipe ?? hit.numberOfUnitsRecipe,
              }
            }
          }
        } catch (e) {
          console.warn('[useSpaceData] ⚠️ hydratation subComponents (détail) échouée:', e?.message)
        }
      }
      console.log(
        `[useSpaceData] 🧩 components recette — base=${baseComponents.length}, catalog=${catalogComponents.length}, ` +
          `avec subComponents=${components.filter((c) => c?.subComponents?.length).length}`,
      )
      const ingredients = normalizeList(details?.ingredients).length
        ? normalizeList(details?.ingredients)
        : catalogIngredients
      // Jointure catalogues : complète les components sans nom (refs backend).
      const refResolution = resolveComponentRefs(normalizedMenuItems, {
        ingredients,
        components,
        packagings: catalogPackagings,
      })
      const taggedMenuItems = refResolution.menuItems
      // Diagnostic du « data gap » recettes (réarmement composé).
      const cov = menuItemsCoverage(taggedMenuItems)
      console.log(
        `[useSpaceData] 🧩 recettes — readyForSale: ${cov.withReadyForSale}/${cov.total} | avec components: ${cov.withComponents}/${cov.total}` +
          ` | components résolus catalogue: ${refResolution.resolved}, irrésolus (sans nom ni ref): ${refResolution.unresolved}`,
      )
      console.log(`[useSpaceData] phase 2b ✅ ${taggedMenuItems.length} menu items, ${components.length} components, ${ingredients.length} ingredients`,
        `| [perf] phase2b ${Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - _t2b)}ms`)
      // Même payload que la vague 2a + les catalogues recette ; `menuItems` est
      // remplacé par la version aux refs résolues (mêmes ids, noms complétés).
      return {
        ...chartsPayload,
        menuItems: taggedMenuItems,
        ingredients,
        components,
      }
    }

    // Phase 1 result — used for immediate first paint
    const phase1Result = {
      space,
      configurations,
      events,
      shopGranularData,
      menuItemCostMap,
      summary: details?.summary || null,
      _fromMock: false,
      _configurationsFetchFailed: configurationsFetchFailed,
    }

    if (onEnrichment) {
      // Two-phase: return critical data now, enrichment via callback.
      // `onEnrichment` est appelé DEUX fois : à la fin de 2a (graphes) puis de 2b.
      // La 2e passe n'envoie QUE son delta recette — réémettre `shopGranularData` /
      // taxonomie / produits Weezevent relancerait toute la réconciliation une 2e
      // fois pour des données identiques (coûteux sur un gros espace).
      loadEnrichment(onEnrichment)
        .then((full) => onEnrichment({
          menuItems: full.menuItems, // refs catalogue résolues (mêmes ids qu'en 2a)
          ingredients: full.ingredients,
          components: full.components,
        }))
        .catch((e) => {
          console.warn('[useSpaceData] ⚠️ enrichment background load failed:', e?.message)
          // Payload VIDE : lève le skeleton sans rien écraser. Un `menuItems: []`
          // ici effacerait ce que la vague 2a a déjà affiché si c'est 2b qui jette.
          onEnrichment({})
        })
      return { ...phase1Result, menuItems: [], suppliers: [], ingredients: [], components: [] }
    }

    // Single-phase (legacy): await everything before returning
    const enrichment = await loadEnrichment()
    console.log(
      `[useSpaceData] ✅ API OK: "${space?.name}", ${events.length} events, ${shopGranularData.length} records, ${enrichment.menuItems.length} menu items`,
    )
    return { ...phase1Result, ...enrichment }

  } catch (err) {
    const status = err?.response?.status
    console.error('[useSpaceData] catch block — status:', status, '| code:', err?.code, '| message:', err?.message)
    // Auth errors (401/403) must surface to the UI — don't mask with mock.
    if (status === 401 || status === 403) {
      throw err
    }
    // Re-throw all other errors (no mock fallback)
    throw err
  }
}
