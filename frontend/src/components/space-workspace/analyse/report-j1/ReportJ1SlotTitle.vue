<template>
  <div class="rj1-title">
    <v-text-field
      v-if="editing"
      v-model="draft"
      autofocus
      density="compact"
      variant="outlined"
      hide-details
      maxlength="120"
      :disabled="saving"
      :label="t('rj1CustomTitle')"
      @click.stop
      @keydown.enter.prevent="commit"
      @keydown.esc.stop.prevent="cancel"
      @blur="commit"
    />
    <template v-else>
      <span class="rj1-title__text">{{ title }}</span>
      <button
        type="button"
        class="rj1-title__edit"
        :disabled="saving"
        :aria-label="t('rj1EditTitle')"
        :title="t('rj1EditTitle')"
        @click.stop="start"
      >
        <v-icon size="14">mdi-pencil-outline</v-icon>
      </button>
    </template>
  </div>
</template>

<script setup>
// Titre d'un élément placé, avec une icône crayon à droite pour saisir un titre personnalisé.
// `value` = titre enregistré (vide = titre par défaut). Entrée ou perte de focus valide,
// Échap annule ; un titre vidé revient au titre par défaut.
import { ref } from 'vue'
import { useI18n } from '@/i18n/useI18n'

const props = defineProps({
  title: { type: String, required: true },
  value: { type: String, default: '' },
  saving: { type: Boolean, default: false },
})
const emit = defineEmits(['rename'])

const { t } = useI18n()
const editing = ref(false)
const draft = ref('')

function start() {
  draft.value = props.value || props.title
  editing.value = true
}
function cancel() {
  editing.value = false
}
function commit() {
  if (!editing.value) return
  editing.value = false
  const next = draft.value.trim()
  // Texte inchangé par rapport au titre affiché : rien à enregistrer.
  if (next === props.title.trim()) return
  emit('rename', next)
}
</script>

<style scoped>
.rj1-title { display: flex; align-items: flex-start; gap: 4px; min-width: 0; }
.rj1-title__text {
  min-width: 0;
  font-size: var(--fs-sm, 0.75rem);
  font-weight: var(--fw-semibold, 600);
  line-height: 1.3;
  overflow-wrap: anywhere;
}
.rj1-title__edit {
  flex: none;
  display: inline-grid;
  place-items: center;
  padding: 2px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: rgba(var(--v-theme-on-surface), 0.6);
  cursor: pointer;
}
.rj1-title__edit:hover { color: rgb(var(--v-theme-primary)); background: rgba(var(--v-theme-primary), 0.1); }
.rj1-title__edit:disabled { opacity: 0.5; cursor: default; }
</style>
