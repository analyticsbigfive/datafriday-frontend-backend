<template>
  <Teleport to="body">
    <Transition name="smed-drawer">
      <div v-if="modelValue" class="smed-overlay" @click.self="$emit('update:modelValue', false)">
        <div class="smed-panel" :class="{ 'smed-panel--dark': isDark }">

          <!-- Gradient Header -->
          <div class="smed-header">
            <div class="smed-header__icon">
              <Store :size="22" color="white" />
            </div>
            <div class="smed-header__titles">
              <div class="smed-header__title">{{ t("spaceMenu.editShop") }}</div>
              <div class="smed-header__sub">{{ form ? form.name : '' }}</div>
            </div>
            <button class="smed-close-btn" @click="$emit('update:modelValue', false)">
              <X :size="18" />
            </button>
          </div>

          <!-- Body -->
          <div class="smed-body">
            <template v-if="form">

              <!-- Section: Image -->
              <div class="smed-section">
                <div class="smed-section__label">
                  <ImageIcon :size="13" style="color:#ff3131" class="me-1" />
                  {{ t("spaceMenu.shopImage") }}
                </div>
                <div
                  class="smed-upload-zone"
                  :class="{ 'smed-upload-zone--has-image': form.image }"
                  @click="triggerImageUpload"
                >
                  <div v-if="form.image" class="smed-upload-preview">
                    <img :src="form.image" />
                    <div class="smed-upload-preview__overlay">
                      <Camera :size="28" color="white" />
                      <span>{{ t("spaceMenu.clickToChange") }}</span>
                    </div>
                  </div>
                  <div v-else class="smed-upload-placeholder">
                    <div class="smed-upload-icon-circle">
                      <ImagePlus :size="32" style="color:#ff3131" />
                    </div>
                    <p class="smed-upload-placeholder__title">{{ t("spaceMenu.uploadShopImage") }}</p>
                    <p class="smed-upload-placeholder__sub">{{ t("spaceMenu.clickToBrowseOrDrag") }}</p>
                  </div>
                </div>
                <input ref="imageInput" type="file" accept="image/*" style="display:none;" @change="handleImageUpload" />
              </div>

              <!-- Section: Types -->
              <div class="smed-section">
                <div class="smed-section__label">
                  <Tags :size="13" style="color:#ff3131" />
                  {{ t("spaceMenu.shopTypes") }}
                  <span class="smed-section__count">{{ form.selectedTypes?.length || 0 }} {{ t("spaceMenu.selected") }}</span>
                </div>
                <div class="smed-types-grid">
                  <label
                    v-for="type in shopTypes"
                    :key="type.value"
                    class="smed-type-pill"
                    :class="{ 'smed-type-pill--active': form.selectedTypes?.includes(type.value) }"
                  >
                    <input
                      type="checkbox"
                      :value="type.value"
                      :checked="form.selectedTypes?.includes(type.value)"
                      class="visually-hidden"
                      @change="toggleShopType(type.value)"
                    />
                    <span class="smed-type-pill__icon">
                      <component :is="type.iconComponent" :size="14" />
                    </span>
                    {{ t(type.labelKey) }}
                  </label>
                </div>
              </div>

              <!-- Section: Configuration (non-editable) -->
              <div class="smed-section">
                <div class="smed-section__label">
                  <Settings :size="13" style="color:#ff3131" />
                  {{ t("spaceMenu.configuration") }}
                </div>
                <div v-if="selectedConfigId" class="smed-config-card">
                  <div class="smed-config-card__icon">
                    <CheckCircle :size="18" style="color:#ff3131" />
                  </div>
                  <div class="smed-config-card__info">
                    <div class="smed-config-card__name">{{ currentConfigName }}</div>
                    <div class="smed-config-card__sub">{{ t("spaceMenu.activeConfiguration") }}</div>
                  </div>
                  <span class="smed-active-badge">{{ t("spaceMenu.active") }}</span>
                </div>
                <div v-else class="smed-config-empty">
                  <AlertCircle :size="24" style="color:#9ca3af" />
                  <p>{{ t("spaceMenu.noConfigurationSelected") }}</p>
                </div>
              </div>

              <!-- Save error -->
              <div v-if="saveError" class="smed-error">
                <AlertCircle :size="14" /> {{ saveError }}
              </div>

            </template>
          </div>

          <!-- Footer -->
          <div class="smed-footer">
            <button class="smed-btn smed-btn--ghost" @click="$emit('update:modelValue', false)">
              <X :size="14" /> {{ t("cancel") }}
            </button>
            <button class="smed-btn smed-btn--primary" :disabled="saving" @click="save">
              <span v-if="saving" class="smed-spinner"></span>
              <Save v-else :size="14" />
              {{ t("saveChanges") }}
            </button>
          </div>

        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script>
import { useI18n } from "@/i18n/useI18n";
import { Store, X, Save, Settings, CheckCircle, AlertCircle, Image as ImageIcon, Camera, ImagePlus, Tags, Utensils, Coffee, Beer, Package, Clock } from 'lucide-vue-next';
import { updateSpaceElement } from '@/api/endpoints/space.api'

export default {
  name: 'SpaceMenuEditShopDrawer',
  components: { Store, X, Save, Settings, CheckCircle, AlertCircle, ImageIcon, Camera, ImagePlus, Tags, Utensils, Coffee, Beer, Package, Clock },
  setup() {
    const { t } = useI18n();
    return { t };
  },
  props: {
    modelValue: { type: Boolean, default: false },
    shop: { type: Object, default: null },
    isDark: { type: Boolean, default: false },
    selectedConfigId: { type: String, default: '' },
    configOptions: { type: Array, default: () => [] },
  },
  emits: ['update:modelValue', 'saved'],
  beforeUnmount() {
    document.body.style.overflow = '';
  },
  data() {
    return {
      form: null,
      saving: false,
      saveError: '',
      shopTypes: [
        { value: 'food',       labelKey: 'food',                       iconComponent: 'Utensils' },
        { value: 'beverages',  labelKey: 'beverage',                   iconComponent: 'Coffee' },
        { value: 'beer',       labelKey: 'spaceMenu.shopTypeBeer',      iconComponent: 'Beer' },
        { value: 'gp_premium', labelKey: 'spaceMenu.shopTypeGpPremium', iconComponent: 'Package' },
        { value: 'temporary',  labelKey: 'spaceMenu.shopTypeTemporary', iconComponent: 'Clock' },
        { value: 'drinkee',    labelKey: 'spaceMenu.shopTypeDrinkee',   iconComponent: 'Coffee' },
      ],
    };
  },
  watch: {
    modelValue(isOpen) {
      document.body.style.overflow = isOpen ? 'hidden' : '';
      if (isOpen && this.shop) {
        this.form = { ...this.shop, selectedTypes: this.shop.selectedTypes || ['food', 'beverages'] };
      } else if (!isOpen) {
        setTimeout(() => { this.form = null; }, 300);
      }
    },
  },
  computed: {
    currentConfigName() {
      const config = (this.configOptions || []).find(c => c.id === this.selectedConfigId);
      return config ? config.name : this.t('spaceMenu.unknownConfiguration');
    },
  },
  methods: {
    triggerImageUpload() { this.$refs.imageInput.click(); },
    handleImageUpload(event) {
      const file = event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => { this.form.image = e.target.result; };
      reader.readAsDataURL(file);
    },
    toggleShopType(typeValue) {
      if (!this.form.selectedTypes) this.form.selectedTypes = [];
      const index = this.form.selectedTypes.indexOf(typeValue);
      if (index > -1) this.form.selectedTypes.splice(index, 1);
      else this.form.selectedTypes.push(typeValue);
    },
    async save() {
      if (!this.shop?.id || !this.form) return;
      this.saving = true;
      this.saveError = '';
      try {
        const updated = await updateSpaceElement(this.shop.id, {
          image:         this.form.image,
          selectedTypes: this.form.selectedTypes,
        });
        this.$emit('saved', { ...this.form, ...(updated || {}), image: this.form.image, selectedTypes: [...(this.form.selectedTypes || [])] });
        this.$emit('update:modelValue', false);
      } catch (e) {
        this.saveError = e?.response?.data?.message || e?.message || 'Failed to save shop';
      } finally {
        this.saving = false;
      }
    },
  },
};
</script>

<style scoped>
/* ── Overlay ── */
.smed-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,.45); z-index: 2000;
  display: flex; justify-content: flex-end;
}

/* ── Panel ── */
.smed-panel {
  width: 520px; height: 100%;
  display: flex; flex-direction: column;
  background: #fff; box-shadow: -8px 0 32px rgba(0,0,0,.12);
}

/* ── Gradient Header ── */
.smed-header {
  flex-shrink: 0;
  background: #ff3131;
  padding: 20px 20px 20px;
  display: flex; align-items: center; gap: 14px;
}
.smed-header__icon {
  width: 44px; height: 44px; border-radius: 12px;
  background: rgba(255,255,255,.2);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.smed-header__titles { flex: 1; min-width: 0; }
.smed-header__title { font-size: 16px; font-weight: 700; color: #fff; line-height: 1.2; }
.smed-header__sub { font-size: 12px; color: rgba(255,255,255,.75); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.smed-close-btn {
  background: rgba(255,255,255,.15); border: none; cursor: pointer;
  width: 32px; height: 32px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center; color: #fff;
  flex-shrink: 0; transition: background .2s;
}
.smed-close-btn:hover { background: rgba(255,255,255,.25); }

/* ── Body ── */
.smed-body {
  flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden;
  background: #f9fafb;
}

/* ── Sections ── */
.smed-section {
  padding: 20px 20px;
  border-bottom: 1px solid #e5e7eb;
  background: #fff;
  margin-bottom: 8px;
}
.smed-section:last-child { margin-bottom: 0; border-bottom: none; }
.smed-section__label {
  display: flex; align-items: center; gap: 6px;
  font-size: 11px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .05em; color: #6b7280; margin-bottom: 14px;
}
.smed-section__count {
  background: rgba(255, 49, 49,.1); color: #ff3131;
  font-size: 10px; font-weight: 700; padding: 1px 7px; border-radius: 100px;
  text-transform: none; letter-spacing: 0;
}

/* ── Upload zone ── */
.smed-upload-zone {
  border: 2px dashed #d1d5db; border-radius: 14px;
  height: 200px; background: #f9fafb;
  cursor: pointer; transition: all .3s; position: relative; overflow: hidden;
}
.smed-upload-zone:hover { border-color: #ff3131; background: #fef2f2; }
.smed-upload-zone--has-image { border-style: solid; border-color: #e5e7eb; background: #fff; }

.smed-upload-placeholder { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; padding: 20px; }
.smed-upload-icon-circle {
  width: 72px; height: 72px; border-radius: 50%;
  background: linear-gradient(135deg, #fef2f2, #fee2e2);
  display: flex; align-items: center; justify-content: center; margin-bottom: 10px;
}
.smed-upload-placeholder__title { font-size: 14px; font-weight: 600; color: #374151; margin-bottom: 4px; text-align: center; }
.smed-upload-placeholder__sub { font-size: 12px; color: #9ca3af; text-align: center; }

.smed-upload-preview { position: relative; width: 100%; height: 100%; }
.smed-upload-preview img { width: 100%; height: 100%; object-fit: cover; }
.smed-upload-preview__overlay {
  position: absolute; inset: 0;
  background: rgba(0,0,0,.55); display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 6px;
  opacity: 0; transition: opacity .3s; color: #fff; font-size: 12px;
}
.smed-upload-preview:hover .smed-upload-preview__overlay { opacity: 1; }

/* ── Types pills grid ── */
.smed-types-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.smed-type-pill {
  display: flex; align-items: center; gap: 6px;
  padding: 9px 12px; border-radius: 100px;
  border: 1.5px solid #e5e7eb; background: #f9fafb;
  font-size: 12.5px; font-weight: 500; color: #6b7280;
  cursor: pointer; transition: all .2s; user-select: none;
}
.smed-type-pill:hover { border-color: #ff3131; color: #ff3131; }
.smed-type-pill--active { border-color: #ff3131; background: linear-gradient(135deg, #fef2f2, #fee2e2); color: #ff3131; font-weight: 700; }
.smed-type-pill__icon { display: flex; flex-shrink: 0; }

/* ── Config card ── */
.smed-config-card {
  display: flex; align-items: center; gap: 12px;
  padding: 14px 16px; border-radius: 12px;
  background: linear-gradient(135deg, #fef2f2, #fee2e2);
  border: 1.5px solid rgba(255, 49, 49,.2);
}
.smed-config-card__icon {
  width: 36px; height: 36px; border-radius: 10px; background: #fff;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 2px 8px rgba(0,0,0,.08); flex-shrink: 0;
}
.smed-config-card__info { flex: 1; min-width: 0; }
.smed-config-card__name { font-size: 13.5px; font-weight: 700; color: #111827; }
.smed-config-card__sub { font-size: 11px; color: #9ca3af; }
.smed-active-badge {
  padding: 3px 10px; border-radius: 100px;
  background: rgba(255, 49, 49,.1); color: #ff3131; font-size: 11px; font-weight: 700;
}

.smed-config-empty {
  display: flex; flex-direction: column; align-items: center; padding: 24px;
  border: 2px dashed #e5e7eb; border-radius: 12px; text-align: center;
}
.smed-config-empty p { font-size: 12px; color: #9ca3af; margin: 8px 0 0; }

/* ── Error ── */
.smed-error {
  display: flex; align-items: center; gap: 8px;
  padding: 12px 20px; background: #fef2f2; color: #ff3131; font-size: 12.5px;
}

/* ── Footer ── */
.smed-footer {
  flex-shrink: 0; display: flex; gap: 8px; padding: 16px 20px;
  border-top: 1px solid #e5e7eb; background: #fff;
  box-shadow: 0 -4px 16px rgba(0,0,0,.06);
}
.smed-btn {
  flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px;
  padding: 10px 16px; border-radius: 100px; font-size: 13.5px; font-weight: 600;
  border: none; cursor: pointer; transition: all .2s;
}
.smed-btn--ghost { background: #f3f4f6; color: #374151; border: 1.5px solid #e5e7eb; }
.smed-btn--ghost:hover { background: #e5e7eb; }
.smed-btn--primary { background: #ff3131; color: #fff; box-shadow: 0 4px 12px rgba(255, 49, 49,.3); }
.smed-btn--primary:hover:not(:disabled) { box-shadow: 0 6px 20px rgba(255, 49, 49,.4); transform: translateY(-1px); }
.smed-btn--primary:disabled { opacity: .5; cursor: not-allowed; transform: none; }

/* ── Spinner ── */
.smed-spinner {
  width: 14px; height: 14px; border-radius: 50%;
  border: 2px solid rgba(255,255,255,.3); border-top-color: #fff;
  animation: smed-spin .6s linear infinite;
}
@keyframes smed-spin { to { transform: rotate(360deg); } }

/* ── Transition ── */
.smed-drawer-enter-active, .smed-drawer-leave-active { transition: opacity .25s ease; }
.smed-drawer-enter-active .smed-panel, .smed-drawer-leave-active .smed-panel { transition: transform .25s cubic-bezier(.4,0,.2,1); }
.smed-drawer-enter-from, .smed-drawer-leave-to { opacity: 0; }
.smed-drawer-enter-from .smed-panel, .smed-drawer-leave-to .smed-panel { transform: translateX(100%); }

/* ── Dark mode ── */
.smed-panel--dark { background: #111827; }
.smed-panel--dark .smed-body { background: #0f172a; }
.smed-panel--dark .smed-section { background: #111827; border-bottom-color: #1e293b; }
.smed-panel--dark .smed-section__label { color: #64748b; }
.smed-panel--dark .smed-upload-zone { border-color: #334155; background: #1e293b; }
.smed-panel--dark .smed-upload-placeholder__title { color: #e2e8f0; }
.smed-panel--dark .smed-type-pill { border-color: #334155; background: #1e293b; color: #94a3b8; }
.smed-panel--dark .smed-type-pill--active { border-color: #ff3131; background: rgba(255, 49, 49,.15); color: #f87171; }
.smed-panel--dark .smed-config-card__name { color: #e2e8f0; }
.smed-panel--dark .smed-footer { background: #111827; border-top-color: #1e293b; }
.smed-panel--dark .smed-btn--ghost { background: #1e293b; color: #e2e8f0; border-color: #334155; }
.smed-panel--dark .smed-btn--ghost:hover { background: #273548; }

/* ── Visually hidden (Bootstrap compat) ── */
.visually-hidden { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0,0,0,0); border: 0; }
</style>
