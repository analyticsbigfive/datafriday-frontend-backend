<template>
  <!-- Choix d'un ou plusieurs matchs (maquettes Bertrand du 2026-10-09). La sélection
       est appliquée à la fermeture du menu : cocher plusieurs matchs ne relance qu'un
       seul chargement. -->
  <v-menu v-model="open" location="bottom start" offset="6" :close-on-content-click="false">
    <template #activator="{ props: menuProps }">
      <button type="button" class="les-trigger" v-bind="menuProps" :aria-label="t('logiEventSelectLabel')">
        <CalendarDays :size="14" />
        <span class="les-trigger-label">{{ label }}</span>
        <span class="les-trigger-chevron"><ChevronDown :size="12" /></span>
      </button>
    </template>

    <div class="les-menu">
      <div class="les-menu-kicker">{{ t('logiEventSelectKicker') }}</div>
      <div v-if="!events.length" class="les-menu-empty">{{ t('logiEventSelectEmpty') }}</div>
      <button
        v-for="ev in events"
        :key="ev.id"
        type="button"
        class="les-menu-item"
        :class="{ 'les-menu-item--active': isChecked(ev.id) }"
        :aria-pressed="isChecked(ev.id)"
        @click="toggle(ev.id)"
      >
        <span class="les-menu-check" :class="{ 'les-menu-check--on': isChecked(ev.id) }">
          <Check v-if="isChecked(ev.id)" :size="13" />
        </span>
        <span class="les-menu-label">
          <span class="les-menu-name">{{ ev.label }}</span>
          <span class="les-menu-meta">{{ formatDate(ev.eventDate) }}</span>
        </span>
      </button>
    </div>
  </v-menu>
</template>

<script setup>
import { ref, watch } from 'vue'
import { CalendarDays, ChevronDown, Check } from 'lucide-vue-next'
import { useI18n } from '@/i18n/useI18n'

const { t, locale } = useI18n()

const props = defineProps({
  /** Matchs proposés `{ id, label, eventDate }`, ordre chronologique. */
  events: { type: Array, default: () => [] },
  /** Ids choisis. */
  modelValue: { type: Array, default: () => [] },
  /** Libellé du bouton (« Nantes vs Reims » ou « 3 événements »). */
  label: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue'])

const open = ref(false)
const draft = ref([])

watch(open, (isOpen) => {
  if (isOpen) {
    draft.value = [...props.modelValue].map(String)
    return
  }
  // Au moins un match : une sélection vide garde la précédente.
  const next = draft.value
  const same = next.length === props.modelValue.length && next.every((id) => props.modelValue.map(String).includes(id))
  if (next.length && !same) emit('update:modelValue', next)
})

function isChecked(id) {
  return draft.value.includes(String(id))
}
function toggle(id) {
  const key = String(id)
  draft.value = isChecked(key) ? draft.value.filter((v) => v !== key) : [...draft.value, key]
}
function formatDate(d) {
  if (!d) return ''
  const date = new Date(d)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(locale.value === 'en' ? 'en-GB' : 'fr-FR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
}
</script>

<style scoped>
/* Même pilule que LogisticConfigSelect (puce de configuration du bandeau). */
.les-trigger {
  margin-top: 5px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: rgba(255, 255, 255, .16);
  border: 1.5px solid rgba(255, 255, 255, .55);
  border-radius: 100px;
  padding: 5px 8px 5px 12px;
  color: #fff;
  font-size: var(--fs-sm);
  font-weight: var(--fw-bold);
  cursor: pointer;
  transition: background .15s ease;
}
.les-trigger:hover { background: rgba(255, 255, 255, .26); }
.les-trigger:focus-visible { outline: 2px solid rgba(255, 255, 255, .85); outline-offset: 2px; }
.les-trigger-label { max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.les-trigger-chevron { display: inline-flex; align-items: center; justify-content: center; background: rgba(255, 255, 255, .22); border-radius: 999px; width: 20px; height: 20px; flex-shrink: 0; }

.les-menu { width: 320px; max-height: 60vh; overflow-y: auto; background: var(--fb-surface, #fff); border: 1px solid var(--fb-border, #e5e7eb); border-radius: 14px; box-shadow: 0 16px 40px rgba(15, 23, 42, .22); padding: 8px; }
.les-menu-kicker { font-size: var(--fs-xs); font-weight: var(--fw-bold); text-transform: uppercase; letter-spacing: .06em; color: var(--fb-faint, #9ca3af); padding: 8px 12px 4px; }
.les-menu-empty { padding: 10px 12px; font-size: var(--fs-base); color: var(--fb-muted, #6b7280); }
.les-menu-item { width: 100%; box-sizing: border-box; display: flex; align-items: center; gap: 10px; padding: 9px 12px; border: 0; border-radius: 9px; background: transparent; text-align: left; cursor: pointer; font: inherit; color: inherit; }
.les-menu-item:hover { background: var(--fb-subtle, #f7f7f8); }
.les-menu-item--active { background: var(--fb-danger-soft, #fef2f2); }
.les-menu-check { width: 18px; height: 18px; border-radius: 5px; border: 1.5px solid var(--fb-border-strong, #cbd5e1); display: flex; align-items: center; justify-content: center; flex-shrink: 0; color: #fff; }
.les-menu-check--on { background: #ff3131; border-color: #ff3131; }
.les-menu-label { min-width: 0; display: flex; flex-direction: column; gap: 2px; flex: 1; }
.les-menu-name { font-size: var(--fs-md); font-weight: var(--fw-bold); color: var(--fb-text, #212121); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.les-menu-meta { font-size: var(--fs-xs); color: var(--fb-faint, #9ca3af); }
</style>
