<template>
  <!-- Carte espace « Settings HR » — dérivée de spaces/widgets/SpaceItem.vue :
       même image/badge/overlay, mais 4 métriques RH au lieu du revenue, + bouton
       Edit. Pas de navigation au clic (contrairement à SpaceItem). -->
  <div class="hsc-card" :class="{ 'hsc--dark': isDark }">

    <div class="hsc-img">
      <img :src="spaceImage" :alt="space?.name" />

      <div v-if="space?.spaceType" class="hsc-type-badge">{{ space.spaceType }}</div>

      <!-- Bouton Edit (ouvre le drawer d'édition par espace) -->
      <div class="hsc-actions">
        <button class="hsc-action-btn" :title="t('hrEditSpaceTitle')" @click="$emit('edit', space)">
          <Pencil :size="14" />
        </button>
      </div>

      <div class="hsc-overlay">
        <div class="hsc-name">{{ space?.name || '-' }}</div>
        <div class="hsc-meta">
          <span v-if="space?.city" class="hsc-meta__item"><MapPin :size="11" />{{ space.city }}</span>
          <span v-if="space?.maxCapacity" class="hsc-meta__item"><Users :size="11" />{{ formatNumber(space.maxCapacity) }}</span>
        </div>
      </div>
    </div>

    <div class="hsc-stats">
      <div class="hsc-stat">
        <div class="hsc-stat__label"><Wallet :size="11" /><span class="hsc-stat__label-text">{{ t('hrColStaffCostTotal') }}</span></div>
        <div class="hsc-stat__value" :class="staffCostTotal == null ? 'hsc-stat__value--muted' : 'hsc-stat__value--red'">{{ costTotalLabel }}</div>
      </div>
      <div class="hsc-stat">
        <div class="hsc-stat__label"><Target :size="11" /><span class="hsc-stat__label-text">{{ t('hrColGoalPerTpe') }}</span></div>
        <div class="hsc-stat__value" :class="goalPerTpe == null ? 'hsc-stat__value--muted' : 'hsc-stat__value--purple'">{{ goalLabel }}</div>
      </div>
      <div class="hsc-stat hsc-stat--bl">
        <div class="hsc-stat__label"><Calendar :size="11" /><span class="hsc-stat__label-text">{{ t('hrColStaffCostAvgEvent') }}</span></div>
        <div class="hsc-stat__value" :class="staffCostAvgEvent == null ? 'hsc-stat__value--muted' : 'hsc-stat__value--amber'">{{ costAvgLabel }}</div>
      </div>
      <div class="hsc-stat hsc-stat--bl">
        <div class="hsc-stat__label"><UserCog :size="11" /><span class="hsc-stat__label-text">{{ t('hrCardStaffPerZone') }}</span></div>
        <div class="hsc-stat__value" :class="staffPerZoneManager == null ? 'hsc-stat__value--muted' : 'hsc-stat__value--green'">{{ staffLabel }}</div>
      </div>
    </div>

  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useTheme } from 'vuetify'
import { Pencil, MapPin, Users, Target, UserCog, Wallet, Calendar } from 'lucide-vue-next'
import { t } from '@/i18n'

const props = defineProps({
  space: { type: Object, default: null },
  goalPerTpe: { type: Number, default: null },
  staffPerZoneManager: { type: Number, default: null },
  // Coûts staff agrégés (GET /hr-settings/costs) — null tant qu'aucune ligne EventStaffLine.
  staffCostTotal: { type: Number, default: null },
  staffCostAvgEvent: { type: Number, default: null },
  fallbackImage: { type: String, default: 'https://cdn.vuetifyjs.com/images/cards/docks.jpg' },
})
defineEmits(['edit'])

// Dark mode autonome (pattern maison) : la carte suit le thème Vuetify global,
// sans dépendre d'une prop passée par le parent.
const theme = useTheme()
const isDark = computed(() => !!theme.global.current.value.dark)

const spaceImage = computed(() => props.space?.image || props.fallbackImage)

const eur = (v) =>
  (Number(v) || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

const goalLabel = computed(() => (props.goalPerTpe == null ? '-' : eur(props.goalPerTpe)))
const costTotalLabel = computed(() => (props.staffCostTotal == null ? '-' : eur(props.staffCostTotal)))
const costAvgLabel = computed(() => (props.staffCostAvgEvent == null ? '-' : eur(props.staffCostAvgEvent)))
const staffLabel = computed(() =>
  props.staffPerZoneManager == null ? '-' : String(props.staffPerZoneManager),
)

function formatNumber(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n.toLocaleString('fr-FR') : '-'
}
</script>

<style scoped>
.hsc-card {
  border-radius: 16px;
  overflow: hidden;
  background: #fff;
  border: 1px solid rgba(0, 0, 0, .06);
  box-shadow: 0 2px 10px rgba(0, 0, 0, .06);
  transition: transform .22s ease, box-shadow .22s ease;
  display: flex;
  flex-direction: column;
  user-select: none;
}
.hsc-card:hover { transform: translateY(-5px); box-shadow: 0 18px 44px rgba(0, 0, 0, .14); }

.hsc-img { position: relative; height: 185px; overflow: hidden; flex-shrink: 0; }
.hsc-img img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform .35s ease; }
.hsc-card:hover .hsc-img img { transform: scale(1.05); }

.hsc-type-badge {
  position: absolute; top: 10px; left: 10px;
  background: rgba(255, 255, 255, .18);
  backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, .35);
  color: #fff; font-size: var(--fs-xs); font-weight: 700;
  letter-spacing: .06em; text-transform: uppercase;
  padding: 3px 10px; border-radius: 100px;
}

.hsc-actions { position: absolute; top: 10px; right: 10px; display: flex; gap: 5px; opacity: 0; transition: opacity .2s; }
.hsc-card:hover .hsc-actions { opacity: 1; }
.hsc-action-btn {
  width: 30px; height: 30px; border-radius: 8px;
  background: rgba(255, 255, 255, .9);
  backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
  border: none; display: flex; align-items: center; justify-content: center;
  cursor: pointer; color: #374151; transition: background .15s, color .15s, transform .1s;
}
.hsc-action-btn:hover { background: #fff; color: #ff3131; transform: scale(1.08); }

.hsc-overlay {
  position: absolute; bottom: 0; left: 0; right: 0;
  padding: 32px 14px 13px;
  background: linear-gradient(to top, rgba(0, 0, 0, .72) 0%, transparent 100%);
}
.hsc-name {
  font-size: var(--fs-md); font-weight: 700; color: #fff; line-height: 1.25;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 5px;
}
.hsc-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.hsc-meta__item { display: inline-flex; align-items: center; gap: 3px; font-size: var(--fs-xs); color: rgba(255, 255, 255, .8); }

.hsc-stats { display: grid; grid-template-columns: 1fr 1fr; border-top: 1px solid #f0f0f0; }
.hsc-stat { padding: 11px 14px; display: flex; flex-direction: column; gap: 3px; border-right: 1px solid #f0f0f0; transition: background .15s; }
.hsc-stat:nth-child(2n) { border-right: none; }
.hsc-stat--bl { border-top: 1px solid #f0f0f0; }
.hsc-stat:hover { background: #fafafa; }
.hsc-stat__label {
  display: flex; align-items: center; gap: 4px; min-width: 0;
  font-size: var(--fs-xs); font-weight: 700; letter-spacing: .05em;
  text-transform: uppercase; color: #9ca3af;
}
.hsc-stat__label-text { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hsc-stat__value { font-size: var(--fs-md); font-weight: 700; line-height: 1.2; }
.hsc-stat__value--amber { color: #d97706; }
.hsc-stat__value--green { color: #059669; }
.hsc-stat__value--muted { color: #cbd5e1; }
.hsc-stat__value--purple { color: #7c3aed; }
.hsc-stat__value--red { color: #ff3131; }

/* ── Dark (palette slate, parité MarketPriceListView) ── */
.hsc--dark { background: #1e293b; border-color: rgba(255, 255, 255, .08); box-shadow: 0 2px 10px rgba(0, 0, 0, .35); }
.hsc--dark .hsc-stats { border-top-color: rgba(255, 255, 255, .08); }
.hsc--dark .hsc-stat { border-right-color: rgba(255, 255, 255, .08); }
.hsc--dark .hsc-stat--bl { border-top-color: rgba(255, 255, 255, .08); }
.hsc--dark .hsc-stat:hover { background: #24324a; }
.hsc--dark .hsc-stat__label { color: #94a3b8; }
.hsc--dark .hsc-stat__value--amber { color: #fcd34d; }
.hsc--dark .hsc-stat__value--muted { color: #64748b; }
.hsc--dark .hsc-stat__value--purple { color: #c4b5fd; }
.hsc--dark .hsc-action-btn { background: rgba(30, 41, 59, .9); color: #cbd5e1; }
.hsc--dark .hsc-action-btn:hover { background: #0f172a; color: #ff3131; }
</style>
