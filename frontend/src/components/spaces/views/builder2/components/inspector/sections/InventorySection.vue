<template>
  <SectionCard :title="t('b2InventoryTitle')" icon="mdi-package-variant-closed">
    <template #meta>
      <v-chip size="x-small" variant="tonal">{{ totalCount }}</v-chip>
    </template>

    <div v-if="loading" class="text-center py-3">
      <v-progress-circular indeterminate size="20" width="2" color="#ff3131" />
    </div>

    <template v-else>
      <!-- Search (même vocabulaire que MenuSection) -->
      <div v-if="derived.length || manualRows.length" class="inv-search mb-2">
        <v-icon icon="mdi-magnify" size="15" class="inv-search__icon" />
        <input
          v-model="search"
          type="text"
          class="inv-search__input"
          :placeholder="t('b2SearchInventoryPlaceholder')"
        />
      </div>

      <!-- Lignes dérivées du menu du shop -->
      <template v-if="filteredDerived.length">
        <div class="inv-label">{{ t('b2InventoryItemsLabel') }}</div>
        <div class="inv-list">
          <div v-for="line in filteredDerived" :key="line.kind + ':' + line.id" class="inv-card">
            <div class="inv-card__row">
              <span class="inv-card__name">{{ line.name }}</span>
              <span v-if="line.kind !== 'ingredient'" class="inv-card__kind" :class="'inv-card__kind--' + line.kind">
                {{ line.kind === 'component' ? t('b2Component') : t('b2Packaging') }}
              </span>
              <span class="inv-card__spacer" />
              <div class="inv-qty">
                <input
                  class="inv-qty__input"
                  type="number"
                  min="0"
                  :value="quantityFor(line.name)"
                  @change="(e) => setQuantity(line.name, e.target.value)"
                />
                <span v-if="line.unit" class="inv-qty__unit">{{ line.unit }}</span>
              </div>
            </div>
            <div class="inv-used">
              <span class="inv-used__label">{{ t('b2UsedIn') }}</span>
              <div class="inv-used__items">
                <span v-for="mi in line.usedIn" :key="mi.id" class="inv-used__item">
                  <img v-if="mi.picture" :src="mi.picture" :alt="mi.name" class="inv-used__thumb" />
                  <span v-else class="inv-used__thumb inv-used__thumb--empty">
                    <v-icon icon="mdi-food" size="11" color="grey-lighten-1" />
                  </span>
                  {{ mi.name }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </template>

      <div v-if="error" class="text-caption text-medium-emphasis py-2">
        {{ t('b2MenuInventoryUnavailable').replace('{error}', error) }}
      </div>
      <div v-else-if="!derived.length" class="text-caption text-medium-emphasis py-2">
        {{ t('b2NoMenuItemsInventoryHint') }}
      </div>
      <div v-else-if="search && !filteredDerived.length && !filteredManual.length" class="text-caption text-medium-emphasis py-2 text-center">
        {{ t('b2NoResultsFor').replace('{query}', search) }}
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
                  :value="row.quantity"
                  @change="(e) => setQuantity(row.name, e.target.value)"
                />
              </div>
              <button class="inv-card__remove" :title="t('b2Remove')" @click="removeManual(row.name)">
                <v-icon icon="mdi-close" size="13" />
              </button>
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
import { ref, computed, inject, watch } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import SectionCard from './SectionCard.vue'
import { putElementInventory } from '@/api/endpoints/builder-v2.api'
import { getShopInventory } from '@/api/endpoints/menu.api'

const { t } = useI18n()
const store = inject('builderStore')
const element = computed(() => store.selectedElement.value)
// Tranche de la CONFIG ACTIVE (stock par config depuis le scoping backend) ;
// clé '' = lignes legacy d'un élément sans config adhérente.
const configKey = computed(() => store.state.activeConfigId || '')
const saved = computed(() => {
  const byConfig = element.value?.inventoryByConfig || {}
  return byConfig[configKey.value] || byConfig[''] || []
})

// Lignes dérivées du menu (serveur) : dédupliquées, avec usedIn. Les quantités restent
// stockées dans ElementInventory (par nom) — le derived n'est qu'une vue du menu.
const derived = ref([])
const loading = ref(false)
const error = ref(null)
const newName = ref('')
const search = ref('')

const derivedNames = computed(() => new Set(derived.value.map((l) => l.name)))
// Lignes persistées qui ne matchent aucune ligne du menu = ajouts manuels (ou reliquats
// d'un menu modifié) — affichées à part, supprimables.
const manualRows = computed(() => saved.value.filter((r) => !derivedNames.value.has(r.name)))
const totalCount = computed(() => derived.value.length + manualRows.value.length)

const matches = (text) => (text || '').toLowerCase().includes(search.value.trim().toLowerCase())
const filteredDerived = computed(() => {
  if (!search.value.trim()) return derived.value
  return derived.value.filter((l) => matches(l.name) || l.usedIn.some((mi) => matches(mi.name)))
})
const filteredManual = computed(() => {
  if (!search.value.trim()) return manualRows.value
  return manualRows.value.filter((r) => matches(r.name))
})

const qtyByName = computed(() => {
  const m = new Map()
  for (const r of saved.value) m.set(r.name, Number(r.quantity) || 0)
  return m
})
function quantityFor(name) {
  return qtyByName.value.get(name) ?? 0
}

// Même forme multi-sources que MenuSection : un getter-de-tableau re-déclencherait
// le fetch à chaque mutation de l'élément (drag).
watch(
  [() => element.value?.id, () => store.state.activeConfigId],
  async ([shopId]) => {
    derived.value = []
    error.value = null
    search.value = ''
    if (!shopId) return
    loading.value = true
    try {
      const res = await getShopInventory(shopId, store.state.activeConfigId || undefined)
      const payload = res?.data ?? res
      derived.value = payload?.items || []
    } catch (err) {
      error.value = err?.response?.status || err.message
    } finally {
      loading.value = false
    }
  },
  { immediate: true },
)

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

function setQuantity(name, raw) {
  const quantity = Math.max(0, Number(raw) || 0)
  const rows = saved.value.some((r) => r.name === name)
    ? saved.value.map((r) => (r.name === name ? { ...r, quantity } : r))
    : [...saved.value, { name, quantity }]
  // Une ligne dérivée à 0 n'a pas besoin d'être persistée (elle réapparaît via le menu).
  persist(rows.filter((r) => r.quantity > 0 || !derivedNames.value.has(r.name)))
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
/* Search — même vocabulaire que MenuSection */
.inv-search {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #f4f4f5;
  border: 1px solid transparent;
  border-radius: 12px;
  padding: 9px 13px;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
}
.inv-search:hover { background: #efeff1; }
.inv-search:focus-within {
  background: #fff;
  border-color: #ff3131;
  box-shadow: 0 0 0 3px rgba(255, 49, 49, 0.12);
}
.inv-search__icon { flex-shrink: 0; color: #9ca3af; transition: color 0.15s ease; }
.inv-search:focus-within .inv-search__icon { color: #ff3131; }
.inv-search__input {
  flex: 1;
  background: none;
  border: none;
  outline: none;
  font-size: 13px;
  color: inherit;
  min-width: 0;
}
.inv-search__input::placeholder { color: #9ca3af; }

/* Libellés de groupe */
.inv-label {
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #9ca3af;
  margin: 8px 2px 6px;
}

/* Liste scrollable */
.inv-list {
  max-height: 320px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0 -4px;
  padding: 0 4px;
}

/* Carte ligne d'inventaire */
.inv-card {
  background: #fafafa;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 12px;
  padding: 9px 10px;
  transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
}
.inv-card:hover {
  border-color: #e0e0e2;
  background: #fff;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.05);
}

.inv-card__row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.inv-card__name {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.inv-card__kind {
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 500;
  padding: 1px 7px;
  border-radius: 100px;
  white-space: nowrap;
}
.inv-card__kind--component { background: rgba(99, 102, 241, 0.1); color: #4f46e5; }
.inv-card__kind--packaging { background: rgba(217, 119, 6, 0.1); color: #b45309; }
.inv-card__spacer { flex: 1; }

/* Quantité */
.inv-qty {
  display: flex;
  align-items: baseline;
  gap: 4px;
  flex-shrink: 0;
}
.inv-qty__input {
  width: 58px;
  text-align: right;
  font-size: 12.5px;
  font-weight: 500;
  color: #374151;
  background: #fff;
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
  font-size: 10.5px;
  color: #9ca3af;
  max-width: 48px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Used in */
.inv-used {
  margin-top: 7px;
  padding: 5px 8px 5px 9px;
  border-left: 2px solid rgba(255, 49, 49, 0.45);
  background: #fff;
  border-radius: 0 8px 8px 0;
}
.inv-used__label {
  display: block;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: #ff3131;
  margin-bottom: 3px;
}
.inv-used__items {
  display: flex;
  flex-wrap: wrap;
  gap: 3px 12px;
}
.inv-used__item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11.5px;
  color: #374151;
  min-width: 0;
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
.inv-card--custom { background: #fff; }
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
  font-size: 12.5px;
  outline: none;
  transition: border-color 0.15s ease, background 0.15s ease;
}
.inv-add__input::placeholder { color: #9ca3af; }
.inv-add__input:focus { background: #fff; border-color: #ff3131; }
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
</style>
