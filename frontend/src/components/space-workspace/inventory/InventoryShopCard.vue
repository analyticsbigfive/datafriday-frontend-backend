<template>
  <div class="si-row" :class="{ 'si-row-disabled': totalItems === 0, 'si-row-complete': isCounted }">
    <!-- Nom + meta -->
    <div class="si-row-main">
      <span class="si-row-name">
        {{ entry?.element?.name }}
        <span v-if="entry?.element?.isOpen === false" class="si-row-closed-chip">
          {{ t('invShopClosed') }}
        </span>
        <!-- « Voir tout l'inventaire » : PdV d'une autre configuration que celle de l'event. -->
        <span v-if="entry?.element?.outsideEventConfig" class="si-row-closed-chip si-row-outside-chip">
          {{ t('invOutsideEventConfig') }}
        </span>
      </span>
      <span v-if="metaText" class="si-row-meta">{{ metaText }}</span>
      <!-- PdV sans article assigné : visible mais clairement marqué (jamais masqué). -->
      <span v-if="totalItems === 0" class="si-row-meta si-row-no-menu">
        {{ t('invCardNoMenuAssigned') }}
      </span>
    </div>

    <!-- Progression + compteur -->
    <div class="si-row-progress">
      <v-progress-linear :model-value="progress" :color="statusColor" height="5" rounded class="si-row-bar" />
      <!-- Libellé « À compter / Compté » retiré : la pastille porte le statut
           (rouge / orange / verte, document Bertrand 2026-10-06 page 5). -->
      <span class="si-row-count">
        {{ countedItems }} / {{ totalItems }} {{ t('invCardItems') }}
        <InventoryStatusDot :status="countingStatus" class="si-row-dot" />
      </span>
    </div>

    <!-- Accès PIN invité (directeur uniquement) — composant à part entière, ne
         porte aucune logique ici : cf. GuestPinBadge.vue. -->
    <GuestPinBadge
      v-if="showGuestPin"
      :phase="phase"
      :element-id="entry.element.id"
      :slug="entry.element.slug"
      :element-name="entry.element.name"
    />

    <!-- Mise à jour Logistic de ce PDV (responsable logistique / administrateur) :
         composant à part entière, cf. PdvLogisticUpdateButton.vue. -->
    <PdvLogisticUpdateButton
      v-if="logisticUpdate"
      :space-id="logisticUpdate.spaceId"
      :event-id="logisticUpdate.eventId"
      :phase="logisticUpdate.phase"
      :element-id="entry.element.id"
      :element-name="entry.element.name"
      :has-counts="countedItems > 0"
    />

    <!-- « Recompter » ce PDV : post-event seulement, même droit que la mise à jour
         Logistic. Composant à part entière, cf. PdvRecountButton.vue. -->
    <PdvRecountButton
      v-if="logisticUpdate && logisticUpdate.phase === 'post-event'"
      :space-id="logisticUpdate.spaceId"
      :event-id="logisticUpdate.eventId"
      :element-id="entry.element.id"
      :element-name="entry.element.name"
      :has-counts="countedItems > 0"
      @recounted="$emit('recounted', entry)"
    />

    <!-- Action : libellé selon l'avancement (rien / en cours / terminé) -->
    <v-btn
      :color="isCounted ? 'grey-darken-2' : 'primary'"
      :variant="isCounted ? 'outlined' : 'flat'"
      size="small"
      :disabled="totalItems === 0"
      class="si-row-action"
      @click="$emit('start-count', entry)"
    >
      <v-icon size="15" class="mr-1">{{ actionIcon }}</v-icon>
      {{ actionLabel }}
    </v-btn>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import GuestPinBadge from './GuestPinBadge.vue'
import PdvLogisticUpdateButton from './PdvLogisticUpdateButton.vue'
import PdvRecountButton from './PdvRecountButton.vue'
import InventoryStatusDot from './InventoryStatusDot.vue'

const { t } = useI18n()

const props = defineProps({
  entry: { type: Object, required: true },
  shownItems: { type: Number, default: 0 },
  totalItems: { type: Number, default: 0 },
  // Nombre d'articles déjà comptés dans ce PdV → pilote le libellé du bouton.
  countedItems: { type: Number, default: 0 },
  progress: { type: Number, default: 0 },
  // 'to-count' | 'in-progress' | 'counted' (utils/inventoryCountingStatus).
  countingStatus: { type: String, default: 'to-count' },
  statusColor: { type: String, default: 'grey' },
  // Accès PIN invité (directeur uniquement, permission front.fb.guestPinManage) —
  // phase transite tel quel, aucune logique dans cette carte.
  showGuestPin: { type: Boolean, default: false },
  phase: { type: String, default: null },
  // { spaceId, eventId, phase } quand l'utilisateur peut mettre Logistic à jour par
  // PDV (front.fb.logisticReconcile) ; null sinon, aucun bouton.
  logisticUpdate: { type: Object, default: null },
})

defineEmits(['start-count', 'recounted'])

const shopTypeText = computed(() => {
  const v = props.entry?.element?.shopType
  return Array.isArray(v) ? v.join(', ') : v
})

// Ligne meta : type · zone · étage — chaque champ optionnel.
const metaText = computed(() => {
  const el = props.entry?.element || {}
  return [shopTypeText.value, el.shopArea, el.floorName].filter(Boolean).join(' · ')
})

// Tous les articles comptés → PdV terminé.
const isCounted = computed(() => props.totalItems > 0 && props.countedItems >= props.totalItems)

// Libellé du bouton selon l'avancement : aucun / en cours / terminé.
const actionLabel = computed(() => {
  if (props.totalItems === 0) return t('invCardNoItems')
  if (isCounted.value) return t('invCardReviewCount')
  if (props.countedItems > 0) return t('invCardContinueCount')
  return t('invCardStartCount')
})
const actionIcon = computed(() =>
  isCounted.value ? 'mdi-clipboard-check-outline' : 'mdi-clipboard-edit-outline',
)
</script>

<style scoped>
.si-row {
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 64px;
  padding: 9px 14px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  transition: border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
}
.si-row:hover {
  border-color: #d1d5db;
  box-shadow: 0 3px 12px rgba(15, 23, 42, 0.06);
  transform: translateY(-1px);
}
.si-row-complete { background: #fbfefc; }
.si-row-disabled { opacity: 0.6; }
.si-row-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1 1 40%;
}
.si-row-name {
  font-weight: 700;
  color: #212121;
  font-size: 0.9rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.si-row-meta {
  font-size: 0.75rem;
  color: #9E9E9E;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.si-row-no-menu {
  color: #B45309;
  font-style: italic;
}
.si-row-closed-chip {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--fb-subtle, #F3F4F6);
  color: var(--fb-muted, #6B7280);
  font-size: 0.66rem;
  font-weight: 650;
  vertical-align: 1px;
}
.si-row-outside-chip {
  background: #FEF3C7;
  color: #92400E;
}
.si-row-progress {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1 1 180px;
  min-width: 130px;
}
.si-row-count {
  font-size: 0.78rem;
  color: #6B7280;
}
.si-row-dot { margin-left: 4px; }
.si-row-action :deep(.v-btn__content) {
  white-space: nowrap;
}
.si-row-action {
  flex-shrink: 0;
  min-width: 142px;
  border-radius: 8px;
  text-transform: none;
  font-weight: 700;
}

@media (max-width: 760px) {
  .si-row {
    flex-wrap: wrap;
    gap: 10px 12px;
  }
  .si-row-main { flex-basis: 100%; }
  .si-row-progress { flex-basis: 100%; }
  .si-row-action { margin-left: auto; }
}

.si-row {
  border-color: var(--fb-border, #E5E7EB);
  border-radius: var(--fb-radius-panel, 12px);
  background: var(--fb-surface, #FFFFFF);
  box-shadow: var(--fb-shadow-card, 0 1px 3px rgba(15, 23, 42, 0.05));
}
.si-row:hover {
  border-color: rgba(255, 49, 49, 0.26);
  box-shadow: var(--fb-shadow-hover, 0 4px 16px rgba(15, 23, 42, 0.08));
  /* Fond visible au survol (sinon blanc sur blanc, survol invisible). */
  background: rgba(255, 49, 49, 0.05);
}
.si-row-complete {
  background: var(--fb-success-soft, #F0FDF4);
}
.si-row-name {
  color: var(--fb-text, #212121);
}
.si-row-meta,
.si-row-count {
  color: var(--fb-muted, #6B7280);
}
.si-row-action {
  border-radius: var(--fb-radius-control, 8px);
  font-variant-numeric: tabular-nums;
}
.si-row-action:focus-visible {
  outline: 3px solid rgba(255, 49, 49, 0.18);
  outline-offset: 2px;
}

/* ===================== DARK MODE =====================
   Fond/bordure/texte suivent les `--fb-*`. Reste la teinte sémantique
   « ambre 700 », prévue pour du texte sur fond clair et illisible sur fond
   sombre → version claire de la même famille. */
.v-theme--dataFridayDark .si-row-no-menu {
  color: #fcd34d;
}
</style>
