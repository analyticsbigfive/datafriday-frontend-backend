<template>
  <!-- Suppression consciente (doc WF-03) : jamais de refus opaque. Une zone retenant
       des éléments liés (shop Weezevent, menus) affiche QUI bloque et propose de
       délier puis supprimer — même les éléments invisibles dans la config active. -->
  <v-dialog :model-value="modelValue" max-width="480" persistent @update:model-value="$emit('update:modelValue', $event)">
    <v-card rounded="xl">
      <v-card-title class="text-subtitle-1 font-weight-bold pa-5 pb-2 d-flex align-center ga-2">
        <v-icon icon="mdi-delete-alert" color="#ff3131" size="22" />
        {{ t('b2DeleteEntityTitle').replace('{name}', zone?.name || '') }}
      </v-card-title>

      <v-card-text class="pa-5 pt-2">
        <template v-if="blockers.length > 0">
          <p class="text-body-2 mb-2">
            {{ t('b2ZoneContainsLinkedElements').replace('{count}', elementCount).replace('{linkedCount}', blockers.length) }}
          </p>
          <div class="d-flex flex-column ga-1 mb-3">
            <v-chip v-for="b in blockers" :key="b.id" size="small" color="warning" variant="tonal" class="b2-blocker-chip">
              « {{ b.name }} »{{ blockerUses(b) }}
            </v-chip>
          </div>
          <p v-if="hiddenCount > 0" class="text-caption text-medium-emphasis mb-2">
            {{ t('b2ZoneHiddenElementsWillDelete').replace('{count}', hiddenCount) }}
          </p>
          <p class="text-body-2 text-medium-emphasis">
            {{ t('b2DeleteZoneLinkedHint') }}
          </p>
        </template>
        <template v-else-if="elementCount > 0">
          <p class="text-body-2 text-medium-emphasis">
            {{ t('b2ZoneContainsElementsWillDelete').replace('{count}', elementCount) }}
            <template v-if="hiddenCount > 0">
              {{ t('b2ZoneHiddenCountParenthetical').replace('{count}', hiddenCount) }}
            </template>
            {{ t('b2ActionIsFinal') }}
          </p>
        </template>
        <p v-else class="text-body-2 text-medium-emphasis">
          {{ t('b2ZoneEmptyHint') }}
        </p>
      </v-card-text>

      <v-card-actions class="pa-5 pt-0">
        <v-spacer />
        <v-btn variant="text" rounded="lg" @click="close">{{ t('cancel') }}</v-btn>
        <v-btn color="#ff3131" variant="flat" rounded="lg" class="text-white" :loading="busy" @click="confirm">
          {{ blockers.length > 0 ? t('b2UnlinkAndDelete') : t('delete') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup>
import { ref, computed, inject, watch } from 'vue'
import { useI18n } from '@/i18n/useI18n'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  zone: { type: Object, default: null },
})
const emit = defineEmits(['update:modelValue'])

const { t } = useI18n()
const store = inject('builderStore')
const busy = ref(false)
const serverBlockers = ref([]) // 409 : usages que le front ignorait (état désynchronisé)

const elements = computed(() => (props.zone ? store.elementsOfZone(props.zone.id) : []))
const elementCount = computed(() => elements.value.length)
const hiddenCount = computed(() =>
  props.zone ? elementCount.value - store.visibleElementsOfZone(props.zone.id).length : 0,
)

// Pré-calcul local depuis usage[] du bootstrap ; le serveur reste l'autorité (409).
const localBlockers = computed(() =>
  elements.value
    .map((el) => {
      const usage = store.elementUsage(el.id)
      return {
        id: el.id,
        name: el.name,
        weezeventMapped: usage.weezeventMapped,
        weezeventLocationName: usage.weezeventLocationName || null,
        menuItemsCount: usage.menuItemsCount || 0,
      }
    })
    .filter((b) => b.weezeventMapped || b.menuItemsCount > 0),
)
const blockers = computed(() => (serverBlockers.value.length ? serverBlockers.value : localBlockers.value))

function blockerUses(b) {
  const uses = [
    ...(b.weezeventMapped ? [`${t('b2ShopWeezeventLabel')}${b.weezeventLocationName ? ` « ${b.weezeventLocationName} »` : ''}`] : []),
    ...(b.menuItemsCount > 0 ? [`${b.menuItemsCount} ${t('b2MenuItems')}`] : []),
  ]
  return uses.length ? ` — ${uses.join(', ')}` : ''
}

watch(() => props.modelValue, (open) => {
  if (open) serverBlockers.value = []
})

function close() {
  emit('update:modelValue', false)
}

async function confirm() {
  if (!props.zone) return
  busy.value = true
  try {
    await store.removeZone(props.zone.id, { force: blockers.value.length > 0 })
    close()
  } catch (err) {
    if (err?.response?.status === 409) {
      // Le serveur connaît des usages que le front ignorait : on les affiche,
      // le prochain clic partira avec force=true.
      serverBlockers.value = err.response.data?.blockers
        || (err.response.data?.reasons || []).map((r, i) => ({ id: `srv-${i}`, name: r, weezeventMapped: false, menuItemsCount: 0 }))
      if (!serverBlockers.value.length) {
        store.notify(err.response.data?.message || t('b2ZoneNotDeletedUsedElements'))
      }
    } else {
      store.notify(err?.response?.data?.message || t('b2ToastDeleteZoneFailed'))
      close()
    }
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
/* Le tonal warning de Vuetify = texte ambre sur fond ambre clair, illisible :
   on garde le fond, on fonce le texte. */
.b2-blocker-chip {
  color: #8a5200 !important;
  font-weight: 500;
}
/* Dark mode : l'ambre foncé devient illisible sur le tonal sombre → variante claire.
   Dialog téléporté hors .v-application : on s'appuie sur .dark posé sur <html>. */
.dark .b2-blocker-chip {
  color: #fcd34d !important;
}
</style>
