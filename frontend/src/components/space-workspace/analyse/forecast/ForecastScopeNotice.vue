<template>
  <div v-if="lines.length" class="fsn" role="status">
    <v-icon size="16" class="fsn__ico" aria-hidden="true">mdi-information-outline</v-icon>
    <span class="fsn__txt">
      <span v-for="line in lines" :key="line">{{ line }}</span>
    </span>
  </div>
</template>

<script setup>
// Encart du rapport Forecast, seulement s'il y a au moins une modification de prix, de catégorie
// ou de type :
//  - events sans prévision par article dont l'effet du prix est estimé par le mix historique
//    des PdV (information) ;
//  - events sans aucun grain article nulle part, où le prix reste sans effet.
import { computed } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import { fillTemplate } from '@/utils/forecastModificationLabels'

const props = defineProps({
  // forecastStats du runtime : { priceModificationCount, eventsFromHistoricalMix,
  // eventsWithoutArticleGrain (ids ou nombres), ... }.
  stats: { type: Object, default: null },
})

const { t } = useI18n()

const countOf = (v) => (Array.isArray(v) ? v.length : Number(v) || 0)

const lines = computed(() => {
  const s = props.stats
  if (!s || !(Number(s.priceModificationCount) > 0)) return []
  const out = []
  const history = countOf(s.eventsFromHistoricalMix)
  if (history > 0) out.push(fillTemplate(t('fcstHistoryNotice'), { count: history }))
  const without = countOf(s.eventsWithoutArticleGrain)
  if (without > 0) out.push(fillTemplate(t('fcstScopeNotice'), { count: without }))
  return out
})
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
.fsn__txt { display: flex; flex-direction: column; gap: 4px; }
</style>
