<template>
  <v-dialog :model-value="modelValue" max-width="480" @update:model-value="$emit('update:modelValue', $event)">
    <v-card class="pmf">
      <v-card-title class="pmf__title">
        {{ isEdit ? t('paymentMethodEditTitle') : t('paymentMethodCreateTitle') }}
      </v-card-title>
      <v-card-subtitle class="pmf__subtitle">
        {{ isEdit ? t('paymentMethodEditSubtitle') : t('paymentMethodCreateSubtitle') }}
      </v-card-subtitle>

      <v-card-text>
        <v-alert v-if="error" type="error" variant="tonal" density="compact" rounded="lg" class="mb-3">{{ error }}</v-alert>

        <v-text-field
          v-model="form.name"
          :label="t('paymentMethodLabelName')"
          :placeholder="t('paymentMethodNamePlaceholder')"
          :error-messages="nameError"
          maxlength="100"
          variant="outlined"
          density="comfortable"
          autofocus
        />

        <v-combobox
          v-model="form.kind"
          :items="kindSuggestions"
          item-title="title"
          item-value="value"
          :return-object="false"
          :label="t('paymentMethodLabelKind')"
          :hint="t('paymentMethodKindHint')"
          persistent-hint
          :error-messages="kindError"
          maxlength="40"
          variant="outlined"
          density="comfortable"
          class="mb-2"
        />

        <v-text-field
          v-model.number="form.sortOrder"
          type="number"
          min="0"
          max="100000"
          :label="t('paymentMethodLabelOrder')"
          :hint="t('paymentMethodOrderHint')"
          persistent-hint
          variant="outlined"
          density="comfortable"
          class="mb-2"
        />

        <v-switch
          v-model="form.active"
          color="success"
          inset
          hide-details
          :label="t('paymentMethodLabelActive')"
        />
      </v-card-text>

      <v-card-actions class="pmf__actions">
        <v-spacer />
        <v-btn variant="text" @click="$emit('update:modelValue', false)">{{ t('cancel') }}</v-btn>
        <v-btn color="primary" variant="flat" :loading="saving" @click="submit">{{ t('paymentMethodSave') }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from '@/i18n/useI18n'

// Création / édition d'un moyen de paiement : nom, catégorie (liste ouverte), actif, ordre.
const props = defineProps({
  modelValue: { type: Boolean, default: false },
  method: { type: Object, default: null }, // null = création
  kindSuggestions: { type: Array, default: () => [] },
  nextOrder: { type: Number, default: 0 },
  save: { type: Function, required: true }, // (id|null, payload) => Promise
})
const emit = defineEmits(['update:modelValue', 'saved'])

const { t } = useI18n()
const form = reactive({ name: '', kind: '', sortOrder: 0, active: true })
const saving = ref(false)
const error = ref('')
const touched = ref(false)

const isEdit = computed(() => !!props.method)
const nameError = computed(() => (touched.value && !form.name.trim() ? t('paymentMethodNameRequired') : ''))
const kindError = computed(() => (touched.value && !String(form.kind || '').trim() ? t('paymentMethodKindRequired') : ''))

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    touched.value = false
    error.value = ''
    form.name = props.method?.name || ''
    form.kind = props.method?.kind || ''
    form.sortOrder = props.method?.sortOrder ?? props.nextOrder
    form.active = props.method?.active ?? true
  },
  { immediate: true }
)

async function submit() {
  touched.value = true
  const name = form.name.trim()
  const kind = String(form.kind || '').trim()
  if (!name || !kind) return
  saving.value = true
  error.value = ''
  try {
    await props.save(props.method?.id || null, {
      name,
      kind,
      active: !!form.active,
      sortOrder: Math.max(0, Math.round(Number(form.sortOrder) || 0)),
    })
    emit('saved')
    emit('update:modelValue', false)
  } catch (e) {
    error.value = e.message
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.pmf__title {
  font-size: var(--fs-xl);
  font-weight: var(--fw-bold);
}
.pmf__subtitle {
  font-size: var(--fs-base);
}
.pmf__actions {
  padding: 0 24px 16px;
}
</style>
