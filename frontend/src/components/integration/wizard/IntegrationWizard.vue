<template>
  <Teleport to="body">
    <Transition name="iw-drawer" appear>
      <div v-if="open" class="iw-overlay" @click.self="$emit('close')">
        <div class="iw-panel" :class="{ 'iw--dark': isDark }">

          <!-- Gradient Header -->
          <div class="iw-header">
            <div class="iw-header__icon-badge">
              <MapPinCheck :size="22" color="white" />
            </div>
            <div class="iw-header__text">
              <div class="iw-header__title">{{ location?.name || t('intgWizardFallbackName') }}</div>
              <div class="iw-header__sub">{{ t('intgWizardHeaderSub') }}</div>
            </div>
            <div v-if="!showOverview && !showSuccess" class="iw-header__badge">
              {{ completedSteps }}/4 {{ t('intgWizardStepsLabel') }}
            </div>
            <button class="iw-header__close" :aria-label="t('intgWizardClose')" @click="$emit('close')">
              <X :size="18" color="white" />
            </button>
          </div>

          <!-- Step Progress Bar -->
          <div
            v-if="!showOverview && !showSuccess"
            class="iw-progress"
            :class="{ 'iw-progress--dark': isDark }"
          >
            <template v-for="(step, idx) in stepItems" :key="step.value">
              <div
                v-if="idx > 0"
                class="iw-progress__connector"
                :class="{ 'iw-progress__connector--done': currentStep > idx }"
              />
              <div class="iw-progress__item">
                <div
                  class="iw-progress__circle"
                  :class="{
                    'iw-progress__circle--active': currentStep === step.value,
                    'iw-progress__circle--done': completedStepsList.includes(step.value) && currentStep !== step.value,
                    'iw-progress__circle--idle': !completedStepsList.includes(step.value) && currentStep !== step.value,
                  }"
                  :style="{ cursor: completedStepsList.includes(step.value) && currentStep !== step.value ? 'pointer' : 'default' }"
                  @click="completedStepsList.includes(step.value) && currentStep !== step.value ? currentStep = step.value : null"
                >
                  <Check v-if="completedStepsList.includes(step.value) && currentStep !== step.value" :size="14" color="white" />
                  <span v-else>{{ step.value }}</span>
                </div>
                <span
                  class="iw-progress__label"
                  :class="{ 'iw-progress__label--active': currentStep === step.value || completedStepsList.includes(step.value) }"
                >{{ step.title }}</span>
              </div>
            </template>
          </div>

          <!-- Scrollable content -->
          <div class="iw-body">
            <!-- Overview -->
            <WizardOverview
              v-if="showOverview"
              :location="location"
              :completed-steps="completedSteps"
              :is-dark="isDark"
              @start="showOverview = false"
            />

            <!-- Success -->
            <WizardSuccess
              v-else-if="showSuccess"
              :location="location"
              :other-locations="otherLocations"
              :summary="wizardSummary"
              :is-dark="isDark"
              @close="$emit('close')"
              @go-to-analytics="$emit('go-to-analytics', resolvedSpaceId)"
              @configure-next="$emit('configure-next', $event)"
            />

            <!-- Step content -->
            <template v-else>
              <StepMapSpace
                v-if="currentStep === 1"
                :location="location"
                :initial-space-id="resolvedSpaceId"
                :is-dark="isDark"
                :footer-target="footerEl"
                @completed="handleStepCompleted(1, $event)"
              />
              <StepMapShops
                v-else-if="currentStep === 2"
                :location="location"
                :space-id="resolvedSpaceId"
                :is-dark="isDark"
                :footer-target="footerEl"
                @completed="handleStepCompleted(2, $event)"
                @request-csv-import="$emit('request-csv-import')"
              />
              <StepMapMenuItems
                v-else-if="currentStep === 3"
                :location="location"
                :space-id="resolvedSpaceId"
                :is-dark="isDark"
                :footer-target="footerEl"
                @completed="handleStepCompleted(3, $event)"
              />
              <StepProcessTimeline
                v-else-if="currentStep === 4"
                :location="location"
                :space-id="resolvedSpaceId"
                :is-dark="isDark"
                :footer-target="footerEl"
                @completed="handleStepCompleted(4, $event)"
              />
            </template>
          </div>

          <!-- Footer -->
          <div
            v-show="!showOverview && !showSuccess"
            class="iw-footer"
            :class="{ 'iw-footer--dark': isDark }"
          >
            <button v-if="currentStep > 1" class="iw-btn iw-btn--ghost" @click="goBack">
              <ArrowLeft :size="15" />
              {{ t('intgWizardPrevious') }}
            </button>
            <div ref="footerEl" class="iw-footer__slot" />
          </div>

        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script>
import { X, Check, ArrowLeft, MapPinCheck } from 'lucide-vue-next'
import { t as translate } from '@/i18n'
import WizardOverview from './WizardOverview.vue'
import WizardSuccess from './WizardSuccess.vue'
import StepMapSpace from './StepMapSpace.vue'
import StepMapShops from './StepMapShops.vue'
import StepMapMenuItems from './StepMapMenuItems.vue'
import StepProcessTimeline from './StepProcessTimeline.vue'

export default {
  name: 'IntegrationWizard',
  components: {
    X,
    Check,
    ArrowLeft,
    MapPinCheck,
    WizardOverview,
    WizardSuccess,
    StepMapSpace,
    StepMapShops,
    StepMapMenuItems,
    StepProcessTimeline,
  },
  props: {
    open: { type: Boolean, default: false },
    location: { type: Object, default: null },
    spaceId: { type: String, default: null },
    otherLocations: { type: Array, default: () => [] },
  },
  emits: ['close', 'completed', 'go-to-analytics', 'configure-next', 'request-csv-import'],
  watch: {
    open(val) {
      document.body.style.overflow = val ? 'hidden' : ''
      if (val) {
        this.$nextTick(() => {
          this.footerEl = this.$refs.footerEl
        })
      }
    },
  },
  mounted() {
    this._onThemeChanged = (e) => { this.theme = e.detail?.theme || localStorage.getItem('datafriday:theme') || localStorage.getItem('appTheme') || 'dataFridayLight' }
    window.addEventListener('theme-changed', this._onThemeChanged)
    window.addEventListener('locale-changed', this.handleLocaleChange)
    this.footerEl = this.$refs.footerEl
  },
  beforeUnmount() {
    document.body.style.overflow = ''
    window.removeEventListener('theme-changed', this._onThemeChanged)
    window.removeEventListener('locale-changed', this.handleLocaleChange)
  },
  data() {
    // Reprise où l'utilisateur s'était arrêté : location.completedSteps (calculé par
    // DataIntegrationView.vue à l'ouverture) donne le nombre d'étapes déjà faites —
    // on saute directement à la première étape incomplète plutôt que de tout rejouer.
    const lastStepForLocation = this.location?.type === 'digifood' ? 3 : 4
    const completed = Math.min(this.location?.completedSteps ?? 0, lastStepForLocation)
    return {
      locale: localStorage.getItem('appLocale') || 'en',
      currentStep: Math.min(completed + 1, lastStepForLocation),
      completedStepsList: Array.from({ length: completed }, (_, i) => i + 1),
      footerEl: null,
      resolvedSpaceId: this.spaceId,
      showSuccess: false,
      wizardSummary: { merchants: 0, products: 0, events: 0 },
      showOverview: !this.spaceId && completed === 0,
      theme: localStorage.getItem('datafriday:theme') || localStorage.getItem('appTheme') || 'dataFridayLight',
    }
  },
  computed: {
    // Digifood = webhooks temps réel : pas d'étape « Événements » (sync API Weezevent).
    // Le wizard s'arrête au mapping (Espace → PDV → Menu), le flux de données est continu.
    isDigifood() {
      return this.location?.type === 'digifood'
    },
    lastStep() {
      return this.isDigifood ? 3 : 4
    },
    stepItems() {
      const steps = [
        { title: this.t('intgWizardStepSpace'), value: 1 },
        { title: this.t('intgWizardStepLocations'), value: 2 },
        { title: this.t('intgWizardStepMenu'), value: 3 },
      ]
      if (!this.isDigifood) {
        steps.push({ title: this.t('intgWizardStepEvents'), value: 4 })
      }
      return steps
    },
    completedSteps() {
      return this.completedStepsList.length
    },
    isDark() {
      return this.theme === 'dataFridayDark'
    },
  },
  methods: {
    t(key) {
      return translate(key, this.locale)
    },
    handleLocaleChange(event) {
      this.locale = event.detail.locale
    },
    handleStepCompleted(step, data) {
      if (!this.completedStepsList.includes(step)) {
        this.completedStepsList.push(step)
      }
      if (step === 1 && data?.spaceId) {
        this.resolvedSpaceId = data.spaceId
      }
      if (step === 2 && data?.merchants != null) {
        this.wizardSummary = { ...this.wizardSummary, merchants: data.merchants }
      }
      if (step === 3 && data?.products != null) {
        this.wizardSummary = { ...this.wizardSummary, products: data.products }
      }
      if (step === this.lastStep) {
        if (data?.events != null) {
          this.wizardSummary = { ...this.wizardSummary, events: data.events }
        }
        this.showSuccess = true
        this.$emit('completed')
        return
      }
      if (this.currentStep < this.lastStep) {
        this.currentStep = step + 1
      }
    },
    goBack() {
      if (this.currentStep > 1) {
        this.currentStep--
      }
    },
  },
}
</script>

<style scoped>
/* ── Overlay ── */
.iw-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  z-index: 2000;
  display: flex;
  justify-content: flex-end;
}

/* ── Panel ── */
.iw-panel {
  width: 740px;
  max-width: 100%;
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: #f6f7fb;
  box-shadow: -8px 0 32px rgba(0, 0, 0, 0.14);
}
.iw-panel.iw--dark {
  background: #111827;
  color: #d1d5db;
}

/* ── Gradient Header ── */
.iw-header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px 20px;
  background: #ff3131;
  box-shadow: 0 4px 20px rgba(255, 49, 49, 0.25);
  flex-shrink: 0;
}
.iw-header__icon-badge {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.iw-header__text {
  flex: 1;
  min-width: 0;
}
.iw-header__title {
  font-size: 16px;
  font-weight: 700;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.iw-header__sub {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.75);
  margin-top: 1px;
}
.iw-header__badge {
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  padding: 4px 12px;
  border-radius: 100px;
  white-space: nowrap;
  flex-shrink: 0;
}
.iw-header__close {
  background: rgba(255, 255, 255, 0.15);
  border: none;
  border-radius: 8px;
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.2s;
  flex-shrink: 0;
}
.iw-header__close:hover {
  background: rgba(255, 255, 255, 0.28);
}

/* ── Step Progress Bar ── */
.iw-progress {
  display: flex;
  align-items: center;
  padding: 14px 28px;
  background: #fff;
  border-bottom: 1px solid #f0f0f0;
  flex-shrink: 0;
}
.iw-progress--dark {
  background: #1f2937;
  border-bottom-color: #374151;
}
.iw-progress__connector {
  height: 2px;
  flex: 1;
  min-width: 24px;
  border-radius: 2px;
  background: #e5e7eb;
  transition: background 0.3s;
  margin: 0 4px;
}
.iw-progress__connector--done {
  background: #16a34a;
}
.iw-progress--dark .iw-progress__connector {
  background: #374151;
}
.iw-progress--dark .iw-progress__connector--done {
  background: #16a34a;
}
.iw-progress__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
  gap: 5px;
}
.iw-progress__circle {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
  transition: all 0.3s;
}
.iw-progress__circle--active {
  background: linear-gradient(135deg, #ff3131 0%, #b91c1c 100%);
  color: #fff;
  box-shadow: 0 2px 10px rgba(255, 49, 49, 0.4);
}
.iw-progress__circle--done {
  background: linear-gradient(135deg, #16a34a 0%, #15803d 100%);
  color: #fff;
  box-shadow: none;
}
.iw-progress__circle--idle {
  background: transparent;
  border: 2px solid #e5e7eb;
  color: #9ca3af;
}
.iw-progress--dark .iw-progress__circle--idle {
  border-color: #4b5563;
  color: #6b7280;
}
.iw-progress__label {
  font-size: 10.5px;
  font-weight: 400;
  color: #9ca3af;
  white-space: nowrap;
  transition: color 0.2s;
}
.iw-progress__label--active {
  color: #ff3131;
  font-weight: 600;
}
.iw-progress--dark .iw-progress__label {
  color: #6b7280;
}
.iw-progress--dark .iw-progress__label--active {
  color: #ff3131;
}

/* ── Scrollable body ── */
.iw-body {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  background: #f6f7fb;
}
.iw--dark .iw-body {
  background: #111827;
}

/* ── Footer ── */
.iw-footer {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 24px;
  border-top: 1px solid #f0f0f0;
  background: #fff;
  flex-shrink: 0;
}
.iw-footer--dark {
  background: #1f2937;
  border-top-color: #374151;
}
.iw-footer__slot {
  flex: 1;
  display: flex;
  justify-content: flex-end;
  align-items: center;
}

/* ── Buttons ── */
.iw-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 9px 20px;
  border-radius: 100px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
  line-height: 1.4;
}
.iw-btn--ghost {
  background: transparent;
  border: 1.5px solid #e5e7eb;
  color: #6b7280;
}
.iw-btn--ghost:hover {
  border-color: #9ca3af;
  background: #f3f4f6;
  color: #374151;
}

/* ── Transition ── */
.iw-drawer-enter-active,
.iw-drawer-leave-active { transition: opacity 0.25s ease; }
.iw-drawer-enter-active .iw-panel,
.iw-drawer-leave-active .iw-panel { transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1); }
.iw-drawer-enter-from,
.iw-drawer-leave-to { opacity: 0; }
.iw-drawer-enter-from .iw-panel,
.iw-drawer-leave-to .iw-panel { transform: translateX(100%); }
</style>
