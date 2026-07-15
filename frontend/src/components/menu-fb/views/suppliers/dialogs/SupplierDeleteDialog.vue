<template>
  <v-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    max-width="420"
  >
    <div class="sdd">

      <!-- Header -->
      <div class="sdd__header">
        <button class="sdd__close" @click="close">
          <X :size="18" />
        </button>
        <div class="sdd__warning-icon">
          <Trash2 :size="34" color="white" />
        </div>
        <h3 class="sdd__title">{{ t('deleteSupplierTitle') }}</h3>
        <p class="sdd__message">
          {{ t('deleteConfirm') }} <strong>"{{ supplierName }}"</strong> ?
          <br />
          <span class="sdd__irreversible">
            {{ locale === 'fr' ? 'Cette action est irréversible.' : 'This action cannot be undone.' }}
          </span>
        </p>
      </div>

      <!-- Error -->
      <div v-if="error" class="sdd__error">
        <AlertCircle :size="14" class="me-2" style="flex-shrink:0" />
        {{ error }}
      </div>

      <!-- Footer -->
      <div class="sdd__footer">
        <button class="sdd-btn sdd-btn--cancel" :disabled="loading" @click="close">
          {{ t('cancel') }}
        </button>
        <button class="sdd-btn sdd-btn--delete" :disabled="loading" @click="confirm">
          <span v-if="loading" class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
          <Trash2 v-else :size="15" class="me-1" />
          {{ t('delete') }}
        </button>
      </div>

    </div>
  </v-dialog>
</template>

<script>
import { AlertCircle, Trash2, X } from "lucide-vue-next";
import { deleteSupplier } from "@/api/endpoints/menu.api";

export default {
  name: "SupplierDeleteDialog",
  components: { AlertCircle, Trash2, X },
  props: {
    modelValue: { type: Boolean, default: false },
    supplierName: { type: String, default: "" },
    supplierId: { type: [String, Number], default: null },
    isDark: { type: Boolean, default: false },
  },
  emits: ["update:modelValue", "deleted"],
  data() {
    return {
      loading: false,
      error: "",
      locale: localStorage.getItem("appLocale") || "en",
      translations: {
        en: {
          deleteSupplierTitle: "Delete supplier",
          deleteConfirm: "Are you sure you want to delete",
          cancel: "Cancel",
          delete: "Delete",
        },
        fr: {
          deleteSupplierTitle: "Supprimer le fournisseur",
          deleteConfirm: "Êtes-vous sûr de vouloir supprimer",
          cancel: "Annuler",
          delete: "Supprimer",
        },
      },
    };
  },
  methods: {
    t(key) { return this.translations[this.locale]?.[key] || key; },
    handleLocaleChange(event) { this.locale = event.detail?.locale || "en"; },
    close() {
      this.error = "";
      this.loading = false;
      this.$emit("update:modelValue", false);
    },
    async confirm() {
      if (!this.supplierId) { this.error = "Missing supplier id"; return; }
      this.loading = true;
      this.error = "";
      try {
        await deleteSupplier(this.supplierId);
        this.$store.dispatch("suppliers/removeSupplier", this.supplierId);
        this.$emit("deleted");
        this.close();
      } catch (e) {
        this.error = e?.response?.data?.message || e?.message || "Failed to delete supplier";
      } finally {
        this.loading = false;
      }
    },
  },
  mounted() { window.addEventListener("locale-changed", this.handleLocaleChange); },
  beforeUnmount() { window.removeEventListener("locale-changed", this.handleLocaleChange); },
};
</script>

<style scoped>
.sdd {
  background: #fff;
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 0 24px 60px rgba(0,0,0,.15);
}

.sdd__header {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 36px 28px 24px;
  text-align: center;
  position: relative;
  background: linear-gradient(180deg, #fff5f5 0%, #fff 100%);
}

.sdd__close {
  position: absolute;
  top: 14px;
  right: 14px;
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #9ca3af;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background .18s, color .18s;
}
.sdd__close:hover { background: #f3f4f6; color: #374151; }

.sdd__warning-icon {
  width: 68px;
  height: 68px;
  border-radius: 20px;
  background: linear-gradient(135deg, #ff3131, #b91c1c);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 18px;
  box-shadow: 0 8px 24px rgba(255, 49, 49,.3);
}

.sdd__title {
  font-size: 17px;
  font-weight: 800;
  color: #111827;
  margin: 0 0 12px;
}

.sdd__message {
  font-size: 14px;
  color: #4b5563;
  line-height: 1.6;
  margin: 0;
}
.sdd__message strong { color: #111827; }

.sdd__irreversible {
  font-size: 12.5px;
  color: #9ca3af;
}

.sdd__error {
  display: flex;
  align-items: center;
  padding: 10px 24px;
  background: #fef2f2;
  border-top: 1px solid #fecaca;
  border-bottom: 1px solid #fecaca;
  font-size: 13px;
  color: #ff3131;
}

.sdd__footer {
  display: flex;
  justify-content: center;
  gap: 10px;
  padding: 20px 24px;
  background: #fafafa;
  border-top: 1px solid #f0f0f0;
}

.sdd-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 10px 26px;
  border-radius: 100px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all .2s;
  border: none;
  line-height: 1.4;
  min-width: 120px;
}
.sdd-btn:disabled { opacity: .45; cursor: not-allowed; transform: none !important; }

.sdd-btn--cancel {
  background: transparent;
  border: 1.5px solid #e5e7eb;
  color: #6b7280;
}
.sdd-btn--cancel:hover:not(:disabled) {
  background: #f3f4f6;
  border-color: #9ca3af;
  color: #374151;
}

.sdd-btn--delete {
  background: #ff3131;
  color: #fff;
  box-shadow: 0 4px 14px rgba(255, 49, 49,.3);
}
.sdd-btn--delete:hover:not(:disabled) {
  box-shadow: 0 6px 20px rgba(255, 49, 49,.42);
  transform: translateY(-1px);
}
</style>
