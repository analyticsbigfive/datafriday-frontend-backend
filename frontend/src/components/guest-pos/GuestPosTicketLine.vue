<template>
  <div class="pos-line">
    <div class="pos-line__text">
      <div class="pos-line__name">{{ line.name }}</div>
      <div class="pos-line__hint">
        <template v-if="line.originalUnitLabel">{{ t('guestPosLineInsteadOf').replace('{price}', line.originalUnitLabel) }} · </template>{{ t('guestPosLineUnit').replace('{price}', line.unitLabel) }}
      </div>
    </div>
    <div class="pos-line__stepper">
      <button type="button" class="pos-line__step" :aria-label="t('guestPosLineRemove')" @click="$emit('decrement', line.menuItemId)"><Minus :size="16" aria-hidden="true" /></button>
      <div class="pos-line__qty">{{ line.quantity }}</div>
      <button type="button" class="pos-line__step" :aria-label="t('guestPosLineAdd')" @click="$emit('increment', line.menuItemId)"><Plus :size="16" aria-hidden="true" /></button>
    </div>
    <div class="pos-line__total" :class="{ 'pos-line__total--negative': line.negative }">{{ line.totalLabel }}</div>
  </div>
</template>

<script setup>
import { Minus, Plus } from 'lucide-vue-next'
import { useI18n } from '@/i18n/useI18n'

defineProps({
  // { menuItemId, name, quantity, unitLabel, originalUnitLabel, totalLabel, negative }
  line: { type: Object, required: true },
})
defineEmits(['increment', 'decrement'])

const { t } = useI18n()
</script>

<style scoped>
.pos-line { padding: 12px 0; border-bottom: 1px solid #F0F1F3; display: flex; align-items: center; gap: 10px; }
.pos-line__text { flex: 1; min-width: 0; }
.pos-line__name { font-size: var(--fs-md); font-weight: var(--fw-bold); line-height: 1.25; }
.pos-line__hint { font-size: var(--fs-sm); color: var(--pos-muted); margin-top: 2px; }
.pos-line__stepper { display: flex; align-items: center; border: 1px solid var(--pos-border-strong); border-radius: 10px; overflow: hidden; background: #FAFAFA; }
.pos-line__step { width: 44px; height: 44px; border: 0; background: transparent; color: var(--pos-text); display: flex; align-items: center; justify-content: center; cursor: pointer; }
.pos-line__qty { min-width: 26px; text-align: center; font-size: var(--fs-lg); font-weight: var(--fw-bold); font-variant-numeric: tabular-nums; }
.pos-line__total { min-width: 72px; text-align: right; font-size: var(--fs-lg); font-weight: var(--fw-bold); font-variant-numeric: tabular-nums; }
.pos-line__total--negative { color: var(--pos-ok); }
</style>
