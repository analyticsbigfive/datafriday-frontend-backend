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

  <!-- Item View (par produit, agrégé tous shops confondus) -->
  <div v-else-if="viewMode === 'item'" class="ep-stockup-root">
    <div v-if="!itemStockData.length" class="ep-stockup-empty">
      <p>{{ t('epNoItems') }}</p>
    </div>
    <!-- Coût total estimé du stock-up (Σ coût unitaire × quantité). -->
    <div v-if="totalStockCost > 0" class="ep-stockup-costbar">
      <span class="ep-stockup-costbar-label">{{ t('epsTotalEstimatedCost') }}</span>
      <strong class="ep-stockup-costbar-value">{{ formatCurrency(totalStockCost) }}</strong>
    </div>
    <div
      v-for="[category, items] in itemGroupedEntries"
      :key="`itemcat-${category}`"
      class="ep-stockup-group"
    >
      <div class="ep-stockup-group-header">
        <span class="ep-stockup-group-title">
          <span>{{ category === '__no_category__' ? t('epsOtherCategory') : category }}</span>
        </span>
        <Badge variant="default" class="ep-stockup-group-count">
          {{ items.length }}
        </Badge>
      </div>
      <div class="ep-stockup-itemview-list">
        <div
          v-for="it in items"
          :key="`itemview-${it.menuItemId}`"
          class="ep-stockup-itemview-row"
        >
          <div class="ep-stockup-itemview-name">{{ it.menuItemName }}</div>
          <div class="ep-stockup-itemview-qty">{{ it.totalQuantity }}</div>
          <div
            v-if="it.unitCost"
            class="ep-stockup-itemview-cost"
            :title="`${t('epsUnitCostTitle')} ${formatCurrency(it.unitCost)} × ${it.totalQuantity}`"
          >{{ formatCurrency(it.unitCost * it.totalQuantity) }}</div>
          <div class="ep-stockup-itemview-shops">
            <span
              v-for="s in it.shops"
              :key="`${it.menuItemId}-${s.shopId}`"
              class="ep-stockup-itemview-shop"
            >
              {{ s.shopName }}: {{ s.quantity }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div v-else-if="!groupedEntries.length" class="ep-stockup-empty">
    <p>{{ t('epNoItems') }}</p>
  </div>

  <div v-else class="ep-stockup-root">
    <div
      v-for="[compositeType, elements] in groupedEntries"
      :key="compositeType"
      class="ep-stockup-group"
    >
      <Collapsible
        :open="isStockGroupOpen(compositeType)"
        @update:open="(open) => setStockGroupOpen(compositeType, open)"
      >
        <CollapsibleTrigger class="ep-stockup-group-header">
          <span class="ep-stockup-group-title">
            <component :is="getCompositeIcon(compositeType)" class="w-4 h-4" />
            <span>{{ getCompositeLabel(compositeType) }}</span>
          </span>
          <span class="ep-stockup-group-actions">
            <Badge variant="default" class="ep-stockup-group-count">
              {{ elements.length }}
            </Badge>
            <ChevronUp
              v-if="isStockGroupOpen(compositeType)"
              class="w-5 h-5 ep-stockup-chev"
            />
            <ChevronDown v-else class="w-5 h-5 ep-stockup-chev" />
          </span>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div class="ep-stockup-shops">
        <Card
          v-for="element in elements"
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
                  {{ (shopStockData[element.id] || []).length === 1 ? t('epsItem') : t('epsItems') }}
                </p>
              </div>
            </div>
            <ChevronUp v-if="expandedShops[element.id]" class="w-5 h-5 ep-stockup-chev" />
            <ChevronDown v-else class="w-5 h-5 ep-stockup-chev" />
          </button>

          <div v-if="expandedShops[element.id]" class="ep-stockup-shop-body">
            <div class="ep-stockup-scroll">
              <div class="ep-stockup-items">
                <div
                  v-for="(item, idx) in shopStockData[element.id] || []"
                  :key="`${item.id}-${idx}`"
                  class="ep-stockup-item"
                  :class="{ 'is-expanded': item.isExpanded }"
                >
                  <div class="ep-stockup-item-row">
                    <div class="ep-stockup-item-info">
                      <p class="ep-stockup-item-name">
                        {{ item.name }}
                        <span class="ep-stockup-item-loose-qty">
                          ({{ item.totalQuantity.toFixed(1) }} {{ item.unit }})
                        </span>
                      </p>
                      <div v-if="item.sources.length" class="ep-stockup-item-sources">
                        <p
                          v-for="(source, sIdx) in item.sources"
                          :key="sIdx"
                          class="ep-stockup-item-source"
                        >
                          {{ t('epsFrom') }} {{ Math.round(source.menuItemQuantity) }}
                          {{ source.menuItemName }} :
                          {{ source.componentQuantity.toFixed(1) }}
                          {{ source.unit }}
                        </p>
                      </div>
                    </div>
                    <!-- Packaging info (cf. user spec) si l'ingredient/component
                         a packagingType + packagingUnitNumber + packagingUnit -->
                    <div class="ep-stockup-item-badge-col">
                      <template v-if="computePackaging(item)">
                        <Badge variant="default" class="ep-stockup-pkg-badge">
                          {{ computePackaging(item).packedCount }}
                          {{ computePackaging(item).packagingType }} {{ t('epsPackagingOf') }}
                          {{ computePackaging(item).packagingUnitNumber }}
                          {{ computePackaging(item).packagingUnit }}
                        </Badge>
                        <span class="ep-stockup-pkg-sub">
                          ≈ {{ computePackaging(item).looseQty.toFixed(1) }}
                          {{ computePackaging(item).packagingUnit }}
                        </span>
                      </template>
                      <Badge v-else variant="secondary" class="ep-stockup-item-badge">
                        {{ item.totalQuantity.toFixed(1) }} {{ item.unit }}
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Card>
          </div>
        </CollapsibleContent>
      </Collapsible>
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
import Card from '../ui/card.vue'
import Badge from '../ui/badge.vue'
import Collapsible from '../ui/collapsible.vue'
import CollapsibleTrigger from '../ui/collapsibleTrigger.vue'
import CollapsibleContent from '../ui/collapsibleContent.vue'
import ImageWithFallback from '../figma/ImageWithFallBack.vue'
import { useI18n } from '@/i18n/useI18n'
import {
  Store,
  Coffee,
  Beer,
  Package,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-vue-next'

const FB_TYPE_LABEL_KEYS = {
  food: 'epsTypeFood',
  beverages: 'epsTypeBeverages',
  beer: 'epsTypeBeer',
  gppremium: 'epsTypeGpPremium',
  temporary: 'epsTypeTemporary',
  drinkee: 'epsTypeDrinkee',
}

const FB_TYPE_ICONS = {
  food: Store,
  beverages: Coffee,
  beer: Beer,
  gppremium: Package,
  temporary: Store,
  drinkee: Coffee,
}

const MAX_DEPTH = 10

export default {
  name: 'EventPredictStockUpSection',

  components: {
    Card,
    Badge,
    Collapsible,
    CollapsibleTrigger,
    CollapsibleContent,
    ImageWithFallback,
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
       * Groupes shopType REPLIÉS explicitement (modèle inversé) : par défaut
       * tous les groupes sont dépliés — un groupe n'apparaît ici qu'après un
       * clic de fermeture par l'utilisateur.
       */
      collapsedStockGroups: new Set(),
    }
  },

  computed: {
    // PERF: index id → menuItem (caché). Réutilisé par shopStockData / itemStockData
    // / expandMenuItem au lieu de reconstruire une Map ou de scanner le catalogue.
    menuItemsById() {
      const m = new Map()
      const list = Array.isArray(this.menuItems) ? this.menuItems : []
      for (const mi of list) if (mi && mi.id != null) m.set(mi.id, mi)
      return m
    },
    // PERF: résolution component → menuItem par nom OU sourceId en O(1) dans
    // expandMenuItem (au lieu d'un Array.find O(catalogue) par composant/item/shop,
    // récursif). On conserve la sémantique du .find d'origine : « premier élément
    // du tableau dont le name OU le sourceId matche ». `byName` garde la 1re
    // occurrence ; `idxById` donne la position pour départager si nom ET sourceId
    // pointent des items différents (cas pathologique → on garde le plus petit idx).
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
      // Fallback (PARITÉ avec EventPredictMenusSection) : la config sélectionnée
      // n'expose PAS de layout F&B — l'API /configurations renvoie les configs
      // SANS `.data.floors[].elements`. Sans ce fallback, le stock-up affichait
      // « No configuration selected » alors qu'une config EST sélectionnée. On
      // dérive les shops depuis la timeline de ventes pour rester calculable.
      return this.syntheticElementsFromTimeline
    },
    /**
     * Shops synthétiques reconstruits depuis `predictedTimelineData` : 1 élément
     * par shop. `name` = `record.shop` (clé de `timelineDataIndex`) et `id` =
     * shopId (clé de `selectedMenuItems`) → `getPredictedQuantity` couvre les
     * deux alias. Utilisé quand la config n'a pas de layout (events Weezevent).
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

    /** Map `${shop}|${menuItemId}` → quantité totale agrégée. */
    timelineDataIndex() {
      const arr = this.predictedTimelineData || []
      const idx = new Map()
      if (!arr.length) return idx
      for (const record of arr) {
        const shopKey = record.shop || record.shopId || ''
        const menuItemKey = record.menuItemId || record.mappedMenuItemId || ''
        if (!shopKey || !menuItemKey) continue
        const k = `${shopKey}|${menuItemKey}`
        idx.set(k, (idx.get(k) || 0) + (record.totalQuantity || 0))
      }
      return idx
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

        result[element.id] = Array.from(aggregated.values()).sort((a, b) =>
          a.name.localeCompare(b.name),
        )
      })

      return result
    },

    /**
     * Groupements par shopType composite (clé `types.sort().join(',')`,
     * fallback `__no_shop_type__`). Exclut les shops sans stock.
     */
    /**
     * Vue par produit (ItemView) — agrège les quantités tous shops confondus,
     * une ligne par menuItem, avec la liste des shops sources.
     */
    itemStockData() {
      const map = new Map()
      this.fbElements.forEach((element) => {
        const ids = this.getSelectedItemIds(element.id)
        ids.forEach((menuItemId) => {
          const qty = this.getAdjustedQuantity(element.id, menuItemId)
          if (!qty) return
          const mi = this.menuItemsById.get(menuItemId)
          if (!mi) return
          const key = mi.id
          if (!map.has(key)) {
            map.set(key, {
              menuItemId: mi.id,
              menuItemName: mi.name,
              category: mi.category || null,
              type: mi.type || null,
              unitCost: this.miUnitCost(mi),
              totalQuantity: 0,
              shops: [],
            })
          }
          const agg = map.get(key)
          agg.totalQuantity += qty
          agg.shops.push({ shopId: element.id, shopName: element.name, quantity: qty })
        })
      })
      return Array.from(map.values()).sort((a, b) =>
        a.menuItemName.localeCompare(b.menuItemName),
      )
    },

    /** Coût total estimé du stock-up (Σ coût unitaire × quantité ajustée). */
    totalStockCost() {
      return this.itemStockData.reduce(
        (sum, it) => sum + (it.unitCost || 0) * (it.totalQuantity || 0),
        0,
      )
    },
    /** Groupes ItemView par catégorie de menu item. */
    itemGroupedEntries() {
      const groups = new Map()
      this.itemStockData.forEach((item) => {
        const key = item.category || '__no_category__'
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key).push(item)
      })
      return Array.from(groups.entries())
    },

    groupedEntries() {
      const groups = new Map()
      this.fbElements.forEach((element) => {
        const items = this.shopStockData[element.id] || []
        if (!items.length) return
        const raw = element.shopType
        const types =
          Array.isArray(raw) && raw.length
            ? [...raw].sort()
            : raw && typeof raw === 'string'
              ? [raw]
              : ['__no_shop_type__']
        const key = Array.isArray(types) ? types.join(',') : types
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key).push(element)
      })
      return Array.from(groups.entries())
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
      return `€${(Number(v) || 0).toFixed(2)}`
    },
    getStockGroupKey(compositeType) {
      return String(compositeType)
    },

    isStockGroupOpen(compositeType) {
      // Déplié par défaut : ouvert sauf si explicitement replié.
      return !this.collapsedStockGroups.has(this.getStockGroupKey(compositeType))
    },

    setStockGroupOpen(compositeType, open) {
      const key = this.getStockGroupKey(compositeType)
      const next = new Set(this.collapsedStockGroups)
      if (open) next.delete(key)
      else next.add(key)
      this.collapsedStockGroups = next
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

    /** Quantité prédite (somme sur tous les alias shop possibles). */
    getPredictedQuantity(element, menuItemId) {
      if (!this.timelineDataIndex.size) return 0
      const shopKeys = [element.name, element.registryId, element.id].filter(Boolean)
      let q = 0
      for (const k of shopKeys) {
        const count = this.timelineDataIndex.get(`${k}|${menuItemId}`)
        if (count) q += count
      }
      return q
    },

    /** Quantité ajustée selon le slider % (défaut 100). Pour les items à
     *  prédiction 0, la quantité MANUELLE (unités absolues) prime. */
    getAdjustedQuantity(elementId, menuItemId) {
      const element = this.fbElements.find((el) => el.id === elementId)
      if (!element) return 0
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
     * Expansion récursive d'un menu item :
     *  - readyForSale='Yes' → 1 item en `pcs`.
     *  - readyForSale='No' → expansion des `components` avec la formule
     *    (numberOfUnits * menuItemQuantity) / numberOfPiecesRecipe.
     *  - Si un component matche un autre menu item (par `name` ou `sourceId`)
     *    avec readyForSale='No', expansion en cascade (jusqu'à MAX_DEPTH).
     */
    expandMenuItem(menuItemId, menuItemQuantity, rootMenuItemName, depth, menuItemsById, componentLookup) {
      if (depth > MAX_DEPTH) return []
      const menuItem = menuItemsById.get(menuItemId)
      if (!menuItem) return []

      if (menuItem.readyForSale === 'Yes') {
        return [
          {
            name: menuItem.name,
            id: menuItem.id,
            totalQuantity: menuItemQuantity,
            unit: 'pcs',
            isExpanded: false,
            sources: [
              {
                menuItemName: rootMenuItemName,
                menuItemQuantity,
                componentQuantity: menuItemQuantity,
                unit: 'pcs',
              },
            ],
          },
        ]
      }

      if (
        menuItem.readyForSale === 'No' &&
        Array.isArray(menuItem.components) &&
        menuItem.components.length > 0
      ) {
        const out = []
        const numberOfPiecesRecipe = menuItem.numberOfPiecesRecipe || 1

        menuItem.components.forEach((component) => {
          const numberOfUnits = component.numberOfUnits || 0
          const calculatedQuantity =
            (numberOfUnits * menuItemQuantity) / numberOfPiecesRecipe
          const componentUnit = component.unit || 'unit'

          // Résolution component → menu item via name OR sourceId (idem React).
          // PERF: O(1) via componentLookup (byName + idxById) au lieu d'un
          // Array.find O(catalogue) par composant. Sémantique préservée : on
          // garde le 1er index du tableau qui matche name OU sourceId.
          const nameHit =
            component.name != null ? componentLookup.byName.get(component.name) : undefined
          const idItem =
            component.sourceId != null ? menuItemsById.get(component.sourceId) : undefined
          let componentMenuItem
          if (nameHit && idItem) {
            const idIdx = componentLookup.idxById.get(component.sourceId)
            componentMenuItem = nameHit.idx <= idIdx ? nameHit.item : idItem
          } else {
            componentMenuItem = nameHit ? nameHit.item : idItem || null
          }

          if (componentMenuItem && componentMenuItem.readyForSale === 'No') {
            const expanded = this.expandMenuItem(
              componentMenuItem.id,
              calculatedQuantity,
              rootMenuItemName,
              depth + 1,
              menuItemsById,
              componentLookup,
            )
            out.push(...expanded)
          } else {
            out.push({
              name: component.name,
              id: component.id,
              totalQuantity: calculatedQuantity,
              unit: componentUnit,
              isExpanded: true,
              sources: [
                {
                  menuItemName: rootMenuItemName,
                  menuItemQuantity,
                  componentQuantity: calculatedQuantity,
                  unit: componentUnit,
                },
              ],
            })
          }
        })

        return out
      }

      // Fallback (pas de readyForSale renseigné ou pas de composants)
      return [
        {
          name: menuItem.name,
          id: menuItem.id,
          totalQuantity: menuItemQuantity,
          unit: 'pcs',
          isExpanded: false,
          sources: [
            {
              menuItemName: rootMenuItemName,
              menuItemQuantity,
              componentQuantity: menuItemQuantity,
              unit: 'pcs',
            },
          ],
        },
      ]
    },

    getCompositeLabel(compositeKey) {
      if (compositeKey === '__no_shop_type__') return this.t('epsNoShopType')
      const types = compositeKey.split(',')
      const labelFor = (ty) =>
        FB_TYPE_LABEL_KEYS[ty] ? this.t(FB_TYPE_LABEL_KEYS[ty]) : ty
      if (types.length === 1) return labelFor(types[0])
      return types.map((ty) => labelFor(ty)).join(` ${this.t('epsAndJoiner')} `)
    },

    getCompositeIcon(compositeKey) {
      if (compositeKey === '__no_shop_type__') return AlertCircle
      const types = compositeKey.split(',')
      return FB_TYPE_ICONS[types[0]] || Store
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
      // Recherche dans ingredients d'abord (par nom ou id), puis dans components
      const lc = String(item.name || '').toLowerCase()
      const ing = (this.ingredients || []).find(
        (i) =>
          i?.id === item.id ||
          String(i?.name || '').toLowerCase() === lc,
      )
      const cmp = ing
        ? null
        : (this.components || []).find(
            (c) =>
              c?.id === item.id ||
              String(c?.name || '').toLowerCase() === lc,
          )
      const src = ing || cmp
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
