<template>
  <div class="ecl-root" :class="{'ecl--dark': isDark}">

    <!-- ── Header ── -->
    <div class="ecl-header sticky-header">
      <div class="ecl-header__inner">
        <div class="ecl-header__left">
          <div class="ecl-header__icon">
            <Shapes :size="22" color="white" />
          </div>
          <div>
            <h1 class="ecl-header__title">{{ t('eventCategoryList.title') }}</h1>
            <p class="ecl-header__subtitle">{{ t('eventCategoryList.subtitle') }}</p>
          </div>
        </div>
        <div class="ecl-header__right">
          <div class="ecl-header__sep"></div>
          <div class="ecl-header__actions">
            <button class="ecl-action-hbtn" @click="exportToCSV">
              <Download :size="15" /> {{ t('eventCategoryList.exportCsv') }}
            </button>
            <button class="ecl-action-hbtn" @click="taxonomyImportDrawer = true">
              <Upload :size="15" /> {{ t('eventCategoryList.importCsv') }}
            </button>
            <button class="ecl-add-btn" @click="openCreateDialog">
              <Plus :size="17" /> {{ t('eventCategoryList.newCategory') }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Search bar ── -->
    <div class="ecl-searchbar sticky-search">
      <div class="ecl-searchbar__inner">
        <Search :size="17" class="ecl-searchbar__icon" />
        <input v-model="search" class="ecl-searchbar__input" type="search" :placeholder="t('eventCategoryList.searchPlaceholder')" />
        <span class="ecl-searchbar__count">
          <Shapes :size="13" />
          {{ categories.length }} catégorie{{ categories.length !== 1 ? 's' : '' }}
        </span>
      </div>
    </div>

    <!-- ── Content ── -->
    <div class="ecl-content">

      <!-- Error -->
      <div v-if="error" class="ecl-error-bar mb-4">
        <AlertCircle :size="14" /> {{ error }}
      </div>

      <!-- Table card -->
      <div class="ecl-table-wrap">
        <v-data-table
          v-model:search="search"
          :filter-keys="['name']"
          :headers="tableHeaders"
          :items="categories"
          :loading="loading ? '#ff3131' : false"
          :items-per-page="25"
          :items-per-page-options="[10, 25, 50, 100]"
          density="compact"
          class="ecl-table"
        >
          <template #item.eventType="{ item }">
            <span class="ecl-type-pill">
              {{ item?.eventType?.name || item?.eventTypeName || eventTypeNameById[item?.eventTypeId] || item?.eventType || '—' }}
            </span>
          </template>
          <template #item.hasHomeTeam="{ item }">
            <span v-if="item?.hasHomeTeam" class="ecl-yes-badge">Oui</span>
            <span v-else class="ecl-no-badge">Non</span>
          </template>
          <template #item.actions="{ item }">
            <div class="ecl-actions">
              <div class="ecl-abtn ecl-abtn--info" @click.stop="openDetailsDrawer(item)">
                <Eye :size="15" />
              </div>
              <div class="ecl-abtn ecl-abtn--edit" @click.stop="openEditDialog(item)">
                <Pencil :size="15" />
              </div>
              <div class="ecl-abtn ecl-abtn--del" @click.stop="openDeleteDialog(item)">
                <Trash2 :size="15" />
              </div>
            </div>
          </template>
        </v-data-table>
      </div>
    </div>

    <!-- BUG-145 : dialog partagé (créait auparavant une divergence avec EventFormDrawer.vue /
         EventsSubcategorieListView.vue — cause racine de BUG-130/131) — étendu pour couvrir
         édition + création de type à la volée, les 2 besoins propres à cet écran. -->
    <EventCategoryDialog
      v-model="categoryDialog"
      :event-types="eventTypes"
      :category="editingCategory"
      allow-create-type
      @created="handleCategoryCreated"
      @updated="handleCategoryUpdated"
    />

    <!-- BUG-155 : tiroir (au lieu d'un v-dialog centré) — cohérence charte graphique, cf. BUG-153. -->
    <EventDrawerShell
      v-model="deleteDialog"
      :is-dark="isDark"
      :persistent="deleteLoading"
      width="420"
      :title="t('eventCategoryList.deleteTitle')"
      :subtitle="t('eventCategoryList.deleteSubtitle')"
    >
      <template #icon>
        <Trash2 :size="18" color="white" />
      </template>

      <div :class="{ 'ecl--dark': isDark }">
        <div v-if="deleteError" class="ecl-delete-error"><AlertCircle :size="14" /> {{ deleteError }}</div>
        <p class="ecl-delete-text">
          {{ t('eventCategoryList.deleteText') }} <strong>{{ deleteCategoryName }}</strong> ?
        </p>
      </div>

      <template #footer>
        <button class="ecl-mbtn ecl-mbtn--cancel" @click="closeDeleteDialog">{{ t('eventCategoryList.deleteCancel') }}</button>
        <button class="ecl-mbtn ecl-mbtn--danger" :disabled="deleteLoading" @click="confirmDelete">
          <Trash2 :size="14" />
          {{ deleteLoading ? t('eventCategoryList.deleteConfirming') : t('eventCategoryList.deleteConfirm') }}
        </button>
      </template>
    </EventDrawerShell>

    <TaxonomyImportDrawer
      v-model="taxonomyImportDrawer"
      entity="category"
      :is-dark="isDark"
      @imported="loadCategories"
    />

    <!-- BUG-153 : tiroir de détail (liste des événements liés, cliquables) — même composant partagé
         qu'/event-types et /event-subcategories. -->
    <TaxonomyDetailDrawer v-model="detailsDrawer" entity="category" :item="detailsCategory" :is-dark="isDark" />
  </div>
</template>

<script>
import { computed } from "vue";
import { useTheme } from "vuetify";
import { useI18n } from "@/i18n/useI18n";
import { Upload, Download, Eye, Pencil, Plus, Trash2, Search, Shapes, AlertCircle } from "lucide-vue-next";
import { downloadCSV } from "@/utils/csv";
import { deleteEventCategory } from "@/api/endpoints/event.api";
import TaxonomyImportDrawer from '../drawers/TaxonomyImportDrawer.vue';
import TaxonomyDetailDrawer from '../drawers/TaxonomyDetailDrawer.vue';
import EventDrawerShell from '../drawers/EventDrawerShell.vue';
import EventCategoryDialog from '../dialogs/EventCategoryDialog.vue';

export default {
  name: "EventsCategorieListView",
  components: {
    Upload,
    Download,
    Eye,
    Pencil,
    Plus,
    Trash2,
    Search,
    Shapes,
    AlertCircle,
    TaxonomyImportDrawer,
    TaxonomyDetailDrawer,
    EventDrawerShell,
    EventCategoryDialog,
  },
  setup() {
    const theme = useTheme();
    const { t } = useI18n();
    const isDark = computed(() => !!theme.global.current.value.dark);
    return { t, isDark };
  },
  data() {
    return {
      search: "",
      taxonomyImportDrawer: false,
      loading: false,
      error: "",

      // BUG-145 : catégorie en cours d'édition (objet) → passée au dialog partagé
      // EventCategoryDialog en mode édition ; null = mode création.
      categoryDialog: false,
      editingCategory: null,

      detailsDrawer: false,
      detailsCategory: null,

      deleteDialog: false,
      deleteLoading: false,
      deleteError: "",
      deleteCategoryId: null,
      deleteCategoryName: "",
    };
  },

  methods: {
    async loadEventTypes() {
      try {
        await this.$store.dispatch('eventTypes/fetchEventTypes')
      } catch (e) {
        // Un échec ici laissait le select "Event Type" du dialog vide sans aucune
        // explication (store jamais rempli) — surfacé maintenant au lieu d'être avalé.
        this.error = e?.response?.data?.message || e?.message || "Erreur lors du chargement des types d'événements"
      }
    },
    async loadCategories() {
      this.loading = true;
      this.error = "";
      try {
        await this.$store.dispatch('eventCategories/fetchEventCategories')
      } catch (e) {
        this.error = e?.userMessage || e?.message || "Impossible de charger les catégories";
      } finally {
        this.loading = false;
      }
    },

    openCreateDialog() {
      this.editingCategory = null;
      this.categoryDialog = true;
    },
    openEditDialog(category) {
      this.editingCategory = category;
      this.categoryDialog = true;
    },
    openDetailsDrawer(category) {
      this.detailsCategory = category;
      this.detailsDrawer = true;
    },
    // BUG-145 : EventCategoryDialog gère désormais lui-même la création ET la sauvegarde
    // (create/update + dispatch store) — ces handlers ne font plus que refléter le résultat
    // dans l'état local de cet écran (utile pour tout affichage optimiste additionnel futur ;
    // aujourd'hui le store suffit, `categories` en dérive directement).
    handleCategoryCreated() {
      this.editingCategory = null;
    },
    handleCategoryUpdated() {
      this.editingCategory = null;
    },

    openDeleteDialog(category) {
      this.deleteCategoryId = category?.id || category?._id || null;
      this.deleteCategoryName = category?.name || "this category";
      this.deleteError = "";
      this.deleteLoading = false;
      this.deleteDialog = true;
    },
    closeDeleteDialog() {
      this.deleteDialog = false;
      this.deleteLoading = false;
      this.deleteError = "";
      this.deleteCategoryId = null;
      this.deleteCategoryName = "";
    },
    async confirmDelete() {
      if (!this.deleteCategoryId) {
        this.deleteError = "Missing category id";
        return;
      }

      this.deleteLoading = true;
      this.deleteError = "";

      try {
        await deleteEventCategory(this.deleteCategoryId);
        await this.$store.dispatch('eventCategories/removeEventCategory', this.deleteCategoryId);
        this.closeDeleteDialog();
      } catch (e) {
        this.deleteError = e?.response?.data?.message || e?.message || "Failed to delete category";
      } finally {
        this.deleteLoading = false;
      }
    },

    exportToCSV() {
      const rows = [
        ['Name', 'Event Type', 'Has Home Team'],
        ...(this.categories || []).map(c => [
          c?.name || '',
          this.eventTypeNameById[c?.eventTypeId] || '',
          c?.hasHomeTeam ? 'Yes' : 'No',
        ]),
      ];
      downloadCSV(rows, 'event-categories');
    },
  },

  computed: {
    categories() {
      return this.$store.getters['eventCategories/eventCategories']
    },
    eventTypes() {
      return this.$store.getters['eventTypes/eventTypes'].map((t) => ({
        ...t,
        id: t?.id || t?._id,
      })).filter((t) => !!t.id)
    },
    tableHeaders() {
      return [
        { title: this.t('eventCategoryList.colName'), key: 'name' },
        { title: this.t('eventCategoryList.colType'), key: 'eventType' },
        { title: this.t('eventCategoryList.colHomeTeam'), key: 'hasHomeTeam' },
        { title: this.t('eventCategoryList.colActions'), key: 'actions', sortable: false, align: 'end' },
      ];
    },
    eventTypeNameById() {
      const map = {};
      const types = Array.isArray(this.eventTypes) ? this.eventTypes : [];
      for (const t of types) {
        const id = t?.id || t?._id;
        if (!id) continue;
        map[String(id)] = t?.name || "";
      }
      return map;
    },
  },

  mounted() {
    this.loadEventTypes();
    this.loadCategories();
  },
};
</script>

<style scoped>
.ecl-root { width: 100%; min-height: 100%; background: #f5f5f5; }
.ecl--dark.ecl-root { background: #111827; }

/* ── Header ── */
.ecl-header {
  background: #ff3131;
  box-shadow: 0 4px 20px rgba(255, 49, 49,.25);
}
.sticky-header { position: sticky; top: 0; z-index: 100; flex-shrink: 0; }
.ecl-header__inner {
  display: flex; align-items: center; justify-content: space-between;
  padding: 18px 28px; gap: 16px; flex-wrap: wrap;
}
.ecl-header__left { display: flex; align-items: center; gap: 14px; }
.ecl-header__icon {
  width: 44px; height: 44px; border-radius: 12px;
  background: rgba(255,255,255,.2);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.ecl-header__title { font-size: var(--fs-xl); font-weight: var(--fw-bold); color: #fff; margin: 0; line-height: 1.2; }
.ecl-header__subtitle { font-size: var(--fs-sm); color: rgba(255,255,255,.72); margin: 3px 0 0; }
.ecl-header__right { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
.ecl-header__sep { width: 1px; height: 32px; background: rgba(255,255,255,.25); }
.ecl-header__actions { display: flex; align-items: center; gap: 8px; }
.ecl-action-hbtn {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 7px 14px; border-radius: 100px;
  border: 1.5px solid rgba(255,255,255,.6);
  background: transparent; color: rgba(255,255,255,.9);
  font-size: var(--fs-sm); font-weight: 600; cursor: pointer;
  transition: all .2s; white-space: nowrap;
}
.ecl-action-hbtn:hover { background: rgba(255,255,255,.15); border-color: #fff; }
.ecl-add-btn {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 9px 18px; border-radius: 100px;
  border: 2px solid rgba(255,255,255,.85);
  background: transparent; color: #fff;
  font-size: var(--fs-base); font-weight: 700; cursor: pointer;
  transition: all .2s; white-space: nowrap;
}
.ecl-add-btn:hover { background: #fff; color: #ff3131; }

/* ── Search bar ── */
.ecl-searchbar {
  background: #fff; border-bottom: 1px solid #e5e7eb;
  position: sticky; top: 81px; z-index: 99; flex-shrink: 0;
}
.ecl--dark .ecl-searchbar { background: #1e293b; border-bottom-color: rgba(255,255,255,.08); }
.ecl-searchbar__inner { display: flex; align-items: center; gap: 10px; padding: 10px 28px; flex-wrap: wrap; }
.ecl-searchbar__icon { color: #9ca3af; flex-shrink: 0; }
.ecl-searchbar__input {
  flex: 1; min-width: 140px; border: none; outline: none;
  background: transparent; font-size: var(--fs-md); color: #111827;
}
.ecl--dark .ecl-searchbar__input { color: #e5e7eb; }
.ecl-searchbar__input::placeholder { color: #9ca3af; }
.ecl-searchbar__count { font-size: var(--fs-sm); color: #9ca3af; white-space: nowrap; display: flex; align-items: center; gap: 4px; }

/* ── Content ── */
.ecl-content { padding: 24px 28px; }

/* Error */
.ecl-error-bar {
  display: flex; align-items: center; gap: 8px;
  background: #fef2f2; border: 1px solid #fecaca; color: #991b1b;
  border-radius: 12px; padding: 12px 16px; font-size: var(--fs-base);
}

/* Table */
.ecl-table-wrap {
  background: #fff; border-radius: 16px;
  border: 1px solid #e5e7eb; overflow: hidden;
}
.ecl--dark .ecl-table-wrap { background: #1e293b; border-color: rgba(255,255,255,.08); }

.ecl-table :deep(.v-data-table__th),
.ecl-table :deep(.v-data-table__td) {
  font-size: var(--fs-base); padding-top: 10px; padding-bottom: 10px;
  padding-left: 16px; padding-right: 16px;
}
.ecl-table :deep(.v-data-table__td) { vertical-align: middle; }
.ecl-table :deep(.v-data-table__th) {
  font-size: var(--fs-xs)!important; font-weight: 600;
  text-transform: uppercase; letter-spacing: .06em;
  color: #9ca3af !important; background: #fafafa !important;
}
.ecl-table :deep(tbody tr:hover td) { background: #fafafa !important; }
.ecl--dark .ecl-table :deep(.v-data-table__th) { background: #1a2332 !important; }
.ecl--dark .ecl-table :deep(tbody tr:hover td) { background: #1a2332 !important; }
.ecl--dark .ecl-table :deep(.v-data-table__td) { color: #e2e8f0; }

.ecl-type-pill {
  display: inline-flex; align-items: center;
  background: #f3f4f6; color: #374151; border-radius: 50px;
  padding: 2px 10px; font-size: var(--fs-sm);
}
.ecl-yes-badge {
  display: inline-flex; background: #f0fdf4; color: #15803d;
  border: 1px solid #bbf7d0; border-radius: 50px; padding: 2px 10px; font-size: var(--fs-sm); font-weight: 600;
}
.ecl-no-badge {
  display: inline-flex; background: #f9fafb; color: #9ca3af;
  border: 1px solid #e5e7eb; border-radius: 50px; padding: 2px 10px; font-size: var(--fs-sm);
}
.ecl-actions { display: flex; gap: 4px; justify-content: flex-end; }
.ecl-abtn {
  width: 28px; height: 28px; border-radius: 8px;
  background: #f3f4f6; color: #6b7280;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: background .15s, color .15s; flex-shrink: 0;
}
.ecl-abtn--info { background: #f0f9ff; color: #0369a1; }
.ecl-abtn--info:hover { background: #e0f2fe; }
.ecl-abtn--edit { background: #eff6ff; color: #2563eb; }
.ecl-abtn--edit:hover { background: #dbeafe; }
.ecl-abtn--del { background: #fef2f2; color: #ff3131; }
.ecl-abtn--del:hover { background: #fee2e2; }

/* Delete drawer body */
.ecl-delete-error {
  display: flex; align-items: center; gap: 8px;
  background: #fef2f2; border: 1px solid #fecaca; color: #991b1b;
  border-radius: 10px; padding: 10px 14px; font-size: var(--fs-base); margin-bottom: 14px;
}
.ecl-delete-text { font-size: var(--fs-md); color: #374151; line-height: 1.6; margin: 0; }
.ecl--dark .ecl-delete-text { color: #d1d5db; }

.ecl-mbtn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 0 18px; height: 38px; border-radius: 50px;
  font-size: var(--fs-base); font-weight: 500; border: none; cursor: pointer; transition: all .2s;
}
.ecl-mbtn:disabled { opacity: .5; cursor: not-allowed; }
.ecl-mbtn--cancel { background: #f3f4f6; color: #374151; border: 1.5px solid #e5e7eb; }
.ecl-mbtn--cancel:hover { background: #e9ecef; }
.ecl-mbtn--danger { background: #ff3131; color: #fff; box-shadow: 0 4px 12px rgba(255, 49, 49,.3); }
.ecl-mbtn--danger:hover:not(:disabled) { box-shadow: 0 6px 20px rgba(255, 49, 49,.4); transform: translateY(-1px); }

/* Dark mode — compléments */
.ecl--dark .ecl-error-bar { background: rgba(255,49,49,.12); border-color: rgba(255,49,49,.35); color: #fca5a5; }
.ecl--dark .ecl-type-pill { background: #1f2937; color: #cbd5e1; }
.ecl--dark .ecl-yes-badge { background: rgba(34,197,94,.15); color: #86efac; border-color: rgba(34,197,94,.35); }
.ecl--dark .ecl-no-badge { background: #1f2937; color: #94a3b8; border-color: rgba(255,255,255,.12); }
.ecl--dark .ecl-abtn { background: #1f2937; color: #cbd5e1; }
.ecl--dark .ecl-abtn--info { background: rgba(37,99,235,.15); color: #93c5fd; }
.ecl--dark .ecl-abtn--edit { background: rgba(37,99,235,.15); color: #93c5fd; }
.ecl--dark .ecl-abtn--del { background: rgba(255,49,49,.14); color: #fca5a5; }
.ecl--dark .ecl-mbtn--cancel { background: #1f2937; color: #e2e8f0; border-color: rgba(255,255,255,.14); }
</style>
