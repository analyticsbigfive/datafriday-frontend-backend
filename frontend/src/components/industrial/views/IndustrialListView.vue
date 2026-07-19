<template>
  <div class="inl-root" :class="{'inl--dark': isDark}">

    <!-- ── Gradient sticky header ── -->
    <div class="inl-header sticky-header">
      <div class="inl-header__inner">
        <div class="inl-header__left">
          <div class="inl-header__icon">
            <Factory :size="22" color="white" />
          </div>
          <div>
            <h1 class="inl-header__title">{{ t('industrialList.title') }}</h1>
            <p class="inl-header__subtitle">{{ t('industrialList.subtitle') }}</p>
          </div>
        </div>
        <div class="inl-header__right">
          <div class="inl-header__actions">
            <button class="inl-add-btn" @click="openCreateDrawer">
              <Plus :size="17" /> {{ t('industrialList.addIndustrial') }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Sticky searchbar ── -->
    <div class="inl-searchbar">
      <div class="inl-searchbar__inner">
        <Search :size="17" class="inl-searchbar__icon" />
        <input
          v-model="searchQuery"
          class="inl-searchbar__input"
          type="search"
          :placeholder="t('industrialList.searchPlaceholder')"
        />
        <span class="inl-searchbar__count">{{ filteredIndustrials.length }} {{ t('industrialList.totalIndustrials') }}</span>
      </div>
    </div>

    <!-- ── Content ── -->
    <div class="inl-content">
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

      <v-card rounded="xl" elevation="0" class="inl-table-card">
        <v-data-table
          :headers="tableHeaders"
          :items="filteredIndustrials"
          item-value="id"
          density="comfortable"
          :loading="loading"
          class="industrials-table"
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

    <IndustrialFormDrawer
      v-model="formDrawer"
      :mode="formMode"
      :initial-data="selectedItem"
      :is-dark="isDark"
      @saved="onSaved"
    />

    <IndustrialDeleteDialog
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
import { Plus, Pencil, Trash2, Factory, Search } from 'lucide-vue-next';
import { deleteIndustrial } from '@/api/endpoints/industrial.api';
import IndustrialFormDrawer from '../drawers/IndustrialFormDrawer.vue';
import IndustrialDeleteDialog from '../dialogs/IndustrialDeleteDialog.vue';

export default {
  name: 'IndustrialListView',
  components: { Plus, Pencil, Trash2, Factory, Search, IndustrialFormDrawer, IndustrialDeleteDialog },
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
    industrials() {
      return this.$store.getters['industrials/industrials'];
    },
    tableHeaders() {
      return [
        { title: this.t('industrialList.colName'), key: 'name' },
        { title: this.t('industrialList.colCreated'), key: 'createdAt' },
        { title: this.t('industrialList.colActions'), key: 'actions', sortable: false, align: 'end', width: 120 },
      ];
    },
    filteredIndustrials() {
      const q = (this.searchQuery || '').toLowerCase().trim();
      if (!q) return this.industrials;
      return this.industrials.filter(i => (i.name || '').toLowerCase().includes(q));
    },
  },
  mounted() {
    this.loadIndustrials();
  },
  methods: {
    async loadIndustrials() {
      this.loading = true;
      this.loadError = '';
      try {
        await this.$store.dispatch('industrials/fetchIndustrials');
      } catch (e) {
        this.loadError = e?.response?.data?.message || e?.message || 'Failed to load industrials';
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
      this.$store.dispatch('industrials/fetchIndustrials', { forceRefresh: true });
    },
    async confirmDelete() {
      this.deleteLoading = true;
      this.deleteError = '';
      try {
        const id = this.deleteTarget?.id || this.deleteTarget?._id;
        if (!id) { this.deleteError = this.t('industrialList.missingId'); return; }
        await deleteIndustrial(id);
        await this.$store.dispatch('industrials/removeIndustrial', id);
        this.deleteDialog = false;
        this.deleteTarget = null;
      } catch (e) {
        this.deleteError = e?.response?.data?.message || e?.message || this.t('industrialList.deleteError');
      } finally {
        this.deleteLoading = false;
      }
    },
  },
};
</script>

<style scoped>
.inl-root {
  width: 100%;
  min-height: 100%;
  background: #f6f7fb;
}

/* ── Header ── */
.sticky-header { position: sticky; top: 0; z-index: 100; flex-shrink: 0; }
.inl-header {
  background: #ff3131;
  box-shadow: 0 4px 20px rgba(255, 49, 49, .25);
}
.inl-header__inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 28px;
  gap: 16px;
  flex-wrap: wrap;
}
.inl-header__left {
  display: flex;
  align-items: center;
  gap: 14px;
}
.inl-header__icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: rgba(255, 255, 255, .2);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.inl-header__title {
  font-size: 20px;
  font-weight: 800;
  color: #fff;
  margin: 0;
  line-height: 1.2;
}
.inl-header__subtitle {
  font-size: 12.5px;
  color: rgba(255, 255, 255, .72);
  margin: 3px 0 0;
}
.inl-header__right {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}
.inl-header__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.inl-add-btn {
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
.inl-add-btn:hover {
  background: #fff;
  color: #ff3131;
}

/* ── Searchbar ── */
.inl-searchbar {
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
  position: sticky;
  top: 81px;
  z-index: 99;
  flex-shrink: 0;
}
.inl-searchbar__inner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 28px;
}
.inl-searchbar__icon { color: #9ca3af; flex-shrink: 0; }
.inl-searchbar__input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-size: 14px;
  color: #111827;
}
.inl-searchbar__input::placeholder { color: #9ca3af; }
.inl-searchbar__count {
  font-size: 12px;
  color: #9ca3af;
  white-space: nowrap;
}

/* ── Content ── */
.inl-content {
  padding: 24px 28px;
}
.inl-table-card {
  border: 1px solid #e5e7eb;
}

.industrials-table :deep(.v-data-table__td) {
  vertical-align: middle;
  padding-top: 16px !important;
  padding-bottom: 16px !important;
}
.industrials-table :deep(.v-data-table__th) {
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
.inl--dark.inl-root { background: #111827; }
.inl--dark .inl-searchbar { background: #1a2332; border-bottom-color: #374151; }
.inl--dark .inl-searchbar__input { color: #f9fafb; }
.inl--dark .inl-content { background: #111827; }
.inl--dark .inl-table-card { border-color: #374151; background: #1a2332; }
.inl--dark .industrials-table :deep(.v-data-table__th) { color: #9ca3af !important; background: #1a2332 !important; }
</style>
