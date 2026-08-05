<template>
  <!-- Sidebar droite (outil palette actif) : liste des éléments disponibles,
       triables par étage ou par type, avec recherche + revenu total. -->
  <div class="elp">
    <template v-if="store.state.activeTool">
      <!-- Entête : nom de l'outil + revenu total (vert) -->
      <div class="elp-head">
        <span class="elp-head__title">{{ tool?.label }}</span>
        <span class="elp-head__revenue">{{ formatTotal(totalRevenue) }}</span>
      </div>

      <!-- Filtre par étage : chevrons de défilement + puces (All Areas + floors
           contenant des éléments du type actif). -->
      <div v-if="floors.length" class="elp-floors">
        <button type="button" class="elp-floors__nav" :aria-label="t('b2ElpScrollLeft')" @click="scrollFloors(-1)">
          <ChevronLeft :size="18" />
        </button>
        <div ref="floorTrack" class="elp-floors__track">
          <button
            type="button"
            class="elp-floor"
            :class="{ 'elp-floor--active': floorFilter === 'all' }"
            @click="floorFilter = 'all'"
          >
            <Check v-if="floorFilter === 'all'" :size="14" class="elp-floor__check" />
            {{ t('b2ElpAllAreas') }}
          </button>
          <button
            v-for="f in floors"
            :key="f.id"
            type="button"
            class="elp-floor"
            :class="{ 'elp-floor--active': floorFilter === f.id }"
            @click="floorFilter = f.id"
          >
            <Check v-if="floorFilter === f.id" :size="14" class="elp-floor__check" />
            {{ f.name }}
          </button>
        </div>
        <button type="button" class="elp-floors__nav" :aria-label="t('b2ElpScrollRight')" @click="scrollFloors(1)">
          <ChevronRight :size="18" />
        </button>
      </div>

      <!-- Recherche + tri (toggle « Par étage / Par type » à droite du search) -->
      <div class="elp-toolbar">
        <div class="elp-search">
          <v-icon icon="mdi-magnify" size="15" class="elp-search__icon" />
          <input
            v-model="search"
            type="text"
            class="elp-search__input"
            :placeholder="t('b2ElpSearchPlaceholder')"
          />
          <span class="elp-search__count">{{ filtered.length }} {{ t('b2ElpItems') }}</span>
        </div>

        <!-- Tri : par étage / par type -->
        <div class="elp-sort">
          <button
            type="button"
            :class="{ active: sortMode === 'floor' }"
            @click="sortMode = 'floor'"
          >
            {{ t('b2SortByFloor') }}
          </button>
          <button
            type="button"
            :class="{ active: sortMode === 'type' }"
            @click="sortMode = 'type'"
          >
            {{ t('b2SortByType') }}
          </button>
        </div>
      </div>

      <div class="elp-divider" />

      <!-- Groupes -->
      <div v-if="groups.length === 0" class="elp-empty">
        <v-icon icon="mdi-shape-outline" size="40" color="grey-lighten-1" class="mb-2" />
        <div>{{ t('b2NoElementsCategory') }}</div>
      </div>

      <div v-for="group in groups" :key="group.key" class="elp-group">
        <div class="elp-group__label">{{ group.label }}</div>
        <button
          v-for="item in group.elements"
          :key="item.el.id"
          type="button"
          class="elp-card"
          :class="{ 'elp-card--active': item.el.id === store.state.selectedElementId }"
          @click="select(item.el)"
        >
          <!-- Vignette : image du PDV si présente, sinon icône du tool actif (couleur du tool). -->
          <span class="elp-card__thumb">
            <img v-if="item.el.image" :src="item.el.image" class="elp-card__img" alt="" />
            <v-icon v-else :icon="tool?.icon || 'mdi-store'" size="18" :color="tool?.color" />
          </span>
          <span class="elp-card__body">
            <span class="elp-card__name">{{ item.el.name }}</span>
            <span class="elp-card__sub">{{ subtypeLabels(item.el) || '—' }}</span>
          </span>
          <span class="elp-card__rev">{{ revenueLabel(item.el) }}</span>
        </button>
      </div>
    </template>

    <!-- Aucun outil actif -->
    <div v-else class="elp-none">
      <div>
        <v-icon icon="mdi-cursor-default-click" size="48" color="grey-lighten-1" class="mb-3" />
        <div class="text-subtitle-2 font-weight-medium">{{ t('b2NoElementSelected') }}</div>
        <div class="text-caption">{{ t('b2SelectElementHint') }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, inject, onMounted } from 'vue'
import { useStore as useVuexStore } from 'vuex'
import { ChevronLeft, ChevronRight, Check } from 'lucide-vue-next'
import { useI18n } from '@/i18n/useI18n'
import { toolOf, normalizeType, buildTools } from '../../constants/elementTaxonomy'

const { t } = useI18n()
const store = inject('builderStore')
const vuexStore = useVuexStore()
onMounted(() => vuexStore.dispatch('departments/fetchDepartments'))
const tools = computed(() => buildTools(vuexStore.getters['departments/departments'] || []))

const tool = computed(() => toolOf(store.state.activeTool, tools.value))
const search = ref('')
const sortMode = ref('floor') // 'floor' | 'type'
const floorFilter = ref('all') // 'all' | zoneId

// Tous les éléments de l'outil actif (toutes zones), avec leur zone d'origine.
const allElements = computed(() => {
  if (!store.state.activeTool) return []
  const out = []
  for (const zone of store.zonesSorted.value) {
    const els = store
      .visibleElementsOfZone(zone.id)
      .filter((e) => normalizeType(e.type) === store.state.activeTool)
    for (const el of els) out.push({ el, zoneId: zone.id, zoneName: zone.name })
  }
  return out
})

// Étages (zones) contenant au moins un élément du type actif → puces de filtre.
const floors = computed(() => {
  const seen = new Map()
  for (const { zoneId, zoneName } of allElements.value) {
    if (!seen.has(zoneId)) seen.set(zoneId, { id: zoneId, name: zoneName })
  }
  return Array.from(seen.values())
})

// Défilement horizontal de la rangée de floors via les chevrons < / >.
const floorTrack = ref(null)
function scrollFloors(dir) {
  floorTrack.value?.scrollBy({ left: dir * 160, behavior: 'smooth' })
}

const filtered = computed(() => {
  let list = allElements.value
  if (floorFilter.value !== 'all') {
    list = list.filter(({ zoneId }) => zoneId === floorFilter.value)
  }
  const q = search.value.trim().toLowerCase()
  if (!q) return list
  return list.filter(
    ({ el }) =>
      (el.name || '').toLowerCase().includes(q) ||
      subtypeLabels(el).toLowerCase().includes(q),
  )
})

const totalRevenue = computed(() =>
  allElements.value.reduce((sum, { el }) => sum + elementRevenue(el), 0),
)

const groups = computed(() => {
  const map = new Map()
  if (sortMode.value === 'type') {
    for (const item of filtered.value) {
      const key = subtypeLabels(item.el) || '—'
      if (!map.has(key)) map.set(key, { key, label: key, elements: [] })
      map.get(key).elements.push(item)
    }
  } else {
    for (const item of filtered.value) {
      if (!map.has(item.zoneId)) map.set(item.zoneId, { key: item.zoneId, label: item.zoneName, elements: [] })
      map.get(item.zoneId).elements.push(item)
    }
  }
  // Tri alphabétique des PDV à l'intérieur de chaque groupe (demande Bertrand, builder v2).
  for (const g of map.values()) {
    g.elements.sort((a, b) =>
      (a.el.name || '').localeCompare(b.el.name || '', undefined, { numeric: true, sensitivity: 'base' }),
    )
  }
  return Array.from(map.values())
})

// Libellés des sous-types (valeurs → labels de l'outil).
function subtypeLabels(el) {
  const opts = tool.value?.subtypes || []
  const byVal = new Map(opts.map((o) => [o.value, o.label]))
  return (el.subtypes || []).map((v) => byVal.get(v) || v).join(', ')
}

// Revenu de l'élément pour la config active (perf scopée par config).
function elementRevenue(el) {
  const cfg = store.state.activeConfigId || ''
  const byConfig = el.performanceByConfig || {}
  const perf = byConfig[cfg] || byConfig[''] || {}
  return Number(perf.revenue) || 0
}

function revenueLabel(el) {
  const r = elementRevenue(el)
  return r > 0 ? `€${r.toFixed(2)}` : '-'
}

function formatTotal(n) {
  const value = (Number(n) || 0).toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `€${value}`
}

function select(element) {
  store.selectElement(element.id)
}
</script>

<style scoped>
.elp {
  height: 100%;
  overflow-y: auto;
  padding: 16px;
}

/* Entête */
.elp-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}
.elp-head__title {
  font-size: var(--fs-xl);
  font-weight: var(--fw-bold);
  color: rgb(var(--v-theme-on-surface));
}
.elp-head__revenue {
  font-size: var(--fs-lg);
  font-weight: 700;
  color: #16a34a;
  white-space: nowrap;
}

/* Barre d'outils : recherche (flexible) + toggle de tri calé à droite. */
.elp-toolbar {
  display: flex;
  align-items: stretch;
  gap: 8px;
  margin-top: 20px;
}
.elp-toolbar .elp-search { flex: 1 1 auto; min-width: 0; }
.elp-toolbar .elp-sort { flex-shrink: 0; padding: 3px; }
.elp-toolbar .elp-sort button { flex: 0 0 auto; padding: 6px 10px; font-size: var(--fs-sm); }

/* Recherche */
.elp-search {
  display: flex;
  align-items: center;
  gap: 7px;
  background: rgba(var(--v-theme-on-surface), 0.05);
  border: 1px solid transparent;
  border-radius: 10px;
  padding: 6px 12px;
  transition: background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
}
.elp-search:focus-within {
  background: rgb(var(--v-theme-surface));
  border-color: #ff3131;
  box-shadow: 0 0 0 3px rgba(255, 49, 49, 0.12);
}
.elp-search__icon {
  flex-shrink: 0;
  color: rgba(var(--v-theme-on-surface), 0.45);
  transition: color 0.15s ease;
}
.elp-search:focus-within .elp-search__icon { color: #ff3131; }
.elp-search__input {
  flex: 1;
  min-width: 0;
  border: none;
  background: none;
  outline: none;
  font-size: var(--fs-base);
  color: inherit;
}
.elp-search__input::placeholder { color: rgba(var(--v-theme-on-surface), 0.45); }
.elp-search__count {
  flex-shrink: 0;
  font-size: var(--fs-sm);
  color: rgba(var(--v-theme-on-surface), 0.45);
}

.elp-divider {
  height: 1px;
  background: rgba(var(--v-border-color), var(--v-border-opacity));
  margin: 16px 0;
}

/* Filtre par étage : chevrons + rangée de puces défilable */
.elp-floors {
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 12px 0 4px;
}
.elp-floors__nav {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: rgba(var(--v-theme-on-surface), 0.55);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}
.elp-floors__nav:hover {
  color: rgb(var(--v-theme-on-surface));
  background: rgba(var(--v-theme-on-surface), 0.06);
}
.elp-floors__track {
  display: flex;
  align-items: center;
  gap: 8px;
  overflow-x: auto;
  scroll-behavior: smooth;
  scrollbar-width: none; /* Firefox */
}
.elp-floors__track::-webkit-scrollbar { display: none; } /* Chrome/Safari */
.elp-floor {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 16px;
  border-radius: 999px;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  background: transparent;
  font-size: var(--fs-base);
  font-weight: 600;
  color: rgb(var(--v-theme-on-surface));
  white-space: nowrap;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}
.elp-floor:hover:not(.elp-floor--active) {
  background: rgba(var(--v-theme-on-surface), 0.05);
}
.elp-floor--active {
  background: rgba(255, 49, 49, 0.09);
  border-color: #ff3131;
  color: #ff3131;
}
.elp-floor__check { flex-shrink: 0; }

/* Tri */
/* Toggle segmenté : track gris, 2 segments égaux, le segment actif rempli. */
.elp-sort {
  display: flex;
  gap: 4px;
  padding: 4px;
  border-radius: 12px;
  background: rgba(var(--v-theme-on-surface), 0.06);
}
.elp-sort button {
  flex: 1;
  padding: 8px 14px;
  border-radius: 9px;
  border: 0;
  background: transparent;
  font-size: var(--fs-base);
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), 0.6);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease, box-shadow 0.15s ease;
}
.elp-sort button:hover:not(.active) { color: rgb(var(--v-theme-on-surface)); }
.elp-sort button.active {
  background: #111827;
  color: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.14);
}

/* Groupes + cartes */
.elp-group { margin-bottom: 18px; }
.elp-group__label {
  font-size: var(--fs-md);
  font-weight: 700;
  color: rgb(var(--v-theme-on-surface));
  margin-bottom: 10px;
}
/* Carte PDV compacte : [vignette] [nom + sous-type] ······ [revenu à droite]. */
.elp-card {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  text-align: left;
  border: none;
  background: rgba(var(--v-theme-on-surface), 0.03);
  border-radius: 10px;
  padding: 8px 12px;
  margin-bottom: 6px;
  cursor: pointer;
  transition: background 0.12s ease;
}
.elp-card:hover { background: rgba(var(--v-theme-on-surface), 0.06); }
.elp-card--active { background: rgba(var(--v-theme-on-surface), 0.09); }
.elp-card__thumb {
  flex-shrink: 0;
  width: 34px;
  height: 34px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(var(--v-theme-on-surface), 0.06);
  overflow: hidden;
}
.elp-card__img { width: 100%; height: 100%; object-fit: cover; }
.elp-card__body { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; }
.elp-card__name {
  font-size: var(--fs-md);
  font-weight: 600;
  color: rgb(var(--v-theme-on-surface));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.elp-card__sub {
  font-size: var(--fs-sm);
  color: rgba(var(--v-theme-on-surface), 0.5);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.elp-card__rev {
  flex-shrink: 0;
  margin-left: 8px;
  font-size: var(--fs-base);
  font-weight: 700;
  color: #16a34a;
  white-space: nowrap;
}

/* États vides */
.elp-empty {
  text-align: center;
  color: rgba(var(--v-theme-on-surface), 0.5);
  padding: 32px 8px;
}
.elp-none {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  color: rgba(var(--v-theme-on-surface), 0.5);
}

/* Scrollbar fine */
.elp::-webkit-scrollbar { width: 6px; }
.elp::-webkit-scrollbar-track { background: transparent; }
.elp::-webkit-scrollbar-thumb {
  background: rgba(var(--v-theme-on-surface), 0.18);
  border-radius: 3px;
}
.elp::-webkit-scrollbar-thumb:hover { background: rgba(var(--v-theme-on-surface), 0.32); }
</style>
