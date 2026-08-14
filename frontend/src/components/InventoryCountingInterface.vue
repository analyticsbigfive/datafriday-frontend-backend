<template>
  <div class="si-counting" :class="{ 'si-counting-mobile': mobile }">
    <div class="si-counting-head">
      <v-btn icon variant="outlined" size="small" class="si-back" @click="$emit('close')">
        <v-icon size="18">mdi-arrow-left</v-icon>
      </v-btn>

      <!-- Navigation boutique précédente -->
      <v-btn
        icon
        variant="text"
        size="small"
        :disabled="!hasPrev"
        aria-label="Boutique précédente"
        @click="goPrev"
      >
        <v-icon size="20">mdi-chevron-left</v-icon>
      </v-btn>

      <div class="si-counting-title">
        <!-- Sélecteur de boutique : titre cliquable + liste -->
        <v-menu offset="6" :close-on-content-click="true">
          <template #activator="{ props: menuProps }">
            <button v-bind="menuProps" type="button" class="si-shop-switch">
              <h2>{{ t('invCountTitle') }} : {{ shop?.element?.name }}</h2>
              <v-icon v-if="shops.length > 1" size="18">mdi-chevron-down</v-icon>
            </button>
          </template>
          <v-list density="compact" min-width="300" max-height="440">
            <v-list-subheader>{{ t('invChangeShop') }}</v-list-subheader>
            <v-list-item
              v-for="s in shops"
              :key="s.element.id"
              :active="s.element.id === shop.element.id"
              @click="$emit('change-shop', s)"
            >
              <v-list-item-title>{{ s.element.name }}</v-list-item-title>
              <template #append>
                <span
                  class="si-shop-switch-count"
                  :class="{ 'si-shop-switch-done': countedFor(s) === (s.consolidatedInventory || []).length && (s.consolidatedInventory || []).length > 0 }"
                >
                  {{ uncountedFor(s) }} non compté{{ uncountedFor(s) > 1 ? 's' : '' }}
                </span>
              </template>
            </v-list-item>
          </v-list>
        </v-menu>
        <div class="si-counting-meta">
          <span>{{ currentUncounted }} item{{ currentUncounted > 1 ? 's' : '' }} non compté{{ currentUncounted > 1 ? 's' : '' }}</span>
          <span v-if="shops.length > 1">{{ shopIndex + 1 }}/{{ shops.length }} boutiques</span>
        </div>
        <v-progress-linear :model-value="progress" color="success" height="7" rounded />
      </div>

      <!-- Navigation boutique suivante -->
      <v-btn
        icon
        variant="text"
        size="small"
        :disabled="!hasNext"
        aria-label="Boutique suivante"
        @click="goNext"
      >
        <v-icon size="20">mdi-chevron-right</v-icon>
      </v-btn>

      <!-- Unités ATTENDUES de la section (pré-event, RBAC
           front.fb.preInventoryExpected) : somme des cibles du plan de
           réarmement sauvegardé pour l'événement, un segment par unité
           (« Attendu : 1 250 Pc · 12 Kg »). Prop absente/vide → rien. -->
      <v-chip
        v-if="expectedSectionUnits && expectedSectionUnits.length"
        color="primary"
        variant="tonal"
        size="small"
        class="si-counting-expected"
      >
        {{ t('preInvExpectedBadge') }} :
        {{ expectedSectionUnits.map((s) => `${formatUnits(s.total)} ${s.unit}`).join(' · ') }}
      </v-chip>

      <v-chip color="success" variant="tonal" size="small" class="si-counting-progress">
        {{ counted }} / {{ total }}
      </v-chip>
    </div>

    <div v-if="shops.length > 1" class="si-shop-jumpbar">
      <v-btn
        variant="outlined"
        size="small"
        :disabled="!hasPrev"
        class="si-shop-jump"
        @click="goPrev"
      >
        <v-icon size="15" class="mr-1">mdi-arrow-left</v-icon>
        {{ prevShop ? `Retour ${prevShop.element.name}` : 'Boutique précédente' }}
      </v-btn>
      <v-btn
        color="primary"
        variant="tonal"
        size="small"
        :disabled="!hasNext"
        class="si-shop-jump si-shop-jump-next"
        @click="goNext"
      >
        <v-icon size="15" class="mr-1">mdi-arrow-right</v-icon>
        {{ nextShop ? `Passer à ${nextShop.element.name} · ${uncountedFor(nextShop)} non comptés` : 'Dernière boutique' }}
      </v-btn>
    </div>

    <!-- État vide : aucun article rattaché (cf. mapping menu / wizard étape 3) -->
    <div v-if="!(shop?.consolidatedInventory || []).length" class="si-count-empty">
      <v-icon size="40" color="#cbd5e1">mdi-package-variant-closed</v-icon>
      <div class="si-count-empty-title">{{ t('invCountEmptyTitle') }}</div>
      <div class="si-count-empty-hint">{{ t('invCountEmptyHint') }}</div>
    </div>

    <div v-else class="si-counting-grid">
      <div
        v-for="item in shop.consolidatedInventory"
        :key="item.id"
        class="si-count-item"
        :class="{
          'si-count-item-done': isItemCounted(shop.element.id, item.id),
          'si-count-item-collapsed': mobile && !isExpanded(item.id),
        }"
      >
        <div
          class="si-count-row"
          :class="{ 'si-count-row-toggle': mobile }"
          :role="mobile ? 'button' : undefined"
          :tabindex="mobile ? 0 : undefined"
          @click="mobile && toggleExpand(item.id)"
          @keydown.enter.space.prevent="mobile && toggleExpand(item.id)"
        >
          <div class="si-count-name-wrap">
            <img
              v-if="item.picture && !failedImages[item.id]"
              :src="item.picture"
              :alt="item.name"
              class="si-count-img"
              @error="failedImages[item.id] = true"
            />
            <div v-else class="si-count-img si-count-img-placeholder">
              <v-icon size="20" color="#9E9E9E">mdi-package-variant-closed</v-icon>
            </div>
            <div class="si-count-name-text">
              <div class="si-count-name">{{ item.name }}</div>
              <div v-if="itemUsedIn(item)" class="si-count-usedin">
                {{ t('invUsedIn') }} {{ itemUsedIn(item) }}
              </div>
            </div>
          </div>
          <span v-if="isItemCounted(shop.element.id, item.id)" class="si-count-badge">
            <v-icon size="13" class="mr-1">mdi-check-circle</v-icon>
            {{ t('invCountCounted') }}
          </span>
          <v-icon v-if="mobile" size="20" class="si-count-chevron">
            {{ isExpanded(item.id) ? 'mdi-chevron-up' : 'mdi-chevron-down' }}
          </v-icon>
        </div>

        <div v-show="!mobile || isExpanded(item.id)" class="si-count-inputs">
          <div class="si-count-field">
            <label class="si-count-label">{{ packedUnitsLabel(item) }}</label>
            <div class="si-count-stepper">
              <button type="button" class="si-step" aria-label="-" @click.stop="stepValue(shop.element.id, item.id, 'packedUnits', -1)">
                <v-icon size="16">mdi-minus</v-icon>
              </button>
              <input
                class="form-control si-count-input"
                type="text"
                inputmode="numeric"
                :value="fieldDisplay(shop.element.id, item.id, 'packedUnits')"
                @input="onFieldInput(shop.element.id, item.id, 'packedUnits', $event.target.value)"
                @blur="onFieldBlur(shop.element.id, item.id, 'packedUnits')"
              />
              <button type="button" class="si-step" aria-label="+" @click.stop="stepValue(shop.element.id, item.id, 'packedUnits', 1)">
                <v-icon size="16">mdi-plus</v-icon>
              </button>
            </div>
            <!-- Pre-event Inventory : quantité ATTENDUE (post-event précédent +
                 mouvements Logistic) — rendue UNIQUEMENT si le parent fournit
                 expectedFor (permission front.fb.preInventoryExpected). -->
            <div
              v-if="expectedFor && expectedFor(shop.element.id, item.id, 'packed') != null"
              class="si-expected-hint"
            >
              {{ t('invExpectedHint') }} : {{ expectedFor(shop.element.id, item.id, 'packed') }}
            </div>
          </div>
          <div class="si-count-field">
            <label class="si-count-label">{{ t('invCountLooseUnits') }}</label>
            <div class="si-count-stepper">
              <button type="button" class="si-step" aria-label="-" @click.stop="stepValue(shop.element.id, item.id, 'looseUnits', -1)">
                <v-icon size="16">mdi-minus</v-icon>
              </button>
              <input
                class="form-control si-count-input"
                type="text"
                inputmode="decimal"
                :value="fieldDisplay(shop.element.id, item.id, 'looseUnits')"
                @input="onFieldInput(shop.element.id, item.id, 'looseUnits', $event.target.value)"
                @blur="onFieldBlur(shop.element.id, item.id, 'looseUnits')"
              />
              <button type="button" class="si-step" aria-label="+" @click.stop="stepValue(shop.element.id, item.id, 'looseUnits', 1)">
                <v-icon size="16">mdi-plus</v-icon>
              </button>
            </div>
            <div
              v-if="expectedFor && expectedFor(shop.element.id, item.id, 'loose') != null"
              class="si-expected-hint"
            >
              {{ t('invExpectedHint') }} : {{ expectedFor(shop.element.id, item.id, 'loose') }}
            </div>
          </div>
          <div class="si-count-total">
            {{ t('invCountTotal') }} :
            <strong>{{ formatUnits(totalForItem(shop.element.id, item)) }}</strong>
            {{ item.unit || t('invCountUnitFallback') }}
            <!-- Indice de référence en regard du total compté : besoin prédit
                 (pre-event) ou stock qui doit rester (post-event). Négatif rendu
                 tel quel et signalé — c'est le symptôme d'une source incohérente,
                 pas une valeur à masquer. -->
            <span
              v-if="expectedTotalUnits(item) != null"
              class="si-expected-total"
              :class="{ 'si-expected-total--negative': expectedTotalUnits(item) < 0 }"
            >
              {{ t(expectedTotalLabelKey) }} : {{ formatUnits(expectedTotalUnits(item)) }}
            </span>
          </div>
        </div>

        <div v-show="!mobile || isExpanded(item.id)" class="si-count-actions">
          <button v-if="canTransfer" type="button" class="si-act si-act--ghost" @click="emit('transfer', shop.element, item)">
            <v-icon size="15" class="mr-1">mdi-swap-horizontal</v-icon>
            {{ t('invCountTransfer') }}
          </button>
          <button type="button" class="si-act si-act--reset" @click="markCounted(item.id, false)">
            <v-icon size="15" class="mr-1">mdi-refresh</v-icon>
            {{ t('invCountReset') }}
          </button>
          <button type="button" class="si-act si-act--success" @click="markCounted(item.id, true)">
            <v-icon size="15" class="mr-1">mdi-check</v-icon>
            {{ t('invCountMarkCounted') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, reactive, watch } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import { formatUnits } from '@/composables/useFormatters'
import { clampNumber, parseLocaleNumber, roundTo, stepBy } from '@/utils/number'

const { t } = useI18n()

const props = defineProps({
  shop: { type: Object, required: true },
  // Liste ordonnée des boutiques navigables (pour le switch prev/next/menu).
  shops: { type: Array, default: () => [] },
  mobile: { type: Boolean, default: false },
  counted: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  progress: { type: Number, default: 0 },
  getCount: { type: Function, required: true },
  totalForItem: { type: Function, required: true },
  isItemCounted: { type: Function, required: true },
  // Pre-event Inventory : (shopId, itemId, 'packed'|'loose') → quantité attendue
  // ou null. Absent/null → aucun hint sous les champs.
  expectedFor: { type: Function, default: null },
  // Indice de référence en regard du TOTAL : (elementId, item) → unités ou null.
  // Absent/null → rendu strictement inchangé.
  expectedTotalFor: { type: Function, default: null },
  // Les deux modes n'affichent pas la même grandeur — le libellé vient du parent.
  expectedTotalLabelKey: { type: String, default: 'invPredictedNeedHint' },
  // Unités attendues de la SECTION ([{unit, total}]) depuis le plan de
  // réarmement sauvegardé — null/vide = pas de badge (pas de plan, RBAC non
  // couvert, mode post).
  expectedSectionUnits: { type: Array, default: null },
  // Transfert Logistic depuis le comptage — le parent monte le drawer et fait
  // l'appel API ; false (démo, module absent) = bouton masqué, rendu inchangé.
  canTransfer: { type: Boolean, default: false },
})

const emit = defineEmits(['close', 'change-value', 'mark-counted', 'change-shop', 'transfer'])

// Images produit en échec de chargement → fallback icône (parité React).
const failedImages = ref({})

// Indice de référence d'un article, ou null si le parent n'en fournit pas.
function expectedTotalUnits(item) {
  if (!props.expectedTotalFor) return null
  const v = props.expectedTotalFor(props.shop.element.id, item)
  return Number.isFinite(v) ? v : null
}

// Plats / menu items auxquels cet article de stock appartient (usedIn). Pour un
// ingrédient d'un plat composé (ex: huile de « Tenders Frites »), affiche le(s)
// plat(s) parent(s). Vide pour un produit fini vendu tel quel (usedIn absent).
function itemUsedIn(item) {
  const arr = Array.isArray(item?.usedIn) ? item.usedIn : []
  const names = arr.map((u) => u?.name || u?.menuItemName).filter(Boolean)
  return [...new Set(names)].slice(0, 3).join(', ')
}

// Label du champ « emballé » : « Nombre de fûts de 30L » quand le packaging
// (nom + qté/paquet, portés par l'enrichissement inventoryUtils depuis le
// Market Price « Inventory Information ») est connu ; sinon libellé générique.
function pluralize(name) {
  const n = String(name).trim()
  return /s$/i.test(n) ? n : `${n}s`
}
function packedUnitsLabel(item) {
  const name = item?.inventoryPackaging
  const qty = Number(item?.inventoryQuantityPackaged) > 0 ? item.inventoryQuantityPackaged : null
  if (!name || !qty) return t('invCountPackedUnits')
  return `${t('invCountNumberOf')} ${pluralize(name)} ${t('invCountOf')} ${qty}${item?.unit || ''}`
}

// Accordéon mobile. État par défaut dérivé du statut : un article non compté est
// déplié (prêt à saisir), un article compté est replié (gain de place). Un clic
// utilisateur enregistre un override explicite qui prime sur ce défaut, jusqu'au
// prochain changement de statut (marquer compté / réinitialiser) ou de boutique.
// Sur desktop, tout reste déplié (géré dans le template).
const expandOverride = ref({})
function isExpanded(itemId) {
  const override = expandOverride.value[itemId]
  if (override !== undefined) return override
  return !props.isItemCounted(props.shop.element.id, itemId)
}
function toggleExpand(itemId) {
  expandOverride.value = { ...expandOverride.value, [itemId]: !isExpanded(itemId) }
}
// Marquer compté / réinitialiser : on efface l'override pour laisser le défaut
// reprendre la main (compté → replié, remis à zéro → déplié).
function markCounted(itemId, counted) {
  const next = { ...expandOverride.value }
  delete next[itemId]
  expandOverride.value = next
  emit('mark-counted', props.shop.element.id, itemId, counted)
}
// Changement de boutique → on repart des défauts dérivés du statut.
watch(
  () => props.shop?.element?.id,
  () => {
    expandOverride.value = {}
  },
)

// ── Navigation entre boutiques ──────────────────────────────────────────────
const shopIndex = computed(() =>
  props.shops.findIndex((s) => s?.element?.id === props.shop?.element?.id),
)
const hasPrev = computed(() => shopIndex.value > 0)
const hasNext = computed(
  () => shopIndex.value >= 0 && shopIndex.value < props.shops.length - 1,
)
const prevShop = computed(() => (hasPrev.value ? props.shops[shopIndex.value - 1] : null))
const nextShop = computed(() => (hasNext.value ? props.shops[shopIndex.value + 1] : null))
const currentUncounted = computed(() => uncountedFor(props.shop))
function goPrev() {
  if (hasPrev.value) emit('change-shop', props.shops[shopIndex.value - 1])
}
function goNext() {
  if (hasNext.value) emit('change-shop', props.shops[shopIndex.value + 1])
}
function countedFor(s) {
  return (s.consolidatedInventory || []).filter((it) =>
    props.isItemCounted(s.element.id, it.id),
  ).length
}
function uncountedFor(s) {
  if (!s) return 0
  const totalItems = (s.consolidatedInventory || []).length
  return Math.max(0, totalItems - countedFor(s))
}

// ── Saisie des quantités ────────────────────────────────────────────────────
// Les champs sont contrôlés : le parent stocke le NOMBRE parsé et le réinjecte
// par :model-value. Sans tampon, taper « 0,2 » faisait réécrire le DOM en
// « 0.2 » dès la frappe (virgule volée, caret déplacé) et vider le champ
// réaffichait « 0 » instantanément — vécu comme « le champ refuse les
// décimales ». Le brouillon garde la chaîne tapée telle quelle pendant
// l'édition ; le blur le purge et le champ se reformate depuis le store.
const editDrafts = reactive(new Map())
const draftKey = (shopId, itemId, field) => `${shopId}|${itemId}|${field}`

function fieldDisplay(shopId, itemId, field) {
  const draft = editDrafts.get(draftKey(shopId, itemId, field))
  if (draft !== undefined) return draft
  const stored = props.getCount(shopId, itemId)?.[field]
  const num = Number(stored)
  return Number.isFinite(num) ? formatUnits(num) : ''
}

function onFieldInput(shopId, itemId, field, raw) {
  editDrafts.set(draftKey(shopId, itemId, field), raw)
  let parsed = parseLocaleNumber(raw)
  // Vrac décimal : 2 chiffres après la virgule (demande JLH 13/08) — l'arrondi
  // se fait à l'émission, le brouillon affiché garde la frappe exacte.
  if (parsed != null && field === 'looseUnits') parsed = roundTo(parsed, 2)
  emit('change-value', shopId, itemId, field, parsed)
}

function onFieldBlur(shopId, itemId, field) {
  editDrafts.delete(draftKey(shopId, itemId, field))
}

// Changement de boutique → aucun brouillon ne doit survivre à la navigation.
watch(
  () => props.shop?.element?.id,
  () => {
    editDrafts.clear()
  },
)

// Steppers +/- : lit la valeur courante via getCount (peut contenir "2,5"),
// ±1 arrondi à 2 décimales, clamp ≥ 0, ré-émet. Purge le brouillon du champ,
// sinon l'affichage resterait figé sur la frappe précédente.
function stepValue(shopId, itemId, field, delta) {
  editDrafts.delete(draftKey(shopId, itemId, field))
  const cur = parseLocaleNumber(props.getCount(shopId, itemId)?.[field]) ?? 0
  const next = clampNumber(stepBy(cur, delta, 2), 0)
  emit('change-value', shopId, itemId, field, String(next))
}
</script>

<style scoped>
.si-counting {
  background: #fff;
  border: 1px solid #EEEEEE;
  border-radius: 8px;
  padding: 20px;
}
.si-counting-head {
  display: flex; align-items: center; gap: 12px;
  margin-bottom: 18px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--fb-border, #EEEEEE);
}
.si-counting-title {
  flex: 1;
  min-width: 180px;
}
.si-counting-head h2 {
  margin: 0 0 8px;
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--fb-text, #212121);
}
.si-shop-switch {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: 0;
  padding: 2px 6px;
  margin: -2px -6px 0;
  border-radius: 8px;
  cursor: pointer;
  color: var(--fb-text, #212121);
}
.si-shop-switch:hover { background: var(--fb-subtle, #f1f5f9); }
.si-shop-switch h2 { margin: 0; }
.si-counting-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin: 1px 0 7px;
  color: #64748b;
  font-size: 0.74rem;
  font-weight: 700;
}
.si-shop-switch-count {
  font-size: 0.78rem;
  font-weight: 700;
  color: #94a3b8;
}
.si-shop-switch-done { color: #16a34a; }
.si-shop-jumpbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: -4px 0 16px;
}
.si-shop-jump {
  min-width: 0;
  flex: 1 1 0;
  text-transform: none;
  font-weight: 750;
  border-radius: 8px;
}
.si-shop-jump :deep(.v-btn__content) {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.si-counting-progress {
  flex-shrink: 0;
  font-weight: 700;
}
.si-counting-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 16px;
}
.si-count-item {
  background: var(--fb-surface, #ffffff);
  border: 1px solid var(--fb-border, #E5E7EB);
  border-radius: 14px;
  padding: 16px;
  display: flex; flex-direction: column; gap: 14px;
  box-shadow: 0 1px 2px rgba(16, 24, 40, 0.04);
  transition: box-shadow 0.18s ease, transform 0.18s ease, border-color 0.18s ease;
}
.si-count-item:hover {
  box-shadow: 0 10px 28px rgba(16, 24, 40, 0.10);
  transform: translateY(-2px);
  border-color: #e2e5ea;
}
.si-count-item-done {
  background: #fff6f6;
  border-color: #fad4d4;
  box-shadow: 0 1px 2px rgba(255, 49, 49, 0.05);
}
.si-count-item-done:hover { box-shadow: 0 10px 28px rgba(255, 49, 49, 0.12); }
.si-count-row {
  display: flex; justify-content: space-between; align-items: center; gap: 8px;
}
.si-count-name-wrap {
  display: flex; gap: 10px; align-items: center;
  min-width: 0; flex: 1;
}
.si-count-img {
  width: 40px; height: 40px; border-radius: 6px;
  object-fit: cover; flex-shrink: 0;
}
.si-count-img-placeholder {
  display: flex; align-items: center; justify-content: center;
  background: var(--fb-subtle, #FAFAFA);
  border: 1px solid var(--fb-border, #EEEEEE);
}
.si-count-name { font-weight: 600; color: var(--fb-text, #212121); }
.si-count-usedin { font-size: 0.72rem; color: var(--fb-muted, #6B7280); margin-top: 2px; font-weight: 500; }
.si-count-badge {
  display: inline-flex; align-items: center;
  padding: 3px 10px;
  border-radius: 100px;
  background: #dcfce7;
  color: #15803d;
  font-size: 0.7rem;
  font-weight: 700;
  white-space: nowrap;
  flex-shrink: 0;
}
.si-count-inputs {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px 12px;
  row-gap: 14px;
}
.si-count-inputs :deep(.v-field) { min-height: 40px; }
/* Hint « Attendu : N » sous un champ (Pre-event Inventory, permission requise). */
.si-count-field { display: flex; flex-direction: column; gap: 4px; }
.si-count-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--fb-muted, #6B7280);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
/* Stepper Bootstrap : input encadré par les boutons − / + (remplace le v-text-field) */
.si-count-stepper {
  display: flex;
  align-items: stretch;
  border: 1.5px solid var(--fb-border, #E5E7EB);
  border-radius: 10px;
  overflow: hidden;
  background: var(--fb-surface, #ffffff);
  transition: border-color 0.15s, box-shadow 0.15s;
}
.si-count-stepper:focus-within {
  border-color: #ff3131;
  box-shadow: 0 0 0 3px rgba(255, 49, 49, 0.12);
}
.si-step {
  flex-shrink: 0;
  width: 38px;
  border: none;
  background: var(--fb-subtle, #F7F8FA);
  color: var(--fb-muted, #6B7280);
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}
.si-step:hover { background: #ffe9e9; color: #ff3131; }
.si-step:active { background: #ffd6d6; }
.si-count-input.form-control {
  border: none;
  border-radius: 0;
  text-align: center;
  font-weight: 600;
  font-size: 0.95rem;
  color: var(--fb-text, #111827);
  background: transparent;
  box-shadow: none !important;
  font-variant-numeric: tabular-nums;
  min-width: 0;
  padding: 8px 6px;
}
.si-count-input.form-control:focus { border: none; box-shadow: none !important; }
.si-expected-hint {
  font-size: 0.72rem;
  color: #B45309;
  font-weight: 600;
  padding-left: 2px;
  font-variant-numeric: tabular-nums;
}
.si-step-btn {
  cursor: pointer;
  color: var(--fb-faint, #9E9E9E);
  transition: color 0.12s;
}
.si-step-btn:hover { color: var(--fb-text, #212121); }
.si-count-total {
  grid-column: 1 / -1;
  background: var(--fb-subtle, #FAFAFA);
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 0.85rem;
  color: var(--fb-muted, #6B7280);
  display: flex;
  align-items: center;
  gap: 6px;
}
.si-count-total strong { color: var(--fb-text, #212121); }
/* Indice de référence : même registre visuel que le hint packed/loose, poussé à
   droite du total compté. Le négatif passe en rouge — il signale une incohérence
   de sources, pas une quantité. */
.si-expected-total {
  margin-left: auto;
  font-size: 0.72rem;
  font-weight: 600;
  color: #B45309;
  font-variant-numeric: tabular-nums;
}
.si-expected-total--negative { color: #DC2626; }
.si-count-actions {
  display: flex; gap: 8px;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  padding-top: 10px;
  border-top: 1px solid var(--fb-border, #EEEEEE);
}
/* Boutons d'action de la carte (remplacent les v-btn) */
.si-act {
  display: inline-flex; align-items: center;
  padding: 7px 14px;
  border-radius: 9px;
  font-size: 0.8rem;
  font-weight: 600;
  line-height: 1.2;
  border: 1.5px solid transparent;
  cursor: pointer;
  transition: all 0.15s;
}
.si-act--ghost {
  background: transparent;
  border-color: var(--fb-border, #E5E7EB);
  color: var(--fb-muted, #4B5563);
}
.si-act--ghost:hover { border-color: #cbd0d8; background: var(--fb-subtle, #F7F8FA); color: var(--fb-text, #111827); }
.si-act--reset {
  background: transparent;
  color: var(--fb-muted, #6B7280);
}
.si-act--reset:hover { background: var(--fb-subtle, #F7F8FA); color: var(--fb-text, #111827); }
.si-act--success {
  background: #ff3131;
  border-color: #ff3131;
  color: #fff;
}
.si-act--success:hover { background: #e02424; border-color: #e02424; box-shadow: 0 4px 12px rgba(255, 49, 49, 0.28); }

/* État vide */
.si-count-empty {
  display: flex; flex-direction: column; align-items: center;
  text-align: center;
  gap: 8px;
  padding: 48px 24px;
}
.si-count-empty-title {
  font-weight: 700;
  color: var(--fb-text, #334155);
  font-size: 1rem;
}
.si-count-empty-hint {
  color: var(--fb-muted, #9E9E9E);
  font-size: 0.85rem;
  max-width: 420px;
}

/* Reason input occupies the whole width */
.si-count-inputs :deep(.v-field--variant-outlined.v-input--density-compact .v-field__input) {
  min-height: 38px;
  padding-top: 8px;
  padding-bottom: 8px;
}

@media (max-width: 900px) {
  .si-counting { padding: 14px; }
  .si-counting-head { align-items: flex-start; flex-wrap: wrap; }
  .si-counting-grid { grid-template-columns: 1fr; }
}
@media (max-width: 560px) {
  .si-count-inputs { grid-template-columns: 1fr; }
}

.si-counting-mobile {
  height: 100dvh;
  min-height: 100dvh;
  border: 0;
  border-radius: 0;
  padding: 12px;
  display: flex;
  flex-direction: column;
}
.si-counting-mobile .si-counting-head {
  position: sticky;
  top: 0;
  z-index: 3;
  margin: -12px -12px 10px;
  padding: 10px 12px;
  background: #fff;
  align-items: center;
  flex-wrap: nowrap;
}
.si-counting-mobile .si-counting-title {
  min-width: 0;
}
.si-counting-mobile .si-shop-switch {
  max-width: 100%;
}
.si-counting-mobile .si-shop-switch h2 {
  max-width: min(58vw, 280px);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.94rem;
}
.si-counting-mobile .si-counting-progress {
  display: none;
}
.si-counting-mobile .si-shop-jumpbar {
  margin: 0 0 10px;
}
.si-counting-mobile .si-shop-jumpbar .si-shop-jump:first-child {
  display: none;
}
.si-counting-mobile .si-counting-grid {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding-bottom: 16px;
  gap: 8px;
  /* Empêche la grille d'étirer les lignes pour remplir la hauteur quand il y a
     peu d'articles : les cartes repliées gardent une hauteur uniforme quel que
     soit leur nombre. */
  align-content: start;
  grid-auto-rows: max-content;
}
/* Accordéon mobile : ligne d'en-tête cliquable + carte compacte repliée */
.si-count-row-toggle {
  cursor: pointer;
  user-select: none;
}
.si-count-name-text {
  min-width: 0;
}
.si-count-name-text .si-count-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.si-count-chevron {
  flex-shrink: 0;
  color: #9E9E9E;
}
/* Toutes les cartes (repliées ou non) partagent le même rythme vertical pour
   une pile homogène : la carte ne porte plus de padding, c'est la ligne
   d'en-tête qui le porte et fixe une hauteur de touche uniforme. */
.si-counting-mobile .si-count-item {
  padding: 0;
  gap: 0;
  transition: background-color 0.15s ease;
}
.si-counting-mobile .si-count-row-toggle {
  padding: 12px 14px;
  min-height: 60px;
}
/* Contenu déplié : padding propre (la carte n'en a plus) + léger espace au-dessus
   pour séparer de la ligne d'en-tête. */
.si-counting-mobile .si-count-inputs {
  padding: 4px 14px 0;
}
.si-counting-mobile .si-count-actions {
  padding: 6px 14px 14px;
}
/* État compté : liseré gauche rouge (charte datafriday), lisible même replié. */
.si-counting-mobile .si-count-item-done {
  border-left: 3px solid #ff3131 !important;
}

.si-counting {
  border-color: var(--fb-border, #E5E7EB);
  border-radius: var(--fb-radius-panel, 12px);
  background: var(--fb-surface, #FFFFFF);
  box-shadow: var(--fb-shadow-card, 0 1px 3px rgba(15, 23, 42, 0.05));
}
.si-counting-title,
.si-count-name,
.si-count-total strong {
  color: var(--fb-text, #212121);
}
.si-count-total,
.si-count-chevron {
  color: var(--fb-muted, #6B7280);
}
.si-count-item {
  border-color: var(--fb-border, #E5E7EB) !important;
  border-radius: var(--fb-radius-control, 8px);
  background: var(--fb-surface, #FFFFFF);
}
.si-count-item:hover {
  border-color: rgba(255, 49, 49, 0.26) !important;
}
.si-count-item-done {
  border-color: rgba(255, 49, 49, 0.28) !important;
  background: #fff6f6;
}
.si-counting-mobile .si-counting-head {
  background: var(--fb-surface, #FFFFFF);
}

/* ===================== DARK MODE =====================
   Le reste suit les `--fb-*` ; ici les deux teintes prévues pour du texte sur
   fond clair (kicker ardoise, « compté » vert 600). */
.v-theme--dataFridayDark .si-counting-meta {
  color: #94a3b8;
}
.v-theme--dataFridayDark .si-shop-switch-done {
  color: #86efac;
}
</style>
