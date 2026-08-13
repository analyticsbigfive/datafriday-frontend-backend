<template>
  <SectionCard :title="t('b2InventoryTitle')" icon="mdi-package-variant-closed">
    <template #meta>
      <v-chip size="x-small" variant="tonal">{{ totalCount }}</v-chip>
    </template>

    <div v-if="loading" class="text-center py-3">
      <v-progress-circular indeterminate size="20" width="2" color="#ff3131" />
    </div>

    <template v-else>
      <!-- Search (même vocabulaire que InventorySection) -->
      <div v-if="derived.length || manualRows.length" class="inv-search mb-2">
        <v-icon icon="mdi-magnify" size="15" class="inv-search__icon" />
        <input
          v-model="search"
          type="text"
          class="inv-search__input"
          :placeholder="t('b2SearchInventoryPlaceholder')"
        />
      </div>

      <!-- Groupes dérivés : F&B (références de recette) puis Merch (articles) -->
      <template v-for="group in displayGroups" :key="group.key">
        <div class="inv-label">
          {{ group.label }}
          <span v-if="group.typesLabel" class="inv-label__types">({{ group.typesLabel }} {{ t('b2StorageWord') }})</span>
        </div>
        <div class="inv-list">
          <div v-for="line in group.lines" :key="line.kind + ':' + line.id" class="inv-card">
            <div class="inv-card__row">
              <img v-if="line.picture" :src="line.picture" :alt="line.name" class="inv-card__thumb" />
              <span class="inv-card__name">{{ line.name }}</span>
              <span v-if="line.storageType" class="inv-card__stype">({{ line.storageType }})</span>
              <span
                v-if="line.kind === 'component' || line.kind === 'packaging'"
                class="inv-card__kind"
                :class="'inv-card__kind--' + line.kind"
              >
                {{ line.kind === 'component' ? t('b2Component') : t('b2Packaging') }}
              </span>
              <span class="inv-card__spacer" />
              <div class="inv-qty">
                <input
                  class="inv-qty__input"
                  type="number"
                  min="0"
                  :step="packInfoFor(line.name) ? '0.01' : '1'"
                  :value="displayValue(line.name, quantityFor(line.name))"
                  @change="(e) => setQuantity(line.name, toRaw(line.name, e.target.value))"
                />
                <span v-if="qtyUnitLabel(line.name)" class="inv-qty__unit">{{ qtyUnitLabel(line.name) }}</span>
              </div>
            </div>

            <!-- Jauge : quantity vs maxStock (capacité), alerte sous minStock. Min/Max
                 saisis en "information d'inventaire" (packs) quand un Market Price connu
                 fixe le conditionnement, sinon repli sur l'unité de recette brute. -->
            <div class="inv-bounds">
              <label class="inv-bounds__field">
                <span>Min</span>
                <input
                  class="inv-bounds__input"
                  type="number"
                  min="0"
                  :step="packInfoFor(line.name) ? '0.01' : '1'"
                  :value="displayValue(line.name, boundsFor(line.name).min ?? '')"
                  @change="(e) => setBound(line.name, 'minStock', toRaw(line.name, e.target.value))"
                />
              </label>
              <label class="inv-bounds__field">
                <span>Max</span>
                <input
                  class="inv-bounds__input"
                  type="number"
                  min="0"
                  :step="packInfoFor(line.name) ? '0.01' : '1'"
                  :value="displayValue(line.name, boundsFor(line.name).max ?? '')"
                  @change="(e) => setBound(line.name, 'maxStock', toRaw(line.name, e.target.value))"
                />
              </label>
              <div v-if="gaugeFor(line.name)" class="inv-gauge" :title="gaugeTitle(line.name)">
                <div
                  class="inv-gauge__fill"
                  :class="{ 'inv-gauge__fill--low': gaugeFor(line.name).low }"
                  :style="{ width: gaugeFor(line.name).pct + '%' }"
                />
              </div>
            </div>
            <div v-if="packInfoFor(line.name)" class="inv-pack-hint">
              {{ packHintLabel(line.name) }}
            </div>

            <!-- Used in / Sold in : shop → menu items (vide pour les articles merch) -->
            <div v-if="line.usedIn.length" class="inv-used">
              <span class="inv-used__label">{{ line.kind === 'article' ? t('b2SoldIn') : t('b2UsedIn') }}</span>
              <div v-for="usage in line.usedIn" :key="usage.shopId" class="inv-used__shop">
                <span class="inv-used__shop-name">• {{ usage.shopName }}</span>
                <div v-for="mi in usage.menuItems" :key="mi.id" class="inv-used__item">
                  <img v-if="mi.picture" :src="mi.picture" :alt="mi.name" class="inv-used__thumb" />
                  <span v-else class="inv-used__thumb inv-used__thumb--empty">
                    <v-icon icon="mdi-food" size="11" color="grey-lighten-1" />
                  </span>
                  <span class="inv-used__arrow">→</span>
                  <span class="inv-used__mi">{{ mi.name }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>

      <div v-if="error" class="text-caption text-medium-emphasis py-2">
        {{ t('b2InventoryUnavailable').replace('{error}', error) }}
      </div>
      <div v-else-if="!effectiveShopIds.length" class="text-caption text-medium-emphasis py-2">
        {{ t('b2NoStockableShops') }}
      </div>
      <div v-else-if="!derived.length" class="text-caption text-medium-emphasis py-2">
        {{ t('b2NoMenuItemsInventoryHintPlural') }}
      </div>
      <div v-else-if="!filteredDerived.length && !filteredManual.length" class="text-caption text-medium-emphasis py-2 text-center">
        <template v-if="search">{{ t('b2NoResultsFor').replace('{query}', search) }}</template>
        <template v-else>{{ t('b2NoItemsMatchStorageTypes') }}</template>
      </div>

      <!-- Lignes manuelles (hors menu) -->
      <template v-if="filteredManual.length">
        <div class="inv-label mt-3">{{ t('b2CustomItems') }}</div>
        <div class="inv-list">
          <div v-for="row in filteredManual" :key="'manual:' + row.name" class="inv-card inv-card--custom">
            <div class="inv-card__row">
              <span class="inv-card__name">{{ row.name }}</span>
              <span class="inv-card__spacer" />
              <div class="inv-qty">
                <input
                  class="inv-qty__input"
                  type="number"
                  min="0"
                  :step="packInfoFor(row.name) ? '0.01' : '1'"
                  :value="displayValue(row.name, row.quantity)"
                  @change="(e) => setQuantity(row.name, toRaw(row.name, e.target.value))"
                />
                <span v-if="qtyUnitLabel(row.name)" class="inv-qty__unit">{{ qtyUnitLabel(row.name) }}</span>
              </div>
              <button class="inv-card__remove" :title="t('b2Remove')" @click="removeManual(row.name)">
                <v-icon icon="mdi-close" size="13" />
              </button>
            </div>
            <div class="inv-bounds">
              <label class="inv-bounds__field">
                <span>Min</span>
                <input
                  class="inv-bounds__input"
                  type="number"
                  min="0"
                  :step="packInfoFor(row.name) ? '0.01' : '1'"
                  :value="displayValue(row.name, boundsFor(row.name).min ?? '')"
                  @change="(e) => setBound(row.name, 'minStock', toRaw(row.name, e.target.value))"
                />
              </label>
              <label class="inv-bounds__field">
                <span>Max</span>
                <input
                  class="inv-bounds__input"
                  type="number"
                  min="0"
                  :step="packInfoFor(row.name) ? '0.01' : '1'"
                  :value="displayValue(row.name, boundsFor(row.name).max ?? '')"
                  @change="(e) => setBound(row.name, 'maxStock', toRaw(row.name, e.target.value))"
                />
              </label>
              <div v-if="gaugeFor(row.name)" class="inv-gauge" :title="gaugeTitle(row.name)">
                <div
                  class="inv-gauge__fill"
                  :class="{ 'inv-gauge__fill--low': gaugeFor(row.name).low }"
                  :style="{ width: gaugeFor(row.name).pct + '%' }"
                />
              </div>
              <div v-if="packInfoFor(row.name)" class="inv-pack-hint">
                {{ packHintLabel(row.name) }}
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- Ajout hors menu -->
      <div class="inv-add mt-3">
        <input
          v-model="newName"
          type="text"
          class="inv-add__input"
          :placeholder="t('b2AddCustomItemPlaceholder')"
          @keyup.enter="addRow"
        />
        <button class="inv-add__btn" :disabled="!newName.trim()" @click="addRow">
          <v-icon icon="mdi-plus" size="16" />
        </button>
      </div>
    </template>
  </SectionCard>
</template>

<script setup>
import { ref, computed, inject, watch, onMounted } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import SectionCard from './SectionCard.vue'
import { putElementInventory } from '@/api/endpoints/builder-v2.api'
import { getStorageInventory } from '@/api/endpoints/menu.api'
import { getMarketPrices } from '@/api/endpoints/market.price.api'
import { normalizeType } from '../../../constants/elementTaxonomy'
import { translatePackagingType, pluralize } from '@/utils/packagingTypeTranslations'

const FB_STORAGE_TYPES = ['dry', 'cold', 'belowzero']
const STOCKABLE_TYPES = new Set(['shop', 'merchshop'])

const { t, locale } = useI18n()
const store = inject('builderStore')
const element = computed(() => store.selectedElement.value)
const configKey = computed(() => store.state.activeConfigId || '')
const saved = computed(() => {
  const byConfig = element.value?.inventoryByConfig || {}
  return byConfig[configKey.value] || byConfig[''] || []
})

// Shops sources : la sélection de la section Shops ; AUCUNE sélection = tous les F&B
// et Merch de la config active (comportement prototype buildStorageInventory).
const selectedShopIds = computed(() => {
  const ids = element.value?.attributes?.storageShopIds
  return Array.isArray(ids) ? ids : []
})
const allStockableShopIds = computed(() =>
  Object.values(store.state.elements)
    .filter((e) => STOCKABLE_TYPES.has(normalizeType(e.type)) && !e.pending && store.isVisibleInActiveConfig(e))
    .map((e) => e.id),
)
const effectiveShopIds = computed(() =>
  selectedShopIds.value.length ? selectedShopIds.value : allStockableShopIds.value,
)

const derived = ref([])
const loading = ref(false)
const error = ref(null)
const newName = ref('')
const search = ref('')

// Filtre par sous-types du storage (client-side, pas de refetch quand on coche un type) :
// aucun sous-type coché = tout ; ligne F&B non typée = dry (repli prototype) ; les
// articles merch matchent les sous-types merch OU material (règle prototype).
function lineMatchesSubtypes(line) {
  const subs = element.value?.subtypes || []
  if (!subs.length) return true
  if (line.kind === 'article') return subs.includes('merch') || subs.includes('material')
  return subs.includes(line.storageType || 'dry')
}
const typeMatched = computed(() => derived.value.filter(lineMatchesSubtypes))

const derivedNames = computed(() => new Set(typeMatched.value.map((l) => l.name)))
const manualRows = computed(() => saved.value.filter((r) => !derivedNames.value.has(r.name)))
const totalCount = computed(() => typeMatched.value.length + manualRows.value.length)

const matches = (text) => (text || '').toLowerCase().includes(search.value.trim().toLowerCase())
const filteredDerived = computed(() => {
  if (!search.value.trim()) return typeMatched.value
  return typeMatched.value.filter(
    (l) =>
      matches(l.name) ||
      l.usedIn.some((u) => matches(u.shopName) || u.menuItems.some((mi) => matches(mi.name))),
  )
})
const filteredManual = computed(() => {
  if (!search.value.trim()) return manualRows.value
  return manualRows.value.filter((r) => matches(r.name))
})

// Deux groupes d'affichage comme le prototype : références F&B puis articles Merch.
const displayGroups = computed(() => {
  const subs = element.value?.subtypes || []
  const fbTypes = subs.filter((t) => FB_STORAGE_TYPES.includes(t))
  const merchTypes = subs.filter((t) => t === 'merch' || t === 'material')
  const fb = filteredDerived.value.filter((l) => l.kind !== 'article')
  const merch = filteredDerived.value.filter((l) => l.kind === 'article')
  const groups = []
  if (fb.length) groups.push({ key: 'fb', label: t('b2ItemsFromFB'), typesLabel: fbTypes.join(', '), lines: fb })
  if (merch.length) groups.push({ key: 'merch', label: t('b2ItemsFromMerch'), typesLabel: merchTypes.join(', '), lines: merch })
  return groups
})

const rowByName = computed(() => {
  const m = new Map()
  for (const r of saved.value) m.set(r.name, r)
  return m
})
function quantityFor(name) {
  return Number(rowByName.value.get(name)?.quantity) || 0
}
function boundsFor(name) {
  const r = rowByName.value.get(name)
  return { min: r?.minStock ?? null, max: r?.maxStock ?? null }
}

// Retour Ulrich (2026-08-13) : quantité/Min/Max étaient saisies en unité de recette
// BRUTE (ex. "1000 Pc"), sans rapport avec le conditionnement réel de l'article
// (ex. cartons de 24). Résolu ici en "information d'inventaire" (packs) via le
// même champ MarketPrice.packedUnits que Logistique, chargé une fois, par nom
// (plusieurs Market Price peuvent partager un nom ; on prend la première ligne
// avec un packedUnits renseigné, même repli que resolveUnitsPerPackForItemKey côté
// backend). Repli silencieux sur l'unité brute si aucun Market Price ne matche.
const marketPrices = ref([])
onMounted(async () => {
  try {
    const list = await getMarketPrices()
    marketPrices.value = Array.isArray(list) ? list : (list?.data || list?.marketPrices || [])
  } catch (err) {
    marketPrices.value = []
  }
})
const packInfoByName = computed(() => {
  const map = new Map()
  for (const mp of marketPrices.value) {
    const key = String(mp?.itemName ?? '').trim().toLowerCase()
    if (!key || !mp?.packedUnits) continue
    if (!map.has(key)) map.set(key, { unitsPerPack: mp.packedUnits, packagingType: mp.inventoryPackaging ?? null })
  }
  return map
})
function packInfoFor(name) {
  const key = String(name ?? '').trim().toLowerCase()
  return packInfoByName.value.get(key) || null
}
/** Valeur affichée dans le champ : packs si connu, sinon la valeur brute inchangée. */
function displayValue(name, raw) {
  if (raw === '' || raw == null) return raw
  const info = packInfoFor(name)
  if (!info?.unitsPerPack) return raw
  return Math.round((Number(raw) / info.unitsPerPack) * 100) / 100
}
/** Valeur brute à persister depuis la saisie (inverse de displayValue). */
function toRaw(name, displayVal) {
  const trimmed = String(displayVal).trim()
  if (trimmed === '') return ''
  const info = packInfoFor(name)
  if (!info?.unitsPerPack) return trimmed
  return Math.round(Number(trimmed) * info.unitsPerPack * 100) / 100
}
/** Chip courte à côté du champ Quantité (ex. "Cartons" au lieu de "Pc"). */
function qtyUnitLabel(name) {
  const info = packInfoFor(name)
  if (!info) {
    const line = typeMatched.value.find((l) => l.name === name)
    return line?.unit || null
  }
  const type = translatePackagingType(info.packagingType, locale.value)
  return type ? pluralize(type) : t('b2InventoryPacksWord')
}
/** Ligne d'aide sous Min/Max (ex. "Cartons de 24 Pc"). */
function packHintLabel(name) {
  const info = packInfoFor(name)
  if (!info) return ''
  const line = typeMatched.value.find((l) => l.name === name) || manualRows.value.find((r) => r.name === name)
  const type = translatePackagingType(info.packagingType, locale.value)
  const word = type ? pluralize(type) : t('b2InventoryPacksWord')
  return `${word} ${t('logiPackagingOf')} ${info.unitsPerPack} ${line?.unit || ''}`.trim()
}

// Jauge honnête : remplissage = quantity / maxStock (capacité saisie), rouge sous minStock.
function gaugeFor(name) {
  const { min, max } = boundsFor(name)
  if (!(max > 0)) return null
  const qty = quantityFor(name)
  return {
    pct: Math.min(100, Math.round((qty / max) * 100)),
    low: min != null && qty <= min,
  }
}
function gaugeTitle(name) {
  const { min, max } = boundsFor(name)
  return `${quantityFor(name)} / ${max}${min != null ? ` (${t('b2AlertBelow')} ${min})` : ''}`
}

// Clé stable des shops sources : ne refetcher que si la LISTE change réellement
// (l'objet element est remplacé à chaque mutation, y compris un simple drag).
const shopIdsKey = computed(() => [...effectiveShopIds.value].sort().join(','))

watch(
  [() => element.value?.id, () => store.state.activeConfigId, shopIdsKey],
  async ([storageId]) => {
    error.value = null
    if (!storageId || !effectiveShopIds.value.length) {
      derived.value = []
      return
    }
    loading.value = derived.value.length === 0 // refresh silencieux quand on (dé)coche un shop
    try {
      const res = await getStorageInventory(effectiveShopIds.value, store.state.activeConfigId || undefined)
      const payload = res?.data ?? res
      derived.value = payload?.items || []
    } catch (err) {
      derived.value = []
      error.value = err?.response?.status || err.message
    } finally {
      loading.value = false
    }
  },
  { immediate: true },
)
watch(() => element.value?.id, () => { search.value = '' })

// Le state builder renvoie les lignes AVEC leur id serveur ; le PUT (whitelist +
// forbidNonWhitelisted) le refuse → ne renvoyer QUE les champs du contrat.
function cleanRow(r) {
  const row = { name: r.name, quantity: Number(r.quantity) || 0 }
  if (r.unit != null) row.unit = r.unit
  if (r.minStock != null) row.minStock = r.minStock
  if (r.maxStock != null) row.maxStock = r.maxStock
  if (r.isCustom != null) row.isCustom = r.isCustom
  if (r.menuItemId != null) row.menuItemId = r.menuItemId
  return row
}

function persist(rows) {
  const el = element.value
  if (!el) return
  const next = rows.map(cleanRow)
  const cfgId = store.state.activeConfigId || undefined
  store.patchElementLocal(el.id, {
    inventoryByConfig: { ...(el.inventoryByConfig || {}), [cfgId || '']: next },
  })
  store.queue.push(() => putElementInventory(el.id, next, cfgId), {
    key: `inv:${el.id}:${cfgId || ''}`,
    onError: (err) => store.notify(err?.response?.data?.message || t('b2ToastSaveInventoryFailed')),
  })
}

// Une ligne dérivée « vide » (ni quantité ni min/max) n'a pas besoin d'être persistée
// (elle réapparaît via le menu) ; min/max saisis = configuration à conserver même à 0.
function keepRow(r) {
  return (
    (Number(r.quantity) || 0) > 0 ||
    r.minStock != null ||
    r.maxStock != null ||
    !derivedNames.value.has(r.name)
  )
}

function upsertRow(name, patch) {
  const rows = saved.value.some((r) => r.name === name)
    ? saved.value.map((r) => (r.name === name ? { ...r, ...patch } : r))
    : [...saved.value, { name, quantity: 0, ...patch }]
  persist(rows.filter(keepRow))
}

function setQuantity(name, raw) {
  upsertRow(name, { quantity: Math.max(0, Number(raw) || 0) })
}

function setBound(name, field, raw) {
  const trimmed = String(raw).trim()
  const value = trimmed === '' ? null : Math.max(0, Number(trimmed) || 0)
  upsertRow(name, { [field]: value })
}

function addRow() {
  const name = newName.value.trim()
  if (!name) return
  if (!saved.value.some((r) => r.name === name) && !derivedNames.value.has(name)) {
    persist([...saved.value, { name, quantity: 0 }])
  }
  newName.value = ''
}

function removeManual(name) {
  persist(saved.value.filter((r) => r.name !== name))
}
</script>

<style scoped>
/* Search — même vocabulaire que InventorySection */
.inv-search {
  display: flex;
  align-items: center;
  gap: 6px;
  background: #f4f4f5;
  border-radius: 10px;
  padding: 6px 10px;
}
.inv-search__icon { flex-shrink: 0; color: #9ca3af; }
.inv-search__input {
  flex: 1;
  background: none;
  border: none;
  outline: none;
  font-size: var(--fs-sm);
  color: inherit;
  min-width: 0;
}
.inv-search__input::placeholder { color: #9ca3af; }

.inv-label {
  font-size: var(--fs-xs);
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #9ca3af;
  margin: 8px 2px 6px;
}
.inv-label__types {
  color: #4f46e5;
  text-transform: none;
  letter-spacing: normal;
}

.inv-list {
  max-height: 380px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0 -4px;
  padding: 0 4px;
}

.inv-card {
  background: #fafafa;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 12px;
  padding: 9px 10px;
  transition: border-color 0.15s ease, background 0.15s ease;
}
.inv-card:hover { border-color: #e0e0e2; background: #f7f7f8; }

.inv-card__row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.inv-card__thumb {
  width: 26px;
  height: 26px;
  border-radius: 7px;
  object-fit: cover;
  flex-shrink: 0;
}
.inv-card__name {
  font-size: var(--fs-base);
  font-weight: 600;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.inv-card__stype {
  flex-shrink: 0;
  font-size: var(--fs-xs);
  color: #9ca3af;
}
.inv-card__kind {
  flex-shrink: 0;
  font-size: var(--fs-xs);
  font-weight: 500;
  padding: 1px 7px;
  border-radius: 100px;
  white-space: nowrap;
}
.inv-card__kind--component { background: rgba(99, 102, 241, 0.1); color: #4f46e5; }
.inv-card__kind--packaging { background: rgba(217, 119, 6, 0.1); color: #b45309; }
.inv-card__spacer { flex: 1; }

.inv-qty {
  display: flex;
  align-items: baseline;
  gap: 4px;
  flex-shrink: 0;
}
.inv-qty__input {
  width: 58px;
  text-align: right;
  font-size: var(--fs-sm);
  font-weight: 500;
  color: #374151;
  background: rgb(var(--v-theme-surface));
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 4px 8px;
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
  -moz-appearance: textfield;
}
.inv-qty__input::-webkit-outer-spin-button,
.inv-qty__input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.inv-qty__input:focus {
  border-color: #ff3131;
  box-shadow: 0 0 0 2px rgba(255, 49, 49, 0.12);
}
.inv-qty__unit {
  font-size: var(--fs-xs);
  color: #9ca3af;
  max-width: 48px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Min / Max + jauge */
.inv-bounds {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 7px;
}
.inv-bounds__field {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--fs-xs);
  color: #9ca3af;
  flex-shrink: 0;
}
.inv-bounds__input {
  width: 46px;
  text-align: right;
  font-size: var(--fs-xs);
  color: #374151;
  background: rgb(var(--v-theme-surface));
  border: 1px solid #e5e7eb;
  border-radius: 7px;
  padding: 2px 6px;
  outline: none;
  -moz-appearance: textfield;
}
.inv-bounds__input::-webkit-outer-spin-button,
.inv-bounds__input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.inv-bounds__input:focus { border-color: #ff3131; }

.inv-gauge {
  flex: 1;
  height: 6px;
  border-radius: 100px;
  background: #ececee;
  overflow: hidden;
  min-width: 40px;
}
.inv-gauge__fill {
  height: 100%;
  border-radius: 100px;
  background: #10b981;
  transition: width 0.2s ease, background 0.2s ease;
}
.inv-gauge__fill--low { background: #ff3131; }

.inv-pack-hint {
  margin-top: 3px;
  font-size: var(--fs-xs);
  color: #9ca3af;
}

/* Used in / Sold in : shop → menu items */
.inv-used {
  margin-top: 7px;
  padding: 5px 8px 5px 9px;
  border-left: 2px solid rgba(255, 49, 49, 0.45);
  background: rgb(var(--v-theme-surface));
  border-radius: 0 8px 8px 0;
}
.inv-used__label {
  display: block;
  font-size: var(--fs-xs);
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: #ff3131;
  margin-bottom: 3px;
}
.inv-used__shop { margin-bottom: 3px; }
.inv-used__shop:last-child { margin-bottom: 0; }
.inv-used__shop-name {
  display: block;
  font-size: var(--fs-xs);
  font-weight: 600;
  color: #4f46e5;
}
.inv-used__item {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 2px 0 2px 12px;
  font-size: var(--fs-xs);
  color: #374151;
  min-width: 0;
}
.inv-used__arrow { color: #9ca3af; flex-shrink: 0; }
.inv-used__mi {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.inv-used__thumb {
  width: 18px;
  height: 18px;
  border-radius: 5px;
  object-fit: cover;
  flex-shrink: 0;
}
.inv-used__thumb--empty {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #f4f4f5;
}

/* Ligne manuelle */
.inv-card--custom { background: rgb(var(--v-theme-surface)); }
.inv-card__remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 7px;
  border: none;
  background: transparent;
  color: #9ca3af;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.15s ease, color 0.15s ease;
}
.inv-card__remove:hover { background: rgba(255, 49, 49, 0.08); color: #ff3131; }

/* Ajout hors menu */
.inv-add {
  display: flex;
  align-items: center;
  gap: 6px;
}
.inv-add__input {
  flex: 1;
  min-width: 0;
  background: #f4f4f5;
  border: 1px solid transparent;
  border-radius: 10px;
  padding: 7px 10px;
  font-size: var(--fs-sm);
  outline: none;
  transition: border-color 0.15s ease, background 0.15s ease;
}
.inv-add__input::placeholder { color: #9ca3af; }
.inv-add__input:focus { background: rgb(var(--v-theme-surface)); border-color: #ff3131; }
.inv-add__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 10px;
  background: rgba(255, 49, 49, 0.1);
  color: #ff3131;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.15s ease;
}
.inv-add__btn:hover:not(:disabled) { background: rgba(255, 49, 49, 0.18); }
.inv-add__btn:disabled { opacity: 0.4; cursor: default; }

/* ── Dark mode : les gris clairs ci-dessus n'ont pas d'équivalent exact dans le
   thème Vuetify — surcharges via la classe .dark posée sur <html>. */
.dark .inv-search,
.dark .inv-add__input { background: #111827; }
.dark .inv-add__input:focus { background: #1f2937; }
.dark .inv-card { background: #1a2332; }
.dark .inv-card:hover { border-color: rgba(255, 255, 255, 0.14); background: #1f2937; }
.dark .inv-card--custom { background: #1f2937; }
.dark .inv-qty__input,
.dark .inv-bounds__input { color: #d1d5db; border-color: #374151; }
.dark .inv-qty__input:focus,
.dark .inv-bounds__input:focus { border-color: #ff3131; }
.dark .inv-gauge { background: #374151; }
.dark .inv-used__item { color: #d1d5db; }
.dark .inv-used__thumb--empty { background: #374151; }
.dark .inv-label__types,
.dark .inv-used__shop-name { color: #a5b4fc; }
.dark .inv-card__kind--component { background: rgba(99, 102, 241, 0.22); color: #a5b4fc; }
.dark .inv-card__kind--packaging { background: rgba(217, 119, 6, 0.22); color: #fbbf24; }
</style>
