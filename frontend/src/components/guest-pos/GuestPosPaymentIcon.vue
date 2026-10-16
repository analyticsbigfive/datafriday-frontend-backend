<template>
  <component :is="icon" :size="size" aria-hidden="true" />
</template>

<script setup>
// Icône d'un moyen de paiement selon la clé de présentation de son `kind` (utils/posPaymentKinds.js).
import { computed } from 'vue'
import { Banknote, CreditCard, Ticket, Smartphone, Wallet } from 'lucide-vue-next'

const props = defineProps({
  iconKey: { type: String, default: 'wallet' },
  size: { type: Number, default: 22 },
})

const ICONS = { banknote: Banknote, card: CreditCard, voucher: Ticket, phone: Smartphone, wallet: Wallet }
const icon = computed(() => ICONS[props.iconKey] || Wallet)
</script>
