<template>
  <!-- Settings > Configuration > Saisons — périodes personnalisées nommées
       (« Saison 2025-2026 ») rattachées à un ou plusieurs espaces, reprises
       comme presets de dates dans Analyse/Predict. Rendue dans le chrome
       DashboardView (barre + rail), même style d'entête que HrSettingsView. -->
  <div id="seasons-page" :class="{ 'ssn--dark': isDark }">

    <!-- ── Header ── -->
    <div class="ssn-header">
      <div class="ssn-header__inner">
        <div class="ssn-header__left">
          <div class="ssn-header__icon"><CalendarRange :size="22" color="white" /></div>
          <div>
            <h1 class="ssn-header__title">{{ t('seasonsTitle') }}</h1>
            <p class="ssn-header__subtitle">{{ t('seasonsSubtitle') }}</p>
          </div>
        </div>
        <div class="ssn-header__right">
          <button class="ssn-add-btn" @click="openAdd"><Plus :size="17" class="me-1" /> {{ t('seasonAdd') }}</button>
        </div>
      </div>
    </div>

    <!-- ── Content ── -->
    <div class="ssn-content">
      <v-progress-linear v-if="fetching" indeterminate color="#ff3131" height="3" rounded class="mb-4" />

      <div v-if="!fetching && !seasons.length" class="ssn-empty">
        <div class="ssn-empty__icon"><CalendarRange :size="40" style="color:#d1d5db" /></div>
        <h3 class="ssn-empty__title">{{ t('seasonsEmpty') }}</h3>
        <p class="ssn-empty__hint">{{ t('seasonsEmptyHint') }}</p>
      </div>

      <div v-else class="ssn-list">
        <div v-for="season in seasons" :key="season.id" class="ssn-card">
          <div class="ssn-card__main">
            <div class="ssn-card__name">{{ season.name }}</div>
            <div class="ssn-card__dates">
              {{ formatDateShort(season.startDate) }} → {{ formatDateShort(season.endDate) }}
            </div>
            <div class="ssn-card__spaces">
              <span v-if="season.allSpaces" class="ssn-chip ssn-chip--all">{{ t('hrAllSpaces') }}</span>
              <template v-else>
                <span v-for="id in season.spaceIds" :key="id" class="ssn-chip">{{ spaceName(id) }}</span>
              </template>
            </div>
          </div>
          <div class="ssn-card__actions">
            <button class="ssn-icon-btn" :title="t('seasonEdit')" @click="openEdit(season)"><Pencil :size="16" /></button>
            <button class="ssn-icon-btn ssn-icon-btn--danger" :title="t('seasonDelete')" @click="confirmDelete(season)"><Trash2 :size="16" /></button>
          </div>
        </div>
      </div>
    </div>

    <!-- Drawer création / édition -->
    <SeasonFormDrawer
      v-model="drawer.open"
      :mode="drawer.mode"
      :initial="drawer.season"
      :spaces="spaces"
      @submit="onSubmit"
    />

    <!-- Confirmation de suppression -->
    <v-dialog v-model="deleteDialog.open" max-width="440">
      <v-card>
        <v-card-title>{{ t('seasonDelete') }}</v-card-title>
        <v-card-text>{{ t('seasonDeleteConfirm') }} « {{ deleteDialog.season?.name }} » ?</v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="deleteDialog.open = false">{{ t('hrCancel') }}</v-btn>
          <v-btn color="error" variant="flat" @click="onDelete">{{ t('seasonDelete') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snackbar.open" :color="snackbar.color" timeout="3500">{{ snackbar.text }}</v-snackbar>
  </div>
</template>

<script setup>
import { reactive, computed, onMounted } from 'vue'
import { useStore } from 'vuex'
import { useTheme } from 'vuetify'
import { CalendarRange, Pencil, Plus, Trash2 } from 'lucide-vue-next'
import SeasonFormDrawer from '@/components/seasons/SeasonFormDrawer.vue'
import { formatDateShort } from '@/utils/dateFr'
import { t } from '@/i18n'

const store = useStore()
const theme = useTheme()
const isDark = computed(() => !!theme.global.current.value.dark)

const seasons = computed(() => store.getters['seasons/seasons'])
const fetching = computed(() => store.state.seasons.fetching)
const spaces = computed(() => store.getters['spaces/spaces'] || [])

const drawer = reactive({ open: false, mode: 'create', season: null })
const deleteDialog = reactive({ open: false, season: null })
const snackbar = reactive({ open: false, text: '', color: 'error' })

function notify(text, color = 'success') {
  snackbar.text = text
  snackbar.color = color
  snackbar.open = true
}

function spaceName(id) {
  return spaces.value.find((s) => s.id === id)?.name || id
}

function openAdd() {
  drawer.mode = 'create'
  drawer.season = null
  drawer.open = true
}
function openEdit(season) {
  drawer.mode = 'edit'
  drawer.season = season
  drawer.open = true
}
function confirmDelete(season) {
  deleteDialog.season = season
  deleteDialog.open = true
}

async function onSubmit(payload) {
  try {
    if (drawer.mode === 'edit' && drawer.season) {
      await store.dispatch('seasons/update', { id: drawer.season.id, ...payload })
      notify(t('seasonSaved'))
    } else {
      await store.dispatch('seasons/create', payload)
      notify(t('seasonSaved'))
    }
    drawer.open = false
  } catch (e) {
    notify(e?.response?.data?.message || t('seasonError'), 'error')
  }
}

async function onDelete() {
  try {
    await store.dispatch('seasons/remove', deleteDialog.season.id)
    notify(t('seasonDeleted'))
  } catch (e) {
    notify(e?.response?.data?.message || t('seasonError'), 'error')
  } finally {
    deleteDialog.open = false
  }
}

onMounted(() => {
  store.dispatch('seasons/fetchAll')
  store.dispatch('spaces/fetchSpaces')
})
</script>

<style scoped>
#seasons-page { min-height: 100%; }

.ssn-header {
  background: #ff3131;
  border-radius: 18px;
  padding: 18px 22px;
  margin-bottom: 18px;
  box-shadow: 0 8px 24px rgba(255, 49, 49, 0.28);
}
.ssn-header__inner { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.ssn-header__left { display: flex; align-items: center; gap: 14px; }
.ssn-header__icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
}
.ssn-header__title { font-size: var(--fs-lg); font-weight: var(--fw-bold); color: #fff; line-height: 1.2; margin: 0; }
.ssn-header__subtitle { font-size: var(--fs-sm); color: rgba(255, 255, 255, 0.75); margin: 3px 0 0; }
.ssn-add-btn {
  display: inline-flex;
  align-items: center;
  border: none;
  border-radius: 100px;
  padding: 9px 18px;
  background: #fff;
  color: #ff3131;
  font-size: var(--fs-base);
  font-weight: var(--fw-semibold);
  cursor: pointer;
  transition: all 0.2s;
}
.ssn-add-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 18px rgba(0, 0, 0, 0.18); }

.ssn-content { padding-bottom: 32px; }

.ssn-empty { text-align: center; padding: 56px 16px; }
.ssn-empty__title { font-size: var(--fs-md); font-weight: var(--fw-semibold); color: #6b7280; margin: 12px 0 4px; }
.ssn-empty__hint { font-size: var(--fs-sm); color: #9ca3af; margin: 0; }

.ssn-list { display: flex; flex-direction: column; gap: 10px; }
.ssn-card {
  display: flex;
  align-items: center;
  gap: 14px;
  background: #fff;
  border: 1px solid #eceff3;
  border-radius: 14px;
  padding: 14px 18px;
  transition: box-shadow 0.18s;
}
.ssn-card:hover { box-shadow: 0 4px 16px rgba(15, 23, 42, 0.08); }
.ssn--dark .ssn-card { background: #1e293b; border-color: rgba(255, 255, 255, 0.08); }

.ssn-card__main { flex: 1; min-width: 0; display: flex; align-items: center; gap: 18px; flex-wrap: wrap; }
.ssn-card__name { font-size: var(--fs-base); font-weight: var(--fw-bold); color: #111827; min-width: 160px; }
.ssn--dark .ssn-card__name { color: rgba(255, 255, 255, 0.9); }
.ssn-card__dates { font-size: var(--fs-sm); color: #6b7280; white-space: nowrap; }
.ssn-card__spaces { display: flex; flex-wrap: wrap; gap: 6px; }

.ssn-chip {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: 100px;
  background: #f3f4f6;
  color: #4b5563;
  font-size: var(--fs-xs);
  font-weight: var(--fw-medium);
}
.ssn-chip--all { background: #fef2f2; color: #ff3131; font-weight: var(--fw-semibold); }
.ssn--dark .ssn-chip { background: rgba(255, 255, 255, 0.08); color: rgba(255, 255, 255, 0.65); }
.ssn--dark .ssn-chip--all { background: rgba(255, 49, 49, 0.15); color: #e84444; }

.ssn-card__actions { display: flex; gap: 6px; flex-shrink: 0; }
.ssn-icon-btn {
  width: 32px;
  height: 32px;
  border: 1px solid #e5e7eb;
  border-radius: 9px;
  background: transparent;
  color: #6b7280;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.18s;
}
.ssn-icon-btn:hover { border-color: #9ca3af; color: #374151; background: #f9fafb; }
.ssn-icon-btn--danger:hover { border-color: #ff3131; color: #ff3131; background: #fff5f5; }
.ssn--dark .ssn-icon-btn { border-color: rgba(255, 255, 255, 0.12); color: rgba(255, 255, 255, 0.55); }
</style>
