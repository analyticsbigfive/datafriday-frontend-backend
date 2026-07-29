<template>
  <!-- Settings HR (maquettes Bertrand) — vue façon « My Spaces » SANS bandeau
       revenue : chaque carte porte des métriques RH + un bouton Edit ; 2 boutons
       « Add » ouvrent les drawers Goal / Staff. Même chrome + bandeau rouge que
       les onglets HR Suppliers / Staff Positions (pattern hr-banner, hrForms.css). -->
  <v-app class="hrs-app">
    <WorkspaceAppHeader :show-space-switcher="false" />
    <v-main>
      <div class="hrs-view" :class="{ 'hrs--dark': isDark }">

        <!-- Bandeau rouge (pattern Settings, parité HrSuppliersTab) -->
        <div class="hr-banner">
          <div class="hr-banner__icon"><UserCog :size="24" color="white" /></div>
          <div class="hr-banner__titles">
            <div class="hr-banner__title">{{ t('hrSettingsTitle') }}</div>
            <p class="hr-banner__subtitle">{{ t('hrSettingsSubtitle') }}</p>
          </div>
          <div class="hr-banner__actions">
            <button class="hr-banner__btn" @click="openAddGoal"><Target :size="15" /> {{ t('hrAddGoal') }}</button>
            <button class="hr-banner__btn hr-banner__btn--primary" @click="openAddStaff"><Users :size="15" /> {{ t('hrAddStaffRatio') }}</button>
          </div>
        </div>

        <!-- Recherche (pleine largeur, collée sous le bandeau) -->
        <div class="hr-searchbar">
          <Search :size="18" class="hr-searchbar__icon" />
          <input v-model="search" class="hr-searchbar__input" type="search" :placeholder="t('hrSettingsSearch')" />
          <span class="hr-searchbar__count">{{ filteredSpaces.length }} {{ t('hrColSpaces') }}</span>
          <button v-if="search" class="hr-searchbar__clear" :aria-label="t('hrCancel')" @click="search = ''"><X :size="16" /></button>
        </div>

        <!-- Grille de cartes -->
        <div class="hrs-scroll">
          <div v-if="loading" class="hrs-empty">{{ t('hrSettingsLoading') }}</div>
          <div v-else-if="!filteredSpaces.length" class="hrs-empty">{{ t('hrSettingsEmpty') }}</div>
          <div v-else class="hrs-grid">
            <HrSpaceCard
              v-for="s in filteredSpaces"
              :key="s.id"
              :space="s"
              :goal-per-tpe="resolvedById[s.id]?.goal ?? null"
              :staff-per-zone-manager="resolvedById[s.id]?.ratio ?? null"
              :is-dark="isDark"
              @edit="onCardEdit"
            />
          </div>
        </div>
      </div>
    </v-main>

    <!-- Drawers -->
    <HrValueFormDrawer
      v-model="goalDrawer.open"
      kind="goal"
      :spaces="spaces"
      :is-dark="isDark"
      @submit="onGoalSubmit"
    />
    <HrValueFormDrawer
      v-model="staffDrawer.open"
      kind="staff"
      :spaces="spaces"
      :is-dark="isDark"
      @submit="onStaffSubmit"
    />
    <HrSpaceEditDrawer
      v-model="editDrawer.open"
      :space="editDrawer.space"
      :initial="editDrawer.initial"
      :is-dark="isDark"
      @submit="onEditSubmit"
    />

    <v-snackbar v-model="snackbar.open" :color="snackbar.color" timeout="3500">{{ snackbar.text }}</v-snackbar>
  </v-app>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useStore } from 'vuex'
import { useTheme } from 'vuetify'
import { Target, UserCog, Users, Search, X } from 'lucide-vue-next'
import WorkspaceAppHeader from '@/components/WorkspaceAppHeader.vue'
import HrSpaceCard from '@/components/hr/HrSpaceCard.vue'
import HrValueFormDrawer from '@/components/hr/HrValueFormDrawer.vue'
import HrSpaceEditDrawer from '@/components/hr/HrSpaceEditDrawer.vue'
import { getSpacesLight } from '@/api/endpoints/space.api'
import { resolveGoalForSpace, resolveRatioForSpace, findMonoSpaceLine } from '@/utils/hrSettings'
import { t } from '@/i18n'
import '@/components/hr/hrForms.css'

const store = useStore()
const theme = useTheme()
const isDark = computed(() => !!theme.global.current.value.dark)

const spaces = ref([])
const loading = ref(false)
const search = ref('')

const goalDrawer = reactive({ open: false })
const staffDrawer = reactive({ open: false })
const editDrawer = reactive({ open: false, space: null, initial: null })
const snackbar = reactive({ open: false, text: '', color: 'error' })

const goals = computed(() => store.getters['hrSettings/goals'])
const staffRatios = computed(() => store.getters['hrSettings/staffRatios'])

const filteredSpaces = computed(() => {
  const q = search.value.trim().toLowerCase()
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

// Upsert/suppression de la ligne mono-espace pour une des 2 variables.
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
    await store.dispatch(`hrSettings/${createAction}`, {
      [valueKey]: value,
      allSpaces: false,
      spaceIds: [spaceId],
    })
  }
}

async function onEditSubmit(payload) {
  const space = editDrawer.space
  if (!space) return
  try {
    // Séquentiel : chaque action refetch, on évite les courses sur le store.
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
.hrs-view {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 64px);
  background: #f8fafc;
}
.hrs--dark { background: #0f172a; }

/* Bandeau rouge PLEINE LARGEUR (bords à bords) ; on ajoute uniquement un espace
   AU-DESSUS de son contenu (icône / titre / boutons) — demande utilisateur
   (margin-top du contenu, via padding-top du bandeau). */
.hrs-view :deep(.hr-banner) {
  padding-top: 32px;
}

.hrs-scroll { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 22px; }
.hrs-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 20px;
}
.hrs-empty { text-align: center; color: #94a3b8; padding: 60px 0; font-size: var(--fs-md); }
</style>
