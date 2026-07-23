<template>
  <div class="ws-wrap" :class="{ 'ws--dark': isDark }">

    <!-- Gradient success header -->
    <div class="ws-hero">
      <div class="ws-hero__icon-badge">
        <CheckCircle :size="28" color="white" />
      </div>
      <div class="ws-hero__body">
        <div class="ws-hero__title">{{ locationName }} {{ t('intgSuccessReady') }}</div>
        <div class="ws-hero__sub">{{ t('intgSuccessSub') }}</div>
      </div>
    </div>

    <!-- Summary stats -->
    <div class="ws-section-label">{{ t('intgSuccessSummaryLabel') }}</div>
    <div class="ws-stats">
      <div class="ws-stat-card">
        <div class="ws-stat-card__value">{{ summary.merchants }}</div>
        <div class="ws-stat-card__label">{{ t('intgSuccessMerchants') }}</div>
      </div>
      <div class="ws-stat-card">
        <div class="ws-stat-card__value">{{ summary.products }}</div>
        <div class="ws-stat-card__label">{{ t('intgSuccessProducts') }}</div>
      </div>
      <div v-if="!isDigifood" class="ws-stat-card">
        <div class="ws-stat-card__value">{{ summary.events }}</div>
        <div class="ws-stat-card__label">{{ t('intgSuccessEvents') }}</div>
      </div>
    </div>

    <!-- Other locations to configure -->
    <div v-if="otherLocations.length > 0" class="ws-other-card">
      <div class="ws-other-card__icon">
        <MapPin :size="18" color="#ff3131" />
      </div>
      <div class="ws-other-card__content">
        <div class="ws-other-card__title">
          {{ otherLocations.length }} {{ otherLocations.length > 1 ? t('intgSuccessOtherLocationsPlural') : t('intgSuccessOtherLocationsSingular') }}
        </div>
        <div v-for="loc in otherLocations.slice(0, 3)" :key="loc.id" class="ws-other-card__loc">
          {{ loc.name }} ({{ loc.completedSteps || 0 }}/4 {{ t('intgSuccessStepsLabel') }})
        </div>
      </div>
      <button class="ws-btn ws-btn--primary ws-btn--sm" @click="$emit('configure-next', otherLocations[0])">
        {{ t('intgSuccessConfigure') }}
        <ArrowRight :size="14" />
      </button>
    </div>

    <!-- Actions -->
    <div class="ws-actions">
      <button class="ws-btn ws-btn--ghost" @click="$emit('close')">
        {{ t('intgSuccessBackToIntegrations') }}
      </button>
      <button class="ws-btn ws-btn--primary" @click="$emit('go-to-analytics')">
        <BarChart2 :size="16" />
        {{ t('intgSuccessViewAnalytics') }}
      </button>
    </div>

  </div>
</template>

<script>
import { CheckCircle, MapPin, ArrowRight, BarChart2 } from 'lucide-vue-next'
import { useI18n } from '@/i18n/useI18n'

export default {
  name: 'WizardSuccess',
  components: { CheckCircle, MapPin, ArrowRight, BarChart2 },
  props: {
    location: { type: Object, default: null },
    otherLocations: { type: Array, default: () => [] },
    summary: {
      type: Object,
      default: () => ({ merchants: 0, products: 0, events: 0 }),
    },
    isDark: { type: Boolean, default: false },
  },
  emits: ['close', 'go-to-analytics', 'configure-next'],
  setup() {
    const { t } = useI18n()
    return { t }
  },
  computed: {
    locationName() {
      return this.location?.name || this.location?.label || this.t('intgSuccessFallbackName')
    },
    // Digifood n'a pas d'étape « Événements » (webhooks temps réel, pas de sync API) :
    // la tuile resterait figée à 0 et se lirait comme un échec plutôt qu'un non-applicable.
    isDigifood() {
      return this.location?.type === 'digifood'
    },
  },
}
</script>

<style scoped>
/* ── Wrapper ── */
.ws-wrap {
  padding: 0 0 32px;
  background: #f6f7fb;
  min-height: 100%;
  display: flex;
  flex-direction: column;
}
.ws--dark.ws-wrap {
  background: #111827;
  color: #d1d5db;
}

/* ── Gradient hero header ── */
.ws-hero {
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 28px;
  background: #ff3131;
  box-shadow: 0 4px 20px rgba(255, 49, 49, 0.25);
  margin-bottom: 28px;
  flex-shrink: 0;
}
.ws-hero__icon-badge {
  width: 56px;
  height: 56px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.ws-hero__body {
  flex: 1;
  min-width: 0;
}
.ws-hero__title {
  font-size: 20px;
  font-weight: 700;
  color: #fff;
}
.ws-hero__sub {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.8);
  margin-top: 4px;
}

/* ── Section label ── */
.ws-section-label {
  font-size: 10.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.9px;
  color: #9ca3af;
  margin-bottom: 12px;
  padding: 0 24px;
}
.ws--dark .ws-section-label {
  color: #6b7280;
}

/* ── Stats row ── */
.ws-stats {
  display: flex;
  gap: 12px;
  padding: 0 24px;
  margin-bottom: 20px;
}
.ws-stat-card {
  flex: 1;
  background: #fff;
  border: 1.5px solid #e5e7eb;
  border-radius: 14px;
  padding: 16px 12px;
  text-align: center;
  transition: box-shadow 0.2s, border-color 0.2s;
}
.ws-stat-card:hover {
  border-color: #fecaca;
  box-shadow: 0 2px 10px rgba(255, 49, 49, 0.08);
}
.ws-stat-card__value {
  font-size: 26px;
  font-weight: 700;
  color: #ff3131;
  line-height: 1;
}
.ws-stat-card__label {
  font-size: 11.5px;
  color: #9ca3af;
  margin-top: 5px;
}
.ws--dark .ws-stat-card {
  background: #1f2937;
  border-color: #374151;
}
.ws--dark .ws-stat-card__label {
  color: #6b7280;
}

/* ── Other locations card ── */
.ws-other-card {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0 24px 24px;
  padding: 16px;
  background: #fef2f2;
  border: 1.5px solid #fecaca;
  border-radius: 14px;
}
.ws--dark .ws-other-card {
  background: rgba(255, 49, 49, 0.08);
  border-color: rgba(255, 49, 49, 0.2);
}
.ws-other-card__icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: rgba(255, 49, 49, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.ws-other-card__content {
  flex: 1;
  min-width: 0;
}
.ws-other-card__title {
  font-size: 13px;
  font-weight: 600;
  color: #111827;
  margin-bottom: 4px;
}
.ws-other-card__loc {
  font-size: 11.5px;
  color: #9ca3af;
  line-height: 1.5;
}
.ws--dark .ws-other-card__title {
  color: #f3f4f6;
}
.ws--dark .ws-other-card__loc {
  color: #6b7280;
}

/* ── Actions ── */
.ws-actions {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 0 24px;
  margin-top: auto;
}

/* ── Buttons ── */
.ws-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 24px;
  border-radius: 100px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
  line-height: 1.4;
}
.ws-btn--sm {
  padding: 8px 16px;
  font-size: 13px;
  flex-shrink: 0;
}
.ws-btn--primary {
  background: #ff3131;
  color: #fff;
  box-shadow: 0 4px 14px rgba(255, 49, 49, 0.3);
}
.ws-btn--primary:hover {
  box-shadow: 0 6px 20px rgba(255, 49, 49, 0.4);
  transform: translateY(-1px);
}
.ws-btn--ghost {
  background: transparent;
  border: 1.5px solid #e5e7eb;
  color: #6b7280;
}
.ws-btn--ghost:hover {
  border-color: #9ca3af;
  background: #f3f4f6;
  color: #374151;
}
</style>
