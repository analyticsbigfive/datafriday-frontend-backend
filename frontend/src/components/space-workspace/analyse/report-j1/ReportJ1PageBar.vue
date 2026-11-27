<template>
  <div ref="root" class="rj1-pages" role="tablist" :aria-label="t('rj1PagesLabel')">
    <button
      v-for="i in total"
      :key="i"
      type="button"
      role="tab"
      class="rj1-pages__tab"
      :class="{ 'rj1-pages__tab--active': i - 1 === current }"
      :aria-selected="i - 1 === current"
      :tabindex="i - 1 === current ? 0 : -1"
      @click="emit('select', i - 1)"
      @keydown.left.prevent="move(-1)"
      @keydown.right.prevent="move(1)"
    >
      {{ t('rj1PageTab').replace('{n}', String(pageNumber(i - 1))) }}
    </button>

    <v-tooltip v-if="canAdd" location="top">
      <template #activator="{ props: tipProps }">
        <button
          v-bind="tipProps"
          type="button"
          class="rj1-pages__add"
          :disabled="saving"
          :aria-label="t('rj1AddPage')"
          @click="emit('add')"
        >
          <v-icon size="16">mdi-plus</v-icon>
        </button>
      </template>
      {{ t('rj1AddPage') }}
    </v-tooltip>

    <v-spacer />

    <!-- Suppression de la page affichée : deux temps si elle contient des éléments. -->
    <template v-if="confirming">
      <button type="button" class="rj1-pages__confirm" :disabled="saving" @click="onConfirm">
        {{ t('rj1ConfirmRemovePage') }}
      </button>
      <button type="button" class="rj1-pages__cancel" @click="confirming = false">{{ t('anCmpClose') }}</button>
    </template>
    <v-tooltip v-else location="top">
      <template #activator="{ props: tipProps }">
        <button
          v-bind="tipProps"
          type="button"
          class="rj1-pages__remove"
          :disabled="saving"
          :aria-label="t('rj1RemovePage')"
          @click="onRemove"
        >
          <v-icon size="16">mdi-delete-outline</v-icon>
        </button>
      </template>
      {{ t('rj1RemovePage') }}
    </v-tooltip>
  </div>
</template>

<script setup>
// Barre de sélection des pages de sélection du rapport J+1 : un onglet par page (numéros du
// rapport), « + » pour en ajouter (jusqu'à 3 en plus), corbeille pour supprimer la page affichée.
// Aucun état métier : tout vient des props, les actions sortent en événements.
import { ref, watch, nextTick } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import { pageNumber } from '@/utils/reportJ1Pages'

const props = defineProps({
  total: { type: Number, required: true },
  current: { type: Number, required: true },
  canAdd: { type: Boolean, default: true },
  // Nombre d'éléments de la page affichée : > 0 demande une confirmation avant suppression.
  currentCount: { type: Number, default: 0 },
  saving: { type: Boolean, default: false },
})
const emit = defineEmits(['select', 'add', 'remove'])

const { t } = useI18n()
const confirming = ref(false)
const root = ref(null)

watch(() => props.current, () => { confirming.value = false })

// Flèches gauche / droite : page précédente / suivante (motif tablist).
function move(step) {
  const next = props.current + step
  if (next < 0 || next >= props.total) return
  emit('select', next)
  nextTick(() => root.value?.querySelectorAll('[role="tab"]')[next]?.focus())
}
function onRemove() {
  if (props.currentCount > 0) confirming.value = true
  else emit('remove', props.current)
}
function onConfirm() {
  confirming.value = false
  emit('remove', props.current)
}
</script>

<style scoped>
.rj1-pages { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.rj1-pages__tab,
.rj1-pages__add,
.rj1-pages__remove,
.rj1-pages__confirm,
.rj1-pages__cancel {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 28px;
  padding: 2px 10px;
  border-radius: 6px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.25);
  background: transparent;
  color: rgba(var(--v-theme-on-surface), 0.75);
  font-family: inherit;
  font-size: var(--fs-sm, 0.75rem);
  font-weight: var(--fw-medium, 500);
  cursor: pointer;
}
.rj1-pages__tab--active {
  border: 2px solid rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.12);
  color: rgb(var(--v-theme-primary));
  font-weight: var(--fw-semibold, 600);
}
.rj1-pages__add { padding: 2px 6px; }
.rj1-pages__remove { padding: 2px 6px; border-color: transparent; color: rgb(var(--v-theme-error)); }
.rj1-pages__confirm { border-color: rgb(var(--v-theme-error)); color: rgb(var(--v-theme-error)); }
.rj1-pages__tab:hover,
.rj1-pages__add:hover { border-color: rgb(var(--v-theme-primary)); }
.rj1-pages button:disabled { opacity: 0.5; cursor: default; }
</style>
