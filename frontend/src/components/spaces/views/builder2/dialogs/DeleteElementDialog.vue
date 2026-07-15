<template>
  <!-- Suppression consciente (doc WF-03) : le 409 du backend rendu lisible.
       Jamais de suppression silencieuse d'un élément utilisé. -->
  <v-dialog :model-value="modelValue" max-width="460" persistent @update:model-value="$emit('update:modelValue', $event)">
    <v-card rounded="xl">
      <v-card-title class="text-subtitle-1 font-weight-bold pa-5 pb-2 d-flex align-center ga-2">
        <v-icon icon="mdi-delete-alert" color="#ff3131" size="22" />
        {{ t('b2DeleteEntityTitle').replace('{name}', element?.name || '') }}
      </v-card-title>

      <v-card-text class="pa-5 pt-2">
        <template v-if="usage.weezeventMapped || usage.menuItemsCount > 0 || serverReasons.length">
          <p class="text-body-2 mb-2">{{ t('b2ElementIsUsed') }}</p>
          <div class="d-flex flex-column ga-1 mb-3">
            <v-chip v-if="usage.weezeventMapped" size="small" color="warning" variant="tonal" class="b2-blocker-chip">
              ⚡ {{ t('b2WeezeventMappingLabel') }}{{ usage.weezeventLocationName ? ` · ${usage.weezeventLocationName}` : '' }}
            </v-chip>
            <v-chip v-if="usage.menuItemsCount > 0" size="small" color="warning" variant="tonal" class="b2-blocker-chip">
              🍔 {{ t('b2MenuItemsAssignedCount').replace('{count}', usage.menuItemsCount) }}
            </v-chip>
            <v-chip v-for="reason in serverReasons" :key="reason" size="small" color="warning" variant="tonal" class="b2-blocker-chip">
              {{ reason }}
            </v-chip>
          </div>
          <p class="text-body-2 text-medium-emphasis">
            {{ t('b2DeleteElementLinksHint') }}
          </p>
        </template>
        <p v-else class="text-body-2 text-medium-emphasis">
          {{ t('b2DeleteElementNoRefsHint') }}
        </p>
      </v-card-text>

      <v-card-actions class="pa-5 pt-0">
        <v-spacer />
        <v-btn variant="text" rounded="lg" @click="close">{{ t('cancel') }}</v-btn>
        <v-btn color="#ff3131" variant="flat" rounded="lg" class="text-white" :loading="busy" @click="confirm">
          {{ needsForce ? t('b2DeleteAnyway') : t('delete') }}
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
  element: { type: Object, default: null },
})
const emit = defineEmits(['update:modelValue'])

const { t } = useI18n()
const store = inject('builderStore')
const busy = ref(false)
const serverReasons = ref([])

const usage = computed(() => store.elementUsage(props.element?.id))
const needsForce = computed(
  () => usage.value.weezeventMapped || usage.value.menuItemsCount > 0 || serverReasons.value.length > 0,
)

watch(() => props.modelValue, (open) => {
  if (open) serverReasons.value = []
})

function close() {
  emit('update:modelValue', false)
}

async function confirm() {
  if (!props.element) return
  busy.value = true
  try {
    await store.removeElement(props.element.id, { force: needsForce.value })
    close()
  } catch (err) {
    if (err?.response?.status === 409) {
      // Le serveur connaît des usages que le front ignorait : on les affiche,
      // le prochain clic partira avec force=true.
      serverReasons.value = err.response.data?.reasons || [err.response.data?.message || t('b2ElementReferencedFallback')]
    } else {
      store.notify(err?.response?.data?.message || t('b2ToastDeleteFailed'))
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
</style>
