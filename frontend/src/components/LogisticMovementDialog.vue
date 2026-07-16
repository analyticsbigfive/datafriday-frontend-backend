<template>
  <Teleport to="body">
    <Transition name="lgmv">
      <div v-if="modelValue" class="lgmv-overlay" @click.self="close">
        <div class="lgmv-panel">
          <!-- Header -->
          <div class="lgmv-header">
            <img v-if="item?.picture" :src="item.picture" :alt="item.name" class="lgmv-header-pic" />
            <div v-else class="lgmv-header-pic lgmv-header-pic-placeholder">
              <v-icon size="18" color="grey">mdi-package-variant-closed</v-icon>
            </div>
            <div class="lgmv-header-text">
              <div class="lgmv-header-title">{{ isAdd ? t('logiAddTitle') : t('logiRemoveTitle') }}</div>
              <div class="lgmv-header-sub">{{ item?.name }} · {{ element?.name }}</div>
            </div>
            <button class="lgmv-close" type="button" @click="close">
              <v-icon size="18">mdi-close</v-icon>
            </button>
          </div>
          <v-divider />

          <!-- Body -->
          <div class="lgmv-body">
            <!-- Le sélecteur de Market Price n'a de sens que pour une denrée 'ingredient' :
                 un produit fini (readyForSale=Yes), un component ou un packaging n'ont pas
                 de Market Price propre — l'afficher laissait choisir n'importe quel article
                 du catalogue et écraser silencieusement le pack size (unitsPerPack) de cette
                 ligne de stock (BUG-032). -->
            <div v-if="item?.kind === 'ingredient'" class="lgmv-field">
              <div class="lgmv-label">{{ t('logiMarketPrice') }}</div>
              <v-skeleton-loader v-if="marketPricesLoading" type="text" class="lgmv-field-skeleton" />
              <v-autocomplete
                v-else
                v-model="form.marketPriceId"
                :items="marketPriceOptions"
                item-title="title"
                item-value="value"
                variant="outlined"
                density="compact"
                rounded="lg"
                hide-details
                clearable
                :menu-props="{ zIndex: 3500 }"
                :placeholder="t('logiMarketPricePlaceholder')"
              />
            </div>

            <div class="lgmv-field-row">
              <div class="lgmv-field">
                <div class="lgmv-label">{{ packLabel }}</div>
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
              <div class="lgmv-field">
                <div class="lgmv-label">{{ looseLabel }}</div>
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

            <div v-if="availableCap" class="lgmv-cap" :class="{ 'lgmv-cap-over': exceedsCap }">
              <v-icon size="14" class="mr-1">{{ exceedsCap ? 'mdi-alert-circle-outline' : 'mdi-information-outline' }}</v-icon>
              {{ t('logiAvailable') }} : {{ availableCap.packed }} {{ packedShortLabel }}
              <template v-if="capTotal(availableCap) !== null"> ({{ capTotal(availableCap) }})</template>
              <template v-else> · {{ formatUnits(availableCap.loose) }} {{ looseShortLabel }}</template>
            </div>

            <div class="lgmv-field">
              <div class="lgmv-label">{{ t('logiReason') }}</div>
              <v-select
                v-model="form.reason"
                :items="reasonOptions"
                item-title="title"
                item-value="value"
                variant="outlined"
                density="compact"
                rounded="lg"
                hide-details
                :menu-props="{ zIndex: 3500 }"
              />
            </div>

            <!-- Champs conditionnels selon la raison -->
            <div v-if="form.reason === 'TRANSFER_SHOP'" class="lgmv-field">
              <div class="lgmv-label">{{ isAdd ? t('logiFromShop') : t('logiToShop') }}</div>
              <v-select
                v-model="form.counterpartyElementId"
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

            <div v-else-if="form.reason === 'TRANSFER_STORAGE'" class="lgmv-field">
              <div class="lgmv-label">{{ isAdd ? t('logiFromStorage') : t('logiToStorage') }}</div>
              <v-select
                v-model="form.counterpartyElementId"
                :items="storageOptions"
                item-title="title"
                item-value="value"
                variant="outlined"
                density="compact"
                rounded="lg"
                hide-details
                :menu-props="{ zIndex: 3500 }"
              />
            </div>

            <div v-else-if="form.reason === 'EXPIRY'" class="lgmv-field">
              <div class="lgmv-label">{{ t('logiExpiryDate') }}</div>
              <v-text-field
                v-model="form.expiryDate"
                type="date"
                variant="outlined"
                density="compact"
                rounded="lg"
                hide-details
              />
            </div>

            <div v-else-if="form.reason === 'OTHER'" class="lgmv-field">
              <div class="lgmv-label">{{ t('logiOtherReason') }}</div>
              <v-textarea
                v-model="form.note"
                variant="outlined"
                density="compact"
                rounded="lg"
                rows="2"
                hide-details
                :placeholder="t('logiOtherReasonPlaceholder')"
              />
            </div>

            <v-alert v-if="error" type="error" density="compact" variant="tonal" class="lgmv-alert">
              {{ error }}
            </v-alert>
          </div>

          <!-- Footer -->
          <div class="lgmv-footer">
            <v-btn variant="text" @click="close">{{ t('logiCancel') }}</v-btn>
            <v-btn
              class="lgmv-confirm-btn"
              variant="flat"
              rounded="lg"
              :loading="saving"
              :disabled="!isValid"
              @click="submit"
            >
              <v-icon size="16" class="mr-1">{{ isAdd ? 'mdi-plus' : 'mdi-minus' }}</v-icon>
              {{ isAdd ? t('logiAddBtn') : t('logiRemoveBtn') }}
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
import { translatePackagingType, pluralize } from '@/utils/packagingTypeTranslations'

/**
 * Sidebar Ajouter / Supprimer un produit (interface Logistic) — ouverture
 * droite→gauche, charte --fb-* (miroir EventBreakdownDrawer pour la structure
 * Teleport+Transition, réhabillé aux tokens de l'app plutôt qu'en couleurs figées).
 * Purement présentiel : le parent fait l'appel API (emit `submit`) et pilote
 * `saving` / `error`. Le formulaire se réinitialise à chaque ouverture.
 */
export default {
  name: 'LogisticMovementDialog',
  props: {
    modelValue: { type: Boolean, default: false },
    /** 'add' | 'remove' */
    mode: { type: String, default: 'add' },
    /** Item du référentiel { name, marketPriceId } */
    item: { type: Object, default: null },
    unitsPerPack: { type: [Number, String], default: null },
    /** PDV/Storage porteur { id, name } */
    element: { type: Object, default: null },
    /** PDV candidats aux transferts [{ id, name }] (l'élément courant est exclu) */
    shops: { type: Array, default: () => [] },
    /** Storages candidats aux transferts [{ id, name }] */
    storages: { type: Array, default: () => [] },
    /** Stock actuel de la denrée SUR L'ÉLÉMENT COURANT { packed, loose } — plafond des suppressions. */
    currentStock: { type: Object, default: () => ({ packed: 0, loose: 0 }) },
    /** Catalogue market prices (store inventory) */
    marketPrices: { type: Array, default: () => [] },
    /** Le champ affiche l'id brut le temps du fetch scopé — squelette pendant ce court chargement. */
    marketPricesLoading: { type: Boolean, default: false },
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
      form: {
        marketPriceId: null,
        packed: 0,
        loose: 0,
        reason: 'DELIVERY',
        counterpartyElementId: null,
        expiryDate: null,
        note: '',
      },
    }
  },
  computed: {
    isAdd() {
      return this.mode === 'add'
    },
    /** Libellé du champ « Packed » : type de conditionnement + capacité (ex. « Nombre de Caisses de 30l »)
     *  quand connu (MarketPrice.inventoryPackaging), sinon le mot générique « Packed ». */
    packLabel() {
      const type = translatePackagingType(this.item?.packagingType, this.locale)
      if (type && this.unitsPerPack) {
        return `${this.t('logiNumberOf')} ${pluralize(type)} ${this.t('logiPackagingOf')} ${this.unitsPerPack} ${this.item?.unit || ''}`.trim()
      }
      return this.t('logiPacked')
    },
    /** Libellé du champ « Loose » : même méthode que packLabel — porte l'unité réelle
     *  de la denrée (ex. « Number of loose Pc ») plutôt que le mot générique « units »
     *  figé dans logiLoose, quand cette unité est connue. */
    looseLabel() {
      const unit = this.item?.unit
      return unit ? `${this.t('logiNumberOf')} ${this.t('logiLooseShort')} ${unit}` : this.t('logiLoose')
    },
    /** Version courte du type de conditionnement (ex. « Crates »), utilisée dans le
     *  bandeau « Available » et les options de transfert — repli sur le mot générique
     *  « packed » si le type n'est pas connu. */
    packedShortLabel() {
      const type = translatePackagingType(this.item?.packagingType, this.locale)
      return type ? pluralize(type) : this.t('logiPackedShort')
    },
    /** Unité réelle de la denrée (ex. « l », « Pc »), repli sur le mot générique
     *  « loose » si l'unité n'est pas connue — même esprit que looseLabel. */
    looseShortLabel() {
      return this.item?.unit || this.t('logiLooseShort')
    },
    reasonOptions() {
      // Ajout : Delivery (défaut) / Transfert d'un PDV / d'un Storage / Autre.
      // Suppression : Transfert vers un PDV / vers un Storage / DLC / Autre.
      const opts = this.isAdd
        ? [
            { title: this.t('logiReasonDelivery'), value: 'DELIVERY' },
            { title: this.t('logiReasonFromShop'), value: 'TRANSFER_SHOP' },
            { title: this.t('logiReasonFromStorage'), value: 'TRANSFER_STORAGE' },
            { title: this.t('logiReasonOther'), value: 'OTHER' },
          ]
        : [
            { title: this.t('logiReasonToShop'), value: 'TRANSFER_SHOP' },
            { title: this.t('logiReasonToStorage'), value: 'TRANSFER_STORAGE' },
            { title: this.t('logiReasonExpiry'), value: 'EXPIRY' },
            { title: this.t('logiReasonOther'), value: 'OTHER' },
          ]
      return opts
    },
    /** Market prices RÉELLEMENT liés à cette denrée (match itemName, ou déjà lié via
     *  item.marketPriceId) — plusieurs fournisseurs d'un même produit restent proposés
     *  (ex. « 4x LARGE PANCO 80gr (Metro Auxerre) » vs un autre fournisseur), mais le
     *  reste du catalogue n'est PLUS proposé en repli : un Market Price sans rapport
     *  avec cette denrée a un pack size différent, et le sélectionner écraserait
     *  silencieusement le unitsPerPack de cette ligne de stock (BUG-032). Article
     *  fournisseur (nom réel du produit acheté) affiché, fournisseur entre parenthèses
     *  pour distinguer plusieurs fournisseurs ; repli sur itemName si aucun article
     *  fournisseur renseigné. */
    marketPriceOptions() {
      const name = String(this.item?.name ?? '').trim().toLowerCase()
      const matches = []
      for (const mp of this.marketPrices) {
        if (String(mp.itemName ?? '').trim().toLowerCase() !== name && mp.id !== this.item?.marketPriceId) continue
        const label = String(mp.supplierItem ?? '').trim() || mp.itemName
        const title = mp.supplier ? `${label} (${mp.supplier})` : label
        matches.push({ title, value: mp.id })
      }
      return matches
    },
    shopOptions() {
      return this.shops
        .filter((s) => s.id !== this.element?.id)
        .map((s) => ({ title: this.optionLabel(s), value: s.id }))
    },
    storageOptions() {
      return this.storages
        .filter((s) => s.id !== this.element?.id)
        .map((s) => ({ title: this.optionLabel(s), value: s.id }))
    },
    /** Valeurs réellement envoyées (packed = entier ≥ 0, loose = float ≥ 0). */
    sanitizedQty() {
      return {
        packed: Math.max(0, Math.round(Number(this.form.packed) || 0)),
        loose: Math.max(0, Number(this.form.loose) || 0),
      }
    },
    isTransfer() {
      return this.form.reason === 'TRANSFER_SHOP' || this.form.reason === 'TRANSFER_STORAGE'
    },
    /**
     * Plafond disponible pour CETTE opération, ou null si non plafonné :
     * - Suppression (quelle que soit la raison) : on prélève toujours sur l'élément
     *   courant → plafonné par son stock actuel.
     * - Ajout par transfert : on prélève sur la contrepartie choisie → plafonné par
     *   SON stock (déjà connu, cf. shops/storages enrichis par le parent).
     * - Ajout Delivery/Autre : stock externe, pas de plafond.
     */
    availableCap() {
      if (!this.isAdd) return this.currentStock
      if (!this.isTransfer || !this.form.counterpartyElementId) return null
      const list = this.form.reason === 'TRANSFER_SHOP' ? this.shops : this.storages
      const cp = list.find((s) => s.id === this.form.counterpartyElementId)
      return cp ? { packed: cp.packed ?? 0, loose: cp.loose ?? 0 } : null
    },
    /** Miroir de la « casse de pack » backend (`normalizeLevel`/`applyLevelDelta` insufficient
     *  check) : on ne peut jamais prélever plus de packs ENTIERS que disponible (`packed >
     *  cap.packed`), mais un manque de loose peut être comblé en empruntant sur un pack entier
     *  disponible — d'où la comparaison sur le TOTAL en unité réelle (packed*unitsPerPack+loose)
     *  plutôt que sur `loose` seul. Sans pack size connu, repli sur l'ancienne comparaison
     *  champ par champ (le backend reste de toute façon juge de paix final). */
    exceedsCap() {
      const cap = this.availableCap
      if (!cap) return false
      const { packed, loose } = this.sanitizedQty
      const upp = Number(this.unitsPerPack)
      if (upp > 0) {
        const availableTotal = (Number(cap.packed) || 0) * upp + (Number(cap.loose) || 0)
        const requestedTotal = packed * upp + loose
        return packed > (cap.packed ?? 0) || requestedTotal > availableTotal + 1e-9
      }
      return packed > (cap.packed ?? 0) || loose > (cap.loose ?? 0)
    },
    isValid() {
      // Valide sur les valeurs ARRONDIES (celles du payload) : « 0.4 packs » ne
      // doit pas activer le bouton pour envoyer un mouvement à quantité nulle.
      const { packed, loose } = this.sanitizedQty
      if (packed + loose <= 0) return false
      if (this.isTransfer && !this.form.counterpartyElementId) return false
      if (this.form.reason === 'EXPIRY' && !this.form.expiryDate) return false
      if (this.form.reason === 'OTHER' && !String(this.form.note || '').trim()) return false
      if (this.exceedsCap) return false
      return true
    },
  },
  watch: {
    modelValue(open) {
      document.body.style.overflow = open ? 'hidden' : ''
      if (open) this.resetForm()
    },
    // Changer de raison invalide les champs conditionnels de l'ancienne (sinon un
    // counterpartyElementId sélectionné pour un transfert survivrait à un retour
    // sur Delivery et créerait un mouvement miroir à tort).
    'form.reason'() {
      this.form.counterpartyElementId = null
      this.form.expiryDate = null
    },
  },
  beforeUnmount() {
    document.body.style.overflow = ''
  },
  methods: {
    close() {
      this.$emit('update:modelValue', false)
    },
    /** Quantité totale équivalente d'un stock (packed*unitsPerPack + loose) en unité réelle —
     *  « 2 Cartons » de 3 Pc et 0 loose, c'est 6 Pc, pas "0 Pc" (le nombre de loose seul est
     *  trompeur une fois qu'on sait qu'un carton contient plusieurs pièces). Retourne `null`
     *  si le pack size n'est pas connu (repli sur l'ancien affichage packed/loose séparé). */
    capTotal(cap) {
      const upp = Number(this.unitsPerPack)
      if (!upp || !cap) return null
      const total = (Number(cap.packed) || 0) * upp + (Number(cap.loose) || 0)
      return `${formatUnits(total)} ${this.item?.unit || ''}`.trim()
    },
    /** Titre enrichi du stock actuel de la denrée à cet élément (choisir en connaissance de cause). */
    optionLabel(el) {
      const total = this.capTotal(el)
      const detail = total !== null ? `(${total})` : `· ${formatUnits(el.loose ?? 0)} ${this.looseShortLabel}`
      return `${el.name} — ${el.packed ?? 0} ${this.packedShortLabel} ${detail}`
    },
    resetForm() {
      this.form = {
        // Présélection : market price déjà résolu par le référentiel d'inventaire.
        marketPriceId: this.item?.marketPriceId ?? null,
        packed: 0,
        loose: 0,
        reason: this.isAdd ? 'DELIVERY' : 'TRANSFER_SHOP',
        counterpartyElementId: null,
        expiryDate: null,
        note: '',
      }
    },
    submit() {
      if (!this.isValid) return
      const isTransfer = this.form.reason === 'TRANSFER_SHOP' || this.form.reason === 'TRANSFER_STORAGE'
      const payload = {
        direction: this.isAdd ? 'add' : 'remove',
        ...this.sanitizedQty,
        reason: this.form.reason,
      }
      if (this.form.marketPriceId) payload.marketPriceId = this.form.marketPriceId
      // Champs conditionnels : uniquement ceux de la raison COURANTE (une valeur
      // saisie pour une raison précédente ne doit jamais partir dans le payload).
      if (isTransfer && this.form.counterpartyElementId) {
        payload.counterpartyElementId = this.form.counterpartyElementId
      }
      if (this.form.reason === 'EXPIRY' && this.form.expiryDate) {
        payload.expiryDate = new Date(this.form.expiryDate).toISOString()
      }
      if (this.form.reason === 'OTHER' && String(this.form.note || '').trim()) {
        payload.note = String(this.form.note).trim()
      }
      this.$emit('submit', payload)
    },
  },
}
</script>

<style scoped>
.lgmv-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.4);
  z-index: 3000;
  display: flex;
  justify-content: flex-end;
}

.lgmv-panel {
  width: 420px;
  max-width: 100vw;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--fb-surface, #ffffff);
  border-top: 4px solid var(--fb-primary, #ff3131);
  box-shadow: var(--fb-shadow-hover, -8px 0 40px rgba(0, 0, 0, 0.16));
  overflow: hidden;
}

/* ── Header : sobre, un seul accent (le liseré du panneau), pas de bloc coloré
   par action — miroir de MenuItemCreateView (charte de l'app). ──────────── */
.lgmv-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 18px 20px 14px;
}
.lgmv-header-pic {
  width: 42px;
  height: 42px;
  border-radius: 10px;
  object-fit: cover;
  flex-shrink: 0;
  box-shadow: var(--fb-shadow-card, 0 1px 3px rgba(15, 23, 42, 0.12));
}
.lgmv-header-pic-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--fb-subtle, #fafafa);
  border: 1px solid var(--fb-border, #e5e7eb);
  box-shadow: none;
}
.lgmv-header-text { flex: 1; min-width: 0; }
.lgmv-header-title { font-size: 1.05rem; font-weight: 700; color: var(--fb-text, #111827); }
.lgmv-header-sub {
  font-size: 0.8rem;
  color: var(--fb-muted, #6b7280);
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.lgmv-close {
  flex-shrink: 0;
  width: 30px;
  height: 30px;
  border-radius: var(--fb-radius-control, 8px);
  border: none;
  background: transparent;
  color: var(--fb-muted, #6b7280);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 150ms ease;
}
.lgmv-close:hover { background: var(--fb-subtle, #f3f4f6); }

/* ── Body : fond légèrement distinct de la surface pour que les champs (blancs,
   ombrés) se détachent — sinon tout reste plat sur le même blanc. ──────────── */
.lgmv-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  background: var(--fb-bg, #f5f5f5);
}
.lgmv-field { display: flex; flex-direction: column; gap: 6px; }
.lgmv-field-skeleton { height: 40px; border-radius: 11px; }
.lgmv-field-row { display: flex; gap: 12px; }
.lgmv-field-row .lgmv-field { flex: 1 1 0; }
.lgmv-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--fb-muted, #374151);
}
.lgmv-alert { border-radius: var(--fb-radius-control, 8px); }
.lgmv-cap {
  display: flex;
  align-items: center;
  font-size: 0.76rem;
  color: var(--fb-muted, #6b7280);
  background: var(--fb-subtle, #fafafa);
  border: 1px solid var(--fb-border, #e5e7eb);
  border-radius: var(--fb-radius-control, 8px);
  padding: 6px 10px;
  margin-top: -6px;
}
.lgmv-cap-over {
  color: #ff3131;
  background: var(--fb-danger-soft, #fef2f2);
  border-color: rgba(255, 49, 49, 0.3);
  font-weight: 600;
}

/* Champs : blancs + ombre légère + bordure, glow rouge au focus — même esprit
   que .mic-input.form-control (MenuItemCreateView), via l'override du v-field. */
.lgmv-body :deep(.v-field) {
  border-radius: 11px;
  border: 1.5px solid var(--fb-border, #e5e7eb);
  background: var(--fb-surface, #ffffff);
  box-shadow: var(--fb-shadow-card, 0 1px 3px rgba(15, 23, 42, 0.06));
  transition: border-color 150ms ease, box-shadow 150ms ease;
}
.lgmv-body :deep(.v-field .v-field__outline) { display: none; }
.lgmv-body :deep(.v-field--focused) {
  border-color: var(--fb-primary, #ff3131);
  box-shadow: 0 0 0 3px rgba(255, 49, 49, 0.12);
}

/* ── Footer ─────────────────────────────────────────────── */
.lgmv-footer {
  flex-shrink: 0;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 14px 20px;
  border-top: 1px solid var(--fb-border, #e5e7eb);
  background: var(--fb-surface, #ffffff);
}
.lgmv-footer :deep(.v-btn) { border-radius: 20px; text-transform: none; font-weight: 600; padding: 0 18px; }
.lgmv-confirm-btn { background: var(--fb-primary, #ff3131) !important; color: #fff !important; }

/* ── Transition (droite → gauche) ──────────────────────────── */
.lgmv-enter-active, .lgmv-leave-active { transition: opacity 220ms ease; }
.lgmv-enter-active .lgmv-panel, .lgmv-leave-active .lgmv-panel {
  transition: transform 260ms cubic-bezier(0.4, 0, 0.2, 1);
}
.lgmv-enter-from, .lgmv-leave-to { opacity: 0; }
.lgmv-enter-from .lgmv-panel, .lgmv-leave-to .lgmv-panel { transform: translateX(100%); }

@media (prefers-reduced-motion: reduce) {
  .lgmv-enter-active, .lgmv-leave-active,
  .lgmv-enter-active .lgmv-panel, .lgmv-leave-active .lgmv-panel { transition: none; }
}
</style>
