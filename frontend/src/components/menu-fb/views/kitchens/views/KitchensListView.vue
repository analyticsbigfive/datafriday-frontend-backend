<template>
  <div id="kitchens-list-page" :class="{ 'slv--dark': isDark }">

    <!-- ── Header ── -->
    <div class="slv-header sticky-header">
      <div class="slv-header__inner">
        <div class="slv-header__left">
          <div class="slv-header__icon">
            <ChefHat :size="22" color="white" />
          </div>
          <div>
            <h1 class="slv-header__title">{{ t('kitchensTitle') }}</h1>
            <p class="slv-header__subtitle">{{ t('kitchensSubtitle') }}</p>
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
          <button class="slv-add-btn" @click="onAddKitchen">
            <Plus :size="17" class="me-1" />
            {{ t('addKitchen') }}
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
          :placeholder="t('kitchensSearchPlaceholder')"
        />
        <span class="slv-searchbar__count">{{ filteredKitchens.length }} {{ t('kitchensTotal') }}</span>
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
        <div v-if="filteredKitchens.length === 0" class="slv-empty">
          <div class="slv-empty__icon">
            <PackageX :size="44" style="color:#d1d5db" />
          </div>
          <h3 class="slv-empty__title">{{ t('kitchensNoneFound') }}</h3>
          <p class="slv-empty__sub">{{ searchQuery ? t('tryAdjusting') : t('kitchensNoneMessage') }}</p>
          <button v-if="!searchQuery" class="slv-add-btn" @click="onAddKitchen">
            <Plus :size="17" class="me-1" />
            {{ t('kitchensAddFirst') }}
          </button>
        </div>

        <div v-else class="row g-4">
          <div
            v-for="(kitchen, idx) in filteredKitchens"
            :key="kitchen.id"
            class="col-12 col-sm-6 col-lg-4 col-xl-3"
          >
            <div class="slv-card" :style="{ animationDelay: `${idx * 0.04}s` }">

              <!-- Actions -->
              <div class="slv-card__actions">
                <button class="slv-card__action-btn" @click.stop="onEditKitchen(kitchen)">
                  <Pencil :size="13" />
                </button>
                <button class="slv-card__action-btn slv-card__action-btn--del" @click.stop="onDeleteKitchen(kitchen)">
                  <Trash2 :size="13" />
                </button>
              </div>

              <!-- Avatar -->
              <div class="slv-card__avatar-wrap">
                <div
                  v-if="kitchen.image"
                  class="slv-card__avatar slv-card__avatar--img"
                >
                  <img :src="kitchen.image" :alt="kitchen.name" />
                </div>
                <div
                  v-else
                  class="slv-card__avatar"
                  :style="{ background: getAvatarGradient(kitchen.name) }"
                >
                  {{ getInitials(kitchen.name) }}
                </div>
              </div>

              <!-- Name -->
              <div class="slv-card__name">{{ kitchen.name }}</div>
              <div v-if="kitchen.contactName" class="slv-card__contact">
                <User :size="11" class="me-1" style="color:#9ca3af" />
                {{ kitchen.contactName }}
              </div>

              <div class="slv-card__sep"></div>

              <!-- Info rows -->
              <div class="slv-card__info">
                <div v-if="kitchen.email" class="slv-card__info-row">
                  <Mail :size="12" style="color:#ff3131" />
                  <span class="slv-card__info-text">{{ kitchen.email }}</span>
                </div>
                <div v-if="kitchen.phone" class="slv-card__info-row">
                  <Phone :size="12" style="color:#6b7280" />
                  <span class="slv-card__info-text">{{ kitchen.phone }}</span>
                </div>
                <div v-if="kitchen.city" class="slv-card__info-row">
                  <MapPin :size="12" style="color:#6b7280" />
                  <span class="slv-card__info-text">{{ kitchen.city }}</span>
                </div>
              </div>

              <!-- Site badges -->
              <div v-if="getKitchenSiteNames(kitchen).length > 0" class="slv-card__sites">
                <span
                  v-for="(site, i) in getKitchenSiteNames(kitchen).slice(0, 3)"
                  :key="i"
                  class="slv-site-badge"
                >{{ site }}</span>
                <span v-if="getKitchenSiteNames(kitchen).length > 3" class="slv-site-badge slv-site-badge--more">
                  +{{ getKitchenSiteNames(kitchen).length - 3 }}
                </span>
              </div>

            </div>
          </div>
        </div>
      </template>

      <!-- ── List view ── -->
      <template v-else>
        <div v-if="bulkSelected.length" class="bulk-bar">
          <span class="bulk-bar__info">{{ bulkSelected.length }} {{ t('bulkSelected') }}</span>
          <div class="bulk-bar__actions">
            <button type="button" class="bulk-bar__clear" @click="bulkSelected = []">{{ t('bulkDeselect') }}</button>
            <button type="button" class="bulk-bar__del" @click="openBulkDelete"><Trash2 :size="15" /> {{ t('delete') }}</button>
          </div>
        </div>
        <div class="slv-table-wrap">
          <v-data-table
            v-model="bulkSelected"
            show-select
            :headers="tableHeaders"
            :items="filteredKitchens"
            item-value="id"
            density="compact"
            class="kitchens-table"
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
                <span v-for="(site, i) in getKitchenSiteNames(item).slice(0, 3)" :key="i" class="slv-site-badge">{{ site }}</span>
                <span v-if="getKitchenSiteNames(item).length > 3" class="slv-site-badge slv-site-badge--more">
                  +{{ getKitchenSiteNames(item).length - 3 }}
                </span>
              </div>
            </template>

            <template #item.actions="{ item }">
              <div class="slv-table-actions">
                <button class="slv-table-btn slv-table-btn--edit" @click.stop="onEditKitchen(item)">
                  <Pencil :size="14" />
                </button>
                <button class="slv-table-btn slv-table-btn--del" @click.stop="onDeleteKitchen(item)">
                  <Trash2 :size="14" />
                </button>
              </div>
            </template>
          </v-data-table>
        </div>
      </template>
    </div>

    <KitchenFormDrawer
      v-model="kitchenDialog"
      :mode="kitchenMode"
      :initial-kitchen="editingKitchen"
      :is-dark="isDark"
      @saved="loadKitchens({ forceRefresh: true })"
    />

    <KitchenDeleteDialog
      v-model="deleteDialog"
      :kitchen-name="deleteKitchenName"
      :kitchen-id="deleteKitchenId"
      :is-dark="isDark"
      @deleted="loadKitchens({ forceRefresh: true })"
    />

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

<script>
import { AlertCircle, ChefHat, LayoutGrid, List, Mail, MapPin, PackageX, Pencil, Phone, Plus, Search, Trash2, User, X } from "lucide-vue-next";
import KitchenFormDrawer from '../drawers/KitchenFormDrawer.vue';
import KitchenDeleteDialog from '../dialogs/KitchenDeleteDialog.vue';
import BulkDeleteDialog from '@/components/common/BulkDeleteDialog.vue';
import { useI18n } from '@/i18n/useI18n';
import { deleteKitchen } from '@/api/endpoints/kitchens.api';
import { getSupplierSiteNames } from '@/utils/supplierHelpers';

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
  name: "KitchensListView",
  components: { AlertCircle, ChefHat, LayoutGrid, List, Mail, MapPin, PackageX, Pencil, Phone, Plus, Search, Trash2, User, X, KitchenFormDrawer, KitchenDeleteDialog, BulkDeleteDialog },
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

      kitchenDialog: false,
      kitchenMode: "create",
      editingKitchen: null,

      deleteDialog: false,
      deleteKitchenId: null,
      deleteKitchenName: "",

      bulkSelected: [],
      bulkOpen: false,
      bulkLoading: false,
      bulkError: "",
      bulkProgress: 0,
      bulkTotal: 0,

    };
  },
  computed: {
    isDark() {
      return this.theme === 'dark' || this.theme === 'dataFridayDark';
    },
    tableHeaders() {
      return [
        { title: this.t('kitchenName'), key: "name" },
        { title: this.t('kitchenManagerEmail'), key: "email" },
        { title: this.t('kitchenManagerPhone'), key: "phone" },
        { title: this.t('city'), key: "city" },
        { title: this.t('kitchenSpaces'), key: "site", sortable: false },
        { title: "", key: "actions", sortable: false, align: "end" },
      ];
    },
    filteredKitchens() {
      const q = (this.searchQuery || "").trim().toLowerCase();
      if (!q) return this.kitchens;
      return this.kitchens.filter((s) => {
        const hay = [s.name, s.email, s.city, s.phone, s.site]
          .filter(Boolean).join(" ").toLowerCase();
        return hay.includes(q);
      });
    },
    sites() {
      return this.$store.getters['spaces/spaces'] || [];
    },
    kitchens() {
      return (this.$store.getters['kitchens/kitchens'] || []).map((k) => ({
        ...k,
        image: k.picture || '',
        phone: k.tel || '',
        site: this.getKitchenSiteNames(k).join(", "),
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

    // Même champ `sites` que les fournisseurs : on réutilise leur helper.
    getKitchenSiteNames(kitchen) {
      return getSupplierSiteNames(kitchen, this.sites);
    },

    async loadKitchens({ forceRefresh = false } = {}) {
      this.loading = true;
      this.error = "";
      try {
        await this.$store.dispatch('kitchens/fetchKitchens', { forceRefresh });
      } catch (e) {
        this.error = e?.response?.data?.message || e?.message || this.t('kitchensLoadError');
      } finally {
        this.loading = false;
      }
    },
    async loadSites() {
      try { await this.$store.dispatch('spaces/fetchSpaces'); } catch { /* silence */ }
    },
    onAddKitchen() {
      this.kitchenMode = 'create';
      this.editingKitchen = null;
      this.kitchenDialog = true;
    },
    onEditKitchen(kitchen) {
      this.kitchenMode = 'edit';
      this.editingKitchen = kitchen;
      this.kitchenDialog = true;
    },
    onDeleteKitchen(kitchen) {
      this.deleteKitchenId = kitchen?.id || null;
      this.deleteKitchenName = kitchen?.name || "";
      this.deleteDialog = true;
    },
    openBulkDelete() { this.bulkError=''; this.bulkProgress=0; this.bulkTotal=0; this.bulkOpen=true; },
    async confirmBulkDelete() {
      const ids=[...this.bulkSelected]; if(!ids.length) return;
      this.bulkLoading=true; this.bulkError=''; this.bulkTotal=ids.length; this.bulkProgress=0;
      const failed=[];
      for (const id of ids){ try{ await deleteKitchen(id); this.$store.dispatch('kitchens/removeKitchen', id); }catch(e){ failed.push(id); } this.bulkProgress+=1; }
      this.bulkLoading=false; this.bulkSelected=failed;
      if(failed.length) this.bulkError=`${failed.length} ${this.t('kitchensBulkDeleteFailed')}`;
      else this.bulkOpen=false;
    },
  },
  mounted() {
    this.loadKitchens();
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
#kitchens-list-page {
  background: #f4f5f7;
  height: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}
.slv--dark#kitchens-list-page { background: #0f172a; }

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

/* ── Bulk bar ── */
.bulk-bar { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:10px 16px; margin-bottom:12px; background:#fff5f5; border:1px solid #fecaca; border-radius:12px; }
.bulk-bar__info { font-size:var(--fs-base); font-weight:700; color:#ff3131; }
.bulk-bar__actions { display:flex; align-items:center; gap:8px; }
.bulk-bar__clear { background:none; border:none; color:#6b7280; font-size:var(--fs-sm); font-weight:600; cursor:pointer; padding:6px 10px; border-radius:8px; }
.bulk-bar__clear:hover { background:rgba(0,0,0,.05); color:#374151; }
.bulk-bar__del { display:inline-flex; align-items:center; gap:6px; background:#ff3131; color:#fff; border:none; border-radius:100px; padding:7px 16px; font-size:var(--fs-sm); font-weight:700; cursor:pointer; }
.bulk-bar__del:hover { box-shadow:0 4px 14px rgba(255,49,49,.35); transform:translateY(-1px); }
.slv--dark .bulk-bar { background:rgba(255,49,49,.1); border-color:rgba(255,49,49,.3); }
.slv--dark .bulk-bar__clear { color:#94a3b8; }
.slv--dark .bulk-bar__clear:hover { background:rgba(255,255,255,.06); color:#e2e8f0; }

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

.kitchens-table :deep(.v-data-table__th),
.kitchens-table :deep(.v-data-table__td) {
  font-size: var(--fs-base);
  padding-top: 10px;
  padding-bottom: 10px;
  padding-left: 16px;
  padding-right: 16px;
}
.kitchens-table :deep(.v-data-table__td) { vertical-align: middle; }
.kitchens-table :deep(.v-data-table__th) {
  font-size: var(--fs-xs) !important;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .06em;
  color: #9ca3af !important;
  background: #fafafa !important;
}
.kitchens-table :deep(tbody tr:hover td) { background: #fafafa !important; }
.slv--dark .kitchens-table :deep(.v-data-table__th) { background: #1a2332 !important; }
.slv--dark .kitchens-table :deep(tbody tr:hover td) { background: #1a2332 !important; }
.kitchens-table :deep(.v-data-table-footer) {
  border-top: 1px solid #e5e7eb;
  background: #fafafa !important;
}
.slv--dark .kitchens-table :deep(.v-data-table-footer) {
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

.slv-table-actions { display: flex; gap: 4px; justify-content: flex-end; }
.slv-table-btn {
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
  transition: background .15s, color .15s;
  flex-shrink: 0;
}
.slv-table-btn--edit { background: #eff6ff; color: #2563eb; }
.slv-table-btn--edit:hover { background: #dbeafe; }
.slv-table-btn--del { background: #fef2f2; color: #ff3131; }
.slv-table-btn--del:hover { background: #fee2e2; }

/* ── Dark mode text ── */
.slv--dark .kitchens-table :deep(.v-data-table__td) { color: #e2e8f0; }
.slv--dark .slv-table-btn { background: #1f2937; color: #cbd5e1; }
.slv--dark .slv-table-btn--edit { background: rgba(37,99,235,.15); color: #93c5fd; }
.slv--dark .slv-table-btn--del { background: rgba(255,49,49,.14); color: #fca5a5; }
</style>
