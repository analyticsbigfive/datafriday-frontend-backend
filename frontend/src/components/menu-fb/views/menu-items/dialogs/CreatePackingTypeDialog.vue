<template>
  <v-dialog :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)" max-width="460" persistent>
    <div class="cptd-card">
      <!-- Gradient header -->
      <div class="cptd-grad-header">
        <div class="cptd-grad-header__icon"><Package :size="20" color="white" /></div>
        <div class="cptd-grad-header__text">
          <div class="cptd-grad-header__title">{{ t('menuItemCreatePackagingDialogTitle') }}</div>
          <div class="cptd-grad-header__sub">{{ t('menuItemCreatePackagingDialogSubtitle') }}</div>
        </div>
        <button class="cptd-close" @click="cancel"><X :size="18" /></button>
      </div>
      <!-- Body -->
      <div class="cptd-body">
        <div v-if="error" class="cptd-error"><AlertCircle :size="14" /> {{ error }}</div>
        <div class="form-floating">
          <input
            id="cptd-name"
            v-model="name"
            class="form-control cptd-input"
            placeholder=" "
            autofocus
            @keyup.enter="submit"
          />
          <label for="cptd-name">{{ t('menuItemCreatePackagingDialogLabel') }}</label>
        </div>
      </div>
      <!-- Footer -->
      <div class="cptd-foot">
        <button class="cptd-btn cptd-btn--cancel" @click="cancel">{{ t('menuItemCreateTypeDialogCancel') }}</button>
        <button class="cptd-btn cptd-btn--primary" :disabled="loading" @click="submit">
          <Check :size="14" />
          {{ loading ? '…' : t('menuItemCreatePackagingDialogAdd') }}
        </button>
      </div>
    </div>
  </v-dialog>
</template>

<script>
import { AlertCircle, Check, Package, X } from 'lucide-vue-next';
import { useI18n } from '@/i18n/useI18n';
import { createPackingType } from '@/api/endpoints/packing-type.api';

export default {
  name: 'CreatePackingTypeDialog',
  components: { AlertCircle, Check, Package, X },
  props: {
    modelValue: { type: Boolean, default: false },
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
    async submit() {
      const trimmed = this.name.trim();
      if (!trimmed) {
        this.error = this.t('menuItemCreatePackagingDialogNameRequiredError');
        return;
      }
      this.loading = true;
      this.error = '';
      try {
        const response = await createPackingType({ name: trimmed });
        const created = response?.data || response;
        const id = created?.id || created?._id;
        if (id) {
          await this.$store.dispatch('packingTypes/addPackingType', { ...created, id });
        }
        this.$emit('created', trimmed);
        this.name = '';
        this.$emit('update:modelValue', false);
      } catch (e) {
        this.error = e?.response?.data?.message || e?.message || this.t('menuItemCreateGenericError');
      } finally {
        this.loading = false;
      }
    },
  },
};
</script>

<style scoped>
.cptd-card { background: #fff; border-radius: 20px; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,.15); }
.cptd-grad-header {
  display: flex; align-items: center; gap: 14px;
  padding: 20px 20px 18px;
  background: #ff3131;
}
.cptd-grad-header__icon {
  width: 40px; height: 40px; border-radius: 10px;
  background: rgba(255,255,255,.2);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.cptd-grad-header__text { flex: 1; }
.cptd-grad-header__title { font-size: 16px; font-weight: 700; color: #fff; }
.cptd-grad-header__sub { font-size: 12px; color: rgba(255,255,255,.75); margin-top: 2px; }
.cptd-close {
  background: rgba(255,255,255,.15); border: none; cursor: pointer;
  width: 32px; height: 32px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  color: #fff; transition: background .15s;
}
.cptd-close:hover { background: rgba(255,255,255,.25); }
.cptd-body { padding: 22px 22px 10px; }
.cptd-error {
  display: flex; align-items: center; gap: 7px;
  background: #fef2f2; border: 1px solid #fecaca; color: #991b1b;
  border-radius: 10px; padding: 10px 14px; font-size: 13px; margin-bottom: 16px;
}
.cptd-input {
  border: 1.5px solid #e5e7eb !important;
  border-radius: 11px !important;
  box-shadow: none !important;
  height: 52px;
  font-size: 14px;
}
.cptd-input:focus {
  border-color: #ff3131 !important;
  box-shadow: 0 0 0 3px rgba(255, 49, 49,.1) !important;
}
.cptd-foot { display: flex; justify-content: flex-end; gap: 10px; padding: 14px 22px 22px; }
.cptd-btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 0 20px; height: 40px; border-radius: 50px;
  font-size: 13.5px; font-weight: 600; cursor: pointer;
  border: none; transition: all .2s;
}
.cptd-btn--cancel { background: #f3f4f6; color: #374151; }
.cptd-btn--cancel:hover { background: #e5e7eb; }
.cptd-btn--primary { background: #ff3131; color: #fff; }
.cptd-btn--primary:hover { box-shadow: 0 4px 14px rgba(255, 49, 49,.4); transform: translateY(-1px); }
.cptd-btn:disabled { opacity: .6; cursor: not-allowed; transform: none !important; }
</style>
