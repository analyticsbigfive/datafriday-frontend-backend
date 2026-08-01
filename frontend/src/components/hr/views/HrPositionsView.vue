<template>
  <div id="hr-positions-page" :class="{ 'hsl--dark': isDark }">

    <!-- ── Header ── -->
    <div class="hsl-header sticky-header">
      <div class="hsl-header__inner">
        <div class="hsl-header__left">
          <div class="hsl-header__icon">
            <Briefcase :size="22" color="white" />
          </div>
          <div>
            <h1 class="hsl-header__title">{{ t('navHrPositions') }}</h1>
            <p class="hsl-header__subtitle">{{ t('hrPositionsSubtitle') }}</p>
          </div>
        </div>
        <div class="hsl-header__right">
          <button class="hsl-add-btn" @click="openAdd">
            <Plus :size="17" class="me-1" />
            {{ t('hrPositionsAdd') }}
          </button>
        </div>
      </div>
    </div>

    <!-- ── Search bar ── -->
    <div class="hsl-searchbar sticky-search">
      <div class="hsl-searchbar__inner">
        <Search :size="18" class="hsl-searchbar__icon" />
        <input
          v-model="searchQuery"
          class="hsl-searchbar__input"
          type="search"
          :placeholder="t('hrPositionsSearch')"
        />
        <span class="hsl-searchbar__count">{{ filtered.length }} {{ t('hrPositionsCount') }}</span>
        <button v-if="searchQuery" class="hsl-searchbar__clear" :aria-label="t('hrCancel')" @click="searchQuery = ''">
          <X :size="16" />
        </button>
      </div>
    </div>

    <!-- ── Content ── -->
    <div class="hsl-content">
      <v-progress-linear v-if="loading" indeterminate color="#ff3131" height="3" rounded class="mb-4" />

      <div v-if="bulkSelected.length" class="bulk-bar">
        <span class="bulk-bar__info">{{ bulkSelected.length }} {{ t('bulkSelected') }}</span>
        <div class="bulk-bar__actions">
          <button type="button" class="bulk-bar__clear" @click="bulkSelected = []">{{ t('bulkDeselect') }}</button>
          <button type="button" class="bulk-bar__del" @click="openBulkDelete"><Trash2 :size="15" /> {{ t('delete') }}</button>
        </div>
      </div>

      <div class="hsl-table-wrap">
        <v-data-table
          v-model="bulkSelected"
          :headers="tableHeaders"
          :items="filtered"
          item-value="id"
          show-select
          density="compact"
          class="hsl-table"
        >
          <template #item.positionName="{ item }">
            <div class="d-flex align-center" style="gap:12px">
              <div class="hsl-avatar" :style="{ background: avatarGradient(item.positionName) }">{{ getInitials(item.positionName) }}</div>
              <div class="hsl-cell-name">{{ item.positionName }}</div>
            </div>
          </template>

          <template #item.supplier="{ item }">
            <span class="hsl-badge">{{ supplierName(item.supplierId) }}</span>
          </template>

          <template #item.sector="{ item }">
            <span v-if="item.sector" class="hsl-badge">{{ departmentLabel(item.sector) }}</span>
            <span v-else class="hsl-badge hsl-badge--more">—</span>
          </template>

          <template #item.ratePerHour="{ item }">
            <span class="hsl-cell-rate">{{ formatRate(item.ratePerHour) }}</span>
          </template>

          <template #item.actions="{ item }">
            <div class="d-flex justify-end" style="gap:6px">
              <button class="hsl-table-btn" :aria-label="t('hrEdit')" @click.stop="openEdit(item)"><Pencil :size="14" /></button>
              <button class="hsl-table-btn hsl-table-btn--del" :aria-label="t('hrDelete')" @click.stop="onDelete(item)"><Trash2 :size="14" /></button>
            </div>
          </template>

          <template #no-data>
            <div class="hsl-empty">
              <div class="hsl-empty__icon"><Briefcase :size="40" style="color:#d1d5db" /></div>
              <h3 class="hsl-empty__title">{{ t('hrPositionsEmpty') }}</h3>
            </div>
          </template>
        </v-data-table>
      </div>
    </div>

    <!-- Drawer création / édition -->
    <HrRoleFormDrawer
      v-model="drawerOpen"
      :mode="drawerMode"
      :initial="editing"
      :suppliers="suppliers"
      :spaces="spaces"
      :position-names="positionNames"
      @saved="load"
    />

    <!-- Dialog suppression -->
    <HrDeleteDialog
      v-model="deleteOpen"
      :item-name="deleteTarget?.positionName || ''"
      :title="t('hrDeletePositionTitle')"
      :loading="deleting"
      @confirm="confirmDelete"
    />

    <!-- Dialog suppression multiple -->
    <BulkDeleteDialog
      v-model="bulkOpen"
      :title="t('bulkDeleteTitle')"
      :message="`${t('bulkDeletePrefix')} ${bulkSelected.length} ${t('bulkItems')} ?`"
      :progress="bulkProgress" :total="bulkTotal" :progress-label="t('bulkDeleted')"
      :confirm-label="t('delete')" :cancel-label="t('cancel')" :deleting-label="t('bulkDeleting')"
      :loading="bulkLoading" :error="bulkError" :is-dark="isDark"
      @confirm="confirmBulkDelete"
    />

  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useStore } from 'vuex'
import { useTheme } from 'vuetify'
import { Briefcase, Pencil, Plus, Search, Trash2, X } from 'lucide-vue-next'
import { t } from '@/i18n'
import * as hrApi from '@/utils/hrApi'
import { getSpacesLight } from '@/api/endpoints/space.api'
import HrRoleFormDrawer from '../drawers/HrRoleFormDrawer.vue'
import HrDeleteDialog from '../dialogs/HrDeleteDialog.vue'
import BulkDeleteDialog from '@/components/common/BulkDeleteDialog.vue'

// CFG-2 Étape 4 : HrRole.department (exposé ici comme `sector`, cf. hrApi.js::positionFromDb)
// stocke désormais un CODE stable ('shop'), plus le libellé — résolu pour l'affichage.
const store = useStore()
onMounted(() => store.dispatch('departments/fetchDepartments'))
function departmentLabel(value) {
  const dept = (store.getters['departments/departments'] || []).find((d) => (d.code ?? d.id) === value)
  return dept?.name || value
}

// Dark mode autonome (pattern maison) : suit le thème Vuetify global.
const theme = useTheme()
const isDark = computed(() => !!theme.global.current.value.dark)

// Avatars de table (parité HrSuppliersView).
const AVATAR_GRADIENTS = [
  'linear-gradient(135deg,#ff3131,#e84444)',
  'linear-gradient(135deg,#6c63ff,#a29bfe)',
  'linear-gradient(135deg,#00b894,#00cec9)',
  'linear-gradient(135deg,#e17055,#ff3131)',
  'linear-gradient(135deg,#0984e3,#74b9ff)',
  'linear-gradient(135deg,#fd79a8,#ff3131)',
]
function getInitials(name) {
  if (!name) return '?'
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()
}
function avatarGradient(name) {
  if (!name) return AVATAR_GRADIENTS[0]
  const idx = (name.charCodeAt(0) + (name.charCodeAt(1) || 0)) % AVATAR_GRADIENTS.length
  return AVATAR_GRADIENTS[idx]
}

const tableHeaders = [
  { title: t('hrColPosition'), key: 'positionName' },
  { title: t('hrColSupplier'), key: 'supplier', sortable: false },
  { title: t('hrColSector'), key: 'sector', sortable: false },
  { title: t('hrColRate'), key: 'ratePerHour' },
  { title: '', key: 'actions', sortable: false, align: 'end' },
]

const positions = ref([])
const suppliers = ref([])
const spaces = ref([])
const positionNames = ref([])
const searchQuery = ref('')
const loading = ref(false)

async function load() {
  loading.value = true
  try {
    // spaces : nécessaire pour la création d'agence à la volée depuis Edit HR role (BUG-266-02,
    // tiroir HrSupplierFormDrawer imbriqué) — même source que HrSuppliersView.vue.
    const [positionRows, supplierRows, nameRows, spaceRows] = await Promise.all([
      hrApi.getAllStaffPositions(),
      hrApi.getAllHRSuppliers(),
      hrApi.getAllPositionNames(),
      getSpacesLight().catch(() => []),
    ])
    positions.value = Array.isArray(positionRows) ? positionRows : []
    suppliers.value = Array.isArray(supplierRows) ? supplierRows : []
    positionNames.value = Array.isArray(nameRows) ? nameRows : []
    spaces.value = Array.isArray(spaceRows) ? spaceRows : []
  } finally {
    loading.value = false
  }
}
onMounted(load)

const supplierNameById = computed(() => Object.fromEntries(suppliers.value.map((s) => [s.id, s.name])))
function supplierName(id) {
  return supplierNameById.value[id] || '—'
}
function formatRate(rate) {
  if (rate === null || rate === undefined || rate === '') return '—'
  const n = Number(rate)
  if (Number.isNaN(n)) return '—'
  return `${n.toLocaleString('fr-FR')} / h`
}

const filtered = computed(() => {
  const q = searchQuery.value?.trim().toLowerCase()
  if (!q) return positions.value
  return positions.value.filter((p) =>
    [p.positionName, p.sector, supplierName(p.supplierId)].some((v) => (v || '').toLowerCase().includes(q))
  )
})

// Création / édition : drawer coulissant.
const drawerOpen = ref(false)
const drawerMode = ref('create')
const editing = ref(null)
function openAdd() {
  drawerMode.value = 'create'
  editing.value = null
  drawerOpen.value = true
}
function openEdit(position) {
  drawerMode.value = 'edit'
  editing.value = position
  drawerOpen.value = true
}

// Suppression
const deleteOpen = ref(false)
const deleteTarget = ref(null)
const deleting = ref(false)
function onDelete(position) {
  deleteTarget.value = position
  deleteOpen.value = true
}
async function confirmDelete() {
  if (!deleteTarget.value?.id) return
  deleting.value = true
  try {
    await hrApi.deleteStaffPosition(deleteTarget.value.id)
    deleteOpen.value = false
    deleteTarget.value = null
    await load()
  } finally {
    deleting.value = false
  }
}

// Suppression multiple
const bulkSelected = ref([])
const bulkOpen = ref(false)
const bulkLoading = ref(false)
const bulkError = ref('')
const bulkProgress = ref(0)
const bulkTotal = ref(0)
function openBulkDelete() { bulkError.value = ''; bulkProgress.value = 0; bulkTotal.value = 0; bulkOpen.value = true }
async function confirmBulkDelete() {
  const ids = [...bulkSelected.value]; if (!ids.length) return
  bulkLoading.value = true; bulkError.value = ''; bulkTotal.value = ids.length; bulkProgress.value = 0
  const failed = []
  for (const id of ids) { try { await hrApi.deleteStaffPosition(id) } catch (e) { failed.push(id) } bulkProgress.value += 1 }
  await load()
  bulkLoading.value = false; bulkSelected.value = failed
  if (failed.length) bulkError.value = `${failed.length} poste(s) n'ont pas pu être supprimés.`
  else bulkOpen.value = false
}
</script>

<style scoped>
/* Vue rendue dans le chrome DashboardView (barre + rail), comme HrSuppliersView :
   pas de header applicatif propre. Style calqué sur .hsl-* / .slv-* (tokens de la charte). */
#hr-positions-page {
  background: #f4f5f7;
  height: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

/* ── Header rouge ── */
.hsl-header { background: #ff3131; box-shadow: 0 4px 20px rgba(255, 49, 49, 0.25); }
.sticky-header { position: sticky; top: 0; z-index: 100; flex-shrink: 0; }
.hsl-header__inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 28px;
  gap: 16px;
}
.hsl-header__left { display: flex; align-items: center; gap: 14px; }
.hsl-header__icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.hsl-header__title { font-size: var(--fs-xl); font-weight: var(--fw-bold); color: #fff; margin: 0; line-height: 1.2; }
.hsl-header__subtitle { font-size: var(--fs-sm); color: rgba(255, 255, 255, 0.72); margin: 3px 0 0; }
.hsl-header__right { display: flex; align-items: center; gap: 14px; }
.hsl-add-btn {
  display: inline-flex;
  align-items: center;
  padding: 9px 18px;
  border-radius: 100px;
  border: 2px solid rgba(255, 255, 255, 0.85);
  background: transparent;
  color: #fff;
  font-size: var(--fs-base);
  font-weight: var(--fw-bold);
  cursor: pointer;
  transition: background 0.15s;
}
.hsl-add-btn:hover { background: rgba(255, 255, 255, 0.15); }

/* ── Recherche ── */
.hsl-searchbar { background: #fff; border-bottom: 1px solid #e5e7eb; flex-shrink: 0; }
.sticky-search { position: sticky; top: 80px; z-index: 90; }
.hsl-searchbar__inner { display: flex; align-items: center; gap: 10px; padding: 12px 28px; }
.hsl-searchbar__icon { color: #9ca3af; flex-shrink: 0; }
.hsl-searchbar__input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  font-size: var(--fs-md);
  color: #111827;
  font-family: inherit;
}
.hsl-searchbar__input::placeholder { color: #9ca3af; }
.hsl-searchbar__count { font-size: var(--fs-sm); color: #9ca3af; white-space: nowrap; }
.hsl-searchbar__clear {
  background: none;
  border: none;
  padding: 2px;
  cursor: pointer;
  color: #9ca3af;
  display: flex;
  align-items: center;
  border-radius: 4px;
}
.hsl-searchbar__clear:hover { color: #ff3131; }

/* ── Contenu ── */
.hsl-content { padding: 24px 28px; }

/* ── Table (référence EventsListView : .elv-table*) ── */
.hsl-table-wrap { background: #fff; border-radius: 16px; border: 1px solid #e5e7eb; overflow: hidden; }
.hsl-table :deep(.v-data-table__th), .hsl-table :deep(.v-data-table__td) { font-size: var(--fs-base); padding-top: 10px; padding-bottom: 10px; padding-left: 16px; padding-right: 16px; }
.hsl-table :deep(.v-data-table__td) { vertical-align: middle; }
.hsl-table :deep(.v-data-table__th) { font-size: var(--fs-xs) !important; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; color: #9ca3af !important; background: #fafafa !important; }
.hsl-table :deep(tbody tr:hover td) { background: #fafafa !important; }
.hsl-table :deep(.v-data-table-footer) { border-top: 1px solid #e5e7eb; background: #fafafa !important; }

.hsl-cell-name { font-weight: var(--fw-semibold); font-size: var(--fs-md); }
.hsl-cell-rate { font-weight: var(--fw-semibold); font-size: var(--fs-md); color: #111827; }

.hsl-avatar {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--fs-base);
  font-weight: var(--fw-bold);
  color: #fff;
}
.hsl-badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 9px;
  border-radius: 100px;
  font-size: var(--fs-xs);
  font-weight: var(--fw-semibold);
  background: #fef2f2;
  color: #ff3131;
  border: 1px solid #fecaca;
  white-space: nowrap;
}
.hsl-badge--more { background: #f3f4f6; color: #6b7280; border-color: #e5e7eb; }
.hsl-table-btn { width: 30px; height: 30px; border: none; border-radius: 8px; background: #eff6ff; color: #2563eb; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all .18s; }
.hsl-table-btn:hover { background: #dbeafe; }
.hsl-table-btn--del { background: #fef2f2; color: #ff3131; }
.hsl-table-btn--del:hover { background: #fee2e2; }

.hsl-empty { display: flex; flex-direction: column; align-items: center; padding: 48px 16px; text-align: center; }
.hsl-empty__icon {
  width: 72px;
  height: 72px;
  border-radius: 20px;
  background: #f3f4f6;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16px;
}
.hsl-empty__title { font-size: var(--fs-lg); font-weight: var(--fw-bold); color: #111827; margin: 0; }

/* ── Dark (BUG-247-01) — palette slate, overrides uniquement, clair inchangé.
   Header rouge #ff3131 volontairement identique dans les deux thèmes (parité
   BUG-197 « bandeaux rouges inchangés »). ── */
#hr-positions-page.hsl--dark { background: #111827; }
.hsl--dark .hsl-searchbar { background: #1e293b; border-bottom-color: rgba(255, 255, 255, .08); }
.hsl--dark .hsl-searchbar__input { color: #e2e8f0; }
.hsl--dark .hsl-searchbar__input::placeholder { color: #64748b; }
.hsl--dark .hsl-searchbar__icon,
.hsl--dark .hsl-searchbar__count,
.hsl--dark .hsl-searchbar__clear { color: #64748b; }
.hsl--dark .hsl-searchbar__clear:hover { color: #ff3131; }
.hsl--dark .hsl-table-wrap { background: #1e293b; border-color: rgba(255, 255, 255, .08); }
.hsl--dark .hsl-table :deep(.v-data-table__th) { background: #0f172a !important; color: #64748b !important; }
.hsl--dark .hsl-table :deep(.v-data-table__tr:hover) { background: rgba(255, 255, 255, .04) !important; }
.hsl--dark .hsl-table :deep(.v-data-table-footer) { background: #0f172a !important; border-top-color: rgba(255, 255, 255, .08); }
.hsl--dark .hsl-cell-rate { color: #f9fafb; }
.hsl--dark .hsl-badge { background: rgba(255, 49, 49, .12); border-color: rgba(255, 49, 49, .3); }
.hsl--dark .hsl-badge--more { background: rgba(255, 255, 255, .08); color: #94a3b8; border-color: rgba(255, 255, 255, .12); }
.hsl--dark .hsl-table-btn { background: rgba(255, 255, 255, .08); color: #94a3b8; }
.hsl--dark .hsl-table-btn:hover { background: rgba(255, 255, 255, .14); color: #e2e8f0; }
.hsl--dark .hsl-table-btn--del:hover { background: rgba(255, 49, 49, .14); color: #ff3131; }
.hsl--dark .hsl-empty__icon { background: rgba(255, 255, 255, .06); }
.hsl--dark .hsl-empty__title { color: #f9fafb; }

/* ── Barre de sélection multiple ── */
.bulk-bar { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:10px 16px; margin-bottom:12px; background:#fff5f5; border:1px solid #fecaca; border-radius:12px; }
.bulk-bar__info { font-size:var(--fs-base); font-weight:700; color:#ff3131; }
.bulk-bar__actions { display:flex; align-items:center; gap:8px; }
.bulk-bar__clear { background:none; border:none; color:#6b7280; font-size:var(--fs-sm); font-weight:600; cursor:pointer; padding:6px 10px; border-radius:8px; transition:background .15s,color .15s; }
.bulk-bar__clear:hover { background:rgba(0,0,0,.05); color:#374151; }
.bulk-bar__del { display:inline-flex; align-items:center; gap:6px; background:#ff3131; color:#fff; border:none; border-radius:100px; padding:7px 16px; font-size:var(--fs-sm); font-weight:700; cursor:pointer; transition:box-shadow .18s,transform .18s; }
.bulk-bar__del:hover { box-shadow:0 4px 14px rgba(255,49,49,.35); transform:translateY(-1px); }
.hsl--dark .bulk-bar { background:rgba(255,49,49,.1); border-color:rgba(255,49,49,.3); }
.hsl--dark .bulk-bar__clear { color:#94a3b8; }
.hsl--dark .bulk-bar__clear:hover { background:rgba(255,255,255,.06); color:#e2e8f0; }
</style>
