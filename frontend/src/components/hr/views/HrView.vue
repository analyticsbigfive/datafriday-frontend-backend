<template>
  <!-- Même chrome que Inventaire / Réarmement / Analyse : <v-app> local +
       WorkspaceAppHeader (cloche, réglages, avatar) ; le drawer Dashboard en
       rail pousse la page (route déclarée rail-push + self-headed). -->
  <v-app class="hr-app">
    <WorkspaceAppHeader :section="t('navEditHR')" :show-space-switcher="false" show-home />
    <v-main>
      <div class="hr-view">
        <v-tabs
          v-model="tab"
          color="#ff3131"
          density="comfortable"
          class="hr-tabs"
        >
          <v-tab value="suppliers">{{ t('navHrSuppliers') }}</v-tab>
          <v-tab value="positions">{{ t('navHrPositions') }}</v-tab>
        </v-tabs>

        <div class="hr-pane">
          <HrSuppliersTab v-if="tab === 'suppliers'" />
          <HrPositionsTab v-else />
        </div>
      </div>
    </v-main>
  </v-app>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { t } from '@/i18n'
import WorkspaceAppHeader from '@/components/WorkspaceAppHeader.vue'
import HrSuppliersTab from '@/components/hr/HrSuppliersTab.vue'
import HrPositionsTab from '@/components/hr/HrPositionsTab.vue'

const route = useRoute()
const router = useRouter()

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
.hr-tabs {
  flex: 0 0 auto;
  border-bottom: 1px solid #e2e8f0;
  background: #ffffff;
}
.hr-pane {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
}
</style>
