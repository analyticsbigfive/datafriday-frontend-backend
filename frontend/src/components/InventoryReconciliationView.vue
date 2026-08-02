<template>
  <!-- Vue d'un document de réconciliation post-événement — remplace le contenu
       central de Post-event Inventory quand un document est sélectionné.
       Self-contained : tout vient de `reconciliation.lines` (aucun recalcul de
       sources). Doc : docs/modules/10_POST_EVENT_INVENTORY.md §7. -->
  <div class="irv">
    <!-- Barre : retour + chips résumé + toggle By POS / By item + recherche -->
    <div class="irv-toolbar">
      <v-btn variant="text" size="small" class="irv-back" @click="$emit('close')">
        <v-icon size="18" class="mr-1">mdi-arrow-left</v-icon>
        {{ t('invRecoBack') }}
      </v-btn>

      <div v-if="isPre" class="irv-chips">
        <span class="irv-chip">
          {{ t('invRecoChipMiss') }} :
          <strong class="irv-neg">{{ preSummary.missingUnits == null ? '—' : `${formatUnits(preSummary.missingUnits)} ${t('invRecoUnitsSuffix')}` }}</strong>
        </span>
        <span class="irv-chip">
          {{ t('invRecoColDeltaValue') }} :
          <strong class="irv-neg">{{ preSummary.missingValue == null ? '—' : formatMoney(preSummary.missingValue) }}</strong>
        </span>
      </div>
      <div v-else class="irv-chips">
        <span class="irv-chip">
          {{ t('invRecoChipDiff') }} :
          <strong :class="diffClass(summary.diffPct)">{{ formatPct(summary.diffPct) }}</strong>
        </span>
        <span class="irv-chip">
          {{ t('invRecoChipMiss') }} :
          <strong class="irv-neg">{{ formatMissChip() }}</strong>
        </span>
      </div>

      <div class="irv-toolbar-right">
        <div class="irv-search">
          <v-icon size="16" class="irv-search-icon">mdi-magnify</v-icon>
          <input
            v-model="search"
            type="text"
            class="irv-search-input"
            :placeholder="t('invRecoSearch')"
          />
        </div>
        <v-btn-toggle v-model="mode" mandatory density="compact" class="irv-toggle">
          <v-btn value="pos" size="small">{{ t('invRecoByPos') }}</v-btn>
          <v-btn value="item" size="small">{{ t('invRecoByItem') }}</v-btn>
        </v-btn-toggle>
      </div>
    </div>

    <div class="irv-meta">
      {{ t('invRecoGeneratedOn') }} {{ formatDateTime(reconciliation.createdAt) }}
      · {{ lines.length }} {{ t('invRecoLinesCount') }}
    </div>

    <!-- Contexte de fabrication (BUG-238/241) : ce qui manquait au moment du
         calcul. Sans ça, un écart fabriqué par une source absente se lit comme
         un manquant réel. Documents antérieurs : meta absent → aucun bandeau. -->
    <div v-if="notices.length" class="irv-notices">
      <div v-for="(n, i) in notices" :key="i" class="irv-notice" :class="`irv-notice--${n.level}`">
        <v-icon size="15" class="irv-notice-icon">
          {{ n.level === 'warn' ? 'mdi-alert-outline' : 'mdi-information-outline' }}
        </v-icon>
        <span>{{ n.text }}</span>
      </div>
    </div>

    <!-- Table — variante PRE-event (attendu vs compté) -->
    <div v-if="isPre" class="irv-tablewrap">
      <table class="irv-table">
        <thead>
          <tr>
            <th class="irv-col-name">{{ mode === 'item' ? t('invRecoColItem') : t('invRecoColPos') }}</th>
            <th>{{ t('invRecoColExpected') }}</th>
            <th>{{ t('invRecoColCounted') }}</th>
            <th>{{ t('invRecoColDelta') }}</th>
            <th>{{ t('invRecoColDeltaValue') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!groups.length" class="irv-empty-row">
            <td colspan="5">{{ t('invRecoNoMatch') }}</td>
          </tr>
          <template v-for="g in groups" :key="g.key">
            <tr class="irv-row" :class="{ 'irv-row-open': isExpanded(g.key) }" @click="toggleExpand(g.key)">
              <td class="irv-col-name">
                <v-icon size="14" class="irv-caret">
                  {{ isExpanded(g.key) ? 'mdi-chevron-down' : 'mdi-chevron-right' }}
                </v-icon>
                {{ g.label || '—' }}
              </td>
              <td>{{ g.expectedUnits == null ? '—' : formatUnits(g.expectedUnits) }}</td>
              <td>{{ formatUnits(g.countedUnits) }}</td>
              <td><span :class="deltaClass(g.deltaUnits)">{{ formatDelta(g.deltaUnits) }}</span></td>
              <td><span :class="deltaClass(g.deltaValue)">{{ g.deltaValue == null ? '—' : formatMoney(g.deltaValue) }}</span></td>
            </tr>
            <tr v-for="sub in (isExpanded(g.key) ? g.children : [])" :key="`${g.key}::${sub.key}`" class="irv-subrow">
              <td class="irv-col-name irv-subname">{{ sub.label || '—' }}</td>
              <td>{{ sub.expectedUnits == null ? '—' : formatUnits(sub.expectedUnits) }}</td>
              <td>{{ formatUnits(sub.countedUnits) }}</td>
              <td><span :class="deltaClass(sub.deltaUnits)">{{ formatDelta(sub.deltaUnits) }}</span></td>
              <td><span :class="deltaClass(sub.deltaValue)">{{ sub.deltaValue == null ? '—' : formatMoney(sub.deltaValue) }}</span></td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>

    <!-- Table — variante POST-event (ventes / prédiction / manquant) -->
    <div v-else class="irv-tablewrap">
      <table class="irv-table">
        <thead>
          <tr>
            <th class="irv-col-name">{{ mode === 'item' ? t('invRecoColItem') : t('invRecoColPos') }}</th>
            <th>{{ t('invRecoColSold') }}</th>
            <th>{{ t('invRecoColPred') }}</th>
            <th>{{ t('invRecoColDiff') }}</th>
            <th>{{ t('invRecoColLeft') }}</th>
            <th>{{ t('invRecoColInv') }}</th>
            <th>{{ t('invRecoColMiss') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!groups.length" class="irv-empty-row">
            <td colspan="7">{{ t('invRecoNoMatch') }}</td>
          </tr>
          <template v-for="g in groups" :key="g.key">
            <tr class="irv-row" :class="{ 'irv-row-open': isExpanded(g.key) }" @click="toggleExpand(g.key)">
              <td class="irv-col-name">
                <v-icon size="14" class="irv-caret">
                  {{ isExpanded(g.key) ? 'mdi-chevron-down' : 'mdi-chevron-right' }}
                </v-icon>
                {{ g.label || '—' }}
              </td>
              <td>{{ formatUnits(g.soldUnits) }}</td>
              <td>{{ g.predictedUnits == null ? '—' : formatUnits(g.predictedUnits) }}</td>
              <td :class="diffClass(rowDiffPct(g))">{{ formatPct(rowDiffPct(g)) }}</td>
              <td>{{ g.leftFromSales == null ? '—' : formatUnits(g.leftFromSales) }}</td>
              <td>{{ formatUnits(g.countedUnits) }}</td>
              <td>
                <span :class="missClass(g.missingUnits)">{{ g.missingUnits == null ? '—' : formatUnits(g.missingUnits) }}</span>
              </td>
            </tr>
            <tr v-for="sub in (isExpanded(g.key) ? g.children : [])" :key="`${g.key}::${sub.key}`" class="irv-subrow">
              <td class="irv-col-name irv-subname">{{ sub.label || '—' }}</td>
              <td>{{ formatUnits(sub.soldUnits) }}</td>
              <td>{{ sub.predictedUnits == null ? '—' : formatUnits(sub.predictedUnits) }}</td>
              <td :class="diffClass(rowDiffPct(sub))">{{ formatPct(rowDiffPct(sub)) }}</td>
              <td>{{ sub.leftFromSales == null ? '—' : formatUnits(sub.leftFromSales) }}</td>
              <td>{{ formatUnits(sub.countedUnits) }}</td>
              <td>
                <span :class="missClass(sub.missingUnits)">{{ sub.missingUnits == null ? '—' : formatUnits(sub.missingUnits) }}</span>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import { formatCurrencyDetailed } from '@/composables/useFormatters'
import { useNumberFormat } from '@/composables/useNumberFormat'
import { computeReconciliationSummary } from '@/utils/postEventReconciliation'
import { normalizeStr } from '@/utils/predictiveAnalytics'

const props = defineProps({
  // Ligne StockReconciliation complète : { id, eventId, eventName, kind, createdAt, lines: [...] }
  reconciliation: { type: Object, required: true },
  // Variante PRE-event : les lignes persistent packed/loose BRUTS (le backend n'a
  // pas le conditionnement) — l'affichage convertit en unités avec le référentiel
  // de l'écran. itemId → inventoryQuantityPackaged (repli ×1).
  unitsPerItemId: { type: Object, default: null },
  // itemId → coût unitaire (menuItemCostMap du store analyse) → Écart €.
  costByItemId: { type: Object, default: null },
})
defineEmits(['close'])

const { t } = useI18n()
// Formats dates/nombres suivant la langue de l'app (BUG-240) — plus de 'fr-FR'
// en dur : un document lu en anglais affichait des séparateurs français.
const { intlLocale } = useNumberFormat()
const search = ref('')
const mode = ref('item') // parité capture : ouverture sur « By item »
const expanded = ref(new Set())

/** Variante du document : 'pre-event' (attendu vs compté) | post-event (défaut). */
const isPre = computed(() => props.reconciliation?.kind === 'pre-event')

const rawLines = computed(() => (Array.isArray(props.reconciliation?.lines) ? props.reconciliation.lines : []))

/**
 * Bandeaux de contexte (`StockReconciliation.meta`, BUG-238/241) : sources
 * manquantes ou dégradées au moment du calcul. Un document est une photo figée —
 * si on ne dit pas ce qui manquait, ses écarts se lisent comme des manquants
 * réels. `meta` absent (documents antérieurs) → aucun bandeau, pas de faux
 * message rassurant non plus.
 */
const notices = computed(() => {
  const meta = props.reconciliation?.meta
  if (!meta || typeof meta !== 'object') return []
  const out = []
  const source = meta.baseline?.source
  if (source === 'previous-post-event') {
    out.push({ level: 'warn', text: t('invRecoMetaBaselinePrev') })
  } else if (source === 'none' && !isPre.value) {
    out.push({ level: 'info', text: t('invRecoMetaBaselineNone') })
  }
  const su = meta.salesUnjoined
  if (su && (Number(su.units) > 0 || su.shopNames?.length || su.itemNames?.length)) {
    const names = [...(su.shopNames || []), ...(su.itemNames || [])].slice(0, 6).join(', ')
    out.push({
      level: 'warn',
      text: `${formatUnits(Number(su.units) || 0)} ${t('invRecoMetaSalesUnjoined')}${names ? ` (${names})` : ''}`,
    })
  }
  if (Number(meta.orphanLinesExcluded) > 0) {
    out.push({ level: 'info', text: `${meta.orphanLinesExcluded} ${t('invRecoMetaOrphans')}` })
  }
  // Q35 : grain de la source « Vendu ». 'timeline' = ventes brutes au grain
  // article (backend antérieur au moment de la génération) — les lignes au grain
  // ingrédient ont alors Vendu=0, leurs manquants sont à lire avec ce biais.
  // 'consumption' (régime nominal) et absent (document pré-Q35) : pas de bandeau.
  if (meta.salesSource === 'timeline' && !isPre.value) {
    out.push({ level: 'info', text: t('invRecoMetaSalesTimeline') })
  }
  const cp = meta.countedProgress
  if (Array.isArray(cp) && cp.length === 2 && cp[1] > 0 && cp[0] < cp[1]) {
    out.push({ level: 'warn', text: `${t('invRecoMetaIncomplete')} ${cp[0]}/${cp[1]}` })
  }
  return out
})

// Lignes pre-event NORMALISÉES en unités : expectedUnits/countedUnits/deltaUnits
// (+ deltaValue au coût). Convention de signe : delta = compté − attendu
// (négatif = manquant). null conservé quand la baseline manquait.
const lines = computed(() => {
  if (!isPre.value) return rawLines.value
  const round2 = (n) => Math.round(n * 100) / 100
  // BUG-239 : depuis 2026-07-24 la ligne porte `unitsPerPack` (celui du calcul).
  // On l'utilise en priorité — le référentiel courant de l'écran peut avoir
  // changé depuis, et une photo figée doit rester lisible telle qu'elle a été
  // calculée. Repli : conditionnement affiché, puis ×1.
  const qOf = (l) =>
    Number(l?.unitsPerPack) > 0
      ? Number(l.unitsPerPack)
      : Number(props.unitsPerItemId?.[l?.itemKey]) || 1
  const costOf = (itemId) => {
    const c = Number(props.costByItemId?.[itemId])
    return Number.isFinite(c) ? c : null
  }
  return rawLines.value.map((l) => {
    const q = qOf(l)
    // Totaux servis par le backend quand ils existent (calcul et affichage dans
    // la même unité) ; sinon reconstruits depuis packed/loose.
    const countedUnits = Number.isFinite(Number(l.countedUnits))
      ? round2(Number(l.countedUnits))
      : round2((Number(l.countedPacked) || 0) * q + (Number(l.countedLoose) || 0))
    const expectedUnits = Number.isFinite(Number(l.expectedUnits))
      ? round2(Number(l.expectedUnits))
      : l.expectedPacked == null && l.expectedLoose == null
        ? null
        : round2((Number(l.expectedPacked) || 0) * q + (Number(l.expectedLoose) || 0))
    const deltaUnits = expectedUnits == null ? null : round2(countedUnits - expectedUnits)
    const cost = costOf(l.itemKey)
    return {
      ...l,
      expectedUnits,
      countedUnits,
      deltaUnits,
      deltaValue: deltaUnits == null || cost == null ? null : round2(deltaUnits * cost),
    }
  })
})

const filteredLines = computed(() => {
  const q = normalizeStr(search.value)
  if (!q) return lines.value
  return lines.value.filter(
    (l) => normalizeStr(l.itemName).includes(q) || normalizeStr(l.elementName).includes(q),
  )
})

// Chips résumé : recalculées depuis les lignes FILTRÉES (le résumé suit la recherche).
const summary = computed(() => computeReconciliationSummary(filteredLines.value))

// Chips PRE-event : manquant = attendu − compté (>0 uniquement — un surplus ne
// « rembourse » pas, même règle que post-event) + valorisation au coût.
const preSummary = computed(() => {
  let missingUnits = 0
  let hasMissing = false
  let missingValue = 0
  let hasValue = false
  for (const l of filteredLines.value) {
    if (l.deltaUnits == null) continue
    hasMissing = true
    const missing = -l.deltaUnits // delta = compté − attendu
    if (missing > 0) {
      missingUnits += missing
      if (l.deltaValue != null) {
        hasValue = true
        missingValue += -l.deltaValue
      }
    }
  }
  const round2 = (n) => Math.round(n * 100) / 100
  return {
    missingUnits: hasMissing ? round2(missingUnits) : null,
    missingValue: hasValue ? round2(missingValue) : null,
  }
})

// Agrégat null-aware : la somme reste null tant qu'AUCUNE ligne ne porte la
// valeur (repli « — »), mais 1 ligne renseignée suffit à démarrer la somme.
function foldNullable(acc, v) {
  if (v == null) return acc
  return (acc ?? 0) + v
}

/** Groupes (mode item → 1 groupe par article, enfants = PdV ; mode pos → inverse). */
const groups = computed(() => {
  const byGroup = new Map()
  const groupOf = (l) => (mode.value === 'item' ? l.itemKey : l.elementId)
  const labelOf = (l) => (mode.value === 'item' ? l.itemName : l.elementName)
  const childKeyOf = (l) => (mode.value === 'item' ? l.elementId : l.itemKey)
  const childLabelOf = (l) => (mode.value === 'item' ? l.elementName : l.itemName)
  const pre = isPre.value

  for (const l of filteredLines.value) {
    const key = groupOf(l)
    if (!key) continue
    let g = byGroup.get(key)
    if (!g) {
      g = pre
        ? {
            key,
            label: labelOf(l),
            expectedUnits: null,
            countedUnits: 0,
            deltaUnits: null,
            deltaValue: null,
            children: [],
          }
        : {
            key,
            label: labelOf(l),
            soldUnits: 0,
            predictedUnits: null,
            leftFromSales: null,
            countedUnits: 0,
            missingUnits: null,
            children: [],
          }
      byGroup.set(key, g)
    }
    g.label = g.label || labelOf(l)
    g.countedUnits += l.countedUnits || 0
    if (pre) {
      g.expectedUnits = foldNullable(g.expectedUnits, l.expectedUnits)
      g.deltaUnits = foldNullable(g.deltaUnits, l.deltaUnits)
      g.deltaValue = foldNullable(g.deltaValue, l.deltaValue)
      g.children.push({
        key: childKeyOf(l) || '—',
        label: childLabelOf(l),
        expectedUnits: l.expectedUnits,
        countedUnits: l.countedUnits || 0,
        deltaUnits: l.deltaUnits,
        deltaValue: l.deltaValue,
      })
    } else {
      g.soldUnits += l.soldUnits || 0
      g.predictedUnits = foldNullable(g.predictedUnits, l.predictedUnits)
      g.leftFromSales = foldNullable(g.leftFromSales, l.leftFromSales)
      g.missingUnits = foldNullable(g.missingUnits, l.missingUnits)
      g.children.push({
        key: childKeyOf(l) || '—',
        label: childLabelOf(l),
        soldUnits: l.soldUnits || 0,
        predictedUnits: l.predictedUnits,
        leftFromSales: l.leftFromSales,
        countedUnits: l.countedUnits || 0,
        missingUnits: l.missingUnits,
      })
    }
  }

  const out = [...byGroup.values()]
  for (const g of out) g.children.sort((a, b) => String(a.label).localeCompare(String(b.label)))
  // Écarts d'abord (raison d'être du document), puis alpha. Pre : manquant =
  // −delta → tri delta croissant (plus négatif en tête).
  out.sort((a, b) => {
    if (pre) {
      return (a.deltaUnits ?? Infinity) - (b.deltaUnits ?? Infinity)
        || String(a.label).localeCompare(String(b.label))
    }
    return (b.missingUnits ?? -Infinity) - (a.missingUnits ?? -Infinity)
      || String(a.label).localeCompare(String(b.label))
  })
  return out
})

function isExpanded(key) { return expanded.value.has(key) }
function toggleExpand(key) {
  const next = new Set(expanded.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  expanded.value = next
}

function rowDiffPct(row) {
  if (row.predictedUnits == null || row.predictedUnits <= 0) return null
  return ((row.soldUnits - row.predictedUnits) / row.predictedUnits) * 100
}
function diffClass(pct) {
  if (pct == null) return 'irv-muted'
  return pct < 0 ? 'irv-neg' : 'irv-pos'
}
function missClass(v) {
  if (v == null) return 'irv-muted'
  return v > 0 ? 'irv-miss' : ''
}
/** Pre-event : delta = compté − attendu. Négatif = manquant (rouge), positif = surplus (ambre). */
function deltaClass(v) {
  if (v == null) return 'irv-muted'
  if (v < 0) return 'irv-miss'
  return v > 0 ? 'irv-pos' : ''
}
function formatDelta(v) {
  if (v == null) return '—'
  const sign = v > 0 ? '+' : ''
  return `${sign}${formatUnits(v)}`
}
function formatUnits(v) {
  if (v == null || Number.isNaN(Number(v))) return '—'
  return Number(v).toLocaleString(intlLocale.value, { maximumFractionDigits: 2 })
}
function formatPct(pct) {
  if (pct == null) return '—'
  const rounded = Math.round(pct * 10) / 10
  return `${rounded > 0 ? '+' : ''}${rounded.toLocaleString(intlLocale.value)} %`
}
function formatMissChip() {
  // Valeur (€) si valorisable, sinon unités — jamais un 0 € fabriqué.
  if (summary.value.totalMissingValue != null) {
    return formatCurrencyDetailed(summary.value.totalMissingValue, 'EUR', intlLocale.value)
  }
  if (summary.value.totalMissingUnits != null) {
    return `${formatUnits(summary.value.totalMissingUnits)} ${t('invRecoUnitsSuffix')}`
  }
  return '—'
}
function formatMoney(v) {
  return formatCurrencyDetailed(v, 'EUR', intlLocale.value)
}
function formatDateTime(v) {
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(intlLocale.value, { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' ' + d.toLocaleTimeString(intlLocale.value, { hour: '2-digit', minute: '2-digit' })
}
</script>

<style scoped>
.irv { display: flex; flex-direction: column; gap: 10px; }
.irv-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 12px;
}
.irv-back { text-transform: none; letter-spacing: 0; font-weight: 600; }
.irv-chips { display: flex; gap: 8px; flex-wrap: wrap; }
.irv-chip {
  font-size: 12.5px;
  color: var(--fb-text, #424242);
  background: var(--fb-surface, #FFFFFF);
  border: 1px solid var(--fb-border, #EEEEEE);
  border-radius: 999px;
  padding: 4px 12px;
  font-variant-numeric: tabular-nums;
}
.irv-toolbar-right { margin-left: auto; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.irv-search {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--fb-surface, #FFFFFF);
  border: 1px solid var(--fb-border, #EEEEEE);
  border-radius: 999px;
  padding: 5px 12px;
}
.irv-search-icon { color: var(--fb-faint, #9CA3AF); }
.irv-search-input {
  border: 0;
  outline: none;
  font-size: 13px;
  min-width: 190px;
  background: transparent;
  color: var(--fb-text, #212121);
}
.irv-toggle { border-radius: 999px; }
.irv-meta { font-size: 12px; color: var(--fb-muted, #757575); }

/* Bandeaux de contexte (sources manquantes/dégradées). Couleurs sémantiques
   conservées en clair ET en sombre : le fond passe par --fb-*, l'accent reste
   lisible sur les deux fonds. */
.irv-notices { display: flex; flex-direction: column; gap: 6px; }
.irv-notice {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  font-size: 12.5px;
  line-height: 1.35;
  padding: 7px 11px;
  border-radius: 8px;
  border: 1px solid var(--fb-border, #EEEEEE);
  background: var(--fb-subtle, #FAFAFA);
  color: var(--fb-text, #424242);
}
.irv-notice-icon { flex: 0 0 auto; margin-top: 1px; }
.irv-notice--warn { border-color: var(--fb-warning, #E9A23B); background: var(--fb-warning-soft, #FFFBEB); }
.irv-notice--warn .irv-notice-icon { color: var(--fb-warning, #B45309); }
.irv-notice--info .irv-notice-icon { color: var(--fb-muted, #757575); }

.irv-tablewrap {
  background: var(--fb-surface, #FFFFFF);
  border: 1px solid var(--fb-border, #EEEEEE);
  border-radius: 12px;
  overflow-x: auto;
}
.irv-table { width: 100%; border-collapse: collapse; min-width: 720px; }
.irv-table th, .irv-table td {
  padding: 9px 12px;
  text-align: right;
  font-size: 13px;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.irv-table th {
  font-size: 11px;
  letter-spacing: .05em;
  text-transform: uppercase;
  color: var(--fb-muted, #757575);
  font-weight: 600;
  border-bottom: 1.5px solid var(--fb-border, #EEEEEE);
}
.irv-table td { border-bottom: 1px solid var(--fb-border, #F5F5F5); color: var(--fb-text, #212121); }
.irv-col-name { text-align: left !important; font-weight: 500; }
.irv-row { cursor: pointer; }
.irv-row:hover td { background: var(--fb-subtle, #FAFAFA); }
.irv-row-open td { background: var(--fb-subtle, #FAFAFA); }
.irv-caret { color: var(--fb-faint, #9E9E9E); margin-right: 2px; }
.irv-subrow td { background: var(--fb-subtle, #FCFCFC); font-size: 12.5px; }
.irv-subname { padding-left: 34px !important; color: var(--fb-muted, #616161); font-weight: 400; }
.irv-empty-row td { text-align: center; color: var(--fb-faint, #9E9E9E); padding: 22px; }
/* Manquant / surplus : sémantique, pas décoratif — teintes qui tiennent sur les
   deux thèmes (le rouge clair d'origine disparaissait sur fond sombre). */
.irv-neg { color: var(--fb-danger, #C62828); font-weight: 600; }
.irv-pos { color: var(--fb-warning, #B45309); font-weight: 600; }
.irv-muted { color: var(--fb-faint, #9E9E9E); }
.irv-miss {
  color: var(--fb-danger, #C62828);
  font-weight: 700;
  background: var(--fb-danger-soft, #FDECEA);
  border-radius: 4px;
  padding: 1px 7px;
}
</style>
