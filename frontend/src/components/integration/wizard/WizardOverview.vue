<template>
  <div class="wo-wrap" :class="{ 'wo--dark': isDark }">

    <!-- Gradient header banner -->
    <div class="wo-header">
      <div class="wo-header__icon">
        <MapPinCheck :size="26" color="white" />
      </div>
      <div class="wo-header__body">
        <p class="wo-header__title">{{ t('intgOverviewTitle') }}</p>
        <p class="wo-header__sub">{{ locationName }}</p>
      </div>
    </div>

    <!-- Description blurb -->
    <div class="wo-desc">
      {{ t('intgOverviewDescPrefix') }} <strong>{{ t('intgOverviewDescSteps') }}</strong>{{ t('intgOverviewDescSuffix') }}
    </div>

    <!-- Step preview cards -->
    <div class="wo-steps">
      <div
        v-for="(step, i) in steps"
        :key="step.key"
        class="wo-step-card"
        :class="{ 'wo-step-card--done': step.done }"
      >
        <!-- Number circle -->
        <div class="wo-step-card__num" :class="{ 'wo-step-card__num--done': step.done }">
          <Check v-if="step.done" :size="15" color="white" />
          <span v-else>{{ i + 1 }}</span>
        </div>

        <!-- Body -->
        <div class="wo-step-card__body">
          <div class="wo-step-card__label">{{ step.label }}</div>
          <div class="wo-step-card__desc">{{ step.description }}</div>
        </div>

        <!-- Status pill -->
        <div class="wo-step-card__chip" :class="step.done ? 'wo-step-card__chip--done' : 'wo-step-card__chip--todo'">
          {{ step.done ? t('intgOverviewDone') : t('intgOverviewTodo') }}
        </div>
      </div>
    </div>

    <!-- CTA -->
    <div class="wo-cta">
      <button class="wo-btn wo-btn--primary" @click="$emit('start')">
        {{ t('intgOverviewStart') }}
        <ArrowRight :size="18" />
      </button>
    </div>

  </div>
</template>

<script>
import { Check, ArrowRight, MapPinCheck } from 'lucide-vue-next'
import { useI18n } from '@/i18n/useI18n'

const STEP_DEFINITIONS = [
  {
    key: 'space',
    labelKey: 'intgOverviewStepSpaceLabel',
    descriptionKey: 'intgOverviewStepSpaceDesc',
  },
  {
    key: 'shops',
    labelKey: 'intgOverviewStepShopsLabel',
    descriptionKey: 'intgOverviewStepShopsDesc',
  },
  {
    key: 'products',
    labelKey: 'intgOverviewStepProductsLabel',
    descriptionKey: 'intgOverviewStepProductsDesc',
  },
  {
    key: 'events',
    labelKey: 'intgOverviewStepEventsLabel',
    descriptionKey: 'intgOverviewStepEventsDesc',
  },
]

export default {
  name: 'WizardOverview',
  components: { Check, ArrowRight, MapPinCheck },
  props: {
    location: { type: Object, default: null },
    completedSteps: { type: Number, default: 0 },
    isDark: { type: Boolean, default: false },
  },
  emits: ['start'],
  setup() {
    const { t } = useI18n()
    return { t }
  },
  computed: {
    locationName() {
      return this.location?.name || this.location?.label || this.t('intgOverviewFallbackName')
    },
    steps() {
      return STEP_DEFINITIONS.map((def, i) => ({
        ...def,
        label: this.t(def.labelKey),
        description: this.t(def.descriptionKey),
        done: i < this.completedSteps,
      }))
    },
  },
}
</script>

<style scoped>
/* ── Wrapper ── */
.wo-wrap {
  padding: 20px 24px 32px;
  background: #f6f7fb;
  min-height: 100%;
}
.wo--dark.wo-wrap {
  background: #111827;
  color: #d1d5db;
}

/* ── Gradient Header ── */
.wo-header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 22px 24px;
  border-radius: 18px;
  margin-bottom: 0;
  background: #ff3131;
  box-shadow: 0 4px 20px rgba(255, 49, 49, 0.25);
}
.wo-header__icon {
  width: 52px;
  height: 52px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.18);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.wo-header__body {
  flex: 1;
  min-width: 0;
}
.wo-header__title {
  font-size: 17px;
  font-weight: 700;
  color: #fff;
  margin: 0 0 3px;
}
.wo-header__sub {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.82);
  margin: 0;
}

/* ── Description ── */
.wo-desc {
  padding: 16px 4px;
  font-size: 13.5px;
  color: #6b7280;
  line-height: 1.6;
  margin-bottom: 4px;
}
.wo-desc strong {
  color: #ff3131;
  font-weight: 700;
}
.wo--dark .wo-desc {
  color: #9ca3af;
}

/* ── Steps ── */
.wo-steps {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 28px;
}
.wo-step-card {
  display: flex;
  align-items: center;
  gap: 14px;
  background: #fff;
  border-radius: 14px;
  border: 1.5px solid #e5e7eb;
  padding: 14px 16px;
  transition: box-shadow 0.2s, border-color 0.2s;
}
.wo-step-card:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  border-color: #d1d5db;
}
.wo-step-card--done {
  border-color: #bbf7d0;
  background: #f0fdf4;
}
.wo--dark .wo-step-card {
  background: #1f2937;
  border-color: #374151;
}
.wo--dark .wo-step-card--done {
  background: #052e16;
  border-color: #166534;
}

.wo-step-card__num {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #fef2f2;
  border: 2px solid #fecaca;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
  color: #ff3131;
  flex-shrink: 0;
  transition: all 0.2s;
}
.wo-step-card__num--done {
  background: linear-gradient(135deg, #16a34a 0%, #15803d 100%);
  border-color: transparent;
  color: #fff;
}
.wo--dark .wo-step-card__num {
  background: rgba(255, 49, 49, 0.12);
  border-color: rgba(255, 49, 49, 0.3);
}

.wo-step-card__body {
  flex: 1;
  min-width: 0;
}
.wo-step-card__label {
  font-size: 13.5px;
  font-weight: 600;
  color: #111827;
}
.wo-step-card__desc {
  font-size: 12px;
  color: #9ca3af;
  margin-top: 2px;
}
.wo--dark .wo-step-card__label {
  color: #f3f4f6;
}
.wo--dark .wo-step-card__desc {
  color: #6b7280;
}

.wo-step-card__chip {
  font-size: 11px;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: 100px;
  flex-shrink: 0;
}
.wo-step-card__chip--todo {
  background: #f3f4f6;
  color: #6b7280;
}
.wo-step-card__chip--done {
  background: #dcfce7;
  color: #166534;
}

/* ── CTA ── */
.wo-cta {
  display: flex;
  justify-content: center;
}

/* ── Buttons ── */
.wo-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 28px;
  border-radius: 100px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
  line-height: 1.4;
}
.wo-btn--primary {
  background: #ff3131;
  color: #fff;
  box-shadow: 0 4px 14px rgba(255, 49, 49, 0.3);
}
.wo-btn--primary:hover {
  box-shadow: 0 6px 20px rgba(255, 49, 49, 0.4);
  transform: translateY(-1px);
}
</style>
