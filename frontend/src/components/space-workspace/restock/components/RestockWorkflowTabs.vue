<template>
  <nav class="rwt" role="tablist" :aria-label="t('srWorkflowTabsLabel')">
    <button
      v-for="tab in tabs"
      :key="tab.step"
      type="button"
      class="rwt-tab"
      :class="{ 'rwt-tab--active': currentStep === tab.step }"
      role="tab"
      :aria-selected="currentStep === tab.step ? 'true' : 'false'"
      :disabled="tab.disabled"
      :title="tab.disabled ? t('srWorkflowTabLockedHint') : undefined"
      @click="$emit('select', tab.step)"
    >
      <v-icon size="18">{{ tab.icon }}</v-icon>
      <span class="rwt-label">{{ tab.label }}</span>
    </button>
  </nav>
</template>

<script>
import { useI18n } from '@/i18n/useI18n'

/**
 * Barre d'onglets de la page Commandes : Éléments à stocker, Feuille de course,
 * Ventilation. Les numéros d'étape internes restent ceux de l'assistant
 * (1 = stock, 2 = ventilation, 3 = feuille de course) : seul l'ordre d'affichage
 * diffère. Les deux derniers onglets sont inactifs tant qu'aucune commande n'est
 * générée ou ouverte. Présentation seule : le parent traite `select`.
 */
export default {
  name: 'RestockWorkflowTabs',
  props: {
    currentStep: { type: Number, default: 1 },
    /** Vrai quand une commande est générée ou ouverte (onglets 2 et 3 actifs). */
    unlocked: { type: Boolean, default: false },
  },
  emits: ['select'],
  setup() {
    const { t } = useI18n()
    return { t }
  },
  computed: {
    tabs() {
      return [
        { step: 1, label: this.t('srStep1'), icon: 'mdi-package-variant-closed', disabled: false },
        { step: 3, label: this.t('srStep3'), icon: 'mdi-cart-outline', disabled: !this.unlocked },
        { step: 2, label: this.t('srStep2'), icon: 'mdi-table-split-cell', disabled: !this.unlocked },
      ]
    },
  },
}
</script>

<style scoped>
.rwt {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 24px;
  padding: 0 4px;
  margin-bottom: 4px;
  border-bottom: 1px solid var(--sr-border, #e5e7eb);
}
.rwt-tab {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 2px;
  margin-bottom: -1px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--sr-muted, #6b7280);
  font-size: var(--fs-md);
  font-weight: var(--fw-bold);
  letter-spacing: 0.02em;
  text-transform: uppercase;
  white-space: nowrap;
  cursor: pointer;
}
.rwt-tab:hover:not(:disabled) {
  color: var(--sr-text, #0f172a);
}
.rwt-tab--active,
.rwt-tab--active:hover:not(:disabled) {
  color: var(--sr-primary, #ff3131);
  border-bottom-color: var(--sr-primary, #ff3131);
}
.rwt-tab:disabled {
  color: var(--sr-faint, #9ca3af);
  opacity: 0.55;
  cursor: not-allowed;
}
.rwt-tab:focus-visible {
  outline: 2px solid var(--sr-primary, #ff3131);
  outline-offset: 2px;
  border-radius: 4px;
}
@media (max-width: 720px) {
  .rwt {
    gap: 14px;
  }
  .rwt-tab {
    font-size: var(--fs-sm);
  }
}
</style>
