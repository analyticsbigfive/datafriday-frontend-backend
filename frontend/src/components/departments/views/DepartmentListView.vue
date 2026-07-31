<template>
  <div class="dl-root" :class="{'dl--dark': isDark}">
    <!-- Sticky gradient header -->
    <div class="dl-header">
      <div class="dl-header__inner">
        <div class="d-flex align-center gap-3">
          <div class="dl-header__icon">
            <Layers :size="22" color="#fff" />
          </div>
          <div>
            <p class="dl-header__title">{{ t('departmentList.title') }}</p>
            <p class="dl-header__subtitle">{{ t('departmentList.subtitle') }}</p>
          </div>
        </div>

        <div v-if="isSuperAdmin" class="d-flex align-center gap-3 flex-wrap">
          <button class="dl-add-btn" @click="openCreateDialog">
            <Plus :size="16" />
            {{ t('departmentList.addDepartment') }}
          </button>
        </div>
      </div>
    </div>

    <!-- Lecture seule pour un utilisateur non super-admin -->
    <v-alert v-if="!isSuperAdmin" type="info" variant="tonal" density="compact" rounded="0" class="dl-readonly-alert">
      {{ t('departmentList.readOnlyNotice') }}
    </v-alert>

    <!-- Content -->
    <div class="dl-content">
      <v-progress-linear v-if="loading" indeterminate color="#ff3131" height="3" rounded class="mb-4" />

      <v-alert v-if="loadError" type="error" variant="tonal" density="compact" rounded="lg" class="mb-4">
        {{ loadError }}
      </v-alert>

      <div class="dl-table-wrap">
        <v-data-table
          :headers="tableHeaders"
          :items="departments"
          item-value="id"
          density="compact"
          class="dl-table"
        >
          <template #item.color="{ item }">
            <span class="dl-swatch" :style="{ background: item.color }" :title="item.color" />
          </template>

          <template #item.icon="{ item }">
            <v-icon :icon="item.icon" size="20" :color="item.color" />
          </template>

          <template #item.flags="{ item }">
            <div class="dl-flags">
              <v-chip v-if="item.needsRh" size="x-small" color="primary" variant="tonal" rounded="lg">{{ t('departmentList.flagNeedsRh') }}</v-chip>
              <v-chip v-if="item.isSeller" size="x-small" color="success" variant="tonal" rounded="lg">{{ t('departmentList.flagIsSeller') }}</v-chip>
              <v-chip v-if="item.allowsSuppliers" size="x-small" color="secondary" variant="tonal" rounded="lg">{{ t('departmentList.flagAllowsSuppliers') }}</v-chip>
            </div>
          </template>

          <template #item.subtypes="{ item }">
            <v-chip size="small" color="primary" variant="tonal" rounded="lg" style="cursor:pointer;" @click="openSubtypesDialog(item)">
              {{ (item.subtypes || []).length }} {{ (item.subtypes || []).length === 1 ? t('departmentList.subtype') : t('departmentList.subtypes') }}
            </v-chip>
          </template>

          <template #item.actions="{ item }">
            <div v-if="isSuperAdmin" class="dl-actions">
              <div class="dl-abtn dl-abtn--edit" @click.stop="openEditDialog(item)">
                <Pencil :size="15" />
              </div>
              <div class="dl-abtn dl-abtn--del" @click.stop="openDeleteDialog(item)">
                <Trash2 :size="15" />
              </div>
            </div>
          </template>
        </v-data-table>
      </div>
    </div>

    <DepartmentFormDrawer
      v-model="formDialog"
      :mode="formMode"
      :initial-data="selectedDepartment"
      :is-dark="isDark"
      @saved="loadDepartments"
    />

    <DepartmentSubtypesDrawer
      v-model="subtypesDialog"
      :department="selectedDepartmentForSubtypes"
      :is-super-admin="isSuperAdmin"
      :is-dark="isDark"
      @changed="onSubtypesChanged"
    />

    <ProductDeleteDialog
      v-model="deleteDialog"
      :item-name="deleteTarget?.name"
      :loading="deleteLoading"
      :error="deleteError"
      :is-dark="isDark"
      :title="t('departmentList.deleteTitle')"
      :subtitle="t('departmentList.deleteSubtitle')"
      :message="t('departmentList.deleteConfirm')"
      :cancel-label="t('departmentList.cancel')"
      :confirm-label="t('departmentList.delete')"
      @confirm="confirmDelete"
    />
  </div>
</template>

<script>
import { computed } from "vue";
import { useTheme } from "vuetify";
import { useI18n } from "@/i18n/useI18n";
import { Pencil, Trash2, Plus, Layers } from "lucide-vue-next";
import { deleteDepartment } from "@/api/endpoints/department.api";
import DepartmentFormDrawer from "@/components/departments/drawers/DepartmentFormDrawer.vue";
import DepartmentSubtypesDrawer from "@/components/departments/drawers/DepartmentSubtypesDrawer.vue";
import ProductDeleteDialog from "@/components/products/dialogs/ProductDeleteDialog.vue";

export default {
  name: "DepartmentListView",
  components: { Pencil, Trash2, Plus, Layers, DepartmentFormDrawer, DepartmentSubtypesDrawer, ProductDeleteDialog },
  setup() {
    const theme = useTheme();
    const { t } = useI18n();
    const isDark = computed(() => !!theme.global.current.value.dark);
    return { t, isDark };
  },
  data() {
    return {
      loading: false,
      loadError: "",

      formDialog: false,
      formMode: "create",
      selectedDepartment: null,

      subtypesDialog: false,
      selectedDepartmentForSubtypes: null,

      deleteDialog: false,
      deleteLoading: false,
      deleteError: "",
      deleteTarget: null,
    };
  },
  computed: {
    // Écran GLOBAL (pas de scoping tenant) : lecture ouverte à tout utilisateur, édition
    // réservée au super-admin plateforme — même flag que le backend (SuperAdminGuard).
    isSuperAdmin() {
      return this.$store.getters['auth/isSuperAdmin'];
    },
    departments() {
      return this.$store.getters['departments/departments'] || [];
    },
    tableHeaders() {
      const headers = [
        { title: this.t('departmentList.colName'), key: "name", sortable: false },
        { title: this.t('departmentList.colColor'), key: "color", sortable: false, width: 60 },
        { title: this.t('departmentList.colIcon'), key: "icon", sortable: false, width: 60 },
        { title: this.t('departmentList.colFlags'), key: "flags", sortable: false, width: 320 },
        { title: this.t('departmentList.colSubtypes'), key: "subtypes", sortable: false, width: 140 },
      ];
      if (this.isSuperAdmin) {
        headers.push({ title: this.t('departmentList.colActions'), key: "actions", sortable: false, align: "end", width: 100 });
      }
      return headers;
    },
  },
  mounted() {
    this.loadDepartments();
  },
  methods: {
    async loadDepartments() {
      this.loading = true;
      this.loadError = "";
      try {
        await this.$store.dispatch('departments/fetchDepartments', { forceRefresh: true });
      } catch (e) {
        this.loadError = e?.response?.data?.message || e?.message || this.t('departmentList.loadError');
      } finally {
        this.loading = false;
      }
    },

    openCreateDialog() {
      this.formMode = "create";
      this.selectedDepartment = null;
      this.formDialog = true;
    },
    openEditDialog(item) {
      const raw = item && item.raw ? item.raw : item;
      this.formMode = "edit";
      this.selectedDepartment = raw;
      this.formDialog = true;
    },

    openSubtypesDialog(item) {
      const raw = item && item.raw ? item.raw : item;
      this.selectedDepartmentForSubtypes = raw;
      this.subtypesDialog = true;
    },
    // Après ajout/renommage/suppression d'un sous-type : recharger la liste ET re-pointer
    // selectedDepartmentForSubtypes vers le nouvel objet (le store remplace `list` en bloc au
    // refetch — l'ancienne référence tenue par le tiroir resterait sinon périmée, sous-types
    // affichés désynchronisés du serveur).
    async onSubtypesChanged() {
      await this.loadDepartments();
      const id = this.selectedDepartmentForSubtypes?.id;
      if (id) {
        this.selectedDepartmentForSubtypes = this.departments.find((d) => d.id === id) || null;
      }
    },

    openDeleteDialog(item) {
      const raw = item && item.raw ? item.raw : item;
      this.deleteError = "";
      this.deleteLoading = false;
      this.deleteTarget = raw;
      this.deleteDialog = true;
    },
    closeDeleteDialog() {
      this.deleteDialog = false;
      this.deleteLoading = false;
      this.deleteError = "";
      this.deleteTarget = null;
    },
    async confirmDelete() {
      this.deleteLoading = true;
      this.deleteError = "";
      try {
        const id = this.deleteTarget?.id;
        if (!id) { this.deleteError = this.t('departmentList.missingId'); return; }
        await deleteDepartment(id);
        this.closeDeleteDialog();
        this.loadDepartments();
      } catch (e) {
        this.deleteError = e?.response?.data?.message || e?.message || this.t('departmentList.deleteError');
      } finally {
        this.deleteLoading = false;
      }
    },
  },
};
</script>

<style scoped>
.dl-root {
  background: #f6f7fb;
  height: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

/* ── Sticky gradient header ── */
.dl-header {
  background: #ff3131;
  box-shadow: 0 4px 20px rgba(255, 49, 49, .25);
  position: sticky;
  top: 0;
  z-index: 100;
  flex-shrink: 0;
}
.dl-header__inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 28px;
  gap: 16px;
  flex-wrap: wrap;
}
.dl-header__icon {
  width: 44px; height: 44px; border-radius: 12px;
  background: rgba(255, 255, 255, .2);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.dl-header__title { font-size: 20px; font-weight: 800; color: #fff; margin: 0; }
.dl-header__subtitle { font-size: 12.5px; color: rgba(255, 255, 255, .72); margin: 3px 0 0; }

.dl-add-btn {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 9px 18px; border-radius: 100px;
  border: 2px solid rgba(255, 255, 255, .85);
  background: transparent; color: #fff;
  font-size: 13px; font-weight: 700; cursor: pointer; transition: all .2s;
}
.dl-add-btn:hover { background: #fff; color: #ff3131; }

.dl-readonly-alert { flex-shrink: 0; }

/* ── Content ── */
.dl-content { padding: 24px 28px; }

.dl-table-wrap {
  background: #fff; border-radius: 16px; border: 1px solid #e5e7eb; overflow: hidden;
}
.dl--dark .dl-table-wrap { background: #1e293b; border-color: rgba(255,255,255,.08); }

.dl-table :deep(.v-data-table__th),
.dl-table :deep(.v-data-table__td) {
  font-size: var(--fs-base); padding-top: 10px; padding-bottom: 10px; padding-left: 16px; padding-right: 16px;
}
.dl-table :deep(.v-data-table__td) { vertical-align: middle; }
.dl-table :deep(.v-data-table__th) {
  font-size: var(--fs-xs) !important; font-weight: 600; text-transform: uppercase;
  letter-spacing: .06em; color: #9ca3af !important; background: #fafafa !important;
}
.dl-table :deep(tbody tr:hover td) { background: #fafafa !important; }
.dl--dark .dl-table :deep(.v-data-table__th) { background: #1a2332 !important; }
.dl--dark .dl-table :deep(tbody tr:hover td) { background: #1a2332 !important; }
.dl--dark .dl-table :deep(.v-data-table__td) { color: #e2e8f0; }

.dl-swatch { display: inline-block; width: 20px; height: 20px; border-radius: 6px; border: 1px solid rgba(0,0,0,.08); }

.dl-flags { display: flex; gap: 4px; flex-wrap: wrap; }

.dl-actions { display: flex; gap: 4px; justify-content: flex-end; }
.dl-abtn {
  width: 28px; height: 28px; border-radius: 8px;
  background: #f3f4f6; color: #6b7280;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: background .15s, color .15s; flex-shrink: 0;
}
.dl-abtn--edit { background: #eff6ff; color: #2563eb; }
.dl-abtn--edit:hover { background: #dbeafe; }
.dl-abtn--del { background: #fef2f2; color: #ff3131; }
.dl-abtn--del:hover { background: #fee2e2; }

/* ── Dark mode ── */
.dl--dark.dl-root { background: #111827; }
.dl--dark .dl-abtn { background: #1f2937; color: #cbd5e1; }
.dl--dark .dl-abtn--edit { background: rgba(37,99,235,.15); color: #93c5fd; }
.dl--dark .dl-abtn--del { background: rgba(255,49,49,.14); color: #fca5a5; }
</style>
