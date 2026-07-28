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
        <Tag :size="18" color="white" />
        <span class="mpnd__title">{{ locale === 'fr' ? 'Nouvelle catégorie' : 'New Category' }}</span>
        <button class="mpnd__close" :disabled="loading" @click="close"><X :size="16" /></button>
      </div>
      <div class="mpnd__body">
        <v-alert v-if="error" type="error" variant="tonal" density="compact" rounded="lg" class="mb-3" style="font-size:13px;">
          {{ error }}
        </v-alert>
        <div class="mpnd-field-row">
          <label class="mpnd-field-label" for="mpnd-cat-name">
            {{ locale === 'fr' ? 'Nom de la catégorie' : 'Category name' }} <span class="mpnd-required">*</span>
          </label>
          <input
            id="mpnd-cat-name"
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
// Dialog partagé de création d'une catégorie (market price), extrait des drawers
// Create/Edit. 100% frontend (endpoint existant `createMarketPriceCategory`). Une
// catégorie appartient toujours à un Type : le parent fournit `typeId` (= son
// `selectedTypeId`). Le parent gère la sélection de la catégorie créée via `@created`.
import { Check, Tag, X } from 'lucide-vue-next';
import { useI18n } from '@/i18n/useI18n';
import { createMarketPriceCategory } from '@/api/endpoints/market.price.api';

export default {
  name: 'MarketPriceNewCategoryDialog',
  components: { Check, Tag, X },
  props: {
    modelValue: { type: Boolean, default: false },
    isDark: { type: Boolean, default: false },
    // Id du Good Type sélectionné dans le formulaire parent (une catégorie lui appartient).
    typeId: { type: String, default: '' },
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
      if (!this.typeId) {
        this.error = this.locale === 'fr' ? 'Choisis d\'abord un Good Type.' : 'Pick a Good Type first.';
        return;
      }
      this.loading = true;
      this.error = '';
      try {
        await createMarketPriceCategory({ name, typeId: this.typeId });
        await this.$store.dispatch('marketPriceCategories/fetchMarketPriceCategories', { forceRefresh: true });
        this.emitCreated(name);
      } catch (e) {
        const msg = e?.response?.data?.message || e?.message || '';
        const msgStr = Array.isArray(msg) ? msg.join(', ') : String(msg);
        if (msgStr.includes('Unique constraint')) {
          await this.$store.dispatch('marketPriceCategories/fetchMarketPriceCategories', { forceRefresh: true });
          this.emitCreated(name);
        } else {
          this.error = msgStr || (this.locale === 'fr' ? 'Échec de la création.' : 'Creation failed.');
        }
      } finally {
        this.loading = false;
      }
    },
    emitCreated(name) {
      this.$emit('created', name);
      this.value = '';
      this.$emit('update:modelValue', false);
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
