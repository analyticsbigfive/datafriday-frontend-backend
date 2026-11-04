<template>
  <PillMultiSelect
    :model-value="modelValue"
    :items="seasonOptions"
    :placeholder="t('seasonFilterPlaceholder')"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <template #no-data>
      <div class="season-filter-state" role="status">
        <template v-if="loading">
          <v-progress-circular indeterminate size="14" width="2" />
          <span>{{ t('seasonFilterLoading') }}</span>
        </template>
        <template v-else-if="error">
          <span>{{ t('seasonFilterLoadError') }}</span>
          <button type="button" class="season-filter-state__retry" @click.stop="load(true)">
            {{ t('seasonFilterRetry') }}
          </button>
        </template>
        <span v-else>{{ t('seasonFilterEmpty') }}</span>
      </div>
    </template>
  </PillMultiSelect>
</template>

<script>
import { useI18n } from '@/i18n/useI18n'
import PillMultiSelect from '@/components/common/PillMultiSelect.vue'

// Filtre saison multi-choix réutilisable. v-model = tableau d'IDs de saisons ([] = aucun filtre).
// Charge le store `seasons` (cache 15 min) : l'écran hôte n'a rien à dispatcher.
export default {
  name: 'SeasonMultiFilter',
  components: { PillMultiSelect },
  props: {
    modelValue: { type: Array, default: () => [] },
  },
  emits: ['update:modelValue'],
  setup() {
    const { t } = useI18n()
    return { t }
  },
  data() {
    return { error: false }
  },
  computed: {
    loading() {
      return !!this.$store.getters['seasons/fetching']
    },
    seasonOptions() {
      return (this.$store.getters['seasons/seasons'] || [])
        .map((s) => ({ id: String(s?.id || s?._id || ''), name: String(s?.name || '').trim() }))
        .filter((s) => s.id && s.name)
    },
  },
  created() {
    this.load()
  },
  methods: {
    // Rejet capté : la liste reste vide mais le menu l'indique et propose « Réessayer ».
    async load(force = false) {
      this.error = false
      try {
        await this.$store.dispatch('seasons/fetchAll', force ? { force: true } : undefined)
      } catch (_) {
        this.error = true
      }
    },
  },
}
</script>

<style scoped>
.season-filter-state {
  display: flex; align-items: center; gap: 8px; padding: 10px 14px;
  font-size: var(--fs-base); font-weight: var(--fw-medium); color: #6b7280;
}
.season-filter-state__retry {
  border: 0; background: none; padding: 0; cursor: pointer;
  font: inherit; font-weight: var(--fw-semibold); color: #ff3131; text-decoration: underline;
}
</style>
