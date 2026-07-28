<template>
  <v-dialog :model-value="modelValue" max-width="560" @update:model-value="$emit('update:modelValue', $event)">
    <v-card class="lgsim-card">
      <v-card-title class="lgsim-title">
        <v-icon size="20" class="mr-2">mdi-flask-outline</v-icon>
        {{ t('logiSimulateTitle') }}
      </v-card-title>

      <v-card-text>
        <template v-if="!result">
          <p class="lgsim-intro">{{ t('logiSimulateIntro') }}</p>

          <div class="lgsim-field">
            <div class="lgsim-label">{{ t('logiSimulateShop') }}</div>
            <v-select
              v-model="form.elementId"
              :items="shopOptions"
              item-title="title"
              item-value="value"
              variant="outlined"
              density="compact"
              rounded="lg"
              hide-details
              :menu-props="{ zIndex: 3500 }"
            />
          </div>

          <div v-if="form.elementId && !menuItemOptions.length" class="lgsim-empty">
            {{ t('logiSimulateNoMenuItems') }}
          </div>

          <div v-for="(line, i) in form.lines" :key="i" class="lgsim-line">
            <v-select
              v-model="line.menuItemId"
              :items="menuItemOptions"
              item-title="title"
              item-value="value"
              variant="outlined"
              density="compact"
              rounded="lg"
              hide-details
              class="lgsim-line-item"
              :placeholder="t('logiSimulateMenuItem')"
              :menu-props="{ zIndex: 3500 }"
            />
            <v-text-field
              v-model.number="line.quantity"
              type="number"
              min="1"
              step="1"
              variant="outlined"
              density="compact"
              rounded="lg"
              hide-details
              class="lgsim-line-qty"
            />
            <button
              type="button"
              class="lgsim-line-remove"
              :disabled="form.lines.length <= 1"
              @click="removeLine(i)"
            >
              <v-icon size="16">mdi-close</v-icon>
            </button>
          </div>
          <button type="button" class="lgsim-add-line" @click="addLine">
            <v-icon size="16" class="mr-1">mdi-plus</v-icon>
            {{ t('logiSimulateAddLine') }}
          </button>

          <div class="lgsim-realmode">
            <v-switch
              v-model="form.realMode"
              color="#ff3131"
              density="compact"
              hide-details
              :label="t('logiSimulateRealMode')"
            />
            <div class="lgsim-realmode-hint">{{ t('logiSimulateRealModeHint') }}</div>
          </div>

          <v-alert v-if="error" type="error" density="compact" variant="tonal" class="mt-3">
            {{ error }}
          </v-alert>
          <v-alert type="warning" variant="tonal" density="compact" class="mt-3">
            {{ t('logiSimulateWarning') }}
          </v-alert>
        </template>

        <template v-else>
          <div class="lgsim-result-shop">{{ result.elementName }}</div>
          <table class="lgsim-result-table">
            <thead>
              <tr>
                <th>{{ t('logiSimulateItem') }}</th>
                <th>{{ t('logiSimulateBefore') }}</th>
                <th>{{ t('logiSimulateAfter') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="line in result.lines" :key="line.itemKey">
                <td>{{ line.itemKey }}</td>
                <td>{{ line.before.packed }} {{ t('logiPackedShort') }} · {{ formatUnits(line.before.loose) }} {{ t('logiLooseShort') }}</td>
                <td>{{ line.after.packed }} {{ t('logiPackedShort') }} · {{ formatUnits(line.after.loose) }} {{ t('logiLooseShort') }}</td>
              </tr>
            </tbody>
          </table>
          <v-alert type="warning" variant="tonal" density="compact" class="mt-3">
            {{ t('logiSimulateWarning') }}
          </v-alert>
        </template>
      </v-card-text>

      <v-card-actions class="px-4 pb-4">
        <v-btn
          v-if="result"
          variant="text"
          color="error"
          :loading="purging"
          @click="$emit('purge', result.elementId)"
        >
          <v-icon size="16" class="mr-1">mdi-delete-sweep-outline</v-icon>
          {{ t('logiSimulatePurge') }}
        </v-btn>
        <v-spacer />
        <template v-if="!result">
          <v-btn variant="text" @click="close">{{ t('logiCancel') }}</v-btn>
          <v-btn color="#ff3131" variant="flat" :loading="saving" :disabled="!isValid" @click="submit">
            {{ t('logiSimulateGo') }}
          </v-btn>
        </template>
        <template v-else>
          <v-btn variant="text" @click="simulateAnother">{{ t('logiSimulateAnother') }}</v-btn>
          <v-btn color="#ff3131" variant="flat" @click="close">{{ t('logiClose') }}</v-btn>
        </template>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script>
import { useI18n } from '@/i18n/useI18n'
import { formatUnits } from '@/composables/useFormatters'

/**
 * QA — simule une vente Weezevent (transaction+items synthétiques marqués
 * isSimulated) sur un PDV, pour vérifier la déduction de stock (Loose/Packed,
 * casse de pack) sans attendre une vraie vente. Purement présentiel : le parent
 * fait les appels API (emits `submit`/`purge`) et pilote `saving`/`purging`/
 * `error`/`result`. `result` (non null) bascule la vue en récapitulatif
 * avant/après + bouton de purge.
 */
export default {
  name: 'LogisticSimulateSaleDialog',
  props: {
    modelValue: { type: Boolean, default: false },
    /** PDV candidats [{ element:{id,name}, items:[{name,usedIn:[{id,name}]}] }] */
    shops: { type: Array, default: () => [] },
    saving: { type: Boolean, default: false },
    purging: { type: Boolean, default: false },
    error: { type: String, default: null },
    /** { elementId, elementName, lines:[{itemKey, before:{packed,loose}, after:{packed,loose}}] } | null */
    result: { type: Object, default: null },
    /** Valeur initiale du toggle "mode réel" à l'ouverture (Live en a besoin à true, Logistique reste à false). */
    defaultRealMode: { type: Boolean, default: false },
  },
  emits: ['update:modelValue', 'submit', 'purge', 'reset-result'],
  setup() {
    const { t } = useI18n()
    return { t, formatUnits }
  },
  data() {
    return {
      form: { elementId: null, lines: [{ menuItemId: null, quantity: 1 }], realMode: this.defaultRealMode },
    }
  },
  computed: {
    shopOptions() {
      // `element.provider` (WEEZEVENT/DIGIFOOD) est optionnel — absent tant que
      // le backend appelant ne le fournit pas (rétrocompatible, ex. Logistique
      // avant ce champ) ; affiché seulement quand présent (ex. picker Live).
      const providerLabel = { WEEZEVENT: 'Weezevent', DIGIFOOD: 'Digifood' }
      return this.shops.map((s) => ({
        title: providerLabel[s.element.provider]
          ? `${s.element.name} (${providerLabel[s.element.provider]})`
          : s.element.name,
        value: s.element.id,
      }))
    },
    /** Menu items sellable sur le PDV sélectionné, déduits de items[].usedIn (déjà résolu côté serveur). */
    menuItemOptions() {
      const shop = this.shops.find((s) => s.element.id === this.form.elementId)
      if (!shop) return []
      const map = new Map()
      for (const item of shop.items || []) {
        for (const u of item.usedIn || []) {
          if (u?.id && !map.has(u.id)) map.set(u.id, u.name)
        }
      }
      return [...map.entries()]
        .map(([value, title]) => ({ title, value }))
        .sort((a, b) => a.title.localeCompare(b.title, 'fr'))
    },
    isValid() {
      if (!this.form.elementId || !this.form.lines.length) return false
      return this.form.lines.every((l) => l.menuItemId && Number(l.quantity) >= 1)
    },
  },
  watch: {
    modelValue(open) {
      if (open) this.resetForm()
    },
    'form.elementId'() {
      // Les menuItemId sélectionnés référencent le PDV précédent — repart d'une ligne vide.
      this.form.lines = [{ menuItemId: null, quantity: 1 }]
    },
  },
  methods: {
    close() {
      this.$emit('update:modelValue', false)
    },
    resetForm() {
      this.form = {
        elementId: this.shops[0]?.element?.id ?? null,
        lines: [{ menuItemId: null, quantity: 1 }],
        realMode: this.defaultRealMode,
      }
    },
    simulateAnother() {
      this.resetForm()
      this.$emit('reset-result')
    },
    addLine() {
      this.form.lines.push({ menuItemId: null, quantity: 1 })
    },
    removeLine(i) {
      if (this.form.lines.length <= 1) return
      this.form.lines.splice(i, 1)
    },
    submit() {
      if (!this.isValid) return
      this.$emit('submit', {
        elementId: this.form.elementId,
        lines: this.form.lines.map((l) => ({
          menuItemId: l.menuItemId,
          quantity: Math.max(1, Math.round(Number(l.quantity) || 1)),
        })),
        realMode: this.form.realMode,
      })
    },
  },
}
</script>

<style scoped>
.lgsim-card { border-radius: 16px; }
.lgsim-title { display: flex; align-items: center; font-weight: 700; padding: 16px 20px 4px; }
.lgsim-intro { font-size: 0.84rem; color: var(--fb-muted, #6b7280); margin: 0 0 14px; }
.lgsim-field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
.lgsim-label { font-size: 0.8rem; font-weight: 600; color: var(--fb-muted, #374151); }
.lgsim-empty { font-size: 0.82rem; color: var(--fb-faint, #9ca3af); margin-bottom: 10px; }
.lgsim-line { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.lgsim-line-item { flex: 1 1 auto; }
.lgsim-line-qty { width: 84px; flex: 0 0 84px; }
.lgsim-line-remove {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: var(--fb-muted, #6b7280);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.lgsim-line-remove:hover:not(:disabled) { background: var(--fb-subtle, #f3f4f6); }
.lgsim-line-remove:disabled { opacity: 0.35; cursor: default; }
.lgsim-add-line {
  display: inline-flex;
  align-items: center;
  border: none;
  background: transparent;
  color: var(--fb-primary, #ff3131);
  font-weight: 600;
  font-size: 0.84rem;
  cursor: pointer;
  padding: 4px 0;
}
.lgsim-realmode { margin: 4px 0 2px; }
.lgsim-realmode-hint { font-size: 0.76rem; color: var(--fb-muted, #6b7280); margin: -6px 0 4px 2px; }
.lgsim-result-shop { font-weight: 700; font-size: 0.95rem; margin-bottom: 10px; }
.lgsim-result-table { width: 100%; border-collapse: collapse; font-size: 0.84rem; }
.lgsim-result-table th {
  text-align: left;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--fb-muted, #6b7280);
  padding: 4px 8px 6px 0;
  border-bottom: 1px solid var(--fb-border, #e5e7eb);
}
.lgsim-result-table td { padding: 6px 8px 6px 0; border-bottom: 1px solid var(--fb-subtle, #f3f4f6); }
</style>
