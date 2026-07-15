<template>
  <v-dialog :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)" max-width="420">
    <div class="mpdsd">
      <!-- Header -->
      <div class="mpdsd__header">
        <button class="mpdsd__close" @click="close"><X :size="18" /></button>
        <div class="mpdsd__warning-icon"><Trash2 :size="34" color="white" /></div>
        <h3 class="mpdsd__title">Delete Supplier Entry</h3>
        <p class="mpdsd__message">
          Are you sure you want to delete <strong>"{{ targetRow?.supplierName || '-' }}"</strong> from <strong>"{{ itemName || '-' }}"</strong>?
          <br /><span class="mpdsd__irreversible">This action cannot be undone.</span>
        </p>
      </div>
      <!-- Error -->
      <div v-if="error" class="mpdsd__error">
        <AlertCircle :size="14" class="me-2" style="flex-shrink:0" />{{ error }}
      </div>
      <!-- Footer -->
      <div class="mpdsd__footer">
        <button class="mpdsd-btn mpdsd-btn--cancel" :disabled="loading" @click="close">Cancel</button>
        <button class="mpdsd-btn mpdsd-btn--delete" :disabled="loading" @click="confirm">
          <span v-if="loading" class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
          <Trash2 v-else :size="15" class="me-1" />
          Delete
        </button>
      </div>
    </div>
  </v-dialog>
</template>

<script>
import { AlertCircle, Trash2, X } from 'lucide-vue-next';
import { deleteMarketPrice } from '@/api/endpoints/menu.api';

export default {
  name: 'MarketPriceDeleteSupplierDialog',
  components: { AlertCircle, Trash2, X },
  props: {
    modelValue: { type: Boolean, default: false },
    // The supplier row object (must have id or _id, and supplierName)
    targetRow: { type: Object, default: null },
    itemName: { type: String, default: '' },
    isDark: { type: Boolean, default: false },
  },
  emits: ['update:modelValue', 'deleted'],
  data() {
    return {
      loading: false,
      error: '',
    };
  },
  watch: {
    modelValue(val) {
      if (val) {
        this.loading = false;
        this.error = '';
      }
    },
  },
  methods: {
    close() {
      this.$emit('update:modelValue', false);
    },
    async confirm() {
      this.loading = true;
      this.error = '';
      try {
        const id = this.targetRow?.id || this.targetRow?._id;
        if (!id) {
          this.error = 'Missing supplier item id';
          return;
        }
        await deleteMarketPrice(id);
        this.$store.dispatch('marketPriceIngredients/invalidate');
        this.$emit('deleted');
        this.close();
      } catch (e) {
        this.error = e?.response?.data?.message || e?.message || 'Failed to delete supplier item';
      } finally {
        this.loading = false;
      }
    },
  },
};
</script>

<style scoped>
.mpdsd {
  background: #fff;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0,0,0,.18);
}

.mpdsd__header {
  background: #ff3131;
  padding: 32px 28px 28px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  position: relative;
}

.mpdsd__close {
  position: absolute;
  top: 14px;
  right: 14px;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: rgba(255,255,255,.18);
  color: rgba(255,255,255,.85);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background .18s;
}
.mpdsd__close:hover { background: rgba(255,255,255,.3); }

.mpdsd__warning-icon {
  width: 68px;
  height: 68px;
  border-radius: 16px;
  background: rgba(255,255,255,.2);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16px;
}

.mpdsd__title {
  font-size: 18px;
  font-weight: 700;
  color: #fff;
  margin: 0 0 10px;
}

.mpdsd__message {
  font-size: 14px;
  color: rgba(255,255,255,.85);
  margin: 0;
  line-height: 1.5;
}

.mpdsd__message strong {
  color: #fff;
  font-weight: 700;
}

.mpdsd__irreversible {
  font-size: 12px;
  color: rgba(255,255,255,.65);
  margin-top: 6px;
  display: inline-block;
}

.mpdsd__error {
  display: flex;
  align-items: center;
  padding: 10px 20px;
  background: #fef2f2;
  border-bottom: 1px solid #fecaca;
  font-size: 13px;
  color: #ff3131;
}

.mpdsd__footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding: 20px 24px;
  background: #fafafa;
  border-top: 1px solid #f0f0f0;
}

.mpdsd-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 10px 24px;
  border-radius: 100px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all .2s;
  border: none;
  line-height: 1.4;
}
.mpdsd-btn:disabled { opacity: .45; cursor: not-allowed; }

.mpdsd-btn--cancel {
  background: transparent;
  border: 1.5px solid #e5e7eb;
  color: #6b7280;
}
.mpdsd-btn--cancel:hover:not(:disabled) {
  border-color: #9ca3af;
  background: #f3f4f6;
  color: #374151;
}

.mpdsd-btn--delete {
  background: #ff3131;
  color: #fff;
  box-shadow: 0 4px 14px rgba(255, 49, 49,.3);
}
.mpdsd-btn--delete:hover:not(:disabled) {
  box-shadow: 0 6px 20px rgba(255, 49, 49,.4);
  transform: translateY(-1px);
}
</style>
