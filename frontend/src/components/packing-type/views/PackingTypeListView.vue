<template>
  <div class="pktl-root" :class="{'pktl--dark': isDark}">

    <!-- ── Gradient sticky header ── -->
    <div class="pktl-header sticky-header">
      <div class="pktl-header__inner">
        <div class="pktl-header__left">
          <div class="pktl-header__icon">
            <Box :size="22" color="white" />
          </div>
          <div>
            <h1 class="pktl-header__title">{{ t('packingTypeList.title') }}</h1>
            <p class="pktl-header__subtitle">{{ t('packingTypeList.subtitle') }}</p>
          </div>
        </div>
        <div class="pktl-header__right">
          <div class="pktl-header__actions">
            <button class="pktl-add-btn" @click="openCreateDrawer">
              <Plus :size="17" /> {{ t('packingTypeList.addPackingType') }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Sticky searchbar ── -->
    <div class="pktl-searchbar">
      <div class="pktl-searchbar__inner">
        <Search :size="17" class="pktl-searchbar__icon" />
        <input
          v-model="searchQuery"
          class="pktl-searchbar__input"
          type="search"
          :placeholder="t('packingTypeList.searchPlaceholder')"
        />
        <span class="pktl-searchbar__count">{{ packingTypes.length }} {{ t('packingTypeList.totalPackingTypes') }}</span>
      </div>
    </div>

    <!-- ── Content ── -->
    <div class="pktl-content">
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

      <v-card rounded="xl" elevation="0" class="pktl-table-card">
        <v-data-table
          :headers="tableHeaders"
          :items="filteredPackingTypes"
          item-value="id"
          density="comfortable"
          :loading="loading"
          class="packing-types-table"
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

    <PackingTypeFormDrawer
      v-model="formDrawer"
      :mode="formMode"
      :initial-data="selectedItem"
      :is-dark="isDark"
      @saved="onSaved"
    />

    <PackingTypeDeleteDialog
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
import { Plus, Pencil, Trash2, Box, Search } from 'lucide-vue-next';
import { deletePackingType } from '@/api/endpoints/packing-type.api';
import PackingTypeFormDrawer from '../drawers/PackingTypeFormDrawer.vue';
import PackingTypeDeleteDialog from '../dialogs/PackingTypeDeleteDialog.vue';

export default {
  name: 'PackingTypeListView',
  components: { Plus, Pencil, Trash2, Box, Search, PackingTypeFormDrawer, PackingTypeDeleteDialog },
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
    packingTypes() {
      return this.$store.getters['packingTypes/packingTypes'];
    },
    tableHeaders() {
      return [
        { title: this.t('packingTypeList.colName'), key: 'name' },
        { title: this.t('packingTypeList.colCreated'), key: 'createdAt' },
        { title: this.t('packingTypeList.colActions'), key: 'actions', sortable: false, align: 'end', width: 120 },
      ];
    },
    filteredPackingTypes() {
      const q = (this.searchQuery || '').toLowerCase().trim();
      if (!q) return this.packingTypes;
      return this.packingTypes.filter(p => (p.name || '').toLowerCase().includes(q));
    },
  },
  mounted() {
    this.loadPackingTypes();
  },
  methods: {
    async loadPackingTypes() {
      this.loading = true;
      this.loadError = '';
      try {
        await this.$store.dispatch('packingTypes/fetchPackingTypes');
      } catch (e) {
        this.loadError = e?.response?.data?.message || e?.message || 'Failed to load packing types';
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
      this.$store.dispatch('packingTypes/fetchPackingTypes', { forceRefresh: true });
    },
    async confirmDelete() {
      this.deleteLoading = true;
      this.deleteError = '';
      try {
        const id = this.deleteTarget?.id || this.deleteTarget?._id;
        if (!id) { this.deleteError = this.t('packingTypeList.missingId'); return; }
        await deletePackingType(id);
        await this.$store.dispatch('packingTypes/removePackingType', id);
        this.deleteDialog = false;
        this.deleteTarget = null;
      } catch (e) {
        this.deleteError = e?.response?.data?.message || e?.message || this.t('packingTypeList.deleteError');
      } finally {
        this.deleteLoading = false;
      }
    },
  },
};
</script>

<style scoped>
.pktl-root {
  width: 100%;
  min-height: 100%;
  background: #f6f7fb;
}

/* ── Header ── */
.sticky-header { position: sticky; top: 0; z-index: 100; flex-shrink: 0; }
.pktl-header {
  background: #ff3131;
  box-shadow: 0 4px 20px rgba(255, 49, 49, .25);
}
.pktl-header__inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 28px;
  gap: 16px;
  flex-wrap: wrap;
}
.pktl-header__left {
  display: flex;
  align-items: center;
  gap: 14px;
}
.pktl-header__icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: rgba(255, 255, 255, .2);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.pktl-header__title {
  font-size: 20px;
  font-weight: 800;
  color: #fff;
  margin: 0;
  line-height: 1.2;
}
.pktl-header__subtitle {
  font-size: 12.5px;
  color: rgba(255, 255, 255, .72);
  margin: 3px 0 0;
}
.pktl-header__right {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}
.pktl-header__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.pktl-add-btn {
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
.pktl-add-btn:hover {
  background: #fff;
  color: #ff3131;
}

/* ── Searchbar ── */
.pktl-searchbar {
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
  position: sticky;
  top: 81px;
  z-index: 99;
  flex-shrink: 0;
}
.pktl-searchbar__inner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 28px;
}
.pktl-searchbar__icon { color: #9ca3af; flex-shrink: 0; }
.pktl-searchbar__input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-size: 14px;
  color: #111827;
}
.pktl-searchbar__input::placeholder { color: #9ca3af; }
.pktl-searchbar__count {
  font-size: 12px;
  color: #9ca3af;
  white-space: nowrap;
}

/* ── Content ── */
.pktl-content {
  padding: 24px 28px;
}
.pktl-table-card {
  border: 1px solid #e5e7eb;
}

.packing-types-table :deep(.v-data-table__td) {
  vertical-align: middle;
  padding-top: 16px !important;
  padding-bottom: 16px !important;
}
.packing-types-table :deep(.v-data-table__th) {
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
.pktl--dark.pktl-root { background: #111827; }
.pktl--dark .pktl-searchbar { background: #1a2332; border-bottom-color: #374151; }
.pktl--dark .pktl-searchbar__input { color: #f9fafb; }
.pktl--dark .pktl-content { background: #111827; }
.pktl--dark .pktl-table-card { border-color: #374151; background: #1a2332; }
.pktl--dark .packing-types-table :deep(.v-data-table__th) { color: #9ca3af !important; background: #1a2332 !important; }
</style>
