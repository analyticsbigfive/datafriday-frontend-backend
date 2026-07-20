<template>
  <v-card class="lg-item-card" variant="outlined">
    <span v-if="status !== 'ok'" class="lg-card-stripe" :class="status === 'bad' ? 'lg-stripe-bad' : 'lg-stripe-warn'"></span>
    <div class="lg-item-top">
      <img
        v-if="resolvedPicture && !imgFailed"
        :src="resolvedPicture"
        :alt="item.name"
        class="lg-item-pic"
        @error="imgFailed = true"
      />
      <div v-else class="lg-item-pic lg-item-pic-placeholder">
        <v-icon size="20" color="grey">mdi-package-variant-closed</v-icon>
      </div>
      <div class="lg-item-name-wrap">
        <div class="lg-item-name">{{ item?.name }}</div>
        <div v-if="unitsPerPack" class="lg-item-unit">
          {{ unitsPerPack }} {{ item?.unit || t('logiUnits') }}/pack
        </div>
        <!-- Seules les denrées 'ingredient' ont vocation à porter un pack (résolu depuis
             le Market Price lié) — un pack manquant/à 0 y est donc un vrai trou de
             config à signaler, pas juste une absence normale (component/product/packaging).
             Lien direct vers Market Prices (nouvel onglet) : id connu → ouvre sa fiche
             d'édition directement, sinon repli sur une recherche par nom. -->
        <a
          v-else-if="item?.kind === 'ingredient'"
          :href="packNotConfiguredHref"
          target="_blank"
          rel="noopener"
          class="lg-item-unit lg-item-unit-warn lg-item-unit-link"
          @click.stop
        >
          <v-icon size="12" class="mr-1">mdi-alert-outline</v-icon>{{ t('logiPackNotConfigured') }}
          <v-icon size="12" class="ml-1">mdi-open-in-new</v-icon>
        </a>
        <div v-if="usedInLabel" class="lg-item-usedin">
          {{ t('invUsedIn') }} {{ usedInLabel }}
        </div>
      </div>
    </div>

    <div class="lg-item-fields">
      <div class="lg-field-row">
        <div class="lg-field-label">{{ packLabel }}</div>
        <div class="lg-field-value">{{ expected.packed }}</div>
      </div>
      <div class="lg-field-row">
        <div class="lg-field-label">{{ looseLabel }}</div>
        <div class="lg-field-value">{{ formatUnits(expected.loose) }}</div>
      </div>
      <div v-if="unitsPerPack" class="lg-field-row lg-field-row-total">
        <div class="lg-field-label">{{ t('logiTotal') }}</div>
        <div class="lg-field-value">
          {{ formatTotal(expected.packed, expected.loose) }}<span v-if="item?.unit" class="lg-field-unit">{{ item.unit }}</span>
        </div>
      </div>
    </div>

    <div class="lg-item-actions">
      <v-btn class="lg-btn-add" variant="flat" size="small" @click="$emit('add', item)">
        <v-icon size="16" class="mr-1">mdi-plus</v-icon>
        {{ t('logiAddTitle') }}
      </v-btn>
      <v-btn class="lg-btn-remove" variant="flat" size="small" @click="$emit('remove', item)">
        <v-icon size="16" class="mr-1">mdi-minus</v-icon>
        {{ t('logiRemoveTitle') }}
      </v-btn>
    </div>
  </v-card>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import { formatUnits } from '@/composables/useFormatters'
import { translatePackagingType, pluralize } from '@/utils/packagingTypeTranslations'

const { t, locale } = useI18n()

const props = defineProps({
  item: { type: Object, required: true },
  /** { packed, loose } — stock attendu déjà calculé (ventes + casse de pack). */
  expected: { type: Object, required: true },
  unitsPerPack: { type: [Number, String], default: null },
  usedInLabel: { type: String, default: '' },
  /** 'bad' (rupture) | 'warn' (stock bas) | 'ok'. */
  status: { type: String, default: 'ok' },
  /** Photo résolue par le parent (repli Market Price) ; prioritaire sur item.picture. */
  picture: { type: String, default: '' },
})

defineEmits(['add', 'remove'])

const imgFailed = ref(false)

/** Photo affichée : prop `picture` (résolue parent : item.picture || MarketPrice.image) sinon item.picture brut. */
const resolvedPicture = computed(() => props.picture || props.item?.picture || null)

/**
 * Lien direct vers la fiche Market Price à corriger (nouvel onglet, ne perd pas
 * le contexte Logistic) : id connu → MarketPriceListView l'ouvre directement en
 * édition (?openId=) ; sinon repli sur une recherche par nom (?search=) — le
 * référentiel Logistic connaît le NOM de la denrée même sans market price lié.
 */
const packNotConfiguredHref = computed(() => {
  const id = props.item?.marketPriceId
  if (id) return `/menu-fb/market-prices?openId=${encodeURIComponent(id)}`
  return `/menu-fb/market-prices?search=${encodeURIComponent(props.item?.name || '')}`
})

const localizedPackagingType = computed(() => translatePackagingType(props.item?.packagingType, locale.value))

/** Libellé de la ligne « Packed » : type de conditionnement + capacité (ex. « Number of Bags of 1kg »)
 *  quand connu (MarketPrice.inventoryPackaging), sinon le mot générique « Packed ». */
const packLabel = computed(() => {
  const type = localizedPackagingType.value
  if (type && props.unitsPerPack) {
    return `${t('logiNumberOf')} ${pluralize(type)} ${t('logiPackagingOf')} ${props.unitsPerPack} ${props.item?.unit || ''}`.trim()
  }
  return t('logiPacked')
})

/** Libellé de la ligne « Loose » : même méthode que packLabel — porte l'unité réelle
 *  de la denrée (ex. « Number of loose Pc ») plutôt que le mot générique « units »
 *  figé dans logiLoose, quand cette unité est connue. */
const looseLabel = computed(() => {
  const unit = props.item?.unit
  return unit ? `${t('logiNumberOf')} ${t('logiLooseShort')} ${unit}` : t('logiLoose')
})

/** Total en unité réelle (packed*unitsPerPack + loose), ex. 45l pour 1 fût + 0,5 en vrac.
 *  L'unité est rendue séparément dans le template (`.lg-field-unit`) — ne pas la
 *  reconcaténer ici, sinon "45" et "l" redeviennent un seul bloc visuel illisible. */
function formatTotal(packed, loose) {
  const upp = Number(props.unitsPerPack)
  if (!upp) return '—'
  const total = (Number(packed) || 0) * upp + (Number(loose) || 0)
  return formatUnits(total)
}
</script>

<style scoped>
.lg-item-card {
  position: relative;
  overflow: hidden;
  border-color: var(--fb-border, #e5e7eb) !important;
  border-radius: var(--fb-radius-control, 10px);
  background: var(--fb-surface, #ffffff);
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.lg-item-card:hover { border-color: rgba(214, 48, 49, 0.26) !important; }
.lg-card-stripe { position: absolute; left: 0; top: 0; bottom: 0; width: 4px; }
.lg-stripe-bad { background: var(--fb-danger, #dc2626); }
.lg-stripe-warn { background: var(--fb-warning, #d97706); }

.lg-item-top { display: flex; gap: 10px; align-items: flex-start; }
.lg-item-pic {
  width: 42px;
  height: 42px;
  border-radius: 8px;
  object-fit: cover;
  flex-shrink: 0;
}
.lg-item-pic-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--fb-subtle, #fafafa);
  border: 1px solid var(--fb-border, #e5e7eb);
}
.lg-item-name-wrap { min-width: 0; }
.lg-item-name {
  font-weight: 700;
  font-size: 0.9rem;
  color: var(--fb-text, #212121);
}
.lg-item-unit { font-size: 0.72rem; color: var(--fb-faint, #9ca3af); margin-top: 2px; }
.lg-item-unit-warn {
  display: flex;
  align-items: center;
  color: var(--fb-warning, #d97706);
  font-weight: 600;
}
.lg-item-unit-link {
  text-decoration: none;
  cursor: pointer;
  width: fit-content;
}
.lg-item-unit-link:hover { text-decoration: underline; }
.lg-item-usedin { font-size: 0.72rem; color: var(--fb-muted, #6b7280); margin-top: 2px; font-weight: 500; }

.lg-item-fields {
  border: 1px solid var(--fb-border, #e5e7eb);
  border-radius: var(--fb-radius-control, 8px);
  padding: 8px 10px;
  background: var(--fb-subtle, #fafafa);
}
.lg-field-row {
  display: grid;
  grid-template-columns: 1fr 52px;
  align-items: baseline;
  gap: 8px;
  padding: 3px 0;
}
.lg-field-row + .lg-field-row { border-top: 1px dashed var(--fb-border, #e5e7eb); }
.lg-field-row-total + .lg-field-row,
.lg-field-row + .lg-field-row-total { border-top: 1px solid var(--fb-border, #e5e7eb); }
.lg-field-row-total .lg-field-label,
.lg-field-row-total .lg-field-value { color: var(--fb-text, #212121); }
.lg-field-label {
  font-size: 0.68rem;
  color: var(--fb-muted, #6b7280);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}
.lg-field-value {
  font-size: 1.05rem;
  font-weight: 800;
  color: var(--fb-text, #212121);
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.lg-field-unit {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--fb-muted, #6b7280);
  margin-left: 3px;
}
.lg-item-actions {
  display: flex;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px dashed var(--fb-border, #e5e7eb);
}
.lg-item-actions .v-btn {
  flex: 1;
  text-transform: none;
  font-weight: 700;
  border-radius: var(--fb-radius-control, 8px);
}
.lg-btn-add {
  background: var(--fb-success-soft, #f0fdf4) !important;
  color: var(--fb-success, #16a34a) !important;
}
.lg-btn-remove {
  background: var(--fb-danger-soft, #fef2f2) !important;
  color: var(--fb-danger, #dc2626) !important;
}
</style>
