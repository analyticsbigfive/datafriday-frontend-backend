<template>
  <!-- États PRIORITAIRES (non 'ready') : loading / config / mapping / non-calculé.
       Distinguer ces cas évite d'afficher « aucun article » pendant le calcul ou
       avant la prédiction. Le contexte est fourni par le parent (`items-context`). -->
  <div v-if="itemsContext !== 'ready'" class="ep-stockup-empty">
    <template v-if="itemsContext === 'loading'">
      <v-progress-circular indeterminate size="22" width="2" class="mb-2" color="primary" />
      <p>{{ t('epItemsLoading') }}</p>
    </template>
    <template v-else-if="itemsContext === 'no-config'">
      <p>{{ configuration ? t('epsNoStockItems') : t('epsNoConfigSelected') }}</p>
      <p v-if="configuration" class="ep-stockup-empty-sub">
        {{ t('epsSelectMenuItemsHint') }}
      </p>
    </template>
    <template v-else>
      <!-- no-mapping / not-calculated : prédiction indisponible -->
      <p>{{ t('epNoItemsPrediction') }}</p>
    </template>
  </div>

  <!-- 'ready' mais aucune donnée dérivable (liste réellement vide). -->
  <div v-else-if="!fbElements.length" class="ep-stockup-empty">
    <p>{{ t('epNoItems') }}</p>
  </div>

  <!-- Vue PAR ARTICLE — grain ÉLÉMENT (BUG-291-01) : ce qu'on charge dans le
       camion, tous stands confondus. Une ligne = un élément stockable, le plat
       n'apparaît plus qu'en source sous « utilisé dans ». -->
  <div v-else-if="viewMode === 'item'" class="ep-stockup-root">
    <div v-if="!elementStockData.length" class="ep-stockup-empty">
      <p>{{ t('epNoItems') }}</p>
    </div>
    <template v-else>
      <!-- BUG-291-01 : ce total est SUPÉRIEUR au « Coût ajusté » du résumé, et c'est
           normal — il valorise des unités ENTIÈRES (on ne charge pas 104,7 burgers)
           là où la projection financière garde les décimales. Mesuré le 2026-08-04 :
           l'écart est à 100 % de l'arrondi, les deux bases de coût concordent au
           centime près. L'infobulle évite la question en démo. -->
      <div
        v-if="showTotalStockCostBar && totalStockCost > 0"
        class="ep-stockup-costbar"
        :title="t('epsTotalEstimatedCostHint')"
      >
        <span class="ep-stockup-costbar-label">{{ t('epsTotalEstimatedCost') }}</span>
        <strong class="ep-stockup-costbar-value">{{ formatCurrency(totalStockCost) }}</strong>
      </div>
      <div class="ep-stockup-elements">
        <StockElementRow
          v-for="el in elementStockData"
          :key="el.key"
          :name="el.name"
          :unit="el.unit"
          :total-quantity="el.totalQuantity"
          :unit-cost="el.unitCost"
          :item-type="el.itemType"
          :is-expanded="el.isExpanded"
          :sources="el.sources"
          :shops="el.shops"
          :packaging="computePackaging(el)"
        />
      </div>
    </template>
  </div>

  <div v-else-if="!sortedShopElements.length" class="ep-stockup-empty">
    <p>{{ t('epNoItems') }}</p>
  </div>

  <!-- Vue PAR PDV — même grain et MÊME composant de ligne que la vue par
       article. BUG-291-01 : le niveau de groupement par shopType a été retiré
       (tous les stands sans `shopType` atterrissaient dans un unique groupe
       « Aucun type de point de vente », qui n'apportait rien). -->
  <div v-else class="ep-stockup-root">
    <div class="ep-stockup-shops">
      <Card
        v-for="element in sortedShopElements"
        :key="element.id"
        class-name="overflow-hidden"
      >
        <button
          type="button"
          class="ep-stockup-shop-header"
          @click="toggleShopExpanded(element.id)"
        >
          <div class="ep-stockup-shop-header-left">
            <ImageWithFallback
              v-if="element.picture"
              :src="element.picture"
              :alt="element.name"
              class-name="ep-stockup-shop-image"
            />
            <div class="ep-stockup-shop-meta">
              <div class="ep-stockup-shop-name">{{ element.name }}</div>
              <p class="ep-stockup-shop-count">
                {{ (shopStockData[element.id] || []).length }}
                {{ (shopStockData[element.id] || []).length === 1 ? t('epsElement') : t('epsElements') }}
              </p>
            </div>
          </div>
          <ChevronUp v-if="expandedShops[element.id]" class="w-5 h-5 ep-stockup-chev" />
          <ChevronDown v-else class="w-5 h-5 ep-stockup-chev" />
        </button>

        <div v-if="expandedShops[element.id]" class="ep-stockup-shop-body">
          <div class="ep-stockup-scroll">
            <div class="ep-stockup-items">
              <!-- `shops` non passé : on est déjà dans le stand. -->
              <StockElementRow
                v-for="(item, idx) in shopStockData[element.id] || []"
                :key="`${item.id}-${idx}`"
                :name="item.name"
                :unit="item.unit"
                :total-quantity="item.totalQuantity"
                :unit-cost="item.unitCost || 0"
                :item-type="item.itemType"
                :is-expanded="item.isExpanded"
                :sources="item.sources"
                :packaging="computePackaging(item)"
              />
            </div>
          </div>
        </div>
      </Card>
    </div>
  </div>
</template>

<script>
/**
 * EventPredictStockUpSection.vue — port 1:1 du composant React
 * `EventPredictStockUpSection.tsx` (versionReact).
 *
 * Calcule, pour chaque shop F&B d'une configuration, les composants/
 * ingrédients à approvisionner en fonction :
 *  - des menu items sélectionnés par shop (`selectedMenuItems`),
 *  - de la quantité prédite (issue de `predictedTimelineData`) × ajustement
 *    utilisateur (`quantityAdjustments`).
 *
 * Les menu items `readyForSale === 'No'` sont expansés récursivement (max 10
 * niveaux). Formule par composant :
 *   componentQuantity = (numberOfUnits * menuItemQuantity) / numberOfPiecesRecipe
 * `numberOfPiecesRecipe` retombe à 1 si absent (idem React).
 *
 * Mapping props :
 *  - selectedMenuItems : React `Map<string, Set<string>>` → Object<shopId, string[]>
 *  - quantityAdjustments : React `Map<string, number>` → Object<"shopId-menuItemId", number>
 */
import Card from '@/ui/card.vue'
import ImageWithFallback from '@/figma/ImageWithFallBack.vue'
// BUG-291-01 : ligne d'élément PARTAGÉE par les vues « Par PDV » et « Par
// article » — les deux lisent déjà la même source (`shopStockData`), ce
// composant garantit qu'elles ne divergent pas non plus d'affichage.
import StockElementRow from './StockElementRow.vue'
import { useI18n } from '@/i18n/useI18n'
// Renommé : la méthode locale `formatCurrency` (2 déc.) garde son nom d'appel dans le template.
import { formatCurrencyDetailed as fmtCurrency } from '@/composables/useFormatters'
import {
  buildTimelineQuantityIndex,
  shopLookupKeys,
  itemLookupKeys,
  lookupPredictedQuantity,
} from '@/utils/predictedQuantityIndex'
// MÊME normaliseur que la clé de `shopMenuUnavailable` côté parent (clé = nom de
// shop normalisé) : en changer un seul romprait l'appariement en silence.
import { normalizeStr } from '@/utils/predictiveAnalytics'
// BUG-292-01 — règle de décomposition partagée par les 4 écrans. Aliasée : la
// méthode locale du même nom garde sa signature positionnelle (appelée via `this`
// depuis `shopStockData`), le module est appelé par objet nommé.
import { expandMenuItem as expandMenuItemShared } from '@/utils/menuItemExpansion'
// BUG-299-01 — résolution catalogue partagée (ID d'abord, nom en repli) pour le
// conditionnement, au lieu d'un .find local mélangeant id et nom.
import { findStockReference } from '@/utils/stockPlanning'
import { ChevronDown, ChevronUp } from 'lucide-vue-next'

const MAX_DEPTH = 10

export default {
  name: 'EventPredictStockUpSection',

  components: {
    Card,
    ImageWithFallback,
    StockElementRow,
    ChevronDown,
    ChevronUp,
  },

  props: {
    configuration: { type: Object, default: null },
    menuItems: { type: Array, default: () => [] },
    /** Liste plate des ingredients (avec packagingType/UnitNumber/Unit + purchaseUnitConversion). */
    ingredients: { type: Array, default: () => [] },
    /** Liste plate des components (avec mêmes champs packaging si applicable). */
    components: { type: Array, default: () => [] },
    predictedTimelineData: { type: Array, default: () => [] },
    /** Object<shopId, string[]> — équivalent du React Map<string, Set<string>>. */
    selectedMenuItems: { type: Object, default: () => ({}) },
    /** Object<"shopId-menuItemId", number> — équivalent du React Map<string, number>. */
    quantityAdjustments: { type: Object, default: () => ({}) },
    /** Object<"elementId-menuItemId", number> — quantités absolues manuelles
     *  pour les items à prédiction 0 (aucune vente prévue par l'algo). */
    manualQuantities: { type: Object, default: () => ({}) },
    /** 'shop' (default) | 'item' — déterminé par le parent (Configuration tab). */
    viewMode: { type: String, default: 'shop' },
    /** Object<menuItemId, number> — coût unitaire (fallback si pas sur le menuItem). */
    menuItemCostMap: { type: Object, default: () => ({}) },
    /** Contexte des listes fourni par le parent : 'loading' | 'no-config' |
     *  'no-mapping' | 'not-calculated' | 'ready'. Default 'ready' → rétro-compat
     *  (comportement inchangé si le parent ne câble pas la prop). */
    itemsContext: { type: String, default: 'ready' },
    /** Articles assignés au Space Menu du shop mais NON DISPONIBLES côté serveur
     *  (BUG-291-02) : Map(normalizeStr(shopName) → { ids:Set, names:Set }).
     *  null = pas encore chargé → garde inactive (rétro-compat stricte). */
    shopMenuUnavailable: { type: Object, default: null },
    // BUG-292-01 (D1) — shops réels de la config (`/spaces/:id/shops`), source
    // indépendante du layout. Non filtrée ici (le CA merch doit rester compté,
    // BUG-274) : `fbElements` écarte `merchshop` au point d'usage.
    configShops: { type: Array, default: () => [] },
  },

  setup() {
    const { t } = useI18n()
    return { t }
  },

  data() {
    return {
      /** Object<shopId, boolean>. */
      expandedShops: {},
      /**
       * Barre « Coût total estimé du stock-up » MASQUÉE en attendant la réponse à
       * la question #51 de `docs/QUESTIONS_A_BERTRAND.md` : ce total dépasse par
       * construction le « Coût ajusté » du résumé (unités entières vs décimales,
       * cf. commentaire du template) et la question tombe à chaque démo. Le
       * markup, le CSS, les clés i18n et `totalStockCost` restent en place :
       * un seul booléen à repasser à `true` quand la formulation est tranchée.
       */
      showTotalStockCostBar: false,
    }
  },

  computed: {
    // PERF: index id → menuItem (caché). Réutilisé par shopStockData
    // / expandMenuItem au lieu de reconstruire une Map ou de scanner le catalogue.
    menuItemsById() {
      const m = new Map()
      const list = Array.isArray(this.menuItems) ? this.menuItems : []
      for (const mi of list) if (mi && mi.id != null) m.set(mi.id, mi)
      return m
    },
    // PERF: résolution component → menuItem en O(1) dans expandMenuItem (au lieu
    // d'un Array.find O(catalogue) par composant/item/shop, récursif).
    // BUG-299-01 — la sémantique du module est ID D'ABORD (`byId`, fourni au call
    // site via menuItemsById) ; `byName` n'est qu'un repli pour les lignes sans
    // sourceId. `idxById` n'arbitre plus rien — conservé pour le shape attendu.
    componentLookup() {
      const byName = new Map()
      const idxById = new Map()
      const list = Array.isArray(this.menuItems) ? this.menuItems : []
      list.forEach((mi, idx) => {
        if (!mi) return
        idxById.set(mi.id, idx)
        if (mi.name != null && !byName.has(mi.name)) byName.set(mi.name, { item: mi, idx })
      })
      return { byName, idxById }
    },
    /**
     * Récupère tous les éléments F&B (shop / hospitality / kitchen) d'une
     * configuration, en parcourant `floors[].elements` + `forecourt.elements`.
     */
    fbElements() {
      const cfg = this.configuration
      if (cfg) {
        const data = cfg.data || cfg
        const out = []
        const isFb = (el) =>
          el && (el.type === 'shop' || el.type === 'hospitality' || el.type === 'kitchen')

        if (Array.isArray(data.floors)) {
          data.floors.forEach((floor) => {
            if (Array.isArray(floor?.elements)) {
              floor.elements.forEach((el) => {
                if (isFb(el)) out.push(el)
              })
            }
          })
        }
        if (data.forecourt && Array.isArray(data.forecourt.elements)) {
          data.forecourt.elements.forEach((el) => {
            if (isFb(el)) out.push(el)
          })
        }
        if (data.externalMerch && Array.isArray(data.externalMerch.elements)) {
          data.externalMerch.elements.forEach((el) => {
            if (isFb(el)) out.push(el)
          })
        }
        if (out.length) return out
      }
      // BUG-292-01 (D1) — source AUTORITAIRE avant le repli timeline, alignée sur
      // `EventPredictMenusSection.fbElements` : `/spaces/:id/shops` est un endpoint
      // INDÉPENDANT du layout, il répond même quand `/configurations` ne renvoie pas
      // `.data.floors`. Deux gains :
      //  - le merch est filtrable, parce que ces rows portent un vrai `type` ; le
      //    repli synthétique, lui, code `type: 'shop'` en dur à partir de records de
      //    timeline qui ne portent AUCUN signal merch (`shopType` est une dim de PdV
      //    — 'gppremium'… — jamais 'merchshop') : aucun filtre aval ne pouvait
      //    rattraper un stand merch arrivé par là ;
      //  - on couvre TOUS les shops de la config, pas seulement ceux qui ont déjà
      //    vendu — un event futur n'a pas de timeline.
      // `configShops` lui-même reste NON filtré côté parent : le CA merch doit
      // rester compté (BUG-274). Le filtre est ici, au point d'usage F&B.
      if (Array.isArray(this.configShops) && this.configShops.length) {
        return this.configShops.filter((el) => el?.type !== 'merchshop')
      }
      // Dernier repli : ni layout ni /shops (events Weezevent sans import shops).
      // On dérive les shops des VENTES pour rester calculable. Sans signal merch
      // disponible à ce stade — limite connue, cf. fiche BUG-292-01.
      return this.syntheticElementsFromTimeline
    },
    /**
     * Shops synthétiques reconstruits depuis `predictedTimelineData` : 1 élément
     * par shop. `id` = shopId (clé de `selectedMenuItems`, et clé brute de
     * `timelineDataIndex`), `name` = libellé du shop (indexé NORMALISÉ, cf.
     * `shopLookupKeys`) → `getPredictedQuantity` couvre les deux alias.
     * Utilisé quand la config n'a pas de layout (events Weezevent).
     */
    syntheticElementsFromTimeline() {
      const data = this.predictedTimelineData || []
      if (!data.length) return []
      const byShop = new Map()
      for (const r of data) {
        const id = r.shopId || r.shop
        if (!id || byShop.has(id)) continue
        byShop.set(id, {
          id,
          name: r.shop || r.shopName || r.elementName || String(id),
          type: 'shop',
          _synthetic: true,
        })
      }
      return [...byShop.values()]
    },

    /**
     * Les catalogues recette (vague 2b de `useSpaceData`) sont-ils arrivés ?
     * `components`/`ingredients` restent vides pendant la vague 2a, où les menu
     * items sont déjà là mais leurs recettes non résolues. Sert à ne pas prendre
     * un article pas encore hydraté pour un article sans recette (cf. le repli
     * de `expandMenuItem`).
     */
    recipeCatalogLoaded() {
      return (this.components?.length || 0) > 0 || (this.ingredients?.length || 0) > 0
    },

    /**
     * Map `${shopKey}|${itemKey}` → quantité totale agrégée.
     *
     * BUG-290-01 : cet index n'avait qu'UNE clé shop (`shopId`) et UNE clé item
     * (`menuItemId || mappedMenuItemId`). Or `menuItemId` porte l'id du produit
     * de vente Weezevent et `mappedMenuItemId` l'id catalogue
     * (`timelineBucketing.js` :174/:204) : interrogé avec l'id catalogue, il ne
     * trouvait rien → prédiction 0 → `shopStockData` écartait l'article
     * (garde `adjustedQty === 0`) et le Burger disparaissait du stock-up.
     * On utilise désormais le MÊME index que l'écran Menus (id + nom, pour le
     * shop comme pour l'item).
     */
    timelineDataIndex() {
      return buildTimelineQuantityIndex(this.predictedTimelineData)
    },

    /**
     * Pour chaque shop : liste agrégée des StockItem.
     * Stocké en plain object {shopId: StockItem[]} pour rester sérialisable.
     */
    shopStockData() {
      const result = {}
      const menuItemsById = this.menuItemsById
      const componentLookup = this.componentLookup

      this.fbElements.forEach((element) => {
        const ids = this.getSelectedItemIds(element.id)
        if (!ids.length) {
          result[element.id] = []
          return
        }

        const aggregated = new Map()

        ids.forEach((menuItemId) => {
          // BUG-291-02 — exclusion explicite en tête de boucle : une version
          // sauvegardée antérieure peut encore porter l'id d'un article devenu
          // indisponible. On le neutralise à la lecture, sans réécrire la
          // sélection persistée de l'utilisateur.
          if (this.isItemUnavailable(element, menuItemId)) return
          const adjustedQty = this.getAdjustedQuantity(element.id, menuItemId)
          if (adjustedQty === 0) return

          const menuItem = menuItemsById.get(menuItemId)
          if (!menuItem) return

          const expanded = this.expandMenuItem(
            menuItemId,
            adjustedQty,
            menuItem.name,
            0,
            menuItemsById,
            componentLookup,
          )

          expanded.forEach((item) => {
            const key = `${item.name}|||${item.unit}`
            const existing = aggregated.get(key)
            if (existing) {
              existing.totalQuantity += item.totalQuantity
              item.sources.forEach((newSource) => {
                const existingSource = existing.sources.find(
                  (s) => s.menuItemName === newSource.menuItemName,
                )
                if (existingSource) {
                  existingSource.menuItemQuantity += newSource.menuItemQuantity
                  existingSource.componentQuantity += newSource.componentQuantity
                } else {
                  existing.sources.push({ ...newSource })
                }
              })
            } else {
              aggregated.set(key, {
                ...item,
                sources: item.sources.map((s) => ({ ...s })),
              })
            }
          })
        })

        // Garde défensive : `name` peut rester nul si ni le composant ni son
        // menu item n'ont de libellé en base (cf. expandMenuItem) — un
        // localeCompare sur undefined blanchissait l'écran (BUG-289-01).
        result[element.id] = Array.from(aggregated.values()).sort((a, b) =>
          String(a.name ?? '').localeCompare(String(b.name ?? '')),
        )
      })

      return result
    },

    /**
     * Stands à afficher en vue PAR PDV : ceux qui ont du stock, triés par nom.
     * BUG-291-01 : remplace `groupedEntries`, qui insérait un niveau de
     * groupement par `shopType` — inutile ici, où aucun stand n'en porte et où
     * tous se retrouvaient donc sous « Aucun type de point de vente ».
     */
    sortedShopElements() {
      return this.fbElements
        .filter((el) => (this.shopStockData[el.id] || []).length)
        .slice()
        .sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? '')))
    },


    /**
     * Vue PAR ARTICLE au grain ÉLÉMENT (BUG-291-01) — ce qu'on charge dans le
     * camion, tous stands confondus : une ligne par élément stockable, pas par
     * plat.
     *
     * Dérivé de `shopStockData`, JAMAIS d'une seconde expansion : les deux modes
     * de l'écran lisent ainsi la même sortie de `expandMenuItem`, avec la même
     * clé d'agrégation `${name}|||${unit}` (`:475`) — ils ne peuvent pas diverger.
     * Ne pas basculer sur `stockItemKey` (id-based, stockPlanning.js:93) : il
     * découperait autrement et les deux onglets afficheraient des lignes
     * différentes pour le même stock.
     */
    elementStockData() {
      const map = new Map()

      this.fbElements.forEach((element) => {
        for (const item of this.shopStockData[element.id] || []) {
          const key = `${item.name}|||${item.unit}`
          let agg = map.get(key)
          if (!agg) {
            agg = {
              key,
              name: item.name,
              unit: item.unit,
              itemType: item.itemType || null,
              unitCost: item.unitCost || 0,
              isExpanded: !!item.isExpanded,
              totalQuantity: 0,
              shops: [],
              sources: [],
            }
            map.set(key, agg)
          }
          agg.totalQuantity += item.totalQuantity || 0
          agg.shops.push({
            shopId: element.id,
            shopName: element.name,
            quantity: item.totalQuantity || 0,
          })
          // Fusion des sources par nom de plat — MÊME règle que `shopStockData`
          // (`:481`) : un élément partagé par 3 recettes donne 3 sources, pas 3
          // lignes.
          for (const src of item.sources || []) {
            const hit = agg.sources.find((s) => s.menuItemName === src.menuItemName)
            if (hit) {
              hit.menuItemQuantity += src.menuItemQuantity
              hit.componentQuantity += src.componentQuantity
            } else {
              agg.sources.push({ ...src })
            }
          }
        }
      })

      return Array.from(map.values()).sort((a, b) =>
        String(a.name ?? '').localeCompare(String(b.name ?? '')),
      )
    },

    /**
     * Coût total estimé du stock-up.
     *
     * Calculé sur les ÉLÉMENTS (Σ coût unitaire × quantité), même source que les
     * lignes affichées — le total et le détail ne peuvent donc pas diverger.
     * Auparavant calculé sur les menu items : deux chemins de coût pour un même
     * écran.
     */
    totalStockCost() {
      return this.elementStockData.reduce(
        (sum, it) => sum + (it.unitCost || 0) * (it.totalQuantity || 0),
        0,
      )
    },
  },

  methods: {
    /** Coût unitaire d'un menu item : totalCost/unitCost du catalogue, sinon map. */
    miUnitCost(mi) {
      if (!mi) return 0
      const c = mi.totalCost ?? mi.unitCost ?? this.menuItemCostMap?.[mi.id]
      return Number(c) || 0
    },
    formatCurrency(v) {
      return fmtCurrency(Number(v) || 0)
    },
    toggleShopExpanded(shopId) {
      this.expandedShops = {
        ...this.expandedShops,
        [shopId]: !this.expandedShops[shopId],
      }
    },

    getSelectedItemIds(shopId) {
      const v = this.selectedMenuItems ? this.selectedMenuItems[shopId] : null
      if (!v) return []
      // Supporte tableau, Set, ou objet {id: true}
      if (Array.isArray(v)) return v
      if (v instanceof Set) return Array.from(v)
      if (typeof v === 'object') return Object.keys(v).filter((k) => v[k])
      return []
    },

    /**
     * Quantité prédite — MAX sur les alias shop, PAS une somme.
     *
     * BUG-290-01, deux corrections indissociables :
     *  1. les clés de lecture passent par les helpers partagés (nom de shop
     *     NORMALISÉ, et repli par nom d'item) — sans quoi l'id catalogue ne
     *     matchait jamais un index bâti sur l'id produit Weezevent ;
     *  2. la lecture passe de la SOMME au MAX. L'index range la même quantité
     *     sous plusieurs clés (id ET nom) : sommer les alias après la
     *     correction 1 aurait fait passer le Burger de 0 à 190 au lieu de 95.
     * Appliquer l'une sans l'autre donne un résultat faux dans les deux sens.
     */
    getPredictedQuantity(element, menuItemId) {
      // BUG-291-02 : article assigné au menu du PDV mais NON DISPONIBLE côté
      // serveur → 0 vente prévue, donc 0 ligne de stock. Même règle que l'écran
      // Menus, appliquée ici aussi car le Stock-up ne relit pas ses quantités.
      if (this.isItemUnavailable(element, menuItemId)) return 0
      return lookupPredictedQuantity(
        this.timelineDataIndex,
        shopLookupKeys(element),
        itemLookupKeys(menuItemId, this.menuItemsById.get(menuItemId)),
      )
    },

    /**
     * Article assigné au Space Menu du shop mais NON DISPONIBLE côté serveur
     * (recette absente / ingrédient bloqué) — BUG-291-02. Appariement id PUIS nom
     * normalisé, comme côté Menus. Garde inactive tant que la prop n'est pas
     * chargée (rétro-compat).
     */
    isItemUnavailable(element, menuItemId) {
      const src = this.shopMenuUnavailable
      if (!src || !element) return false
      const key = normalizeStr(element?.name)
      const entry = src instanceof Map ? src.get(key) : src[key]
      if (!entry) return false
      if (entry.ids && entry.ids.has(String(menuItemId))) return true
      const nm = normalizeStr(this.menuItemsById.get(menuItemId)?.name)
      return !!(nm && entry.names && entry.names.has(nm))
    },

    /** Quantité ajustée selon le slider % (défaut 100). Pour les items à
     *  prédiction 0, la quantité MANUELLE (unités absolues) prime. */
    getAdjustedQuantity(elementId, menuItemId) {
      const element = this.fbElements.find((el) => el.id === elementId)
      if (!element) return 0
      // BUG-291-02 — garde INDISPENSABLE : plus bas, `base === 0` bascule sur la
      // quantité MANUELLE. Sans elle, forcer le prédit à 0 ferait ressortir un
      // ajusté > 0 pour un article indisponible ayant reçu une saisie manuelle.
      if (this.isItemUnavailable(element, menuItemId)) return 0
      const base = this.getPredictedQuantity(element, menuItemId)
      const key = `${elementId}-${menuItemId}`
      const adjustment = this.quantityAdjustments?.[key] ?? 100
      if (base === 0) {
        // Aucune prédiction → base = quantité manuelle saisie. Le slider % du
        // shop la SCALE (parité EventPredictMenusSection.getAdjustedQuantity).
        const manual = Math.max(0, Number(this.manualQuantities?.[key]) || 0)
        return Math.max(0, Math.round((manual * adjustment) / 100))
      }
      return Math.round((base * adjustment) / 100)
    },

    /**
     * Expansion d'un menu item pour le stock-up — décision Bertrand 2026-08-04,
     * qui confirme et PRÉCISE la Question #18 du 2026-07-24 (BUG-188/BUG-002) :
     *
     *   « Pour un combo item, on prend chaque menu item qui le compose et on les
     *     traite de la même façon que les menu items normaux : si readyForSale
     *     = Yes, on les stocke sans rien décomposer ; si readyForSale = No, on
     *     stocke tous les éléments qui les composent — on n'éclate toujours pas
     *     les composants ! »
     *
     * Règles appliquées :
     *  - comboItem='Yes' → TOUJOURS explosé en ses menu items constitutifs, quel
     *    que soit son propre readyForSale. Un combo est un PANIER, pas un article.
     *  - Sinon, readyForSale='Yes' → 1 item en `pcs`, aucune décomposition.
     *  - Sinon (readyForSale='No') → expansion des `components` sur UN SEUL
     *    NIVEAU, formule (numberOfUnits * menuItemQuantity) / numberOfPiecesRecipe.
     *
     * La récursion dépend de la nature du PARENT, pas du readyForSale de l'enfant
     * (BUG-290-01) : on ouvre le panier, jamais les articles qui sont dedans. Un
     * composant d'un menu item readyForSale='No' reste donc UNE LIGNE même s'il
     * résout vers un menu item — c'est la règle « on stocke la sauce pickle,
     * jamais son ail ». Seul un combo imbriqué justifie de redescendre.
     */
    expandMenuItem(menuItemId, menuItemQuantity, rootMenuItemName, depth, menuItemsById, componentLookup) {
      // BUG-292-01 — la règle vit désormais dans `utils/menuItemExpansion`, partagée
      // avec le réarmement et l'inventaire. Cet écran en était l'implémentation de
      // référence (corrigée au lot BUG-290-01) : le module en est la reprise fidèle,
      // avec les dépendances d'écran injectées au lieu d'être lues sur `this`.
      //
      // Seul changement de comportement ici : l'identité de ligne d'un composant
      // passe de `component.id` (PK de la LIGNE DE RECETTE, unique par couple
      // menu item × article) à l'identité CATALOGUE. Un gobelet partagé par trois
      // recettes produisait trois clés que rien ne fusionnait — trois arrondis
      // carton et un `computePackaging` qui ratait systématiquement son match par
      // id pour retomber sur le nom (BUG-288-01, corrigé côté réarmement seulement).
      // `fallbackWhenEmpty: false` — divergence VOULUE avec le réarmement : ici une
      // recette entièrement anonyme n'émet rien (BUG-291-01, la ligne fantôme
      // « 64,05 unit »), là-bas elle retombe sur l'article. Explicite plutôt que
      // subie.
      return expandMenuItemShared({
        menuItemId,
        quantity: menuItemQuantity,
        rootMenuItemName,
        menuItemsById,
        // `componentLookup` porte byName + idxById ; le module attend aussi byId.
        lookup: { ...componentLookup, byId: menuItemsById },
        depth,
        recipeCatalogLoaded: this.recipeCatalogLoaded,
        fallbackWhenEmpty: false,
        resolveMenuItemUnitCost: (mi) => this.miUnitCost(mi),
      })
    },

    /**
     * Calcule l'info packaging pour un stock item, en résolvant l'ingredient
     * ou component par nom/id (cf. user spec) :
     *   ([qty] / [packagingUnitNumber]) * [purchaseUnitConversion] →
     *     X [packagingType] of [packagingUnitNumber] [packagingUnit]
     * Retourne null si pas d'info packaging dispo pour cet item.
     */
    computePackaging(item) {
      if (!item) return null
      // BUG-299-01 — résolution partagée findStockReference : l'ID (id/sourceId/
      // marketPriceId) sur ingredients PUIS components d'abord, le nom seulement
      // si aucun id ne résout. L'ancien prédicat mixte (id OU nom dans un seul
      // .find) faisait gagner un homonyme par nom (« Beurre ») contre l'ingrédient
      // réellement référencé (« Beurre doux motte ») → mauvais conditionnement.
      const src = findStockReference(item, this.ingredients, this.components, [])
      if (!src) return null
      const packagingType = src.packagingType
      const packagingUnitNumber = Number(src.packagingUnitNumber || 0)
      const packagingUnit = src.packagingUnit
      const purchaseUnitConversion = Number(src.purchaseUnitConversion ?? 1)
      if (!packagingType || !packagingUnitNumber || !packagingUnit) return null
      // packed = ceil((qty / packagingUnitNumber) * purchaseUnitConversion)
      const raw = (item.totalQuantity / packagingUnitNumber) * purchaseUnitConversion
      const packedCount = Math.ceil(raw)
      return {
        packedCount,
        packagingType,
        packagingUnitNumber,
        packagingUnit,
        // Quantité "déballée" théorique pour les packedCount sacs/cartons
        looseQty: packedCount * packagingUnitNumber,
      }
    },
  },
}
</script>

<style scoped>
.ep-stockup-empty {
  text-align: center;
  padding: 2rem 0;
  color: rgb(107, 114, 128);
}
:deep(.dark) .ep-stockup-empty {
  color: rgb(156, 163, 175);
}
.ep-stockup-empty-sub {
  font-size: 0.875rem;
  margin-top: 0.5rem;
}
.ep-stockup-root {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  overflow: visible;
}
.ep-stockup-group {
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 8px;
  background: var(--background, #ffffff);
  overflow: hidden;
}
.ep-stockup-itemview-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 12px 14px;
}
.ep-stockup-itemview-row {
  display: grid;
  grid-template-columns: 1.4fr auto auto 2fr;
  gap: 12px;
  align-items: center;
  padding: 8px 10px;
  border: 1px solid var(--fb-border, #e2e8f0);
  border-radius: 8px;
  background: var(--fb-surface, #fff);
}
.ep-stockup-itemview-name {
  font-weight: 600;
  font-size: 0.85rem;
  color: var(--fb-text, #0f172a);
}
.ep-stockup-itemview-qty {
  font-weight: 700;
  color: var(--fb-text, #0f172a);
}
.ep-stockup-itemview-cost {
  font-weight: 600;
  font-size: 0.8rem;
  color: #b45309;
  white-space: nowrap;
}
/* Bandeau coût total estimé du stock-up. */
.ep-stockup-costbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  padding: 10px 14px;
  border: 1px solid #fde68a;
  border-radius: 10px;
  background: #fffbeb;
}
.ep-stockup-costbar-label {
  font-size: 0.78rem;
  font-weight: 600;
  color: #92400e;
}
.ep-stockup-costbar-value {
  font-size: 1rem;
  color: #b45309;
}
.ep-stockup-itemview-shops {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
  font-size: 0.72rem;
  color: var(--fb-muted, #475569);
}
.ep-stockup-itemview-shop {
  background: var(--fb-border, #f1f5f9);
  padding: 1px 6px;
  border-radius: 4px;
}
.ep-stockup-group-header {
  width: 100%;
  min-height: 52px;
  border: 0;
  background: var(--muted, #f9fafb);
  color: inherit;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  cursor: pointer;
  text-align: left;
}
.ep-stockup-group-header:hover {
  background: var(--fb-border, #f3f4f6);
}
.ep-stockup-group-title,
.ep-stockup-group-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.ep-stockup-group-title {
  font-size: 0.875rem;
  font-weight: 650;
  color: var(--foreground, #111827);
}
.ep-stockup-group-title span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ep-stockup-group-count {
  min-width: 28px;
  border-radius: 9999px;
  font-weight: 700;
}
.ep-stockup-shops {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 12px;
  border-top: 1px solid var(--border, #e5e7eb);
  overflow: visible;
}
.ep-stockup-shop-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 1.125rem 1.25rem;
  cursor: pointer;
  background: transparent;
  border: 0;
  text-align: left;
  transition: background-color 150ms;
}
.ep-stockup-shop-header:hover {
  background-color: rgb(249, 250, 251);
}
:deep(.dark) .ep-stockup-shop-header:hover {
  background-color: rgb(31, 41, 55);
}
.ep-stockup-shop-header-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex: 1 1 auto;
  min-width: 0;
}
.ep-stockup-shop-image {
  width: 3rem;
  height: 3rem;
  border-radius: 0.375rem;
  object-fit: cover;
  flex-shrink: 0;
}
.ep-stockup-shop-meta {
  flex: 1 1 auto;
  min-width: 0;
}
.ep-stockup-shop-name {
  font-size: 1rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ep-stockup-shop-count {
  font-size: 0.75rem;
  color: rgb(75, 85, 99);
  margin-top: 0.25rem;
}
:deep(.dark) .ep-stockup-shop-count {
  color: rgb(156, 163, 175);
}
.ep-stockup-chev {
  color: rgb(107, 114, 128);
  flex-shrink: 0;
}
.ep-stockup-shop-body {
  padding: 0;
}
.ep-stockup-scroll {
  overflow: visible;
}
.ep-stockup-items {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem;
}
.ep-stockup-item {
  padding: 0.5rem;
  border-radius: 0.375rem;
  border: 1px solid rgb(229, 231, 235);
  background-color: rgb(255, 255, 255);
}
:deep(.dark) .ep-stockup-item {
  border-color: rgb(55, 65, 81);
  background-color: rgb(17, 24, 39);
}
.ep-stockup-item.is-expanded {
  background-color: rgb(239, 246, 255);
  border-color: rgb(191, 219, 254);
}
:deep(.dark) .ep-stockup-item.is-expanded {
  background-color: rgba(30, 58, 138, 0.2);
  border-color: rgb(30, 64, 175);
}
.ep-stockup-item-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
}
.ep-stockup-item-info {
  flex: 1 1 auto;
  min-width: 0;
}
.ep-stockup-item-name {
  font-weight: 500;
  font-size: 0.875rem;
}
.ep-stockup-item-sources {
  margin-top: 0.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}
.ep-stockup-item-source {
  font-size: 0.75rem;
  color: rgb(75, 85, 99);
}
:deep(.dark) .ep-stockup-item-source {
  color: rgb(156, 163, 175);
}
.ep-stockup-item-badge {
  flex-shrink: 0;
}
.ep-stockup-item-loose-qty {
  font-size: 0.75rem;
  font-weight: 400;
  color: rgb(107, 114, 128);
  margin-left: 4px;
}
:deep(.dark) .ep-stockup-item-loose-qty {
  color: rgb(156, 163, 175);
}
.ep-stockup-item-badge-col {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  flex-shrink: 0;
}
.ep-stockup-pkg-badge {
  background: #3b82f6 !important;
  color: #fff !important;
  font-weight: 600;
}
.ep-stockup-pkg-sub {
  font-size: 0.6875rem;
  color: rgb(107, 114, 128);
}
:deep(.dark) .ep-stockup-pkg-sub {
  color: rgb(156, 163, 175);
}

/* Shared F&B visual language. */
.ep-stockup-empty {
  color: var(--fb-muted, #6B7280);
}
.ep-stockup-root {
  gap: 1rem;
}
.ep-stockup-group {
  border-color: var(--fb-border, #E5E7EB);
  border-radius: var(--fb-radius-panel, 12px);
  background: var(--fb-surface, #FFFFFF);
  box-shadow: var(--fb-shadow-card, 0 1px 3px rgba(15, 23, 42, 0.05));
}
.ep-stockup-group-header {
  background: var(--fb-subtle, #FAFAFA);
}
.ep-stockup-group-header:hover {
  background: var(--fb-primary-soft, #FFF5F5);
}
.ep-stockup-group-title,
.ep-stockup-shop-name,
.ep-stockup-item-name,
.ep-stockup-itemview-name,
.ep-stockup-itemview-qty {
  color: var(--fb-text, #212121);
}
.ep-stockup-itemview-row,
.ep-stockup-item {
  border-color: var(--fb-border, #E5E7EB);
  border-radius: var(--fb-radius-control, 8px);
  background: var(--fb-surface, #FFFFFF);
}
.ep-stockup-itemview-row:hover,
.ep-stockup-item:hover {
  border-color: rgba(255, 49, 49, 0.26);
  background: var(--fb-primary-soft, #FFF5F5);
}
.ep-stockup-item.is-expanded {
  border-color: rgba(255, 49, 49, 0.32);
  background: var(--fb-primary-soft, #FFF5F5);
}
.ep-stockup-shops {
  border-color: var(--fb-border, #E5E7EB);
}
.ep-stockup-costbar {
  border-color: rgba(217, 119, 6, 0.3);
  border-radius: var(--fb-radius-control, 8px);
  background: var(--fb-warning-soft, #FFFBEB);
}
.ep-stockup-costbar-label,
.ep-stockup-itemview-cost {
  color: var(--fb-warning, #D97706);
}
.ep-stockup-costbar-value {
  color: var(--fb-warning, #D97706);
  font-variant-numeric: tabular-nums;
}
.ep-stockup-pkg-badge {
  background:  #ff3131 !important;
}

/* ===================== DARK MODE — compléments =====================
   Fonds/textes héritent des `--fb-*` de l'overlay parent (dont le fond ambre du
   costbar, déjà migré sur `--fb-warning-soft`/`--fb-warning`). Ne reste que la
   bordure ambre pâle du costbar. */
.dark .ep-stockup-costbar {
  border-color: rgba(217, 119, 6, 0.35);
}
</style>
