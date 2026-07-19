<template>
  <div class="bnl-root" :class="{'bnl--dark': isDark}">

    <!-- ── Gradient sticky header ── -->
    <div class="bnl-header sticky-header">
      <div class="bnl-header__inner">
        <div class="bnl-header__left">
          <div class="bnl-header__icon">
            <Tag :size="22" color="white" />
          </div>
          <div>
            <h1 class="bnl-header__title">{{ t('brandNameList.title') }}</h1>
            <p class="bnl-header__subtitle">{{ t('brandNameList.subtitle') }}</p>
          </div>
        </div>
        <div class="bnl-header__right">
          <div class="bnl-header__actions">
            <button class="bnl-add-btn" @click="openCreateDrawer">
              <Plus :size="17" /> {{ t('brandNameList.addBrand') }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Sticky searchbar ── -->
    <div class="bnl-searchbar">
      <div class="bnl-searchbar__inner">
        <Search :size="17" class="bnl-searchbar__icon" />
        <input
          v-model="searchQuery"
          class="bnl-searchbar__input"
          type="search"
          :placeholder="t('brandNameList.searchPlaceholder')"
        />
        <span class="bnl-searchbar__count">{{ filteredBrandNames.length }} {{ t('brandNameList.totalBrands') }}</span>
      </div>
    </div>

    <!-- ── Content ── -->
    <div class="bnl-content">
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

      <v-card rounded="xl" elevation="0" class="bnl-table-card">
        <v-data-table
          :headers="tableHeaders"
          :items="filteredBrandNames"
          item-value="id"
          density="comfortable"
          :loading="loading"
          class="brands-table"
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

    <BrandNameFormDrawer
      v-model="formDrawer"
      :mode="formMode"
      :initial-data="selectedBrand"
      :is-dark="isDark"
      @saved="onSaved"
    />

    <BrandNameDeleteDialog
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
import { deleteBrandName } from '@/api/endpoints/brand-name.api';
import BrandNameFormDrawer from '../drawers/BrandNameFormDrawer.vue';
import BrandNameDeleteDialog from '../dialogs/BrandNameDeleteDialog.vue';

export default {
  name: 'BrandNameListView',
  components: { Plus, Pencil, Trash2, Tag, Search, BrandNameFormDrawer, BrandNameDeleteDialog },
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
      selectedBrand: null,

      deleteDialog: false,
      deleteLoading: false,
      deleteError: '',
      deleteTarget: null,
    };
  },
  computed: {
    brandNames() {
      return this.$store.getters['brandNames/brandNames'];
    },
    tableHeaders() {
      return [
        { title: this.t('brandNameList.colName'), key: 'name' },
        { title: this.t('brandNameList.colCreated'), key: 'createdAt' },
        { title: this.t('brandNameList.colActions'), key: 'actions', sortable: false, align: 'end', width: 120 },
      ];
    },
    filteredBrandNames() {
      const q = (this.searchQuery || '').toLowerCase().trim();
      if (!q) return this.brandNames;
      return this.brandNames.filter(b => (b.name || '').toLowerCase().includes(q));
    },
  },
  mounted() {
    this.loadBrands();
  },
  methods: {
    async loadBrands() {
      this.loading = true;
      this.loadError = '';
      try {
        await this.$store.dispatch('brandNames/fetchBrandNames');
      } catch (e) {
        this.loadError = e?.response?.data?.message || e?.message || this.t('brandNameList.loadError');
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
      this.selectedBrand = null;
      this.formDrawer = true;
    },
    openEditDrawer(item) {
      const raw = item?.raw ?? item;
      this.formMode = 'edit';
      this.selectedBrand = raw;
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
      this.$store.dispatch('brandNames/fetchBrandNames', { forceRefresh: true });
    },
    async confirmDelete() {
      this.deleteLoading = true;
      this.deleteError = '';
      try {
        const id = this.deleteTarget?.id || this.deleteTarget?._id;
        if (!id) { this.deleteError = this.t('brandNameList.missingId'); return; }
        await deleteBrandName(id);
        await this.$store.dispatch('brandNames/removeBrandName', id);
        this.deleteDialog = false;
        this.deleteTarget = null;
      } catch (e) {
        this.deleteError = e?.response?.data?.message || e?.message || this.t('brandNameList.deleteError');
      } finally {
        this.deleteLoading = false;
      }
    },
  },
};
</script>

<style scoped>
.bnl-root {
  width: 100%;
  min-height: 100%;
  background: #f6f7fb;
}

/* ── Header ── */
.sticky-header { position: sticky; top: 0; z-index: 100; flex-shrink: 0; }
.bnl-header {
  background: #ff3131;
  box-shadow: 0 4px 20px rgba(255, 49, 49, .25);
}
.bnl-header__inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 28px;
  gap: 16px;
  flex-wrap: wrap;
}
.bnl-header__left {
  display: flex;
  align-items: center;
  gap: 14px;
}
.bnl-header__icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: rgba(255, 255, 255, .2);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.bnl-header__title {
  font-size: 20px;
  font-weight: 800;
  color: #fff;
  margin: 0;
  line-height: 1.2;
}
.bnl-header__subtitle {
  font-size: 12.5px;
  color: rgba(255, 255, 255, .72);
  margin: 3px 0 0;
}
.bnl-header__right {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}
.bnl-header__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.bnl-add-btn {
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
.bnl-add-btn:hover {
  background: #fff;
  color: #ff3131;
}

/* ── Searchbar ── */
.bnl-searchbar {
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
  position: sticky;
  top: 81px;
  z-index: 99;
  flex-shrink: 0;
}
.bnl-searchbar__inner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 28px;
}
.bnl-searchbar__icon { color: #9ca3af; flex-shrink: 0; }
.bnl-searchbar__input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-size: 14px;
  color: #111827;
}
.bnl-searchbar__input::placeholder { color: #9ca3af; }
.bnl-searchbar__count {
  font-size: 12px;
  color: #9ca3af;
  white-space: nowrap;
}

/* ── Content ── */
.bnl-content {
  padding: 24px 28px;
}
.bnl-table-card {
  border: 1px solid #e5e7eb;
}

.brands-table :deep(.v-data-table__td) {
  vertical-align: middle;
  padding-top: 16px !important;
  padding-bottom: 16px !important;
}
.brands-table :deep(.v-data-table__th) {
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
.bnl--dark.bnl-root { background: #111827; }
.bnl--dark .bnl-searchbar { background: #1a2332; border-bottom-color: #374151; }
.bnl--dark .bnl-searchbar__input { color: #f9fafb; }
.bnl--dark .bnl-content { background: #111827; }
.bnl--dark .bnl-table-card { border-color: #374151; background: #1a2332; }
.bnl--dark .brands-table :deep(.v-data-table__th) { color: #9ca3af !important; background: #1a2332 !important; }
</style>
