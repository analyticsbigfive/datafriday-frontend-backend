<template>
  <div class="etl-root" :class="{'etl--dark': isDark}">

    <!-- ── Header ── -->
    <div class="etl-header sticky-header">
      <div class="etl-header__inner">
        <div class="etl-header__left">
          <div class="etl-header__icon">
            <Tag :size="22" color="white" />
          </div>
          <div>
            <h1 class="etl-header__title">{{ t('eventTypeList.title') }}</h1>
            <p class="etl-header__subtitle">{{ t('eventTypeList.subtitle') }}</p>
          </div>
        </div>
        <div class="etl-header__right">
          <div class="etl-header__sep"></div>
          <div class="etl-header__actions">
            <button class="etl-action-hbtn" @click="exportToCSV">
              <Download :size="15" /> {{ t('eventTypeList.exportCsv') }}
            </button>
            <button class="etl-action-hbtn" @click="taxonomyImportDrawer = true">
              <Upload :size="15" /> {{ t('eventTypeList.importCsv') }}
            </button>
            <button class="etl-add-btn" @click="openCreateDialog">
              <Plus :size="17" /> {{ t('eventTypeList.newType') }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Search bar ── -->
    <div class="etl-searchbar sticky-search">
      <div class="etl-searchbar__inner">
        <Search :size="17" class="etl-searchbar__icon" />
        <input v-model="search" class="etl-searchbar__input" type="search" :placeholder="t('eventTypeList.searchPlaceholder')" />
        <span class="etl-searchbar__count">
          <Tag :size="13" />
          {{ eventTypes.length }} type{{ eventTypes.length !== 1 ? 's' : '' }}
        </span>
      </div>
    </div>

    <!-- ── Content ── -->
    <div class="etl-content">

      <!-- Error -->
      <div v-if="error" class="etl-error-bar mb-4">
        <AlertCircle :size="14" /> {{ error }}
      </div>

      <!-- Table card -->
      <div class="etl-table-wrap">
        <v-data-table
          v-model:search="search"
          :filter-keys="['name']"
          :headers="tableHeaders"
          :items="eventTypes"
          :loading="loading"
          :items-per-page="25"
          :items-per-page-options="[10, 25, 50, 100]"
          density="compact"
          class="etl-table"
        >
          <template #item.categories="{ item }">
            <span class="etl-cat-badge">{{ Array.isArray(item.categories) ? item.categories.length : 0 }}</span>
          </template>
          <template #item.createdAt="{ item }">
            {{ formatDate(item.createdAt) }}
          </template>
          <template #item.updatedAt="{ item }">
            {{ formatDate(item.updatedAt) }}
          </template>
          <template #item.actions="{ item }">
            <div class="etl-actions">
              <div class="etl-abtn etl-abtn--info" @click.stop="openDetailsDialog(item)">
                <Eye :size="15" />
              </div>
              <div class="etl-abtn etl-abtn--edit" @click.stop="openEditDialog(item)">
                <Pencil :size="15" />
              </div>
              <div class="etl-abtn etl-abtn--del" @click.stop="openDeleteDialog(item)">
                <Trash2 :size="15" />
              </div>
            </div>
          </template>
        </v-data-table>
      </div>
    </div>

    <!-- Details dialog -->
    <v-dialog v-model="detailsDialog" max-width="560">
      <div class="etl-modal">
        <div class="etl-modal__head">
          <div class="etl-modal__icon-wrap"><Eye :size="18" color="#2563eb" /></div>
          <div class="etl-modal__headtext">
            <div class="etl-modal__title">{{ detailsType?.name || '' }}</div>
            <div class="etl-modal__sub">Détails du type d'événement</div>
          </div>
          <button class="etl-modal__close" @click="closeDetailsDialog"><X :size="16" /></button>
        </div>
        <div class="etl-modal__body">
          <div v-if="detailsError" class="etl-modal__error"><AlertCircle :size="14" /> {{ detailsError }}</div>

          <div class="etl-detail-status" :class="detailsEventsCount > 0 ? 'etl-detail-status--active' : 'etl-detail-status--inactive'">
            <Info :size="16" />
            {{ detailsEventsCount > 0 ? 'Ce type est utilisé activement' : 'Ce type n\'est pas encore utilisé' }}
          </div>

          <div class="etl-detail-section">
            <div class="etl-detail-section__label">Catégories ({{ detailsCategories.length }})</div>
            <div v-if="detailsCategories.length" class="etl-detail-cats">
              <span v-for="(c, idx) in detailsCategories" :key="idx" class="etl-detail-cat-pill">{{ c }}</span>
            </div>
            <div v-else class="etl-detail-empty">Aucune catégorie</div>
          </div>

          <div class="etl-detail-section">
            <div class="etl-detail-section__label">Événements</div>
            <div class="etl-detail-val">
              <template v-if="detailsLoading">Chargement…</template>
              <template v-else>{{ detailsEventsCount }} événement{{ detailsEventsCount !== 1 ? 's' : '' }}</template>
            </div>
          </div>
        </div>
        <div class="etl-modal__foot">
          <button class="etl-mbtn etl-mbtn--cancel" @click="closeDetailsDialog">Fermer</button>
        </div>
      </div>
    </v-dialog>

    <!-- Delete dialog -->
    <v-dialog v-model="deleteDialog" max-width="440" :persistent="deleteLoading">
      <div class="etl-modal">
        <div class="etl-modal__head">
          <div class="etl-modal__icon-wrap etl-modal__icon-wrap--danger"><Trash2 :size="18" color="#ff3131" /></div>
          <div class="etl-modal__headtext">
            <div class="etl-modal__title">{{ t('eventTypeList.deleteTitle') }}</div>
            <div class="etl-modal__sub">{{ t('eventTypeList.deleteSubtitle') }}</div>
          </div>
          <button class="etl-modal__close" @click="closeDeleteDialog"><X :size="16" /></button>
        </div>
        <div class="etl-modal__body">
          <div v-if="deleteError" class="etl-modal__error"><AlertCircle :size="14" /> {{ deleteError }}</div>
          <p class="etl-modal__text">
            {{ t('eventTypeList.deleteText') }} <strong>{{ deleteTypeName }}</strong> ?
          </p>
        </div>
        <div class="etl-modal__foot">
          <button class="etl-mbtn etl-mbtn--cancel" @click="closeDeleteDialog">{{ t('eventTypeList.deleteCancel') }}</button>
          <button class="etl-mbtn etl-mbtn--danger" :disabled="deleteLoading" @click="confirmDelete">
            <Trash2 :size="14" />
            {{ deleteLoading ? t('eventTypeList.deleteConfirming') : t('eventTypeList.deleteConfirm') }}
          </button>
        </div>
      </div>
    </v-dialog>

    <!-- Create/Edit drawer -->
    <v-navigation-drawer v-model="typeDialog" location="right" temporary :persistent="typeLoading" width="480" class="etl-type-drawer">
      <template #default>
        <!-- Gradient header -->
        <div class="etl-drawer-header">
          <div class="etl-drawer-header__icon">
            <Tag :size="20" color="white" />
          </div>
          <div class="etl-drawer-header__text">
            <div class="etl-drawer-header__title">{{ typeMode === 'edit' ? t('eventTypeList.drawerEditTitle') : t('eventTypeList.drawerCreateTitle') }}</div>
            <div class="etl-drawer-header__sub">{{ typeMode === 'edit' ? t('eventTypeList.drawerEditSubtitle') : t('eventTypeList.drawerCreateSubtitle') }}</div>
          </div>
          <button class="etl-drawer-header__close" @click="closeTypeDialog"><X :size="18" /></button>
        </div>

        <!-- Body -->
        <div class="etl-drawer-body">
          <div v-if="typeError" class="etl-drawer-error">
            <AlertCircle :size="14" /> {{ typeError }}
          </div>
          <v-form ref="typeForm" v-model="typeFormValid" validate-on="submit">
            <v-text-field
              v-model="typeFormData.name"
              :label="t('eventTypeList.labelName')"
              :placeholder="t('eventTypeList.namePlaceholder')"
              density="comfortable"
              variant="outlined"
              hide-details="auto"
              :rules="[rules.required]"
              class="etl-type-input"
            />
          </v-form>
        </div>

        <!-- Footer -->
        <div class="etl-drawer-footer">
          <button class="etl-fbtn etl-fbtn--cancel" @click="closeTypeDialog">{{ t('eventTypeList.cancel') }}</button>
          <button class="etl-fbtn etl-fbtn--primary" :disabled="typeLoading" @click="submitType">
            <Save :size="14" />
            {{ typeLoading ? 'Enregistrement…' : t('eventTypeList.save') }}
          </button>
        </div>
      </template>
    </v-navigation-drawer>

    <TaxonomyImportDrawer
      v-model="taxonomyImportDrawer"
      entity="type"
      :is-dark="isDark"
      @imported="loadEventTypes"
    />
  </div>
</template>

<script>
import { computed } from "vue";
import { useTheme } from "vuetify";
import { useI18n } from "@/i18n/useI18n";
import { Upload, Download, Eye, Info, Pencil, Plus, Save, Trash2, X, Search, Tag, AlertCircle } from "lucide-vue-next";
import { downloadCSV } from "@/utils/csv";
import {
  createEventType,
  deleteEventType,
  updateEventType,
} from "@/api/endpoints/event.api";
import TaxonomyImportDrawer from '../drawers/TaxonomyImportDrawer.vue';

export default {
  name: "EventsTypeListView",
  components: {
    Upload,
    Download,
    Eye,
    Info,
    Pencil,
    Plus,
    Save,
    Trash2,
    X,
    Search,
    Tag,
    AlertCircle,
    TaxonomyImportDrawer,
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

      detailsDialog: false,
      detailsLoading: false,
      detailsError: "",
      detailsType: null,
      detailsEventsCount: 0,
      detailsCategories: [],

      deleteDialog: false,
      deleteLoading: false,
      deleteError: "",
      deleteTypeId: null,
      deleteTypeName: "",

      typeDialog: false,
      typeMode: "create",
      typeLoading: false,
      typeError: "",
      typeFormValid: false,
      typeId: null,
      typeFormData: {
        name: "",
      },

      rules: {
        required: (v) => (!!String(v || "").trim() ? true : "Required"),
      },
    };
  },

  methods: {
    normalizeCategoryLabel(value) {
      if (!value) return "";
      if (typeof value === 'string') return value;
      if (typeof value === 'object') return value.name || value.label || value.id || value._id || "";
      return String(value);
    },
    formatDate(value) {
      if (!value) return "";
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return String(value);
      return new Intl.DateTimeFormat("fr-FR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(d);
    },
    async loadEventTypes() {
      this.loading = true;
      this.error = "";
      try {
        await this.$store.dispatch('eventTypes/fetchEventTypes')
      } catch (e) {
        this.error = e?.userMessage || e?.message || "Impossible de charger les types d'évènements";
      } finally {
        this.loading = false;
      }
    },

    async openDetailsDialog(type) {
      this.detailsType = type;
      this.detailsDialog = true;
      this.detailsError = "";
      this.detailsLoading = true;
      this.detailsEventsCount = 0;

      const categories = Array.isArray(type?.categories) ? type.categories : [];
      this.detailsCategories = categories.map(this.normalizeCategoryLabel).filter(Boolean);

      try {
        await this.$store.dispatch('events/fetchEvents')
        const events = this.$store.getters['events/events']
        const typeId = type?.id || type?._id || null;
        this.detailsEventsCount = events.filter((e) => String(e?.eventTypeId) === String(typeId)).length;
      } catch (e) {
        this.detailsError = e?.response?.data?.message || e?.message || "Failed to load usage details";
      } finally {
        this.detailsLoading = false;
      }
    },
    closeDetailsDialog() {
      this.detailsDialog = false;
      this.detailsLoading = false;
      this.detailsError = "";
      this.detailsType = null;
      this.detailsEventsCount = 0;
      this.detailsCategories = [];
    },

    openDeleteDialog(type) {
      this.deleteTypeId = type?.id || type?._id || null;
      this.deleteTypeName = type?.name || "this event type";
      this.deleteError = "";
      this.deleteLoading = false;
      this.deleteDialog = true;
    },
    closeDeleteDialog() {
      this.deleteDialog = false;
      this.deleteLoading = false;
      this.deleteError = "";
      this.deleteTypeId = null;
      this.deleteTypeName = "";
    },
    async confirmDelete() {
      if (!this.deleteTypeId) {
        this.deleteError = "Missing event type id";
        return;
      }

      this.deleteLoading = true;
      this.deleteError = "";

      try {
        await deleteEventType(this.deleteTypeId);
        await this.$store.dispatch('eventTypes/removeEventType', this.deleteTypeId);
        this.closeDeleteDialog();
      } catch (e) {
        this.deleteError = e?.response?.data?.message || e?.message || "Failed to delete event type";
      } finally {
        this.deleteLoading = false;
      }
    },

    openCreateDialog() {
      this.typeMode = "create";
      this.typeId = null;
      this.typeError = "";
      this.typeFormValid = false;
      this.typeFormData = {
        name: "",
      };
      this.typeDialog = true;
    },
    openEditDialog(type) {
      this.typeMode = "edit";
      this.typeId = type?.id || type?._id || null;
      this.typeError = "";
      this.typeFormValid = false;
      this.typeFormData = {
        name: type?.name || "",
      };
      this.typeDialog = true;
    },
    closeTypeDialog() {
      this.typeDialog = false;
      this.typeLoading = false;
      this.typeError = "";
      this.typeFormValid = false;
      this.typeId = null;
    },
    async submitType() {
      const form = this.$refs?.typeForm;
      if (form && typeof form.validate === "function") {
        const result = await form.validate();
        const valid = typeof result === "boolean" ? result : !!result?.valid;
        if (!valid) return;
      }

      this.typeLoading = true;
      this.typeError = "";

      try {
        const payload = {
          name: this.typeFormData.name,
        };

        if (this.typeMode === "edit") {
          if (!this.typeId) throw new Error("Missing event type id");
          await updateEventType(this.typeId, payload);
          await this.$store.dispatch('eventTypes/updateEventType', { id: this.typeId, ...payload });
        } else {
          const response = await createEventType(payload);
          const created = response?.data || response;
          await this.$store.dispatch('eventTypes/addEventType', created);
        }

        this.closeTypeDialog();
      } catch (e) {
        this.typeError = e?.response?.data?.message || e?.message || "Impossible d'enregistrer le type d'évènement";
      } finally {
        this.typeLoading = false;
      }
    },

    exportToCSV() {
      const rows = [
        ['Name', 'Number of Categories', 'Created At', 'Updated At'],
        ...(this.eventTypes || []).map(t => [
          t?.name || '',
          Array.isArray(t?.categories) ? t.categories.length : 0,
          t?.createdAt || '',
          t?.updatedAt || '',
        ]),
      ];
      downloadCSV(rows, 'event-types');
    },
  },

  computed: {
    eventTypes() {
      return this.$store.getters['eventTypes/eventTypes']
    },
    tableHeaders() {
      return [
        { title: this.t('eventTypeList.colName'), key: 'name' },
        { title: this.t('eventTypeList.colCategories'), key: 'categories' },
        { title: this.t('eventTypeList.colCreatedAt'), key: 'createdAt' },
        { title: this.t('eventTypeList.colUpdatedAt'), key: 'updatedAt' },
        { title: this.t('eventTypeList.colActions'), key: 'actions', sortable: false, align: 'end' },
      ];
    },
  },

  mounted() {
    this.loadEventTypes();
  },
};
</script>

<style scoped>
.etl-root { width: 100%; min-height: 100%; background: #f5f5f5; }
.etl--dark.etl-root { background: #111827; }

/* ── Header ── */
.etl-header {
  background: #ff3131;
  box-shadow: 0 4px 20px rgba(255, 49, 49,.25);
}
.sticky-header { position: sticky; top: 0; z-index: 100; flex-shrink: 0; }
.etl-header__inner {
  display: flex; align-items: center; justify-content: space-between;
  padding: 18px 28px; gap: 16px; flex-wrap: wrap;
}
.etl-header__left { display: flex; align-items: center; gap: 14px; }
.etl-header__icon {
  width: 44px; height: 44px; border-radius: 12px;
  background: rgba(255,255,255,.2);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.etl-header__title { font-size: 20px; font-weight: 800; color: #fff; margin: 0; line-height: 1.2; }
.etl-header__subtitle { font-size: 12.5px; color: rgba(255,255,255,.72); margin: 3px 0 0; }
.etl-header__right { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
.etl-header__sep { width: 1px; height: 32px; background: rgba(255,255,255,.25); }
.etl-header__actions { display: flex; align-items: center; gap: 8px; }
.etl-action-hbtn {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 7px 14px; border-radius: 100px;
  border: 1.5px solid rgba(255,255,255,.6);
  background: transparent; color: rgba(255,255,255,.9);
  font-size: 12.5px; font-weight: 600; cursor: pointer;
  transition: all .2s; white-space: nowrap;
}
.etl-action-hbtn:hover { background: rgba(255,255,255,.15); border-color: #fff; }
.etl-add-btn {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 9px 18px; border-radius: 100px;
  border: 2px solid rgba(255,255,255,.85);
  background: transparent; color: #fff;
  font-size: 13px; font-weight: 700; cursor: pointer;
  transition: all .2s; white-space: nowrap;
}
.etl-add-btn:hover { background: #fff; color: #ff3131; }

/* ── Search bar ── */
.etl-searchbar {
  background: #fff; border-bottom: 1px solid #e5e7eb;
  position: sticky; top: 81px; z-index: 99; flex-shrink: 0;
}
.etl--dark .etl-searchbar { background: #1e293b; border-bottom-color: rgba(255,255,255,.08); }
.etl-searchbar__inner { display: flex; align-items: center; gap: 10px; padding: 10px 28px; flex-wrap: wrap; }
.etl-searchbar__icon { color: #9ca3af; flex-shrink: 0; }
.etl-searchbar__input {
  flex: 1; min-width: 140px; border: none; outline: none;
  background: transparent; font-size: 14px; color: #111827;
}
.etl--dark .etl-searchbar__input { color: #e5e7eb; }
.etl-searchbar__input::placeholder { color: #9ca3af; }
.etl-searchbar__count { font-size: 12px; color: #9ca3af; white-space: nowrap; display: flex; align-items: center; gap: 4px; }

/* ── Content ── */
.etl-content { padding: 24px 28px; }

/* Error */
.etl-error-bar {
  display: flex; align-items: center; gap: 8px;
  background: #fef2f2; border: 1px solid #fecaca; color: #991b1b;
  border-radius: 12px; padding: 12px 16px; font-size: 13.5px;
}

/* Table card */
.etl-table-wrap {
  background: #fff; border-radius: 16px;
  border: 1px solid #e5e7eb; overflow: hidden;
}
.etl--dark .etl-table-wrap { background: #1e293b; border-color: rgba(255,255,255,.08); }

.etl-table :deep(.v-data-table__th),
.etl-table :deep(.v-data-table__td) {
  font-size: 13px; padding-top: 10px; padding-bottom: 10px;
  padding-left: 16px; padding-right: 16px;
}
.etl-table :deep(.v-data-table__td) { vertical-align: middle; }
.etl-table :deep(.v-data-table__th) {
  font-size: 11px !important; font-weight: 600;
  text-transform: uppercase; letter-spacing: .06em;
  color: #9ca3af !important; background: #fafafa !important;
}
.etl-table :deep(tbody tr:hover td) { background: #fafafa !important; }
.etl--dark .etl-table :deep(.v-data-table__th) { background: #1a2332 !important; }
.etl--dark .etl-table :deep(tbody tr:hover td) { background: #1a2332 !important; }

.etl-cat-badge {
  display: inline-flex; align-items: center; justify-content: center;
  background: #f0f9ff; color: #0369a1; font-size: 12px; font-weight: 600;
  border-radius: 50px; padding: 2px 10px; border: 1px solid #bae6fd;
}

.etl-actions { display: flex; gap: 4px; justify-content: flex-end; }
.etl-abtn {
  width: 28px; height: 28px; border-radius: 8px;
  background: #f3f4f6; color: #6b7280;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: background .15s, color .15s; flex-shrink: 0;
}
.etl-abtn--info { background: #f0f9ff; color: #0369a1; }
.etl-abtn--info:hover { background: #e0f2fe; }
.etl-abtn--edit { background: #eff6ff; color: #2563eb; }
.etl-abtn--edit:hover { background: #dbeafe; }
.etl-abtn--del { background: #fef2f2; color: #ff3131; }
.etl-abtn--del:hover { background: #fee2e2; }

/* Modals (dialogs) */
.etl-modal {
  background: #fff; border-radius: 20px; overflow: hidden;
  box-shadow: 0 20px 60px rgba(0,0,0,.15);
}
.etl-modal__head {
  display: flex; align-items: flex-start; gap: 14px;
  padding: 22px 22px 16px;
}
.etl-modal__icon-wrap {
  width: 42px; height: 42px; border-radius: 12px;
  background: #eff6ff;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.etl-modal__icon-wrap--danger { background: #fef2f2; }
.etl-modal__headtext { flex: 1; }
.etl-modal__title { font-size: 16px; font-weight: 700; color: #111827; }
.etl-modal__sub { font-size: 13px; color: #6b7280; margin-top: 2px; }
.etl-modal__close {
  width: 28px; height: 28px; border-radius: 8px; border: none;
  background: #f3f4f6; display: flex; align-items: center; justify-content: center;
  cursor: pointer; color: #6b7280; flex-shrink: 0;
}
.etl-modal__close:hover { background: #e5e7eb; }
.etl-modal__body { padding: 0 22px 18px; }
.etl-modal__error {
  display: flex; align-items: center; gap: 8px;
  background: #fef2f2; border: 1px solid #fecaca; color: #991b1b;
  border-radius: 10px; padding: 10px 14px; font-size: 13px; margin-bottom: 14px;
}
.etl-modal__text { font-size: 14px; color: #374151; line-height: 1.6; margin: 0; }
.etl-modal__foot {
  display: flex; justify-content: flex-end; gap: 10px;
  padding: 14px 22px; background: #f9fafb; border-top: 1px solid #f3f4f6;
}
.etl-mbtn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 0 18px; height: 38px; border-radius: 50px;
  font-size: 13.5px; font-weight: 500; border: none; cursor: pointer; transition: all .2s;
}
.etl-mbtn:disabled { opacity: .5; cursor: not-allowed; }
.etl-mbtn--cancel { background: #f3f4f6; color: #374151; border: 1.5px solid #e5e7eb; }
.etl-mbtn--cancel:hover { background: #e9ecef; }
.etl-mbtn--danger { background: #ff3131; color: #fff; box-shadow: 0 4px 12px rgba(255, 49, 49,.3); }
.etl-mbtn--danger:hover:not(:disabled) { box-shadow: 0 6px 20px rgba(255, 49, 49,.4); transform: translateY(-1px); }

/* Detail sections */
.etl-detail-status {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 14px; border-radius: 12px;
  font-size: 13.5px; font-weight: 500; margin-bottom: 18px;
}
.etl-detail-status--active { background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; }
.etl-detail-status--inactive { background: #f9fafb; color: #6b7280; border: 1px solid #e5e7eb; }
.etl-detail-section { margin-bottom: 16px; }
.etl-detail-section__label { font-size: 12.5px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: .05em; margin-bottom: 8px; }
.etl-detail-cats { display: flex; flex-wrap: wrap; gap: 6px; }
.etl-detail-cat-pill {
  display: inline-flex; align-items: center;
  background: #f3f4f6; color: #374151; border-radius: 50px;
  padding: 3px 12px; font-size: 13px;
}
.etl-detail-empty { font-size: 13.5px; color: #9ca3af; }
.etl-detail-val { font-size: 15px; font-weight: 600; color: #111827; }

/* Drawer */
.etl-type-drawer :deep(.v-navigation-drawer__content) {
  display: flex; flex-direction: column;
}
.etl-drawer-header {
  display: flex; align-items: center; gap: 14px;
  padding: 20px 20px 18px;
  background: #ff3131;
  flex-shrink: 0;
}
.etl-drawer-header__icon {
  width: 42px; height: 42px; border-radius: 12px;
  background: rgba(255,255,255,.18);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.etl-drawer-header__text { flex: 1; }
.etl-drawer-header__title { font-size: 16px; font-weight: 700; color: #fff; }
.etl-drawer-header__sub { font-size: 12.5px; color: rgba(255,255,255,.75); margin-top: 2px; }
.etl-drawer-header__close {
  width: 30px; height: 30px; border-radius: 8px; border: none;
  background: rgba(255,255,255,.15);
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; color: rgba(255,255,255,.85); flex-shrink: 0; transition: background .2s;
}
.etl-drawer-header__close:hover { background: rgba(255,255,255,.25); }

.etl-drawer-body {
  flex: 1; overflow-y: auto; padding: 24px 20px; background: #f9fafb;
}
.etl-drawer-error {
  display: flex; align-items: center; gap: 8px;
  background: #fef2f2; border: 1px solid #fecaca; color: #991b1b;
  border-radius: 10px; padding: 10px 14px; font-size: 13px; margin-bottom: 16px;
}

/* Styled v-text-field */
.etl-type-input :deep(.v-field) {
  border: 1.5px solid #e5e7eb;
  border-radius: 11px;
  box-shadow: none;
}
.etl-type-input :deep(.v-field--focused) {
  border-color: #ff3131;
  box-shadow: 0 0 0 3px rgba(255, 49, 49,.10);
}
.etl-type-input :deep(.v-field__outline) { display: none; }
.etl-type-input :deep(.v-label.v-field-label--floating) { color: #ff3131; font-size: 11px; }
.etl--dark .etl-type-input :deep(.v-field) { background: #1f2937; border-color: #4b5563; }

.etl-drawer-footer {
  display: flex; justify-content: flex-end; gap: 10px;
  padding: 16px 20px; background: #fff; border-top: 1px solid #e5e7eb; flex-shrink: 0;
}
.etl--dark .etl-drawer-footer { background: #1f2937; border-color: #374151; }
.etl-fbtn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 0 20px; height: 40px; border-radius: 50px;
  font-size: 13.5px; font-weight: 500; border: none; cursor: pointer; transition: all .2s;
}
.etl-fbtn:disabled { opacity: .5; cursor: not-allowed; }
.etl-fbtn--cancel { background: #f3f4f6; color: #374151; border: 1.5px solid #e5e7eb; }
.etl-fbtn--cancel:hover { background: #e9ecef; }
.etl-fbtn--primary { background: #ff3131; color: #fff; box-shadow: 0 4px 12px rgba(255, 49, 49,.3); }
.etl-fbtn--primary:hover:not(:disabled) { box-shadow: 0 6px 20px rgba(255, 49, 49,.4); transform: translateY(-1px); }
</style>
