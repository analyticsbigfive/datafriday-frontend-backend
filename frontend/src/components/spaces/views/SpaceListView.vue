<template>
  <div class="slv-root" :class="{'slv--dark': isDark}">
    <div class="slv-container">

      <!-- ===== STICKY HEADER ===== -->
      <div class="slv-sticky-header">
        <SpaceStats
          :total-revenue="totalRevenue"
          :total-f-b-revenue="totalFBRevenue"
          :total-ticketing-count="totalTicketingCount"
          :total-merch-revenue="totalMerchRevenue"
        />

        <!-- Filter bar -->
        <div class="slv-filter-bar">
          <div class="slv-filter-bar__top">
            <!-- Title -->
            <div class="slv-filter-bar__title-area">
              <div class="slv-title-accent"></div>
              <h2 class="slv-page-title">{{ t('spaceList.title') }}</h2>
              <span class="slv-count-badge">{{ filteredSpaces.length }}</span>
            </div>

            <!-- Controls -->
            <div class="slv-filter-bar__controls">
              <!-- Search -->
              <div class="slv-search-wrap">
                <Search :size="15" class="slv-search-wrap__icon" />
                <input
                  v-model="searchQuery"
                  type="text"
                  class="slv-search-wrap__input"
                  :placeholder="t('spaceList.searchPlaceholder')"
                />
              </div>

              <!-- Type filter -->
              <select v-model="typeFilter" class="slv-pill-select">
                <option value="">{{ t('spaceList.typePlaceholder') }}</option>
                <option v-for="type in spaceTypes" :key="type" :value="type">{{ type }}</option>
              </select>

              <!-- Sort -->
              <select v-model="sortBy" class="slv-pill-select">
                <option v-for="opt in sortOptions" :key="opt.value" :value="opt.value">{{ opt.title }}</option>
              </select>

              <!-- Refresh -->
              <button
                class="slv-icon-btn"
                :class="{ 'slv-icon-btn--spinning': loading }"
                @click="fetchSpaces({ forceRefresh: true })"
                :title="t('spaceList.retry')"
              >
                <RefreshCw :size="16" />
              </button>

              <!-- View toggle -->
              <div class="slv-view-toggle">
                <button class="slv-view-btn" :class="{ active: viewMode === 'grid' }" @click="viewMode = 'grid'">
                  <LayoutGrid :size="15" />
                </button>
                <button class="slv-view-btn" :class="{ active: viewMode === 'list' }" @click="viewMode = 'list'">
                  <List :size="15" />
                </button>
              </div>

              <!-- Create button — RBAC space.edit -->
              <button v-if="canEditSpace" class="slv-btn slv-btn--primary" @click="openCreateDialog">
                <Plus :size="15" />
                {{ t('spaceList.newSpace') }}
              </button>
            </div>
          </div>

          <!-- Active filter chips -->
          <div v-if="searchQuery || typeFilter" class="slv-active-filters">
            <span v-if="searchQuery" class="slv-filter-chip" @click="searchQuery = ''">
              {{ searchQuery }} <X :size="11" class="slv-filter-chip__x" />
            </span>
            <span v-if="typeFilter" class="slv-filter-chip" @click="typeFilter = ''">
              {{ typeFilter }} <X :size="11" class="slv-filter-chip__x" />
            </span>
            <button class="slv-clear-btn" @click="resetFilters">Tout effacer</button>
          </div>
        </div>
      </div>
      <!-- end sticky header -->

      <!-- ===== SCROLL AREA ===== -->
      <div class="slv-scroll-area">

        <!-- LOADING -->
        <div v-if="loading">
          <div v-if="viewMode === 'grid'" class="slv-grid">
            <div v-for="i in 6" :key="i" class="slv-sk-card">
              <div class="slv-sk slv-sk--img"></div>
              <div class="slv-sk-card__body">
                <div class="slv-sk slv-sk--title"></div>
                <div class="slv-sk slv-sk--sub"></div>
                <div class="slv-sk slv-sk--sub" style="width:55%"></div>
              </div>
            </div>
          </div>
          <div v-else class="slv-list-wrap">
            <div v-for="i in 5" :key="i" class="slv-sk-row">
              <div class="slv-sk slv-sk--thumb"></div>
              <div class="slv-sk-row__lines">
                <div class="slv-sk slv-sk--line-lg"></div>
                <div class="slv-sk slv-sk--line-sm"></div>
              </div>
              <div class="slv-sk slv-sk--line-sm" style="width:80px"></div>
              <div class="slv-sk slv-sk--line-sm" style="width:60px"></div>
              <div class="slv-sk slv-sk--line-sm" style="width:72px"></div>
            </div>
          </div>
        </div>

        <!-- ERROR -->
        <div v-else-if="error" class="slv-error-banner">
          <AlertCircle :size="17" />
          <span>{{ error }}</span>
          <button class="slv-error-retry" @click="fetchSpaces">{{ t('spaceList.retry') }}</button>
        </div>

        <!-- EMPTY -->
        <div v-else-if="filteredSpaces.length === 0" class="slv-empty">
          <div class="slv-empty__icon">
            <Building2 :size="36" color="#ff3131" />
          </div>
          <div class="slv-empty__title">
            {{ searchQuery || typeFilter ? t('spaceList.emptyFound') : t('spaceList.emptyNone') }}
          </div>
          <p class="slv-empty__sub">
            {{ searchQuery || typeFilter ? t('spaceList.emptyFoundDesc') : t('spaceList.emptyNoneDesc') }}
          </p>
          <button v-if="!searchQuery && !typeFilter && canEditSpace" class="slv-btn slv-btn--primary" @click="openCreateDialog">
            <Plus :size="15" /> {{ t('spaceList.createFirst') }}
          </button>
          <button v-else class="slv-btn slv-btn--secondary" @click="resetFilters">
            {{ t('spaceList.resetFilters') }}
          </button>
        </div>

        <!-- CONTENT -->
        <div v-else>
          <!-- Grid view -->
          <div v-if="viewMode === 'grid'" class="slv-grid">
            <SpaceItem
              v-for="space in filteredSpaces"
              :key="space.id"
              :space="space"
              :edit-space="editSpace"
              :delete-space="askDeleteSpace"
            />
          </div>

          <!-- List view -->
          <div v-else class="slv-cards">
            <div
              v-for="space in filteredSpaces"
              :key="space.id"
              class="slv-card-row"
              @click="goToSpace(space.id)"
            >
              <!-- Image -->
              <div class="slv-card-row__img">
                <img :src="space.image || 'https://cdn.vuetifyjs.com/images/cards/docks.jpg'" :alt="space.name" />
              </div>

              <!-- Body: name + sub -->
              <div class="slv-card-row__body">
                <div class="slv-card-row__name">{{ space.name }}</div>
                <div class="slv-card-row__sub">
                  <span v-if="space.spaceType" class="slv-type-pill">{{ space.spaceType }}</span>
                  <span v-if="space.city" class="slv-card-row__loc">
                    <MapPin :size="11" />{{ [space.city, space.country].filter(Boolean).join(', ') }}
                  </span>
                </div>
              </div>

              <!-- Stats -->
              <div class="slv-card-row__stats">
                <div v-if="space.maxCapacity" class="slv-card-row__stat">
                  <Users :size="12" />
                  <span>{{ space.maxCapacity.toLocaleString('fr-FR') }}</span>
                </div>
                <div class="slv-card-row__stat slv-card-row__stat--rev">
                  {{ formatCurrency(space.fbRevenue || 0) }}
                </div>
              </div>

              <!-- Actions — RBAC space.edit -->
              <div v-if="canEditSpace" class="slv-card-row__actions" @click.stop>
                <button class="slv-list-action-btn slv-list-action-btn--builder" title="3D Builder" @click.stop="$router.push(`/spaces/${space.id}/builder2`)">
                  <Boxes :size="14" />
                </button>
                <button class="slv-list-action-btn" @click.stop="editSpace(space)" title="Modifier">
                  <Pencil :size="14" />
                </button>
                <button class="slv-list-action-btn slv-list-action-btn--del" @click.stop="askDeleteSpace(space)" title="Supprimer">
                  <Trash2 :size="14" />
                </button>
              </div>
            </div>
          </div>
        </div>

      </div><!-- end slv-scroll-area -->

    </div><!-- end slv-container -->

    <!-- ===== CREATE / EDIT DRAWER ===== -->
    <SpaceCreateDrawer
      v-model="createDialog"
      :is-edit-mode="isEditMode"
      :initial-space="editingSpaceInitial"
      :is-dark="isDark"
      @created="onSpaceCreated"
      @updated="onSpaceUpdated"
    />

    <!-- ===== DELETE DIALOG ===== -->
    <SpaceDeleteDialog
      v-model="showDeleteConfirm"
      :space="selectedSpace"
      :loading="deleting"
      @confirm="doDeleteSpace"
    />

  </div>
</template>

<script>
import { computed } from "vue";
import { useTheme } from "vuetify";
import { useI18n } from "@/i18n/useI18n";
import {
  Plus,
  X,
  Search,
  List,
  Building2,
  RefreshCw,
  LayoutGrid,
  AlertCircle,
  MapPin,
  Pencil,
  Trash2,
  Users,
  Boxes,
} from "lucide-vue-next";
import SpaceStats from "../widgets/SpaceStats.vue";
import SpaceItem from "../widgets/SpaceItem.vue";
import SpaceCreateDrawer from "../drawers/SpaceCreateDrawer.vue";
import SpaceDeleteDialog from "../dialogs/SpaceDeleteDialog.vue";
import { deleteSpace } from "@/api/endpoints/space.api";
import { getLocationSpaceMappings, deleteLocationSpaceMapping } from "@/api/endpoints/mapping.api";

export default {
  name: "SpaceListView",
  components: {
    Plus, X, Search, List, Building2, RefreshCw, LayoutGrid,
    AlertCircle, MapPin, Pencil, Trash2, Users, Boxes,
    SpaceStats, SpaceItem, SpaceCreateDrawer, SpaceDeleteDialog,
  },
  setup() {
    const theme = useTheme();
    const { t } = useI18n();
    const isDark = computed(() => !!theme.global.current.value.dark);
    return { t, isDark };
  },
  data() {
    return {
      loading: false,
      deleting: false,
      searchQuery: "",
      typeFilter: "",
      sortBy: "name",
      viewMode: "grid",
      currentPage: 1,
      pageSize: 9,
      spaceTypeOptions: ["Stadium", "Arena", "Zénith", "Indoor Festival"],
      showCreateModal: false,
      showEditModal: false,
      showDeleteConfirm: false,
      selectedSpace: null,
      error: "",

      createDialog: false,
      isEditMode: false,
      editingSpaceInitial: null,
    };
  },

  computed: {
    spaceList() {
      return this.$store.getters['spaces/spaces'] || [];
    },
    // RBAC : création / édition / suppression / builder d'espace gardées par
    // `space.edit`. Lister les espaces ne requiert que `nav.spaces`.
    canEditSpace() {
      return this.$store.getters['auth/can']('space.edit');
    },
    spaceTypes() {
      return [...new Set(this.spaceList.map((s) => s.spaceType).filter(Boolean))].sort();
    },
    sortOptions() {
      return [
        { title: this.t('spaceList.sortName'), value: "name" },
        { title: this.t('spaceList.sortRevenue'), value: "revenue" },
        { title: this.t('spaceList.sortCapacity'), value: "capacity" },
        { title: this.t('spaceList.sortRecent'), value: "created" },
      ];
    },
    filteredSpaces() {
      let spaces = Array.isArray(this.spaceList) ? [...this.spaceList] : [];
      if (this.searchQuery) {
        const q = this.searchQuery.toLowerCase();
        spaces = spaces.filter(
          (s) => s.name?.toLowerCase().includes(q) || s.city?.toLowerCase().includes(q) || s.spaceType?.toLowerCase().includes(q)
        );
      }
      if (this.typeFilter) {
        spaces = spaces.filter((s) => s.spaceType === this.typeFilter);
      }
      if (this.sortBy === "name") spaces.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      else if (this.sortBy === "revenue") spaces.sort((a, b) => (b.totalRevenue || 0) - (a.totalRevenue || 0));
      else if (this.sortBy === "capacity") spaces.sort((a, b) => (b.maxCapacity || 0) - (a.maxCapacity || 0));
      else if (this.sortBy === "created") spaces.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      return spaces;
    },

    /** Nombre de pages (9 espaces / page). */
    pageCount() {
      return Math.max(1, Math.ceil(this.filteredSpaces.length / this.pageSize));
    },

    /** Espaces de la page courante. */
    pagedSpaces() {
      const start = (this.currentPage - 1) * this.pageSize;
      return this.filteredSpaces.slice(start, start + this.pageSize);
    },

    totalRevenue() {
      return this.spaceList.reduce((sum, s) => sum + (s.totalRevenue || 0), 0);
    },
    totalFBRevenue() {
      return this.spaceList.reduce((sum, s) => sum + (s.fbRevenue || 0), 0);
    },
    totalTicketingCount() {
      return this.spaceList.reduce((sum, s) => sum + (s.ticketingCount || 0), 0);
    },
    totalMerchRevenue() {
      return this.spaceList.reduce((sum, s) => sum + (s.merchRevenue || 0), 0);
    },
  },

  methods: {
    openCreateDialog() {
      this.isEditMode = false;
      this.editingSpaceInitial = null;
      this.createDialog = true;
    },

    editSpace(space) {
      this.isEditMode = true;
      this.editingSpaceInitial = { ...space };
      this.createDialog = true;
    },

    onSpaceCreated(space) {
      this.$store.dispatch('spaces/addSpace', space?.data ?? space);
      this.createDialog = false;
      const id = space?.data?.id || space?.id;
      if (id) this.$router.push(`/spaces/${id}/builder2`);
    },

    onSpaceUpdated(space) {
      this.$store.dispatch('spaces/updateSpace', space?.data ?? space);
      this.createDialog = false;
    },

    askDeleteSpace(space) {
      this.selectedSpace = space;
      this.showDeleteConfirm = true;
    },

    async doDeleteSpace() {
      if (!this.selectedSpace?.id) { this.showDeleteConfirm = false; return; }
      this.deleting = true;
      try {
        const deletedId = this.selectedSpace.id;
        await deleteSpace(deletedId);
        this.$store.dispatch('spaces/removeSpace', deletedId);
        this.$store.dispatch('spaceShops/invalidateForSpace', deletedId);
        // Clean up any Weezevent location→space mappings that pointed to this space
        this._cleanupSpaceMappings(deletedId).catch(() => {});
        this.showDeleteConfirm = false;
        this.selectedSpace = null;
      } catch (e) {
        this.error = e?.response?.data?.message || e?.message || this.t('spaceList.errorDelete');
      } finally {
        this.deleting = false;
      }
    },

    async _cleanupSpaceMappings(spaceId) {
      const result = await getLocationSpaceMappings();
      const mappings = result?.data || result || [];
      const orphans = mappings.filter(m => String(m.spaceId) === String(spaceId));
      await Promise.allSettled(orphans.map(m => deleteLocationSpaceMapping(m.weezeventLocationId)));
    },

    // ── Spaces list ───────────────────────────────────────────────────
    async fetchSpaces({ forceRefresh = false } = {}) {
      this.loading = true;
      this.error = "";
      try {
        await this.$store.dispatch('spaces/fetchSpaces', { forceRefresh });
      } catch (error) {
        this.error = error?.response?.data?.message || error?.message || this.t('spaceList.errorLoad');
      } finally {
        this.loading = false;
      }
    },

    formatCurrency(value) {
      return (Number(value) || 0).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
    },
    goToSpace(id) {
      this.$router.push(`/spaces/${id}`);
    },
    resetFilters() {
      this.searchQuery = "";
      this.typeFilter = "";
      this.sortBy = "name";
    },
  },

  watch: {
    // Retour page 1 quand la liste filtrée change (recherche / filtre / tri).
    searchQuery() { this.currentPage = 1; },
    typeFilter() { this.currentPage = 1; },
    sortBy() { this.currentPage = 1; },
    // Clamp si la page courante dépasse le total (ex. après suppression).
    pageCount(newCount) {
      if (this.currentPage > newCount) this.currentPage = newCount;
    },
  },

  mounted() {
    this.fetchSpaces();
  },
};
</script>

<style scoped>
/* ========== ROOT ========== */
.slv-root {
  background: #f3f4f6;
  /* Conteneur de scroll vertical : hauteur = viewport moins l'app-bar.
     position:fixed à l'intérieur reste ancré au viewport (comportement CSS standard). */
  height: calc(100vh - var(--v-layout-top, 64px));
  overflow-y: auto;
  overflow-x: hidden;
}

.slv-container {
  padding: 0 24px;
}

/* ========== FIXED HEADER ========== */
.slv-sticky-header {
  position: fixed;
  top: var(--v-layout-top, 64px);
  left: var(--v-layout-left, 0px);
  right: 0;
  z-index: 100;
  background: #f3f4f6;
  padding: 20px 24px 16px;
}

/* ========== SCROLL AREA ========== */
.slv-scroll-area {
  padding-top: 250px;
  padding-bottom: 40px;
}

/* Filter bar card */
.slv-filter-bar {
  background: #fff;
  border-radius: 18px;
  padding: 18px 20px 14px;
  box-shadow: 0 1px 4px rgba(0,0,0,.06), 0 4px 16px rgba(0,0,0,.04);
  border: 1px solid rgba(0,0,0,.05);
}
.slv-filter-bar__top {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}
.slv-filter-bar__title-area {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}
.slv-page-title {
  font-size: var(--fs-lg);
  font-weight: 700;
  color: #111827;
  margin: 0;
  background: linear-gradient(135deg, #1f2937 0%, #111827 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
.slv-count-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 26px;
  height: 22px;
  border-radius: 50px;
  padding: 0 8px;
  background: rgba(255, 49, 49,.10);
  color: #ff3131;
  font-size: var(--fs-sm);
  font-weight: 700;
}
.slv-filter-bar__controls {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-left: auto;
}

/* Search */
.slv-search-wrap {
  position: relative;
  display: flex;
  align-items: center;
}
.slv-search-wrap__icon {
  position: absolute;
  left: 12px;
  color: #9ca3af;
  pointer-events: none;
}
.slv-search-wrap__input {
  height: 38px;
  border: 1.5px solid #e5e7eb;
  border-radius: 50px;
  padding: 0 14px 0 34px;
  font-size: var(--fs-base);
  color: #111827;
  background: #f9fafb;
  outline: none;
  transition: border-color .2s, box-shadow .2s;
  width: 220px;
}
.slv-search-wrap__input:focus {
  border-color: #ff3131;
  box-shadow: 0 0 0 3px rgba(255, 49, 49,.10);
  background: #fff;
}
.slv-search-wrap__input::placeholder { color: #9ca3af; }

/* Pill select */
.slv-pill-select {
  height: 38px;
  border: 1.5px solid #e5e7eb;
  border-radius: 50px;
  padding: 0 30px 0 14px;
  font-size: var(--fs-base);
  color: #374151;
  background: #f9fafb url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E") no-repeat right 10px center;
  -webkit-appearance: none;
  appearance: none;
  outline: none;
  cursor: pointer;
  transition: border-color .2s;
}
.slv-pill-select:focus { border-color: #ff3131; background-color: #fff; }

/* Icon button */
.slv-icon-btn {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  border: 1.5px solid #e5e7eb;
  background: #f9fafb;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #6b7280;
  transition: all .2s;
  flex-shrink: 0;
}
.slv-icon-btn:hover { border-color: #ff3131; color: #ff3131; background: #fff; }
.slv-icon-btn--spinning svg { animation: slvSpin .8s linear infinite; }
@keyframes slvSpin { to { transform: rotate(360deg); } }

/* View toggle */
.slv-view-toggle {
  display: flex;
  border: 1.5px solid #e5e7eb;
  border-radius: 50px;
  overflow: hidden;
  background: #f9fafb;
}
.slv-view-btn {
  width: 36px;
  height: 34px;
  border: none;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #9ca3af;
  transition: all .2s;
}
.slv-view-btn.active {
  background: #ff3131;
  color: #fff;
}

/* Pill buttons */
.slv-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 18px;
  height: 38px;
  border-radius: 50px;
  font-size: var(--fs-base);
  font-weight: 500;
  border: none;
  cursor: pointer;
  transition: all .2s;
  white-space: nowrap;
  flex-shrink: 0;
}
.slv-btn:disabled { opacity: .5; cursor: not-allowed; }
.slv-btn--primary {
  background: #ff3131;
  color: #fff;
  box-shadow: 0 4px 12px rgba(255, 49, 49,.3);
}
.slv-btn--primary:hover:not(:disabled) {
  box-shadow: 0 6px 20px rgba(255, 49, 49,.4);
  transform: translateY(-1px);
}
.slv-btn--cancel, .slv-btn--back {
  background: #f3f4f6;
  color: #374151;
  border: 1.5px solid #e5e7eb;
}
.slv-btn--cancel:hover, .slv-btn--back:hover { background: #e9ecef; }
.slv-btn--secondary {
  background: transparent;
  color: #6b7280;
  border: 1.5px solid #e5e7eb;
}
.slv-btn--secondary:hover { background: #f3f4f6; }
.slv-btn--danger {
  background: #ff3131;
  color: #fff;
  box-shadow: 0 4px 12px rgba(255, 49, 49,.25);
}
.slv-btn--danger:hover:not(:disabled) { box-shadow: 0 6px 20px rgba(255, 49, 49,.4); }

/* Active filter chips */
.slv-active-filters {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid #f3f4f6;
}
.slv-filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px 3px 12px;
  background: rgba(255, 49, 49,.08);
  color: #ff3131;
  border-radius: 50px;
  font-size: var(--fs-sm);
  font-weight: 500;
  cursor: pointer;
  transition: background .2s;
}
.slv-filter-chip:hover { background: rgba(255, 49, 49,.15); }
.slv-filter-chip__x { opacity: .7; }
.slv-clear-btn {
  background: none;
  border: none;
  font-size: var(--fs-sm);
  color: #6b7280;
  cursor: pointer;
  padding: 0 4px;
  text-decoration: underline;
}
.slv-clear-btn:hover { color: #374151; }

/* ========== LOADING ========== */
.slv-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 64px 0;
  gap: 16px;
}
.slv-loading__text { color: #6b7280; font-size: var(--fs-md); margin: 0; }

/* ========== ERROR ========== */
.slv-error-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #991b1b;
  border-radius: 12px;
  padding: 12px 16px;
  font-size: var(--fs-md);
  margin: 16px 0;
}
.slv-error-retry {
  margin-left: auto;
  background: none;
  border: none;
  color: #ff3131;
  font-weight: 500;
  cursor: pointer;
  font-size: var(--fs-md);
  text-decoration: underline;
}

/* ========== EMPTY ========== */
.slv-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 64px 24px;
  gap: 12px;
}
.slv-empty__icon {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: #fef2f2;
  display: flex;
  align-items: center;
  justify-content: center;
}
.slv-empty__title { font-size: var(--fs-xl); font-weight: 700; color: #111827; }
.slv-empty__sub { font-size: var(--fs-md); color: #6b7280; max-width: 360px; margin: 0 0 8px; }

/* ========== GRID VIEW ========== */
.slv-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
}
@media (max-width: 1024px) { .slv-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 600px)  { .slv-grid { grid-template-columns: 1fr; } }

/* ========== LIST VIEW — card rows ========== */
.slv-type-pill {
  background: rgba(255, 49, 49,.08);
  color: #ff3131;
  border-radius: 50px;
  padding: 2px 9px;
  font-size: var(--fs-xs);
  font-weight: 600;
  letter-spacing: .03em;
  white-space: nowrap;
}

.slv-cards {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 4px;
}

.slv-card-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 16px;
  background: #fff;
  border-radius: 14px;
  border: 1px solid rgba(0,0,0,.05);
  box-shadow: 0 1px 3px rgba(0,0,0,.04);
  cursor: pointer;
  transition: box-shadow .2s, transform .15s;
}
.slv-card-row:hover {
  box-shadow: 0 6px 20px rgba(0,0,0,.10);
  transform: translateX(4px);
}
.slv-card-row:hover .slv-card-row__actions { opacity: 1; }

.slv-card-row__img {
  width: 60px;
  height: 60px;
  border-radius: 12px;
  overflow: hidden;
  flex-shrink: 0;
  background: #f3f4f6;
}
.slv-card-row__img img { width: 100%; height: 100%; object-fit: cover; display: block; }

.slv-card-row__body {
  flex: 1;
  min-width: 0;
}
.slv-card-row__name {
  font-size: var(--fs-md);
  font-weight: 700;
  color: #111827;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 6px;
}
.slv-card-row__sub {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.slv-card-row__loc {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: var(--fs-sm);
  color: #6b7280;
}

.slv-card-row__stats {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-shrink: 0;
}
.slv-card-row__stat {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: var(--fs-sm);
  color: #6b7280;
  white-space: nowrap;
}
.slv-card-row__stat--rev {
  font-size: var(--fs-md);
  font-weight: 700;
  color: #059669;
}

.slv-card-row__actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity .15s;
  flex-shrink: 0;
}

.slv-list-action-btn {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: none;
  background: #f3f4f6;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #6b7280;
  transition: all .15s;
}
.slv-list-action-btn:hover { background: #e5e7eb; color: #374151; }
.slv-list-action-btn--builder:hover { background: #eff6ff; color: #3b82f6; }
.slv-list-action-btn--del:hover { background: #fef2f2; color: #ff3131; }

/* ========== SKELETON ========== */
@keyframes slvShimmer {
  0%   { background-position: -600px 0; }
  100% { background-position: 600px 0; }
}
.slv-sk {
  border-radius: 8px;
  background: linear-gradient(90deg, #e5e7eb 25%, #f3f4f6 50%, #e5e7eb 75%);
  background-size: 600px 100%;
  animation: slvShimmer 1.4s infinite linear;
}
.slv--dark .slv-sk {
  background: linear-gradient(90deg, #374151 25%, #4b5563 50%, #374151 75%);
  background-size: 600px 100%;
}
.slv-sk--img    { width:100%; height:160px; border-radius:12px 12px 0 0; }
.slv-sk--title  { height:16px; width:70%; margin-bottom:10px; }
.slv-sk--sub    { height:12px; width:90%; margin-bottom:6px; }
.slv-sk--thumb  { width:52px; height:52px; border-radius:10px; flex-shrink:0; }
.slv-sk--line-lg{ height:14px; width:55%; margin-bottom:7px; border-radius:6px; }
.slv-sk--line-sm{ height:12px; width:75%; border-radius:6px; }

.slv-sk-card {
  background:#fff; border-radius:14px; overflow:hidden;
  border:1px solid rgba(0,0,0,.06); box-shadow:0 1px 4px rgba(0,0,0,.04);
}
.slv--dark .slv-sk-card { background:#1a2332; border-color:#374151; }
.slv-sk-card__body { padding:16px; display:flex; flex-direction:column; gap:0; }

.slv-sk-row {
  display:flex; align-items:center; gap:16px; padding:14px 20px;
  border-bottom:1px solid #f3f4f6;
}
.slv--dark .slv-sk-row { border-bottom-color:#374151; }
.slv-sk-row:last-child { border-bottom:none; }
.slv-sk-row__lines { flex:1; display:flex; flex-direction:column; gap:6px; }


/* ========== FILTER ACCENT ========== */
.slv-title-accent {
  width: 4px;
  height: 22px;
  border-radius: 4px;
  background: linear-gradient(135deg, #ff3131 0%, #b91c1c 100%);
  flex-shrink: 0;
}

/* ========== DARK MODE ========== */
.slv--dark.slv-root { background: #111827; }
.slv--dark .slv-sticky-header { background: #111827; }

.slv--dark .slv-filter-bar {
  background: #1a2332;
  border-color: #374151;
  box-shadow: 0 1px 4px rgba(0,0,0,.2);
}
.slv--dark .slv-page-title {
  background: linear-gradient(135deg, #e5e7eb 0%, #f9fafb 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}
.slv--dark .slv-search-wrap__input {
  border-color: #374151; background: #111827; color: #f9fafb;
}
.slv--dark .slv-search-wrap__input:focus { border-color: #ff3131; }
.slv--dark .slv-pill-select { border-color: #374151; background-color: #111827; color: #d1d5db; }
.slv--dark .slv-icon-btn { border-color: #374151; background: #111827; color: #9ca3af; }
.slv--dark .slv-view-toggle { border-color: #374151; background: #111827; }
.slv--dark .slv-view-btn { color: #6b7280; }
.slv--dark .slv-active-filters { border-top-color: #374151; }

/* Card rows dark */
.slv--dark .slv-card-row { background: #1a2332; border-color: #374151; }
.slv--dark .slv-card-row:hover { background: #1f2d3d; box-shadow: 0 6px 20px rgba(0,0,0,.25); }
.slv--dark .slv-card-row__name { color: #f9fafb; }
.slv--dark .slv-card-row__loc  { color: #9ca3af; }
.slv--dark .slv-card-row__stat { color: #9ca3af; }
.slv--dark .slv-card-row__actions { opacity: 0; }
.slv--dark .slv-card-row:hover .slv-card-row__actions { opacity: 1; }
.slv--dark .slv-list-action-btn { background: #374151; color: #9ca3af; }
.slv--dark .slv-list-action-btn:hover { background: #4b5563; color: #f9fafb; }
.slv--dark .slv-list-action-btn--del:hover { background: rgba(255, 49, 49,.2); color: #f87171; }
</style>
