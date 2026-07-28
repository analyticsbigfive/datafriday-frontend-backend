<template>
  <SectionCard :title="t('b2MenuTitle')" icon="mdi-silverware-fork-knife">
    <template #meta>
      <v-chip size="x-small" variant="tonal">{{ menuCount }}</v-chip>
    </template>

    <div v-if="loading" class="text-center py-3">
      <v-progress-circular indeterminate size="20" width="2" color="#ff3131" />
    </div>

    <template v-else-if="items.length">
      <!-- Search -->
      <div class="ms-search mb-2">
        <v-icon icon="mdi-magnify" size="15" class="ms-search__icon" />
        <input
          v-model="search"
          type="text"
          class="ms-search__input"
          :placeholder="t('b2SearchMenuItemsPlaceholder')"
        />
      </div>

      <!-- Scrollable list -->
      <div class="ms-list">
        <div v-if="filtered.length === 0" class="text-caption text-medium-emphasis py-2 text-center">
          {{ t('b2NoResultsFor').replace('{query}', search) }}
        </div>
        <div v-for="item in filtered" :key="item.id" class="ms-item">
          <img v-if="item.picture" :src="item.picture" :alt="item.name" class="ms-item__img" />
          <div class="ms-item__body">
            <span class="ms-item__name">{{ item.name }}</span>
            <div v-if="item.category" class="ms-item__sub">{{ item.category }}</div>
            <!-- `price` = TTC scopé espace calculé serveur (spacePrices[spaceId] sinon global) -->
            <div v-if="item.price != null" class="ms-item__price">
              {{ Number(item.price).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }) }}
            </div>
          </div>
          <span v-if="item.type" class="ms-item__badge">{{ item.type }}</span>
        </div>
      </div>
    </template>

    <div v-else-if="error" class="text-caption text-medium-emphasis py-2">
      {{ t('b2MenuUnavailable').replace('{error}', error) }}
    </div>
    <div v-else class="text-caption text-medium-emphasis py-2">
      {{ t('b2NoMenuItemsAssigned') }}
    </div>

    <router-link to="/menu-fb/space-menus" class="text-caption d-inline-block mt-2">
      {{ t('b2ManageMenuInSpaceMenu') }} ↗
    </router-link>
  </SectionCard>
</template>

<script setup>
import { ref, computed, inject, watch } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import SectionCard from './SectionCard.vue'
import { getShopAvailableMenuItems } from '@/api/endpoints/menu.api'

const { t } = useI18n()
const store = inject('builderStore')
const element = computed(() => store.selectedElement.value)
const menuCount = computed(() => store.elementMenuCountForActiveConfig(element.value?.id))

const items = ref([])
const loading = ref(false)
const error = ref(null)
const search = ref('')

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return items.value
  return items.value.filter((i) =>
    (i.name || '').toLowerCase().includes(q) ||
    (i.type || '').toLowerCase().includes(q) ||
    (i.category || '').toLowerCase().includes(q),
  )
})

// Forme multi-sources OBLIGATOIRE (tableau de getters, pas getter-de-tableau) :
// un getter qui retourne un tableau neuf déclenche à CHAQUE mutation de l'élément
// (le drag remplace l'objet à chaque pointermove) → un GET items par mouvement.
watch(
  [() => element.value?.id, () => store.state.activeConfigId],
  async ([shopId]) => {
    items.value = []
    error.value = null
    search.value = ''
    if (!shopId) return
    loading.value = true
    try {
      const res = await getShopAvailableMenuItems(shopId, store.state.activeConfigId || undefined, {
        enabledOnly: true,
      })
      const payload = res?.data ?? res
      items.value = payload?.items || []
    } catch (err) {
      error.value = err?.response?.status || err.message
    } finally {
      loading.value = false
    }
  },
  { immediate: true },
)
</script>

<style scoped>
.ms-search {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(var(--v-theme-on-surface), 0.04);
  border-radius: 12px;
  padding: 9px 13px;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
}
.ms-search:hover { background: rgba(var(--v-theme-on-surface), 0.06); }
.ms-search:focus-within {
  background: rgb(var(--v-theme-surface));
  border-color: #ff3131;
  box-shadow: 0 0 0 3px rgba(255, 49, 49, 0.12);
}
.ms-search__icon { flex-shrink: 0; opacity: 0.5; transition: opacity 0.15s ease; }
.ms-search:focus-within .ms-search__icon { opacity: 1; color: #ff3131; }
.ms-search__input {
  flex: 1;
  background: none;
  border: none;
  outline: none;
  font-size: var(--fs-base);
  color: inherit;
  min-width: 0;
}
.ms-search__input::placeholder { opacity: 0.45; }

.ms-list {
  max-height: 320px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0 -4px;
  padding: 2px 4px;
}
.ms-list::-webkit-scrollbar { width: 6px; }
.ms-list::-webkit-scrollbar-track { background: transparent; }
.ms-list::-webkit-scrollbar-thumb {
  background: rgba(var(--v-theme-on-surface), 0.18);
  border-radius: 3px;
}
.ms-list::-webkit-scrollbar-thumb:hover { background: rgba(var(--v-theme-on-surface), 0.32); }

.ms-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  background: rgba(var(--v-theme-on-surface), 0.035);
  transition: background 0.12s ease;
  border-radius: 12px;
}
.ms-item:hover { background: rgba(var(--v-theme-on-surface), 0.06); }

.ms-item__img {
  width: 46px;
  height: 46px;
  border-radius: 10px;
  object-fit: cover;
  flex-shrink: 0;
}

.ms-item__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.ms-item__name {
  font-size: var(--fs-sm);
  font-weight: 500;
  line-height: 1.3;
}
.ms-item__badge {
  flex-shrink: 0;
  align-self: flex-start;
  font-size: var(--fs-xs);
  font-weight: 600;
  padding: 2px 9px;
  border-radius: 100px;
  background: rgba(99, 102, 241, 0.1);
  color: #4f46e5;
  white-space: nowrap;
}
.ms-item__sub {
  font-size: var(--fs-sm);
  color: rgba(var(--v-theme-on-surface), 0.55);
  margin-top: 3px;
}
.ms-item__price {
  font-size: var(--fs-sm);
  margin-top: 3px;
  font-weight: 400;
  color: rgba(var(--v-theme-on-surface), 0.8);
}
</style>

