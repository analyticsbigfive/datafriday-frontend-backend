<template>
  <!-- Sélecteur de réarmement : liste des évènements PRÉDITS (qui ont une
       prévision/version sauvegardée dans Event Predict), sélection UNIQUE, +
       choix du scénario (version) + date de l'évènement. Remplace l'ancien
       calendrier. Utilisé en desktop et en sheet mobile (DRY). -->
  <div class="resp">
    <div v-if="!events.length" class="resp-empty">
      Aucun évènement prédit. Créez une prévision dans Event Predict.
    </div>

    <v-radio-group
      v-else
      :model-value="selectedEventId"
      hide-details
      density="compact"
      class="resp-list"
      @update:model-value="$emit('select-event', $event)"
    >
      <div
        v-for="ev in events"
        :key="ev.id"
        class="resp-item"
        :class="{ 'is-selected': ev.id === selectedEventId }"
      >
        <v-radio :value="ev.id" class="resp-radio">
          <template #label>
            <span class="resp-main">
              <span class="resp-name">{{ ev.name }}</span>
              <span class="resp-meta">
                {{ ev.dateLabel }}
                <span v-if="ev.showTime"> · {{ ev.showTime }}</span>
                <span v-if="ev.configName"> · {{ ev.configName }}</span>
              </span>
            </span>
          </template>
        </v-radio>

        <!-- Scénarios : cartes (mirror EventPredict « Saved Versions ») —
             radio custom + nom + badge Active + stats revenue/units. -->
        <div v-if="ev.id === selectedEventId && ev.scenarios.length" class="resp-scenarios">
          <span class="resp-scenarios-label">Scénario</span>
          <div class="resp-scenario-cards">
            <div
              v-for="sc in ev.scenarios"
              :key="sc.id"
              class="resp-scenario-card"
              :class="{ 'is-active': selectedScenarioByEventId[ev.id] === sc.id }"
              role="button"
              tabindex="0"
              @click="$emit('select-scenario', ev.id, sc.id)"
              @keydown.enter.prevent="$emit('select-scenario', ev.id, sc.id)"
              @keydown.space.prevent="$emit('select-scenario', ev.id, sc.id)"
            >
              <div class="resp-scenario-head">
                <span
                  class="resp-scenario-radio-btn"
                  :class="{ 'is-checked': selectedScenarioByEventId[ev.id] === sc.id }"
                >
                  <span
                    v-if="selectedScenarioByEventId[ev.id] === sc.id"
                    class="resp-scenario-radio-dot"
                  />
                </span>
                <span class="resp-scenario-name">{{ sc.name }}</span>
                <span
                  v-if="selectedScenarioByEventId[ev.id] === sc.id"
                  class="resp-scenario-badge"
                >Active</span>
              </div>
              <div v-if="sc.revenue != null || sc.units > 0" class="resp-scenario-stats">
                <div v-if="sc.revenue != null" class="resp-scenario-stat-row">
                  <span class="resp-muted">{{ t('srScenarioRevenue') }}</span>
                  <span class="resp-scenario-stat-val">{{ formatRevenue(sc.revenue) }}</span>
                </div>
                <div v-if="sc.units > 0" class="resp-scenario-stat-row">
                  <span class="resp-muted">{{ t('srScenarioUnits') }}</span>
                  <span class="resp-scenario-stat-val">{{ sc.units.toLocaleString('fr-FR') }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div
          v-else-if="ev.id === selectedEventId && !ev.scenarios.length"
          class="resp-noscenario"
        >
          Prédiction courante (aucun scénario sauvegardé).
        </div>
      </div>
    </v-radio-group>
  </div>
</template>

<script setup>
import { useI18n } from '@/i18n/useI18n'

const { t } = useI18n()

defineProps({
  // Évènements prédits enrichis : { id, name, dateLabel, showTime, configName,
  //   date, scenarios: [{ id, name, revenue, units }] }.
  events: { type: Array, default: () => [] },
  selectedEventId: { type: String, default: null },
  selectedScenarioByEventId: { type: Object, default: () => ({}) },
})

defineEmits(['select-event', 'select-scenario'])

function formatRevenue(n) {
  const v = Number(n) || 0
  return `€${v.toLocaleString('fr-FR', { maximumFractionDigits: 0 })}`
}
</script>

<style scoped>
.resp { display: flex; flex-direction: column; gap: 8px; }
.resp-empty {
  font-size: 0.8125rem;
  color: var(--muted-foreground, #6b7280);
  text-align: center;
  padding: 16px 8px;
}
.resp-list { margin: 0; }
.resp-item {
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 10px;
  padding: 6px 10px;
  margin-bottom: 8px;
  transition: border-color 120ms, background 120ms;
}
.resp-item.is-selected {
  border-color: var(--primary, #ff3131);
  background: #fff5f5;
}
.resp-main { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.resp-name { font-size: 0.875rem; font-weight: 600; }
.resp-meta { font-size: 0.75rem; color: var(--muted-foreground, #6b7280); }
.resp-scenarios {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 4px 0 2px 28px;
}
.resp-scenarios-label {
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--muted-foreground, #6b7280);
}
/* Cartes de scénarios — mirror EventPredict « Saved Versions »
   (radio custom + nom + badge Active + stats). */
.resp-scenario-cards {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.resp-scenario-card {
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 12px;
  background: var(--muted, #f9fafb);
  padding: 10px 12px;
  cursor: pointer;
  transition: border-color 120ms, box-shadow 120ms, background 120ms;
}
.resp-scenario-card:hover {
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.06);
}
.resp-scenario-card.is-active {
  border-color: var(--primary, #ff3131);
  background: #fff5f5;
}
.resp-scenario-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.resp-scenario-radio-btn {
  width: 16px;
  height: 16px;
  border-radius: 999px;
  border: 2px solid #d1d5db;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: border-color 120ms;
}
.resp-scenario-card.is-active .resp-scenario-radio-btn {
  border-color: var(--primary, #ff3131);
}
.resp-scenario-radio-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--primary, #ff3131);
}
.resp-scenario-name {
  font-size: 0.875rem;
  font-weight: 600;
  flex: 1 1 auto;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.resp-scenario-badge {
  margin-left: 6px;
  background: var(--primary, #ff3131);
  color: #fff;
  font-weight: 700;
  padding: 1px 8px;
  font-size: 0.6875rem;
  border-radius: 999px;
  white-space: nowrap;
}
.resp-scenario-stats {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 6px;
}
.resp-scenario-stat-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.75rem;
}
.resp-muted {
  color: var(--muted-foreground, #6b7280);
}
.resp-scenario-stat-val {
  font-weight: 500;
}
.resp-noscenario {
  font-size: 0.6875rem;
  color: var(--muted-foreground, #6b7280);
  margin: 2px 0 2px 28px;
}

.resp-item,
.resp-scenario-card {
  border-color: var(--fb-border, #E5E7EB);
  border-radius: var(--fb-radius-control, 8px);
  background: var(--fb-surface, #FFFFFF);
}
.resp-item.is-selected,
.resp-scenario-card.is-active {
  border-color: rgba(255, 49, 49, 0.34);
  background: var(--fb-primary-soft, #FFF5F5);
}
.resp-scenario-card:hover {
  border-color: rgba(255, 49, 49, 0.26);
  box-shadow: var(--fb-shadow-card, 0 1px 3px rgba(15, 23, 42, 0.05));
}
.resp-scenario-card:focus-visible,
.resp-item:focus-visible {
  outline: 3px solid rgba(255, 49, 49, 0.18);
  outline-offset: 2px;
}
.resp-name,
.resp-scenario-name,
.resp-scenario-stat-val {
  color: var(--fb-text, #212121);
}
.resp-meta,
.resp-muted,
.resp-noscenario {
  color: var(--fb-muted, #6B7280);
}
.resp-scenario-stat-val {
  font-variant-numeric: tabular-nums;
}
</style>
