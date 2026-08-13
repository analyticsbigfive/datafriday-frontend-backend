<template>
  <v-navigation-drawer
    :model-value="modelValue"
    location="right"
    temporary
    width="480"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <div class="lgl-head">
      <div class="lgl-head__icon"><v-icon size="20" color="white">mdi-trending-down</v-icon></div>
      <div class="lgl-head__text">
        <div class="lgl-title">{{ t('logiLossesDrawerTitle') }}</div>
        <div class="lgl-subtitle">{{ spaceName }}</div>
      </div>
      <button type="button" class="lgl-close" :aria-label="t('logiClose')" @click="$emit('update:modelValue', false)">
        <v-icon size="18">mdi-close</v-icon>
      </button>
    </div>

    <div class="lgl-actions">
      <v-btn size="small" variant="tonal" :loading="downloading" @click="onDownload">
        <v-icon size="16" class="mr-1">mdi-download</v-icon>
        {{ t('logiLossesDownloadAll') }}
      </v-btn>
      <v-btn size="small" variant="text" color="error" :loading="archiving" :disabled="!losses.length" @click="confirmArchive = true">
        <v-icon size="16" class="mr-1">mdi-archive-outline</v-icon>
        {{ t('logiLossesArchive') }}
      </v-btn>
    </div>

    <v-alert v-if="confirmArchive" type="warning" density="compact" variant="tonal" class="lgl-archive-alert">
      {{ t('logiLossesArchiveConfirm') }}
      <div class="lgl-archive-actions">
        <v-btn size="x-small" variant="text" @click="confirmArchive = false">{{ t('logiCancel') }}</v-btn>
        <v-btn size="x-small" variant="flat" color="error" :loading="archiving" @click="onArchive">{{ t('logiLossesArchive') }}</v-btn>
      </div>
    </v-alert>

    <div class="lgl-body">
      <div v-if="loading && !losses.length" class="lgl-center">
        <v-progress-circular indeterminate color="primary" size="28" />
      </div>

      <div v-else-if="!losses.length" class="lgl-center lgl-empty">
        {{ t('logiLossesEmpty') }}
      </div>

      <template v-else>
        <v-list density="compact" class="py-0">
          <v-list-item v-for="loss in losses" :key="loss.id" class="lgl-row">
            <v-list-item-title class="lgl-row-title">{{ loss.itemKey }}</v-list-item-title>
            <v-list-item-subtitle class="lgl-row-sub">
              {{ t('logiLossesFrom') }} {{ loss.sourceElementName }} · {{ t('logiLossesTo') }} {{ loss.destinationElementName }}
            </v-list-item-subtitle>
            <div class="lgl-row-qty">
              <span>{{ t('logiLossesDeclared') }} : {{ qtyLabel(loss, loss.declaredPacked, loss.declaredLoose) }}</span>
              <span>{{ t('logiLossesReceived') }} : {{ qtyLabel(loss, loss.receivedPacked, loss.receivedLoose) }}</span>
              <span class="lgl-row-lost">{{ t('logiLossesLost') }} : {{ qtyLabel(loss, loss.lostPacked, loss.lostLoose) }}</span>
            </div>
            <div class="lgl-row-date">{{ formatDate(loss.createdAt) }}</div>
          </v-list-item>
        </v-list>

        <div v-if="nextCursor" class="lgl-more">
          <v-btn size="small" variant="text" :loading="loading" @click="loadMore">
            {{ t('logiLossesLoadMore') }}
          </v-btn>
        </div>
      </template>
    </div>
  </v-navigation-drawer>
</template>

<script>
import { useStore } from 'vuex'
import { useI18n } from '@/i18n/useI18n'
import { formatUnits } from '@/composables/useFormatters'
import { downloadLossesCsv } from '@/api/endpoints/logistics.api'
import { compactQtyLabel } from '@/composables/useLogisticUnitLabels'

export default {
  name: 'LogisticLossesDrawer',
  props: {
    modelValue: { type: Boolean, default: false },
    spaceId: { type: String, default: null },
    spaceName: { type: String, default: '' },
  },
  emits: ['update:modelValue', 'toast'],
  setup() {
    const store = useStore()
    const { t, locale } = useI18n()
    return { store, t, locale, formatUnits }
  },
  data() {
    return {
      confirmArchive: false,
      archiving: false,
      downloading: false,
    }
  },
  computed: {
    losses() { return this.store.state.logistics?.losses || [] },
    nextCursor() { return this.store.state.logistics?.lossesNextCursor || null },
    loading() { return this.store.state.logistics?.lossesLoading || false },
  },
  watch: {
    modelValue(open) {
      if (open && this.spaceId) this.store.dispatch('logistics/loadLosses', { spaceId: this.spaceId })
      if (!open) this.confirmArchive = false
    },
  },
  methods: {
    formatDate(d) {
      const date = new Date(d)
      if (Number.isNaN(date.getTime())) return ''
      return date.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
    },
    /** BUG-259-02 : quantité + unité (ex. "3 Sacs (0.5 Kg) + 1,2 Kg vrac"). L'item du
     *  référentiel est résolu par itemKey (pas transmis en prop, contrairement à
     *  LogisticItemCard qui l'a déjà) ; unitsPerPack vient de la perte elle-même
     *  (figé au moment du transfert, plus fiable que le référentiel actuel). */
    qtyLabel(loss, packed, loose) {
      const item = this.store.getters['logistics/itemByKey'](loss.itemKey)
      return compactQtyLabel(packed, loose, item, loss.unitsPerPack, this.t, this.locale, formatUnits)
    },
    loadMore() {
      if (!this.spaceId || !this.nextCursor) return
      this.store.dispatch('logistics/loadLosses', { spaceId: this.spaceId, cursor: this.nextCursor })
    },
    async onDownload() {
      if (!this.spaceId) return
      this.downloading = true
      try {
        await downloadLossesCsv(this.spaceId, `pertes-transfert-${this.spaceId}.csv`)
      } finally {
        this.downloading = false
      }
    },
    async onArchive() {
      if (!this.spaceId) return
      this.archiving = true
      try {
        await this.store.dispatch('logistics/archiveLosses', { spaceId: this.spaceId })
        this.confirmArchive = false
        this.$emit('toast', { message: this.t('logiLossesArchived'), color: 'success' })
      } catch (e) {
        this.$emit('toast', { message: this.t('logiLossesArchiveError'), color: 'error' })
      } finally {
        this.archiving = false
      }
    },
  },
}
</script>

<style scoped>
.lgl-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px;
}
.lgl-head__icon {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background: #ff3131;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.lgl-head__text { flex: 1; min-width: 0; }
.lgl-title { font-weight: 700; font-size: 15px; }
.lgl-subtitle { font-size: 12px; opacity: 0.65; }
.lgl-close {
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 4px;
  border-radius: 8px;
  opacity: 0.6;
}
.lgl-close:hover { opacity: 1; background: rgba(0, 0, 0, 0.06); }

.lgl-actions {
  display: flex;
  gap: 8px;
  padding: 0 16px 12px;
}
.lgl-actions .v-btn { text-transform: none; }

.lgl-archive-alert { margin: 0 16px 12px; }
.lgl-archive-actions { display: flex; justify-content: flex-end; gap: 4px; margin-top: 6px; }

.lgl-body { padding: 0 0 16px; overflow-y: auto; }
.lgl-center { display: flex; justify-content: center; padding: 32px 0; }
.lgl-empty { opacity: 0.6; font-size: 13px; }

.lgl-row { border-bottom: 1px solid rgba(0, 0, 0, 0.06); padding: 10px 16px; }
.lgl-row-title { font-weight: 700; font-size: 13px; }
.lgl-row-sub { font-size: 12px; opacity: 0.65; }
.lgl-row-qty {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  font-size: 11px;
  opacity: 0.75;
  margin-top: 4px;
}
.lgl-row-lost { color: #ff3131; font-weight: 700; opacity: 1; }
.lgl-row-date { font-size: 10px; opacity: 0.5; margin-top: 2px; }

.lgl-more { display: flex; justify-content: center; padding: 10px 0; }
</style>
