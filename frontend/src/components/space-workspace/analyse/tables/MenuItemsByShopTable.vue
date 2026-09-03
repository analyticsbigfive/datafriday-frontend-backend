<template>
  <v-card flat rounded="lg" class="pa-5 mb-4" :class="{ 'mibs--dark': isDark }">
    <!-- BUG-285 : voile squelette pendant le recalcul des filtres (clic segment). -->
    <AnalyseSkeletonVeil :active="filtersRecomputing" />
    <!-- Header -->
    <div class="d-flex align-center justify-space-between mb-3">
      <div>
        <span class="section-title">{{ t('anMenuItemsByShop') }}</span>
        <!-- Mode Predict : les events prédits sans scénario Event Predict n'ont
             aucune dimension article → exclus de ce tableau. -->
        <div v-if="missingEventsCount > 0" class="section-subtitle">
          {{ missingEventsCount }}
          {{ missingEventsCount > 1 ? t('anEventsPlural') : t('anEventSingular') }}
          {{ t('anPredictNoItemDetail') }}
        </div>
      </div>
      <v-btn icon size="small" variant="text" @click="exportExcel">
        <v-icon>mdi-download</v-icon>
      </v-btn>
    </div>

    <!-- Toolbar -->
    <div class="d-flex align-center flex-wrap ga-2 mb-3 mibs-toolbar">
      <div class="mibs-search">
        <v-icon size="16" class="ml-3 mr-1" color="#9CA3AF">mdi-magnify</v-icon>
        <input
          v-model="search"
          type="text"
          class="mibs-search-input"
          :placeholder="searchPlaceholder"
        />
        <select v-model="searchScope" class="mibs-search-scope" :title="t('anScopeCategory')">
          <option value="all">{{ t('anScopeAll') }}</option>
          <option value="shop">{{ t('anScopeShop') }}</option>
          <option value="type">{{ t('anScopeType') }}</option>
          <option value="category">{{ t('anScopeCategory') }}</option>
          <option value="item">{{ t('anScopeItem') }}</option>
        </select>
      </div>

      <v-btn-toggle
        v-model="tableView"
        mandatory
        density="compact"
        class="pill-toggle"
      >
        <v-btn value="shops" size="small">{{ t('anByShop') }}</v-btn>
        <v-btn value="items" size="small">{{ t('anByItem') }}</v-btn>
      </v-btn-toggle>

      <v-select
        :model-value="filters.selectedMenuItemTypes || []"
        :items="allTypes"
        :placeholder="t('anTypes')"
        multiple
        chips
        closable-chips
        clearable
        variant="outlined"
        density="compact"
        hide-details
        rounded="pill"
        class="mibs-select"
        style="min-width: 200px; max-width: 280px"
        @update:model-value="setFilterImmediate('selectedMenuItemTypes', $event)"
      />
      <v-select
        :model-value="filters.selectedMenuItemCategories || []"
        :items="allCategories"
        :placeholder="t('anCategories')"
        multiple
        chips
        closable-chips
        clearable
        variant="outlined"
        density="compact"
        hide-details
        rounded="pill"
        class="mibs-select"
        style="min-width: 220px; max-width: 320px"
        @update:model-value="setFilterImmediate('selectedMenuItemCategories', $event)"
      />
    </div>

    <!-- Skeleton tant que les records item-level ne sont pas chargés (les 2 onglets) -->
    <v-skeleton-loader
      v-if="loading"
      type="list-item-two-line@6"
      class="mibs-skeleton"
    />

    <!-- Accordion : groupé par PdV -->
    <v-expansion-panels v-if="!loading && tableView === 'shops'" v-model="openShopPanels" variant="accordion" multiple>
      <v-expansion-panel v-for="shop in pagedShops" :key="shop.name">
        <v-expansion-panel-title>
          <div class="d-flex align-center w-100">
            <span class="shop-name">{{ shop.name }}</span>
            <v-spacer />
            <span class="shop-stats">
              {{ t('anAvg') }} : {{ formatNumber(shop.avg) }}
              &nbsp;&nbsp;{{ t('anTotal') }} : {{ formatNumber(shop.total) }}
              &nbsp;&nbsp;{{ t('anEvents') }} : {{ shop.events }}
            </span>
          </div>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <v-table density="compact" class="mibs-items-table">
            <thead>
              <tr>
                <th class="mibs-thumb-col"></th>
                <th>{{ t('anItem') }}</th>
                <th class="text-right">{{ t('anAvgQty') }}</th>
                <th class="text-right">{{ t('anTotalQty') }}</th>
                <th class="text-right">{{ t('anEvents') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!shop.items.length" class="mibs-empty-row">
                <td colspan="5" class="text-medium-emphasis py-3">—</td>
              </tr>
              <tr v-for="item in visibleItems(shop)" :key="item.name">
                <td class="mibs-thumb-col">
                  <div class="mibs-thumb">
                    <img
                      v-if="item.picture && !failedImages[item.name]"
                      :src="item.picture"
                      :alt="item.name"
                      @error="failedImages[item.name] = true"
                    />
                    <v-icon v-else size="18" color="#9CA3AF">mdi-package-variant-closed</v-icon>
                  </div>
                </td>
                <td class="mibs-item-name">
                  <a
                    v-if="itemHref(item)"
                    :href="itemHref(item)"
                    target="_blank"
                    rel="noopener"
                    class="mibs-item-link"
                    :title="t('anOpenMenuItem')"
                  >{{ item.name }}<v-icon size="11" class="ml-1">mdi-open-in-new</v-icon></a>
                  <span v-else>{{ item.name }}</span>
                </td>
                <td class="text-right font-weight-bold">{{ formatNumber(item.avgQuantity) }}</td>
                <td class="text-right">{{ formatNumber(item.quantity) }}</td>
                <td
                  class="text-right mibs-events-cell"
                  :class="{ 'mibs-events-clickable': item.events > 0 }"
                  role="button"
                  tabindex="0"
                  @click="item.events > 0 && emit('events-click', { shopName: shop.name, menuItemName: item.name })"
                  @keydown.enter="item.events > 0 && emit('events-click', { shopName: shop.name, menuItemName: item.name })"
                >{{ item.events }}</td>
              </tr>
              <!-- Cap rendu : au-delà de ITEM_ROWS_CAP lignes, lien « tout afficher » -->
              <tr v-if="shop.items.length > ITEM_ROWS_CAP && !expandedShops.has(shop.name)">
                <td colspan="5" class="py-2">
                  <v-btn
                    variant="text"
                    size="small"
                    block
                    @click="expandedShops = new Set([...expandedShops, shop.name])"
                  >
                    <v-icon size="16" class="mr-1">mdi-chevron-down</v-icon>
                    {{ t('anSeeAll') }} ({{ shop.items.length }})
                  </v-btn>
                </td>
              </tr>
            </tbody>
          </v-table>
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>
    <v-pagination
      v-if="!loading && tableView === 'shops' && filteredShops.length > SHOP_PAGE_SIZE"
      v-model="shopPage"
      :length="Math.ceil(filteredShops.length / SHOP_PAGE_SIZE)"
      density="compact"
      class="mt-2"
    />

    <!-- Accordion : groupé par article.
         v-if EXPLICITE (pas v-else) : le <v-pagination> intercalé au-dessus
         portait le v-if précédent, donc un v-else se serait attaché à la
         pagination — et non aux panneaux PdV. Résultat bug : quand la pagination
         PdV était masquée (≤ 15 PdV), les panneaux articles s'affichaient SOUS
         les PdV. v-if === 'items' découple les deux listes. -->
    <v-expansion-panels v-if="!loading && tableView === 'items'" v-model="openItemPanels" variant="accordion" multiple>
      <v-expansion-panel v-for="item in pagedItems" :key="item.name">
        <v-expansion-panel-title>
          <div class="d-flex align-center w-100">
            <a
              v-if="itemHref(item)"
              :href="itemHref(item)"
              target="_blank"
              rel="noopener"
              class="shop-name mibs-item-link"
              :title="t('anOpenMenuItem')"
              @click.stop
            >{{ item.name }}<v-icon size="12" class="ml-1">mdi-open-in-new</v-icon></a>
            <span v-else class="shop-name">{{ item.name }}</span>
            <v-spacer />
            <span class="shop-stats">
              <template v-if="itemDims(item)">{{ itemDims(item) }}&nbsp;&nbsp;</template>{{ t('anTotal') }} : {{ formatNumber(item.totalQuantity) }}
              &nbsp;&nbsp;{{ t('anRevenue') }} : {{ formatCurrencyDetailed(item.totalRevenue) }}
              &nbsp;&nbsp;{{ t('anShop') }}s : {{ item.shops.length }}
            </span>
          </div>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <v-table density="compact">
            <thead>
              <tr>
                <th>{{ t('anShop') }}</th>
                <th class="text-right">{{ t('anQuantity') }}</th>
                <th class="text-right">{{ t('anRevenue') }}</th>
                <th class="text-right">{{ t('anEvents') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="s in item.shops" :key="s.name">
                <td>{{ s.name }}</td>
                <td class="text-right">{{ formatNumber(s.quantity) }}</td>
                <td class="text-right">{{ formatCurrencyDetailed(s.revenue) }}</td>
                <td
                  class="text-right mibs-events-cell"
                  :class="{ 'mibs-events-clickable': s.events > 0 }"
                  role="button"
                  tabindex="0"
                  @click="s.events > 0 && emit('events-click', { shopName: s.name, menuItemName: item.name })"
                  @keydown.enter="s.events > 0 && emit('events-click', { shopName: s.name, menuItemName: item.name })"
                >{{ s.events }}</td>
              </tr>
            </tbody>
          </v-table>
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>
    <v-pagination
      v-if="!loading && tableView === 'items' && filteredItems.length > SHOP_PAGE_SIZE"
      v-model="itemPage"
      :length="Math.ceil(filteredItems.length / SHOP_PAGE_SIZE)"
      density="compact"
      class="mt-2"
    />
  </v-card>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useTheme } from 'vuetify'
import { useRouter } from 'vue-router'
import { useStore } from 'vuex'
import { normalizeStr } from '@/utils/predictiveAnalytics'
import { formatNumber, formatCurrencyDetailed } from '@/composables/useFormatters'
import { useFilters } from '@/composables/useFilters'
import { useI18n } from '@/i18n/useI18n'
import { resolveItemType, resolveItemCategory } from '@/utils/analyseDimensions'
import { UNATTACHED_ITEM_KEY } from '@/utils/analyseReconciliation'
import {
  aggregateByShop,
  aggregateByItem,
  buildItemsByShopRows,
} from '@/utils/analyseAggregations'
import AnalyseSkeletonVeil from '@/components/space-workspace/analyse/AnalyseSkeletonVeil.vue'

const props = defineProps({
  // Data-driven (parité React MenuItemsByShopTable) : rows = PdV vendeurs des
  // records, articles = articles vendus. Aucune notion d'assignation.
  records: { type: Array, default: () => [] },
  // Records item-level en cours de chargement → skeleton (évite le rendu
  // intermédiaire shop-level sans noms d'articles).
  loading: { type: Boolean, default: false },
  // Mode Predict : nombre d'events prédits SANS scénario Event Predict sauvegardé.
  // Le moteur ne prédit qu'au niveau PdV → ces events n'ont aucun article à montrer.
  missingEventsCount: { type: Number, default: 0 },
})

// Point 18 — clic sur la cellule « Events » d'un combo PdV × article →
// ouvre le dialog listant les évènements (parité React `onEventsClick`).
const emit = defineEmits(['events-click'])

const { t } = useI18n()
const router = useRouter()
const store = useStore()

// Dark mode autonome : suit le thème global Vuetify.
const theme = useTheme()
const isDark = computed(() => !!theme.global.current.value.dark)

// Catalogue DataFriday (store analyse) — pour garantir que le lien pointe vers la
// VRAIE fiche catalogue. Le `menuItemId` réconcilié peut être un id NestJS
// (assignation par shop) ≠ id catalogue : on retombe alors sur un match par NOM.
const catalogIds = computed(
  () => new Set((store.state.analyse.menuItems || []).map((mi) => String(mi?.id)).filter(Boolean)),
)
const catalogIdByName = computed(() => {
  const m = new Map()
  for (const mi of store.state.analyse.menuItems || []) {
    const k = normalizeStr(mi?.name)
    if (k && mi?.id != null && !m.has(k)) m.set(k, String(mi.id))
  }
  return m
})
// Vignette catalogue par nom normalisé — enrichissement non excluant : un article
// vendu sans fiche catalogue s'affiche quand même (icône générique).
const catalogPictureByName = computed(() => {
  const m = new Map()
  for (const mi of store.state.analyse.menuItems || []) {
    const k = normalizeStr(mi?.name)
    if (k && mi?.picture && !m.has(k)) m.set(k, mi.picture)
  }
  return m
})

// id catalogue d'un article : son menuItemId s'il existe au catalogue, sinon match
// par nom, sinon null. null → pas de lien (article non rattaché → signal de mapping).
function catalogItemId(item) {
  const id = item?.menuItemId ? String(item.menuItemId) : ''
  if (id && catalogIds.value.has(id)) return id
  return catalogIdByName.value.get(normalizeStr(item?.name)) || (id || null)
}

// Lien (nouvel onglet) vers la FICHE du menu item catalogue (route `menu-item-edit`)
// — sert à VÉRIFIER le mapping : un article rendu en lien EST rattaché au catalogue ;
// un article en texte simple ne l'est pas.
function itemHref(item) {
  const id = catalogItemId(item)
  if (!id) return null
  try {
    return router.resolve({ name: 'menu-item-edit', params: { id: String(id) } }).href
  } catch (_) {
    return null
  }
}

// Sous-titre type/catégorie dédupliqué : évite « Beverage · Beverage » et le
// doublon avec le nom de l'article (cas de repli bucket quand l'article n'a pas
// d'identité). Vide → on n'affiche pas de sous-titre.
// Sentinelle « Non rattachés » → libellé localisé ; sinon nom de catalogue tel quel.
const dimLabel = (key) => (key === UNATTACHED_ITEM_KEY ? t('anUnmatchedItems') : key)

function itemDims(item) {
  const parts = []
  if (item.type) parts.push(dimLabel(item.type))
  if (item.category && item.category !== item.type) parts.push(dimLabel(item.category))
  const label = parts.join(' · ')
  return label && label !== item.name ? label : ''
}

// Lot 2.3 — type/catégorie désormais multi-select branchés sur le store global.
// Les anciennes refs locales `typeFilter` / `categoryFilter` sont supprimées ;
// `props.records` est déjà filtré en amont (parent passe `filteredRecords`),
// donc le tableau reflète immédiatement la sélection.
const { filters, setFilterImmediate, options, filtersRecomputing } = useFilters()

const search = ref('')
const searchScope = ref('all') // all | shop | type | category | item
const tableView = ref('shops') // 'shops' | 'items'

// État d'expansion des accordéons (refs séparées pour éviter qu'un index du
// mode « shops » n'ouvre un mauvais panneau en mode « items »).
// Décision UI 2026-07-12 : TOUT collapsed par défaut (plus d'ouverture auto du 1er).
const openShopPanels = ref([])
const openItemPanels = ref([])

// ── Pagination (gain DOM/rendu — les données sont déjà en mémoire, le réseau
// est traité en amont). Panneaux paginés APRÈS recherche : la recherche couvre
// tout le dataset, pas seulement la page courante.
const SHOP_PAGE_SIZE = 15
const ITEM_ROWS_CAP = 25
const shopPage = ref(1)
const itemPage = ref(1)
// PdV dont on affiche TOUTES les lignes (au-delà du cap) — Set réassigné pour la réactivité.
const expandedShops = ref(new Set())

const searchPlaceholder = computed(() => {
  const m = {
    all: t('anSearchItemsByShop'),
    shop: t('anSearchByShop'),
    type: t('anSearchByType'),
    category: t('anSearchByCategory'),
    item: t('anSearchByItem'),
  }
  return m[searchScope.value] || m.all
})

function toggleTableView() {
  tableView.value = tableView.value === 'shops' ? 'items' : 'shops'
}

// Type/catégorie = mêmes getters record-driven que les selects de gauche (cohérence).
// Repli sur les records affichés tant que les options ne sont pas remontées → évite
// un select « No data ».
const allTypes = computed(() => {
  const c = options.menuItemTypes.value
  if (c && c.length) return c
  return [...new Set(props.records.map((r) => resolveItemType(r)).filter((v) => v && v !== UNATTACHED_ITEM_KEY))].sort()
})
const allCategories = computed(() => {
  const c = options.menuItemCategories.value
  if (c && c.length) return c
  return [...new Set(props.records.map((r) => resolveItemCategory(r)).filter((v) => v && v !== UNATTACHED_ITEM_KEY))].sort()
})

// Grouper par shop
const failedImages = ref({})

// Rows = PdV vendeurs, fabriqués depuis les ventes (groupées par shopName) —
// agrégats React : totalQty, avgQty par event, nb events, tri CA desc.
const shops = computed(() =>
  // Agrégation PARTAGÉE avec l'export du bandeau (`utils/analyseAggregations`).
  // Seule la résolution d'image reste ici : elle dépend du catalogue, que l'util
  // n'a pas à connaître.
  aggregateByShop(props.records, {
    pictureOf: (key, r) => r.menuItemPicture || catalogPictureByName.value.get(normalizeStr(key)) || null,
  }),
)

// Vue inverse « By Item » : liste fabriquée depuis les ventes (groupées par article).
const items = computed(() => aggregateByItem(props.records))

const filteredShops = computed(() => {
  const q = search.value.toLowerCase().trim()
  const scope = searchScope.value
  // Pas de re-filtrage type/catégorie ici : `props.records` est déjà filtré
  // par le store (cf. Lot 2.3). On ne fait que la recherche texte, scopée.
  return shops.value
    .map((s) => {
      const items = s.items.filter((i) => {
        if (!q) return true
        if (scope === 'shop')     return s.name.toLowerCase().includes(q)
        if (scope === 'type')     return (i.type || '').toLowerCase().includes(q)
        if (scope === 'category') return (i.category || '').toLowerCase().includes(q)
        if (scope === 'item')     return i.name.toLowerCase().includes(q)
        return (
          s.name.toLowerCase().includes(q) ||
          i.name.toLowerCase().includes(q) ||
          (i.type || '').toLowerCase().includes(q) ||
          (i.category || '').toLowerCase().includes(q)
        )
      })
      return { ...s, items }
    })
    .filter((s) => s.items.length > 0 || !q)
})

const filteredItems = computed(() => {
  const q = search.value.toLowerCase().trim()
  const scope = searchScope.value
  return items.value
    .map((i) => {
      const fshops = i.shops.filter((s) => {
        if (!q) return true
        if (scope === 'shop')     return s.name.toLowerCase().includes(q)
        if (scope === 'type')     return (i.type || '').toLowerCase().includes(q)
        if (scope === 'category') return (i.category || '').toLowerCase().includes(q)
        if (scope === 'item')     return i.name.toLowerCase().includes(q)
        return (
          i.name.toLowerCase().includes(q) ||
          s.name.toLowerCase().includes(q) ||
          (i.type || '').toLowerCase().includes(q) ||
          (i.category || '').toLowerCase().includes(q)
        )
      })
      return { ...i, shops: fshops }
    })
    .filter((i) => i.shops.length > 0 || !q)
})

// Pages courantes (tranche de filteredShops/filteredItems).
const pagedShops = computed(() => {
  const startIdx = (shopPage.value - 1) * SHOP_PAGE_SIZE
  return filteredShops.value.slice(startIdx, startIdx + SHOP_PAGE_SIZE)
})
const pagedItems = computed(() => {
  const startIdx = (itemPage.value - 1) * SHOP_PAGE_SIZE
  return filteredItems.value.slice(startIdx, startIdx + SHOP_PAGE_SIZE)
})
// Lignes visibles d'un PdV : cap à ITEM_ROWS_CAP sauf expansion explicite.
function visibleItems(shop) {
  if (shop.items.length <= ITEM_ROWS_CAP || expandedShops.value.has(shop.name)) return shop.items
  return shop.items.slice(0, ITEM_ROWS_CAP)
}
// Recherche / données changent → retour page 1.
// Changement de page → referme tout (les index de panneaux sont par page).
watch([search, searchScope, () => props.records], () => {
  shopPage.value = 1
  itemPage.value = 1
  expandedShops.value = new Set()
})
watch([shopPage, itemPage], () => {
  openShopPanels.value = []
  openItemPanels.value = []
})

async function exportExcel() {
  try {
    const XLSX = await import('xlsx')
    // Lignes construites par l'util PARTAGÉ : le classeur global de la page
    // (bouton Télécharger du bandeau) sort exactement le même tableau. Deux
    // fichiers produits par deux codes différents finiraient par diverger.
    const rows = buildItemsByShopRows(
      props.records,
      {
        shop: t('anTblShopXlsShop'),
        item: t('anTblShopXlsItem'),
        type: t('anTblShopXlsType'),
        category: t('anTblShopXlsCategory'),
        quantity: t('anTblShopXlsQuantity'),
        revenue: t('anTblShopXlsRevenue'),
        events: t('anTblShopXlsEvents'),
      },
      tableView.value === 'shops' ? 'shops' : 'items',
    )
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    const sheetName = tableView.value === 'shops' ? t('anTblShopXlsSheetByShop') : t('anTblShopXlsSheetByItem')
    XLSX.utils.book_append_sheet(wb, ws, sheetName)
    XLSX.writeFile(wb, tableView.value === 'shops' ? t('anTblShopXlsFileByShop') : t('anTblShopXlsFileByItem'))
  } catch (e) {
    console.error('Export failed', e)
  }
}
</script>


<style scoped>
.section-title {
  font-size: var(--fs-md);
  font-weight: 600;
  color: #212121;
}
/* Aligné sur MenuItemRevenueDistribution.vue (même bandeau d'en-tête). */
.section-subtitle {
  font-size: var(--fs-sm);
  color: #757575;
  margin-top: 2px;
}
.shop-name {
  font-weight: 500;
  color: #212121;
  font-size: var(--fs-md);
}
.shop-stats {
  color: #757575;
  font-size: var(--fs-sm);
}

/* Lot 0.5 — Toolbar « Articles du menu par PdV » : recherche en pilule grise
   avec sélecteur de périmètre + selects en pilule blanche, parité avec le
   toolbar du graphe (capture d'écran). */
.mibs-search {
  display: flex;
  align-items: center;
  height: 38px;
  background-color: #F3F4F6;
  border: 1px solid #E5E7EB;
  border-radius: 9999px;
  padding-right: 4px;
  flex: 1 1 320px;
  min-width: 280px;
  max-width: 460px;
}
.mibs-search-input {
  flex: 1;
  height: 100%;
  background: transparent;
  border: 0;
  outline: 0;
  padding: 0 8px;
  font-size: var(--fs-md);
  color: #0f172a;
}
.mibs-search-input::placeholder {
  color: #6B7280;
}
.mibs-search-scope {
  height: 28px;
  border: 0;
  background-color: #ffffff;
  border-radius: 9999px;
  padding: 0 26px 0 12px;
  font-size: var(--fs-sm);
  color: #0f172a;
  font-weight: 500;
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%236B7280'%3E%3Cpath d='M7 10l5 5 5-5z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 6px center;
  background-size: 14px;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
}
.mibs-select {
  flex: 0 0 auto;
}
.mibs-select :deep(.v-field) {
  border-radius: 9999px !important;
  background-color: #ffffff;
  min-height: 38px !important;
  --v-field-padding-top: 0;
  --v-field-padding-bottom: 0;
  --v-input-control-height: 38px;
}
.mibs-select :deep(.v-field__input) {
  min-height: 38px !important;
  padding-top: 4px !important;
  padding-bottom: 4px !important;
  font-size: var(--fs-base);
}
.mibs-select :deep(.v-field__input input::placeholder) {
  color: #6B7280;
  opacity: 1;
  font-size: var(--fs-base);
}
.mibs-select :deep(.v-field__outline__start),
.mibs-select :deep(.v-field__outline__end) {
  border-color: #E5E7EB !important;
}
.mibs-select :deep(.v-chip) {
  height: 22px !important;
  font-size: var(--fs-sm)!important;
  margin: 1px 2px !important;
}

/* Tableau articles dans le panneau dépliable d'un PdV — visuel parité React :
   colonnes thumbnail / Menu Item / Avg Qty / Total Qty / Events. */
.mibs-items-table :deep(th) {
  font-weight: 500;
  color: #6B7280;
  font-size: var(--fs-sm);
  text-transform: none;
  background-color: #F9FAFB;
}
.mibs-items-table .mibs-thumb-col {
  width: 56px;
}
.mibs-items-table .mibs-thumb {
  width: 36px;
  height: 36px;
  border-radius: 6px;
  background-color: #F3F4F6;
  border: 1px solid #E5E7EB;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.mibs-items-table .mibs-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.mibs-items-table .mibs-item-name {
  color: #ff3131;
  font-weight: 500;
}

/* Lien vers la fiche menu item (vérification du mapping). Rouge de la charte
   (#ff3131) ; l'icône « open-in-new » signale l'ouverture en nouvel onglet. */
.mibs-item-link {
  color: #ff3131;
  text-decoration: none;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
}
.mibs-item-link:hover {
  text-decoration: underline;
}
.mibs-item-link .v-icon {
  opacity: 0.6;
}
.mibs-items-table .mibs-events-cell {
  color: #6B7280;
}
.mibs-items-table tr:hover .mibs-events-cell {
  color: #7C3AED;
  text-decoration: underline;
}

/* Point 18 — cellule « Events » cliquable (les deux vues PdV / article).
   Couleur violette permanente pour signaler l'affordance + soulignement au survol. */
.mibs-events-clickable {
  cursor: pointer;
  color: #7C3AED !important;
  font-weight: 500;
}
.mibs-events-clickable:hover {
  text-decoration: underline;
}

/* ── Dark mode (autonome via isDark) : override des couleurs claires en dur.
   Les internes Vuetify (v-table, v-expansion-panels, v-select, pagination)
   suivent le thème global sombre ; on ne force que le custom clair. ── */
.mibs--dark .section-title {
  color: #f9fafb;
}
.mibs--dark .section-subtitle {
  color: #94a3b8;
}
.mibs--dark .shop-name {
  color: #f9fafb;
}
.mibs--dark .shop-stats {
  color: #94a3b8;
}

/* Barre de recherche en pilule */
.mibs--dark .mibs-search {
  background-color: #1a2332;
  border-color: rgba(255, 255, 255, 0.1);
}
.mibs--dark .mibs-search-input {
  color: #f9fafb;
}
.mibs--dark .mibs-search-input::placeholder {
  color: #94a3b8;
}
.mibs--dark .mibs-search-scope {
  background-color: #1e293b;
  color: #f9fafb;
  box-shadow: none;
}

/* Selects type/catégorie (fond blanc forcé → surface sombre) */
.mibs--dark .mibs-select :deep(.v-field) {
  background-color: #1e293b;
}
.mibs--dark .mibs-select :deep(.v-field__input input::placeholder) {
  color: #94a3b8;
}
.mibs--dark .mibs-select :deep(.v-field__outline__start),
.mibs--dark .mibs-select :deep(.v-field__outline__end) {
  border-color: rgba(255, 255, 255, 0.1) !important;
}

/* Tableau articles : en-têtes + vignettes + cellules */
.mibs--dark .mibs-items-table :deep(th) {
  color: #94a3b8;
  background-color: #1a2332;
}
.mibs--dark .mibs-items-table .mibs-thumb {
  background-color: #1a2332;
  border-color: rgba(255, 255, 255, 0.1);
}
.mibs--dark .mibs-items-table .mibs-events-cell {
  color: #94a3b8;
}
/* Lignes hover / bordures de colonnes (tables internes Vuetify) */
.mibs--dark :deep(.v-table tbody tr:hover) {
  background: rgba(255, 255, 255, 0.03);
}
.mibs--dark :deep(.v-table th),
.mibs--dark :deep(.v-table td) {
  border-color: rgba(255, 255, 255, 0.06) !important;
}
/* #ff3131 (liens article) et #7C3AED (events cliquables) conservés (sémantiques). */

/* BUG-278 : pagination — constatée à l'écran en carré blanc à contenu invisible
   en thème sombre (VPagination 3.12 ne pose aucun fond par elle-même — la source
   du blanc n'est pas identifiable statiquement) : override défensif qui force la
   transparence, plus une pastille discrète sur la page active (invisible sinon,
   Vuetify ne la distingue pas). */
.mibs--dark :deep(.v-pagination .v-btn) {
  /* !important requis : la source du fond blanc est extérieure au repo (Vuetify
     ne peint rien, aucune règle globale ne matche) — sans lui l'override perdait. */
  background-color: transparent !important;
  color: #d1d5db !important;
}
.mibs--dark :deep(.v-pagination__item--is-active .v-btn) {
  background-color: rgba(255, 255, 255, 0.12) !important;
  color: #f9fafb !important;
}
</style>
