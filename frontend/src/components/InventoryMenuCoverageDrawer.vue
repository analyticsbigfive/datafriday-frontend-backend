<template>
  <v-dialog v-model="dialog" max-width="840" scrollable>
    <v-card class="imc-card">
      <v-card-title class="d-flex align-center">
        <v-icon class="mr-2" color="primary">mdi-clipboard-check-outline</v-icon>
        <span>Vérification stocks ↔ menus</span>
        <v-spacer />
        <v-btn icon="mdi-close" variant="text" density="comfortable" @click="dialog = false" />
      </v-card-title>

      <v-card-subtitle class="imc-subtitle">
        Par point de vente : chaque menu item vendu doit être couvert par au moins
        un article de stock, et chaque article doit être compté.
      </v-card-subtitle>

      <v-card-text>
        <div class="d-flex align-center justify-space-between mb-3 flex-wrap ga-2">
          <v-chip :color="totalIssues ? 'warning' : 'success'" variant="tonal" size="small">
            <v-icon start size="16">{{ totalIssues ? 'mdi-alert' : 'mdi-check-circle' }}</v-icon>
            {{ totalIssues ? `${totalIssues} anomalie(s)` : 'Aucune anomalie' }}
          </v-chip>
          <v-switch
            v-model="showAll"
            label="Tout afficher (PdV OK inclus)"
            density="compact"
            hide-details
            color="primary"
          />
        </div>

        <v-alert v-if="!reports.length" type="info" variant="tonal" density="compact">
          Aucun point de vente à vérifier.
        </v-alert>

        <v-alert
          v-else-if="!visibleReports.length"
          type="success"
          variant="tonal"
          density="compact"
        >
          Tous les points de vente sont couverts et comptés.
        </v-alert>

        <v-expansion-panels v-else multiple variant="accordion">
          <v-expansion-panel v-for="r in visibleReports" :key="r.shopId || r.shopName">
            <v-expansion-panel-title>
              <div class="d-flex align-center ga-2 flex-wrap">
                <v-icon :color="r.ok ? 'success' : 'warning'" size="18">
                  {{ r.ok ? 'mdi-check-circle' : 'mdi-alert-circle' }}
                </v-icon>
                <strong>{{ r.shopName }}</strong>
                <v-chip
                  size="x-small"
                  variant="tonal"
                  :color="r.coveragePct === 100 ? 'success' : 'warning'"
                >
                  {{ r.coveredCount }}/{{ r.menuItemCount }} menus couverts
                </v-chip>
                <v-chip v-if="r.uncountedCount" size="x-small" variant="tonal" color="grey">
                  {{ r.uncountedCount }} non compté(s)
                </v-chip>
              </div>
            </v-expansion-panel-title>

            <v-expansion-panel-text>
              <div v-if="r.uncoveredMenuItems.length" class="mb-4">
                <p class="text-caption font-weight-bold text-warning mb-1">
                  <v-icon size="14">mdi-food-off-outline</v-icon>
                  Menu items vendus SANS article de stock ({{ r.uncoveredMenuItems.length }})
                </p>
                <v-chip
                  v-for="m in r.uncoveredMenuItems"
                  :key="m.id"
                  size="small"
                  color="warning"
                  variant="tonal"
                  class="ma-1"
                >{{ m.name }}</v-chip>
              </div>

              <div v-if="r.uncountedItems.length" class="mb-4">
                <p class="text-caption font-weight-bold mb-1">
                  <v-icon size="14">mdi-counter</v-icon>
                  Articles de stock non comptés ({{ r.uncountedItems.length }})
                </p>
                <v-chip
                  v-for="it in r.uncountedItems"
                  :key="it.id"
                  size="small"
                  variant="outlined"
                  class="ma-1"
                >{{ it.name }}</v-chip>
              </div>

              <div v-if="r.orphanItems.length" class="mb-1">
                <p class="text-caption font-weight-bold text-medium-emphasis mb-1">
                  <v-icon size="14">mdi-link-off</v-icon>
                  Articles non rattachés à un menu ({{ r.orphanItems.length }})
                </p>
                <v-chip
                  v-for="it in r.orphanItems"
                  :key="it.id"
                  size="x-small"
                  variant="text"
                  class="ma-1"
                >{{ it.name }}</v-chip>
              </div>

              <p v-if="r.ok" class="text-success text-caption mb-0">
                ✓ Tous les menu items sont couverts et comptés.
              </p>
            </v-expansion-panel-text>
          </v-expansion-panel>
        </v-expansion-panels>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script>
import { totalCoverageIssues } from '@/utils/inventoryCoverage'

export default {
  name: 'InventoryMenuCoverageDrawer',
  props: {
    modelValue: { type: Boolean, default: false },
    /** Rapports pré-calculés (cf. utils/inventoryCoverage.buildCoverageReports). */
    reports: { type: Array, default: () => [] },
  },
  emits: ['update:modelValue'],
  data() {
    return { showAll: false }
  },
  computed: {
    dialog: {
      get() { return this.modelValue },
      set(v) { this.$emit('update:modelValue', v) },
    },
    visibleReports() {
      return this.showAll ? this.reports : this.reports.filter((r) => !r.ok)
    },
    totalIssues() {
      return totalCoverageIssues(this.reports)
    },
  },
}
</script>

<style scoped>
.imc-subtitle {
  white-space: normal;
  line-height: 1.3;
}
</style>
