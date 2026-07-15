<template>
  <Teleport to="body">
    <Transition name="sde-drawer">
      <div v-if="modelValue" class="sde-overlay" @click.self="$emit('update:modelValue', false)">
        <div class="sde-panel" :class="{ 'sde-panel--dark': isDark }">

          <!-- Gradient Header -->
          <div class="sde-header">
            <div class="sde-header__icon">
              <Settings :size="22" color="white" />
            </div>
            <div class="sde-header__titles">
              <div class="sde-header__title">Modifier le shop</div>
              <div v-if="shop" class="sde-header__sub">{{ shop.name }}</div>
            </div>
            <button class="sde-close-btn" @click="$emit('update:modelValue', false)">
              <X :size="18" />
            </button>
          </div>

          <!-- Body -->
          <div class="sde-body">

            <!-- Section: Image -->
            <div class="sde-section">
              <div class="sde-section__label">
                <ImageIcon :size="13" style="color:#ff3131" />
                Shop Image
              </div>
              <div
                class="sde-upload-zone"
                :class="{ 'sde-upload-zone--has-image': form.image }"
                @click="triggerImageUpload"
              >
                <div v-if="form.image" class="sde-upload-preview">
                  <img :src="form.image" />
                  <div class="sde-upload-preview__overlay">
                    <Camera :size="28" color="white" />
                    <span>Click to change</span>
                  </div>
                  <button class="sde-upload-remove" @click.stop="form.image = ''">
                    <X :size="12" />
                  </button>
                </div>
                <div v-else class="sde-upload-placeholder">
                  <div class="sde-upload-icon-circle">
                    <ImagePlus :size="32" style="color:#ff3131" />
                  </div>
                  <p class="sde-upload-placeholder__title">Upload Shop Image</p>
                  <p class="sde-upload-placeholder__sub">Click to browse · JPG, PNG, WebP</p>
                </div>
              </div>
              <input ref="imgInput" type="file" accept="image/*" style="display:none;" @change="handleImageUpload" />
            </div>

            <!-- Section: Types -->
            <div class="sde-section">
              <div class="sde-section__label">
                <Tags :size="13" style="color:#ff3131" />
                Shop Types
              </div>
              <div class="sde-types-grid">
                <label
                  v-for="type in availableShopTypes"
                  :key="type.value"
                  class="sde-type-pill"
                  :class="{ 'sde-type-pill--active': form.subTypes.includes(type.value) }"
                >
                  <input
                    type="checkbox"
                    :value="type.value"
                    :checked="form.subTypes.includes(type.value)"
                    class="visually-hidden"
                    @change="toggleShopType(type.value)"
                  />
                  <span class="sde-type-pill__icon">
                    <component :is="type.iconComponent" :size="14" />
                  </span>
                  {{ type.label }}
                </label>
              </div>
            </div>

            <!-- Section: Available in Configurations -->
            <div class="sde-section">
              <div class="sde-section__label">
                <Settings :size="13" style="color:#ff3131" />
                Available in Configurations
              </div>
              <div v-if="currentConfigurations.length" class="sde-config-list">
                <div v-for="config in currentConfigurations" :key="config.id" class="sde-config-item">
                  <div class="sde-config-item__icon">
                    <Settings :size="15" style="color:#1e40af" />
                  </div>
                  <div class="sde-config-item__info">
                    <div class="sde-config-item__name">{{ config.name }}</div>
                    <div class="sde-config-item__sub">{{ config.count }} item{{ config.count > 1 ? 's' : '' }}</div>
                  </div>
                </div>
              </div>
              <div v-else class="sde-config-empty">
                <p>Aucune configuration disponible</p>
              </div>
            </div>

            <!-- Section: Notes -->
            <div class="sde-section">
              <div class="sde-section__label">
                <FileText :size="13" style="color:#ff3131" />
                Notes
              </div>
              <div class="sde-textarea-wrap">
                <textarea
                  id="sde-notes"
                  v-model="form.notes"
                  class="sde-textarea"
                  placeholder=" "
                  rows="4"
                ></textarea>
                <label for="sde-notes" class="sde-textarea__label">Notes internes</label>
              </div>
            </div>

            <!-- Error -->
            <div v-if="saveError" class="sde-error">
              <AlertCircle :size="14" /> {{ saveError }}
            </div>

          </div>

          <!-- Footer -->
          <div class="sde-footer">
            <button
              class="sde-btn sde-btn--ghost"
              :disabled="saving"
              @click="$emit('update:modelValue', false)"
            >
              <X :size="14" /> Cancel
            </button>
            <button
              class="sde-btn sde-btn--primary"
              :disabled="saving"
              @click="save"
            >
              <span v-if="saving" class="sde-spinner"></span>
              <Save v-else :size="14" />
              Save Changes
            </button>
          </div>

        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script>
import { Settings, X, Save, Image as ImageIcon, Camera, ImagePlus, Tags, AlertCircle, FileText, Utensils, Coffee, Beer, Package, Clock } from 'lucide-vue-next';
import { updateSpaceElement } from '@/api/endpoints/space.api'

export default {
  name: 'ShopDetailEditDrawer',
  components: { Settings, X, Save, ImageIcon, Camera, ImagePlus, Tags, AlertCircle, FileText, Utensils, Coffee, Beer, Package, Clock },
  props: {
    modelValue: { type: Boolean, default: false },
    shop: { type: Object, default: null },
    currentConfigurations: { type: Array, default: () => [] },
    isDark: { type: Boolean, default: false },
  },
  emits: ['update:modelValue', 'saved'],
  beforeUnmount() {
    document.body.style.overflow = '';
  },
  data() {
    return {
      saving: false,
      saveError: '',
      form: { image: '', subTypes: [], notes: '' },
      availableShopTypes: [
        { label: 'Food',       value: 'Food',       iconComponent: 'Utensils' },
        { label: 'Beverages',  value: 'Beverages',  iconComponent: 'Coffee' },
        { label: 'Beer',       value: 'Beer',       iconComponent: 'Beer' },
        { label: 'GP Premium', value: 'GP Premium', iconComponent: 'Package' },
        { label: 'Temporary',  value: 'Temporary',  iconComponent: 'Clock' },
        { label: 'Drinkee',    value: 'Drinkee',    iconComponent: 'Coffee' },
      ],
    };
  },
  watch: {
    modelValue(isOpen) {
      document.body.style.overflow = isOpen ? 'hidden' : '';
      if (isOpen && this.shop) {
        this.saveError = '';
        this.form = {
          image:    this.shop?.image || '',
          subTypes: Array.isArray(this.shop?.subTypes) ? [...this.shop.subTypes] : [],
          notes:    this.shop?.notes || '',
        };
      }
    },
  },
  methods: {
    triggerImageUpload() { this.$refs.imgInput.click(); },
    handleImageUpload(event) {
      const file = event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => { this.form.image = e.target.result; };
      reader.readAsDataURL(file);
    },
    toggleShopType(type) {
      const idx = this.form.subTypes.indexOf(type);
      if (idx >= 0) this.form.subTypes.splice(idx, 1);
      else this.form.subTypes.push(type);
    },
    async save() {
      if (!this.shop?.id) return;
      this.saving = true;
      this.saveError = '';
      try {
        const updated = await updateSpaceElement(this.shop.id, {
          image:    this.form.image,
          subTypes: this.form.subTypes,
          notes:    this.form.notes,
        });
        this.$emit('saved', { ...this.shop, ...(updated || {}), image: this.form.image, subTypes: [...this.form.subTypes], notes: this.form.notes });
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
.sde-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 2000; display: flex; justify-content: flex-end; }

/* ── Panel ── */
.sde-panel { width: 520px; height: 100%; display: flex; flex-direction: column; background: #fff; box-shadow: -8px 0 32px rgba(0,0,0,.12); }

/* ── Gradient Header ── */
.sde-header {
  flex-shrink: 0;
  background: #ff3131;
  padding: 20px; display: flex; align-items: center; gap: 14px;
}
.sde-header__icon { width: 44px; height: 44px; border-radius: 12px; background: rgba(255,255,255,.2); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.sde-header__titles { flex: 1; min-width: 0; }
.sde-header__title { font-size: 16px; font-weight: 700; color: #fff; }
.sde-header__sub { font-size: 12px; color: rgba(255,255,255,.75); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sde-close-btn { background: rgba(255,255,255,.15); border: none; cursor: pointer; width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #fff; flex-shrink: 0; transition: background .2s; }
.sde-close-btn:hover { background: rgba(255,255,255,.25); }

/* ── Body ── */
.sde-body { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; background: #f9fafb; }

/* ── Sections ── */
.sde-section { padding: 18px 20px; border-bottom: 1px solid #e5e7eb; background: #fff; margin-bottom: 8px; }
.sde-section:last-child { margin-bottom: 0; border-bottom: none; }
.sde-section__label {
  display: flex; align-items: center; gap: 6px;
  font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em;
  color: #6b7280; margin-bottom: 12px;
}

/* ── Upload zone ── */
.sde-upload-zone { border: 2px dashed #d1d5db; border-radius: 14px; height: 190px; background: #f9fafb; cursor: pointer; transition: all .3s; position: relative; overflow: hidden; }
.sde-upload-zone:hover { border-color: #ff3131; background: #fef2f2; }
.sde-upload-zone--has-image { border-style: solid; border-color: #e5e7eb; background: #fff; }
.sde-upload-placeholder { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; padding: 20px; }
.sde-upload-icon-circle { width: 64px; height: 64px; border-radius: 50%; background: linear-gradient(135deg, #fef2f2, #fee2e2); display: flex; align-items: center; justify-content: center; margin-bottom: 10px; }
.sde-upload-placeholder__title { font-size: 14px; font-weight: 600; color: #374151; margin-bottom: 4px; text-align: center; }
.sde-upload-placeholder__sub { font-size: 12px; color: #9ca3af; text-align: center; }
.sde-upload-preview { position: relative; width: 100%; height: 100%; }
.sde-upload-preview img { width: 100%; height: 100%; object-fit: cover; }
.sde-upload-preview__overlay { position: absolute; inset: 0; background: rgba(0,0,0,.55); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; opacity: 0; transition: opacity .3s; color: #fff; font-size: 12px; }
.sde-upload-preview:hover .sde-upload-preview__overlay { opacity: 1; }
.sde-upload-remove { position: absolute; top: 8px; right: 8px; background: rgba(0,0,0,.5); border: none; cursor: pointer; border-radius: 6px; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; color: #fff; z-index: 2; }

/* ── Types pills ── */
.sde-types-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.sde-type-pill {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 12px; border-radius: 100px;
  border: 1.5px solid #e5e7eb; background: #f9fafb;
  font-size: 12.5px; font-weight: 500; color: #6b7280;
  cursor: pointer; transition: all .2s; user-select: none;
}
.sde-type-pill:hover { border-color: #ff3131; color: #ff3131; }
.sde-type-pill--active { border-color: #ff3131; background: linear-gradient(135deg, #fef2f2, #fee2e2); color: #ff3131; font-weight: 700; }
.sde-type-pill__icon { display: flex; flex-shrink: 0; }

/* ── Config list ── */
.sde-config-list { display: flex; flex-direction: column; gap: 6px; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; }
.sde-config-item { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-bottom: 1px solid #f3f4f6; }
.sde-config-item:last-child { border-bottom: none; }
.sde-config-item__icon { width: 32px; height: 32px; border-radius: 8px; background: rgba(30,64,175,.1); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.sde-config-item__name { font-size: 13px; font-weight: 700; color: #111827; }
.sde-config-item__sub { font-size: 11px; color: #9ca3af; }
.sde-config-empty { padding: 20px; text-align: center; border: 1px solid #e5e7eb; border-radius: 12px; }
.sde-config-empty p { font-size: 13px; color: #9ca3af; }

/* ── Textarea with floating label ── */
.sde-textarea-wrap { position: relative; }
.sde-textarea {
  width: 100%; border: 1.5px solid #e5e7eb; border-radius: 12px;
  padding: 20px 14px 8px; font-size: 13.5px; color: #111827;
  background: #f9fafb; outline: none; resize: vertical;
  font-family: inherit; transition: border-color .2s;
}
.sde-textarea:focus { border-color: #ff3131; background: #fff; }
.sde-textarea:not(:placeholder-shown) + .sde-textarea__label,
.sde-textarea:focus + .sde-textarea__label {
  top: 6px; font-size: 9.5px;
}
.sde-textarea__label {
  position: absolute; top: 14px; left: 14px;
  font-size: 13.5px; color: #9ca3af; pointer-events: none;
  transition: all .2s; font-weight: 400;
}
.sde-textarea:focus + .sde-textarea__label { color: #ff3131; font-size: 9.5px; top: 6px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; }
.sde-textarea:not(:placeholder-shown) + .sde-textarea__label { color: #ff3131; font-size: 9.5px; top: 6px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; }

/* ── Error ── */
.sde-error { display: flex; align-items: center; gap: 8px; padding: 12px 20px; background: #fef2f2; color: #ff3131; font-size: 12.5px; }

/* ── Footer ── */
.sde-footer { flex-shrink: 0; display: flex; gap: 8px; padding: 16px 20px; border-top: 1px solid #e5e7eb; background: #fff; box-shadow: 0 -4px 16px rgba(0,0,0,.06); }
.sde-btn { flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 10px 16px; border-radius: 100px; font-size: 13.5px; font-weight: 600; border: none; cursor: pointer; transition: all .2s; }
.sde-btn--ghost { background: #f3f4f6; color: #374151; border: 1.5px solid #e5e7eb; }
.sde-btn--ghost:hover:not(:disabled) { background: #e5e7eb; }
.sde-btn--primary { background: #ff3131; color: #fff; box-shadow: 0 4px 12px rgba(255, 49, 49,.3); }
.sde-btn--primary:hover:not(:disabled) { box-shadow: 0 6px 20px rgba(255, 49, 49,.4); transform: translateY(-1px); }
.sde-btn--primary:disabled, .sde-btn--ghost:disabled { opacity: .5; cursor: not-allowed; transform: none; }

/* ── Spinner ── */
.sde-spinner { width: 14px; height: 14px; border-radius: 50%; border: 2px solid rgba(255,255,255,.3); border-top-color: #fff; animation: sde-spin .6s linear infinite; }
@keyframes sde-spin { to { transform: rotate(360deg); } }

/* ── Transition ── */
.sde-drawer-enter-active, .sde-drawer-leave-active { transition: opacity .25s ease; }
.sde-drawer-enter-active .sde-panel, .sde-drawer-leave-active .sde-panel { transition: transform .25s cubic-bezier(.4,0,.2,1); }
.sde-drawer-enter-from, .sde-drawer-leave-to { opacity: 0; }
.sde-drawer-enter-from .sde-panel, .sde-drawer-leave-to .sde-panel { transform: translateX(100%); }

/* ── Dark mode ── */
.sde-panel--dark { background: #111827; }
.sde-panel--dark .sde-body { background: #0f172a; }
.sde-panel--dark .sde-section { background: #111827; border-bottom-color: #1e293b; }
.sde-panel--dark .sde-section__label { color: #64748b; }
.sde-panel--dark .sde-upload-zone { border-color: #334155; background: #1e293b; }
.sde-panel--dark .sde-upload-placeholder__title { color: #e2e8f0; }
.sde-panel--dark .sde-type-pill { border-color: #334155; background: #1e293b; color: #94a3b8; }
.sde-panel--dark .sde-type-pill--active { border-color: #ff3131; background: rgba(255, 49, 49,.15); color: #f87171; }
.sde-panel--dark .sde-textarea { background: #1e293b; border-color: #334155; color: #e2e8f0; }
.sde-panel--dark .sde-footer { background: #111827; border-top-color: #1e293b; }
.sde-panel--dark .sde-btn--ghost { background: #1e293b; color: #e2e8f0; border-color: #334155; }

/* ── Visually hidden ── */
.visually-hidden { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0,0,0,0); border: 0; }
</style>
