<template>
  <Teleport to="body">
    <Transition name="hrd">
      <div v-if="modelValue" class="hrd-overlay" @mousedown.self="close">
        <div class="hrd-panel" :class="{ 'hrd--dark': isDark }">

          <!-- Header rouge -->
          <div class="hrd-header">
            <div class="hrd-header-icon">
              <Pencil v-if="mode === 'edit'" :size="22" color="white" />
              <Building2 v-else :size="22" color="white" />
            </div>
            <div class="hrd-header-titles">
              <div class="hrd-header-title">{{ mode === 'edit' ? t('hrSuppliersEdit') : t('hrSuppliersAdd') }}</div>
              <div class="hrd-header-subtitle">{{ t('hrSuppliersSubtitle') }}</div>
            </div>
            <button class="hrd-close" :aria-label="t('hrCancel')" @click="close">
              <X :size="18" />
            </button>
          </div>

          <!-- Erreur -->
          <div v-if="error" class="hrd-error">
            <AlertCircle :size="14" style="flex-shrink:0" />
            {{ error }}
          </div>

          <!-- Corps -->
          <div class="hrd-body">
            <!-- Identité -->
            <div class="hrd-section">
              <div class="hrd-section__label">{{ t('hrColName') }}</div>
              <div class="hrd-field">
                <label class="hrd-label" for="hr-sup-name">{{ t('hrColName') }} <span class="hrd-required">*</span></label>
                <input id="hr-sup-name" v-model="form.name" type="text" class="hrd-input" />
              </div>
              <div class="hrd-field">
                <label class="hrd-label" for="hr-sup-contact">{{ t('hrColContact') }}</label>
                <input id="hr-sup-contact" v-model="form.contactName" type="text" class="hrd-input" />
              </div>
            </div>

            <!-- Contact -->
            <div class="hrd-section">
              <div class="hrd-section__label">{{ t('hrColEmail') }} / {{ t('hrColPhone') }}</div>
              <div class="hrd-row">
                <div class="hrd-field">
                  <label class="hrd-label" for="hr-sup-email">{{ t('hrColEmail') }}</label>
                  <input id="hr-sup-email" v-model="form.email" type="email" class="hrd-input" />
                </div>
                <div class="hrd-field">
                  <label class="hrd-label" for="hr-sup-phone">{{ t('hrColPhone') }}</label>
                  <input id="hr-sup-phone" v-model="form.phone" type="tel" class="hrd-input" />
                </div>
              </div>
            </div>

            <!-- Sites -->
            <div class="hrd-section">
              <div class="hrd-section__header">
                <div class="hrd-section__label" style="margin-bottom:0">
                  {{ t('hrColSpaces') }}
                  <span class="hrd-section__count">({{ form.spaceIds.length }}/{{ spaces.length }})</span>
                </div>
                <button v-if="spaces.length" type="button" class="hrd-toggle-all" @click="toggleAllSpaces">
                  {{ allSpacesChecked ? t('hrSelectNone') : t('hrSelectAll') }}
                </button>
              </div>
              <div class="hrd-pill-grid">
                <div
                  v-for="s in spaces"
                  :key="s.id"
                  class="hrd-pill"
                  :class="{ 'hrd-pill--active': form.spaceIds.includes(s.id) }"
                  @click="toggleSpace(s.id)"
                >
                  <Check :size="12" class="hrd-pill__check" />
                  {{ s.name }}
                </div>
              </div>
            </div>

            <!-- Secteurs -->
            <div class="hrd-section">
              <div class="hrd-section__label">{{ t('hrColSectors') }}</div>
              <div class="hrd-pill-grid">
                <div
                  v-for="sec in SECTORS"
                  :key="sec"
                  class="hrd-pill"
                  :class="{ 'hrd-pill--active': form.sectors.includes(sec) }"
                  @click="toggleSector(sec)"
                >
                  <Check :size="12" class="hrd-pill__check" />
                  {{ sec }}
                </div>
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div class="hrd-footer">
            <button class="hrd-btn hrd-btn--cancel" @click="close">{{ t('hrCancel') }}</button>
            <button class="hrd-btn hrd-btn--save" :disabled="!form.name.trim()" @click="submit">
              <Check :size="15" />
              {{ t('hrSave') }}
            </button>
          </div>

        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { reactive, ref, watch } from 'vue'
import { AlertCircle, Building2, Check, Pencil, X } from 'lucide-vue-next'
import { t } from '@/i18n'
import { HR_SECTORS as SECTORS, newId } from './hrShared'
import './hrForms.css'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  mode: { type: String, default: 'create' },
  initial: { type: Object, default: null },
  spaces: { type: Array, default: () => [] },
  isDark: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue', 'submit'])

const error = ref('')
const form = reactive({ id: '', name: '', email: '', phone: '', contactName: '', spaceIds: [], sectors: [] })

function reset() {
  const s = props.initial
  form.id = s?.id || newId()
  form.name = s?.name || ''
  form.email = s?.email || ''
  form.phone = s?.phone || ''
  form.contactName = s?.contactName || ''
  form.spaceIds = [...(s?.spaceIds || [])]
  form.sectors = [...(s?.sectors || [])]
  error.value = ''
}

watch(() => props.modelValue, (open) => { if (open) reset() })

const allSpacesChecked = ref(false)
watch(() => form.spaceIds.length, () => {
  allSpacesChecked.value = props.spaces.length > 0 && form.spaceIds.length === props.spaces.length
})

function toggleSpace(id) {
  const i = form.spaceIds.indexOf(id)
  if (i === -1) form.spaceIds.push(id)
  else form.spaceIds.splice(i, 1)
}
function toggleAllSpaces() {
  form.spaceIds = allSpacesChecked.value ? [] : props.spaces.map((s) => s.id)
}
function toggleSector(sec) {
  const i = form.sectors.indexOf(sec)
  if (i === -1) form.sectors.push(sec)
  else form.sectors.splice(i, 1)
}

function close() {
  emit('update:modelValue', false)
}
function submit() {
  if (!form.name.trim()) {
    error.value = t('hrNameRequired')
    return
  }
  emit('submit', {
    id: form.id,
    name: form.name.trim(),
    email: form.email,
    phone: form.phone,
    contactName: form.contactName,
    spaceIds: [...form.spaceIds],
    sectors: [...form.sectors],
  })
}
</script>
