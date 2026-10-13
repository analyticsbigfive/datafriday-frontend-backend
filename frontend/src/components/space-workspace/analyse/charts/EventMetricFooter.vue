<template>
  <!-- Pied du graphe par event pour les métriques rendement : légende feuille finale /
       brouillon, message d'indisponibilité, et events exclus avec leur raison. -->
  <div class="emf" :class="{ 'emf--dark': isDark }">
    <div v-if="showDraftLegend" class="emf-legend">
      <span class="emf-swatch" :style="{ background: color }" />{{ t('anRdtSheetFinal') }}
      <span class="emf-swatch emf-swatch--draft" :style="{ background: color }" />{{ t('anRdtSheetDraft') }}
    </div>
    <div v-if="message" class="emf-note" role="status">{{ message }}</div>
    <div v-else-if="excluded.length" class="emf-note">
      {{ t('anRdtExcluded') }} :
      {{ excluded.map((e) => `${e.name} (${e.reason})`).join(', ') }}
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useTheme } from 'vuetify'
import { useI18n } from '@/i18n/useI18n'

defineProps({
  color: { type: String, default: '#10B981' },
  showDraftLegend: { type: Boolean, default: false },
  // Message d'état (rapport indisponible, chargement) : remplace la liste des exclus.
  message: { type: String, default: '' },
  // [{ name, reason }] : events sans valeur, raison déjà traduite.
  excluded: { type: Array, default: () => [] },
})

const { t } = useI18n()
const theme = useTheme()
const isDark = computed(() => !!theme.global.current.value.dark)
</script>

<style scoped>
.emf-legend {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  font-size: var(--fs-xs);
  color: #6b7280;
}
.emf-swatch {
  width: 12px;
  height: 12px;
  border-radius: 3px;
  display: inline-block;
}
.emf-swatch--draft {
  opacity: 0.4;
  margin-left: 8px;
}
.emf-note {
  margin-top: 8px;
  padding: 6px 10px;
  border-radius: 8px;
  background: #f3f4f6;
  color: #4b5563;
  font-size: var(--fs-sm);
}
.emf--dark .emf-legend {
  color: #94a3b8;
}
.emf--dark .emf-note {
  background: rgba(255, 255, 255, 0.06);
  color: #cbd5e1;
}
</style>
