<template>
  <div class="pos-amount">
    <div class="pos-amount__methods">
      <button
        v-for="method in methods"
        :key="method.id"
        type="button"
        class="pos-chip-btn"
        :class="{ 'pos-chip-btn--on': selectedMethodId === method.id }"
        @click="$emit('method', method.id)"
      >{{ method.name }}</button>
    </div>
    <div class="pos-amount__presets">
      <button v-for="cents in presets" :key="cents" type="button" class="pos-amount__preset" :disabled="!canAdd" @click="$emit('preset', cents)">{{ formatCents(cents) }}</button>
      <button type="button" class="pos-amount__preset" :disabled="!canAdd" @click="$emit('rest')">{{ t('guestPosSplitTheRest') }}</button>
    </div>
    <form class="pos-amount__custom" @submit.prevent="$emit('custom')">
      <input
        type="text"
        inputmode="decimal"
        class="pos-amount__input"
        :value="customText"
        :placeholder="t('guestPosSplitCustomPlaceholder')"
        :aria-label="t('guestPosSplitCustom')"
        @input="$emit('update:customText', $event.target.value)"
      />
      <button type="submit" class="pos-amount__add" :disabled="!canAdd">{{ t('guestPosSplitAdd') }}</button>
    </form>
    <div class="pos-amount__lines">
      <div v-for="line in lines" :key="line.index" class="pos-amount__line">
        <span>{{ line.methodName }}</span>
        <span class="pos-amount__line-right">
          <strong>{{ line.amountLabel }}</strong>
          <button type="button" class="pos-amount__remove" :aria-label="t('guestPosSplitRemove')" @click="$emit('remove', line.index)"><X :size="16" aria-hidden="true" /></button>
        </span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { X } from 'lucide-vue-next'
import { useI18n } from '@/i18n/useI18n'
import { formatCents } from '@/utils/posMoney'

defineProps({
  methods: { type: Array, default: () => [] },
  selectedMethodId: { type: String, default: '' },
  presets: { type: Array, default: () => [] }, // centimes
  canAdd: { type: Boolean, default: true },
  customText: { type: String, default: '' },
  lines: { type: Array, default: () => [] }, // [{ index, methodName, amountLabel }]
})
defineEmits(['method', 'preset', 'rest', 'custom', 'remove', 'update:customText'])

const { t } = useI18n()
</script>

<style scoped>
.pos-amount { display: flex; flex-direction: column; gap: 12px; }
.pos-amount__methods { display: flex; flex-wrap: wrap; gap: 8px; }
.pos-chip-btn {
  min-height: 44px; padding: 0 14px; border-radius: 8px; font-size: var(--fs-md); font-weight: var(--fw-bold); border: 1px solid var(--pos-border-strong);
  background: var(--pos-surface); color: var(--pos-text); cursor: pointer;
}
.pos-chip-btn--on { border-color: var(--pos-accent); background: var(--pos-accent-soft); color: var(--pos-accent); }
.pos-amount__presets { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
.pos-amount__preset { min-height: 52px; border-radius: 10px; border: 1px solid var(--pos-border-strong); background: var(--pos-surface); color: var(--pos-text); font-size: var(--fs-md); font-weight: var(--fw-bold); cursor: pointer; }
.pos-amount__preset:disabled { opacity: 0.4; cursor: default; }
.pos-amount__custom { display: flex; gap: 8px; }
.pos-amount__input { flex: 1; min-height: 48px; box-sizing: border-box; padding: 0 12px; border: 1px solid var(--pos-border-strong); border-radius: 8px; font-family: inherit; font-size: var(--fs-lg); color: var(--pos-text); background: var(--pos-surface); }
.pos-amount__add { min-height: 48px; padding: 0 18px; border-radius: 8px; border: 1px solid var(--pos-text); background: var(--pos-surface); color: var(--pos-text); font-size: var(--fs-md); font-weight: var(--fw-bold); cursor: pointer; }
.pos-amount__add:disabled { opacity: 0.4; cursor: default; }
.pos-amount__lines { display: flex; flex-direction: column; max-height: 200px; overflow-y: auto; }
.pos-amount__line { display: flex; align-items: center; justify-content: space-between; padding: 8px 0; border-top: 1px solid #F0F1F3; font-size: var(--fs-md); }
.pos-amount__line-right { display: flex; align-items: center; gap: 8px; font-variant-numeric: tabular-nums; }
.pos-amount__remove { width: 44px; height: 44px; border-radius: 8px; border: 1px solid var(--pos-border-strong); background: var(--pos-surface); color: var(--pos-muted); display: flex; align-items: center; justify-content: center; cursor: pointer; }
</style>
