<template>
  <div class="pl-root" :class="{'pl--dark': isDark}">
    <v-container fluid class="pa-0">
      <!-- Header -->
      <div class="header-section">
        <div class="px-6 py-4">
          <!-- Fil d'Ariane : mini-liens de navigation (Accueil › page courante). -->
          <nav class="pl-breadcrumbs" aria-label="Fil d’Ariane">
            <router-link :to="{ name: 'spaces' }" class="pl-crumb">{{ t('breadcrumbHome') }}</router-link>
            <ChevronRight :size="13" class="pl-crumb-sep" />
            <span class="pl-crumb pl-crumb--current" aria-current="page">{{ t('permissionList.title') }}</span>
          </nav>
          <div class="d-flex align-center justify-space-between mb-4">
            <div>
              <h1 class="text-h4 font-weight-bold mb-1 pl-title">{{ t('permissionList.title') }}</h1>
              <p class="text-body-1 text-medium-emphasis mb-0">{{ t('permissionList.subtitle') }}</p>
            </div>
            <!-- Création de permission désactivée : le catalogue est géré au niveau
                 système. Masqué pour qui n'a pas `org.permissions.manage` (v-can) ET
                 désactivé pour les autorisés (ADMIN). -->
            <v-btn v-can="'org.permissions.manage'" disabled color="#ff3131" size="large" rounded="lg" variant="flat" class="text-white text-none" @click="openCreateDrawer">
              <Plus :size="20" class="mr-2" />
              {{ t('permissionList.addPermission') }}
            </v-btn>
          </div>

          <!-- Stats + Search -->
          <v-card rounded="lg" elevation="0" class="stats-card pa-4">
            <div class="d-flex align-center" style="gap: 24px;">
              <div>
                <div class="text-caption text-medium-emphasis mb-1">{{ t('permissionList.totalPermissions') }}</div>
                <div class="text-h5 font-weight-bold pl-title">{{ permissions.length }}</div>
              </div>
              <v-divider vertical />
              <div style="flex: 1;">
                <v-text-field
                  v-model="searchQuery"
                  variant="outlined"
                  density="comfortable"
                  rounded="lg"
                  hide-details
                  :placeholder="t('permissionList.searchPlaceholder')"
                  prepend-inner-icon="mdi-magnify"
                  clearable
                />
              </div>
            </div>
          </v-card>
        </div>
      </div>

      <!-- Content -->
      <div class="content-section px-6 py-4">
        <v-progress-linear
          v-if="loading"
          indeterminate
          color="#ff3131"
          height="3"
          rounded
          class="mb-4"
        />

        <v-alert v-if="loadError" type="error" variant="tonal" density="compact" rounded="lg" class="mb-4">
          {{ loadError }}
        </v-alert>

        <v-card rounded="xl" elevation="0" style="border: 1px solid #e5e7eb;">
          <v-data-table
            :headers="tableHeaders"
            :items="filteredPermissions"
            item-value="id"
            density="comfortable"
            :loading="loading"
            class="permissions-table"
          >
            <template #item.description="{ item }">
              <span class="text-medium-emphasis text-body-2">{{ item.description || '—' }}</span>
            </template>

            <template #item.type="{ item }">
              <v-chip
                size="x-small"
                rounded="lg"
                variant="tonal"
                :color="item.isSystem ? 'grey' : '#ff3131'"
              >
                {{ item.isSystem ? t('permissionList.typeSystem') : t('permissionList.typeCustom') }}
              </v-chip>
            </template>

            <template #item.createdAt="{ item }">
              {{ formatDate(item.createdAt) }}
            </template>

            <template #item.actions="{ item }">
              <div v-if="!item.isSystem" class="d-flex justify-end" style="gap: 6px;">
                <v-btn variant="text" density="compact" size="small" icon @click.stop="openEditDrawer(item)">
                  <Pencil :size="16" />
                </v-btn>
                <v-btn variant="text" density="compact" size="small" icon @click.stop="openDeleteDialog(item)">
                  <Trash2 :size="16" />
                </v-btn>
              </div>
              <span v-else class="text-medium-emphasis">—</span>
            </template>
          </v-data-table>
        </v-card>
      </div>
    </v-container>

    <PermissionFormDrawer
      v-model="formDrawer"
      :mode="formMode"
      :initial-data="selectedPermission"
      :is-dark="isDark"
      @saved="onSaved"
    />

    <PermissionDeleteDialog
      v-model="deleteDialog"
      :item-name="deleteTarget?.name"
      :loading="deleteLoading"
      :error="deleteError"
      :is-dark="isDark"
      @confirm="confirmDelete"
    />
  </div>
</template>

<script>
import { computed } from 'vue';
import { useTheme } from 'vuetify';
import { useI18n } from '@/i18n/useI18n';
import { Plus, Pencil, Trash2, ChevronRight } from 'lucide-vue-next';
import { deletePermission } from '@/api/endpoints/permission.api';
import PermissionFormDrawer from '../drawers/PermissionFormDrawer.vue';
import PermissionDeleteDialog from '../dialogs/PermissionDeleteDialog.vue';

export default {
  name: 'PermissionListView',
  components: { Plus, Pencil, Trash2, ChevronRight, PermissionFormDrawer, PermissionDeleteDialog },
  setup() {
    const theme = useTheme();
    const { t } = useI18n();
    const isDark = computed(() => !!theme.global.current.value.dark);
    return { t, isDark };
  },
  data() {
    return {
      loading: false,
      loadError: '',
      searchQuery: '',

      formDrawer: false,
      formMode: 'create',
      selectedPermission: null,

      deleteDialog: false,
      deleteLoading: false,
      deleteError: '',
      deleteTarget: null,
    };
  },
  computed: {
    permissions() {
      return this.$store.getters['permissions/permissions'];
    },
    tableHeaders() {
      return [
        { title: this.t('permissionList.colName'), key: 'name' },
        { title: this.t('permissionList.colDescription'), key: 'description' },
        { title: this.t('permissionList.colType'), key: 'type', sortable: false, width: 130 },
        { title: this.t('permissionList.colCreated'), key: 'createdAt' },
        { title: this.t('permissionList.colActions'), key: 'actions', sortable: false, align: 'end', width: 120 },
      ];
    },
    filteredPermissions() {
      const q = (this.searchQuery || '').toLowerCase().trim();
      if (!q) return this.permissions;
      return this.permissions.filter(
        (p) =>
          (p.name || '').toLowerCase().includes(q) ||
          (p.description || '').toLowerCase().includes(q)
      );
    },
  },
  mounted() {
    this.loadPermissions();
  },
  methods: {
    async loadPermissions() {
      this.loading = true;
      this.loadError = '';
      try {
        await this.$store.dispatch('permissions/fetchPermissions');
      } catch (e) {
        this.loadError = e?.response?.data?.message || e?.message || 'Failed to load permissions';
      } finally {
        this.loading = false;
      }
    },
    formatDate(value) {
      if (!value) return '—';
      try { return new Date(value).toLocaleString(); } catch { return String(value); }
    },
    openCreateDrawer() {
      this.formMode = 'create';
      this.selectedPermission = null;
      this.formDrawer = true;
    },
    openEditDrawer(item) {
      const raw = item?.raw ?? item;
      this.formMode = 'edit';
      this.selectedPermission = raw;
      this.formDrawer = true;
    },
    openDeleteDialog(item) {
      const raw = item?.raw ?? item;
      this.deleteError = '';
      this.deleteLoading = false;
      this.deleteTarget = raw;
      this.deleteDialog = true;
    },
    onSaved() {
      this.$store.dispatch('permissions/fetchPermissions', { forceRefresh: true });
    },
    async confirmDelete() {
      this.deleteLoading = true;
      this.deleteError = '';
      try {
        const id = this.deleteTarget?.id || this.deleteTarget?._id;
        if (!id) { this.deleteError = 'Identifiant manquant'; return; }
        await deletePermission(id);
        await this.$store.dispatch('permissions/removePermission', id);
        this.deleteDialog = false;
        this.deleteTarget = null;
      } catch (e) {
        this.deleteError = e?.response?.data?.message || e?.message || 'Échec de la suppression';
      } finally {
        this.deleteLoading = false;
      }
    },
  },
};
</script>

<style scoped>
.pl-root {
  background: #f6f7fb;
  /* Le document ne scrolle pas (html/body/#app en overflow:hidden, cf. style.css) :
     chaque page fournit son propre conteneur scrollable (comme .slv-root).
     Sans hauteur bornée + overflow-y, la table déborde sous le pli et devient
     inatteignable → bug « impossible de scroller ». */
  height: calc(100vh - var(--v-layout-top, 64px));
  overflow-y: auto;
  overflow-x: hidden;
}

.header-section {
  background: white;
  border-bottom: 1px solid #e5e7eb;
}

/* Fil d'Ariane : header clair → liens en texte sombre (pas de bandeau rouge ici). */
.pl-breadcrumbs {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 0 12px;
  font-size: 12px;
}
.pl-crumb {
  color: rgba(0, 0, 0, .55);
  text-decoration: none;
  font-weight: 600;
  border-radius: 6px;
  padding: 2px 6px;
  transition: background .15s ease, color .15s ease;
}
a.pl-crumb:hover {
  background: rgba(0, 0, 0, .06);
  color: rgba(0, 0, 0, .87);
}
a.pl-crumb:focus-visible {
  outline: 2px solid rgba(255, 49, 49, .5);
  outline-offset: 1px;
}
.pl-crumb--current {
  color: rgba(0, 0, 0, .87);
  font-weight: 700;
  cursor: default;
}
.pl-crumb-sep {
  color: rgba(0, 0, 0, .35);
  flex-shrink: 0;
}
.pl--dark .pl-crumb { color: rgba(255, 255, 255, .6); }
.pl--dark a.pl-crumb:hover { background: rgba(255, 255, 255, .12); color: #fff; }
.pl--dark .pl-crumb--current { color: #fff; }
.pl--dark .pl-crumb-sep { color: rgba(255, 255, 255, .4); }

.content-section {
  background: #f6f7fb;
}

.stats-card {
  background: #eff6ff;
  border: 1px solid #dbeafe;
}

.permissions-table :deep(.v-data-table__td) {
  vertical-align: middle;
  padding-top: 16px !important;
  padding-bottom: 16px !important;
}

.permissions-table :deep(.v-data-table__th) {
  padding-top: 16px !important;
  padding-bottom: 16px !important;
  font-weight: 700 !important;
  text-transform: uppercase;
  font-size: 0.75rem;
  letter-spacing: 0.025em;
  color: #374151 !important;
  background: #f9fafb !important;
}

.pl-title { color: #111827; }

/* Dark mode */
.pl--dark.pl-root { background: #111827; }
.pl--dark .header-section { background: #1a2332; border-bottom-color: #374151; }
.pl--dark .content-section { background: #111827; }
.pl--dark .stats-card { background: #1e2d40; border-color: #2d4a6e; }
.pl--dark .pl-title { color: #f9fafb; }
.pl--dark .permissions-table :deep(.v-data-table__th) { color: #9ca3af !important; background: #1a2332 !important; }
</style>
