<template>
  <div v-if="count > 0" class="fsn" role="status">
    <v-icon size="16" class="fsn__ico" aria-hidden="true">mdi-information-outline</v-icon>
    <span>{{ text }}</span>
  </div>
</template>

<script setup>
// Encart du rapport Forecast : les modifications de prix, de catégorie et de type ne s'appliquent
// qu'aux events qui ont une prévision détaillée par article. N'apparaît que s'il y a au moins une
// de ces modifications ET au moins un event sans cette prévision.
import { computed } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import { fillTemplate } from '@/utils/forecastModificationLabels'

const props = defineProps({
  // forecastStats du runtime : { priceModificationCount, eventsWithoutArticleGrain (ids ou nombre), ... }.
  stats: { type: Object, default: null },
})

const { t } = useI18n()

/** Nombre d'events sans prévision par article (liste d'identifiants ou nombre déjà compté). */
const count = computed(() => {
  const s = props.stats
  if (!s || !(Number(s.priceModificationCount) > 0)) return 0
  const without = s.eventsWithoutArticleGrain
  return Array.isArray(without) ? without.length : Number(without) || 0
})

const text = computed(() => fillTemplate(t('fcstScopeNotice'), { count: count.value }))
</script>

<style scoped>
.fsn {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 9px 12px;
  border-radius: 10px;
  font-size: var(--fs-base);
  line-height: 1.35;
  background: var(--cr-cmp-bg);
  color: var(--cr-cmp);
}
.fsn__ico { flex: none; margin-top: 1px; }
</style>
