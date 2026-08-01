<template>
  <Teleport to="body">
    <Transition name="sfd">
      <div v-if="localOpen" class="sfd-overlay" @mousedown.self="close">
        <div class="sfd-panel" :class="{ 'sfd--dark': isDark }">

          <!-- Hidden file input -->
          <v-file-input
            ref="pictureInput"
            v-model="imageFile"
            accept="image/*"
            prepend-icon=""
            density="compact"
            class="d-none"
            @update:model-value="onPictureSelected"
          />

          <!-- ── Header ── -->
          <div class="sfd__header">
            <div class="sfd__header-icon">
              <Pencil v-if="mode === 'edit'" :size="22" color="white" />
              <Truck v-else :size="22" color="white" />
            </div>
            <div class="sfd__header-titles">
              <div class="sfd__header-title">{{ drawerTitle }}</div>
              <div class="sfd__header-subtitle">{{ drawerSubtitle }}</div>
            </div>
            <button class="sfd__close-btn" :disabled="loading" @click="close">
              <X :size="18" />
            </button>
          </div>

          <!-- Error -->
          <div v-if="error" class="sfd__error">
            <AlertCircle :size="14" style="flex-shrink:0" class="me-2" />
            {{ error }}
          </div>

          <!-- ── Scrollable body ── -->
          <div class="sfd__body">

            <!-- Photo upload -->
            <div class="sfd-photo" @click="triggerPicturePicker">
              <div class="sfd-photo__zone" :class="{ 'sfd-photo__zone--filled': imagePreview }">
                <div v-if="imagePreview" class="sfd-photo__preview">
                  <img :src="imagePreview" alt="" class="sfd-photo__img" />
                  <div class="sfd-photo__overlay">
                    <Camera :size="26" color="white" />
                    <span>{{ t('clickToChange') }}</span>
                  </div>
                  <button class="sfd-photo__remove" @click.stop="clearPicture">
                    <X :size="13" color="#ff3131" />
                  </button>
                </div>
                <div v-else class="sfd-photo__placeholder">
                  <div class="sfd-photo__icon">
                    <ImagePlus :size="30" style="color:#ff3131" />
                  </div>
                  <span class="sfd-photo__label">{{ t('uploadPicture') }}</span>
                  <span class="sfd-photo__hint">{{ t('fileFormat') }}</span>
                </div>
              </div>
            </div>

            <!-- SECTION: Identité -->
            <div class="sfd-section">
              <div class="sfd-section__label">{{ t('sectionIdentity') }}</div>
              <div class="sfd-field-row mb-3">
                <label class="sfd-field-label" for="sfd-name">{{ t('supplierName') }} <span class="sfd-required">*</span></label>
                <input
                  id="sfd-name"
                  v-model="form.name"
                  type="text"
                  class="form-control sfd-input"
                />
              </div>
              <div class="sfd-field-row">
                <label class="sfd-field-label" for="sfd-contact">{{ t('contactName') }} <span class="sfd-required">*</span></label>
                <input
                  id="sfd-contact"
                  v-model="form.contactName"
                  type="text"
                  class="form-control sfd-input"
                />
              </div>
            </div>

            <!-- SECTION: Contact -->
            <div class="sfd-section">
              <div class="sfd-section__label">{{ t('supplierFormSectionContact') }}</div>
              <div class="row g-3">
                <div class="col-6">
                  <div class="sfd-field-row">
                    <label class="sfd-field-label" for="sfd-email">{{ t('email') }} <span class="sfd-required">*</span></label>
                    <input id="sfd-email" v-model="form.email" type="email" class="form-control sfd-input" />
                  </div>
                </div>
                <div class="col-6">
                  <div class="sfd-field-row">
                    <label class="sfd-field-label" for="sfd-phone">{{ t('phone') }} <span class="sfd-required">*</span></label>
                    <input id="sfd-phone" v-model="form.phone" type="tel" class="form-control sfd-input" />
                  </div>
                </div>
              </div>
            </div>

            <!-- SECTION: Localisation -->
            <div class="sfd-section">
              <div class="sfd-section__label">{{ t('supplierFormSectionLocation') }}</div>
              <div class="sfd-field-row mb-3">
                <label class="sfd-field-label" for="sfd-address">{{ t('address') }} <span class="sfd-required">*</span></label>
                <input id="sfd-address" v-model="form.address" type="text" class="form-control sfd-input" />
              </div>
              <div class="row g-3">
                <div class="col-7">
                  <div class="sfd-field-row">
                    <label class="sfd-field-label" for="sfd-city">{{ t('city') }} <span class="sfd-required">*</span></label>
                    <input id="sfd-city" v-model="form.city" type="text" class="form-control sfd-input" />
                  </div>
                </div>
                <div class="col-5">
                  <div class="sfd-field-row">
                    <label class="sfd-field-label" for="sfd-postcode">{{ t('postcode') }} <span class="sfd-required">*</span></label>
                    <input id="sfd-postcode" v-model="form.postcode" type="text" class="form-control sfd-input" />
                  </div>
                </div>
              </div>
            </div>

            <!-- SECTION: Sites -->
            <div class="sfd-section">
              <div class="sfd-section__header">
                <div class="sfd-section__label mb-0">
                  {{ t('sites') }} <span class="sfd-required">*</span>
                  <span class="sfd-site-count">({{ form.spaceIds.length }}/{{ sites.length }})</span>
                </div>
                <button v-if="sites.length > 0" class="sfd-toggle-all" @click="toggleAllSpaces">
                  {{ isAllSpacesChecked ? t('unselectAll') : t('selectAll') }}
                </button>
              </div>
              <div class="sfd-pill-grid">
                <div
                  v-for="space in sites"
                  :key="space.id"
                  class="sfd-space-pill"
                  :class="{ 'sfd-space-pill--active': form.spaceIds.includes(space.id) }"
                  @click="toggleSpace(space.id)"
                >
                  <Check :size="12" class="sfd-space-pill__check" />
                  {{ space.name }}
                </div>
              </div>
            </div>

            <!-- SECTION: Notes -->
            <div class="sfd-section">
              <div class="sfd-section__label">{{ t('notes') }}</div>
              <textarea
                v-model="form.notes"
                class="form-control sfd-textarea"
                :placeholder="t('addNotes')"
                rows="3"
              ></textarea>
            </div>

          </div>

          <!-- ── Footer ── -->
          <div class="sfd__footer">
            <button class="sfd-btn sfd-btn--cancel" :disabled="loading" @click="close">
              {{ t('cancel') }}
            </button>
            <button
              class="sfd-btn sfd-btn--save"
              :disabled="!form.name.trim() || loading"
              @click="submit"
            >
              <span v-if="loading" class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
              <Save v-if="mode === 'edit'" :size="15" class="me-1" />
              <Check v-else :size="15" class="me-1" />
              {{ submitLabel }}
            </button>
          </div>

        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script>
import { AlertCircle, Camera, Check, ImagePlus, Pencil, Save, Truck, X } from "lucide-vue-next";
import { createSupplier, updateSupplier } from "@/api/endpoints/menu.api";
import { useI18n } from "@/i18n/useI18n";
import { getSupplierPhone, getSupplierPicture, getSupplierSiteIds } from "@/utils/supplierHelpers";

const EMPTY_FORM = () => ({
  name: "",
  email: "",
  phone: "",
  address: "",
  city: "",
  postcode: "",
  picture: "",
  contactName: "",
  spaceIds: [],
  configurationIds: [],
  sectors: [],
  notes: "",
});

export default {
  name: "SupplierFormDrawer",
  components: { AlertCircle, Camera, Check, ImagePlus, Pencil, Save, Truck, X },
  props: {
    modelValue: { type: Boolean, default: false },
    mode: { type: String, default: "create" },
    initialSupplier: { type: Object, default: null },
    isDark: { type: Boolean, default: false },
  },
  emits: ["update:modelValue", "saved"],
  setup() {
    const { t, locale } = useI18n();
    return { t, locale };
  },
  data() {
    return {
      localOpen: false,
      loading: false,
      error: "",
      imageFile: null,
      imagePreview: "",
      supplierId: null,
      form: EMPTY_FORM(),
    };
  },
  computed: {
    sites() {
      return this.$store.getters["spaces/spaces"] || [];
    },
    allSiteIds() {
      return this.sites.map((s) => s.id);
    },
    isAllSpacesChecked() {
      const all = this.allSiteIds;
      const current = this.form.spaceIds || [];
      return all.length > 0 && current.length === all.length && all.every((id) => current.includes(id));
    },
    drawerTitle() {
      return this.mode === "edit" ? this.t("editSupplierTitle") : this.t("addSupplierTitle");
    },
    drawerSubtitle() {
      return this.mode === "edit" ? this.t("supplierFormEditSubtitle") : this.t("supplierFormAddSubtitle");
    },
    submitLabel() {
      return this.mode === "edit" ? this.t("saveChanges") : this.t("create");
    },
  },
  watch: {
    modelValue(newVal) {
      this.localOpen = newVal;
      if (newVal) this.initForm();
    },
  },
  methods: {
    initForm() {
      this.error = "";
      this.clearPicture();
      if (this.mode === "edit" && this.initialSupplier) {
        const supplier = this.initialSupplier;
        const spaceIds = getSupplierSiteIds(supplier);
        const picture = getSupplierPicture(supplier);
        this.imagePreview = picture || "";
        this.supplierId = supplier?.id || supplier?._id || null;
        this.form = {
          name: supplier?.name || "",
          email: supplier?.email || "",
          phone: getSupplierPhone(supplier),
          address: supplier?.address || "",
          city: supplier?.city || "",
          postcode: supplier?.postcode || "",
          picture: picture || "",
          contactName: supplier?.contactName || "",
          spaceIds,
          configurationIds: Array.isArray(supplier?.configurationIds) ? supplier.configurationIds : [],
          sectors: Array.isArray(supplier?.sectors) ? supplier.sectors : [],
          notes: supplier?.notes || "",
        };
      } else {
        this.supplierId = null;
        this.form = { ...EMPTY_FORM(), spaceIds: [...this.allSiteIds] };
      }
    },
    clearPicture() {
      if (this.imagePreview && String(this.imagePreview).startsWith("blob:")) {
        URL.revokeObjectURL(this.imagePreview);
      }
      this.imagePreview = "";
      this.imageFile = null;
      this.form = { ...this.form, picture: "" };
    },
    triggerPicturePicker() {
      const input = this.$refs?.pictureInput?.$el?.querySelector('input[type="file"]');
      if (input) input.click();
    },
    async onPictureSelected(value) {
      this.clearPicture();
      const file = Array.isArray(value) ? value[0] || null : value instanceof Blob ? value : null;
      if (!file) return;
      this.imageFile = file;
      this.imagePreview = URL.createObjectURL(file);
      try {
        const base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ""));
          reader.onerror = () => reject(new Error("FileReader error"));
          reader.readAsDataURL(file);
        });
        this.form = { ...this.form, picture: base64 };
      } catch {
        this.form = { ...this.form, picture: "" };
      }
    },
    toggleSpace(siteId) {
      const current = this.form.spaceIds || [];
      const next = current.includes(siteId) ? current.filter((id) => id !== siteId) : [...current, siteId];
      this.form = { ...this.form, spaceIds: next };
    },
    toggleAllSpaces() {
      this.form = { ...this.form, spaceIds: this.isAllSpacesChecked ? [] : [...this.allSiteIds] };
    },
    close() {
      this.localOpen = false;
      this.$emit("update:modelValue", false);
      this.error = "";
      this.loading = false;
    },
    async submit() {
      const required = [
        { key: 'name',        label: this.t('supplierName') },
        { key: 'contactName', label: this.t('contactName') },
        { key: 'email',       label: this.t('email') },
        { key: 'phone',       label: this.t('phone') },
        { key: 'address',     label: this.t('address') },
        { key: 'city',        label: this.t('city') },
        { key: 'postcode',    label: this.t('postcode') },
      ];
      for (const field of required) {
        if (!String(this.form[field.key] || '').trim()) {
          this.error = `${field.label} — ${this.t('required')}`;
          return;
        }
      }
      if (!this.form.spaceIds.length) {
        this.error = this.t('supplierFormSelectAtLeastOneSite');
        return;
      }
      this.loading = true;
      this.error = "";
      try {
        const payload = {
          name: this.form.name,
          email: this.form.email,
          phone: this.form.phone,
          address: this.form.address,
          city: this.form.city,
          postcode: this.form.postcode,
          picture: this.form.picture,
          contactName: this.form.contactName,
          spaceIds: this.form.spaceIds,
          configurationIds: this.form.configurationIds,
          sectors: this.form.sectors,
          notes: this.form.notes,
        };
        if (this.mode === "edit") {
          if (!this.supplierId) throw new Error("Missing supplier id");
          const updated = await updateSupplier(this.supplierId, payload);
          this.$store.dispatch("suppliers/updateSupplier", updated?.data ?? updated);
        } else {
          const created = await createSupplier(payload);
          this.$store.dispatch("suppliers/addSupplier", created?.data ?? created);
        }
        this.$emit("saved");
        this.close();
      } catch (e) {
        this.error = e?.response?.data?.message || e?.message || "Failed to save supplier";
      } finally {
        this.loading = false;
      }
    },
  },
};
</script>

<style scoped>
/* ── Overlay & Panel ── */
.sfd-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.38);
  display: flex;
  justify-content: flex-end;
}

.sfd-panel {
  width: 560px;
  height: 100%;
  background: #fff;
  display: flex;
  flex-direction: column;
  box-shadow: -8px 0 40px rgba(0, 0, 0, 0.14);
  overflow: hidden;
}
.sfd-panel.sfd--dark { background: #0f172a; }

/* ── Transitions ── */
.sfd-enter-active, .sfd-leave-active { transition: opacity .25s ease; }
.sfd-enter-active .sfd-panel,
.sfd-leave-active .sfd-panel { transition: transform .28s cubic-bezier(.4,0,.2,1); }
.sfd-enter-from { opacity: 0; }
.sfd-enter-from .sfd-panel { transform: translateX(100%); }
.sfd-leave-to { opacity: 0; }
.sfd-leave-to .sfd-panel { transform: translateX(100%); }

/* ── Header ── */
.sfd__header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 20px 24px;
  background: #ff3131;
  flex-shrink: 0;
}
.sfd__header-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: rgba(255,255,255,.2);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.sfd__header-titles { flex: 1; min-width: 0; }
.sfd__header-title {
  font-size: 15px;
  font-weight: 700;
  color: #fff;
  line-height: 1.2;
}
.sfd__header-subtitle {
  font-size: 12px;
  color: rgba(255,255,255,.72);
  margin-top: 3px;
}
.sfd__close-btn {
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
  flex-shrink: 0;
}
.sfd__close-btn:hover:not(:disabled) { background: rgba(255,255,255,.3); }
.sfd__close-btn:disabled { opacity: .4; cursor: not-allowed; }

/* ── Error ── */
.sfd__error {
  display: flex;
  align-items: center;
  padding: 10px 24px;
  background: #fef2f2;
  border-bottom: 1px solid #fecaca;
  font-size: 13px;
  color: #ff3131;
  flex-shrink: 0;
}

/* ── Body ── */
.sfd__body {
  flex: 1 1 0;
  min-height: 0;
  overflow-y: auto;
  padding: 0 24px 24px;
  display: flex;
  flex-direction: column;
  gap: 22px;
  scrollbar-width: thin;
  scrollbar-color: #e5e7eb transparent;
}
.sfd__body::-webkit-scrollbar { width: 4px; }
.sfd__body::-webkit-scrollbar-thumb { background: #e5e7eb; border-radius: 4px; }

/* ── Photo upload ── */
.sfd-photo {
  margin-top: 20px;
  cursor: pointer;
}
.sfd-photo__zone {
  border: 2px dashed #e5e7eb;
  border-radius: 14px;
  min-height: 130px;
  background: #fafafa;
  overflow: hidden;
  position: relative;
  transition: border-color .2s, background .2s;
}
.sfd-photo__zone:hover {
  border-color: #ff3131;
  background: #fff5f5;
}
.sfd-photo__zone--filled {
  border-style: solid;
  border-color: #e5e7eb;
  background: #fff;
  min-height: 160px;
}
.sfd-photo__placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 28px 16px;
  gap: 6px;
}
.sfd-photo__icon {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background: linear-gradient(135deg, #fef2f2, #fee2e2);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 4px;
}
.sfd-photo__label {
  font-size: 13px;
  font-weight: 600;
  color: #374151;
}
.sfd-photo__hint {
  font-size: 11.5px;
  color: #9ca3af;
}
.sfd-photo__preview {
  position: relative;
  width: 100%;
  height: 160px;
}
.sfd-photo__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.sfd-photo__overlay {
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,.55);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  opacity: 0;
  transition: opacity .25s;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
}
.sfd-photo__zone:hover .sfd-photo__overlay { opacity: 1; }
.sfd-photo__remove {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 8px;
  background: rgba(255,255,255,.9);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0,0,0,.2);
  z-index: 1;
}

/* ── Section ── */
.sfd-section__label {
  font-size: 10.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .9px;
  color: #9ca3af;
  margin-bottom: 12px;
}
.sfd-section__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.sfd-site-count {
  font-size: 11px;
  font-weight: 500;
  color: #9ca3af;
  text-transform: none;
  letter-spacing: 0;
  margin-left: 4px;
}
.sfd-toggle-all {
  background: none;
  border: none;
  font-size: 12px;
  font-weight: 600;
  color: #ff3131;
  cursor: pointer;
  padding: 0;
}
.sfd-toggle-all:hover { text-decoration: underline; }

/* ── Bootstrap inputs ── */
.sfd-input.form-control {
  border-radius: 11px;
  border: 1.5px solid #e5e7eb;
  font-size: 13.5px;
  color: #111827;
  padding: .65rem .8rem;
  height: auto;
  min-height: auto;
  line-height: 1.4;
  background: #fafafa;
  transition: border-color .2s, box-shadow .2s;
}
.sfd-input.form-control:focus {
  border-color: #ff3131;
  box-shadow: 0 0 0 3px rgba(255, 49, 49,.1);
  background: #fff;
}

.sfd-field-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}
.sfd-field-label {
  font-size: 12.5px;
  font-weight: 600;
  color: #374151;
}
.sfd-required { color: #ff3131; }

/* ── Sites pills ── */
.sfd-pill-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.sfd-space-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 13px;
  border-radius: 100px;
  border: 1.5px solid #e5e7eb;
  background: #f9fafb;
  font-size: 13px;
  font-weight: 500;
  color: #6b7280;
  cursor: pointer;
  user-select: none;
  transition: all .18s;
}
.sfd-space-pill:hover {
  border-color: #ff3131;
  color: #ff3131;
  background: #fff5f5;
}
.sfd-space-pill--active {
  border-color: #ff3131;
  background: #fef2f2;
  color: #ff3131;
  font-weight: 600;
  box-shadow: 0 0 0 2px rgba(255, 49, 49,.1);
}
.sfd-space-pill__check {
  opacity: 0;
  transition: opacity .15s;
  font-size: 12px;
}
.sfd-space-pill--active .sfd-space-pill__check { opacity: 1; }

/* ── Textarea ── */
.sfd-textarea.form-control {
  border-radius: 11px;
  border: 1.5px solid #e5e7eb;
  font-size: 13.5px;
  color: #111827;
  background: #fafafa;
  resize: vertical;
  transition: border-color .2s, box-shadow .2s;
}
.sfd-textarea.form-control:focus {
  border-color: #ff3131;
  box-shadow: 0 0 0 3px rgba(255, 49, 49,.1);
  background: #fff;
  outline: none;
}
.sfd-textarea.form-control::placeholder { color: #9ca3af; }

/* ── Footer ── */
.sfd__footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 24px;
  border-top: 1px solid #f0f0f0;
  background: #fafafa;
  flex-shrink: 0;
}
.sfd--dark .sfd__footer {
  border-top-color: rgba(255,255,255,.08);
  background: #1e293b;
}

.sfd-btn {
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
.sfd-btn:disabled { opacity: .45; cursor: not-allowed; transform: none !important; box-shadow: none !important; }

.sfd-btn--cancel {
  background: transparent;
  border: 1.5px solid #e5e7eb;
  color: #6b7280;
}
.sfd-btn--cancel:hover:not(:disabled) {
  border-color: #9ca3af;
  background: #f3f4f6;
  color: #374151;
}

.sfd-btn--save {
  background: #ff3131;
  color: #fff;
  box-shadow: 0 4px 14px rgba(255, 49, 49,.3);
}
.sfd-btn--save:hover:not(:disabled) {
  box-shadow: 0 6px 20px rgba(255, 49, 49,.4);
  transform: translateY(-1px);
}

/* ── Dark mode ── */
.sfd--dark .sfd-photo__zone {
  background: #1e293b;
  border-color: rgba(255,255,255,.15);
}
.sfd--dark .sfd-photo__zone:hover {
  border-color: #ff3131;
  background: rgba(255, 49, 49,.08);
}
.sfd--dark .sfd-photo__label { color: rgba(255,255,255,.87); }
.sfd--dark .sfd-photo__hint { color: rgba(255,255,255,.4); }

.sfd--dark .sfd-section__label { color: #64748b; }

.sfd--dark .sfd-input.form-control {
  background: #1e293b;
  border-color: rgba(255,255,255,.12);
  color: rgba(255,255,255,.87);
}
.sfd--dark .sfd-input.form-control:focus {
  background: #263548;
  border-color: #ff3131;
}
.sfd--dark .sfd-field-label { color: #cbd5e1; }

.sfd--dark .sfd-space-pill {
  background: #1e293b;
  border-color: rgba(255,255,255,.12);
  color: rgba(255,255,255,.55);
}
.sfd--dark .sfd-space-pill:hover {
  border-color: #ff3131;
  color: #e84444;
  background: rgba(255, 49, 49,.1);
}
.sfd--dark .sfd-space-pill--active {
  background: rgba(255, 49, 49,.15);
  border-color: #ff3131;
  color: #e84444;
}

.sfd--dark .sfd-textarea.form-control {
  background: #1e293b;
  border-color: rgba(255,255,255,.12);
  color: rgba(255,255,255,.87);
}
.sfd--dark .sfd-textarea.form-control:focus { background: #263548; border-color: #ff3131; }
.sfd--dark .sfd-textarea.form-control::placeholder { color: rgba(255,255,255,.25); }

.sfd--dark .sfd__body::-webkit-scrollbar-thumb { background: rgba(255,255,255,.1); }
</style>
