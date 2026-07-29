<template>
  <!-- Settings HR (maquettes Bertrand) — vue façon « My Spaces » orientée RH.
       Rendue dans le chrome DashboardView (barre + rail), comme HrSuppliersView :
       header rouge sticky + recherche + grille de cartes. Pas de <v-app> propre. -->
  <div id="hr-settings-page">

    <!-- ── Header ── -->
    <div class="hsl-header sticky-header">
      <div class="hsl-header__inner">
        <div class="hsl-header__left">
          <div class="hsl-header__icon"><UserCog :size="22" color="white" /></div>
          <div>
            <h1 class="hsl-header__title">{{ t('hrSettingsTitle') }}</h1>
            <p class="hsl-header__subtitle">{{ t('hrSettingsSubtitle') }}</p>
          </div>
        </div>
        <div class="hsl-header__right">
          <button class="hsl-add-btn" @click="openAddGoal"><Target :size="17" class="me-1" /> {{ t('hrAddGoal') }}</button>
          <button class="hsl-add-btn" @click="openAddStaff"><Users :size="17" class="me-1" /> {{ t('hrAddStaffRatio') }}</button>
        </div>
      </div>
    </div>

    <!-- ── Search ── -->
    <div class="hsl-searchbar sticky-search">
      <div class="hsl-searchbar__inner">
        <Search :size="18" class="hsl-searchbar__icon" />
        <input v-model="searchQuery" class="hsl-searchbar__input" type="search" :placeholder="t('hrSettingsSearch')" />
        <span class="hsl-searchbar__count">{{ filteredSpaces.length }} {{ t('hrColSpaces') }}</span>
        <button v-if="searchQuery" class="hsl-searchbar__clear" :aria-label="t('hrCancel')" @click="searchQuery = ''"><X :size="16" /></button>
      </div>
    </div>

    <!-- ── Content ── -->
    <div class="hsl-content">
      <v-progress-linear v-if="loading" indeterminate color="#ff3131" height="3" rounded class="mb-4" />

      <div v-if="!loading && !filteredSpaces.length" class="hsl-empty">
        <div class="hsl-empty__icon"><UserCog :size="40" style="color:#d1d5db" /></div>
        <h3 class="hsl-empty__title">{{ t('hrSettingsEmpty') }}</h3>
      </div>

      <div v-else class="hrs-grid">
        <HrSpaceCard
          v-for="s in filteredSpaces"
          :key="s.id"
          :space="s"
          :goal-per-tpe="resolvedById[s.id]?.goal ?? null"
          :staff-per-zone-manager="resolvedById[s.id]?.ratio ?? null"
          @edit="onCardEdit"
        />
      </div>
    </div>

    <!-- Drawers -->
    <HrValueFormDrawer v-model="goalDrawer.open" kind="goal" :spaces="spaces" @submit="onGoalSubmit" />
    <HrValueFormDrawer v-model="staffDrawer.open" kind="staff" :spaces="spaces" @submit="onStaffSubmit" />
    <HrSpaceEditDrawer v-model="editDrawer.open" :space="editDrawer.space" :initial="editDrawer.initial" @submit="onEditSubmit" />

    <v-snackbar v-model="snackbar.open" :color="snackbar.color" timeout="3500">{{ snackbar.text }}</v-snackbar>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useStore } from 'vuex'
import { Target, UserCog, Users, Search, X } from 'lucide-vue-next'
import HrSpaceCard from '@/components/hr/HrSpaceCard.vue'
import HrValueFormDrawer from '@/components/hr/HrValueFormDrawer.vue'
import HrSpaceEditDrawer from '@/components/hr/HrSpaceEditDrawer.vue'
import { getSpacesLight } from '@/api/endpoints/space.api'
import { resolveGoalForSpace, resolveRatioForSpace, findMonoSpaceLine } from '@/utils/hrSettings'
import { t } from '@/i18n'

const store = useStore()

const spaces = ref([])
const loading = ref(false)
const searchQuery = ref('')

const goalDrawer = reactive({ open: false })
const staffDrawer = reactive({ open: false })
const editDrawer = reactive({ open: false, space: null, initial: null })
const snackbar = reactive({ open: false, text: '', color: 'error' })

const goals = computed(() => store.getters['hrSettings/goals'])
const staffRatios = computed(() => store.getters['hrSettings/staffRatios'])

const filteredSpaces = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return spaces.value
  return spaces.value.filter((s) => (s.name || '').toLowerCase().includes(q) || (s.city || '').toLowerCase().includes(q))
})

// Valeurs résolues par espace (règle §9.4 : spécifique > TOUS, dernière gagne).
const resolvedById = computed(() => {
  const map = {}
  for (const s of spaces.value) {
    map[s.id] = {
      goal: resolveGoalForSpace(goals.value, s.id),
      ratio: resolveRatioForSpace(staffRatios.value, s.id),
    }
  }
  return map
})

function notify(text, color = 'error') {
  snackbar.text = text
  snackbar.color = color
  snackbar.open = true
}

async function loadSpaces() {
  loading.value = true
  try {
    spaces.value = await getSpacesLight()
  } catch (_) {
    notify(t('hrSettingsLoadError'))
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await Promise.all([loadSpaces(), store.dispatch('hrSettings/fetchAll').catch(() => notify(t('hrSettingsLoadError')))])
})

// ── Add drawers ───────────────────────────────────────────────────────────────
function openAddGoal() { goalDrawer.open = true }
function openAddStaff() { staffDrawer.open = true }

async function onGoalSubmit(payload) {
  try {
    await store.dispatch('hrSettings/createGoal', {
      goalPerTpe: payload.value,
      allSpaces: payload.allSpaces,
      spaceIds: payload.spaceIds,
    })
    goalDrawer.open = false
    notify(t('hrSettingsSaved'), 'success')
  } catch (_) {
    notify(t('hrSettingsSaveError'))
  }
}

async function onStaffSubmit(payload) {
  try {
    await store.dispatch('hrSettings/createRatio', {
      staffPerZoneManager: payload.value,
      allSpaces: payload.allSpaces,
      spaceIds: payload.spaceIds,
    })
    staffDrawer.open = false
    notify(t('hrSettingsSaved'), 'success')
  } catch (_) {
    notify(t('hrSettingsSaveError'))
  }
}

// ── Edit par carte (ligne mono-espace, §9.4) ──────────────────────────────────
function onCardEdit(space) {
  editDrawer.space = space
  editDrawer.initial = {
    goalPerTpe: resolvedById.value[space.id]?.goal ?? null,
    staffPerZoneManager: resolvedById.value[space.id]?.ratio ?? null,
  }
  editDrawer.open = true
}

async function upsertMono(kind, lines, spaceId, value) {
  const mono = findMonoSpaceLine(lines, spaceId)
  const valueKey = kind === 'goal' ? 'goalPerTpe' : 'staffPerZoneManager'
  const createAction = kind === 'goal' ? 'createGoal' : 'createRatio'
  const updateAction = kind === 'goal' ? 'updateGoal' : 'updateRatio'
  const removeAction = kind === 'goal' ? 'removeGoal' : 'removeRatio'

  if (value == null) {
    if (mono) await store.dispatch(`hrSettings/${removeAction}`, mono.id)
    return
  }
  if (mono) {
    await store.dispatch(`hrSettings/${updateAction}`, { id: mono.id, [valueKey]: value })
  } else {
    await store.dispatch(`hrSettings/${createAction}`, { [valueKey]: value, allSpaces: false, spaceIds: [spaceId] })
  }
}

async function onEditSubmit(payload) {
  const space = editDrawer.space
  if (!space) return
  try {
    await upsertMono('goal', goals.value, space.id, payload.goalPerTpe)
    await upsertMono('staff', staffRatios.value, space.id, payload.staffPerZoneManager)
    editDrawer.open = false
    notify(t('hrSettingsSaved'), 'success')
  } catch (_) {
    notify(t('hrSettingsSaveError'))
  }
}
</script>

<style scoped>
/* Vue rendue dans le chrome DashboardView (barre + rail), comme HrSuppliersView :
   pas de header applicatif propre. Style calqué sur .hsl-* (tokens de la charte). */
#hr-settings-page {
  background: #f4f5f7;
  height: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

/* ── Header rouge ── */
.hsl-header { background: #ff3131; box-shadow: 0 4px 20px rgba(255, 49, 49, 0.25); }
.sticky-header { position: sticky; top: 0; z-index: 100; flex-shrink: 0; }
.hsl-header__inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 28px;
  gap: 16px;
  flex-wrap: wrap;
}
.hsl-header__left { display: flex; align-items: center; gap: 14px; }
.hsl-header__icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.hsl-header__title { font-size: var(--fs-xl); font-weight: var(--fw-bold); color: #fff; margin: 0; line-height: 1.2; }
.hsl-header__subtitle { font-size: var(--fs-sm); color: rgba(255, 255, 255, 0.72); margin: 3px 0 0; }
.hsl-header__right { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.hsl-add-btn {
  display: inline-flex;
  align-items: center;
  padding: 9px 18px;
  border-radius: 100px;
  border: 2px solid rgba(255, 255, 255, 0.85);
  background: transparent;
  color: #fff;
  font-size: var(--fs-base);
  font-weight: var(--fw-bold);
  cursor: pointer;
  transition: background 0.15s;
}
.hsl-add-btn:hover { background: rgba(255, 255, 255, 0.15); }

/* ── Recherche ── */
.hsl-searchbar { background: #fff; border-bottom: 1px solid #e5e7eb; flex-shrink: 0; }
.sticky-search { position: sticky; top: 80px; z-index: 90; }
.hsl-searchbar__inner { display: flex; align-items: center; gap: 10px; padding: 12px 28px; }
.hsl-searchbar__icon { color: #9ca3af; flex-shrink: 0; }
.hsl-searchbar__input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  font-size: var(--fs-md);
  color: #111827;
  font-family: inherit;
}
.hsl-searchbar__input::placeholder { color: #9ca3af; }
.hsl-searchbar__count { font-size: var(--fs-sm); color: #9ca3af; white-space: nowrap; }
.hsl-searchbar__clear {
  background: none;
  border: none;
  padding: 2px;
  cursor: pointer;
  color: #9ca3af;
  display: flex;
  align-items: center;
  border-radius: 4px;
}
.hsl-searchbar__clear:hover { color: #ff3131; }

/* ── Contenu ── */
.hsl-content { padding: 24px 28px; }
.hrs-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 20px;
}

.hsl-empty { display: flex; flex-direction: column; align-items: center; padding: 48px 16px; text-align: center; }
.hsl-empty__icon {
  width: 72px;
  height: 72px;
  border-radius: 20px;
  background: #f3f4f6;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16px;
}
.hsl-empty__title { font-size: var(--fs-lg); font-weight: var(--fw-bold); color: #111827; margin: 0; }
</style>
