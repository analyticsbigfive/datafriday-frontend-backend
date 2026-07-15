<template>
  <div class="b2-header-host">
    <!-- Barre builder (ConfigSelector + statut + undo/redo) téléportée dans le
         header du Dashboard (cible #space-builder-header-target). -->
    <Teleport v-if="headerReady" to="#space-builder-header-target">
      <div class="b2-header-bar flex-grow-1">
        <!-- Colonne gauche : nom du space courant + capacité + dropdown de changement. -->
        <div class="b2-header__side">
          <v-menu location="bottom start" offset="6" max-height="360">
            <template #activator="{ props: menuProps }">
              <div v-bind="menuProps" class="d-flex align-center ga-2" style="min-width: 0; cursor: pointer; user-select: none;">
                <span class="text-subtitle-1 font-weight-bold text-truncate">
                  {{ store.state.space?.name || t('b2SpaceFallback') }}
                </span>
                <v-chip v-if="store.state.space?.maxCapacity" size="x-small" color="#ff3131" variant="flat" class="text-white">
                  <v-icon icon="mdi-account-group" size="12" class="me-1" />{{ store.state.space.maxCapacity }}
                </v-chip>
                <ChevronDownIcon :size="14" style="opacity: 0.6; flex-shrink: 0;" />
              </div>
            </template>
            <v-card min-width="240" max-width="320" rounded="lg" elevation="4">
              <v-list density="compact" nav>
                <v-list-subheader class="text-caption font-weight-bold" style="text-transform: uppercase;">
                  {{ t('b2ChangeSpace') }}
                </v-list-subheader>
                <v-list-item
                  v-for="s in allSpaces"
                  :key="s.id"
                  :active="s.id === store.state.spaceId"
                  active-color="#ff3131"
                  rounded="lg"
                  @click="switchSpace(s.id)"
                >
                  <v-list-item-title class="text-body-2">{{ s.name }}</v-list-item-title>
                  <template v-if="s.id === store.state.spaceId" #append>
                    <v-icon icon="mdi-check" size="14" color="#ff3131" />
                  </template>
                </v-list-item>
              </v-list>
            </v-card>
          </v-menu>
        </div>

    <!-- Colonne CENTRE (canvas) : ConfigSelector à gauche + TOUT le groupe statut
         (chip + undo/redo) calé à droite → bord droit de la colonne centrale (canvas). -->
    <div class="b2-header__center d-flex align-center">
      <ConfigSelector />
      <v-spacer />
      <div class="d-flex align-center ga-3">
        <v-divider vertical class="mx-1" />
        <!-- Statut d'enregistrement (remplace le bouton Save — doc §4.1) -->
        <v-chip :color="statusColor" size="small" variant="tonal" class="flex-shrink-0">
          <v-progress-circular v-if="status === 'saving'" indeterminate size="12" width="2" class="me-1" />
          <v-icon v-else :icon="statusIcon" size="14" class="me-1" />
          {{ statusLabel }}
        </v-chip>
        <!-- Undo / Redo -->
        <div class="d-flex ga-1">
          <v-btn icon variant="text" size="small" :disabled="!store.history.canUndo.value" :title="t('b2UndoTitle')" @click="store.history.undo()">
            <Undo2Icon :size="16" />
          </v-btn>
          <v-btn icon variant="text" size="small" :disabled="!store.history.canRedo.value" :title="t('b2RedoTitle')" @click="store.history.redo()">
            <Redo2Icon :size="16" />
          </v-btn>
        </div>
      </div>
    </div>

    <!-- Colonne DROITE : réserve la zone du panneau droit pour caler le groupe
         statut au bord droit de la colonne centrale (canvas). -->
    <div class="b2-header__side"></div>
      </div>
    </Teleport>

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
import { ref, computed, inject, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useStore } from 'vuex'
import { useI18n } from '@/i18n/useI18n'
import {
  Folder as FolderIcon, Plus as PlusIcon, Copy as CopyIcon, Pencil as PencilIcon,
  Trash2 as Trash2Icon, Undo2 as Undo2Icon, Redo2 as Redo2Icon, ChevronDown as ChevronDownIcon,
} from 'lucide-vue-next'
import DeleteConfigDialog from '../dialogs/DeleteConfigDialog.vue'
import ConfigSelector from './ConfigSelector.vue'

const { t } = useI18n()
const store = inject('builderStore')
const router = useRouter()
const vuex = useStore()

const allSpaces = computed(() => vuex.getters['spaces/spaces'] || [])

function switchSpace(spaceId) {
  if (spaceId === store.state.spaceId) return
  router.push(`/spaces/${spaceId}/builder2`)
}

// Teleport de la barre vers le header du Dashboard : activé après montage (la
// cible #space-builder-header-target vit dans le v-app-bar parent).
const headerReady = ref(false)

// ── Statut d'enregistrement ──────────────────────────────────────────────────
const now = ref(Date.now())
let ticker = null
onMounted(() => {
  ticker = setInterval(() => { now.value = Date.now() }, 5000)
  vuex.dispatch('spaces/fetchSpaces') // alimente le switcher d'espace
  nextTick(() => { headerReady.value = true })
})
onBeforeUnmount(() => clearInterval(ticker))

const status = computed(() => store.queue.status.value)
const statusColor = computed(() => ({
  saved: 'success', saving: 'grey', error: 'error', offline: 'warning',
}[status.value]))
const statusIcon = computed(() => ({
  saved: 'mdi-check-circle', error: 'mdi-alert-circle', offline: 'mdi-wifi-off',
}[status.value] || 'mdi-check-circle'))
const statusLabel = computed(() => {
  if (status.value === 'saving') return t('b2Saving')
  if (status.value === 'offline') return `${t('b2Offline')} · ${store.queue.pendingCount.value} ${t('b2Pending')}`
  if (status.value === 'error') return t('b2SaveError')
  const at = store.queue.lastSavedAt.value
  if (!at) return t('b2Saved')
  const seconds = Math.max(0, Math.round((now.value - at) / 1000))
  if (seconds < 5) return t('b2Saved')
  const duration = seconds < 60 ? `${seconds} s` : `${Math.round(seconds / 60)} min`
  return t('b2SavedAgo').replace('{duration}', duration)
})

// ── Dialogs configuration ────────────────────────────────────────────────────
const configDialogOpen = ref(false)
const cloneMode = ref(false)
const configName = ref('')
const configBusy = ref(false)
const renameDialogOpen = ref(false)
const renameValue = ref('')
const deleteDialogOpen = ref(false)

function openConfigDialog(clone) {
  cloneMode.value = clone
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
/* Hôte : ne rend AUCUNE barre visible — son contenu est soit téléporté dans le
   header du Dashboard, soit des dialogs qui se portalent sur <body>. */
.b2-header-host {
  display: contents;
}

/* Barre builder téléportée dans le header du Dashboard. Grille calée sur le
   workspace en dessous :
   - colonne GAUCHE fixe (--b2-left-col) → bord gauche du ConfigSelector aligné
     avec le bord gauche de la colonne centrale (canvas) ;
   - colonne CENTRE (1fr) = largeur du canvas : ConfigSelector à gauche, statut
     d'enregistrement calé à droite = aligné avec le bord droit du canvas ;
   - colonne DROITE fixe (--b2-right-col) = zone du panneau droit : Undo/Redo.
   Ajuster --b2-left-col / --b2-right-col pour affiner l'alignement. */
.b2-header-bar {
  --b2-left-col: 236px;
  --b2-right-col: 180px;
  display: grid;
  grid-template-columns: var(--b2-left-col) 1fr var(--b2-right-col);
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.b2-header__center { min-width: 0; }
.b2-header__side {
  min-width: 0;
}

/* Le select de configuration prend EXACTEMENT la largeur de son contenu
   (nom + chip capacité + chevron), plafonnée pour les noms très longs
   (ellipsis + title). min-width : seulement de quoi lire le placeholder. */
.b2-config-select {
  flex: 0 1 auto;
  min-width: 120px;
  max-width: 400px;
}
.b2-config-select :deep(.v-field__input) {
  min-width: 0;
  flex-wrap: nowrap;
}
/* L'input fantôme (cible clavier du select) réserve ~170px par défaut : annulé,
   c'est lui qui gonflait le champ au-delà du contenu. */
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
