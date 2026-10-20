<template>
  <PillMultiSelect
    :model-value="modelValue"
    :items="seasonOptions"
    :placeholder="t('seasonFilterPlaceholder')"
    @update:model-value="$emit('update:modelValue', $event)"
  />
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
  computed: {
    seasonOptions() {
      return (this.$store.getters['seasons/seasons'] || [])
        .map((s) => ({ id: String(s?.id || s?._id || ''), name: String(s?.name || '').trim() }))
        .filter((s) => s.id && s.name)
    },
  },
  created() {
    this.$store.dispatch('seasons/fetchAll')
  },
}
</script>
