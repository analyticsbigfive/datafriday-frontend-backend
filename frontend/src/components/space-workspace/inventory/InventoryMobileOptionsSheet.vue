<template>
  <!-- Menu mobile « Options inventaire », ouvert par le ☰ du bandeau (design mobile
       Bertrand 2026-10-07) : Arrêt / Reprise de l'accès QR code, outil, Filtres,
       Résumé, Imprimer, Exporter, Voir tout l'inventaire. La recherche reste sur la
       page ; « Vérifier Stock Menu » reste sur ordinateur (menu Imprimer). -->
  <v-bottom-sheet :model-value="modelValue" inset @update:model-value="$emit('update:modelValue', $event)">
    <v-card class="imo-sheet">
      <v-card-title class="imo-title">
        <v-icon color="primary">mdi-cog-outline</v-icon>
        {{ t('invOptionsTitle') }}
      </v-card-title>
      <v-card-text class="imo-content">
        <!-- Menu laissé ouvert après ■ / ▶ pour qu'un refus serveur reste lisible ;
             remonté à chaque OUVERTURE (clé) : pas d'erreur périmée, et pas de
             disparition pendant l'animation de fermeture. -->
        <InventoryPinActionButtons
          v-if="pinAccess"
          :key="openCount"
          large
          class="imo-pin"
          :space-id="pinAccess.spaceId"
          :event-id="pinAccess.eventId"
          :phase="pinAccess.phase"
        />

        <WorkspaceToolSelect
          :model-value="currentTool"
          :items="toolItems"
          :aria-label="t('invToolboxNav')"
          @update:model-value="pick('select-tool', $event)"
        />

        <div class="imo-actions">
          <v-btn variant="outlined" @click="pick('filters')">
            <v-icon size="16" class="mr-1">mdi-filter-variant</v-icon>
            {{ t('invFiltersBtn') }}
          </v-btn>
          <v-btn v-if="canShowSummary" variant="outlined" @click="pick('summary')">
            <v-icon size="16" class="mr-1">mdi-clipboard-text-outline</v-icon>
            {{ t('invSummaryBtn') }}
          </v-btn>
          <v-btn variant="outlined" @click="pick('print')">
            <v-icon size="16" class="mr-1">mdi-clipboard-list-outline</v-icon>
            {{ t('invPrintInventory') }}
          </v-btn>
          <v-btn variant="outlined" @click="pick('export')">
            <v-icon size="16" class="mr-1">mdi-file-delimited-outline</v-icon>
            {{ t('invExportInventory') }}
          </v-btn>
          <v-btn
            v-if="canToggleFullInventory"
            :variant="isFullInventory ? 'flat' : 'outlined'"
            :color="isFullInventory ? 'primary' : undefined"
            :disabled="fullInventoryLoading"
            @click="pick('toggle-full-inventory')"
          >
            <v-icon size="16" class="mr-1">mdi-view-grid-plus-outline</v-icon>
            {{ t('invShowFullInventory') }}
          </v-btn>
        </div>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="$emit('update:modelValue', false)">{{ t('invClose') }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-bottom-sheet>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import WorkspaceToolSelect from '@/components/WorkspaceToolSelect.vue'
import InventoryPinActionButtons from './InventoryPinActionButtons.vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  /** { spaceId, eventId, phase } quand l'accès PIN s'applique ; sinon pas de ■ ▶. */
  pinAccess: { type: Object, default: null },
  toolItems: { type: Array, default: () => [] },
  currentTool: { type: String, default: '' },
  canToggleFullInventory: { type: Boolean, default: false },
  isFullInventory: { type: Boolean, default: false },
  fullInventoryLoading: { type: Boolean, default: false },
  /** Résumé disponible (onglets Boutiques et Stockages, comme la colonne desktop). */
  canShowSummary: { type: Boolean, default: true },
})
const emit = defineEmits([
  'update:modelValue',
  'select-tool',
  'filters',
  'summary',
  'print',
  'export',
  'toggle-full-inventory',
])

const { t } = useI18n()

// Incrémenté à chaque ouverture : remonte les ■ ▶ (erreur précédente effacée).
const openCount = ref(0)
watch(() => props.modelValue, (open) => { if (open) openCount.value += 1 })

/** Toute action ferme le menu (un geste de moins pour l'utilisateur). */
function pick(event, payload) {
  emit('update:modelValue', false)
  emit(event, payload)
}
</script>

<style scoped>
.imo-sheet {
  border-radius: 16px 16px 0 0;
}
.imo-title {
  display: flex;
  align-items: center;
  gap: 8px;
}
.imo-content {
  display: grid;
  gap: 12px;
}
.imo-pin {
  margin-bottom: 4px;
}
.imo-actions {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
}
.imo-actions :deep(.v-btn) {
  min-width: 0;
  border-radius: 8px;
  text-transform: none;
  font-weight: 700;
}
</style>
