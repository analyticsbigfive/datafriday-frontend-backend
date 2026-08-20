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
          {{ unitsPerPack }} {{ item?.unit || t('logiUnits') }}/{{ localizedPackagingType || t('logiPacksShort') }}
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
      <!-- Colonne SÉPARÉE : besoin prédit Event Predict, brut. Ne se substitue pas
           au stock attendu au-dessus — l'un dit ce qu'il y a, l'autre ce qu'il
           faudrait pour le match. Le netting « à ramener » reste au Réarmement. -->
      <div v-if="predictedNeed != null" class="lg-field-row lg-field-row-predicted">
        <div class="lg-field-label">{{ t('logiColPredictedNeed') }}</div>
        <div class="lg-field-value">
          <template v-if="predictedNeedPacksDisplay != null">{{ predictedNeedPacksDisplay }}<span class="lg-field-unit">{{ localizedPackagingType ? pluralize(localizedPackagingType) : t('logiPacksShort') }}</span></template>
          <template v-else>{{ formatUnits(predictedNeed) }}<span v-if="item?.unit" class="lg-field-unit">{{ item.unit }}</span></template>
        </div>
      </div>
    </div>

    <!-- BUG-259-02 : transferts émis vers cet élément pour cette denrée, en attente
         de confirmation. Cliquer ouvre le drawer de confirmation (quantités éditables). -->
    <div v-if="pendingTransfers.length" class="lg-pending-transfers">
      <div class="lg-pending-title">{{ t('logiPendingTransfersTitle') }}</div>
      <button
        v-for="pt in pendingTransfers"
        :key="pt.movementId"
        type="button"
        class="lg-pending-row"
        @click="$emit('open-transfer', pt)"
      >
        <span class="lg-pending-info">
          {{ t('logiPendingTransferFrom') }} : {{ pt.sourceElementName }}
          <strong class="ml-1">{{ pendingTransferQtyLabel(pt) }}</strong>
        </span>
        <v-icon size="18" color="success">mdi-arrow-right-circle</v-icon>
      </button>
    </div>

    <!-- BUG-259-02 (retour Ulrich, 2026-08-13) : transferts émis PAR cet élément,
         encore en attente de confirmation côté destinataire, trace visible côté
         source, informative uniquement (seul le destinataire confirme). -->
    <div v-if="outgoingPendingTransfers.length" class="lg-outgoing-transfers">
      <div class="lg-outgoing-title">{{ t('logiOutgoingTransfersTitle') }}</div>
      <div v-for="ot in outgoingPendingTransfers" :key="ot.movementId" class="lg-outgoing-row">
        <v-icon size="16" color="warning">mdi-clock-outline</v-icon>
        <span class="lg-outgoing-info">
          {{ t('logiOutgoingTransferTo') }} : {{ ot.destinationElementName }}
          <strong class="ml-1">{{ pendingTransferQtyLabel(ot) }}</strong>
        </span>
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
import { compactQtyLabel } from '@/composables/useLogisticUnitLabels'

const { t, locale } = useI18n()

const props = defineProps({
  item: { type: Object, required: true },
  /** { packed, loose } — stock attendu déjà calculé (ventes + casse de pack). */
  expected: { type: Object, required: true },
  unitsPerPack: { type: [Number, String], default: null },
  /** Besoin prédit Event Predict en unités, ou null = rien de prédit (jamais 0). */
  predictedNeed: { type: Number, default: null },
  /** Packs déjà décidés au réarmement (packaging.packedCount natif de RestockPlan),
   *  null si le besoin vient du repli Event Predict ou si le pack n'était pas connu
   *  sur la ligne — retour utilisateur 2026-08-19 : ne pas ré-éclater par division
   *  quand ce nombre existe déjà, la décision réelle peut arrondir autrement. */
  predictedNeedPacks: { type: Number, default: null },
  usedInLabel: { type: String, default: '' },
  /** 'bad' (rupture) | 'warn' (stock bas) | 'ok'. */
  status: { type: String, default: 'ok' },
  /** Photo résolue par le parent (repli Market Price) ; prioritaire sur item.picture. */
  picture: { type: String, default: '' },
  /** BUG-259-02 : transferts entrants en attente pour cette denrée sur cet élément —
   *  [{movementId, sourceElementName, declaredPacked, declaredLoose, createdAt}]. */
  pendingTransfers: { type: Array, default: () => [] },
  /** BUG-259-02 : transferts sortants émis par cet élément, encore en attente de
   *  confirmation côté destinataire : [{movementId, destinationElementName,
   *  declaredPacked, declaredLoose, createdAt}]. */
  outgoingPendingTransfers: { type: Array, default: () => [] },
})

defineEmits(['add', 'remove', 'open-transfer'])

const imgFailed = ref(false)

/** Photo affichée : prop `picture` (résolue parent : item.picture || MarketPrice.image) sinon item.picture brut. */
const resolvedPicture = computed(() => props.picture || props.item?.picture || null)

/** Besoin prédit en nombre de packs à afficher (retour utilisateur 2026-08-19 : même
 *  forme que EMBALLÉ, pas les unités brutes). Priorité au pack NATIF du réarmement
 *  (`predictedNeedPacks` prop, `packaging.packedCount`) — sinon repli sur une
 *  estimation par division (arrondi au pack supérieur, un achat n'est pas un état,
 *  miroir storageBuyInfo côté Réarmement), seulement quand le prop natif est absent
 *  (repli Event Predict, ou pack inconnu sur la ligne réarmement). */
const predictedNeedPacksDisplay = computed(() => {
  if (props.predictedNeedPacks != null) return props.predictedNeedPacks
  const upp = Number(props.unitsPerPack)
  if (!upp || props.predictedNeed == null) return null
  return Math.ceil(props.predictedNeed / upp)
})

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

/** BUG-259-02 : quantité + unité d'un transfert en attente (ex. "3 Sacs (0.5 Kg)"),
 *  même denrée que la carte donc mêmes item/unitsPerPack déjà en props. */
function pendingTransferQtyLabel(pt) {
  return compactQtyLabel(pt.declaredPacked, pt.declaredLoose, props.item, props.unitsPerPack, t, locale.value, formatUnits)
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
  grid-template-columns: 1fr auto;
  align-items: baseline;
  gap: 8px;
  padding: 3px 0;
}
.lg-field-row + .lg-field-row { border-top: 1px dashed var(--fb-border, #e5e7eb); }
.lg-field-row-total + .lg-field-row,
.lg-field-row + .lg-field-row-total { border-top: 1px solid var(--fb-border, #e5e7eb); }
.lg-field-row-total .lg-field-label,
.lg-field-row-total .lg-field-value { color: var(--fb-text, #212121); }
/* Besoin prédit : visuellement détaché du stock réel au-dessus — c'est une
   prévision, pas un niveau constaté. */
.lg-field-row-predicted { border-top: 1px dashed var(--fb-border, #e5e7eb); }
.lg-field-row-predicted .lg-field-label,
.lg-field-row-predicted .lg-field-value { color: #B45309; }
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
  white-space: nowrap;
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

.lg-pending-transfers {
  border-top: 1px dashed var(--fb-border, #e5e7eb);
  padding-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.lg-pending-title {
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  color: var(--fb-faint, #9ca3af);
}
.lg-pending-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border: none;
  background: var(--fb-subtle, #fafafa);
  border-radius: var(--fb-radius-control, 8px);
  padding: 6px 10px;
  cursor: pointer;
  text-align: left;
  font-size: 0.78rem;
  color: var(--fb-text, #212121);
}
.lg-pending-row:hover { background: var(--fb-success-soft, #f0fdf4); }
.lg-pending-info { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.lg-outgoing-transfers {
  border-top: 1px dashed var(--fb-border, #e5e7eb);
  padding-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.lg-outgoing-title {
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  color: var(--fb-faint, #9ca3af);
}
.lg-outgoing-row {
  display: flex;
  align-items: center;
  gap: 6px;
  border-radius: var(--fb-radius-control, 8px);
  padding: 6px 10px;
  background: var(--fb-warning-soft, #fffbeb);
  font-size: 0.78rem;
  color: var(--fb-text, #212121);
}
.lg-outgoing-info { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
