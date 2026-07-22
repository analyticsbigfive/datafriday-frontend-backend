<template>
  <v-dialog :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)" max-width="460" persistent>
    <div class="ncd-card" :class="{ 'ncd-card--dark': isDark }">
      <div class="ncd-grad-header">
        <div class="ncd-grad-header__icon"><Shapes :size="20" color="white" /></div>
        <div class="ncd-grad-header__text">
          <div class="ncd-grad-header__title">{{ t('compCreateNewCategoryDialogTitle') }}</div>
          <div class="ncd-grad-header__sub">{{ t('compCreateNewCategoryDialogSubtitle') }}</div>
        </div>
        <button class="ncd-close" @click="cancel"><X :size="18" /></button>
      </div>
      <div class="ncd-body">
        <div v-if="error" class="ncd-error"><AlertCircle :size="14" /> {{ error }}</div>
        <div v-else-if="!typeId" class="ncd-warning">
          <AlertCircle :size="14" />
          <span>
            {{ t('compCreateNewCategoryDialogChooseTypeFirst') }}<span v-if="typeName"> ({{ typeName }} {{ t('compCreateNewCategoryDialogTypeNotRecognized') }})</span>.
          </span>
        </div>
        <!-- Type du composant (hérité du formulaire, en lecture seule) -->
        <div class="ncd-field">
          <label class="ncd-field-label">{{ t('compCreateFieldType') }}</label>
          <input :value="typeName || '—'" class="form-control ncd-input ncd-input--readonly" readonly />
        </div>
        <div class="ncd-field">
          <label class="ncd-field-label" for="ncd-name">{{ t('compCreateNewCategoryDialogLabel') }}</label>
          <input id="ncd-name" v-model="name" class="form-control ncd-input" autofocus @keyup.enter="confirm" />
        </div>
      </div>
      <div class="ncd-foot">
        <button class="ncd-btn ncd-btn--cancel" @click="cancel">{{ t('compCreateDialogCancel') }}</button>
        <button class="ncd-btn ncd-btn--primary" :disabled="!name.trim() || !typeId || loading" @click="confirm">
          <Save :size="14" /> {{ loading ? t('compCreateNewCategoryDialogCreating') : t('compCreateDialogConfirm') }}
        </button>
      </div>
    </div>
  </v-dialog>
</template>

<script>
import { useI18n } from '@/i18n/useI18n';
import { createComponentCategory } from '@/api/endpoints/menu.api';
import { AlertCircle, Save, Shapes, X } from 'lucide-vue-next';

export default {
  name: 'NewCategoryDialog',
  components: { AlertCircle, Save, Shapes, X },
  props: {
    modelValue: { type: Boolean, default: false },
    isDark: { type: Boolean, default: false },
    // ID du Component Type sélectionné dans le formulaire parent — une
    // Component Category appartient toujours à un Type.
    typeId: { type: String, default: '' },
    // Nom affiché du Type actuellement choisi dans le formulaire (peut être une
    // valeur texte libre héritée qui ne correspond à aucun Type réel, d'où
    // typeId vide malgré un champ Type non vide à l'écran).
    typeName: { type: String, default: '' },
  },
  emits: ['update:modelValue', 'created'],
  setup() {
    const { t } = useI18n();
    return { t };
  },
  data() {
    return {
      name: '',
      loading: false,
      error: '',
    };
  },
  methods: {
    cancel() {
      this.name = '';
      this.error = '';
      this.$emit('update:modelValue', false);
    },
    async confirm() {
      const trimmed = this.name.trim();
      if (!trimmed) return;
      if (!this.typeId) {
        this.error = this.t('compCreateNewCategoryDialogTypeRequiredError');
        return;
      }
      this.loading = true;
      this.error = '';
      try {
        const response = await createComponentCategory({ name: trimmed, typeId: this.typeId });
        const created = response?.data || response;
        const id = created?.id || created?._id;
        if (id) {
          await this.$store.dispatch('componentCategories/addComponentCategory', {
            ...created,
            id,
            typeId: created?.typeId || this.typeId,
            typeName: created?.type?.name || '',
          });
        }
        this.$emit('created', trimmed);
        this.name = '';
        this.$emit('update:modelValue', false);
      } catch (e) {
        this.error = e?.response?.data?.message || e?.message || this.t('compCreateNewCategoryDialogGenericError');
      } finally {
        this.loading = false;
      }
    },
  },
};
</script>

<style scoped>
.ncd-card { background:#fff; border-radius:20px; overflow:hidden; box-shadow:0 20px 60px rgba(0,0,0,.15); }
.ncd-grad-header { display:flex; align-items:center; gap:14px; padding:20px 20px 18px; background:#ff3131; }
.ncd-grad-header__icon { width:40px; height:40px; border-radius:10px; background:rgba(255,255,255,.2); display:flex; align-items:center; justify-content:center; flex-shrink:0; }
.ncd-grad-header__text { flex:1; }
.ncd-grad-header__title { font-size:1rem; font-weight:700; color:#fff; }
.ncd-grad-header__sub { font-size:0.75rem; color:rgba(255,255,255,.75); margin-top:2px; }
.ncd-close { background:rgba(255,255,255,.15); border:none; cursor:pointer; width:32px; height:32px; border-radius:8px; display:flex; align-items:center; justify-content:center; color:#fff; transition:background .15s; }
.ncd-close:hover { background:rgba(255,255,255,.25); }
.ncd-body { padding:22px 22px 10px; }
.ncd-error { display:flex; align-items:center; gap:7px; background:#fef2f2; border:1px solid #fecaca; color:#991b1b; border-radius:10px; padding:10px 14px; font-size:0.8125rem; margin-bottom:16px; }
.ncd-warning { display:flex; align-items:flex-start; gap:7px; background:#fffbeb; border:1px solid #fde68a; color:#92400e; border-radius:10px; padding:10px 14px; font-size:0.8125rem; margin-bottom:16px; }
.ncd-warning svg { flex-shrink:0; margin-top:1px; }
.ncd-field { display:flex; flex-direction:column; gap:6px; margin-bottom:14px; }
.ncd-field:last-child { margin-bottom:0; }
.ncd-field-label { font-size:0.75rem; font-weight:600; color:#374151; }
.ncd-input { border:1.5px solid #e5e7eb !important; border-radius:11px !important; box-shadow:none !important; height:46px; font-size:0.875rem; padding:0 14px; }
.ncd-input:focus { border-color:#ff3131 !important; box-shadow:0 0 0 3px rgba(255, 49, 49,.1) !important; outline:none; }
.ncd-input--readonly { background:#f9fafb; color:#6b7280; cursor:default; }
.ncd-foot { display:flex; justify-content:flex-end; gap:10px; padding:14px 22px 22px; }
.ncd-btn { display:inline-flex; align-items:center; gap:6px; padding:0 20px; height:40px; border-radius:50px; font-size:0.875rem; font-weight:600; cursor:pointer; border:none; transition:all .2s; }
.ncd-btn--cancel { background:#f3f4f6; color:#374151; }
.ncd-btn--cancel:hover { background:#e5e7eb; }
.ncd-btn--primary { background:#ff3131; color:#fff; }
.ncd-btn--primary:hover { box-shadow:0 4px 14px rgba(255, 49, 49,.4); transform:translateY(-1px); }
.ncd-btn:disabled { opacity:.6; cursor:not-allowed; transform:none !important; }

/* ── Dark mode ── */
.ncd-card--dark { background:#1e293b; }
.ncd-card--dark .ncd-body { color:#e2e8f0; }
.ncd-card--dark .ncd-field-label { color:#94a3b8; }
.ncd-card--dark .ncd-input { background:#1a2332 !important; color:#e2e8f0; border-color:rgba(255,255,255,.14) !important; }
.ncd-card--dark .ncd-input--readonly { background:rgba(255,255,255,.04) !important; color:#94a3b8; }
.ncd-card--dark .ncd-error { background:rgba(255,49,49,.15); border-color:rgba(255,49,49,.3); color:#fca5a5; }
.ncd-card--dark .ncd-warning { background:rgba(245,158,11,.15); border-color:rgba(245,158,11,.3); color:#fcd34d; }
.ncd-card--dark .ncd-btn--cancel { background:rgba(255,255,255,.08); color:#cbd5e1; }
.ncd-card--dark .ncd-btn--cancel:hover { background:rgba(255,255,255,.14); }
</style>
