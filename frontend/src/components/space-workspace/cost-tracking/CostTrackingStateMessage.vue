<template>
  <div class="ct-state" :class="`ct-state--${kind}`" :role="kind === 'error' ? 'alert' : 'status'">
    <div v-if="kind === 'loading'" class="ct-state__skeleton" aria-hidden="true">
      <div class="ct-state__bar ct-state__bar--l" />
      <div class="ct-state__bar" />
      <div class="ct-state__bar ct-state__bar--s" />
    </div>
    <div class="ct-state__text">
      <b>{{ t(titleKey) }}</b>
      <span v-if="bodyKey">{{ t(bodyKey) }}</span>
      <button v-if="kind === 'error'" type="button" class="ct-state__retry" @click="$emit('retry')">
        {{ t('ctRetry') }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import { noScopeTitleKey } from '@/utils/costTrackingCopy'

// Message d'état du graphique : chargement, erreur, périmètre vide, suivi pas encore démarré,
// aucune version sur la période.
const props = defineProps({
  kind: {
    type: String,
    default: 'empty',
    validator: (v) => ['loading', 'error', 'empty', 'noScope', 'notStarted'].includes(v),
  },
  // Mode « Afficher par » : le message de périmètre vide nomme le niveau affiché.
  groupBy: { type: String, default: 'article' },
})
defineEmits(['retry'])

const { t } = useI18n()

const KEYS = {
  loading: ['ctLoading', null],
  error: ['ctErrorTitle', null],
  empty: ['ctEmptyTitle', 'ctEmptyBody'],
  noScope: ['ctNoScopeTitle', 'ctNoScopeBody'],
  notStarted: ['ctNotStartedTitle', 'ctNotStartedBody'],
}
const titleKey = computed(() =>
  props.kind === 'noScope' ? noScopeTitleKey(props.groupBy) : KEYS[props.kind][0],
)
const bodyKey = computed(() => KEYS[props.kind][1])
</script>

<style scoped>
.ct-state {
  display: grid;
  place-items: center;
  min-height: 220px;
  padding: 16px;
  text-align: center;
  color: var(--ct-muted);
  font-size: var(--fs-md);
}
.ct-state__text {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.ct-state__text b {
  color: var(--ct-text);
  font-size: var(--fs-lg);
  font-weight: var(--fw-semibold);
}
.ct-state__skeleton {
  width: min(420px, 100%);
  margin-bottom: 12px;
}
.ct-state__bar {
  height: 10px;
  margin: 8px 0;
  border-radius: 99px;
  background: var(--ct-border);
}
.ct-state__bar--l {
  height: 54px;
  border-radius: 8px;
}
.ct-state__bar--s {
  width: 60%;
}
.ct-state__retry {
  margin-top: 8px;
  padding: 6px 14px;
  border: 1px solid var(--ct-border-strong);
  border-radius: 8px;
  background: var(--ct-surface);
  color: var(--ct-brand);
  font-size: var(--fs-sm);
  font-weight: var(--fw-semibold);
  cursor: pointer;
}
</style>
