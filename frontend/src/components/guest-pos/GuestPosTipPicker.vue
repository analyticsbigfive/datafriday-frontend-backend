<template>
  <div v-if="tip.enabled.value" class="pos-tip">
    <div class="pos-tip__row">
      <span class="pos-tip__title">{{ t('guestPosTip') }}</span>
      <button type="button" class="pos-tip__chip" :class="{ 'pos-tip__chip--on': tip.isNone.value && !tip.customOpen.value }" @click="tip.pickNone()">{{ t('guestPosTipNone') }}</button>
      <button
        v-for="percent in tip.percentPresets"
        :key="percent"
        type="button"
        class="pos-tip__chip"
        :class="{ 'pos-tip__chip--on': tip.isPercent(percent) }"
        @click="tip.pickPercent(percent)"
      >{{ percent }} %</button>
      <button type="button" class="pos-tip__chip" :class="{ 'pos-tip__chip--on': tip.isCustom.value }" @click="tip.openCustom()">{{ t('guestPosTipAmount') }}</button>
    </div>
    <label v-if="tip.customOpen.value" class="pos-tip__custom">
      <input
        type="text"
        inputmode="decimal"
        class="pos-tip__input"
        :class="{ 'pos-tip__input--invalid': tip.customInvalid.value }"
        :value="tip.customText.value"
        :placeholder="t('guestPosTipAmountPlaceholder')"
        :aria-label="t('guestPosTipAmount')"
        @input="tip.onCustomInput($event.target.value)"
      />
    </label>
    <p v-if="tip.tipCents.value > 0" class="pos-tip__note">{{ t('guestPosTipNote').replace('{amount}', tip.tipLabel.value) }}</p>
  </div>
</template>

<script setup>
// Pourboire du ticket (affiché seulement si l'évènement l'autorise : settings.tipsEnabled).
import { useI18n } from '@/i18n/useI18n'
import { useGuestPosTip } from '@/composables/useGuestPosTip'

const { t } = useI18n()
const tip = useGuestPosTip()
</script>

<style scoped>
.pos-tip { display: flex; flex-direction: column; gap: 6px; }
.pos-tip__row { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
.pos-tip__title { font-size: var(--fs-base); font-weight: var(--fw-bold); color: #374151; margin-right: 4px; }
.pos-tip__chip {
  min-height: 44px; padding: 0 12px; border-radius: 999px; font-size: var(--fs-base); font-weight: var(--fw-bold); border: 1px solid var(--pos-border-strong);
  background: var(--pos-surface); color: #374151; cursor: pointer;
}
.pos-tip__chip--on { border-color: var(--pos-accent); background: var(--pos-accent-soft); color: var(--pos-accent); }
.pos-tip__custom { display: flex; }
.pos-tip__input { flex: 1; min-height: 44px; box-sizing: border-box; padding: 0 12px; border: 1px solid var(--pos-border-strong); border-radius: 8px; font-family: inherit; font-size: var(--fs-lg); background: var(--pos-surface); color: var(--pos-text); }
.pos-tip__input--invalid { border-color: var(--pos-danger); }
.pos-tip__note { margin: 0; font-size: var(--fs-sm); color: var(--pos-muted); text-align: center; }
</style>
