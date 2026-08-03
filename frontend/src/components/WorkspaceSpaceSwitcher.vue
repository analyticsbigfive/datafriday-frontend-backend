<template>
  <v-menu offset="8" :close-on-content-click="true" location="bottom start">
    <template #activator="{ props: menuProps }">
      <button
        v-bind="menuProps"
        type="button"
        class="wsh-space-trigger"
        @click="loadSpaces"
      >
        <span class="wsh-space-name">{{ spaceName || currentSpaceId }}</span>
        <ChevronDown :size="16" class="wsh-space-chevron" />
      </button>
    </template>

    <v-card class="ss-card" elevation="0">
      <div class="ss-head">
        <div class="ss-head__icon"><Building2 :size="14" /></div>
        <span class="ss-head__title">Changer d'espace</span>
        <span v-if="spacesLoaded && availableSpaces.length" class="ss-head__count">{{ availableSpaces.length }}</span>
      </div>

      <div v-if="!spacesLoading && availableSpaces.length > 1" class="ss-search">
        <v-text-field
          v-model="spacesSearch"
          density="compact"
          variant="outlined"
          hide-details
          clearable
          placeholder="Rechercher un espace…"
          prepend-inner-icon="mdi-magnify"
          rounded="pill"
          class="wsh-space-search"
          @click.stop
        />
      </div>

      <div class="ss-scroll">
        <div v-if="spacesLoading" class="ss-state">
          <v-progress-circular indeterminate size="16" width="2" color="#ff3131" class="mr-2" />
          Chargement…
        </div>
        <template v-else>
          <button
            v-for="s in filteredSpaces"
            :key="s.id"
            type="button"
            class="ss-item"
            :class="{ 'ss-item--active': String(s.id) === String(currentSpaceId) }"
            @click="switchSpace(s)"
          >
            <span class="ss-item__name">{{ s.name || s.spaceName || s.id }}</span>
            <Check v-if="String(s.id) === String(currentSpaceId)" :size="15" class="ss-item__check" />
          </button>
          <div v-if="availableSpaces.length === 0" class="ss-state ss-state--muted">Aucun espace disponible</div>
          <div v-else-if="filteredSpaces.length === 0" class="ss-state ss-state--muted">Aucun espace trouvé</div>
        </template>
      </div>

      <button type="button" class="ss-footer" @click="router.push('/spaces')">
        <LayoutGrid :size="16" />
        <span>Tous les espaces</span>
      </button>
    </v-card>
  </v-menu>
</template>

<script setup>
// Sélecteur d'espace réutilisable (design AnalyseView / AnalyseAppHeader) qui
// reste sur la MÊME route en changeant juste le spaceId. Utilisé tel quel comme
// enfant du header — JAMAIS téléporté (le teleport d'un v-menu plante ici).
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Building2, Check, ChevronDown, LayoutGrid } from 'lucide-vue-next'
import { getAllSpaces } from '@/api/endpoints/space.api'
import { clearDemoMode } from '@/utils/demoMode'

defineProps({
  spaceName: { type: String, default: '' },
})

const route = useRoute()
const router = useRouter()

const currentSpaceId = computed(() => route.params?.spaceId)

const availableSpaces = ref([])
const spacesLoading = ref(false)
const spacesLoaded = ref(false)
const spacesSearch = ref('')

const filteredSpaces = computed(() => {
  const q = spacesSearch.value.toLowerCase().trim()
  if (!q) return availableSpaces.value
  return availableSpaces.value.filter((s) =>
    String(s.name || s.spaceName || s.id).toLowerCase().includes(q),
  )
})

async function loadSpaces() {
  if (spacesLoaded.value || spacesLoading.value) return
  spacesLoading.value = true
  try {
    const data = await getAllSpaces()
    availableSpaces.value = Array.isArray(data) ? data : (data?.data ?? data?.spaces ?? [])
    spacesLoaded.value = true
  } catch {
    availableSpaces.value = []
  } finally {
    spacesLoading.value = false
  }
}

function switchSpace(space) {
  const id = space?.id ?? space?.spaceId
  if (!id || String(id) === String(currentSpaceId.value)) return
  clearDemoMode()
  // Reste sur la MÊME route en changeant le spaceId ; repli analyse si la route
  // courante ne porte pas de param :spaceId.
  const targetName = route.params?.spaceId ? route.name : 'space-analyse'
  router.push({ name: targetName, params: { ...route.params, spaceId: id } })
}
</script>

<style scoped>
.wsh-space-trigger {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 0;
  background: transparent;
  padding: 4px 8px;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 700;
  font-size: 1.02rem;
  color: rgb(var(--v-theme-on-surface));
  max-width: min(48vw, 280px);
  transition: background-color 120ms ease;
}
.wsh-space-trigger:hover { background-color: rgba(var(--v-theme-on-surface), 0.06); }
.wsh-space-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.wsh-space-chevron { color: rgba(var(--v-theme-on-surface), 0.6); flex-shrink: 0; }

/* ── Dropdown (design AnalyseView) ── */
.ss-card {
  width: 300px;
  border-radius: 14px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.1);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.14);
  overflow: hidden;
  padding: 6px;
}
.ss-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 8px 6px;
}
.ss-head__icon {
  width: 24px;
  height: 24px;
  border-radius: 7px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 49, 49, 0.1);
  color: #ff3131;
  flex-shrink: 0;
}
.ss-head__title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: rgba(var(--v-theme-on-surface), 0.55);
}
.ss-head__count {
  margin-left: auto;
  font-size: 11px;
  font-weight: 700;
  color: #ff3131;
  background: rgba(255, 49, 49, 0.1);
  border-radius: 20px;
  padding: 1px 8px;
}
.ss-search { padding: 2px 4px 6px; }
.wsh-space-search :deep(.v-field) {
  border-radius: 50px;
  border: 1.5px solid #e5e7eb;
  background: #f9fafb;
  box-shadow: none;
}
.wsh-space-search :deep(.v-field__outline) { display: none; }
.wsh-space-search :deep(.v-field--focused) { border-color: #ff3131; }
/* BUG-282 : seul élément du fichier resté en littéraux clairs (le reste suit
   rgb(var(--v-theme-*))) — accroché à .dark (posé sur <html>) par cohérence. */
.dark .wsh-space-search :deep(.v-field) {
  border-color: rgba(255, 255, 255, 0.14);
  background: #1a2332;
}
.dark .wsh-space-search :deep(.v-field--focused) { border-color: #ff3131; }
.ss-scroll {
  max-height: 280px;
  overflow-y: auto;
  padding: 2px;
}
.ss-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 10px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition: background-color 0.14s ease, color 0.14s ease;
}
.ss-item__name {
  flex: 1;
  min-width: 0;
  font-size: 13.5px;
  font-weight: 500;
  color: rgb(var(--v-theme-on-surface));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ss-item:hover { background: rgba(var(--v-theme-on-surface), 0.05); }
.ss-item--active { background: rgba(255, 49, 49, 0.08); }
.ss-item--active .ss-item__name { color: #ff3131; font-weight: 700; }
.ss-item__check { color: #ff3131; flex-shrink: 0; }
.ss-state {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  font-size: 13px;
  color: rgba(var(--v-theme-on-surface), 0.7);
}
.ss-state--muted { color: rgba(var(--v-theme-on-surface), 0.45); }
.ss-footer {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px;
  margin-top: 4px;
  border: 0;
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  background: transparent;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), 0.8);
  transition: background-color 0.14s ease, color 0.14s ease;
}
.ss-footer:hover { background: rgba(255, 49, 49, 0.06); color: #ff3131; }
</style>
