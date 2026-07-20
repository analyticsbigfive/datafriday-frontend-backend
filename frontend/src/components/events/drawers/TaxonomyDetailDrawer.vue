<template>
  <EventDrawerShell
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    :is-dark="isDark"
    width="480"
    :title="item?.name || ''"
    :subtitle="t(entityConfig.subtitle)"
  >
    <template #icon>
      <Tag v-if="entity === 'type'" :size="20" color="white" />
      <Shapes v-else-if="entity === 'category'" :size="20" color="white" />
      <Layers v-else :size="20" color="white" />
    </template>

    <div :class="{ 'etd--dark': isDark }">
      <div class="etd-status" :class="linkedEvents.length > 0 ? 'etd-status--active' : 'etd-status--inactive'">
        <Info :size="16" />
        {{ linkedEvents.length > 0 ? t('taxonomyDetailDrawerActive') : t('taxonomyDetailDrawerInactive') }}
      </div>

      <div v-if="entityConfig.parentLabel" class="etd-section">
        <div class="etd-section__label">{{ t(entityConfig.parentLabel) }}</div>
        <span class="etd-parent-pill">{{ parentName || '—' }}</span>
      </div>

      <div v-if="entityConfig.childLabel" class="etd-section">
        <div class="etd-section__label">{{ t(entityConfig.childLabel) }} ({{ children.length }})</div>
        <div v-if="children.length" class="etd-pills">
          <span v-for="(c, i) in children" :key="i" class="etd-pill">{{ c }}</span>
        </div>
        <div v-else class="etd-empty">{{ t(entityConfig.childEmptyLabel) }}</div>
      </div>

      <div class="etd-section">
        <div class="etd-section__label">{{ t('taxonomyDetailDrawerEventsLabel') }} ({{ linkedEvents.length }})</div>
        <div v-if="eventsLoading" class="etd-empty">{{ t('loading') }}</div>
        <div v-else-if="eventsError" class="etd-error"><AlertCircle :size="14" /> {{ eventsError }}</div>
        <div v-else-if="linkedEvents.length" class="etd-events">
          <!-- BUG-157 : ligne cliquable retirée — la navigation vers /events?editEventId=
               n'ouvrait pas la bonne fiche en usage réel, non fiable sans pouvoir la retester
               en navigateur. Liste informative uniquement (nom + date). -->
          <div v-for="ev in linkedEvents" :key="ev.id" class="etd-event-row">
            <div class="etd-event-row__main">
              <span class="etd-event-row__name">{{ ev.name }}</span>
              <span class="etd-event-row__date">{{ formatDate(ev.eventDate) }}</span>
            </div>
          </div>
        </div>
        <div v-else class="etd-empty">{{ t('taxonomyDetailDrawerNoEvents') }}</div>
      </div>
    </div>

    <template #footer>
      <button class="etd-fbtn" :class="{ 'etd-fbtn--dark': isDark }" @click="$emit('update:modelValue', false)">{{ t('close') }}</button>
    </template>
  </EventDrawerShell>
</template>

<script>
import { Info, Tag, Shapes, Layers, AlertCircle } from 'lucide-vue-next';
import { useI18n } from '@/i18n/useI18n';
import EventDrawerShell from './EventDrawerShell.vue';

// BUG-153 : tiroir de détail partagé par les 3 écrans taxonomie (Types/Categories/Subcategories) —
// même précédent que TaxonomyImportDrawer.vue (prop `entity`) plutôt que 3 implémentations
// indépendantes, qui ont déjà causé BUG-130/131/145 sur ce domaine par le passé.
export default {
  name: 'TaxonomyDetailDrawer',
  components: { Info, Tag, Shapes, Layers, AlertCircle, EventDrawerShell },

  setup() {
    const { t } = useI18n();
    return { t };
  },

  props: {
    modelValue: { type: Boolean, default: false },
    entity: { type: String, default: 'type' }, // 'type' | 'category' | 'subcategory'
    item: { type: Object, default: null },
    isDark: { type: Boolean, default: false },
  },

  emits: ['update:modelValue'],

  data() {
    return {
      eventsLoading: false,
      eventsError: '',
    };
  },

  computed: {
    // Valeurs = clés i18n (résolues via t() dans le template), pas du texte brut — cf. BUG-156.
    entityConfig() {
      const configs = {
        type: {
          subtitle: 'taxonomyDetailDrawerTypeSubtitle',
          childLabel: 'taxonomyDetailDrawerCategoriesLabel',
          childEmptyLabel: 'taxonomyDetailDrawerNoCategories',
          parentLabel: null,
        },
        category: {
          subtitle: 'taxonomyDetailDrawerCategorySubtitle',
          childLabel: 'taxonomyDetailDrawerSubcategoriesLabel',
          childEmptyLabel: 'taxonomyDetailDrawerNoSubcategories',
          parentLabel: 'taxonomyDetailDrawerEventTypeLabel',
        },
        subcategory: {
          subtitle: 'taxonomyDetailDrawerSubcategorySubtitle',
          childLabel: null,
          childEmptyLabel: '',
          parentLabel: 'taxonomyDetailDrawerCategoryLabel',
        },
      };
      return configs[this.entity] || configs.type;
    },

    children() {
      const key = this.entity === 'type' ? 'categories' : this.entity === 'category' ? 'subcategories' : null;
      if (!key) return [];
      const raw = Array.isArray(this.item?.[key]) ? this.item[key] : [];
      return raw.map((c) => (typeof c === 'string' ? c : c?.name)).filter(Boolean);
    },

    eventTypeNameById() {
      const map = {};
      const types = this.$store.getters['eventTypes/eventTypes'] || [];
      for (const t of types) {
        const id = t?.id || t?._id;
        if (id) map[String(id)] = t?.name || '';
      }
      return map;
    },
    categoryNameById() {
      const map = {};
      const cats = this.$store.getters['eventCategories/eventCategories'] || [];
      for (const c of cats) {
        const id = c?.id || c?._id;
        if (id) map[String(id)] = c?.name || '';
      }
      return map;
    },

    parentName() {
      if (this.entity === 'category') {
        const id = this.item?.eventTypeId || this.item?.eventType?.id || this.item?.eventType?._id;
        return this.item?.eventType?.name || this.eventTypeNameById[id] || '';
      }
      if (this.entity === 'subcategory') {
        const id = this.item?.eventCategoryId || this.item?.categoryId
          || this.item?.category?.id || this.item?.eventCategory?.id;
        return this.item?.category?.name || this.item?.eventCategory?.name || this.categoryNameById[id] || '';
      }
      return '';
    },

    linkedEvents() {
      const id = this.item?.id || this.item?._id;
      if (!id) return [];
      const field = this.entity === 'type' ? 'eventTypeId'
        : this.entity === 'category' ? 'eventCategoryId'
        : 'eventSubcategoryId';
      const events = this.$store.getters['events/events'] || [];
      return events
        .filter((e) => String(e?.[field]) === String(id))
        .slice()
        .sort((a, b) => new Date(b?.eventDate || 0) - new Date(a?.eventDate || 0));
    },
  },

  watch: {
    modelValue(isOpen) {
      if (isOpen) this.loadEvents();
    },
  },

  methods: {
    formatDate(value) {
      if (!value) return '';
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return String(value);
      return new Intl.DateTimeFormat('fr-FR', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
    },
    async loadEvents() {
      this.eventsLoading = true;
      this.eventsError = '';
      try {
        await this.$store.dispatch('events/fetchEvents');
      } catch (e) {
        this.eventsError = e?.userMessage || e?.message || this.t('taxonomyDetailDrawerLoadError');
      } finally {
        this.eventsLoading = false;
      }
    },
  },
};
</script>

<style scoped>
.etd-status {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 14px; border-radius: 12px;
  font-size: 13.5px; font-weight: 500; margin-bottom: 18px;
}
.etd-status--active { background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; }
.etd-status--inactive { background: #f9fafb; color: #6b7280; border: 1px solid #e5e7eb; }

.etd-section { margin-bottom: 18px; }
.etd-section__label {
  font-size: 12.5px; font-weight: 600; color: #6b7280;
  text-transform: uppercase; letter-spacing: .05em; margin-bottom: 8px;
}
.etd-pills { display: flex; flex-wrap: wrap; gap: 6px; }
.etd-pill {
  display: inline-flex; align-items: center;
  background: #f3f4f6; color: #374151; border-radius: 50px;
  padding: 3px 12px; font-size: 13px;
}
.etd-parent-pill {
  display: inline-flex; align-items: center;
  background: #eff6ff; color: #2563eb; border-radius: 50px;
  padding: 3px 12px; font-size: 13px; font-weight: 600;
}
.etd-empty { font-size: 13.5px; color: #9ca3af; }
.etd-error {
  display: flex; align-items: center; gap: 8px;
  background: #fef2f2; border: 1px solid #fecaca; color: #991b1b;
  border-radius: 10px; padding: 10px 14px; font-size: 13px;
}

.etd-events { display: flex; flex-direction: column; gap: 6px; max-height: 320px; overflow-y: auto; }
.etd-event-row {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  width: 100%; padding: 10px 12px; border-radius: 10px;
  border: 1px solid #e5e7eb; background: #fff; color: #6b7280;
}
.etd-event-row__main { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.etd-event-row__name {
  font-size: 13.5px; font-weight: 600; color: #111827;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.etd-event-row__date { font-size: 12px; color: #9ca3af; }

.etd-fbtn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 0 20px; height: 38px; border-radius: 50px;
  font-size: 13.5px; font-weight: 500; border: 1.5px solid #e5e7eb;
  background: #f3f4f6; color: #374151; cursor: pointer; transition: all .2s;
}
.etd-fbtn:hover { background: #e9ecef; }
.etd-fbtn--dark { background: #263548; border-color: #374151; color: #d1d5db; }
.etd-fbtn--dark:hover { background: #2f3f56; }

/* Dark mode (cf. BUG-148 : palette identique #111827 / rgba(255,255,255,.08) que le reste du domaine) */
.etd--dark .etd-status--inactive { background: #1a2332; border-color: rgba(255,255,255,.08); color: #9ca3af; }
.etd--dark .etd-section__label { color: #9ca3af; }
.etd--dark .etd-pill { background: #1a2332; color: #d1d5db; }
.etd--dark .etd-empty { color: #6b7280; }
.etd--dark .etd-event-row { background: #1a2332; border-color: rgba(255,255,255,.08); color: #9ca3af; }
.etd--dark .etd-event-row__name { color: #e5e7eb; }
</style>
