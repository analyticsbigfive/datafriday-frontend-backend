<template>
  <div v-if="open" class="ct-drawer-root" @keydown.esc="$emit('close')">
    <div class="ct-drawer__scrim" @click="$emit('close')" />
    <aside
      ref="drawerRef"
      class="ct-drawer"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ct-drawer-title"
      tabindex="-1"
    >
      <header class="ct-drawer__head">
        <div class="ct-drawer__headtext">
          <h2 id="ct-drawer-title" class="ct-drawer__title">{{ history ? history.article.name : '' }}</h2>
          <div class="ct-drawer__tags">
            <span v-for="tag in tags" :key="tag" class="ct-drawer__tag">{{ tag }}</span>
          </div>
        </div>
        <button type="button" class="ct-drawer__close" :aria-label="t('ctDrawerClose')" @click="$emit('close')">
          <X :size="18" />
        </button>
      </header>

      <div class="ct-drawer__scroll">
        <div v-if="loading" class="ct-drawer__state" role="status">{{ t('ctHistoryLoading') }}</div>
        <div v-else-if="error" class="ct-drawer__state" role="alert">{{ error }}</div>
        <div v-else-if="!versions.length" class="ct-drawer__state">{{ t('ctDrawerEmpty') }}</div>
        <template v-else>
          <div class="ct-drawer__kpis">
            <div v-for="kpi in kpis" :key="kpi.label" class="ct-drawer__kpi">
              <div class="ct-drawer__kpi-l">{{ kpi.label }}</div>
              <div class="ct-drawer__kpi-v">{{ kpi.value }}</div>
            </div>
          </div>
          <div>
            <p class="ct-drawer__section">{{ t('ctDrawerVersions') }}</p>
            <ul class="ct-drawer__list">
              <CostTrackingVersionItem
                v-for="(v, i) in versions"
                :key="v.id"
                :version="v"
                :previous="versions[i + 1] || null"
                :current="i === 0"
              />
            </ul>
          </div>
        </template>
      </div>
    </aside>
  </div>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { X } from 'lucide-vue-next'
import { useI18n } from '@/i18n/useI18n'
import { useCostTrackingFormat } from '@/composables/useCostTrackingFormat'
import { marginPercent } from '@/utils/costTrackingSeries'
import CostTrackingVersionItem from './CostTrackingVersionItem.vue'

// Panneau latéral d'historique d'un article : coût actuel, prix, marge, puis les versions de coût
// (cause, variation, recette figée). Esc, clic sur le fond ou la croix le ferment.
const props = defineProps({
  open: { type: Boolean, default: false },
  // { article: { id, name }, versions: [...] } (plus récente en premier), ou null.
  history: { type: Object, default: null },
  loading: { type: Boolean, default: false },
  error: { type: String, default: null },
  // Libellés type et catégorie de l'article.
  tags: { type: Array, default: () => [] },
})
defineEmits(['close'])

const { t } = useI18n()
const fmt = useCostTrackingFormat()

const drawerRef = ref(null)
const versions = computed(() => props.history?.versions || [])

const kpis = computed(() => {
  const cur = versions.value[0]
  if (!cur) return []
  return [
    { label: t('ctDrawerCurrentCost'), value: fmt.cost(cur.costPerPiece) },
    { label: t('ctDrawerPrice'), value: fmt.cost(cur.basePrice) },
    { label: t('ctDrawerMargin'), value: fmt.pctPlain(marginPercent(cur.costPerPiece, cur.basePrice)) },
  ]
})

// Le focus passe au panneau à l'ouverture, pour que Esc et le clavier fonctionnent aussitôt.
watch(
  () => props.open,
  async (isOpen) => {
    if (!isOpen) return
    await nextTick()
    drawerRef.value?.focus()
  },
)
</script>

<style scoped>
.ct-drawer__scrim {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: rgba(0, 0, 0, 0.32);
}
.ct-drawer {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 2001;
  display: flex;
  flex-direction: column;
  width: min(480px, 100%);
  background: var(--ct-surface);
  color: var(--ct-text);
  border-left: 1px solid var(--ct-border);
  box-shadow: -12px 0 32px rgba(0, 0, 0, 0.2);
  outline: none;
}
.ct-drawer__head {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 16px 18px;
  border-bottom: 1px solid var(--ct-border);
}
.ct-drawer__headtext {
  flex: 1;
  min-width: 0;
}
.ct-drawer__title {
  margin: 0;
  font-size: var(--fs-lg);
  font-weight: var(--fw-bold);
}
.ct-drawer__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}
.ct-drawer__tag {
  padding: 4px 10px;
  border: 1px solid var(--ct-border-strong);
  border-radius: 99px;
  background: var(--ct-surface);
  font-size: var(--fs-sm);
  font-weight: var(--fw-medium);
}
.ct-drawer__close {
  display: inline-grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--ct-muted);
  cursor: pointer;
}
.ct-drawer__close:hover {
  background: var(--ct-subtle);
}
.ct-drawer__scroll {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px 18px 24px;
  overflow-y: auto;
}
.ct-drawer__state {
  padding: 24px 0;
  text-align: center;
  color: var(--ct-muted);
  font-size: var(--fs-md);
}
.ct-drawer__kpis {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}
.ct-drawer__kpi {
  padding: 10px 12px;
  border: 1px solid var(--ct-border);
  border-radius: 10px;
  background: var(--ct-subtle);
}
.ct-drawer__kpi-l {
  color: var(--ct-muted);
  font-size: var(--fs-xs);
  font-weight: var(--fw-medium);
}
.ct-drawer__kpi-v {
  margin-top: 2px;
  font-size: var(--fs-lg);
  font-weight: var(--fw-bold);
  font-variant-numeric: tabular-nums;
}
.ct-drawer__section {
  margin: 0 0 8px;
  color: var(--ct-brand);
  font-size: var(--fs-xs);
  font-weight: var(--fw-bold);
  letter-spacing: 0.8px;
  text-transform: uppercase;
}
.ct-drawer__list {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin: 0;
  padding: 0 0 0 16px;
  border-left: 2px solid var(--ct-border-strong);
  list-style: none;
}
</style>
