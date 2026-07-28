<template>
  <!-- Même chrome que Inventaire / Réarmement / Analyse : <v-app> local +
       WorkspaceAppHeader (cloche, réglages, avatar) ; le drawer Dashboard en
       rail pousse la page (route déclarée rail-push + self-headed). -->
  <v-app class="hr-app">
    <WorkspaceAppHeader :show-space-switcher="false" />
    <v-main>
      <div class="hr-view">
        <!-- Navigation entre sections : switcher segmenté DANS le bandeau rouge de
             chaque onglet (HrTabSwitcher), qui remonte `switch-tab` jusqu'ici. -->
        <div class="hr-pane">
          <HrSuppliersTab v-if="tab === 'suppliers'" :is-dark="isDark" @switch-tab="tab = $event" />
          <HrPositionsTab v-else :is-dark="isDark" @switch-tab="tab = $event" />
        </div>
      </div>
    </v-main>
  </v-app>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTheme } from 'vuetify'
import WorkspaceAppHeader from '@/components/WorkspaceAppHeader.vue'
import HrSuppliersTab from '@/components/hr/HrSuppliersTab.vue'
import HrPositionsTab from '@/components/hr/HrPositionsTab.vue'

const route = useRoute()
const router = useRouter()
const theme = useTheme()
const isDark = computed(() => !!theme.global.current.value.dark)

// Onglet piloté par l'URL (?tab=suppliers|positions) : le drawer Settings
// (SETTINGS_NAVIGATION) cible directement l'un ou l'autre ; le v-model des
// tabs réécrit le query sans empiler l'historique.
const tab = computed({
  get: () => (route.query.tab === 'positions' ? 'positions' : 'suppliers'),
  set: (value) => router.replace({ path: '/hr', query: { tab: value } }),
})
</script>

<style scoped>
.hr-view {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 64px); /* sous l'app-bar 64px (parité .ep-header) */
  background: #f8fafc;
}
.hr-pane {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
}
</style>
