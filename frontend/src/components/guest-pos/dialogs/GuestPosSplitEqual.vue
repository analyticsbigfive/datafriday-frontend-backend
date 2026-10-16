<template>
  <div class="pos-equal">
    <div class="pos-equal__count-row">
      <div class="pos-equal__count-label">{{ t('guestPosSplitPeople') }}</div>
      <div class="pos-equal__stepper">
        <button type="button" class="pos-equal__step" :disabled="count <= minParts" :aria-label="t('guestPosSplitFewer')" @click="$emit('step', -1)">−</button>
        <div class="pos-equal__count">{{ count }}</div>
        <button type="button" class="pos-equal__step" :disabled="count >= maxParts" :aria-label="t('guestPosSplitMore')" @click="$emit('step', 1)">+</button>
      </div>
    </div>
    <div class="pos-equal__parts">
      <div v-for="part in parts" :key="part.index" class="pos-equal__part">
        <div class="pos-equal__part-text"><strong>{{ t('guestPosSplitPart').replace('{number}', part.number) }}</strong> <span>· {{ part.amountLabel }}</span></div>
        <div class="pos-equal__methods">
          <button
            v-for="method in methods"
            :key="method.id"
            type="button"
            class="pos-chip-btn"
            :class="{ 'pos-chip-btn--on': part.methodId === method.id }"
            @click="$emit('method', { index: part.index, methodId: method.id })"
          >{{ method.name }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useI18n } from '@/i18n/useI18n'

defineProps({
  count: { type: Number, default: 2 },
  minParts: { type: Number, default: 2 },
  maxParts: { type: Number, default: 10 },
  parts: { type: Array, default: () => [] }, // [{ index, number, amountLabel, methodId }]
  methods: { type: Array, default: () => [] },
})
defineEmits(['step', 'method'])

const { t } = useI18n()
</script>

<style scoped>
.pos-equal { display: flex; flex-direction: column; gap: 16px; }
.pos-equal__count-row { display: flex; align-items: center; justify-content: space-between; }
.pos-equal__count-label { font-size: var(--fs-md); font-weight: var(--fw-semibold); }
.pos-equal__stepper { display: flex; align-items: center; border: 1px solid var(--pos-border-strong); border-radius: 10px; overflow: hidden; background: #FAFAFA; }
.pos-equal__step { width: 48px; height: 48px; border: 0; background: transparent; font-size: var(--fs-xl); font-weight: var(--fw-bold); color: var(--pos-text); cursor: pointer; }
.pos-equal__step:disabled { opacity: 0.35; cursor: default; }
.pos-equal__count { min-width: 40px; text-align: center; font-size: var(--fs-lg); font-weight: var(--fw-bold); }
.pos-equal__parts { display: flex; flex-direction: column; max-height: 300px; overflow-y: auto; }
.pos-equal__part { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 0; border-top: 1px solid #F0F1F3; }
.pos-equal__part-text { font-size: var(--fs-md); font-variant-numeric: tabular-nums; }
.pos-equal__part-text span { color: var(--pos-muted); }
.pos-equal__methods { display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end; }
.pos-chip-btn {
  min-height: 44px; padding: 0 14px; border-radius: 8px; font-size: var(--fs-md); font-weight: var(--fw-bold); border: 1px solid var(--pos-border-strong);
  background: var(--pos-surface); color: var(--pos-text); cursor: pointer;
}
.pos-chip-btn--on { border-color: var(--pos-accent); background: var(--pos-accent-soft); color: var(--pos-accent); }
</style>
