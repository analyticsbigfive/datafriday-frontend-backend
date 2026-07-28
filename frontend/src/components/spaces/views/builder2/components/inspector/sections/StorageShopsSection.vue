<template>
  <SectionCard :title="t('b2ShopsTitle')" icon="mdi-store" :default-open="true">
    <template #meta>
      <v-chip size="x-small" variant="tonal">{{ selectedIds.size }}/{{ shops.length }}</v-chip>
    </template>

    <div v-if="!shops.length" class="text-caption text-medium-emphasis py-2">
      {{ t('b2NoFbMerchElements') }}
    </div>

    <template v-else>
      <p class="ss-hint">
        {{ t('b2SelectFbMerchHint').replace('{count}', shops.length) }}
      </p>

      <div class="ss-groups">
        <div v-for="group in groups" :key="group.key" class="ss-group">
          <button type="button" class="ss-group__header" @click="toggleGroup(group.key)">
            <v-icon
              icon="mdi-chevron-down"
              size="15"
              class="ss-group__chevron"
              :class="{ 'ss-group__chevron--closed': !isExpanded(group.key) }"
            />
            <span class="ss-group__name">
              {{ group.label }}
              <span v-if="group.isStorageZone" class="ss-group__badge">{{ t('b2ThisStorage') }}</span>
            </span>
            <span class="ss-group__count">{{ group.selectedCount }}/{{ group.shops.length }}</span>
          </button>

          <div v-if="isExpanded(group.key)" class="ss-group__body">
            <label v-for="shop in group.shops" :key="shop.id" class="ss-shop">
              <input
                type="checkbox"
                class="ss-shop__check"
                :checked="selectedIds.has(shop.id)"
                @change="(e) => toggle(shop.id, e.target.checked)"
              />
              <span class="ss-shop__name">{{ shop.name }}</span>
              <span v-if="isMerch(shop)" class="ss-shop__merch">Merch</span>
            </label>
          </div>
        </div>
      </div>
    </template>
  </SectionCard>
</template>

<script setup>
import { ref, computed, inject, watch } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import SectionCard from './SectionCard.vue'
import { normalizeType, zoneKindLabel } from '../../../constants/elementTaxonomy'

const { t } = useI18n()
const store = inject('builderStore')
const element = computed(() => store.selectedElement.value)

// F&B + Merch de la CONFIG ACTIVE uniquement (spec : « on liste tous nos shops en
// fonction de la configuration en cours et de la zone ») — placeholders optimistes
// exclus. Les merchshops fournissent leurs ARTICLES à l'inventaire (kind article).
const STOCKABLE_TYPES = new Set(['shop', 'merchshop'])
const shops = computed(() =>
  Object.values(store.state.elements).filter(
    (e) => STOCKABLE_TYPES.has(normalizeType(e.type)) && !e.pending && store.isVisibleInActiveConfig(e),
  ),
)
const isMerch = (shop) => normalizeType(shop.type) === 'merchshop'

const selectedIds = computed(() => {
  const ids = element.value?.attributes?.storageShopIds
  return new Set(Array.isArray(ids) ? ids : [])
})

function zoneLabel(zoneId) {
  const zone = store.state.zones[zoneId]
  if (!zone) return t('b2Unassigned')
  return zone.name || zoneKindLabel(zone, t)
}

// Groupes par zone : la zone du storage d'abord (comme le prototype), puis l'ordre
// des zones du store, « Unassigned » en dernier.
const groups = computed(() => {
  const byZone = new Map()
  for (const shop of shops.value) {
    const key = shop.zoneId || 'unassigned'
    if (!byZone.has(key)) byZone.set(key, [])
    byZone.get(key).push(shop)
  }

  const storageZoneId = element.value?.zoneId || null
  const zoneRank = new Map(store.zonesSorted.value.map((z, i) => [z.id, i]))
  const rankOf = (key) => {
    if (key === storageZoneId) return -1
    if (key === 'unassigned') return Number.MAX_SAFE_INTEGER
    return zoneRank.has(key) ? zoneRank.get(key) : Number.MAX_SAFE_INTEGER - 1
  }

  return [...byZone.entries()]
    .sort(([a], [b]) => rankOf(a) - rankOf(b))
    .map(([key, groupShops]) => ({
      key,
      label: key === 'unassigned' ? t('b2Unassigned') : zoneLabel(key),
      isStorageZone: key === storageZoneId,
      shops: [...groupShops].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'fr')),
      selectedCount: groupShops.filter((s) => selectedIds.value.has(s.id)).length,
    }))
})

// Tous les groupes ouverts par défaut (capture prototype) ; repli manuel conservé
// tant qu'on reste sur le même élément.
const collapsed = ref(new Set())
watch(() => element.value?.id, () => { collapsed.value = new Set() })
const isExpanded = (key) => !collapsed.value.has(key)
function toggleGroup(key) {
  const next = new Set(collapsed.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  collapsed.value = next
}

// PATCH attributes = remplacement INTÉGRAL côté backend → toujours renvoyer l'objet
// attributes fusionné, jamais { storageShopIds } seul.
function toggle(shopId, checked) {
  const el = element.value
  if (!el) return
  const prevAttrs = el.attributes || {}
  const prev = Array.isArray(prevAttrs.storageShopIds) ? prevAttrs.storageShopIds : []
  const next = checked ? [...new Set([...prev, shopId])] : prev.filter((id) => id !== shopId)
  store.commitElementPatch(
    el.id,
    { attributes: { ...prevAttrs, storageShopIds: next } },
    { attributes: prevAttrs },
    'Shops du storage',
  )
}
</script>

<style scoped>
.ss-hint {
  font-size: var(--fs-xs);
  color: #9ca3af;
  margin: 0 2px 8px;
}

.ss-groups {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ss-group {
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 10px;
  overflow: hidden;
}

.ss-group__header {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 7px 10px;
  background: #f4f4f5;
  border: none;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s ease;
}
.ss-group__header:hover { background: #ececee; }

.ss-group__chevron {
  color: #9ca3af;
  transition: transform 0.15s ease;
}
.ss-group__chevron--closed { transform: rotate(-90deg); }

.ss-group__name {
  flex: 1;
  min-width: 0;
  font-size: var(--fs-sm);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ss-group__badge {
  font-size: var(--fs-xs);
  font-weight: 500;
  padding: 1px 7px;
  border-radius: 100px;
  background: rgba(255, 152, 0, 0.14);
  color: #b45309;
  margin-left: 6px;
  white-space: nowrap;
}

.ss-group__count {
  flex-shrink: 0;
  font-size: var(--fs-xs);
  color: #9ca3af;
}

.ss-group__body {
  display: flex;
  flex-direction: column;
  padding: 4px 10px 6px;
  background: #fff;
}

.ss-shop {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 2px;
  cursor: pointer;
  border-radius: 6px;
}
.ss-shop:hover { background: #fafafa; }

.ss-shop__check {
  width: 15px;
  height: 15px;
  accent-color: #ff9800;
  cursor: pointer;
  flex-shrink: 0;
}

.ss-shop__name {
  font-size: var(--fs-sm);
  color: #374151;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ss-shop__merch {
  flex-shrink: 0;
  font-size: var(--fs-xs);
  font-weight: 500;
  padding: 1px 6px;
  border-radius: 100px;
  background: rgba(97, 97, 97, 0.12);
  color: #616161;
}
</style>
