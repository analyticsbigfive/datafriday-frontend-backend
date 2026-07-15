<template>
  <div class="d-flex align-center ga-2">
    <v-select
      :model-value="store.state.activeConfigId"
      :items="store.configsSorted.value"
      item-title="name"
      item-value="id"
      density="compact"
      variant="outlined"
      rounded="lg"
      hide-details
      class="b2-config-select"
      :placeholder="t('b2ConfigPlaceholder')"
      @update:model-value="store.setActiveConfig($event)"
    >
      <template #selection="{ item }">
        <div class="d-flex align-center" style="min-width: 0;" :title="item?.raw?.name">
          <span class="text-body-2 font-weight-medium text-truncate">{{ item?.raw?.name }}</span>
          <v-chip size="x-small" color="#ff3131" variant="flat" class="text-white ms-2 flex-shrink-0">
            <v-icon icon="mdi-account-group" size="10" class="me-1" />{{ store.activeConfigCapacity.value }}
          </v-chip>
        </div>
      </template>
    </v-select>

    <!-- Actions configuration -->
    <v-menu location="bottom end" offset="6">
      <template #activator="{ props: menuProps }">
        <v-btn v-bind="menuProps" icon variant="outlined" size="small">
          <FolderIcon :size="16" />
        </v-btn>
      </template>
      <v-list density="compact" nav>
        <v-list-item rounded="lg" @click="openConfigDialog(false)">
          <template #prepend><PlusIcon :size="15" class="me-3" /></template>
          <v-list-item-title>{{ t('b2NewConfigTitle') }}</v-list-item-title>
        </v-list-item>
        <v-list-item rounded="lg" :disabled="!store.state.activeConfigId" @click="openConfigDialog(true)">
          <template #prepend><CopyIcon :size="15" class="me-3" /></template>
          <v-list-item-title>{{ t('b2CloneConfigTitle') }}</v-list-item-title>
        </v-list-item>
        <v-list-item rounded="lg" :disabled="!store.state.activeConfigId" @click="openRename">
          <template #prepend><PencilIcon :size="15" class="me-3" /></template>
          <v-list-item-title>{{ t('b2Rename') }}</v-list-item-title>
        </v-list-item>
        <v-divider class="my-1" />
        <v-list-item rounded="lg" :disabled="!store.state.activeConfigId" @click="deleteDialogOpen = true">
          <template #prepend><Trash2Icon :size="15" class="me-3" color="#ff3131" /></template>
          <v-list-item-title class="text-error">{{ t('delete') }}</v-list-item-title>
        </v-list-item>
      </v-list>
    </v-menu>

    <!-- Dialog nouvelle / clone -->
    <v-dialog v-model="configDialogOpen" max-width="440" persistent>
      <v-card rounded="xl">
        <v-card-title class="text-subtitle-1 font-weight-bold pa-5 pb-2">
          {{ cloneMode ? t('b2CloneConfigTitle') : t('b2NewConfigTitle') }}
        </v-card-title>
        <v-card-text class="pa-5 pt-2">
          <p v-if="cloneMode" class="text-body-2 text-medium-emphasis mb-3">
            {{ t('b2CloneConfigBody') }}
          </p>
          <v-text-field
            v-model="configName"
            :label="t('b2NameLabel')"
            variant="outlined"
            density="compact"
            rounded="lg"
            autofocus
            hide-details
            @keyup.enter="submitConfigDialog"
          />
        </v-card-text>
        <v-card-actions class="pa-5 pt-0">
          <v-spacer />
          <v-btn variant="text" rounded="lg" @click="configDialogOpen = false">{{ t('cancel') }}</v-btn>
          <v-btn color="#ff3131" variant="flat" rounded="lg" class="text-white" :loading="configBusy"
                 :disabled="!configName.trim()" @click="submitConfigDialog">
            {{ cloneMode ? t('b2Clone') : t('create') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Dialog renommage -->
    <v-dialog v-model="renameDialogOpen" max-width="440" persistent>
      <v-card rounded="xl">
        <v-card-title class="text-subtitle-1 font-weight-bold pa-5 pb-2">{{ t('b2RenameConfigTitle') }}</v-card-title>
        <v-card-text class="pa-5 pt-2">
          <v-text-field v-model="renameValue" :label="t('b2NameLabel')" variant="outlined" density="compact" rounded="lg"
                        autofocus hide-details @keyup.enter="submitRename" />
        </v-card-text>
        <v-card-actions class="pa-5 pt-0">
          <v-spacer />
          <v-btn variant="text" rounded="lg" @click="renameDialogOpen = false">{{ t('cancel') }}</v-btn>
          <v-btn color="#ff3131" variant="flat" rounded="lg" class="text-white" :loading="configBusy"
                 :disabled="!renameValue.trim()" @click="submitRename">{{ t('b2Rename') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <DeleteConfigDialog v-model="deleteDialogOpen" />
  </div>
</template>

<script setup>
import { ref, inject } from 'vue'
import { Folder as FolderIcon, Plus as PlusIcon, Copy as CopyIcon, Pencil as PencilIcon, Trash2 as Trash2Icon } from 'lucide-vue-next'
import { useI18n } from '@/i18n/useI18n'
import DeleteConfigDialog from '../dialogs/DeleteConfigDialog.vue'

const { t } = useI18n()
const store = inject('builderStore')

const configDialogOpen = ref(false)
const cloneMode        = ref(false)
const configName       = ref('')
const configBusy       = ref(false)
const renameDialogOpen = ref(false)
const renameValue      = ref('')
const deleteDialogOpen = ref(false)

function openConfigDialog(clone) {
  cloneMode.value  = clone
  configName.value = clone ? `${store.activeConfig.value?.name || ''} ${t('b2CopySuffix')}` : ''
  configDialogOpen.value = true
}

async function submitConfigDialog() {
  if (!configName.value.trim()) return
  configBusy.value = true
  try {
    await store.createConfig({
      name: configName.value.trim(),
      cloneFromConfigId: cloneMode.value ? store.state.activeConfigId : null,
    })
    configDialogOpen.value = false
  } catch (err) {
    store.notify(err?.response?.data?.message || t('b2ToastCreateConfigFailed'))
  } finally {
    configBusy.value = false
  }
}

function openRename() {
  renameValue.value = store.activeConfig.value?.name || ''
  renameDialogOpen.value = true
}

async function submitRename() {
  if (!renameValue.value.trim()) return
  configBusy.value = true
  try {
    await store.renameConfig(store.state.activeConfigId, renameValue.value.trim())
    renameDialogOpen.value = false
  } catch (err) {
    store.notify(err?.response?.data?.message || t('b2ToastRenameFailed'))
  } finally {
    configBusy.value = false
  }
}
</script>

<style scoped>
.b2-config-select {
  flex: 0 1 auto;
  min-width: 120px;
  max-width: 400px;
}
.b2-config-select :deep(.v-field__input) {
  min-width: 0;
  flex-wrap: nowrap;
}
.b2-config-select :deep(.v-field__input input) {
  flex: 0 0 0px;
  min-width: 0;
  width: 0;
  padding: 0;
}
.b2-config-select :deep(.v-select__selection) {
  min-width: 0;
  max-width: none;
}
</style>
