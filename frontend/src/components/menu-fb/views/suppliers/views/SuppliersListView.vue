
<template>
  <div id="suppliers-list-page" :class="{ 'slv--dark': isDark }">

    <!-- ── Header ── -->
    <div class="slv-header sticky-header">
      <div class="slv-header__inner">
        <div class="slv-header__left">
          <div class="slv-header__icon">
            <Truck :size="22" color="white" />
          </div>
          <div>
            <h1 class="slv-header__title">{{ t('title') }}</h1>
            <p class="slv-header__subtitle">{{ t('subtitle') }}</p>
          </div>
        </div>
        <div class="slv-header__right">
          <div class="slv-view-toggle">
            <button
              class="slv-view-btn"
              :class="{ 'slv-view-btn--active': viewMode === 'grid' }"
              @click="viewMode = 'grid'"
            >
              <LayoutGrid :size="15" />
            </button>
            <button
              class="slv-view-btn"
              :class="{ 'slv-view-btn--active': viewMode === 'list' }"
              @click="viewMode = 'list'"
            >
              <List :size="15" />
            </button>
          </div>
          <button class="slv-add-btn" @click="onAddSupplier">
            <Plus :size="17" class="me-1" />
            {{ t('addSupplier') }}
          </button>
        </div>
      </div>
    </div>

    <!-- ── Search bar ── -->
    <div class="slv-searchbar sticky-search">
      <div class="slv-searchbar__inner">
        <Search :size="18" class="slv-searchbar__icon" />
        <input
          v-model="searchQuery"
          class="slv-searchbar__input"
          type="search"
          :placeholder="t('searchPlaceholder')"
        />
        <span class="slv-searchbar__count">{{ filteredSuppliers.length }} {{ t('totalSuppliers') }}</span>
        <button v-if="searchQuery" class="slv-searchbar__clear" @click="searchQuery = ''">
          <X :size="16" />
        </button>
      </div>
    </div>

    <!-- ── Content ── -->
    <div class="slv-content">
      <v-progress-linear v-if="loading" indeterminate color="#ff3131" height="3" rounded class="slv-loader" />

      <div v-if="error" class="slv-alert">
        <AlertCircle :size="15" class="me-2" style="flex-shrink:0" />
        {{ error }}
      </div>

      <!-- ── Grid view ── -->
      <template v-if="viewMode === 'grid'">
        <div v-if="filteredSuppliers.length === 0" class="slv-empty">
          <div class="slv-empty__icon">
            <PackageX :size="44" style="color:#d1d5db" />
          </div>
          <h3 class="slv-empty__title">{{ t('noSuppliersFound') }}</h3>
          <p class="slv-empty__sub">{{ searchQuery ? t('tryAdjusting') : t('noSuppliersMessage') }}</p>
          <button v-if="!searchQuery" class="slv-add-btn" @click="onAddSupplier">
            <Plus :size="17" class="me-1" />
            {{ t('addFirstSupplier') }}
          </button>
        </div>

        <div v-else class="row g-4">
          <div
            v-for="(supplier, idx) in filteredSuppliers"
            :key="supplier.id"
            class="col-12 col-sm-6 col-lg-4 col-xl-3"
          >
            <div class="slv-card" :style="{ animationDelay: `${idx * 0.04}s` }">

              <!-- Actions -->
              <div class="slv-card__actions">
                <button class="slv-card__action-btn" @click.stop="onEditSupplier(supplier)">
                  <Pencil :size="13" />
                </button>
                <button class="slv-card__action-btn slv-card__action-btn--del" @click.stop="onDeleteSupplier(supplier)">
                  <Trash2 :size="13" />
                </button>
              </div>

              <!-- Avatar -->
              <div class="slv-card__avatar-wrap">
                <div
                  v-if="supplier.image"
                  class="slv-card__avatar slv-card__avatar--img"
                >
                  <img :src="supplier.image" :alt="supplier.name" />
                </div>
                <div
                  v-else
                  class="slv-card__avatar"
                  :style="{ background: getAvatarGradient(supplier.name) }"
                >
                  {{ getInitials(supplier.name) }}
                </div>
              </div>

              <!-- Name -->
              <div class="slv-card__name">{{ supplier.name }}</div>
              <div v-if="supplier.contactName" class="slv-card__contact">
                <User :size="11" class="me-1" style="color:#9ca3af" />
                {{ supplier.contactName }}
              </div>

              <div class="slv-card__sep"></div>

              <!-- Info rows -->
              <div class="slv-card__info">
                <div v-if="supplier.email" class="slv-card__info-row">
                  <Mail :size="12" style="color:#ff3131" />
                  <span class="slv-card__info-text">{{ supplier.email }}</span>
                </div>
                <div v-if="supplier.phone" class="slv-card__info-row">
                  <Phone :size="12" style="color:#6b7280" />
                  <span class="slv-card__info-text">{{ supplier.phone }}</span>
                </div>
                <div v-if="supplier.city" class="slv-card__info-row">
                  <MapPin :size="12" style="color:#6b7280" />
                  <span class="slv-card__info-text">{{ supplier.city }}</span>
                </div>
              </div>

              <!-- Site badges -->
              <div v-if="getSupplierSiteNames(supplier).length > 0" class="slv-card__sites">
                <span
                  v-for="(site, i) in getSupplierSiteNames(supplier).slice(0, 3)"
                  :key="i"
                  class="slv-site-badge"
                >{{ site }}</span>
                <span v-if="getSupplierSiteNames(supplier).length > 3" class="slv-site-badge slv-site-badge--more">
                  +{{ getSupplierSiteNames(supplier).length - 3 }}
                </span>
              </div>

            </div>
          </div>
        </div>
      </template>

      <!-- ── List view ── -->
      <template v-else>
        <div class="slv-table-wrap">
          <v-data-table
            :headers="tableHeaders"
            :items="filteredSuppliers"
            item-value="id"
            density="comfortable"
            class="suppliers-table"
          >
            <template #item.name="{ item }">
              <div class="d-flex align-center" style="gap:12px">
                <div
                  v-if="item.image"
                  class="slv-table-avatar slv-table-avatar--img"
                >
                  <img :src="item.image" :alt="item.name" />
                </div>
                <div
                  v-else
                  class="slv-table-avatar"
                  :style="{ background: getAvatarGradient(item.name) }"
                >
                  {{ getInitials(item.name) }}
                </div>
                <div>
                  <div style="font-weight:600; font-size:14px;">{{ item.name }}</div>
                  <div v-if="item.contactName" style="font-size:12px; color:#9ca3af;">{{ item.contactName }}</div>
                </div>
              </div>
            </template>

            <template #item.site="{ item }">
              <div class="d-flex flex-wrap" style="gap:4px">
                <span v-for="(site, i) in getSupplierSiteNames(item).slice(0, 3)" :key="i" class="slv-site-badge">{{ site }}</span>
                <span v-if="getSupplierSiteNames(item).length > 3" class="slv-site-badge slv-site-badge--more">
                  +{{ getSupplierSiteNames(item).length - 3 }}
                </span>
              </div>
            </template>

            <template #item.actions="{ item }">
              <div class="d-flex justify-end" style="gap:6px">
                <button class="slv-table-btn" @click.stop="onEditSupplier(item)">
                  <Pencil :size="14" />
                </button>
                <button class="slv-table-btn slv-table-btn--del" @click.stop="onDeleteSupplier(item)">
                  <Trash2 :size="14" />
                </button>
              </div>
            </template>
          </v-data-table>
        </div>
      </template>
    </div>

    <SupplierFormDrawer
      v-model="supplierDialog"
      :mode="supplierMode"
      :initial-supplier="editingSupplier"
      :is-dark="isDark"
      @saved="loadSuppliers({ forceRefresh: true })"
    />

    <SupplierDeleteDialog
      v-model="deleteDialog"
      :supplier-name="deleteSupplierName"
      :supplier-id="deleteSupplierId"
      :is-dark="isDark"
      @deleted="loadSuppliers({ forceRefresh: true })"
    />
  </div>
</template>

<script>
import { AlertCircle, LayoutGrid, List, Mail, MapPin, PackageX, Pencil, Phone, Plus, Search, Trash2, Truck, Upload, User, X } from "lucide-vue-next";
import SupplierFormDrawer from '../drawers/SupplierFormDrawer.vue';
import SupplierDeleteDialog from '../dialogs/SupplierDeleteDialog.vue';
import { useI18n } from '@/i18n/useI18n';
import { getSupplierPhone, getSupplierPicture, getSupplierSiteNames } from '@/utils/supplierHelpers';

const AVATAR_GRADIENTS = [
  'linear-gradient(135deg,#ff3131,#e84444)',
  'linear-gradient(135deg,#6c63ff,#a29bfe)',
  'linear-gradient(135deg,#00b894,#00cec9)',
  'linear-gradient(135deg,#e17055,#ff3131)',
  'linear-gradient(135deg,#0984e3,#74b9ff)',
  'linear-gradient(135deg,#fd79a8,#ff3131)',
  'linear-gradient(135deg,#fdcb6e,#e17055)',
  'linear-gradient(135deg,#55efc4,#00b894)',
];

export default {
  name: "SuppliersListView",
  components: { AlertCircle, LayoutGrid, List, Mail, MapPin, PackageX, Pencil, Phone, Plus, Search, Trash2, Truck, Upload, User, X, SupplierFormDrawer, SupplierDeleteDialog },
  setup() {
    const { t, locale } = useI18n();
    return { t, locale };
  },
  data() {
    return {
      theme: localStorage.getItem('appTheme') || 'light',
      viewMode: "grid",
      searchQuery: "",
      loading: false,
      error: "",

      supplierDialog: false,
      supplierMode: "create",
      editingSupplier: null,

      deleteDialog: false,
      deleteSupplierId: null,
      deleteSupplierName: "",

      tableHeaders: [
        { title: "Nom", key: "name" },
        { title: "Email", key: "email" },
        { title: "Tél.", key: "phone" },
        { title: "Ville", key: "city" },
        { title: "Sites", key: "site", sortable: false },
        { title: "", key: "actions", sortable: false, align: "end" },
      ],
    };
  },
  computed: {
    isDark() {
      return this.theme === 'dark' || this.theme === 'dataFridayDark';
    },
    filteredSuppliers() {
      const q = (this.searchQuery || "").trim().toLowerCase();
      if (!q) return this.suppliers;
      return this.suppliers.filter((s) => {
        const hay = [s.name, s.email, s.city, s.phone, s.site]
          .filter(Boolean).join(" ").toLowerCase();
        return hay.includes(q);
      });
    },
    sites() {
      return this.$store.getters['spaces/spaces'] || [];
    },
    suppliers() {
      return (this.$store.getters['suppliers/suppliers'] || []).map((s) => ({
        ...s,
        image: getSupplierPicture(s),
        phone: getSupplierPhone(s),
        site: this.getSupplierSiteNames(s).join(", "),
      }));
    },
  },
  methods: {
    handleThemeChange(event) { this.theme = event.detail?.theme || 'light'; },

    getInitials(name) {
      if (!name) return '?';
      return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
    },
    getAvatarGradient(name) {
      if (!name) return AVATAR_GRADIENTS[0];
      const idx = (name.charCodeAt(0) + (name.charCodeAt(1) || 0)) % AVATAR_GRADIENTS.length;
      return AVATAR_GRADIENTS[idx];
    },

    getSupplierSiteNames(supplier) {
      return getSupplierSiteNames(supplier, this.sites);
    },

    async loadSuppliers({ forceRefresh = false } = {}) {
      this.loading = true;
      this.error = "";
      try {
        await this.$store.dispatch('suppliers/fetchSuppliers', { forceRefresh });
      } catch (e) {
        this.error = e?.response?.data?.message || e?.message || "Erreur lors du chargement";
      } finally {
        this.loading = false;
      }
    },
    async loadSites() {
      try { await this.$store.dispatch('spaces/fetchSpaces'); } catch { /* silence */ }
    },
    onAddSupplier() {
      this.supplierMode = 'create';
      this.editingSupplier = null;
      this.supplierDialog = true;
    },
    onEditSupplier(supplier) {
      this.supplierMode = 'edit';
      this.editingSupplier = supplier;
      this.supplierDialog = true;
    },
    onDeleteSupplier(supplier) {
      this.deleteSupplierId = supplier?.id || supplier?._id || null;
      this.deleteSupplierName = supplier?.name || "";
      this.deleteDialog = true;
    },
  },
  mounted() {
    this.loadSuppliers();
    this.loadSites();
    window.addEventListener('theme-changed', this.handleThemeChange);
  },
  beforeUnmount() {
    window.removeEventListener('theme-changed', this.handleThemeChange);
  },
};
</script>

<style scoped>
/* ── Page ── */
#suppliers-list-page {
  background: #f4f5f7;
  height: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}
.slv--dark#suppliers-list-page { background: #0f172a; }

/* ── Header ── */
.slv-header {
  background: #ff3131;
  box-shadow: 0 4px 20px rgba(255, 49, 49,.25);
}
.sticky-header {
  position: sticky;
  top: 0;
  z-index: 100;
  flex-shrink: 0;
}
.slv-header__inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 28px;
  gap: 16px;
}
.slv-header__left {
  display: flex;
  align-items: center;
  gap: 14px;
}
.slv-header__icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: rgba(255,255,255,.2);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.slv-header__title {
  font-size: 20px;
  font-weight: 800;
  color: #fff;
  margin: 0;
  line-height: 1.2;
}
.slv-header__subtitle {
  font-size: 12.5px;
  color: rgba(255,255,255,.72);
  margin: 3px 0 0;
}
.slv-header__right {
  display: flex;
  align-items: center;
  gap: 14px;
}
.slv-view-toggle {
  display: flex;
  background: rgba(255,255,255,.15);
  border-radius: 10px;
  padding: 3px;
  gap: 2px;
}
.slv-view-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  border-radius: 8px;
  color: rgba(255,255,255,.7);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all .18s;
}
.slv-view-btn--active {
  background: rgba(255,255,255,.25);
  color: #fff;
}
.slv-add-btn {
  display: inline-flex;
  align-items: center;
  padding: 9px 18px;
  border-radius: 100px;
  border: 2px solid rgba(255,255,255,.85);
  background: transparent;
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all .2s;
  white-space: nowrap;
}
.slv-add-btn:hover {
  background: #fff;
  color: #ff3131;
}

/* ── Search bar ── */
.slv-searchbar {
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
  position: sticky;
  top: 81px;
  z-index: 99;
  flex-shrink: 0;
}
.slv--dark .slv-searchbar {
  background: #1e293b;
  border-bottom-color: rgba(255,255,255,.08);
}
.slv-searchbar__inner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 28px;
}
.slv-searchbar__icon {
  color: #9ca3af;
  flex-shrink: 0;
}
.slv-searchbar__input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-size: 14px;
  color: #111827;
}
.slv--dark .slv-searchbar__input { color: #e5e7eb; }
.slv-searchbar__input::placeholder { color: #9ca3af; }
.slv-searchbar__count {
  font-size: 12px;
  color: #9ca3af;
  white-space: nowrap;
}
.slv-searchbar__clear {
  background: none;
  border: none;
  padding: 2px;
  cursor: pointer;
  color: #9ca3af;
  display: flex;
  align-items: center;
  border-radius: 4px;
}
.slv-searchbar__clear:hover { color: #ff3131; }

/* ── Content ── */
.slv-content {
  padding: 24px 28px;
}
.slv-loader { margin-bottom: 16px; }
.slv-alert {
  display: flex;
  align-items: center;
  padding: 10px 14px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 10px;
  font-size: 13px;
  color: #ff3131;
  margin-bottom: 16px;
}

/* ── Empty state ── */
.slv-empty {
  text-align: center;
  padding: 72px 24px;
  background: #fff;
  border-radius: 20px;
  border: 2px dashed #e5e7eb;
}
.slv--dark .slv-empty {
  background: #1e293b;
  border-color: rgba(255,255,255,.1);
}
.slv-empty__icon {
  width: 80px;
  height: 80px;
  border-radius: 20px;
  background: #f4f5f7;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 20px;
}
.slv-empty__title {
  font-size: 18px;
  font-weight: 700;
  color: #374151;
  margin: 0 0 8px;
}
.slv--dark .slv-empty__title { color: #e5e7eb; }
.slv-empty__sub {
  font-size: 13.5px;
  color: #9ca3af;
  margin: 0 0 20px;
}

/* ── Cards ── */
.slv-card {
  background: #fff;
  border-radius: 18px;
  padding: 20px 18px 16px;
  border: 1px solid #e5e7eb;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  transition: all .25s cubic-bezier(.4,0,.2,1);
  animation: slvFadeUp .4s ease-out both;
  cursor: default;
}
.slv--dark .slv-card {
  background: #1e293b;
  border-color: rgba(255,255,255,.08);
}
.slv-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 10px 28px rgba(0,0,0,.1);
  border-color: #ff3131;
}

@keyframes slvFadeUp {
  from { opacity: 0; transform: translateY(16px); }
  to   { opacity: 1; transform: translateY(0); }
}

.slv-card__actions {
  position: absolute;
  top: 12px;
  right: 12px;
  display: flex;
  gap: 5px;
  opacity: 0;
  transition: opacity .18s;
}
.slv-card:hover .slv-card__actions { opacity: 1; }

.slv-card__action-btn {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 8px;
  background: #f3f4f6;
  color: #6b7280;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all .18s;
}
.slv-card__action-btn:hover { background: #e5e7eb; color: #374151; }
.slv-card__action-btn--del:hover { background: #fef2f2; color: #ff3131; }

.slv-card__avatar-wrap { margin-bottom: 14px; }

.slv-card__avatar {
  width: 64px;
  height: 64px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  font-weight: 800;
  color: #fff;
  letter-spacing: -.5px;
}
.slv-card__avatar--img {
  background: #f3f4f6;
  overflow: hidden;
}
.slv-card__avatar--img img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.slv-card__name {
  font-size: 15px;
  font-weight: 700;
  color: #111827;
  margin-bottom: 4px;
  line-height: 1.2;
}
.slv--dark .slv-card__name { color: #f1f5f9; }

.slv-card__contact {
  font-size: 12px;
  color: #9ca3af;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
  margin-bottom: 2px;
}

.slv-card__sep {
  width: 100%;
  height: 1px;
  background: #f0f0f0;
  margin: 12px 0 10px;
}
.slv--dark .slv-card__sep { background: rgba(255,255,255,.07); }

.slv-card__info {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 6px;
  text-align: left;
}
.slv-card__info-row {
  display: flex;
  align-items: center;
  gap: 7px;
  overflow: hidden;
}
.slv-card__info-text {
  font-size: 12.5px;
  color: #6b7280;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.slv--dark .slv-card__info-text { color: #94a3b8; }

.slv-card__sites {
  width: 100%;
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 10px;
}

/* ── Site badges ── */
.slv-site-badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 9px;
  border-radius: 100px;
  font-size: 11px;
  font-weight: 600;
  background: #fef2f2;
  color: #ff3131;
  border: 1px solid #fecaca;
  white-space: nowrap;
}
.slv-site-badge--more {
  background: #f3f4f6;
  color: #6b7280;
  border-color: #e5e7eb;
}

/* ── Table view ── */
.slv-table-wrap {
  background: #fff;
  border-radius: 16px;
  border: 1px solid #e5e7eb;
  overflow: hidden;
}
.slv--dark .slv-table-wrap {
  background: #1e293b;
  border-color: rgba(255,255,255,.08);
}

.suppliers-table :deep(.v-data-table__td) {
  vertical-align: middle;
  padding-top: 14px !important;
  padding-bottom: 14px !important;
  font-size: 13.5px;
}
.suppliers-table :deep(.v-data-table__th) {
  padding-top: 14px !important;
  padding-bottom: 14px !important;
  font-weight: 700 !important;
  font-size: 11px !important;
  text-transform: uppercase;
  letter-spacing: .06em;
  color: #9ca3af !important;
  background: #fafafa !important;
}
.slv--dark .suppliers-table :deep(.v-data-table__th) {
  background: rgba(255,255,255,.03) !important;
  color: rgba(255,255,255,.45) !important;
}
.suppliers-table :deep(.v-data-table__tr:hover) {
  background: #fafafa !important;
}
.slv--dark .suppliers-table :deep(.v-data-table__tr:hover) {
  background: rgba(255,255,255,.03) !important;
}
.suppliers-table :deep(.v-data-table-footer) {
  border-top: 1px solid #e5e7eb;
  background: #fafafa !important;
}
.slv--dark .suppliers-table :deep(.v-data-table-footer) {
  background: rgba(255,255,255,.02) !important;
  border-top-color: rgba(255,255,255,.08) !important;
}

.slv-table-avatar {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 800;
  color: #fff;
}
.slv-table-avatar--img { background: #f3f4f6; overflow: hidden; }
.slv-table-avatar--img img { width: 100%; height: 100%; object-fit: cover; }

.slv-table-btn {
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 8px;
  background: #f3f4f6;
  color: #6b7280;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all .18s;
}
.slv-table-btn:hover { background: #e5e7eb; color: #374151; }
.slv-table-btn--del:hover { background: #fef2f2; color: #ff3131; }

/* ── Dark mode text ── */
.slv--dark .suppliers-table :deep(.v-data-table__td) { color: #e2e8f0; }
</style>
