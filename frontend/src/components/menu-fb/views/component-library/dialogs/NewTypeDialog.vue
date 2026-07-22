<template>
  <v-dialog :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)" max-width="460" persistent>
    <div class="ntd-card" :class="{ 'ntd-card--dark': isDark }">
      <div class="ntd-grad-header">
        <div class="ntd-grad-header__icon"><Tag :size="20" color="white" /></div>
        <div class="ntd-grad-header__text">
          <div class="ntd-grad-header__title">{{ t('compCreateNewTypeDialogTitle') }}</div>
          <div class="ntd-grad-header__sub">{{ t('compCreateNewTypeDialogSubtitle') }}</div>
        </div>
        <button class="ntd-close" @click="cancel"><X :size="18" /></button>
      </div>
      <div class="ntd-body">
        <div v-if="error" class="ntd-error"><AlertCircle :size="14" /> {{ error }}</div>
        <div class="form-floating">
          <input id="ntd-name" v-model="name" class="form-control ntd-input" placeholder=" " autofocus @keyup.enter="confirm" />
          <label for="ntd-name">{{ t('compCreateNewTypeDialogLabel') }}</label>
        </div>
      </div>
      <div class="ntd-foot">
        <button class="ntd-btn ntd-btn--cancel" @click="cancel">{{ t('compCreateDialogCancel') }}</button>
        <button class="ntd-btn ntd-btn--primary" :disabled="!name.trim() || loading" @click="confirm">
          <Save :size="14" /> {{ loading ? t('compCreateNewTypeDialogCreating') : t('compCreateDialogConfirm') }}
        </button>
      </div>
    </div>
  </v-dialog>
</template>

<script>
import { useI18n } from '@/i18n/useI18n';
import { createComponentType } from '@/api/endpoints/menu.api';
import { AlertCircle, Save, Tag, X } from 'lucide-vue-next';

export default {
  name: 'NewTypeDialog',
  components: { AlertCircle, Save, Tag, X },
  props: {
    modelValue: { type: Boolean, default: false },
    isDark: { type: Boolean, default: false },
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
      this.loading = true;
      this.error = '';
      try {
        const response = await createComponentType({ name: trimmed });
        const created = response?.data || response;
        const id = created?.id || created?._id;
        if (id) {
          await this.$store.dispatch('componentTypes/addComponentType', { ...created, id });
        }
        this.$emit('created', trimmed);
        this.name = '';
        this.$emit('update:modelValue', false);
      } catch (e) {
        this.error = e?.response?.data?.message || e?.message || this.t('compCreateNewTypeDialogGenericError');
      } finally {
        this.loading = false;
      }
    },
  },
};
</script>

<style scoped>
.ntd-card { background:#fff; border-radius:20px; overflow:hidden; box-shadow:0 20px 60px rgba(0,0,0,.15); }
.ntd-grad-header { display:flex; align-items:center; gap:14px; padding:20px 20px 18px; background:#ff3131; }
.ntd-grad-header__icon { width:40px; height:40px; border-radius:10px; background:rgba(255,255,255,.2); display:flex; align-items:center; justify-content:center; flex-shrink:0; }
.ntd-grad-header__text { flex:1; }
.ntd-grad-header__title { font-size:1rem; font-weight:700; color:#fff; }
.ntd-grad-header__sub { font-size:0.75rem; color:rgba(255,255,255,.75); margin-top:2px; }
.ntd-close { background:rgba(255,255,255,.15); border:none; cursor:pointer; width:32px; height:32px; border-radius:8px; display:flex; align-items:center; justify-content:center; color:#fff; transition:background .15s; }
.ntd-close:hover { background:rgba(255,255,255,.25); }
.ntd-body { padding:22px 22px 10px; }
.ntd-error { display:flex; align-items:center; gap:7px; background:#fef2f2; border:1px solid #fecaca; color:#991b1b; border-radius:10px; padding:10px 14px; font-size:0.8125rem; margin-bottom:16px; }
.ntd-input { border:1.5px solid #e5e7eb !important; border-radius:11px !important; box-shadow:none !important; height:52px; font-size:0.875rem; }
.ntd-input:focus { border-color:#ff3131 !important; box-shadow:0 0 0 3px rgba(255, 49, 49,.1) !important; outline:none; }
.ntd-foot { display:flex; justify-content:flex-end; gap:10px; padding:14px 22px 22px; }
.ntd-btn { display:inline-flex; align-items:center; gap:6px; padding:0 20px; height:40px; border-radius:50px; font-size:0.875rem; font-weight:600; cursor:pointer; border:none; transition:all .2s; }
.ntd-btn--cancel { background:#f3f4f6; color:#374151; }
.ntd-btn--cancel:hover { background:#e5e7eb; }
.ntd-btn--primary { background:#ff3131; color:#fff; }
.ntd-btn--primary:hover { box-shadow:0 4px 14px rgba(255, 49, 49,.4); transform:translateY(-1px); }
.ntd-btn:disabled { opacity:.6; cursor:not-allowed; transform:none !important; }

/* ── Dark mode ── */
.ntd-card--dark { background:#1e293b; }
.ntd-card--dark .ntd-body { color:#e2e8f0; }
.ntd-card--dark .form-floating label { color:#94a3b8; }
.ntd-card--dark .ntd-input { background:#1a2332 !important; color:#e2e8f0; border-color:rgba(255,255,255,.14) !important; }
.ntd-card--dark .ntd-error { background:rgba(255,49,49,.15); border-color:rgba(255,49,49,.3); color:#fca5a5; }
.ntd-card--dark .ntd-btn--cancel { background:rgba(255,255,255,.08); color:#cbd5e1; }
.ntd-card--dark .ntd-btn--cancel:hover { background:rgba(255,255,255,.14); }
</style>
