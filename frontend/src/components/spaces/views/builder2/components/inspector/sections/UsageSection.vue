<template>
  <SectionCard :title="t('b2UsageTitle')" icon="mdi-link-variant" default-open>
    <div class="d-flex flex-column ga-2">
      <div class="d-flex align-center ga-2">
        <v-chip size="small" :color="usage.weezeventMapped ? 'success' : undefined" variant="tonal">
          ⚡ {{ usage.weezeventMapped ? t('b2WeezeventMapped') : t('b2WeezeventNotMapped') }}
        </v-chip>
        <span v-if="usage.weezeventLocationName" class="text-caption text-medium-emphasis text-truncate">
          {{ usage.weezeventLocationName }}
        </span>
      </div>
      <div class="d-flex align-center ga-2">
        <!-- Count de la CONFIG ACTIVE : un item vendu en config A seulement ne doit
             pas apparaître ici sous B. Le « +N » signale les items des autres configs. -->
        <v-chip size="small" :color="menuCount > 0 ? 'success' : undefined" variant="tonal">
          🍔 {{ menuCount }} {{ t('b2MenuItems') }}
        </v-chip>
        <span v-if="menuCountOtherConfigs > 0" class="text-caption text-medium-emphasis">
          +{{ menuCountOtherConfigs }} {{ t('b2InOtherConfigs') }}
        </span>
        <router-link to="/menu-fb/space-menus" class="text-caption">{{ t('b2ManageInSpaceMenu') }} ↗</router-link>
      </div>
      <div class="text-caption text-medium-emphasis">
        {{ t('b2UsageLinksHint') }}
      </div>
    </div>
  </SectionCard>
</template>

<script setup>
import { computed, inject } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import SectionCard from './SectionCard.vue'

const { t } = useI18n()
const store = inject('builderStore')
const usage = computed(() => store.elementUsage(store.state.selectedElementId))
const menuCount = computed(() => store.elementMenuCountForActiveConfig(store.state.selectedElementId))
// Items assignés dans d'autres configs uniquement (global DISTINCT − config active).
const menuCountOtherConfigs = computed(() => Math.max(0, (usage.value.menuItemsCount || 0) - menuCount.value))
</script>
