<template>
  <div class="gv-page">
    <header class="gv-header">
      <div class="gv-header-icon"><v-icon size="20" color="white">mdi-truck-delivery-outline</v-icon></div>
      <div class="gv-header-text">
        <div class="gv-title">{{ t('logiVentilationBtn') }}</div>
        <div class="gv-sub">
          {{ session?.spaceName || '' }}<template v-if="sheet?.eventName"> · {{ sheet.eventName }}</template>
        </div>
      </div>
      <button type="button" class="gv-icon-btn" :title="t('guestVentilationRefresh')" @click="load()">
        <v-icon size="18">mdi-refresh</v-icon>
      </button>
      <button type="button" class="gv-icon-btn" :title="t('guestVentilationLogout')" @click="logout">
        <v-icon size="18">mdi-logout</v-icon>
      </button>
    </header>

    <main class="gv-main">
      <button v-if="depositorName" type="button" class="gv-name-chip" @click="nameDialog = true">
        <v-icon size="14">mdi-account</v-icon>{{ depositorName }}
      </button>

      <LogisticVentilationView
        :groups="groups"
        :plan-name="plan?.name || null"
        :source="plan ? 'restock' : null"
        :loading="loading && !sheet"
        :can-confirm="!!plan"
        @confirm="openDeposit"
      />
      <LogisticVentilationDeposits
        :movements="movements"
        :cancelling-id="cancellingId"
        @cancel="onCancel"
      />
    </main>

    <LogisticDepositConfirmDrawer
      v-model="depositDialog"
      :deposit="depositTarget"
      :saving="depositSaving"
      :error="depositError"
      @submit="onDeposit"
    />

    <!-- Prénom demandé une fois, gardé sur l'appareil (décision #78). -->
    <v-dialog v-model="nameDialog" :persistent="!depositorName" max-width="360">
      <v-card rounded="lg">
        <v-card-title class="gv-dialog-title">{{ t('guestVentilationNameTitle') }}</v-card-title>
        <v-card-text>
          <p class="gv-dialog-hint">{{ t('guestVentilationNameHint') }}</p>
          <v-text-field
            v-model="nameInput"
            :label="t('guestVentilationNameLabel')"
            variant="outlined"
            density="comfortable"
            maxlength="60"
            autofocus
            hide-details
            @keyup.enter="saveName"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn class="gv-primary" variant="flat" rounded="lg" :disabled="!nameInput.trim()" @click="saveName">
            {{ t('logiConfirmBtn') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snack.show" :color="snack.color" timeout="2500" location="bottom">{{ snack.text }}</v-snackbar>
  </div>
</template>

<script>
import { computed } from 'vue'
import { useStore } from 'vuex'
import { useI18n } from '@/i18n/useI18n'
import LogisticVentilationView from '@/components/space-workspace/logistic/LogisticVentilationView.vue'
import LogisticVentilationDeposits from '@/components/space-workspace/logistic/LogisticVentilationDeposits.vue'
import LogisticDepositConfirmDrawer from '@/components/space-workspace/logistic/drawers/LogisticDepositConfirmDrawer.vue'
import { useGuestVentilation, readDepositorName, writeDepositorName } from '@/composables/useGuestVentilation'
import { guestPinLandingRoute } from '@/utils/guestPinLanding'
import { depositPrefill, packSizeLookup } from '@/utils/restockDepositSheet'

/** Relecture automatique (dépôts des autres logisticiens, feuille mise à jour). */
const AUTO_REFRESH_MS = 30 * 1000

/**
 * Feuille de ventilation des logisticiens, ouverte par le QR code Logistique + PIN
 * (chantier logistic_ventilation, partie 3). Mêmes composants que le mode
 * Ventilation de l'écran Logistique ; sans lien Event Predict (pas de compte).
 */
export default {
  name: 'GuestVentilationView',
  components: { LogisticVentilationView, LogisticVentilationDeposits, LogisticDepositConfirmDrawer },
  setup() {
    const { t } = useI18n()
    const store = useStore()
    const ventilation = useGuestVentilation()
    const session = computed(() => store.getters['guestPin/session'])
    return { t, store, session, ...ventilation }
  },
  data() {
    return {
      depositorName: readDepositorName(),
      nameInput: readDepositorName(),
      nameDialog: !readDepositorName(),
      depositDialog: false,
      depositTarget: null,
      depositSaving: false,
      depositError: null,
      cancellingId: null,
      snack: { show: false, text: '', color: 'success' },
    }
  },
  mounted() {
    this.load()
    this.timer = setInterval(() => {
      if (!document.hidden && !this.depositDialog) this.load({ silent: true })
    }, AUTO_REFRESH_MS)
  },
  beforeUnmount() {
    if (this.timer) clearInterval(this.timer)
  },
  methods: {
    saveName() {
      const name = this.nameInput.trim()
      if (!name) return
      writeDepositorName(name)
      this.depositorName = name
      this.nameDialog = false
    },
    openDeposit({ group, row }) {
      if (!this.depositorName) {
        this.nameDialog = true
        return
      }
      // Même règle que l'écran Logistique : packs comptés avec la taille de pack
      // Logistic de la destination (le serveur enregistre le dépôt avec elle).
      const logisticUpp = packSizeLookup(this.sheet?.packSizes)(row.shopId, group.itemName)
      const prefill = depositPrefill(row, logisticUpp, group.unitsPerPack)
      this.depositTarget = {
        rowKey: row.rowKey,
        itemName: group.itemName,
        shopName: row.shopName,
        unit: group.unit,
        packagingType: group.packagingType,
        unitsPerPack: prefill.unitsPerPack,
        quantity: row.quantity,
        packs: prefill.packs,
      }
      this.depositError = null
      this.depositDialog = true
    },
    async onDeposit({ packed, loose }) {
      if (!this.depositTarget) return
      this.depositSaving = true
      this.depositError = null
      try {
        await this.deposit({ rowKey: this.depositTarget.rowKey, packed, loose, depositorName: this.depositorName })
        this.depositDialog = false
        this.notify(this.t('logiDepositSaved'))
      } catch (e) {
        this.depositError = e?.response?.data?.message || e?.message || this.t('logiMovementError')
      } finally {
        this.depositSaving = false
      }
    },
    async onCancel(movement) {
      if (!movement?.id || this.cancellingId) return
      this.cancellingId = movement.id
      try {
        await this.cancel(movement.id)
        this.notify(this.t('logiVentilationCancelDone'))
      } catch (e) {
        this.notify(e?.response?.data?.message || e?.message || this.t('logiMovementError'), 'error')
      } finally {
        this.cancellingId = null
      }
    },
    notify(text, color = 'success') {
      this.snack = { show: true, text, color }
    },
    logout() {
      this.store.dispatch('guestPin/clear')
      this.$router.replace(guestPinLandingRoute())
    },
  },
}
</script>

<style scoped>
.gv-page { min-height: 100vh; background: var(--fb-bg, #f5f5f7); }
.gv-header { position: sticky; top: 0; z-index: 5; display: flex; align-items: center; gap: 10px; padding: 12px 16px; background: #ff3131; color: #fff; }
.gv-header-icon { width: 36px; height: 36px; border-radius: 10px; background: rgba(255, 255, 255, 0.18); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.gv-header-text { flex: 1; min-width: 0; }
.gv-title { font-size: var(--fs-lg); font-weight: var(--fw-bold); }
.gv-sub { font-size: var(--fs-sm); opacity: 0.85; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.gv-icon-btn { border: 0; background: rgba(255, 255, 255, 0.18); color: #fff; width: 36px; height: 36px; border-radius: 10px; display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; }
.gv-main { max-width: 820px; margin: 0 auto; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.gv-name-chip { align-self: flex-start; display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--fb-border, #e5e7eb); background: var(--fb-surface, #fff); border-radius: 999px; padding: 4px 12px; font-size: var(--fs-sm); font-weight: var(--fw-semibold); color: var(--fb-muted, #6b7280); cursor: pointer; }
.gv-dialog-title { font-weight: var(--fw-bold); }
.gv-dialog-hint { font-size: var(--fs-base); color: var(--fb-muted, #6b7280); margin: 0 0 12px; }
.gv-primary { background: #ff3131 !important; color: #fff !important; text-transform: none; font-weight: var(--fw-semibold); }
</style>
