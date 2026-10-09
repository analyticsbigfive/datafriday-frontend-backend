<template>
  <div class="lgvr-row">
    <span class="lgvr-icon"><v-icon size="14">{{ icon }}</v-icon></span>
    <span class="lgvr-name">{{ label }}</span>
    <span class="lgvr-qty">{{ hasQuantity ? quantityLabel(item, row.quantity, row.packs) : '' }}</span>
    <button
      v-if="canConfirm"
      type="button"
      class="lgvr-confirm"
      :title="t('logiDepositConfirmTitle')"
      @click="$emit('confirm')"
    >
      <v-icon size="14">mdi-plus</v-icon>
    </button>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import { useVentilationLabels } from '@/composables/useVentilationLabels'

const { t } = useI18n()
const { quantityLabel } = useVentilationLabels()

const props = defineProps({
  /** Ligne à déposer (`quantity`, `packs`, `elementType`). */
  row: { type: Object, required: true },
  /** Article de la ligne (unité, conditionnement). */
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
// Stockage sans rien de prévu : seulement le « + » (maquette Bertrand 2026-10-09).
const hasQuantity = computed(() => Number(props.row.quantity) > 0 || Number(props.row.packs) > 0)
</script>

<style scoped>
.lgvr-row { display: grid; grid-template-columns: 26px minmax(0, 1fr) auto auto; align-items: center; gap: 10px; padding: 9px 12px; border: 1px solid var(--fb-border, #e5e7eb); border-radius: 10px; background: var(--fb-subtle, #fafafa); }
.lgvr-icon { width: 26px; height: 26px; border-radius: 7px; background: var(--fb-surface, #fff); border: 1px solid var(--fb-border, #e5e7eb); display: flex; align-items: center; justify-content: center; color: var(--fb-muted, #6b7280); }
.lgvr-name { font-size: var(--fs-base); font-weight: var(--fw-bold); color: var(--fb-text, #212121); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lgvr-qty { font-size: var(--fs-base); font-weight: var(--fw-bold); color: #B45309; white-space: nowrap; }
.lgvr-confirm { width: 26px; height: 26px; border-radius: 7px; border: 0; display: flex; align-items: center; justify-content: center; cursor: pointer; background: var(--fb-success-soft, #f0fdf4); color: var(--fb-success, #16a34a); }
</style>
