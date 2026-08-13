<template>
  <Teleport to="body">
    <Transition name="lgtc">
      <div v-if="modelValue" class="lgtc-overlay" @click.self="close">
        <div class="lgtc-panel">
          <!-- Header -->
          <div class="lgtc-header">
            <div class="lgtc-header-icon"><v-icon size="18" color="white">mdi-truck-check-outline</v-icon></div>
            <div class="lgtc-header-text">
              <div class="lgtc-header-title">{{ t('logiConfirmTransferTitle') }}</div>
              <div class="lgtc-header-sub">{{ transfer?.itemKey }} · {{ elementName }}</div>
            </div>
            <button class="lgtc-close" type="button" @click="close">
              <v-icon size="18">mdi-close</v-icon>
            </button>
          </div>
          <v-divider />

          <!-- Body -->
          <div class="lgtc-body">
            <div class="lgtc-from">
              <v-icon size="14" class="mr-1">mdi-arrow-right-circle-outline</v-icon>
              {{ t('logiPendingTransferFrom') }} : <strong>{{ transfer?.sourceElementName }}</strong>
            </div>

            <div class="lgtc-field-row">
              <div class="lgtc-field">
                <div class="lgtc-label">{{ packedFieldLabel }}</div>
                <v-text-field
                  v-model.number="form.packed"
                  type="number"
                  min="0"
                  :max="transfer?.declaredPacked"
                  step="1"
                  variant="outlined"
                  density="compact"
                  rounded="lg"
                  hide-details
                />
                <div class="lgtc-declared">{{ t('logiDeclaredQty') }} : {{ transfer?.declaredPacked ?? 0 }}<span v-if="unitsPerPack"> ({{ unitsPerPack }} {{ item?.unit }})</span></div>
              </div>
              <div class="lgtc-field">
                <div class="lgtc-label">{{ looseFieldLabel }}</div>
                <v-text-field
                  v-model.number="form.loose"
                  type="number"
                  min="0"
                  :max="transfer?.declaredLoose"
                  step="0.01"
                  variant="outlined"
                  density="compact"
                  rounded="lg"
                  hide-details
                />
                <div class="lgtc-declared">{{ t('logiDeclaredQty') }} : {{ formatUnits(transfer?.declaredLoose ?? 0) }}<span v-if="item?.unit"> {{ item.unit }}</span></div>
              </div>
            </div>

            <div v-if="hasShortfall" class="lgtc-hint">
              <v-icon size="14" class="mr-1">mdi-alert-outline</v-icon>
              {{ t('logiConfirmTransferHint') }}
            </div>
          </div>

          <v-alert v-if="error" type="error" density="compact" variant="tonal" class="lgtc-alert">
            {{ error }}
          </v-alert>

          <!-- Footer -->
          <div class="lgtc-footer">
            <v-btn variant="text" @click="close">{{ t('logiCancel') }}</v-btn>
            <v-btn
              class="lgtc-confirm-btn"
              variant="flat"
              rounded="lg"
              :loading="saving"
              :disabled="!isValid"
              @click="submit"
            >
              <v-icon size="16" class="mr-1">mdi-check</v-icon>
              {{ t('logiConfirmBtn') }}
            </v-btn>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script>
import { useI18n } from '@/i18n/useI18n'
import { formatUnits } from '@/composables/useFormatters'
import { packedLabel, looseUnitLabel } from '@/composables/useLogisticUnitLabels'

export default {
  name: 'LogisticTransferConfirmDrawer',
  props: {
    modelValue: { type: Boolean, default: false },
    transfer: { type: Object, default: null },
    elementName: { type: String, default: '' },
    /** Denrée du référentiel (unit/packagingType), pour afficher "3 Sacs de 0.5 Kg"
     *  plutôt que le mot générique "Packed", même logique que LogisticItemCard. */
    item: { type: Object, default: null },
    unitsPerPack: { type: [Number, String], default: null },
    saving: { type: Boolean, default: false },
    error: { type: String, default: null },
  },
  emits: ['update:modelValue', 'submit'],
  setup() {
    const { t, locale } = useI18n()
    return { t, locale, formatUnits }
  },
  data() {
    return {
      form: { packed: 0, loose: 0 },
    }
  },
  computed: {
    packedFieldLabel() {
      return packedLabel(this.item, this.unitsPerPack, this.t, this.locale)
    },
    looseFieldLabel() {
      return looseUnitLabel(this.item, this.t)
    },
    hasShortfall() {
      const declaredPacked = Number(this.transfer?.declaredPacked) || 0
      const declaredLoose = Number(this.transfer?.declaredLoose) || 0
      return Number(this.form.packed) < declaredPacked || Number(this.form.loose) < declaredLoose
    },
    isValid() {
      const packed = Number(this.form.packed)
      const loose = Number(this.form.loose)
      if (!Number.isFinite(packed) || packed < 0) return false
      if (!Number.isFinite(loose) || loose < 0) return false
      const declaredPacked = Number(this.transfer?.declaredPacked) || 0
      const declaredLoose = Number(this.transfer?.declaredLoose) || 0
      return packed <= declaredPacked && loose <= declaredLoose
    },
  },
  watch: {
    modelValue(open) {
      if (open) this.resetForm()
    },
    transfer() {
      if (this.modelValue) this.resetForm()
    },
  },
  methods: {
    resetForm() {
      this.form = {
        packed: Number(this.transfer?.declaredPacked) || 0,
        loose: Number(this.transfer?.declaredLoose) || 0,
      }
    },
    close() {
      this.$emit('update:modelValue', false)
    },
    submit() {
      if (!this.isValid || !this.transfer?.movementId) return
      this.$emit('submit', {
        movementId: this.transfer.movementId,
        packed: this.form.packed,
        loose: this.form.loose,
      })
    },
  },
}
</script>

<style scoped>
.lgtc-overlay {
  position: fixed;
  inset: 0;
  z-index: 3400;
  display: flex;
  justify-content: flex-end;
  background: rgba(0, 0, 0, 0.4);
}
.lgtc-panel {
  width: 420px;
  max-width: 100vw;
  height: 100%;
  background: rgb(var(--v-theme-surface));
  display: flex;
  flex-direction: column;
  box-shadow: -4px 0 24px rgba(0, 0, 0, 0.18);
}
.lgtc-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px;
}
.lgtc-header-icon {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background: #ff3131;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.lgtc-header-text { flex: 1; min-width: 0; }
.lgtc-header-title { font-weight: 700; font-size: 15px; }
.lgtc-header-sub { font-size: 12px; opacity: 0.65; }
.lgtc-close {
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 4px;
  border-radius: 8px;
  opacity: 0.6;
}
.lgtc-close:hover { opacity: 1; background: rgba(0, 0, 0, 0.06); }

.lgtc-body { padding: 16px; flex: 1; overflow-y: auto; }
.lgtc-from { font-size: 13px; margin-bottom: 14px; display: flex; align-items: center; }
.lgtc-field-row { display: flex; gap: 12px; }
.lgtc-field { flex: 1; }
.lgtc-label { font-size: 11px; font-weight: 700; text-transform: uppercase; opacity: 0.6; margin-bottom: 4px; }
.lgtc-declared { font-size: 11px; opacity: 0.55; margin-top: 4px; }
.lgtc-hint {
  margin-top: 14px;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(255, 49, 49, 0.08);
  color: #ff3131;
  font-size: 12px;
  display: flex;
  align-items: flex-start;
}

.lgtc-alert { margin: 0 16px 12px; }

.lgtc-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid rgba(0, 0, 0, 0.08);
}
.lgtc-footer :deep(.v-btn) { border-radius: 20px; text-transform: none; font-weight: 600; padding: 0 18px; }
.lgtc-confirm-btn { background: #ff3131 !important; color: #fff !important; }

.lgtc-enter-active, .lgtc-leave-active { transition: opacity 0.18s ease; }
.lgtc-enter-from, .lgtc-leave-to { opacity: 0; }
</style>
