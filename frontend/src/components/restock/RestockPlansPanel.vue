<template>
  <v-card variant="outlined" class="rpp-panel">
    <!-- Lot 3 — bandeau d'en-tête pleine largeur, parité stricte avec le
         panneau « Événements » (.sr-panel-head) juste en dessous dans la
         sidebar : fond teinté, filet bas, titre en majuscules, chip compteur. -->
    <header class="rpp-head">
      <div>
        <h2>{{ t('srPlansPanelTitle') }}</h2>
        <p>
          {{ plans.length }}
          {{ plans.length > 1 ? t('srPlansCountPlural') : t('srPlansCountSingular') }}
        </p>
      </div>
      <v-progress-circular v-if="loading" indeterminate size="16" width="2" />
      <v-chip v-else size="x-small" color="primary" variant="tonal">
        {{ plans.length }}
      </v-chip>
    </header>

    <div class="rpp-body">
    <!-- Lot 3 — l'échec de chargement était invisible : `available` restait à
         null sur erreur non-404, ce qui masquait le panneau ET le bouton
         « Sauvegarder le plan », sans message ni retry. -->
    <div v-if="error" class="rpp-error">
      <p>{{ t('srPlansPanelError') }}</p>
      <v-btn size="x-small" variant="tonal" @click="$emit('retry')">
        {{ t('srPlansPanelRetry') }}
      </v-btn>
    </div>

    <p v-else-if="!loading && !plans.length" class="rpp-empty">{{ t('srPlansPanelEmpty') }}</p>

    <ul v-else class="rpp-list">
      <li
        v-for="plan in plans"
        :key="plan.id"
        class="rpp-item"
        :class="{ 'rpp-item--active': plan.id === activePlanId }"
      >
        <template v-if="renamingId === plan.id">
          <div class="rpp-rename">
            <v-text-field
              v-model="renameValue"
              density="compact"
              variant="outlined"
              hide-details
              autofocus
              :aria-label="t('srPlanRename')"
              @keydown.enter.prevent="confirmRename(plan)"
              @keydown.esc.prevent="cancelRename"
            />
            <v-btn icon size="x-small" variant="text" :title="t('srPlanRenameConfirm')" @click="confirmRename(plan)">
              <v-icon size="16">mdi-check</v-icon>
            </v-btn>
            <v-btn icon size="x-small" variant="text" :title="t('srPlanRenameCancel')" @click="cancelRename">
              <v-icon size="16">mdi-close</v-icon>
            </v-btn>
          </div>
        </template>
        <template v-else>
          <button
            type="button"
            class="rpp-item-main"
            :title="t('srPlanLoad')"
            @click="$emit('load', plan.id)"
          >
            <span class="rpp-item-name">{{ plan.name || t('srPlanUnnamed') }}</span>
            <span class="rpp-item-meta">
              {{ planEventsLabel(plan) }}
            </span>
            <span class="rpp-item-meta">
              <!-- Compteurs AU MOMENT DE LA PHOTO (jamais recalculés). -->
              {{ plan.lineCount }} {{ t('srPlanCountLines') }} ·
              {{ plan.shoppingItemCount }} {{ t('srPlanCountShopping') }}
              <template v-if="updatedLabel(plan)"> · {{ updatedLabel(plan) }}</template>
            </span>
          </button>
          <v-menu location="bottom end">
            <template #activator="{ props: menuProps }">
              <v-btn
                icon
                size="x-small"
                variant="text"
                v-bind="menuProps"
                :aria-label="t('srPlanActions')"
              >
                <v-icon size="16">mdi-dots-vertical</v-icon>
              </v-btn>
            </template>
            <v-list density="compact">
              <v-list-item @click="$emit('load', plan.id)">
                <v-list-item-title>{{ t('srPlanLoad') }}</v-list-item-title>
              </v-list-item>
              <v-list-item
                :disabled="!canWrite"
                :title="canWrite ? undefined : t('srPlanReadOnlyHint')"
                @click="startRename(plan)"
              >
                <v-list-item-title>{{ t('srPlanRename') }}</v-list-item-title>
              </v-list-item>
              <v-list-item
                :disabled="!canWrite"
                :title="canWrite ? undefined : t('srPlanReadOnlyHint')"
                @click="$emit('duplicate', plan.id)"
              >
                <v-list-item-title>{{ t('srPlanDuplicate') }}</v-list-item-title>
              </v-list-item>
              <v-list-item
                :disabled="!canWrite"
                :title="canWrite ? undefined : t('srPlanReadOnlyHint')"
                class="rpp-delete"
                @click="deletingPlan = plan"
              >
                <v-list-item-title>{{ t('srPlanDelete') }}</v-list-item-title>
              </v-list-item>
            </v-list>
          </v-menu>
        </template>
      </li>
    </ul>

    <p v-if="!canWrite" class="rpp-readonly-hint">{{ t('srPlanReadOnlyHint') }}</p>
    </div>

    <!-- Confirmation de suppression (action destructive → jamais en un clic). -->
    <v-dialog :model-value="!!deletingPlan" max-width="420" @update:model-value="deletingPlan = null">
      <v-card v-if="deletingPlan">
        <v-card-title class="rpp-dialog-title">{{ t('srPlanDelete') }}</v-card-title>
        <v-card-text>
          {{ t('srPlanDeleteConfirm') }}
          <strong>{{ deletingPlan.name || t('srPlanUnnamed') }}</strong>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="deletingPlan = null">{{ t('srPlanRenameCancel') }}</v-btn>
          <v-btn color="error" variant="flat" @click="confirmDelete">{{ t('srPlanDelete') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-card>
</template>

<script>
// Panneau « Plans sauvegardés » de la sidebar Réarmement (ADR-0005).
// Présentation pure : la liste (métadonnées seules), le plan actif et le droit
// d'écriture viennent du parent ; toute action remonte en émission — le panneau
// ne parle jamais à l'API lui-même. Extrait de SpaceRestockView (6 300 lignes).
import { useI18n } from '@/i18n/useI18n'
import { useNumberFormat } from '@/composables/useNumberFormat'

export default {
  name: 'RestockPlansPanel',
  props: {
    /** Métadonnées des plans (useRestockPlans.plans) — jamais les photos. */
    plans: { type: Array, default: () => [] },
    loading: { type: Boolean, default: false },
    /** Plan actuellement chargé dans la vue (bandeau + surbrillance). */
    activePlanId: { type: String, default: null },
    /** front.fb.restock — sans lui : chargement seul (rôle restockBoard). */
    canWrite: { type: Boolean, default: false },
    /** Échec du chargement de la liste (hors 404) — rendu avec un retry. */
    error: { type: [Object, Error], default: null },
  },
  emits: ['load', 'rename', 'duplicate', 'delete', 'retry'],
  setup() {
    const { t } = useI18n()
    // Locale de l'UI (BUG-240 : jamais 'fr-FR' en dur pour les dates).
    const { intlLocale } = useNumberFormat()
    return { t, intlLocale }
  },
  data() {
    return {
      renamingId: null,
      renameValue: '',
      deletingPlan: null,
    }
  },
  methods: {
    planEventsLabel(plan) {
      const names = (plan.eventsSnapshot || []).map((e) => e?.name).filter(Boolean)
      if (!names.length) return this.t('srPlanNoEvent')
      if (names.length <= 2) return names.join(', ')
      return `${names.slice(0, 2).join(', ')} +${names.length - 2}`
    },
    updatedLabel(plan) {
      if (!plan.updatedAt) return ''
      const d = new Date(plan.updatedAt)
      if (Number.isNaN(d.getTime())) return ''
      return new Intl.DateTimeFormat(this.intlLocale, { day: 'numeric', month: 'short' }).format(d)
    },
    startRename(plan) {
      this.renamingId = plan.id
      this.renameValue = plan.name || ''
    },
    cancelRename() {
      this.renamingId = null
      this.renameValue = ''
    },
    confirmRename(plan) {
      const name = (this.renameValue || '').trim()
      if (name && name !== plan.name) this.$emit('rename', { id: plan.id, name })
      this.cancelRename()
    },
    confirmDelete() {
      if (this.deletingPlan) this.$emit('delete', this.deletingPlan.id)
      this.deletingPlan = null
    },
  },
}
</script>

<style scoped>
/* Lot 3 — parité visuelle avec `.sr-panel` / `.sr-panel-head` de
   SpaceRestockView (panneau « Événements », frère direct dans la sidebar).
   Le `padding` vivait sur la CARTE, ce qui interdisait structurellement un
   bandeau d'en-tête pleine largeur : il est descendu dans `.rpp-body`. */
.rpp-panel {
  display: flex;
  flex-direction: column;
  overflow: clip;
  margin-bottom: 16px;
  border-radius: var(--fb-radius-panel, 12px);
  border: 1px solid var(--sr-border, var(--fb-border, #e5e7eb));
  background: var(--sr-surface, var(--fb-surface, #fff));
  box-shadow: var(--fb-shadow-card, 0 1px 2px rgba(15, 23, 42, 0.06));
}
.rpp-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  padding: 14px 16px;
  background: var(--sr-subtle, var(--fb-surface-subtle, #f8fafc));
  border-bottom: 1px solid var(--sr-border, var(--fb-border, #e5e7eb));
}
.rpp-head h2 {
  font-size: 14px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--sr-text, var(--fb-text, #111827));
}
.rpp-head p {
  font-size: 12px;
  color: var(--sr-muted, var(--fb-text-muted, #6b7280));
  margin: 0;
}
.rpp-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
}
.rpp-empty,
.rpp-readonly-hint {
  font-size: 0.75rem;
  color: var(--sr-muted, var(--fb-text-muted, #6b7280));
  margin: 0;
}
.rpp-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.rpp-error p {
  margin: 0;
  font-size: 0.75rem;
  color: var(--fb-danger, #dc2626);
}
.rpp-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 320px;
  overflow-y: auto;
}
.rpp-item {
  display: flex;
  align-items: center;
  gap: 4px;
  border: 1px solid var(--fb-border, #e5e7eb);
  border-radius: 8px;
  padding: 6px 4px 6px 8px;
  background: var(--fb-surface, #fff);
}
.rpp-item--active {
  border-color: var(--fb-primary, #2563eb);
  background: var(--fb-primary-soft, rgba(37, 99, 235, 0.08));
}
.rpp-item-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
  text-align: left;
  background: none;
  border: 0;
  padding: 0;
  cursor: pointer;
  color: inherit;
}
.rpp-item-name {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--fb-text, #111827);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rpp-item-meta {
  font-size: 0.6875rem;
  color: var(--fb-text-muted, #6b7280);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rpp-rename {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 2px;
}
.rpp-delete :deep(.v-list-item-title) {
  color: var(--fb-danger, #dc2626);
}
.rpp-dialog-title {
  font-size: 1rem;
}
</style>
