<template>
  <PosCollapsibleCard :title="t('posStockTitle')">
    <p class="pos-stock__text">{{ t('posStockText') }}</p>
  </PosCollapsibleCard>
</template>

<script setup>
import { useI18n } from '@/i18n/useI18n'
import PosCollapsibleCard from './PosCollapsibleCard.vue'

// Rappel du lien entre ventes POS et stock Logistic. Les compteurs « épuisé » / « stock bas » de
// la maquette ne sont pas dans les contrats staff (la disponibilité n'existe que dans le catalogue
// de la caisse) : le texte explicatif seul est affiché.
const { t } = useI18n()
</script>

<style scoped>
.pos-stock__text {
  margin: 0;
  color: var(--fb-muted, #6b7280);
  font-size: var(--fs-base);
  line-height: 1.5;
}
</style>
