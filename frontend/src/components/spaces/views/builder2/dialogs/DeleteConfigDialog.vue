<template>
  <!-- Suppression de configuration (doc WF-03) : si des éléments n'appartiendraient
       plus à aucune config, l'utilisateur choisit - les rattacher ailleurs ou les
       supprimer aussi. -->
  <v-dialog :model-value="modelValue" max-width="480" persistent @update:model-value="$emit('update:modelValue', $event)">
    <v-card rounded="xl">
      <v-card-title class="text-subtitle-1 font-weight-bold pa-5 pb-2 d-flex align-center ga-2">
        <v-icon icon="mdi-delete-alert" color="#ff3131" size="22" />
        {{ t('b2DeleteEntityTitle').replace('{name}', config?.name || '') }}
      </v-card-title>

      <v-card-text class="pa-5 pt-2">
        <template v-if="orphanCount > 0">
          <p class="text-body-2 mb-2">
            {{ t('b2OrphanWarning').replace('{count}', orphanCount) }}
          </p>
          <div class="d-flex flex-column ga-1 mb-3">
            <v-chip v-for="o in orphans" :key="o.id" size="small" color="warning" variant="tonal" class="b2-blocker-chip">
              « {{ o.name }} »{{ o.zoneName ? ` · ${o.zoneName}` : '' }}{{ orphanUses(o) }}
            </v-chip>
          </div>
          <v-radio-group v-model="policy" density="compact" hide-details>
            <v-radio value="reassign">
              <template #label><span class="text-body-2">{{ t('b2ReassignToOtherConfig') }}</span></template>
            </v-radio>
            <v-select
              v-if="policy === 'reassign'"
              v-model="reassignTo"
              :items="otherConfigs"
              item-title="name"
              item-value="id"
              variant="outlined"
              density="compact"
              rounded="lg"
              hide-details
              class="ms-8 mb-2"
              style="max-width: 260px;"
            />
            <v-radio value="delete">
              <template #label><span class="text-body-2">{{ t('b2DeleteAlsoDefinitive') }}</span></template>
            </v-radio>
          </v-radio-group>
        </template>
        <p v-else class="text-body-2 text-medium-emphasis">
          {{ t('b2DeleteConfigNoOrphansHint') }}
        </p>
      </v-card-text>

      <v-card-actions class="pa-5 pt-0">
        <v-spacer />
        <v-btn variant="text" rounded="lg" @click="close">{{ t('cancel') }}</v-btn>
        <v-btn
          color="#ff3131" variant="flat" rounded="lg" class="text-white" :loading="busy"
          :disabled="orphanCount > 0 && policy === 'reassign' && !reassignTo"
          @click="confirm"
        >
          {{ t('delete') }}
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
})
const emit = defineEmits(['update:modelValue'])

const { t } = useI18n()
const store = inject('builderStore')
const busy = ref(false)
const orphanCount = ref(0)
const orphans = ref([]) // [{ id, name, zoneName, weezeventLocationName, menuItemsCount }]
const policy = ref('reassign')
const reassignTo = ref(null)

const config = computed(() => store.activeConfig.value)
const otherConfigs = computed(() =>
  store.configsSorted.value.filter((c) => c.id !== store.state.activeConfigId),
)

function orphanUses(o) {
  const uses = [
    ...(o.weezeventMapped || o.weezeventLocationName
      ? [`${t('b2ShopWeezeventLabel')}${o.weezeventLocationName ? ` « ${o.weezeventLocationName} »` : ''}`]
      : []),
    ...(o.menuItemsCount > 0 ? [`${o.menuItemsCount} ${t('b2MenuItems')}`] : []),
  ]
  return uses.length ? ` - ${uses.join(', ')}` : ''
}

// Pré-calcul local des orphelins NOMMÉS : éléments dont la SEULE adhésion est cette
// config. Le refus opaque « ça bloque sans dire qui » est exactement ce qu'on corrige.
function computeLocalOrphans(configId) {
  return Object.entries(store.state.memberships)
    .filter(([, ids]) => ids.length === 1 && ids[0] === configId)
    .map(([elementId]) => {
      const el = store.state.elements[elementId]
      const usage = store.elementUsage(elementId)
      return {
        id: elementId,
        name: el?.name || elementId,
        zoneName: store.state.zones[el?.zoneId]?.name || null,
        weezeventMapped: usage.weezeventMapped,
        weezeventLocationName: usage.weezeventLocationName || null,
        menuItemsCount: usage.menuItemsCount || 0,
      }
    })
}

watch(() => props.modelValue, (open) => {
  if (!open) return
  orphans.value = computeLocalOrphans(store.state.activeConfigId)
  orphanCount.value = orphans.value.length
  policy.value = otherConfigs.value.length ? 'reassign' : 'delete'
  reassignTo.value = otherConfigs.value[0]?.id || null
})

function close() {
  emit('update:modelValue', false)
}

async function confirm() {
  busy.value = true
  try {
    await store.removeConfig(store.state.activeConfigId, orphanCount.value > 0
      ? { orphanPolicy: policy.value, reassignToConfigId: policy.value === 'reassign' ? reassignTo.value : null }
      : {})
    close()
  } catch (err) {
    if (err?.response?.status === 409 && err.response.data?.orphanCount) {
      // Le serveur voyait des orphelins que le front ignorait (état désynchronisé) :
      // on affiche SA liste et le choix rattacher/supprimer, le prochain clic repart avec.
      orphanCount.value = err.response.data.orphanCount
      if (Array.isArray(err.response.data.orphans) && err.response.data.orphans.length) {
        orphans.value = err.response.data.orphans
      }
      policy.value = otherConfigs.value.length ? 'reassign' : 'delete'
      reassignTo.value = reassignTo.value || otherConfigs.value[0]?.id || null
    } else {
      store.notify(err?.response?.data?.message || t('b2ToastDeleteConfigFailed'))
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
