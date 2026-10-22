<template>
  <div class="ct-key">
    <span><i class="ct-key__step" />{{ t('ctKeyStep') }}</span>
    <span v-if="withEvents"><i class="ct-key__diamond" />{{ t('ctKeyEvent') }}</span>
    <span v-if="withPrice"><i class="ct-key__price" />{{ t('ctKeyPrice') }}</span>
    <span v-if="withMargin"><i class="ct-key__dash" />{{ t('ctKeyMargin') }}</span>
  </div>
</template>

<script setup>
import { useI18n } from '@/i18n/useI18n'

// Pied de graphique : explique le palier, le losange d'event et la courbe de marge.
defineProps({
  withEvents: { type: Boolean, default: true },
  withMargin: { type: Boolean, default: false },
  withPrice: { type: Boolean, default: false },
})

const { t } = useI18n()
</script>

<style scoped>
.ct-key {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-top: 10px;
  font-size: var(--fs-xs);
  color: var(--ct-faint);
}
.ct-key span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.ct-key__step {
  width: 18px;
  height: 8px;
  border-bottom: 2px solid var(--ct-muted);
  border-left: 2px solid var(--ct-muted);
}
.ct-key__diamond {
  width: 8px;
  height: 8px;
  background: var(--ct-faint);
  transform: rotate(45deg);
}
.ct-key__price {
  width: 18px;
  border-top: 2px dashed var(--ct-muted);
  border-image: repeating-linear-gradient(90deg, var(--ct-muted) 0 7px, transparent 7px 10px) 1;
}
.ct-key__dash {
  width: 18px;
  border-top: 2px dashed var(--ct-muted);
}
</style>
