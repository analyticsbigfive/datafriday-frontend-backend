<template>
  <!-- Badges d'usage d'un élément (doc §UsageSection) : l'utilisateur SAIT ce que
       l'élément porte avant de le modifier ou le supprimer. -->
  <span class="d-inline-flex ga-1 align-center">
    <v-chip v-if="usage.weezeventMapped" size="x-small" color="success" variant="tonal"
            :title="usage.weezeventLocationName ? t('b2WeezeventMappedWithLocation').replace('{location}', usage.weezeventLocationName) : t('b2WeezeventMapped')">
      ⚡<span v-if="!compact" class="ms-1">Weezevent</span>
    </v-chip>
    <!-- Count de la CONFIG ACTIVE : un item vendu en config A seulement
         ne doit pas badger l'élément sous B. -->
    <v-chip v-if="menuCount > 0" size="x-small" color="success" variant="tonal"
            :title="t('b2MenuItemsAssignedTitle').replace('{count}', menuCount)">
      🍔 {{ menuCount }}<span v-if="!compact" class="ms-1">{{ t('b2MenuItems') }}</span>
    </v-chip>
  </span>
</template>

<script setup>
import { computed, inject } from 'vue'
import { useI18n } from '@/i18n/useI18n'

const props = defineProps({
  elementId: { type: String, required: true },
  compact: { type: Boolean, default: false },
})

const { t } = useI18n()
const store = inject('builderStore')
const usage = computed(() => store.elementUsage(props.elementId))
const menuCount = computed(() => store.elementMenuCountForActiveConfig(props.elementId))
</script>
