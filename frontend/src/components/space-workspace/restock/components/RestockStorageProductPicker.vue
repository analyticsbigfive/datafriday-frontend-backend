<template>
  <v-menu v-model="open" :close-on-content-click="false" location="bottom end" max-width="360">
    <template #activator="{ props: menuProps }">
      <v-btn
        v-bind="menuProps"
        class="rsp-btn"
        variant="outlined"
        size="small"
        :aria-label="t('srStoragePickerAdd')"
      >
        <v-icon size="16" class="mr-1">mdi-plus</v-icon>
        {{ t('srStoragePickerAdd') }}
      </v-btn>
    </template>
    <v-card class="rsp-card" variant="elevated">
      <div class="rsp-search">
        <v-icon size="16">mdi-magnify</v-icon>
        <input
          v-model="query"
          class="rsp-input"
          type="search"
          :placeholder="t('srStoragePickerSearch')"
          :aria-label="t('srStoragePickerSearch')"
        />
      </div>
      <div v-if="loading" class="rsp-note">{{ t('srBreakdownLoading') }}</div>
      <div v-else-if="error" class="rsp-note">{{ t('srStoragePickerError') }}</div>
      <div v-else-if="!shown.length" class="rsp-note">{{ t('srStoragePickerNone') }}</div>
      <ul v-else class="rsp-list" role="listbox">
        <li v-for="p in shown" :key="p.name" role="option">
          <button type="button" class="rsp-item" @click="pick(p)">
            <span class="rsp-name">{{ p.name }}</span>
            <span v-if="p.category" class="rsp-sub">{{ p.category }}</span>
          </button>
        </li>
      </ul>
    </v-card>
  </v-menu>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import { useStorageProductOptions } from '@/composables/useStorageProductOptions'
import { filterPickerProducts } from '@/utils/restockStoragePicker'

// Sélecteur de produit (page Stockage) pour ouvrir le drawer Stockage depuis l'onglet STOCK.
// Émet `pick` avec { name, marketPriceId, reference } ; la vue ouvre le drawer.
const emit = defineEmits(['pick'])
const { t } = useI18n()
const { products, loading, error, ensureLoaded } = useStorageProductOptions()

const open = ref(false)
const query = ref('')
const MAX_SHOWN = 100
const shown = computed(() => filterPickerProducts(products.value, query.value).slice(0, MAX_SHOWN))

watch(open, (v) => {
  if (v) { query.value = ''; ensureLoaded() }
})

function pick(p) {
  open.value = false
  emit('pick', { name: p.name, marketPriceId: p.marketPriceId, reference: p.reference })
}
</script>

<style scoped>
.rsp-btn { text-transform: none; letter-spacing: 0; font-size: var(--fs-md); font-weight: var(--fw-medium); }
.rsp-card { width: 340px; max-width: 100%; padding: 8px; }
.rsp-search { display: flex; align-items: center; gap: 8px; padding: 4px 8px 8px; border-bottom: 1px solid rgba(128, 128, 128, 0.25); }
.rsp-input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; color: inherit; font-size: var(--fs-md); }
.rsp-list { list-style: none; margin: 4px 0 0; padding: 0; max-height: 280px; overflow-y: auto; }
.rsp-item { display: flex; flex-direction: column; align-items: flex-start; width: 100%; padding: 6px 8px; border: 0; border-radius: 6px; background: transparent; color: inherit; text-align: left; cursor: pointer; }
.rsp-item:hover, .rsp-item:focus-visible { background: rgba(128, 128, 128, 0.14); }
.rsp-name { font-size: var(--fs-md); font-weight: var(--fw-medium); overflow-wrap: anywhere; }
.rsp-sub { font-size: var(--fs-sm); opacity: 0.7; }
.rsp-note { padding: 12px 8px; font-size: var(--fs-md); opacity: 0.75; }
</style>
