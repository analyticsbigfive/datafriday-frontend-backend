<template>
  <div class="lkr-grid">
    <KpiCard :config="revenueConfig" :value="formatCurrency(revenue)" :loading="loading" />
    <KpiCard :config="txConfig" :value="formatNumber(transactionCount)" :loading="loading" />
    <KpiCard :config="txPerMinConfig" :value="txPerMinute.toFixed(1)" :loading="loading" />
    <KpiCard :config="avgSpendConfig" :value="formatCurrency(avgSpendPerTx)" :loading="loading" />
    <KpiCard :config="itemsConfig" :value="formatNumber(itemsCount)" :loading="loading" />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import { formatCurrencyDetailed, formatNumber } from '@/composables/useFormatters'
import { KPI_CARDS } from '@/constants/analyseColors'
import KpiCard from '@/components/analyse/panels/KpiCard.vue'

const { t } = useI18n()
const formatCurrency = (v) => formatCurrencyDetailed(v)

defineProps({
  revenue: { type: Number, default: 0 },
  transactionCount: { type: Number, default: 0 },
  txPerMinute: { type: Number, default: 0 },
  avgSpendPerTx: { type: Number, default: 0 },
  itemsCount: { type: Number, default: 0 },
  loading: { type: Boolean, default: false },
})

// Réutilise la config officielle KPI_CARDS (couleurs/icônes déjà validées, alignées
// sur la maquette Figma d'Analyse) — juste le libellé qui change quand ce n'est pas
// déjà une carte existante (transactions/panier moyen/articles n'y sont pas).
const revenueConfig = computed(() => KPI_CARDS.find((c) => c.key === 'revenue'))
const txPerMinConfig = computed(() => KPI_CARDS.find((c) => c.key === 'transactionRate'))
const txConfig = computed(() => ({ ...revenueConfig.value, key: 'tx', label: t('liveKpiTransactions'), icon: 'mdi-receipt-text-outline' }))
const avgSpendConfig = computed(() => ({ ...revenueConfig.value, key: 'avgSpend', label: t('liveKpiAvgSpend'), icon: 'mdi-cash-multiple' }))
const itemsConfig = computed(() => ({ ...txPerMinConfig.value, key: 'items', label: t('liveKpiItems'), icon: 'mdi-shopping-outline' }))
</script>

<style scoped>
.lkr-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px;
  margin-bottom: 14px;
}
</style>
