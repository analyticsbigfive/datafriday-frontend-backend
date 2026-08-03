<template>
  <SectionCard :title="t('b2MenuItemSalesInputTitle')" icon="mdi-food-drumstick-outline">
    <div class="misi-hint">{{ t('b2MenuItemSalesInputHint') }}</div>

    <div v-if="!loading && !rows.length" class="misi-empty">{{ t('b2MenuItemSalesInputEmpty') }}</div>

    <div v-else class="misi-list">
      <div v-for="row in rows" :key="row.menuItemId" class="misi-row">
        <div class="misi-row__name">{{ row.name }}</div>
        <div class="misi-row__fields">
          <div v-if="row.needsQuantity" class="misi-field">
            <label class="misi-field-label">{{ t('b2MenuItemSalesInputQuantity') }}</label>
            <input
              class="misi-input" type="number" min="0" step="1"
              :value="values[row.menuItemId]?.quantity ?? ''"
              @change="(e) => commit(row.menuItemId, 'quantity', e.target.value)"
            />
          </div>
          <div v-if="row.needsRevenue" class="misi-field">
            <label class="misi-field-label">{{ t('b2MenuItemSalesInputRevenue') }}</label>
            <input
              class="misi-input" type="number" min="0" step="0.01"
              :value="values[row.menuItemId]?.revenueHt ?? ''"
              @change="(e) => commit(row.menuItemId, 'revenueHt', e.target.value)"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Aperçu client (miroir de applyMenuItemRatios backend, cf. utils/menuItemRatios.js) —
         même principe que le bloc Sinking Rules de StaffingInputsSection.vue. -->
    <div v-if="triggered.length" class="misi-triggered">
      <div v-for="o in triggered" :key="o.roleId" class="misi-triggered__line">
        <v-icon icon="mdi-check-circle" size="15" class="misi-triggered__icon" />
        <strong>{{ roleName(o.roleId) }}</strong> × {{ o.qty }}
      </div>
    </div>
  </SectionCard>
</template>

<script setup>
import { computed, inject, ref, watch } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import SectionCard from './SectionCard.vue'
import { getShopAvailableMenuItems } from '@/api/endpoints/menu.api'
import { getHrRoleMenuItemRatios } from '@/api/endpoints/hr.api'
import { getElementMenuItemSalesInput, putElementMenuItemSalesInput } from '@/api/endpoints/builder-v2.api'
import { fetchHrRolesCached } from '@/utils/hrRolesCache'
import { applyMenuItemRatios, resolveTargetMenuItemIds } from '@/utils/menuItemRatios'

const { t } = useI18n()
const store = inject('builderStore')
const element = computed(() => store.selectedElement.value)

const loading = ref(false)
const shopItems = ref([]) // items vendus sur CE shop (getShopAvailableMenuItems, enabledOnly)
const ratios = ref([]) // HrRoleMenuItemRatio de l'espace courant
const roles = ref([])
const values = ref({}) // menuItemId → { quantity, revenueHt }

function roleName(roleId) {
  return roles.value.find((r) => r.id === roleId)?.name || roleId
}

// Un item n'est affiché QUE s'il est réellement vendu sur ce shop ET ciblé par au moins une
// association (explicite ou "Tout Sélectionner") — pas tout le catalogue par défaut.
const rows = computed(() => {
  const shopIds = shopItems.value.map((i) => i.id)
  const needsQuantity = new Set()
  const needsRevenue = new Set()
  for (const ratio of ratios.value) {
    const targets = resolveTargetMenuItemIds(ratio, shopIds).filter((id) => shopIds.includes(id))
    const bucket = ratio.ratioBasis === 'REVENUE' ? needsRevenue : needsQuantity
    for (const id of targets) bucket.add(id)
  }
  const relevantIds = new Set([...needsQuantity, ...needsRevenue])
  return shopItems.value
    .filter((i) => relevantIds.has(i.id))
    .map((i) => ({
      menuItemId: i.id,
      name: i.name,
      needsQuantity: needsQuantity.has(i.id),
      needsRevenue: needsRevenue.has(i.id),
    }))
})

const triggered = computed(() => {
  const shopIds = shopItems.value.map((i) => i.id)
  const ratioInputs = ratios.value.map((r) => ({
    roleId: r.roleId,
    ratioBasis: r.ratioBasis,
    ratioValue: r.ratioValue,
    unitQty: r.unitQty,
    targetMenuItemIds: resolveTargetMenuItemIds(r, shopIds),
  }))
  const sales = Object.entries(values.value).map(([menuItemId, v]) => ({
    menuItemId, quantity: v.quantity ?? 0, revenueHt: v.revenueHt ?? 0,
  }))
  return applyMenuItemRatios(ratioInputs, sales)
})

function commit(menuItemId, field, raw) {
  const num = raw === '' ? null : Number(raw)
  values.value = {
    ...values.value,
    [menuItemId]: { ...(values.value[menuItemId] || {}), [field]: Number.isFinite(num) ? num : null },
  }
  save()
}

function save() {
  const el = element.value
  if (!el) return
  const cfgId = store.state.activeConfigId || undefined
  const rowsPayload = Object.entries(values.value)
    .filter(([, v]) => v.quantity != null || v.revenueHt != null)
    .map(([menuItemId, v]) => ({ menuItemId, quantity: v.quantity ?? undefined, revenueHt: v.revenueHt ?? undefined }))
  putElementMenuItemSalesInput(el.id, rowsPayload, cfgId).catch(() => {
    store.notify(t('b2ToastSaveMenuItemSalesInputFailed'))
  })
}

watch(
  [() => element.value?.id, () => store.state.activeConfigId],
  async ([shopId]) => {
    shopItems.value = []
    values.value = {}
    if (!shopId) return
    loading.value = true
    try {
      const cfgId = store.state.activeConfigId || undefined
      const [itemsRes, existing, ratiosRes, rolesRes] = await Promise.all([
        getShopAvailableMenuItems(shopId, cfgId, { enabledOnly: true }),
        getElementMenuItemSalesInput(shopId, cfgId),
        store.state.spaceId ? getHrRoleMenuItemRatios(store.state.spaceId) : Promise.resolve([]),
        fetchHrRolesCached(),
      ])
      const payload = itemsRes?.data ?? itemsRes
      shopItems.value = payload?.items || []
      ratios.value = ratiosRes || []
      roles.value = rolesRes || []
      const map = {}
      for (const row of existing || []) {
        map[row.menuItemId] = { quantity: row.quantity ?? null, revenueHt: row.revenueHt ?? null }
      }
      values.value = map
    } catch (_) {
      shopItems.value = []
      ratios.value = []
    } finally {
      loading.value = false
    }
  },
  { immediate: true },
)
</script>

<style scoped>
.misi-hint { font-size: var(--fs-xs); color: rgba(var(--v-theme-on-surface), 0.5); margin-bottom: 10px; }
.misi-empty { font-size: var(--fs-sm); color: rgba(var(--v-theme-on-surface), 0.5); padding: 6px 0; }
.misi-list { display: flex; flex-direction: column; gap: 10px; }
.misi-row {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding-bottom: 10px; border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}
.misi-row:last-child { border-bottom: none; padding-bottom: 0; }
.misi-row__name { font-size: var(--fs-sm); font-weight: 600; color: rgb(var(--v-theme-on-surface)); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.misi-row__fields { display: flex; gap: 8px; flex-shrink: 0; }
.misi-field { display: flex; flex-direction: column; gap: 4px; width: 110px; }
.misi-field-label { font-size: var(--fs-xs); color: rgba(var(--v-theme-on-surface), 0.55); }
.misi-input {
  width: 100%; padding: 7px 9px; font-size: var(--fs-sm); color: rgb(var(--v-theme-on-surface));
  background: rgba(var(--v-theme-on-surface), 0.05); border: 1px solid transparent; border-radius: 8px;
  outline: none; transition: background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
}
.misi-input:hover { background: rgba(var(--v-theme-on-surface), 0.07); }
.misi-input:focus { background: rgb(var(--v-theme-surface)); border-color: #ff3131; box-shadow: 0 0 0 3px rgba(255, 49, 49, 0.12); }
.misi-triggered {
  margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  display: flex; flex-direction: column; gap: 6px;
}
.misi-triggered__line { display: flex; align-items: center; gap: 6px; font-size: var(--fs-sm); color: rgb(var(--v-theme-on-surface)); }
.misi-triggered__icon { color: #16a34a; flex-shrink: 0; }
</style>
