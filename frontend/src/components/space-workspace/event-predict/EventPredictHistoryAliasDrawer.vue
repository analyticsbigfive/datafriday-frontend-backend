<template>
  <EventDrawerShell
    :model-value="modelValue"
    :title="t('ephaTitle')"
    :subtitle="contextLabel || t('ephaSubtitle')"
    :is-dark="isDark"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <template #icon>
      <v-icon color="white" size="21">mdi-history</v-icon>
    </template>

    <div class="epha-scroll">
      <!-- 1) Ancien article : source de l'historique (items timeline BRUTS,
           avant réécriture par les alias existants). -->
      <div class="epha-field">
        <label class="epha-label">{{ t('ephaSourceLabel') }}</label>
        <v-autocomplete
          v-model="source"
          :items="sourceCandidates"
          :item-title="candidateLabel"
          return-object
          density="compact"
          variant="outlined"
          hide-details
          :menu-props="{ class: 'epha-select-overlay' }"
          :placeholder="t('ephaSourcePlaceholder')"
        />
        <p v-if="suggested && source && suggested === source" class="epha-suggest">
          ✓ {{ t('ephaSuggested') }}
        </p>
      </div>

      <!-- 2) Nouvel article : cible des prévisions (catalogue de l'espace),
           pré-rempli avec la ligne cliquée. -->
      <div class="epha-field">
        <label class="epha-label">{{ t('ephaTargetLabel') }}</label>
        <v-autocomplete
          v-model="targetId"
          :items="catalogItems"
          item-title="name"
          item-value="id"
          density="compact"
          variant="outlined"
          hide-details
          :menu-props="{ class: 'epha-select-overlay' }"
          :placeholder="t('ephaTargetPlaceholder')"
        />
      </div>

      <!-- 3) Alias existants de l'espace, supprimables. -->
      <div class="epha-field">
        <label class="epha-label">{{ t('ephaExistingTitle') }}</label>
        <div v-if="aliases.length" class="epha-alias-list">
          <!-- Réunion 13/08 : clic sur un alias mémorisé → pré-remplit le
               formulaire pour le modifier (le save upsert par sourceName
               écrase l'existant). -->
          <div v-for="a in aliases" :key="a.id" class="epha-alias-row">
            <button
              type="button"
              class="epha-alias-names"
              :title="t('ephaEditAlias')"
              @click="editAlias(a)"
            >
              {{ a.sourceName }}
              <span class="epha-alias-arrow">→</span>
              {{ targetName(a.targetMenuItemId) }}
            </button>
            <button
              type="button"
              class="epha-alias-del"
              :aria-label="t('ephaDelete')"
              :title="t('ephaDelete')"
              @click="$emit('remove-alias', { id: a.id })"
            >
              ✕
            </button>
          </div>
        </div>
        <p v-else class="epha-empty">{{ t('ephaNoAliases') }}</p>
      </div>

      <p class="epha-hint">{{ t('ephaHint') }}</p>
    </div>

    <template #footer>
      <div class="epha-footer-actions">
        <button
          type="button"
          class="epha-btn epha-btn--ghost"
          @click="$emit('update:modelValue', false)"
        >
          {{ t('cancel') }}
        </button>
        <button
          type="button"
          class="epha-btn epha-btn--primary"
          :disabled="!canApply || loading"
          @click="apply"
        >
          <v-progress-circular v-if="loading" indeterminate size="14" width="2" />
          {{ t('ephaMapRecalc') }}
        </button>
      </div>
    </template>
  </EventDrawerShell>
</template>

<script>
import { computed } from 'vue'
import { useTheme } from 'vuetify'
import EventDrawerShell from '@/components/events/drawers/EventDrawerShell.vue'
import { useI18n } from '@/i18n/useI18n'
import { findBestMatch } from '@/utils/menuItemMatching'
import { formatCurrency } from '@/composables/useFormatters'

/**
 * Drawer « Utiliser l'historique d'un autre article » (maquettes 08/2026).
 * Même tiroir que le reste de l'app (EventDrawerShell, pattern
 * EventPredictSourcesDrawer). État local : rien n'est appliqué avant
 * « Mapper & recalculer » — le parent crée alors l'alias (store historyAliases)
 * et la chaîne de computeds recalcule sans refetch réseau de timeline.
 */
export default {
  name: 'EventPredictHistoryAliasDrawer',
  components: { EventDrawerShell },
  setup() {
    const { t } = useI18n()
    const theme = useTheme()
    const isDark = computed(() => !!theme.global.current.value.dark)
    return { t, isDark }
  },
  props: {
    modelValue: { type: Boolean, default: false },
    /** « Espace · Config · PDV » affiché en sous-titre. */
    contextLabel: { type: String, default: '' },
    /** Ligne cliquée : cible pré-remplie ({ id, name }). */
    targetItem: { type: Object, default: null },
    /** Catalogue de l'espace ({ id, name, basePrice }) — cibles possibles. */
    catalogItems: { type: Array, default: () => [] },
    /**
     * Items DISTINCTS de la timeline BRUTE (avant alias) — sources possibles :
     * { sourceMenuItemId|null, name, avgPrice|null, totalQuantity }.
     */
    sourceCandidates: { type: Array, default: () => [] },
    /** Alias existants de l'espace (lignes MenuItemHistoryAlias). */
    aliases: { type: Array, default: () => [] },
    loading: { type: Boolean, default: false },
  },
  emits: ['update:modelValue', 'apply', 'remove-alias'],
  data() {
    return {
      source: null,
      targetId: null,
      suggested: null,
    }
  },
  computed: {
    canApply() {
      return !!(this.source && this.source.name && this.targetId)
    },
  },
  watch: {
    // Copie de travail resynchronisée à chaque ouverture (annuler = sans effet).
    modelValue(open) {
      if (!open) return
      this.targetId = this.targetItem?.id ?? null
      // Pré-suggestion par NOM seul (findBestMatch en mode string : pas de
      // filtre dur sur le prix — les prix « proches » diffèrent souvent de
      // plus d'un centime entre l'ancienne et la nouvelle référence).
      const best = this.targetItem?.name
        ? findBestMatch(this.targetItem.name, this.sourceCandidates)
        : null
      this.source = best
        ? this.sourceCandidates.find((c) => c.name === best.name) || null
        : null
      this.suggested = this.source
    },
  },
  methods: {
    candidateLabel(c) {
      if (!c || typeof c !== 'object') return ''
      const parts = [c.name]
      if (c.totalQuantity) parts.push(`${c.totalQuantity} u`)
      if (c.avgPrice != null) parts.push(formatCurrency(c.avgPrice))
      return parts.join(' · ')
    },
    targetName(id) {
      const mi = this.catalogItems.find((m) => String(m.id) === String(id))
      return mi ? mi.name : id
    },
    /**
     * Clic sur un alias existant : recharge source + cible dans le formulaire.
     * La source est retrouvée dans les candidats timeline par nom (fallback :
     * objet minimal reconstruit depuis l'alias, suffisant pour apply()).
     */
    editAlias(a) {
      const byName = this.sourceCandidates.find(
        (c) => String(c.name).toLowerCase() === String(a.sourceName).toLowerCase(),
      )
      this.source = byName || {
        sourceMenuItemId: a.sourceMenuItemId || null,
        name: a.sourceName,
        avgPrice: null,
        totalQuantity: 0,
      }
      this.targetId = a.targetMenuItemId
      this.suggested = null
    },
    apply() {
      if (!this.canApply) return
      this.$emit('apply', {
        sourceMenuItemId: this.source.sourceMenuItemId || undefined,
        sourceName: this.source.name,
        targetMenuItemId: this.targetId,
      })
    },
  },
}
</script>

<style>
/* Menus des deux autocompletes, PAR CLASSE et non par le prop zIndex : `useStack`
   de Vuetify n'honore le prop que si la pile globale d'overlays est vide — un
   overlay encore enregistré (kebab v-menu, tooltip) et le menu retombe à
   `lastZIndex + 10` (~2010), SOUS le drawer forcé à 2200 (EventDrawerShell).
   Symptôme : chevron inversé, menu « vide », aucune erreur — même bug que
   BUG-241 (CsvImportDrawer), même correctif : classe posée sur le `.v-overlay`
   externe via menu-props + z-index !important, insensible à la pile. */
.epha-select-overlay {
  z-index: 2300 !important;
}
</style>

<style scoped>
.epha-scroll {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 4px 2px;
}
.epha-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.epha-label {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--fb-muted, #6b7280);
}
.epha-suggest {
  margin: 5px 0 0;
  font-size: 0.76rem;
  color: var(--fb-success, #0e7a5f);
}
.epha-alias-list {
  border: 1px solid var(--fb-border, #e5e7eb);
  border-radius: var(--fb-radius-control, 8px);
}
.epha-alias-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  font-size: 0.84rem;
  border-top: 1px solid var(--fb-border, #e5e7eb);
}
.epha-alias-row:first-child {
  border-top: 0;
}
.epha-alias-names {
  flex: 1;
  min-width: 0;
  color: var(--fb-text, #111827);
  /* Bouton (édition au clic) déguisé en texte : reset + affordance hover. */
  border: 0;
  background: transparent;
  font: inherit;
  text-align: left;
  padding: 0;
  cursor: pointer;
  border-radius: 6px;
}
.epha-alias-names:hover,
.epha-alias-names:focus-visible {
  text-decoration: underline;
  outline: none;
}
.epha-alias-arrow {
  color: var(--fb-faint, #9ca3af);
  margin: 0 4px;
}
.epha-alias-del {
  border: 0;
  background: transparent;
  color: var(--destructive, #b91c1c);
  cursor: pointer;
  font-size: 0.9rem;
  padding: 2px 6px;
  border-radius: 5px;
}
.epha-alias-del:hover {
  background: color-mix(in srgb, var(--destructive, #b91c1c) 10%, transparent);
}
.epha-empty {
  margin: 0;
  font-size: 0.8rem;
  color: var(--fb-muted, #6b7280);
}
.epha-hint {
  margin: 0;
  font-size: 0.78rem;
  color: var(--fb-muted, #6b7280);
}
.epha-footer-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  width: 100%;
}
.epha-btn {
  border-radius: var(--fb-radius-control, 8px);
  padding: 8px 16px;
  font-size: 0.86rem;
  font-weight: 600;
  cursor: pointer;
}
.epha-btn--ghost {
  background: transparent;
  border: 1px solid var(--fb-border, #d1d5db);
  color: var(--fb-muted, #6b7280);
}
.epha-btn--primary {
  background: var(--df-primary, #ff3131);
  border: 1px solid var(--df-primary, #ff3131);
  color: #fff;
}
.epha-btn--primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
