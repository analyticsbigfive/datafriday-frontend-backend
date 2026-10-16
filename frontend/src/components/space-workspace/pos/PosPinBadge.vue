<template>
  <div class="pos-pin">
    <div class="pos-pin__label">{{ t('posPinLabel') }}</div>
    <div class="pos-pin__code" :aria-label="`${t('posPinLabel')} ${pin}`">{{ pin }}</div>
    <button
      v-if="canReset"
      type="button"
      class="pos-pin__reset"
      :disabled="disabled"
      :aria-label="t('posResetPin')"
      :title="t('posResetPin')"
      @click="$emit('reset')"
    >
      <v-icon size="14">mdi-refresh</v-icon>
    </button>
  </div>
</template>

<script setup>
import { useI18n } from '@/i18n/useI18n'

// PIN à 6 chiffres d'une caisse (déchiffré par le serveur avec front.fb.posManage seulement).
defineProps({
  pin: { type: String, required: true },
  canReset: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
})
defineEmits(['reset'])

const { t } = useI18n()
</script>

<style scoped>
.pos-pin {
  position: relative;
  min-width: 120px;
  box-sizing: border-box;
  padding: 6px 12px;
  border: 1px solid var(--fb-border, #e5e7eb);
  border-radius: var(--fb-radius-control, 8px);
  background: var(--fb-subtle, #fafafa);
  text-align: center;
}
.pos-pin__label {
  color: var(--fb-muted, #6b7280);
  font-size: var(--fs-xs);
  font-weight: var(--fw-bold);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.pos-pin__code {
  font-size: var(--fs-lg);
  font-weight: var(--fw-bold);
  letter-spacing: 0.12em;
  font-variant-numeric: tabular-nums;
}
.pos-pin__reset {
  position: absolute;
  top: 2px;
  right: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--fb-muted, #6b7280);
  cursor: pointer;
}
.pos-pin__reset:hover {
  background: rgba(15, 23, 42, 0.06);
}
.pos-pin__reset:disabled {
  opacity: 0.45;
  cursor: default;
}
</style>
