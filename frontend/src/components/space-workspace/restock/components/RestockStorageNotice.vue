<template>
  <!-- Point d'exclamation dans le bandeau rouge : le stock Storage non rattaché à un
       item prédit s'affiche au survol (ou au focus clavier), plus de section permanente.
       Rien du tout s'il n'y a aucun article concerné. -->
  <v-tooltip v-if="names.length" location="bottom start" max-width="420">
    <template #activator="{ props: tip }">
      <button
        v-bind="tip"
        type="button"
        class="rsn"
        :aria-label="t('srStorageUnmatchedIconLabel')"
      >
        <v-icon size="20" aria-hidden="true">mdi-alert-circle-outline</v-icon>
      </button>
    </template>
    <span class="rsn__txt">
      {{ t('srStorageUnmatchedWarn') }}
      <strong>{{ names.join(', ') }}</strong>
    </span>
  </v-tooltip>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from '@/i18n/useI18n'

const props = defineProps({
  // Articles de stock Storage non rattachés : [{ name, itemId, ... }].
  items: { type: Array, default: () => [] },
})

const { t } = useI18n()

const names = computed(() => (props.items || []).map((e) => e?.name || e?.itemId).filter(Boolean))
</script>

<style scoped>
.rsn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.18);
  color: #fff;
  cursor: help;
}
.rsn:hover { background: rgba(255, 255, 255, 0.3); }
.rsn:focus-visible {
  outline: 2px solid #fff;
  outline-offset: 2px;
}
.rsn__txt { display: block; line-height: 1.35; }
</style>
