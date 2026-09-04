<template>
  <div class="av-sticky">
    <div class="av-header">
      <div class="av-header__row1 d-flex align-center ga-2">
        <WorkspacePanelToggle :open="drawerOpen" :label="t('anHeaderToggleFilters')" @toggle="emit('toggle-drawer')" />
        <h1 class="av-header__title">{{ spaceName }} : {{ eventTitle }}</h1>
        <span v-if="isLive" class="av-live-badge" :title="t('anToolLive')">
          <span class="av-live-badge__dot"></span>{{ t('anToolLive') }}
        </span>
        <v-btn
          v-if="liveEvent"
          icon
          variant="text"
          size="small"
          :title="t('anLiveEditEvent')"
          :aria-label="t('anLiveEditEvent')"
          class="fs-icon-btn"
          @click="editOpen = true"
        >
          <v-icon size="18">mdi-pencil-outline</v-icon>
        </v-btn>
        <v-tooltip v-if="unmappedText" location="bottom" max-width="300">
          <template #activator="{ props: tipProps }">
            <v-btn
              v-bind="tipProps"
              icon
              variant="text"
              size="small"
              class="fs-icon-btn av-unmapped-warn"
              :aria-label="unmappedText"
              @click="router.push({ name: 'data-integration-fb' })"
            >
              <v-icon size="18">mdi-alert</v-icon>
            </v-btn>
          </template>
          <div class="av-unmapped-tip">
            <div>{{ unmappedText }}</div>
            <div class="av-unmapped-tip__action">
              {{ t('anUnmappedTipAction') }} {{ t('anUnmappedInfoLink') }}
            </div>
          </div>
        </v-tooltip>
        <v-spacer />
        <v-btn
          icon
          variant="text"
          size="small"
          :loading="copying"
          :title="t('anCopyImage')"
          class="fs-icon-btn av-action-btn"
          @click="onCopy"
        >
          <v-icon size="18">mdi-content-copy</v-icon>
        </v-btn>
        <v-btn
          icon
          variant="text"
          size="small"
          :loading="sharing"
          :title="t('anShare')"
          class="fs-icon-btn av-action-btn"
          @click="onShare"
        >
          <v-icon size="18">mdi-share-variant-outline</v-icon>
        </v-btn>
        <v-menu location="bottom end">
          <template #activator="{ props: exportProps }">
            <v-btn
              v-bind="exportProps"
              icon
              variant="text"
              size="small"
              :loading="exporting"
              :title="t('anExportMenu')"
              :aria-label="t('anExportMenu')"
              class="fs-icon-btn av-action-btn"
            >
              <v-icon size="18">mdi-table-arrow-down</v-icon>
            </v-btn>
          </template>
          <v-list density="compact">
            <v-list-item @click="onExportXlsx">
              <template #prepend>
                <v-icon size="18">mdi-file-excel-outline</v-icon>
              </template>
              <v-list-item-title>{{ t('anExportXlsx') }}</v-list-item-title>
            </v-list-item>
            <v-list-item @click="onExportCsv">
              <template #prepend>
                <v-icon size="18">mdi-file-delimited-outline</v-icon>
              </template>
              <v-list-item-title>{{ t('anExportCsv') }}</v-list-item-title>
            </v-list-item>
          </v-list>
        </v-menu>
      </div>
    </div>

    <EventFormDrawer
      v-model="editOpen"
      mode="edit"
      :initial-event="liveEvent"
      :is-dark="isDark"
      lock-date
      @submitted="onSubmitted"
    />

    <v-snackbar v-model="snackbar" :color="snackbarColor" timeout="2500">
      {{ snackbarText }}
    </v-snackbar>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from '@/i18n/useI18n'
import { useAnalyseCapture } from '@/composables/useAnalyseCapture'
import { useAnalyseUnmapped } from '@/composables/useAnalyseUnmapped'
import { useLiveExport } from '@/composables/useLiveExport'
import { formatCurrency, formatNumber } from '@/composables/useFormatters'
import { formatDateShort } from '@/utils/dateFr'
import EventFormDrawer from '@/components/events/drawers/EventFormDrawer.vue'
import WorkspacePanelToggle from '@/components/WorkspacePanelToggle.vue'

const { t } = useI18n()
const router = useRouter()

const props = defineProps({
  spaceName: { type: String, default: '' },
  isLive: { type: Boolean, default: false },
  liveEvent: { type: Object, default: null },
  isDark: { type: Boolean, default: false },
  drawerOpen: { type: Boolean, default: true },
  records: { type: Array, default: () => [] },
})

const emit = defineEmits(['event-updated', 'toggle-drawer'])

// Parité AnalyseView.vue::singleSelectedEventLabel — « Nom — date », date omise si
// absente/illisible.
const eventTitle = computed(() => {
  const name = props.liveEvent?.name || props.liveEvent?.eventName || ''
  if (!name) return t('analyseTitle')
  const date = formatDateShort(props.liveEvent?.date || props.liveEvent?.eventDate)
  return date ? `${name} — ${date}` : name
})

const editOpen = ref(false)
function onSubmitted() {
  editOpen.value = false
  emit('event-updated')
}

// Warning « PdV non mappés » (parité BUG-356-01) — scopé au seul event live, composable déjà
// store-free (appel direct /analyse-unmapped, pas de dépendance au store `analyse`).
const eventsForUnmapped = computed(() => (props.liveEvent ? [props.liveEvent] : []))
const { unmapped } = useAnalyseUnmapped(eventsForUnmapped)
const unmappedText = computed(() => {
  const x = unmapped.value
  if (!x.known || !x.lines) return ''
  return t('anUnmappedInfo')
    .replace('{lines}', formatNumber(x.lines))
    .replace('{revenue}', formatCurrency(x.revenueHt))
})

// Copier/partager : composable déjà store-free, juste un id DOM différent (racine Live).
const spaceNameRef = computed(() => props.spaceName)
const { copying, sharing, snackbar, snackbarText, snackbarColor, onCopy, onShare } =
  useAnalyseCapture({ spaceName: spaceNameRef, rootId: 'live-capture-root' })

const recordsRef = computed(() => props.records)
const { exporting, onExportXlsx, onExportCsv } = useLiveExport({ spaceName: spaceNameRef, records: recordsRef })
</script>

<style scoped>
.av-sticky {
  position: sticky;
  top: 0;
  z-index: 5;
  margin-bottom: 14px;
}
.av-header {
  background: #ff3131;
  border-radius: 18px;
  padding: 14px 18px;
  box-shadow: 0 4px 14px rgba(255, 49, 49, 0.25);
}
.av-header__row1 {
  min-height: 32px;
}
.av-header__title {
  color: #fff;
  font-size: var(--fs-lg);
  font-weight: var(--fw-bold);
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  /* min-width:0 : sans lui un enfant flex ne rétrécit jamais sous sa taille de
     contenu — l'ellipsis ne se déclenchait donc jamais sur mobile, le titre
     débordait au lieu de se tronquer (retour Emmanuel, responsivité Live v2). */
  min-width: 0;
}
.av-live-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: rgba(255, 255, 255, 0.22);
  color: #fff;
  font-size: var(--fs-xs);
  font-weight: var(--fw-bold);
  letter-spacing: 0.4px;
  padding: 4px 10px;
  border-radius: 999px;
  flex-shrink: 0;
}
.av-live-badge__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #fff;
  animation: av-live-pulse 1.4s ease-in-out infinite;
}
@keyframes av-live-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}
@media (prefers-reduced-motion: reduce) {
  .av-live-badge__dot { animation: none; }
}
.av-header__row1 :deep(.fs-icon-btn) {
  color: rgba(255, 255, 255, 0.9) !important;
}
.av-header__row1 :deep(.fs-icon-btn:hover) {
  background: rgba(255, 255, 255, 0.15) !important;
}
.av-header__row1 :deep(.av-action-btn) {
  border: 1.5px solid rgba(255, 255, 255, 0.4);
}
.av-unmapped-tip__action {
  margin-top: 4px;
  font-size: var(--fs-xs);
  opacity: 0.85;
}
</style>
