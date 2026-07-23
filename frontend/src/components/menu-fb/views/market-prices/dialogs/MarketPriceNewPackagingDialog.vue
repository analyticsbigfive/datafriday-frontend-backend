<template>
  <v-dialog
    :model-value="modelValue"
    max-width="420"
    :z-index="11000"
    :persistent="loading"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <div class="mpnd" :class="{ 'mpnd--dark': isDark }">
      <div class="mpnd__header">
        <Package :size="18" color="white" />
        <span class="mpnd__title">{{ locale === 'fr' ? 'Ajouter un packaging' : 'Add a packaging' }}</span>
        <button class="mpnd__close" :disabled="loading" @click="close"><X :size="16" /></button>
      </div>
      <div class="mpnd__body">
        <v-alert v-if="error" type="error" variant="tonal" density="compact" rounded="lg" class="mb-3" style="font-size:13px;">
          {{ error }}
        </v-alert>
        <div class="mpnd-field-row">
          <label class="mpnd-field-label" for="mpnd-pk-name">
            {{ locale === 'fr' ? 'Nom du packaging' : 'Packaging name' }} <span class="mpnd-required">*</span>
          </label>
          <input
            id="mpnd-pk-name"
            ref="nameInput"
            v-model="value"
            type="text"
            class="form-control mpnd-input"
            :disabled="loading"
            @keyup.enter="confirm"
          />
        </div>
      </div>
      <div class="mpnd__footer">
        <button class="mpnd-btn mpnd-btn--cancel" :disabled="loading" @click="close">{{ t('cancel') }}</button>
        <button class="mpnd-btn mpnd-btn--primary" :disabled="!value.trim() || loading" @click="confirm">
          <v-progress-circular v-if="loading" indeterminate size="14" width="2" color="white" class="me-1" />
          <Check v-else :size="14" class="me-1" />
          {{ locale === 'fr' ? 'Ajouter' : 'Add' }}
        </button>
      </div>
    </div>
  </v-dialog>
</template>

<script>
// Dialog partagé de création d'un packing type (market price), extrait des drawers
// Create/EditSupplier. 100% frontend (endpoint existant `createPackingType`). Émet le
// NOM ; le parent l'affecte au champ ciblé (purchase/inventory packaging) qu'il a
// mémorisé via `onPackagingSelectChange`. Le refetch/ajout au store est fait ici.
import { Check, Package, X } from 'lucide-vue-next';
import { useI18n } from '@/i18n/useI18n';
import { createPackingType } from '@/api/endpoints/packing-type.api';

export default {
  name: 'MarketPriceNewPackagingDialog',
  components: { Check, Package, X },
  props: {
    modelValue: { type: Boolean, default: false },
    isDark: { type: Boolean, default: false },
  },
  emits: ['update:modelValue', 'created'],
  setup() {
    const { t, locale } = useI18n();
    return { t, locale };
  },
  data() {
    return { value: '', loading: false, error: '' };
  },
  watch: {
    modelValue(open) {
      if (open) { this.error = ''; this.loading = false; }
    },
  },
  methods: {
    close() {
      this.value = '';
      this.error = '';
      this.$emit('update:modelValue', false);
    },
    async confirm() {
      const name = this.value.trim();
      if (!name) return;
      this.loading = true;
      this.error = '';
      try {
        const res = await createPackingType({ name });
        const id = res?.id || res?._id;
        if (!id) throw new Error('Packing type creation failed');
        this.$store.dispatch('packingTypes/addPackingType', { ...res, id });
        this.$store.dispatch('packingTypes/fetchPackingTypes', { forceRefresh: true });
        this.$emit('created', name);
        this.value = '';
        this.$emit('update:modelValue', false);
      } catch (e) {
        const msg = e?.response?.data?.message || e?.message || '';
        const msgStr = Array.isArray(msg) ? msg.join(', ') : String(msg);
        this.error = msgStr.includes('Unique constraint')
          ? (this.locale === 'fr' ? `Un packing type "${name}" existe déjà.` : `A packing type "${name}" already exists.`)
          : msgStr || (this.locale === 'fr' ? 'Échec de la création.' : 'Creation failed.');
      } finally {
        this.loading = false;
      }
    },
  },
};
</script>

<style scoped>
.mpnd { background:#fff; border-radius:14px; box-shadow:0 8px 32px rgba(0,0,0,.15); overflow:hidden; min-width:280px; }
.mpnd__header { display:flex; align-items:center; gap:10px; padding:14px 16px 12px; background:#ff3131; color:#fff; }
.mpnd__title { flex:1; font-size:14px; font-weight:600; }
.mpnd__close { background:none; border:none; color:rgba(255,255,255,.8); cursor:pointer; padding:2px; line-height:1; }
.mpnd__close:hover { color:#fff; }
.mpnd__body { padding:16px; }
.mpnd__footer { display:flex; justify-content:flex-end; gap:8px; padding:0 16px 14px; }
.mpnd-field-row { display:flex; flex-direction:column; gap:6px; margin-bottom:12px; }
.mpnd-field-label { font-size:12.5px; font-weight:600; color:#374151; }
.mpnd-required { color:#ff3131; }
.mpnd-input.form-control { border-radius:11px; border:1.5px solid #e5e7eb; font-size:13.5px; color:#111827; padding:.65rem .8rem; background:#fafafa; transition:border-color .2s, box-shadow .2s; }
.mpnd-input.form-control:focus { border-color:#ff3131; box-shadow:0 0 0 3px rgba(255,49,49,.1); background:#fff; }
.mpnd-btn { display:inline-flex; align-items:center; justify-content:center; padding:10px 22px; border-radius:100px; font-size:14px; font-weight:600; cursor:pointer; transition:all .2s; border:none; line-height:1.4; }
.mpnd-btn:disabled { opacity:.45; cursor:not-allowed; }
.mpnd-btn--cancel { background:transparent; border:1.5px solid #e5e7eb; color:#6b7280; }
.mpnd-btn--cancel:hover:not(:disabled) { border-color:#9ca3af; background:#f3f4f6; color:#374151; }
.mpnd-btn--primary { background:#ff3131; color:#fff; box-shadow:0 4px 14px rgba(255,49,49,.3); }
.mpnd-btn--primary:hover:not(:disabled) { box-shadow:0 6px 20px rgba(255,49,49,.4); transform:translateY(-1px); }

/* ── Dark mode ── */
.mpnd--dark { background:#1f2937; }
.mpnd--dark .mpnd-field-label { color:#cbd5e1; }
.mpnd--dark .mpnd-input.form-control { background:#263548; border-color:#374151; color:#e5e7eb; }
.mpnd--dark .mpnd-input.form-control:focus { background:#263548; }
.mpnd--dark .mpnd-btn--cancel { border-color:#374151; color:#cbd5e1; }
.mpnd--dark .mpnd-btn--cancel:hover:not(:disabled) { border-color:rgba(255,255,255,.24); background:rgba(255,255,255,.06); color:#e5e7eb; }
</style>
