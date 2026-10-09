<template>
  <v-dialog :model-value="modelValue" max-width="380" @update:model-value="$emit('update:modelValue', $event)">
    <v-card rounded="lg" class="lgp-card">
      <v-card-title class="lgp-title">
        <v-icon size="18" color="#ff3131">mdi-printer-outline</v-icon>
        {{ t('logiPrintDialogTitle') }}
      </v-card-title>
      <v-card-text>
        <p class="lgp-hint">{{ t('logiPrintDialogHint') }}</p>
        <div class="lgp-options">
          <button
            v-for="opt in options"
            :key="opt.value"
            type="button"
            class="lgp-option"
            :disabled="!!busy"
            @click="run(opt.value)"
          >
            <v-progress-circular v-if="busy === opt.value" size="18" width="2" indeterminate />
            <v-icon v-else size="20">{{ opt.icon }}</v-icon>
            <span>{{ t(opt.labelKey) }}</span>
          </button>
        </div>
        <p v-if="message" class="lgp-message">{{ message }}</p>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import { downloadXlsx, downloadPdf, printTable, exportFileName } from '@/utils/tableExport'

const { t } = useI18n()

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  /** Construit le tableau de la liste affichée au moment du clic (utils/logisticExportTables). */
  buildTable: { type: Function, required: true },
})
const emit = defineEmits(['update:modelValue'])

const options = [
  { value: 'xlsx', icon: 'mdi-microsoft-excel', labelKey: 'logiPrintExcel' },
  { value: 'pdf', icon: 'mdi-file-pdf-box', labelKey: 'logiPrintPdf' },
  { value: 'print', icon: 'mdi-printer-outline', labelKey: 'logiPrintBrowser' },
]
const busy = ref(null)
const message = ref('')

watch(() => props.modelValue, (open) => { if (open) message.value = '' })

async function run(format) {
  const table = props.buildTable()
  if (!table?.rows?.length) {
    message.value = t('logiPrintEmpty')
    return
  }
  busy.value = format
  try {
    const file = exportFileName(table.title)
    if (format === 'xlsx') await downloadXlsx(table, file)
    else if (format === 'pdf') await downloadPdf(table, file)
    else printTable(table)
    emit('update:modelValue', false)
  } catch (e) {
    message.value = e?.message || String(e)
  } finally {
    busy.value = null
  }
}
</script>

<style scoped>
.lgp-title { display: flex; align-items: center; gap: 8px; font-weight: var(--fw-bold); font-size: var(--fs-lg); padding: 16px 20px 6px; }
.lgp-hint { margin: 0 0 12px; font-size: var(--fs-base); color: var(--fb-muted, #6b7280); }
.lgp-options { display: flex; flex-direction: column; gap: 8px; }
.lgp-option { display: flex; align-items: center; gap: 10px; padding: 11px 14px; border: 1px solid var(--fb-border, #e5e7eb); border-radius: 10px; background: var(--fb-surface, #fff); color: var(--fb-text, #212121); font-size: var(--fs-md); font-weight: var(--fw-semibold); cursor: pointer; text-align: left; }
.lgp-option:hover:not(:disabled) { border-color: #ff3131; color: #ff3131; }
.lgp-option:disabled { opacity: 0.6; cursor: default; }
.lgp-message { margin: 10px 0 0; font-size: var(--fs-sm); color: #b91c1c; }
</style>
