<template>
  <Teleport to="body">
    <Transition name="lgdc">
      <div v-if="modelValue" class="lgdc-overlay" @click.self="close">
        <div class="lgdc-panel">
          <div class="lgdc-header">
            <div class="lgdc-header-icon"><v-icon size="18" color="white">mdi-truck-delivery-outline</v-icon></div>
            <div class="lgdc-header-text">
              <div class="lgdc-header-title">{{ t('logiDepositConfirmTitle') }}</div>
              <div class="lgdc-header-sub">{{ deposit?.itemName }} · {{ deposit?.shopName }}</div>
            </div>
            <button class="lgdc-close" type="button" @click="close">
              <v-icon size="18">mdi-close</v-icon>
            </button>
          </div>
          <v-divider />

          <div class="lgdc-body">
            <div class="lgdc-expected">
              {{ t('logiColToDeposit') }} : <strong>{{ expectedLabel }}</strong>
            </div>

            <div class="lgdc-field-row">
              <div v-if="hasPacks" class="lgdc-field">
                <div class="lgdc-label">{{ packedFieldLabel }}</div>
                <v-text-field
                  v-model.number="form.packed"
                  type="number"
                  min="0"
                  step="1"
                  variant="outlined"
                  density="compact"
                  rounded="lg"
                  hide-details
                />
              </div>
              <div class="lgdc-field">
                <div class="lgdc-label">{{ looseFieldLabel }}</div>
                <v-text-field
                  v-model.number="form.loose"
                  type="number"
                  min="0"
                  step="0.01"
                  variant="outlined"
                  density="compact"
                  rounded="lg"
                  hide-details
                />
              </div>
            </div>
            <div class="lgdc-hint">{{ t('logiDepositConfirmHint') }}</div>
          </div>

          <v-alert v-if="error" type="error" density="compact" variant="tonal" class="lgdc-alert">
            {{ error }}
          </v-alert>

          <div class="lgdc-footer">
            <v-btn variant="text" @click="close">{{ t('logiCancel') }}</v-btn>
            <v-btn
              class="lgdc-confirm-btn"
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
import { translatePackagingType, pluralize } from '@/utils/packagingTypeTranslations'

/**
 * Confirmation d'un dépôt de la feuille de ventilation (demande Bertrand
 * 2026-10-08) : quantité pré-remplie avec le reste à déposer, modifiable. Le
 * parent crée le mouvement Logistic de raison « Ventilation ». Sans dépendance
 * au store, pour servir aussi à la page invitée (accès PIN).
 */
export default {
  name: 'LogisticDepositConfirmDrawer',
  props: {
    modelValue: { type: Boolean, default: false },
    /** { itemName, shopName, unit, packagingType, unitsPerPack, quantity, packs } */
    deposit: { type: Object, default: null },
    saving: { type: Boolean, default: false },
    error: { type: String, default: null },
  },
  emits: ['update:modelValue', 'submit'],
  setup() {
    const { t, locale } = useI18n()
    return { t, locale }
  },
  data() {
    return {
      form: { packed: 0, loose: 0 },
    }
  },
  computed: {
    /** Stand-in d'article pour les libellés partagés (unit/packagingType). */
    itemLike() {
      return { unit: this.deposit?.unit || null, packagingType: this.deposit?.packagingType || null }
    },
    hasPacks() {
      return this.deposit?.packs != null || !!this.deposit?.unitsPerPack
    },
    packedFieldLabel() {
      return packedLabel(this.itemLike, this.deposit?.unitsPerPack, this.t, this.locale)
    },
    looseFieldLabel() {
      return looseUnitLabel(this.itemLike, this.t)
    },
    expectedLabel() {
      const d = this.deposit
      if (!d) return ''
      if (d.packs != null) {
        const type = translatePackagingType(d.packagingType, this.locale)
        const word = type ? (d.packs > 1 ? pluralize(type) : type) : this.t('logiPacksShort')
        return `${formatUnits(d.packs)} ${word}`
      }
      return `${formatUnits(d.quantity)}${d.unit ? ` ${d.unit}` : ''}`
    },
    isValid() {
      const packed = Number(this.form.packed) || 0
      const loose = Number(this.form.loose) || 0
      if (packed < 0 || loose < 0 || !Number.isInteger(packed)) return false
      return packed > 0 || loose > 0
    },
  },
  watch: {
    modelValue(open) {
      if (open) this.resetForm()
    },
    deposit() {
      if (this.modelValue) this.resetForm()
    },
  },
  methods: {
    resetForm() {
      const d = this.deposit
      this.form = d?.packs != null
        ? { packed: d.packs, loose: 0 }
        : { packed: 0, loose: Number(d?.quantity) || 0 }
    },
    close() {
      this.$emit('update:modelValue', false)
    },
    submit() {
      if (!this.isValid) return
      this.$emit('submit', {
        packed: Number(this.form.packed) || 0,
        loose: Number(this.form.loose) || 0,
      })
    },
  },
}
</script>

<style scoped>
.lgdc-overlay { position: fixed; inset: 0; z-index: 3400; display: flex; justify-content: flex-end; background: rgba(0, 0, 0, 0.4); }
.lgdc-panel { width: 420px; max-width: 100vw; height: 100%; background: rgb(var(--v-theme-surface)); display: flex; flex-direction: column; box-shadow: -4px 0 24px rgba(0, 0, 0, 0.18); }
.lgdc-header { display: flex; align-items: center; gap: 10px; padding: 16px; }
.lgdc-header-icon { width: 34px; height: 34px; border-radius: 10px; background: #ff3131; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.lgdc-header-text { flex: 1; min-width: 0; }
.lgdc-header-title { font-weight: var(--fw-bold); font-size: var(--fs-md); }
.lgdc-header-sub { font-size: var(--fs-sm); opacity: 0.65; }
.lgdc-close { border: none; background: transparent; cursor: pointer; padding: 4px; border-radius: 8px; opacity: 0.6; }
.lgdc-close:hover { opacity: 1; background: rgba(0, 0, 0, 0.06); }

.lgdc-body { padding: 16px; flex: 1; overflow-y: auto; }
.lgdc-expected { font-size: var(--fs-base); margin-bottom: 14px; color: #B45309; }
.lgdc-field-row { display: flex; gap: 12px; }
.lgdc-field { flex: 1; }
.lgdc-label { font-size: var(--fs-xs); font-weight: var(--fw-bold); text-transform: uppercase; opacity: 0.6; margin-bottom: 4px; }
.lgdc-hint { margin-top: 14px; font-size: var(--fs-sm); opacity: 0.6; }

.lgdc-alert { margin: 0 16px 12px; }

.lgdc-footer { display: flex; justify-content: flex-end; gap: 8px; padding: 12px 16px; border-top: 1px solid rgba(0, 0, 0, 0.08); }
.lgdc-footer :deep(.v-btn) { border-radius: 20px; text-transform: none; font-weight: var(--fw-semibold); padding: 0 18px; }
.lgdc-confirm-btn { background: #ff3131 !important; color: #fff !important; }

.lgdc-enter-active, .lgdc-leave-active { transition: opacity 0.18s ease; }
.lgdc-enter-from, .lgdc-leave-to { opacity: 0; }
</style>
