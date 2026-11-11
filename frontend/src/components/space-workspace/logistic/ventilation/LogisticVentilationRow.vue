<template>
  <div class="lgvr-row" :class="{ 'lgvr-row--done': done }">
    <span class="lgvr-icon"><v-icon size="14">{{ icon }}</v-icon></span>
    <span class="lgvr-name">{{ label }}</span>
    <span class="lgvr-qty">
      <template v-if="changedLabel">
        <span class="lgvr-qty-old">{{ expectedLabel }}</span>
        <span class="lgvr-qty-new">{{ changedLabel }}</span>
      </template>
      <template v-else>{{ expectedLabel }}</template>
      <v-icon v-if="comment" size="14" class="lgvr-comment" :title="comment">mdi-comment-text-outline</v-icon>
    </span>
    <template v-if="canConfirm">
      <button
        type="button"
        class="lgvr-btn lgvr-btn--check"
        :class="{ 'lgvr-btn--on': done }"
        :title="t('logiVentilationCheckRow')"
        :aria-label="t('logiVentilationCheckRow')"
        :aria-pressed="done"
        :disabled="checkDisabled"
        @click="toggleDone"
      >
        <v-icon size="14">mdi-check</v-icon>
      </button>
      <button
        type="button"
        class="lgvr-btn"
        :title="t('logiDepositConfirmTitle')"
        :aria-label="t('logiDepositConfirmTitle')"
        :disabled="busy"
        @click="$emit('confirm')"
      >
        <v-icon size="14">mdi-pencil-outline</v-icon>
      </button>
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import { useVentilationLabels } from '@/composables/useVentilationLabels'
import { useInjectedVentilationChecks } from '@/composables/useVentilationChecks'

const { t } = useI18n()
const { quantityLabel } = useVentilationLabels()
const checks = useInjectedVentilationChecks()

const props = defineProps({
  /** Ligne à déposer (`quantity`, `packs`, `elementType`, `shopId`). */
  row: { type: Object, required: true },
  /** Article de la ligne (clé, unité, conditionnement). */
  item: { type: Object, required: true },
  /** Nom affiché : la destination (vue par article) ou l'article (vue par PdV). */
  label: { type: String, default: '' },
  /** Icône de l'article plutôt que celle de la destination (vue par PdV). */
  itemIcon: { type: Boolean, default: false },
  canConfirm: { type: Boolean, default: false },
})
defineEmits(['confirm'])

const icon = computed(() => {
  if (props.itemIcon) return 'mdi-package-variant-closed'
  return props.row.elementType === 'storage' ? 'mdi-warehouse' : 'mdi-storefront-outline'
})
// Stockage sans rien de prévu : seulement les boutons (maquette Bertrand 2026-10-09).
const hasQuantity = computed(() => Number(props.row.quantity) > 0 || Number(props.row.packs) > 0)
const expectedLabel = computed(() => (hasQuantity.value ? quantityLabel(props.item, props.row.quantity, props.row.packs) : ''))

const entry = computed(() => (checks ? checks.entry(props.item.itemKey, props.row.shopId) : null))
// Cochée = entièrement déposée (le checkmark écrit un vrai dépôt de stock).
const done = computed(() => !!entry.value?.checked)
// Un geste à la fois (double clic = double dépôt) ; sans quantité prévue, rien à déposer :
// le crayon reste le moyen de saisir un dépôt à la main.
const busy = computed(() => !!checks?.busy?.value)
const checkDisabled = computed(() => busy.value || (!done.value && !hasQuantity.value))
const comment = computed(() => entry.value?.comment || null)

// Quantité saisie différente de la prévue : prévue barrée, saisie à côté.
const changedLabel = computed(() => {
  const q = entry.value?.quantity
  // Quantité modifiée au crayon : montrée seulement une fois la ligne entièrement déposée.
  if (q == null || !hasQuantity.value || !props.row.covered) return ''
  const expectedUnits = props.row.packs != null && props.item.unitsPerPack
    ? Number(props.row.packs) * Number(props.item.unitsPerPack)
    : Number(props.row.quantity)
  if (Math.abs(q - expectedUnits) < 0.0005) return ''
  const packs = props.row.packs != null && props.item.unitsPerPack ? q / Number(props.item.unitsPerPack) : null
  return quantityLabel(props.item, q, packs)
})

function toggleDone() {
  if (checks) checks.toggleRow(props.item.itemKey, props.row.shopId).catch(() => {})
}
</script>

<style scoped>
.lgvr-row { display: grid; grid-template-columns: 26px minmax(0, 1fr) auto auto auto; align-items: center; gap: 10px; padding: 9px 12px; border: 1px solid var(--fb-border, #e5e7eb); border-radius: 10px; background: var(--fb-subtle, #fafafa); }
.lgvr-row--done { border-color: #bbf7d0; background: var(--fb-success-soft, #f0fdf4); }
.lgvr-icon { width: 26px; height: 26px; border-radius: 7px; background: var(--fb-surface, #fff); border: 1px solid var(--fb-border, #e5e7eb); display: flex; align-items: center; justify-content: center; color: var(--fb-muted, #6b7280); }
.lgvr-row--done .lgvr-icon { color: var(--fb-success, #16a34a); border-color: #bbf7d0; }
.lgvr-name { font-size: var(--fs-base); font-weight: var(--fw-bold); color: var(--fb-text, #212121); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lgvr-qty { display: inline-flex; align-items: center; gap: 6px; font-size: var(--fs-base); font-weight: var(--fw-bold); color: #B45309; white-space: nowrap; }
.lgvr-row--done .lgvr-qty { color: var(--fb-success, #16a34a); }
.lgvr-qty-old { text-decoration: line-through; color: var(--fb-faint, #9ca3af); font-weight: var(--fw-regular); }
.lgvr-qty-new { color: var(--fb-success, #16a34a); }
.lgvr-comment { color: var(--fb-muted, #6b7280); }
.lgvr-btn { width: 26px; height: 26px; border-radius: 7px; border: 1px solid var(--fb-border, #e5e7eb); display: flex; align-items: center; justify-content: center; cursor: pointer; background: var(--fb-surface, #fff); color: var(--fb-muted, #6b7280); }
.lgvr-btn:hover { background: var(--fb-subtle, #f3f4f6); }
.lgvr-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.lgvr-btn--on { background: var(--fb-success, #16a34a); border-color: var(--fb-success, #16a34a); color: #fff; }
.lgvr-btn--on:hover { background: var(--fb-success, #16a34a); }
</style>
