<template>
  <div class="pos-pdv" :class="{ 'pos-pdv--active': active }">
    <div class="pos-pdv__main">
      <span class="pos-pdv__dot" :class="`pos-pdv__dot--${pdv.status}`" :title="statusLabel" role="img" :aria-label="statusLabel" />
      <div class="pos-pdv__info">
        <div class="pos-pdv__name" :title="pdv.name">{{ pdv.name }}</div>
        <div class="pos-pdv__meta" :title="metaLine">{{ metaLine }}</div>
        <PosResponsibleSelect
          :responsible-id="pdv.responsibleHrPersonId"
          :responsible-name="pdv.responsibleName"
          :options="hrOptions"
          :can-edit="canEditResponsible"
          :disabled="working"
          @select="(id, name) => $emit('set-responsible', pdv, id, name)"
        />
      </div>
    </div>

    <div class="pos-pdv__side">
      <PosPinBadge
        v-if="active && pdv.pin"
        :pin="pdv.pin"
        :can-reset="canManage"
        :disabled="working"
        @reset="$emit('reset-pin', pdv)"
      />

      <button
        type="button"
        class="pos-pdv__toggle"
        :class="{ 'pos-pdv__toggle--on': active }"
        :disabled="working"
        :aria-label="toggleLabel"
        :title="toggleLabel"
        @click="$emit('toggle', pdv)"
      >
        <v-progress-circular v-if="working" indeterminate size="16" width="2" />
        <v-icon v-else size="18">{{ active ? 'mdi-stop' : 'mdi-play' }}</v-icon>
      </button>

      <v-btn v-if="active" class="pos-pdv__open" @click="$emit('open-cashier', pdv)">
        <v-icon size="16" class="mr-2">mdi-fullscreen</v-icon>
        {{ t('posOpenCashier') }}
      </v-btn>
      <span v-else class="pos-pdv__hint">{{ t('posStartToOpen') }}</span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { POS_STATUS_LABEL_KEYS, usePosFormat } from '@/composables/usePosFormat'
import PosPinBadge from './PosPinBadge.vue'
import PosResponsibleSelect from './PosResponsibleSelect.vue'

// Carte d'un PdV : le nom d'abord (c'est l'information principale, il prend toute la place libre),
// statut de la caisse porté par la pastille de couleur (libellé en infobulle), PIN, ▶ / ■,
// responsable RH, ouverture de la caisse. Les sources de vente et le libellé du statut ne sont
// plus écrits sur la carte.
const props = defineProps({
  pdv: { type: Object, required: true }, // PosPdvRow
  hrOptions: { type: Array, default: () => [] },
  canEditResponsible: { type: Boolean, default: true },
  canManage: { type: Boolean, default: false },
  working: { type: Boolean, default: false },
})
defineEmits(['toggle', 'open-cashier', 'set-responsible', 'reset-pin'])

const { t } = usePosFormat()
const active = computed(() => props.pdv.status !== 'inactive')
const statusLabel = computed(() => t(POS_STATUS_LABEL_KEYS[props.pdv.status] || POS_STATUS_LABEL_KEYS.inactive))
const toggleLabel = computed(() => t(active.value ? 'posStopPdv' : 'posStartPdv'))
const metaLine = computed(() =>
  [props.pdv.zoneLabel, props.pdv.spaceMenuLabel, t('posItemsCount').replace('{count}', String(props.pdv.itemsCount ?? 0))]
    .filter(Boolean)
    .join(' · ')
)
</script>

<style scoped>
.pos-pdv {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  box-sizing: border-box;
  padding: 14px 16px;
  border: 1px solid var(--fb-border, #e5e7eb);
  border-radius: var(--fb-radius-card, 16px);
  background: var(--fb-surface, #ffffff);
  box-shadow: var(--fb-shadow-card, 0 1px 3px rgba(15, 23, 42, 0.05));
}
.pos-pdv--active {
  border-color: #cfe9d8;
}
.pos-pdv__main {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  gap: 14px;
  min-width: 0;
}
.pos-pdv__dot {
  width: 10px;
  height: 10px;
  flex-shrink: 0;
  border-radius: 5px;
  background: #d1d5db;
}
.pos-pdv__dot--ready {
  background: var(--fb-warning, #d97706);
}
.pos-pdv__dot--selling {
  background: var(--fb-success, #16a34a);
}
.pos-pdv__info {
  flex: 1 1 auto;
  min-width: 0;
}
/* Le nom reste lisible en entier (retour à la ligne si vraiment trop long) ; le détail est tronqué. */
.pos-pdv__name {
  font-size: var(--fs-md);
  font-weight: var(--fw-bold);
  overflow-wrap: anywhere;
}
.pos-pdv__meta {
  margin-top: 2px;
  overflow: hidden;
  color: var(--fb-muted, #6b7280);
  font-size: var(--fs-base);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pos-pdv__side {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  gap: 12px;
}
.pos-pdv__toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  border: 1px solid #d1d5db;
  border-radius: 20px;
  background: var(--fb-surface, #ffffff);
  color: #374151;
  cursor: pointer;
}
.pos-pdv__toggle--on {
  border-color: var(--fb-primary, #d63031);
  background: var(--fb-primary-soft, #fff5f5);
  color: var(--fb-primary, #d63031);
}
.pos-pdv__toggle:disabled {
  opacity: 0.6;
  cursor: default;
}
.pos-pdv__toggle:focus-visible {
  outline: 3px solid rgba(255, 49, 49, 0.18);
  outline-offset: 2px;
}
.pos-pdv__open {
  height: 40px;
  padding: 0 14px;
  border-radius: var(--fb-radius-control, 8px);
  background: var(--fb-primary, #d63031) !important;
  color: #ffffff !important;
  font-size: var(--fs-base);
  font-weight: var(--fw-bold);
  letter-spacing: 0;
  text-transform: none;
  white-space: nowrap;
}
.pos-pdv__hint {
  width: 120px;
  color: var(--fb-faint, #9ca3af);
  font-size: var(--fs-sm);
  text-align: center;
}
@media (max-width: 900px) {
  .pos-pdv {
    flex-direction: column;
    align-items: stretch;
  }
  .pos-pdv__side {
    flex-wrap: wrap;
  }
}
</style>
