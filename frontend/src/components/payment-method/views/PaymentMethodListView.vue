<template>
  <div class="pml-root" :class="{ 'pml--dark': isDark }">
    <div class="pml-header">
      <div class="pml-header__inner">
        <div class="pml-header__left">
          <div class="pml-header__icon"><CreditCard :size="22" color="white" /></div>
          <div>
            <h1 class="pml-header__title">{{ t('paymentMethodTitle') }}</h1>
            <p class="pml-header__subtitle">{{ t('paymentMethodSubtitle') }}</p>
          </div>
        </div>
        <button type="button" class="pml-add" @click="openCreate">
          <Plus :size="17" /> {{ t('paymentMethodAdd') }}
        </button>
      </div>
    </div>

    <div class="pml-searchbar">
      <div class="pml-searchbar__inner">
        <Search :size="17" class="pml-searchbar__icon" />
        <input
          v-model="search"
          class="pml-searchbar__input"
          type="search"
          :placeholder="t('paymentMethodSearchPlaceholder')"
          :aria-label="t('paymentMethodSearchPlaceholder')"
        />
        <span class="pml-searchbar__count">{{ filtered.length }} {{ t('paymentMethodTotal') }}</span>
      </div>
    </div>

    <div class="pml-content">
      <v-progress-linear v-if="loading" indeterminate color="#ff3131" height="3" rounded class="mb-4" />
      <v-alert v-if="error" type="error" variant="tonal" density="compact" rounded="lg" class="mb-4">{{ error }}</v-alert>

      <div class="pml-table-wrap">
        <v-data-table
          :headers="headers"
          :items="filtered"
          item-value="id"
          density="compact"
          :items-per-page="25"
          class="pml-table"
        >
          <template #item.name="{ item }">
            <span class="pml-name">{{ item.name }}</span>
            <span v-if="item.isSystem" class="pml-system" :title="t('paymentMethodSystemHint')">{{ t('paymentMethodSystem') }}</span>
          </template>
          <template #item.kind="{ item }">
            <span class="pml-kind">{{ kindLabel(item.kind) }}</span>
          </template>
          <template #item.active="{ item }">
            <v-switch
              :model-value="item.active"
              color="success"
              density="compact"
              inset
              hide-details
              :aria-label="t('paymentMethodLabelActive')"
              @update:model-value="setActive(item, !!$event)"
            />
          </template>
          <template #item.actions="{ item }">
            <div class="pml-actions">
              <button type="button" class="pml-abtn pml-abtn--edit" :aria-label="t('paymentMethodEditTitle')" @click="openEdit(item)">
                <Pencil :size="15" />
              </button>
              <button
                v-if="!item.isSystem"
                type="button"
                class="pml-abtn pml-abtn--del"
                :aria-label="t('paymentMethodDeleteTitle')"
                @click="openDelete(item)"
              >
                <Trash2 :size="15" />
              </button>
            </div>
          </template>
          <template #no-data>
            <div class="pml-empty">{{ t('paymentMethodEmpty') }}</div>
          </template>
        </v-data-table>
      </div>
    </div>

    <PaymentMethodFormDialog
      v-model="formOpen"
      :method="selected"
      :kind-suggestions="kindSuggestions"
      :next-order="nextOrder"
      :save="save"
    />
    <PaymentMethodDeleteDialog
      v-model="deleteOpen"
      :method="selected"
      :loading="deleting"
      :error="deleteError"
      @confirm="confirmDelete"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useTheme } from 'vuetify'
import { CreditCard, Pencil, Plus, Search, Trash2 } from 'lucide-vue-next'
import { useI18n } from '@/i18n/useI18n'
import { usePaymentMethods } from '@/composables/usePaymentMethods'
import PaymentMethodDeleteDialog from '../dialogs/PaymentMethodDeleteDialog.vue'
import PaymentMethodFormDialog from '../dialogs/PaymentMethodFormDialog.vue'

// Référentiel Configuration > Moyens de paiement, sur le modèle des autres référentiels
// (en-tête rouge, recherche, tableau). Un moyen système se désactive mais ne se supprime pas.
const { t } = useI18n()
const theme = useTheme()
const isDark = computed(() => !!theme.global.current.value.dark)
const { methods, loading, error, kindSuggestions, kindLabel, load, save, setActive, remove } = usePaymentMethods()

const search = ref('')
const formOpen = ref(false)
const deleteOpen = ref(false)
const deleting = ref(false)
const deleteError = ref('')
const selected = ref(null)

const headers = computed(() => [
  { title: t('paymentMethodColName'), key: 'name', sortable: false },
  { title: t('paymentMethodColKind'), key: 'kind', sortable: false },
  { title: t('paymentMethodColOrder'), key: 'sortOrder', sortable: false, width: 100 },
  { title: t('paymentMethodColActive'), key: 'active', sortable: false, width: 110 },
  { title: t('paymentMethodColActions'), key: 'actions', sortable: false, align: 'end', width: 120 },
])

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return methods.value
  return methods.value.filter((m) => `${m.name} ${m.kind}`.toLowerCase().includes(q))
})
const nextOrder = computed(() => methods.value.reduce((max, m) => Math.max(max, (m.sortOrder ?? 0) + 1), 0))

function openCreate() {
  selected.value = null
  formOpen.value = true
}
function openEdit(method) {
  selected.value = method
  formOpen.value = true
}
function openDelete(method) {
  selected.value = method
  deleteError.value = ''
  deleteOpen.value = true
}
async function confirmDelete() {
  deleting.value = true
  deleteError.value = ''
  try {
    await remove(selected.value)
    deleteOpen.value = false
  } catch (e) {
    deleteError.value = e.message
  } finally {
    deleting.value = false
  }
}

onMounted(() => load(true))
</script>

<style scoped>
.pml-root {
  width: 100%;
  min-height: 100%;
  background: #f6f7fb;
}
.pml-header {
  position: sticky;
  top: 0;
  z-index: 100;
  background: #ff3131;
  box-shadow: 0 4px 20px rgba(255, 49, 49, 0.25);
}
.pml-header__inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
  padding: 18px 28px;
}
.pml-header__left {
  display: flex;
  align-items: center;
  gap: 14px;
}
.pml-header__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.2);
}
.pml-header__title {
  margin: 0;
  color: #ffffff;
  font-size: var(--fs-xl);
  font-weight: var(--fw-bold);
  line-height: 1.2;
}
.pml-header__subtitle {
  margin: 3px 0 0;
  color: rgba(255, 255, 255, 0.72);
  font-size: var(--fs-base);
}
.pml-add {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 9px 18px;
  border: 2px solid rgba(255, 255, 255, 0.85);
  border-radius: 100px;
  background: transparent;
  color: #ffffff;
  font-size: var(--fs-base);
  font-weight: var(--fw-bold);
  white-space: nowrap;
  cursor: pointer;
  transition: all 0.2s;
}
.pml-add:hover {
  background: #ffffff;
  color: #ff3131;
}
.pml-searchbar {
  position: sticky;
  top: 81px;
  z-index: 99;
  border-bottom: 1px solid #e5e7eb;
  background: #ffffff;
}
.pml-searchbar__inner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 28px;
}
.pml-searchbar__icon {
  flex-shrink: 0;
  color: #9ca3af;
}
.pml-searchbar__input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  color: #111827;
  font-size: var(--fs-md);
}
.pml-searchbar__count {
  color: #9ca3af;
  font-size: var(--fs-sm);
  white-space: nowrap;
}
.pml-content {
  padding: 24px 28px;
}
.pml-table-wrap {
  overflow: hidden;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  background: #ffffff;
}
.pml-table :deep(.v-data-table__th),
.pml-table :deep(.v-data-table__td) {
  padding: 10px 16px;
  font-size: var(--fs-base);
}
.pml-table :deep(.v-data-table__th) {
  background: #fafafa !important;
  color: #9ca3af !important;
  font-size: var(--fs-xs) !important;
  font-weight: var(--fw-semibold);
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.pml-name {
  font-weight: var(--fw-semibold);
}
.pml-system {
  margin-left: 8px;
  padding: 2px 8px;
  border-radius: 999px;
  background: #eff6ff;
  color: #2563eb;
  font-size: var(--fs-xs);
  font-weight: var(--fw-semibold);
}
.pml-kind {
  padding: 2px 10px;
  border-radius: 999px;
  background: #f3f4f6;
  color: #374151;
  font-size: var(--fs-sm);
  font-weight: var(--fw-medium);
}
.pml-actions {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
}
.pml-abtn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 8px;
  cursor: pointer;
}
.pml-abtn--edit {
  background: #eff6ff;
  color: #2563eb;
}
.pml-abtn--edit:hover {
  background: #dbeafe;
}
.pml-abtn--del {
  background: #fef2f2;
  color: #ff3131;
}
.pml-abtn--del:hover {
  background: #fee2e2;
}
.pml-empty {
  padding: 24px;
  color: #6b7280;
  font-size: var(--fs-md);
  text-align: center;
}

.pml--dark.pml-root {
  background: #111827;
}
.pml--dark .pml-searchbar {
  border-bottom-color: #374151;
  background: #1a2332;
}
.pml--dark .pml-searchbar__input {
  color: #f9fafb;
}
.pml--dark .pml-table-wrap {
  border-color: rgba(255, 255, 255, 0.08);
  background: #1e293b;
}
.pml--dark .pml-table :deep(.v-data-table__th) {
  background: #1a2332 !important;
}
.pml--dark .pml-table :deep(.v-data-table__td) {
  color: #e2e8f0;
}
.pml--dark .pml-kind {
  background: #1f2937;
  color: #cbd5e1;
}
.pml--dark .pml-system {
  background: rgba(37, 99, 235, 0.15);
  color: #93c5fd;
}
.pml--dark .pml-abtn--edit {
  background: rgba(37, 99, 235, 0.15);
  color: #93c5fd;
}
.pml--dark .pml-abtn--del {
  background: rgba(255, 49, 49, 0.14);
  color: #fca5a5;
}
</style>
