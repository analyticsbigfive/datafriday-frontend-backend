<template>
  <div class="dnl-root" :class="{'dnl--dark': isDark}">

    <!-- ── Sticky header ── -->
    <div class="dnl-header sticky-header">
      <div class="dnl-header__inner">
        <div class="dnl-header__left">
          <div class="dnl-header__icon">
            <Tag :size="22" color="white" />
          </div>
          <div>
            <h1 class="dnl-header__title">{{ t('displayNameList.title') }}</h1>
            <p class="dnl-header__subtitle">{{ t('displayNameList.subtitle') }}</p>
          </div>
        </div>
        <div class="dnl-header__right">
          <div class="dnl-header__actions">
            <button class="dnl-add-btn" @click="openCreateDrawer">
              <Plus :size="17" /> {{ t('displayNameList.addDisplayName') }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Sticky searchbar ── -->
    <div class="dnl-searchbar">
      <div class="dnl-searchbar__inner">
        <Search :size="17" class="dnl-searchbar__icon" />
        <input
          v-model="searchQuery"
          class="dnl-searchbar__input"
          type="search"
          :placeholder="t('displayNameList.searchPlaceholder')"
        />
        <span class="dnl-searchbar__count">{{ filteredDisplayNames.length }} {{ t('displayNameList.totalDisplayNames') }}</span>
      </div>
    </div>

    <!-- ── Content ── -->
    <div class="dnl-content">
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

      <v-card rounded="xl" elevation="0" class="dnl-table-card">
        <v-data-table
          :headers="tableHeaders"
          :items="filteredDisplayNames"
          item-value="id"
          density="comfortable"
          :loading="loading"
          class="display-names-table"
        >
          <template #item.createdAt="{ item }">
            {{ formatDate(item.createdAt) }}
          </template>

          <template #item.actions="{ item }">
            <div class="d-flex justify-end" style="gap: 6px;">
              <v-btn variant="text" density="compact" size="small" icon @click.stop="openEditDrawer(item)">
                <Pencil :size="16" />
              </v-btn>
              <v-btn variant="text" density="compact" size="small" icon @click.stop="openDeleteDialog(item)">
                <Trash2 :size="16" />
              </v-btn>
            </div>
          </template>
        </v-data-table>
      </v-card>
    </div>

    <DisplayNameFormDrawer
      v-model="formDrawer"
      :mode="formMode"
      :initial-data="selectedItem"
      :is-dark="isDark"
      @saved="onSaved"
    />

    <DisplayNameDeleteDialog
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
import { Plus, Pencil, Trash2, Tag, Search } from 'lucide-vue-next';
import { deleteDisplayName } from '@/api/endpoints/display-name.api';
import DisplayNameFormDrawer from '../drawers/DisplayNameFormDrawer.vue';
import DisplayNameDeleteDialog from '../dialogs/DisplayNameDeleteDialog.vue';

export default {
  name: 'DisplayNameListView',
  components: { Plus, Pencil, Trash2, Tag, Search, DisplayNameFormDrawer, DisplayNameDeleteDialog },
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
      selectedItem: null,

      deleteDialog: false,
      deleteLoading: false,
      deleteError: '',
      deleteTarget: null,
    };
  },
  computed: {
    displayNames() {
      return this.$store.getters['displayNames/displayNames'];
    },
    tableHeaders() {
      return [
        { title: this.t('displayNameList.colName'), key: 'name' },
        { title: this.t('displayNameList.colCreated'), key: 'createdAt' },
        { title: this.t('displayNameList.colActions'), key: 'actions', sortable: false, align: 'end', width: 120 },
      ];
    },
    filteredDisplayNames() {
      const q = (this.searchQuery || '').toLowerCase().trim();
      if (!q) return this.displayNames;
      return this.displayNames.filter(d => (d.name || '').toLowerCase().includes(q));
    },
  },
  mounted() {
    this.loadDisplayNames();
  },
  methods: {
    async loadDisplayNames() {
      this.loading = true;
      this.loadError = '';
      try {
        await this.$store.dispatch('displayNames/fetchDisplayNames');
      } catch (e) {
        this.loadError = e?.response?.data?.message || e?.message || 'Failed to load display names';
      } finally {
        this.loading = false;
      }
    },
    formatDate(value) {
      if (!value) return '-';
      try { return new Date(value).toLocaleString(); } catch { return String(value); }
    },
    openCreateDrawer() {
      this.formMode = 'create';
      this.selectedItem = null;
      this.formDrawer = true;
    },
    openEditDrawer(item) {
      const raw = item?.raw ?? item;
      this.formMode = 'edit';
      this.selectedItem = raw;
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
      this.$store.dispatch('displayNames/fetchDisplayNames', { forceRefresh: true });
    },
    async confirmDelete() {
      this.deleteLoading = true;
      this.deleteError = '';
      try {
        const id = this.deleteTarget?.id || this.deleteTarget?._id;
        if (!id) { this.deleteError = 'Identifiant manquant'; return; }
        await deleteDisplayName(id);
        await this.$store.dispatch('displayNames/removeDisplayName', id);
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
.dnl-root {
  width: 100%;
  min-height: 100%;
  background: #f6f7fb;
}

/* ── Header ── */
.sticky-header { position: sticky; top: 0; z-index: 100; flex-shrink: 0; }
.dnl-header {
  background: #ff3131;
  box-shadow: 0 4px 20px rgba(255, 49, 49, .25);
}
.dnl-header__inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 28px;
  gap: 16px;
  flex-wrap: wrap;
}
.dnl-header__left {
  display: flex;
  align-items: center;
  gap: 14px;
}
.dnl-header__icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: rgba(255, 255, 255, .2);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.dnl-header__title {
  font-size: 20px;
  font-weight: 800;
  color: #fff;
  margin: 0;
  line-height: 1.2;
}
.dnl-header__subtitle {
  font-size: 12.5px;
  color: rgba(255, 255, 255, .72);
  margin: 3px 0 0;
}
.dnl-header__right {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}
.dnl-header__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.dnl-add-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 9px 18px;
  border-radius: 100px;
  border: 2px solid rgba(255, 255, 255, .85);
  background: transparent;
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all .2s;
  white-space: nowrap;
}
.dnl-add-btn:hover {
  background: #fff;
  color: #ff3131;
}

/* ── Searchbar ── */
.dnl-searchbar {
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
  position: sticky;
  top: 81px;
  z-index: 99;
  flex-shrink: 0;
}
.dnl-searchbar__inner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 28px;
}
.dnl-searchbar__icon { color: #9ca3af; flex-shrink: 0; }
.dnl-searchbar__input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-size: 14px;
  color: #111827;
}
.dnl-searchbar__input::placeholder { color: #9ca3af; }
.dnl-searchbar__count {
  font-size: 12px;
  color: #9ca3af;
  white-space: nowrap;
}

/* ── Content ── */
.dnl-content {
  padding: 24px 28px;
}
.dnl-table-card {
  border: 1px solid #e5e7eb;
}

.display-names-table :deep(.v-data-table__td) {
  vertical-align: middle;
  padding-top: 16px !important;
  padding-bottom: 16px !important;
}
.display-names-table :deep(.v-data-table__th) {
  padding-top: 16px !important;
  padding-bottom: 16px !important;
  font-weight: 700 !important;
  text-transform: uppercase;
  font-size: 0.75rem;
  letter-spacing: 0.025em;
  color: #374151 !important;
  background: #f9fafb !important;
}

/* ── Dark mode ── */
.dnl--dark.dnl-root { background: #111827; }
.dnl--dark .dnl-searchbar { background: #1a2332; border-bottom-color: #374151; }
.dnl--dark .dnl-searchbar__input { color: #f9fafb; }
.dnl--dark .dnl-content { background: #111827; }
.dnl--dark .dnl-table-card { border-color: #374151; background: #1a2332; }
.dnl--dark .display-names-table :deep(.v-data-table__th) { color: #9ca3af !important; background: #1a2332 !important; }
</style>
