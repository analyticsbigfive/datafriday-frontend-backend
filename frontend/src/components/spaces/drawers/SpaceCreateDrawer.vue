<template>
  <Teleport to="body">
  <Transition name="scd">
  <div v-if="modelValue" class="scd-overlay" @mousedown.self="close">
    <div class="scd-panel" :class="{ 'scd--dark': isDark }">

      <!-- Gradient header -->
      <div class="scd-grad-header">
        <div class="scd-grad-header__icon">
          <Building2 :size="22" color="white" />
        </div>
        <div class="scd-grad-header__text">
          <div class="scd-grad-header__title">{{ drawerTitle }}</div>
          <div class="scd-grad-header__sub">{{ stepSubtitle }}</div>
        </div>
        <button class="scd-grad-header__close" @click="close">
          <X :size="18" />
        </button>
      </div>

      <!-- Stepper -->
      <div class="scd-stepper">
        <div
          v-for="(step, i) in stepLabels"
          :key="i"
          class="scd-step"
          :class="{ 'scd-step--active': createStep === i, 'scd-step--done': createStep > i }"
          @click="goToStep(i)"
        >
          <div class="scd-step-circle">
            <Check v-if="createStep > i" :size="12" />
            <span v-else>{{ i + 1 }}</span>
          </div>
          <span class="scd-step-label">{{ step }}</span>
          <div v-if="i < stepLabels.length - 1" class="scd-step-connector" :class="{ done: createStep > i }"></div>
        </div>
      </div>

      <!-- Body -->
      <div class="scd-body">

        <!-- Inline error -->
        <div v-if="createError" class="scd-form-error">
          <AlertCircle :size="14" /> {{ createError }}
        </div>

        <!-- Step 0: Infos de base -->
        <div v-show="createStep === 0" class="scd-step-body">
          <!-- Image upload -->
          <div class="mb-4">
            <v-file-input
              ref="newSpaceImageInput"
              v-model="newSpaceImageFile"
              accept="image/*"
              prepend-icon=""
              density="compact"
              class="d-none"
              @update:model-value="onNewSpaceImageSelected"
            />
            <div
              class="scd-image-upload"
              :class="{ 'has-image': newSpaceImagePreviewUrl }"
              role="button"
              tabindex="0"
              @click="triggerImagePicker"
              @keydown.enter.prevent="triggerImagePicker"
              @keydown.space.prevent="triggerImagePicker"
            >
              <button v-if="newSpaceImagePreviewUrl" class="scd-img-remove" @click.stop="deleteImage">
                <X :size="13" />
              </button>
              <div v-if="!newSpaceImagePreviewUrl" class="scd-image-upload__empty">
                <div class="scd-image-upload__icon-wrap">
                  <ImagePlus :size="26" color="#ff3131" />
                </div>
                <div class="scd-image-upload__title">{{ t('spaceList.addImage') }}</div>
                <div class="scd-image-upload__hint">{{ t('spaceList.imageHint') }}</div>
              </div>
              <div v-else class="scd-image-upload__preview">
                <img :src="newSpaceImagePreviewUrl" alt="Preview" />
                <div class="scd-image-upload__change">{{ t('spaceList.changeImage') }}</div>
              </div>
            </div>
          </div>

          <div class="form-floating mb-3">
            <input id="scd-name" v-model="newSpace.name" type="text" class="form-control scd-input" placeholder=" " />
            <label for="scd-name">{{ t('spaceList.labelName') }} <span class="scd-required">*</span></label>
          </div>

          <div class="form-floating mb-3">
            <select id="scd-type" v-model="newSpace.spaceType" class="form-select scd-input">
              <option value="" disabled></option>
              <option v-for="opt in spaceTypeOptions" :key="opt" :value="opt">{{ opt }}</option>
            </select>
            <label for="scd-type">{{ t('spaceList.labelSpaceType') }} <span class="scd-required">*</span></label>
          </div>

          <div class="form-floating mb-3">
            <input id="scd-dept" v-model.number="newSpace.department" type="number" min="0" class="form-control scd-input" placeholder=" " />
            <label for="scd-dept">{{ t('spaceList.labelDepartment') }}</label>
          </div>

          <div class="form-floating mb-1">
            <input id="scd-cap" v-model.number="newSpace.maxCapacity" type="number" min="0" class="form-control scd-input" placeholder=" " />
            <label for="scd-cap">{{ t('spaceList.labelCapacity') }}</label>
          </div>
        </div>

        <!-- Step 1: Adresse -->
        <div v-show="createStep === 1" class="scd-step-body">
          <div class="scd-step-section-label">
            <MapPin :size="15" color="#ff3131" />
            {{ t('spaceList.stepAddress') }}
          </div>

          <div class="form-floating mb-3">
            <input id="scd-addr1" v-model="newSpace.addressLine1" type="text" class="form-control scd-input" placeholder=" " />
            <label for="scd-addr1">{{ t('spaceList.labelAddress') }} <span class="scd-required">*</span></label>
          </div>
          <div class="form-floating mb-3">
            <input id="scd-addr2" v-model="newSpace.addressLine2" type="text" class="form-control scd-input" placeholder=" " />
            <label for="scd-addr2">{{ t('spaceList.labelAddress2') }}</label>
          </div>
          <div class="row g-3 mb-3">
            <div class="col-6">
              <div class="form-floating">
                <input id="scd-city" v-model="newSpace.city" type="text" class="form-control scd-input" placeholder=" " />
                <label for="scd-city">{{ t('spaceList.labelCity') }} <span class="scd-required">*</span></label>
              </div>
            </div>
            <div class="col-6">
              <div class="form-floating">
                <input id="scd-post" v-model="newSpace.postcode" type="text" class="form-control scd-input" placeholder=" " />
                <label for="scd-post">{{ t('spaceList.labelPostcode') }} <span class="scd-required">*</span></label>
              </div>
            </div>
          </div>
          <div class="form-floating mb-1">
            <input id="scd-country" v-model="newSpace.country" type="text" class="form-control scd-input" placeholder=" " />
            <label for="scd-country">{{ t('spaceList.labelCountry') }} <span class="scd-required">*</span></label>
          </div>
        </div>

        <!-- Step 2: Contact -->
        <div v-show="createStep === 2" class="scd-step-body">
          <div class="scd-step-section-label">
            <Mail :size="15" color="#ff3131" />
            {{ t('spaceList.stepContact') }}
          </div>

          <div class="form-floating mb-3">
            <input id="scd-email" v-model="newSpace.email" type="email" class="form-control scd-input" placeholder=" " />
            <label for="scd-email">{{ t('spaceList.labelEmail') }}</label>
          </div>
          <div class="form-floating mb-3">
            <input id="scd-tel" v-model="newSpace.tel" type="tel" class="form-control scd-input" placeholder=" " />
            <label for="scd-tel">{{ t('spaceList.labelPhone') }}</label>
          </div>
          <div class="form-floating mb-3">
            <input id="scd-contact-name" v-model="newSpace.mainContactPerson" type="text" class="form-control scd-input" placeholder=" " />
            <label for="scd-contact-name">{{ t('spaceList.labelFullName') }}</label>
          </div>
          <div class="form-floating mb-3">
            <input id="scd-contact-email" v-model="newSpace.contactEmail" type="email" class="form-control scd-input" placeholder=" " />
            <label for="scd-contact-email">{{ t('spaceList.labelContactEmail') }}</label>
          </div>
          <div class="form-floating mb-1">
            <input id="scd-contact-tel" v-model="newSpace.contactTel" type="tel" class="form-control scd-input" placeholder=" " />
            <label for="scd-contact-tel">{{ t('spaceList.labelContactPhone') }}</label>
          </div>
        </div>

        <!-- Step 3: Réseaux sociaux -->
        <div v-show="createStep === 3" class="scd-step-body">
          <div class="scd-social-header">
            <div class="scd-social-header__icon-wrap">
              <Share2 :size="24" color="#db2777" />
            </div>
            <div class="scd-social-header__title">{{ t('spaceList.socialTitle') }}</div>
          </div>
          <div class="form-floating mb-3">
            <input id="scd-ig" v-model="newSpace.instagram" type="text" class="form-control scd-input" placeholder=" " />
            <label for="scd-ig">Instagram</label>
          </div>
          <div class="form-floating mb-3">
            <input id="scd-tt" v-model="newSpace.tiktok" type="text" class="form-control scd-input" placeholder=" " />
            <label for="scd-tt">TikTok</label>
          </div>
          <div class="form-floating mb-3">
            <input id="scd-fb-s" v-model="newSpace.facebook" type="text" class="form-control scd-input" placeholder=" " />
            <label for="scd-fb-s">Facebook</label>
          </div>
          <div class="form-floating mb-1">
            <input id="scd-tw" v-model="newSpace.twitter" type="text" class="form-control scd-input" placeholder=" " />
            <label for="scd-tw">X / Twitter</label>
          </div>
        </div>

      </div><!-- end scd-body -->

      <!-- Footer -->
      <div class="scd-footer">
        <button class="scd-btn scd-btn--cancel" @click="close">{{ t('spaceList.cancel') }}</button>
        <div class="scd-footer-right">
          <div class="scd-step-dots">
            <span
              v-for="i in 4"
              :key="i"
              class="scd-step-dot"
              :class="{ active: createStep === i - 1, done: createStep > i - 1 }"
            ></span>
          </div>
          <button v-if="createStep > 0" class="scd-btn scd-btn--back" @click="prevStep">
            <ChevronLeft :size="15" />
            {{ t('spaceList.back') }}
          </button>
          <button v-if="createStep < 3" class="scd-btn scd-btn--primary" @click="nextStep">
            {{ t('spaceList.continue') }}
            <ChevronRight :size="15" />
          </button>
          <button v-else class="scd-btn scd-btn--primary" :disabled="createLoading" @click="submit">
            <span v-if="createLoading" class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
            <Save v-else :size="15" />
            {{ submitLabel }}
          </button>
        </div>
      </div>

    </div>
  </div>
  </Transition>
  </Teleport>
</template>

<script>
import { useI18n } from '@/i18n/useI18n';
import {
  Building2, X, Check, AlertCircle, MapPin, Mail, Share2,
  ImagePlus, ChevronLeft, ChevronRight, Save,
} from 'lucide-vue-next';
import { createSpace, updateSpace } from '@/api/endpoints/space.api';

export default {
  name: 'SpaceCreateDrawer',
  components: {
    Building2, X, Check, AlertCircle, MapPin, Mail, Share2,
    ImagePlus, ChevronLeft, ChevronRight, Save,
  },
  props: {
    modelValue: { type: Boolean, default: false },
    isEditMode: { type: Boolean, default: false },
    initialSpace: { type: Object, default: null },
    spaceTypeOptions: { type: Array, default: () => ['Stadium', 'Arena', 'Zénith', 'Indoor Festival'] },
    isDark: { type: Boolean, default: false },
  },
  emits: ['update:modelValue', 'created', 'updated'],
  setup() {
    const { t } = useI18n();
    return { t };
  },
  data() {
    return {
      createStep: 0,
      createMaxStep: 0,
      createLoading: false,
      createError: '',
      newSpaceImageFile: null,
      newSpaceImagePreviewUrl: '',
      newSpace: this._defaultSpace(),
    };
  },
  computed: {
    stepLabels() {
      return [
        this.t('spaceList.stepInfo'),
        this.t('spaceList.stepAddress'),
        this.t('spaceList.stepContact'),
        this.t('spaceList.stepSocial'),
      ];
    },
    drawerTitle() {
      return this.isEditMode ? this.t('spaceList.dialogEditTitle') : this.t('spaceList.dialogCreateTitle');
    },
    submitLabel() {
      return this.isEditMode ? this.t('spaceList.dialogSubmitEdit') : this.t('spaceList.dialogSubmitCreate');
    },
    stepSubtitle() {
      const subs = [
        this.t('spaceList.subtitleStep0'),
        this.t('spaceList.subtitleStep1'),
        this.t('spaceList.subtitleStep2'),
        this.t('spaceList.subtitleStep3'),
      ];
      return subs[this.createStep] || '';
    },
  },
  watch: {
    modelValue(val) {
      if (val) {
        this.reset();
      }
    },
  },
  methods: {
    _defaultSpace() {
      return {
        name: '', image: '', spaceType: '', spaceTypeOther: '',
        maxCapacity: 0, department: 0, homeTeam: '',
        addressLine1: '', addressLine2: '', city: '', postcode: '', country: '',
        tel: '', email: '', mainContactPerson: '', contactEmail: '', contactTel: '',
        instagram: '', tiktok: '', facebook: '', twitter: '',
      };
    },
    reset() {
      this.createStep = 0;
      this.createError = '';
      this.createLoading = false;
      this.clearImage();

      if (this.isEditMode && this.initialSpace) {
        this.createMaxStep = 3;
        const s = this.initialSpace;
        this.newSpace = {
          name: s.name ?? '',
          image: s.image ?? '',
          spaceType: s.spaceType ?? '',
          spaceTypeOther: s.spaceTypeOther ?? '',
          maxCapacity: Number(s.maxCapacity) || 0,
          department: Number(s.department) || 0,
          homeTeam: s.homeTeam ?? '',
          addressLine1: s.addressLine1 ?? '',
          addressLine2: s.addressLine2 ?? '',
          city: s.city ?? '',
          postcode: s.postcode ?? '',
          country: s.country ?? '',
          tel: s.tel ?? '',
          email: s.email ?? '',
          mainContactPerson: s.mainContactPerson ?? '',
          contactEmail: s.contactEmail ?? '',
          contactTel: s.contactTel ?? '',
          instagram: s.instagram ?? '',
          tiktok: s.tiktok ?? '',
          facebook: s.facebook ?? '',
          twitter: s.twitter ?? '',
        };
        if (this.newSpace.image) this.newSpaceImagePreviewUrl = this.newSpace.image;
      } else {
        this.createMaxStep = 0;
        this.newSpace = this._defaultSpace();
      }
    },

    // Image methods
    triggerImagePicker() {
      const input = this.$refs?.newSpaceImageInput?.$el?.querySelector('input[type="file"]');
      if (input) input.click();
    },
    deleteImage() {
      this.clearImage();
      this.newSpace.image = '';
    },
    clearImage() {
      if (this.newSpaceImagePreviewUrl && String(this.newSpaceImagePreviewUrl).startsWith('blob:')) {
        URL.revokeObjectURL(this.newSpaceImagePreviewUrl);
      }
      this.newSpaceImagePreviewUrl = '';
      this.newSpaceImageFile = null;
    },
    async onNewSpaceImageSelected(file) {
      this.clearImage();
      if (!file) { this.newSpace.image = ''; return; }
      this.newSpaceImagePreviewUrl = URL.createObjectURL(file);
      try {
        const base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ''));
          reader.onerror = () => reject(new Error('FileReader error'));
          reader.readAsDataURL(file);
        });
        this.newSpace.image = base64;
      } catch { this.newSpace.image = ''; }
    },

    // Step navigation
    validateStep(step) {
      this.createError = '';
      if (step === 0) {
        if (!String(this.newSpace.name || '').trim()) {
          this.createError = 'Le nom est obligatoire.';
          return false;
        }
        if (!this.newSpace.spaceType) {
          this.createError = 'Le type de lieu est obligatoire.';
          return false;
        }
      }
      if (step === 1) {
        if (!String(this.newSpace.addressLine1 || '').trim()) {
          this.createError = "L'adresse est obligatoire.";
          return false;
        }
        if (!String(this.newSpace.city || '').trim()) {
          this.createError = 'La ville est obligatoire.';
          return false;
        }
        if (!String(this.newSpace.postcode || '').trim()) {
          this.createError = 'Le code postal est obligatoire.';
          return false;
        }
        if (!String(this.newSpace.country || '').trim()) {
          this.createError = 'Le pays est obligatoire.';
          return false;
        }
      }
      return true;
    },
    goToStep(step) {
      if (step <= this.createStep) { this.createStep = step; return; }
      if (step > this.createMaxStep) return;
      this.createStep = step;
    },
    nextStep() {
      if (!this.validateStep(this.createStep)) return;
      const next = Math.min(3, this.createStep + 1);
      this.createMaxStep = Math.max(this.createMaxStep, next);
      this.createStep = next;
    },
    prevStep() {
      this.createError = '';
      this.createStep = Math.max(0, this.createStep - 1);
    },

    // Submit
    async submit() {
      if (!this.validateStep(this.createStep)) return;
      this.createLoading = true;
      this.createError = '';
      try {
        const payload = {
          name: this.newSpace.name,
          image: this.newSpace.image,
          spaceType: this.newSpace.spaceType,
          spaceTypeOther: this.newSpace.spaceTypeOther,
          maxCapacity: Number(this.newSpace.maxCapacity) || 0,
          department: Number(this.newSpace.department) || 0,
          homeTeam: this.newSpace.homeTeam,
          addressLine1: this.newSpace.addressLine1,
          addressLine2: this.newSpace.addressLine2,
          city: this.newSpace.city,
          postcode: this.newSpace.postcode,
          country: this.newSpace.country,
          tel: this.newSpace.tel,
          email: this.newSpace.email,
          mainContactPerson: this.newSpace.mainContactPerson,
          contactEmail: this.newSpace.contactEmail,
          contactTel: this.newSpace.contactTel,
          instagram: this.newSpace.instagram,
          tiktok: this.newSpace.tiktok,
          facebook: this.newSpace.facebook,
          twitter: this.newSpace.twitter,
        };

        if (this.isEditMode && this.initialSpace?.id) {
          const updated = await updateSpace(this.initialSpace.id, payload);
          this.$emit('updated', updated);
        } else {
          const response = await createSpace(payload);
          this.$emit('created', response);
        }
      } catch (e) {
        this.createError = e?.response?.data?.message || e?.message || this.t('spaceList.errorCreate');
      } finally {
        this.createLoading = false;
      }
    },

    close() {
      this.$emit('update:modelValue', false);
    },
  },
};
</script>

<style scoped>
/* Overlay + panel */
.scd-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  justify-content: flex-end;
}

.scd-panel {
  width: 520px;
  height: 100%;
  background: #ffffff;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: -4px 0 32px rgba(0, 0, 0, 0.18);
}

/* Transition */
.scd-enter-active,
.scd-leave-active {
  transition: opacity 0.25s ease;
}
.scd-enter-active .scd-panel,
.scd-leave-active .scd-panel {
  transition: transform 0.28s cubic-bezier(0.4, 0, 0.2, 1);
}
.scd-enter-from,
.scd-leave-to {
  opacity: 0;
}
.scd-enter-from .scd-panel,
.scd-leave-to .scd-panel {
  transform: translateX(100%);
}

/* Gradient header */
.scd-grad-header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px 20px;
  background: linear-gradient(135deg, #ff3131 0%, #b91c1c 100%);
  flex-shrink: 0;
}
.scd-grad-header__icon {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.18);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.scd-grad-header__text { flex: 1; min-width: 0; }
.scd-grad-header__title { font-size: 16px; font-weight: 700; color: #fff; line-height: 1.2; }
.scd-grad-header__sub { font-size: 12px; color: rgba(255, 255, 255, 0.75); margin-top: 2px; }
.scd-grad-header__close {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: none;
  background: rgba(255, 255, 255, 0.18);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #fff;
  flex-shrink: 0;
  transition: background 0.2s;
}
.scd-grad-header__close:hover { background: rgba(255, 255, 255, 0.28); }

/* Stepper */
.scd-stepper {
  display: flex;
  align-items: center;
  padding: 12px 20px;
  border-bottom: 1px solid #f3f4f6;
  flex-shrink: 0;
  background: #fff;
}
.scd-step {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  flex-shrink: 0;
}
.scd-step-circle {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 2px solid #d1d5db;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  color: #9ca3af;
  background: #fff;
  transition: all 0.25s;
  flex-shrink: 0;
}
.scd-step--active .scd-step-circle { border-color: #ff3131; background: #ff3131; color: #fff; }
.scd-step--done .scd-step-circle { border-color: #059669; background: #059669; color: #fff; }
.scd-step-label {
  font-size: 11px;
  font-weight: 500;
  color: #9ca3af;
  white-space: nowrap;
  transition: color 0.25s;
}
.scd-step--active .scd-step-label { color: #ff3131; font-weight: 600; }
.scd-step--done .scd-step-label { color: #059669; }
.scd-step-connector {
  flex: 1;
  min-width: 12px;
  height: 2px;
  background: #e5e7eb;
  border-radius: 1px;
  transition: background 0.25s;
}
.scd-step-connector.done { background: #059669; }

/* Body */
.scd-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px 20px 8px;
  scrollbar-width: thin;
  scrollbar-color: #e5e7eb transparent;
}
.scd-body::-webkit-scrollbar { width: 5px; }
.scd-body::-webkit-scrollbar-thumb { background: #e5e7eb; border-radius: 4px; }

/* Inline error */
.scd-form-error {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #991b1b;
  border-radius: 10px;
  padding: 10px 14px;
  font-size: 13px;
  margin-bottom: 16px;
}

/* Step section label */
.scd-step-section-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: #374151;
  padding-bottom: 14px;
  margin-bottom: 16px;
  border-bottom: 1px solid #f3f4f6;
}

/* Form inputs */
.scd-input.form-control,
.scd-input.form-select {
  border: 1.5px solid #e5e7eb;
  border-radius: 11px;
  height: 54px;
  padding-top: 20px;
  padding-bottom: 6px;
  padding-left: 14px;
  font-size: 14px;
  color: #111827;
  background: #fff;
  box-shadow: none;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.scd-input.form-control:focus,
.scd-input.form-select:focus {
  border-color: #ff3131;
  box-shadow: 0 0 0 3px rgba(255, 49, 49, 0.1);
}
.form-floating > label {
  color: #9ca3af;
  font-size: 14px;
  padding: 16px 14px;
}
.form-floating > .scd-input:focus ~ label,
.form-floating > .scd-input:not(:placeholder-shown) ~ label {
  color: #ff3131;
  font-size: 11px;
  transform: scale(0.85) translateY(-0.5rem) translateX(0.15rem);
}
.form-floating > .scd-input.form-select ~ label {
  color: #ff3131;
  font-size: 11px;
  transform: scale(0.85) translateY(-0.5rem) translateX(0.15rem);
}
.scd-required { color: #ff3131; }

/* Image upload */
.scd-image-upload {
  border: 2px dashed #d1d5db;
  border-radius: 12px;
  cursor: pointer;
  position: relative;
  overflow: hidden;
  min-height: 120px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  transition: border-color 0.2s, background 0.2s;
}
.scd-image-upload:hover { border-color: #ff3131; background: rgba(255, 49, 49, 0.02); }
.scd-image-upload.has-image { border-style: solid; border-color: #e5e7eb; }
.scd-image-upload__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px;
  gap: 6px;
}
.scd-image-upload__icon-wrap {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: rgba(255, 49, 49, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
}
.scd-image-upload__title { font-size: 13.5px; font-weight: 600; color: #374151; }
.scd-image-upload__hint { font-size: 12px; color: #9ca3af; }
.scd-image-upload__preview {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.scd-image-upload__preview img { width: 100%; height: 180px; object-fit: cover; }
.scd-image-upload__change { font-size: 12px; color: #9ca3af; text-align: center; padding-bottom: 8px; }
.scd-img-remove {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 2;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: none;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #374151;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
}

/* Social step header */
.scd-social-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding-bottom: 20px;
  margin-bottom: 4px;
}
.scd-social-header__icon-wrap {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: rgba(219, 39, 119, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 8px;
}
.scd-social-header__title { font-size: 14px; font-weight: 600; color: #374151; }

/* Footer */
.scd-footer {
  padding: 14px 20px;
  border-top: 1px solid #f0f0f0;
  background: #fafafa;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-shrink: 0;
}
.scd-footer-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

/* Step dots */
.scd-step-dots { display: flex; align-items: center; gap: 5px; }
.scd-step-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #d1d5db;
  transition: all 0.25s;
}
.scd-step-dot.active { width: 18px; border-radius: 4px; background: #ff3131; }
.scd-step-dot.done { background: #059669; }

/* Buttons */
.scd-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 18px;
  height: 38px;
  border-radius: 100px;
  font-size: 13.5px;
  font-weight: 500;
  border: none;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
  flex-shrink: 0;
}
.scd-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.scd-btn--primary {
  background: #ff3131;
  color: #fff;
  box-shadow: 0 4px 12px rgba(255, 49, 49, 0.3);
}
.scd-btn--primary:hover:not(:disabled) {
  box-shadow: 0 6px 20px rgba(255, 49, 49, 0.4);
  transform: translateY(-1px);
}
.scd-btn--cancel, .scd-btn--back {
  background: #f3f4f6;
  color: #374151;
  border: 1.5px solid #e5e7eb;
}
.scd-btn--cancel:hover, .scd-btn--back:hover { background: #e9ecef; }

/* Dark mode */
.scd--dark .scd-panel { background: #1a2332; }
.scd--dark .scd-stepper { background: #1a2332; border-bottom-color: #374151; }
.scd--dark .scd-step-circle { background: #1a2332; border-color: #4b5563; color: #6b7280; }
.scd--dark .scd-step--active .scd-step-circle { background: #ff3131; border-color: #ff3131; color: #fff; }
.scd--dark .scd-step--done .scd-step-circle { background: #059669; border-color: #059669; color: #fff; }
.scd--dark .scd-step-label { color: #6b7280; }
.scd--dark .scd-step--active .scd-step-label { color: #f87171; }
.scd--dark .scd-step--done .scd-step-label { color: #34d399; }
.scd--dark .scd-step-connector { background: #374151; }
.scd--dark .scd-body { background: #1a2332; }
.scd--dark .scd-input.form-control,
.scd--dark .scd-input.form-select {
  background: #111827;
  border-color: #374151;
  color: #f9fafb;
}
.scd--dark .scd-input.form-control:focus,
.scd--dark .scd-input.form-select:focus { border-color: #ff3131; }
.scd--dark .scd-image-upload { border-color: #4b5563; }
.scd--dark .scd-image-upload:hover { border-color: #ff3131; }
.scd--dark .scd-footer { background: #1a2332; border-top-color: #374151; }
.scd--dark .scd-btn--cancel,
.scd--dark .scd-btn--back { background: #374151; color: #d1d5db; border-color: #4b5563; }
.scd--dark .scd-step-section-label { color: #d1d5db; border-bottom-color: #374151; }
.scd--dark .scd-social-header__title { color: #d1d5db; }
</style>
