<template>
  <!-- Icône (i) en tête des filtres appliqués : le détail du calcul s'affiche au survol (ou au
       focus clavier), plus de bandeau permanent. Rien du tout s'il n'y a aucun message. -->
  <v-tooltip v-if="lines.length" location="bottom start" max-width="340">
    <template #activator="{ props: tip }">
      <button
        v-bind="tip"
        type="button"
        class="fsn"
        :aria-label="t('fcstNoticeIconLabel')"
      >
        <v-icon size="18" aria-hidden="true">mdi-information-outline</v-icon>
      </button>
    </template>
    <span class="fsn__txt">
      <span v-for="line in lines" :key="line">{{ line }}</span>
    </span>
  </v-tooltip>
</template>

<script setup>
// Message d'information du rapport Forecast, seulement s'il y a au moins une modification de
// prix, de catégorie ou de type :
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
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--cr-cmp);
  cursor: help;
}
.fsn:hover { background: var(--cr-cmp-bg); }
.fsn:focus-visible {
  outline: 2px solid var(--cr-cmp);
  outline-offset: 1px;
}
.fsn__txt { display: flex; flex-direction: column; gap: 6px; line-height: 1.35; }
</style>
