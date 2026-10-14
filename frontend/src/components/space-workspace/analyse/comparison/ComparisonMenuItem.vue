<template>
  <v-list-item class="cmi" :aria-label="t('anCmpButtonTip')" @click="emit('open')">
    <template #prepend><v-icon size="18">mdi-compare</v-icon></template>
    <v-list-item-title>{{ t('anCmpMobileMenu') }}</v-list-item-title>
  </v-list-item>
</template>

<script setup>
// Entrée « Comparaison » du menu ⋮ mobile du bandeau (en tête de liste).
import { useI18n } from '@/i18n/useI18n'

const emit = defineEmits(['open'])
const { t } = useI18n()
</script>
