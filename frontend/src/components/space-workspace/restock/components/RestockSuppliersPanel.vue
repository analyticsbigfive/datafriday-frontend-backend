<template>
  <div class="rsp-card">
    <header class="rsp-head">
      <span class="rsp-title">
        <v-icon size="18" class="rsp-title-icon">mdi-truck-outline</v-icon>
        {{ t('srSuppliersPreviewTitle') }}
      </span>
      <span class="rsp-count">{{ groups.length }}</span>
    </header>

    <p v-if="!generated" class="rsp-empty">{{ t('srSuppliersPreviewHint') }}</p>
    <p v-else-if="!groups.length" class="rsp-empty">{{ t('srSuppliersPreviewEmpty') }}</p>

    <div v-else class="rsp-list">
      <div
        v-for="g in groups"
        :key="g.supplierId"
        class="rsp-item"
        role="button"
        tabindex="0"
        @click="$emit('select', g.supplierId)"
        @keyup.enter="$emit('select', g.supplierId)"
      >
        <span class="rsp-item-copy">
          <strong>{{ g.supplierName }}</strong>
          <small>{{ g.items.length }} {{ g.items.length > 1 ? t('srArticlePlural') : t('srArticleSingular') }}</small>
        </span>
        <span class="rsp-item-total">
          <strong>{{ unitsTotal(g) }}</strong>
          <small>{{ t('srSuppliersUnits') }}</small>
        </span>
        <div class="rsp-item-bar">
          <span :style="{ width: share(g) + '%' }" />
        </div>
        <button type="button" class="rsp-item-email" @click.stop="$emit('email', g)">
          <v-icon size="14" class="me-1">mdi-email-outline</v-icon>
          {{ t('srSuppliersEmailBtn') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script>
import { useI18n } from '@/i18n/useI18n'

/**
 * Carte « Fournisseurs » de la colonne de droite (aperçu des groupes de la
 * feuille de course). Présentation seule : le parent fournit les groupes déjà
 * affichés et traite les événements `select` (aller au fournisseur) et `email`.
 */
export default {
  name: 'RestockSuppliersPanel',
  props: {
    groups: { type: Array, default: () => [] },
    generated: { type: Boolean, default: false },
  },
  emits: ['select', 'email'],
  setup() {
    const { t } = useI18n()
    return { t }
  },
  methods: {
    unitsTotal(group) {
      const raw = (group.items || []).reduce((s, it) => s + (Number(it.quantity) || 0), 0)
      return Math.round(raw)
    },
    share(group) {
      const max = Math.max(1, ...this.groups.map((g) => this.unitsTotal(g)))
      return Math.round((this.unitsTotal(group) / max) * 100)
    },
  },
}
</script>

<style scoped>
.rsp-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  background: var(--sr-surface, #ffffff);
  border: 1px solid #dde1e7;
  border-radius: 12px;
  box-shadow: var(--fb-shadow-card, 0 1px 3px rgba(15, 23, 42, 0.04));
}
.rsp-head { display: flex; align-items: center; justify-content: space-between; }
.rsp-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--fs-md);
  font-weight: var(--fw-bold);
  color: var(--sr-text, #0f172a);
}
.rsp-title-icon { color: var(--sr-muted, #6b7280); }
.rsp-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  height: 24px;
  padding: 0 8px;
  border-radius: 100px;
  background: rgba(255, 49, 49, 0.1);
  color: #ff3131;
  font-size: var(--fs-sm);
  font-weight: var(--fw-bold);
}
.rsp-empty {
  margin: 0;
  padding: 12px 8px 4px;
  text-align: center;
  font-size: var(--fs-sm);
  line-height: 1.4;
  color: var(--sr-faint, #9ca3af);
}
.rsp-list { display: flex; flex-direction: column; gap: 10px; overflow-y: auto; }
.rsp-item {
  display: grid;
  grid-template-columns: 1fr auto;
  grid-template-areas: 'copy total' 'bar bar' 'email email';
  gap: 6px 10px;
  align-items: center;
  padding: 10px 12px;
  text-align: left;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: var(--sr-surface, #fff);
  cursor: pointer;
  transition: border-color 160ms ease, box-shadow 160ms ease;
}
.rsp-item:hover { border-color: rgba(255, 49, 49, 0.26); box-shadow: 0 3px 12px rgba(15, 23, 42, 0.06); }
.rsp-item-copy { grid-area: copy; display: flex; flex-direction: column; min-width: 0; }
.rsp-item-copy strong {
  font-size: var(--fs-md);
  font-weight: var(--fw-bold);
  color: var(--sr-text, #0f172a);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.rsp-item-copy small { font-size: var(--fs-sm); color: var(--sr-muted, #6b7280); }
.rsp-item-total { grid-area: total; display: flex; flex-direction: column; text-align: right; }
.rsp-item-total strong {
  font-size: var(--fs-lg);
  font-weight: var(--fw-bold);
  color: #ff3131;
  font-variant-numeric: tabular-nums;
}
.rsp-item-total small { font-size: var(--fs-xs); color: var(--sr-faint, #9ca3af); }
.rsp-item-bar { grid-area: bar; height: 4px; border-radius: 100px; background: #eef0f3; overflow: hidden; }
.rsp-item-bar span { display: block; height: 100%; background: #ff3131; border-radius: 100px; }
.rsp-item-email {
  grid-area: email;
  justify-self: end;
  display: inline-flex;
  align-items: center;
  padding: 4px 12px;
  border-radius: 100px;
  border: 1px solid rgba(255, 49, 49, 0.35);
  background: rgba(255, 49, 49, 0.06);
  color: #ff3131;
  font-size: var(--fs-sm);
  font-weight: var(--fw-semibold);
  cursor: pointer;
  transition: background-color 140ms ease;
}
.rsp-item-email:hover { background: rgba(255, 49, 49, 0.14); }
</style>
