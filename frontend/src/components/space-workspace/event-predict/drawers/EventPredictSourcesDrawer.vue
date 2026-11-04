<template>
  <EventDrawerShell
    :model-value="modelValue"
    :title="t('epsdTitle')"
    :subtitle="t('epsdSubtitle')"
    :is-dark="isDark"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <template #icon>
      <v-icon color="white" size="21">mdi-calendar-filter-outline</v-icon>
    </template>

    <div class="eps-drawer-scroll">
          <!-- 1) Sélection de l'algo (top 10 par score) -->
          <p class="eps-section-label">
            {{ t('epsdSelectedByAlgo') }}
            <span class="eps-section-count">{{ scoredEvents.length }}</span>
          </p>
          <label
            v-for="(se, i) in scoredEvents"
            :key="se.event.id"
            class="eps-source-row"
            :class="{ 'is-checked': checked.has(se.event.id) }"
          >
            <input
              type="checkbox"
              class="eps-source-checkbox"
              :checked="checked.has(se.event.id)"
              @change="toggle(se.event.id)"
            />
            <span class="eps-source-main">
              <span class="eps-source-head">
                <span class="eps-source-title-wrap">
                  <span class="eps-source-title">{{ se.event.eventName || se.event.name }}</span>
                  <span class="eps-top-badge">TOP {{ i + 1 }}</span>
                </span>
                <span class="eps-source-date">{{ eventDateLabel(se.event) }}</span>
              </span>
              <span class="eps-source-metrics">
                <span class="eps-source-metric">
                  <span>{{ t('epsdWeight') }}</span>
                  <strong>{{ weightLabel(se) }}</strong>
                </span>
                <span class="eps-source-metric">
                  <span>{{ t('epsdRevenue') }}</span>
                  <strong>{{ formatCurrency(se.ca) }}</strong>
                </span>
                <span class="eps-source-metric">
                  <span>{{ t('epsdPerCap') }}</span>
                  <strong>{{ perCapLabel(se) }}</strong>
                </span>
                <span class="eps-source-metric">
                  <span>{{ t('epsdScanned') }}</span>
                  <strong>{{ scannedLabel(se) }}</strong>
                </span>
              </span>
            </span>
          </label>
          <p v-if="!scoredEvents.length" class="eps-empty">
            {{ t('epsdNoAlgoEvent') }}
          </p>

          <!-- 2) Non sélectionnés (écartés ou hors top 10), cochables à la main -->
          <p class="eps-section-label mt-4">
            {{ t('epsdUnselected') }}
            <span class="eps-section-count">{{ unselectedEvents.length }}</span>
          </p>
          <label
            v-for="u in unselectedEvents"
            :key="u.event.id"
            class="eps-source-row eps-source-row--unselected"
            :class="{ 'is-checked': checked.has(u.event.id) }"
          >
            <input
              type="checkbox"
              class="eps-source-checkbox"
              :checked="checked.has(u.event.id)"
              @change="toggle(u.event.id)"
            />
            <span class="eps-source-main">
              <span class="eps-source-head">
                <span class="eps-source-title-wrap">
                  <span class="eps-source-title">{{ u.event.eventName || u.event.name }}</span>
                </span>
                <span class="eps-source-date">{{ eventDateLabel(u.event) }}</span>
              </span>
              <span class="eps-source-metrics">
                <span v-if="checked.has(u.event.id)" class="eps-source-metric">
                  <span>{{ t('epsdWeight') }}</span>
                  <strong>{{ weightLabel(u) }}</strong>
                </span>
                <span class="eps-source-metric">
                  <span>{{ t('epsdRevenue') }}</span>
                  <strong>{{ formatCurrency(u.ca) }}</strong>
                </span>
                <span class="eps-source-metric">
                  <span>{{ t('epsdPerCap') }}</span>
                  <strong>{{ perCapLabel(u) }}</strong>
                </span>
                <span class="eps-source-metric">
                  <span>{{ t('epsdScanned') }}</span>
                  <strong>{{ scannedLabel(u) }}</strong>
                </span>
              </span>
              <span class="eps-source-reason">{{ u.reason }}</span>
            </span>
          </label>
          <p v-if="!unselectedEvents.length" class="eps-empty">
            {{ t('epsdNoOtherPastEvent') }}
          </p>
    </div>

    <template #footer>
      <span class="eps-footer-count">
        {{ checked.size }} {{ checked.size > 1 ? t('epsdSelectedPlural') : t('epsdSelectedSingular') }}
      </span>
      <div class="eps-footer-actions">
        <button
          type="button"
          class="eps-footer-btn eps-footer-btn--cancel"
          @click="$emit('update:modelValue', false)"
        >
          {{ t('cancel') }}
        </button>
        <button
          type="button"
          class="eps-footer-btn eps-footer-btn--primary"
          :disabled="checked.size === 0 || loading"
          @click="apply"
        >
          <v-progress-circular v-if="loading" indeterminate size="14" width="2" />
          {{ loading ? t('epsdRecalculating') : t('epsdSaveRecalculate') }}
        </button>
      </div>
    </template>
  </EventDrawerShell>
</template>

<script>
import { computed } from 'vue'
import { useTheme } from 'vuetify'
import EventDrawerShell from '@/components/events/drawers/EventDrawerShell.vue'
import { useI18n } from '@/i18n/useI18n'
import {
  formatCurrency as fmtCurrency,
  formatCurrencyDetailed as fmtCurrencyDetailed,
  formatNumber as fmtNumber,
} from '@/composables/useFormatters'
import { formatDateShort as fmtDateShort } from '@/utils/dateFr'

/**
 * Drawer de sélection des évènements passés sources de la prédiction.
 * Même composant tiroir que le reste de l'app (v-navigation-drawer temporary,
 * pattern EventDetailsEditor / InventoryFilterDrawer). État local `checked`
 * (copie de travail) : rien n'est appliqué avant « Sauvegarder & Recalculer »
 * — le parent relance alors la timeline via overridePredictionIds (recalcul
 * partiel : timelines déjà en cache REST, aucun fetch réseau).
 */
export default {
  name: 'EventPredictSourcesDrawer',
  components: { EventDrawerShell },
  setup() {
    const { t } = useI18n()
    const theme = useTheme()
    const isDark = computed(() => !!theme.global.current.value.dark)
    return { t, isDark }
  },
  props: {
    modelValue: { type: Boolean, default: false },
    /**
     * Top 10 scorés par l'algo, enrichis côté parent (`drawerScoredEvents`) :
     * { event, score, maxPossibleScore, ca, perCap, ticketsScanned }.
     * `score` sert encore au calcul du poids affiché (§7) même s'il n'est plus
     * montré : seuls poids / CA / per-cap / billets scannés sont affichés.
     */
    scoredEvents: { type: Array, default: () => [] },
    /** Candidats non retenus : mêmes objets + `reason` (hors top 10, écarté, ad hoc…). */
    unselectedEvents: { type: Array, default: () => [] },
    /** Ids actuellement appliqués à la prédiction. */
    selectedIds: { type: Array, default: () => [] },
    loading: { type: Boolean, default: false },
  },
  emits: ['update:modelValue', 'apply'],
  data() {
    return { checked: new Set() };
  },
  computed: {
    /** Σ scores des évènements cochés → poids affiché = score ÷ total (formule §7). */
    totalCheckedScore() {
      let total = 0;
      for (const se of [...this.scoredEvents, ...this.unselectedEvents]) {
        if (this.checked.has(se.event.id)) total += se.score || 0;
      }
      return total;
    },
  },
  watch: {
    // Copie de travail resynchronisée à chaque ouverture (annuler = sans effet).
    modelValue(open) {
      if (open) this.checked = new Set(this.selectedIds);
    },
  },
  methods: {
    toggle(id) {
      const next = new Set(this.checked);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      this.checked = next;
    },
    formatDateShort(v) {
      return fmtDateShort(v);
    },
    /** « 12 oct. · 20:30 » : date courte + heure du spectacle si connue (même rendu pour toutes les lignes). */
    eventDateLabel(event) {
      const date = fmtDateShort(event?.eventDate);
      const time = event?.sessions?.[0]?.showTime;
      return time ? `${date} · ${time}` : date;
    },
    /**
     * CA réel de l'évènement passé — KPI/total ⇒ sans décimale (charte).
     * Pas de coercition `|| 0` : `formatCurrency` rend déjà « — » pour null
     * (CA inconnu ≠ CA nul, cf. `withDrawerMetrics` côté parent).
     */
    formatCurrency(v) {
      return fmtCurrency(v);
    },
    /** Per-cap = CA ÷ billets scannés ⇒ 2 décimales, comme les cards Summary. */
    perCapLabel(se) {
      if (se?.perCap == null) return '—';
      return fmtCurrencyDetailed(Number(se.perCap));
    },
    scannedLabel(se) {
      if (!se?.ticketsScanned) return '—';
      return fmtNumber(se.ticketsScanned);
    },
    weightLabel(se) {
      if (!this.checked.has(se.event.id)) return this.t('epsdExcluded');
      const total = this.totalCheckedScore;
      if (!total) return '—';
      return (((se.score || 0) / total) * 100).toFixed(1) + '%';
    },
    apply() {
      this.$emit('apply', Array.from(this.checked));
    },
  },
};
</script>

<style scoped>
.eps-drawer-scroll {
  min-height: 100%;
}
.eps-section-label {
  font-size: var(--fs-xs);
  font-weight: var(--fw-bold);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--muted-foreground, #6b7280);
  margin: 0 0 0.5rem;
}
.eps-section-count {
  display: inline-block;
  margin-left: 0.25rem;
  padding: 0 0.375rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--muted-foreground, #6b7280) 12%, transparent);
}
.eps-source-row {
  display: flex;
  align-items: flex-start;
  gap: 0.625rem;
  padding: 0.625rem 0.75rem;
  margin-bottom: 0.5rem;
  /* Même carte que .agg-item (InventoryAggregateView) : fond opaque, jamais le gris du drawer. */
  --eps-card-bg: #fff;
  --eps-card-border: #e5e7eb;
  --eps-card-border-hover: #d1d5db;
  border: 1px solid var(--eps-card-border);
  border-radius: 10px;
  cursor: pointer;
  background: var(--eps-card-bg);
  transition: border-color 160ms ease, box-shadow 160ms ease;
}
.eps-source-row:hover {
  border-color: var(--eps-card-border-hover);
  box-shadow: 0 3px 12px rgba(15, 23, 42, 0.05);
}
.eps-source-row.is-checked {
  border-color: color-mix(in srgb, #ff3131 45%, var(--eps-card-bg));
  background: linear-gradient(color-mix(in srgb, #ff3131 5%, transparent), color-mix(in srgb, #ff3131 5%, transparent)), var(--eps-card-bg);
}
.eps-source-checkbox {
  margin-top: 0.2rem;
  accent-color: #ff3131;
}
.eps-source-main {
  flex: 1;
  min-width: 0;
}
.eps-source-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.eps-source-title-wrap {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  min-width: 0;
}
.eps-source-title {
  font-size: var(--fs-base);
  font-weight: var(--fw-semibold);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.eps-top-badge {
  padding: 0 0.375rem;
  border-radius: 999px;
  font-size: var(--fs-xs);
  font-weight: var(--fw-bold);
  color: #ff3131;
  background: color-mix(in srgb, #ff3131 12%, transparent);
  white-space: nowrap;
}
.eps-source-date {
  font-size: var(--fs-xs);
  color: var(--muted-foreground, #6b7280);
  white-space: nowrap;
}
.eps-source-metrics {
  display: flex;
  gap: 1rem;
  margin-top: 0.25rem;
  flex-wrap: wrap;
}
.eps-source-metric {
  display: inline-flex;
  gap: 0.25rem;
  align-items: baseline;
  font-size: var(--fs-xs);
  color: var(--muted-foreground, #6b7280);
}
.eps-source-metric strong {
  color: var(--foreground, inherit);
}
.eps-source-reason {
  display: block;
  margin-top: 0.375rem;
  font-size: var(--fs-xs);
  font-style: italic;
  color: var(--muted-foreground, #6b7280);
}
.eps-empty {
  font-size: var(--fs-sm);
  color: var(--muted-foreground, #6b7280);
  margin: 0 0 0.5rem;
}
.eps-footer-count {
  font-size: var(--fs-sm);
  color: var(--muted-foreground, #6b7280);
  margin-right: auto;
}
.eps-footer-actions {
  display: flex;
  gap: 10px;
}
.eps-footer-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 42px;
  padding: 0 20px;
  border-radius: 999px;
  border: 0;
  cursor: pointer;
  font-size: var(--fs-base);
  font-weight: var(--fw-semibold);
  transition: all 0.2s;
}
.eps-footer-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.eps-footer-btn--cancel {
  border: 1.5px solid var(--fb-border, #e5e7eb);
  background: #f3f4f6;
  color: #374151;
}
.eps-footer-btn--cancel:hover {
  background: #e5e7eb;
}
.eps-footer-btn--primary {
  background: #ff3131;
  color: #fff;
  box-shadow: 0 4px 14px rgba(255, 49, 49, 0.3);
}
.eps-footer-btn--primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 18px rgba(255, 49, 49, 0.4);
}

/* ===================== DARK MODE =====================
   Le drawer est TÉLÉPORTÉ dans <body> (EventDrawerShell) : ses `var(--foreground/
   --muted-foreground/--border/--card, …)` ne peuvent pas hériter des `--fb-*` de
   l'overlay parent → ils retombaient sur leur littéral clair. Le shell peint déjà
   le fond en sombre via `.eds--dark` (fond #111827) ; on redéfinit ici ces tokens
   sur la racine slottée pour que tout le contenu suive, et on traite le bouton
   Annuler (couleurs en dur). Le rouge de marque #ff3131 est conservé. */
.eds--dark .eps-drawer-scroll {
  --muted-foreground: #94a3b8;
  --border: #374151;
  --foreground: #f9fafb;
  color: #e5e7eb;
}
.eds--dark .eps-source-row {
  --eps-card-bg: #1f2937;
  --eps-card-border: #374151;
  --eps-card-border-hover: #4b5563;
  box-shadow: none;
}
.eds--dark .eps-footer-count {
  color: #94a3b8;
}
.eds--dark .eps-footer-btn--cancel {
  border-color: rgba(255, 255, 255, 0.14);
  background: #1f2937;
  color: #e2e8f0;
}
.eds--dark .eps-footer-btn--cancel:hover {
  background: #374151;
}
</style>
