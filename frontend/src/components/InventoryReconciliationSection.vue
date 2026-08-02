<template>
  <!-- Section « Reconciliation » — bas de la colonne gauche de Post-event
       Inventory, sous les filtres. Un document par événement réconcilié
       (StockReconciliation kind='post-event') ; clic → la vue réconciliation
       remplace le contenu central. Doc : docs/modules/10_POST_EVENT_INVENTORY.md §7. -->
  <div class="irs-panel">
    <button type="button" class="irs-head" @click="open = !open">
      <span class="irs-title">{{ t('invRecoSection') }}</span>
      <span v-if="items.length" class="irs-count">{{ items.length }}</span>
      <v-icon size="18" class="irs-chevron">{{ open ? 'mdi-chevron-up' : 'mdi-chevron-down' }}</v-icon>
    </button>

    <div v-if="open" class="irs-body">
      <div v-if="loading" class="irs-empty">{{ t('invRecoLoading') }}</div>
      <div v-else-if="!items.length" class="irs-empty">{{ t('invRecoEmpty') }}</div>
      <template v-else>
        <div
          v-for="reco in items"
          :key="reco.id"
          class="irs-row"
        >
          <button
            type="button"
            class="irs-item"
            :class="{ 'irs-item-active': reco.id === selectedId }"
            @click="$emit('select', reco.id)"
          >
            <span class="irs-item-name">{{ reco.eventName || t('invRecoUnknownEvent') }}</span>
            <!-- Liste COMMUNE pre + post (décision user 2026-07-20) → badge de type. -->
            <span class="irs-item-kind" :class="{ 'irs-item-kind--pre': reco.kind === 'pre-event' }">
              {{ t(reco.kind === 'pre-event' ? 'invRecoKindPre' : 'invRecoKindPost') }}
            </span>
            <span class="irs-item-date">{{ formatDate(reco.createdAt) }}</span>
          </button>
          <!-- Suppression (« repartir de zéro » : supprimer puis regénérer). -->
          <button
            type="button"
            class="irs-delete"
            :aria-label="t('invRecoDelete')"
            :title="t('invRecoDelete')"
            @click.stop="$emit('delete', reco.id)"
          >
            <v-icon size="15">mdi-trash-can-outline</v-icon>
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import { useNumberFormat } from '@/composables/useNumberFormat'

defineProps({
  items: { type: Array, default: () => [] }, // [{ id, eventId, eventName, createdAt }]
  selectedId: { type: String, default: null },
  loading: { type: Boolean, default: false },
})
defineEmits(['select', 'delete'])

const { t } = useI18n()
// Format de date suivant la langue de l'app (BUG-240) — plus de 'fr-FR' en dur.
const { intlLocale } = useNumberFormat()
const open = ref(true)

function formatDate(v) {
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(intlLocale.value, { day: '2-digit', month: '2-digit' })
}
</script>

<style scoped>
/* Carte alignée sur InventoryFilterPanel (même colonne) — contrat --fb-*
   partagé des workspaces F&B, sinon la section reste blanche en thème sombre. */
.irs-panel {
  background: var(--fb-surface, #FFFFFF);
  border: 1px solid var(--fb-border, #EEEEEE);
  border-radius: 12px;
  margin-top: 12px;
  overflow: hidden;
}
.irs-head {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  background: none;
  border: 0;
  cursor: pointer;
  text-align: left;
}
.irs-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--fb-text, #212121);
}
.irs-count {
  font-size: 11px;
  font-weight: 600;
  color: var(--fb-danger, #C62828);
  background: var(--fb-danger-soft, #FDECEA);
  border-radius: 999px;
  padding: 1px 7px;
}
.irs-chevron { margin-left: auto; color: var(--fb-faint, #9E9E9E); }
.irs-body { padding: 0 14px 10px; }
.irs-empty {
  font-size: 12px;
  color: var(--fb-faint, #9E9E9E);
  padding: 2px 0 6px;
}
.irs-row {
  display: flex;
  align-items: center;
  gap: 2px;
  margin: 0 -8px;
}
.irs-item {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 7px 8px;
  border: 0;
  background: none;
  border-radius: 8px;
  cursor: pointer;
  text-align: left;
}
.irs-delete {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: 0;
  background: none;
  border-radius: 6px;
  cursor: pointer;
  color: var(--fb-faint, #9E9E9E);
}
.irs-delete:hover {
  color: var(--fb-danger, #C62828);
  background: var(--fb-danger-soft, #FDECEA);
}
.irs-item:hover { background: var(--fb-subtle, #FAFAFA); }
.irs-item-active { background: var(--fb-danger-soft, #FDECEA); }
.irs-item-active:hover { background: var(--fb-danger-soft, #FDECEA); }
.irs-item-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--fb-text, #212121);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.irs-item-active .irs-item-name { color: var(--fb-danger, #C62828); }
.irs-item-date {
  margin-left: auto;
  font-size: 11px;
  color: var(--fb-muted, #9E9E9E);
  flex: none;
}
.irs-item-kind {
  flex: none;
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: .04em;
  text-transform: uppercase;
  color: var(--fb-muted, #757575);
  background: var(--fb-subtle, #F5F5F5);
  border-radius: 4px;
  padding: 1px 5px;
}
.irs-item-kind--pre {
  color: var(--fb-warning, #B45309);
  background: var(--fb-warning-soft, #FFF3E0);
}
</style>
