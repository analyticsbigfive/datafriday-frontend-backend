<template>
  <v-dialog :model-value="modelValue" max-width="560" @update:model-value="$emit('update:modelValue', $event)">
    <div class="lgsim-card" :class="{ 'lgsim-card--dark': isDark }">
      <div class="lgsim-header">
        <div class="lgsim-header__icon"><v-icon size="20" color="white">mdi-flask-outline</v-icon></div>
        <div class="lgsim-header__title">{{ t('logiSimulateTitle') }}</div>
        <button type="button" class="lgsim-header__close" :aria-label="t('logiClose')" @click="close"><v-icon size="18">mdi-close</v-icon></button>
      </div>

      <div class="lgsim-body">
        <template v-if="!result">
          <div class="lgsim-notice">
            <v-icon size="16" class="lgsim-notice__icon">mdi-alert-outline</v-icon>
            <span>{{ t('logiSimulateWarning') }}</span>
          </div>

          <p class="lgsim-intro">{{ t('logiSimulateIntro') }}</p>

          <div class="lgsim-field">
            <div class="lgsim-label">{{ t('logiSimulateShop') }}</div>
            <select v-model="form.elementId" class="form-select lgsim-select">
              <option v-for="opt in shopOptions" :key="opt.value" :value="opt.value">{{ opt.title }}</option>
            </select>
          </div>

          <div v-if="form.elementId && !menuItemOptions.length" class="lgsim-empty">
            {{ t('logiSimulateNoMenuItems') }}
          </div>

          <div v-for="(line, i) in form.lines" :key="i" class="lgsim-line">
            <select v-model="line.menuItemId" class="form-select lgsim-select lgsim-line-item">
              <option :value="null" disabled>{{ t('logiSimulateMenuItem') }}</option>
              <option v-for="opt in menuItemOptions" :key="opt.value" :value="opt.value">{{ opt.title }}</option>
            </select>
            <input
              v-model.number="line.quantity"
              type="number"
              min="1"
              step="1"
              class="form-control lgsim-input lgsim-line-qty"
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
        </template>

        <template v-else>
          <div class="lgsim-notice">
            <v-icon size="16" class="lgsim-notice__icon">mdi-alert-outline</v-icon>
            <span>{{ t('logiSimulateWarning') }}</span>
          </div>

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
        </template>
      </div>

      <!-- Erreur : rendue ici, hors de v-card-text, toujours visible juste au-dessus du
           footer d'actions — plutôt qu'au milieu du formulaire (invisible une fois scrollé
           sur un écran bas, ou perdue derrière plusieurs lignes de vente ajoutées). -->
      <v-alert v-if="error && !result" type="error" density="compact" variant="tonal" class="lgsim-error">
        {{ error }}
      </v-alert>

      <div class="lgsim-footer">
        <button
          v-if="result"
          type="button"
          class="lgsim-btn lgsim-btn--danger"
          :disabled="purging"
          @click="$emit('purge', result.elementId)"
        >
          <v-progress-circular v-if="purging" size="15" width="2" indeterminate color="#ff3131" class="mr-1" />
          <v-icon v-else size="16" class="mr-1">mdi-delete-sweep-outline</v-icon>
          {{ t('logiSimulatePurge') }}
        </button>
        <v-spacer />
        <template v-if="!result">
          <button type="button" class="lgsim-btn lgsim-btn--ghost" @click="close">{{ t('logiCancel') }}</button>
          <button type="button" class="lgsim-btn lgsim-btn--primary" :disabled="!isValid || saving" @click="submit">
            <v-progress-circular v-if="saving" size="15" width="2" indeterminate color="white" class="mr-1" />
            {{ t('logiSimulateGo') }}
          </button>
        </template>
        <template v-else>
          <button type="button" class="lgsim-btn lgsim-btn--ghost" @click="simulateAnother">{{ t('logiSimulateAnother') }}</button>
          <button type="button" class="lgsim-btn lgsim-btn--primary" @click="close">{{ t('logiClose') }}</button>
        </template>
      </div>
    </div>
  </v-dialog>
</template>

<script>
import { computed } from 'vue'
import { useTheme } from 'vuetify'
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
    const theme = useTheme()
    const isDark = computed(() => !!theme.global.current.value.dark)
    return { t, formatUnits, isDark }
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
.lgsim-card { background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,.18); }

/* Header rouge charte */
.lgsim-header { display: flex; align-items: center; gap: 12px; padding: 16px 18px; background: #ff3131; }
.lgsim-header__icon { width: 38px; height: 38px; border-radius: 11px; background: rgba(255,255,255,.2); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.lgsim-header__title { flex: 1; min-width: 0; color: #fff; font-size: var(--fs-md); font-weight: 700; }
.lgsim-header__close { width: 30px; height: 30px; border: none; border-radius: 8px; background: rgba(255,255,255,.18); color: rgba(255,255,255,.9); display: flex; align-items: center; justify-content: center; cursor: pointer; transition: background .18s; flex-shrink: 0; }
.lgsim-header__close:hover { background: rgba(255,255,255,.3); }

.lgsim-body { padding: 20px; }
.lgsim-footer { display: flex; align-items: center; gap: 8px; padding: 14px 18px; border-top: 1px solid #f0f0f0; background: #fafafa; }

/* Boutons pilule charte */
.lgsim-btn { display: inline-flex; align-items: center; gap: 5px; padding: 8px 18px; border-radius: 100px; font-size: var(--fs-base); font-weight: 600; cursor: pointer; border: none; transition: all .2s; }
.lgsim-btn:disabled { opacity: .55; cursor: not-allowed; }
.lgsim-btn--ghost { background: transparent; border: 1.5px solid #e5e7eb; color: #6b7280; }
.lgsim-btn--ghost:hover:not(:disabled) { background: #f3f4f6; color: #374151; }
.lgsim-btn--primary { background: #ff3131; color: #fff; box-shadow: 0 4px 12px rgba(255,49,49,.3); }
.lgsim-btn--primary:hover:not(:disabled) { box-shadow: 0 6px 18px rgba(255,49,49,.4); transform: translateY(-1px); }
.lgsim-btn--danger { background: transparent; color: #ff3131; }
.lgsim-btn--danger:hover:not(:disabled) { background: rgba(255,49,49,.08); }

/* Sibling fixe entre le corps et le footer, alignée sur le padding horizontal du body. */
.lgsim-error { margin: 0 20px 12px; }
.lgsim-intro { font-size: 0.84rem; color: var(--fb-muted, #6b7280); margin: 0 0 14px; }
.lgsim-field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
.lgsim-label { font-size: 0.8rem; font-weight: 600; color: var(--fb-muted, #374151); }
.lgsim-empty { font-size: 0.82rem; color: var(--fb-faint, #9ca3af); margin-bottom: 10px; }
.lgsim-line { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.lgsim-line-item { flex: 1 1 auto; }
.lgsim-line-qty { width: 92px; flex: 0 0 92px; }
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
.lgsim-realmode { margin: 8px 0 2px; }
.lgsim-realmode-hint { font-size: 0.76rem; color: var(--fb-muted, #6b7280); margin: 4px 0 4px 2px; line-height: 1.4; }

/* Panneau d'avertissement unifié (neutre gris + icône rouge marque, plus de jaune Vuetify).
   Affiché en tête du dialog → marge basse. */
.lgsim-notice { display: flex; align-items: flex-start; gap: 8px; margin: 0 0 14px; padding: 10px 12px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; font-size: 0.82rem; color: #374151; line-height: 1.45; }
.lgsim-notice__icon { color: #ff3131; flex-shrink: 0; margin-top: 1px; }
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

/* Champs Bootstrap — focus rouge marque, taille confortable */
.lgsim-select,
.lgsim-input { border-radius: 10px; border: 1.5px solid #e5e7eb; font-size: var(--fs-md); }
.lgsim-input { padding: 9px 12px; }
.lgsim-select:focus,
.lgsim-input:focus { border-color: #ff3131; box-shadow: 0 0 0 3px rgba(255,49,49,.12); }

/* ── Dark (v-dialog téléporté → classe portée sur la carte) ── */
.lgsim-card--dark { background: #1e293b; }
.lgsim-card--dark .lgsim-body { background: #1e293b; }
.lgsim-card--dark .lgsim-footer { background: #111827; border-top-color: rgba(255,255,255,.08); }
.lgsim-card--dark .lgsim-intro { color: #94a3b8; }
.lgsim-card--dark .lgsim-label { color: #cbd5e1; }
.lgsim-card--dark .lgsim-empty { color: #64748b; }
.lgsim-card--dark .lgsim-realmode-hint { color: #94a3b8; }
.lgsim-card--dark .lgsim-line-remove { color: #94a3b8; }
.lgsim-card--dark .lgsim-line-remove:hover:not(:disabled) { background: rgba(255,255,255,.08); }
.lgsim-card--dark .lgsim-result-shop { color: #f1f5f9; }
.lgsim-card--dark .lgsim-result-table th { color: #94a3b8; border-bottom-color: rgba(255,255,255,.1); }
.lgsim-card--dark .lgsim-result-table td { color: #e2e8f0; border-bottom-color: rgba(255,255,255,.06); }
.lgsim-card--dark .lgsim-select,
.lgsim-card--dark .lgsim-input { background-color: #0f172a; border-color: rgba(255,255,255,.14); color: #e5e7eb; color-scheme: dark; }
.lgsim-card--dark .lgsim-select {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath fill='none' stroke='%2394a3b8' stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='m2 5 6 6 6-6'/%3E%3C/svg%3E");
}
.lgsim-card--dark .lgsim-notice { background: #111827; border-color: rgba(255,255,255,.08); color: #cbd5e1; }
.lgsim-card--dark .lgsim-btn--ghost { background: transparent; border-color: rgba(255,255,255,.14); color: #cbd5e1; }
.lgsim-card--dark .lgsim-btn--ghost:hover:not(:disabled) { background: #374151; color: #fff; }
</style>
