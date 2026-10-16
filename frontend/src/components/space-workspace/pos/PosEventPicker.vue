<template>
  <div class="pos-event">
    <v-menu location="bottom start" :close-on-content-click="true">
      <template #activator="{ props: menuProps }">
        <button v-bind="menuProps" type="button" class="pos-event__btn" aria-haspopup="listbox">
          <strong>{{ selectedLabel || t('posNoEvent') }}</strong>
          <v-icon size="18">mdi-menu-down</v-icon>
        </button>
      </template>
      <v-list density="compact" min-width="340" role="listbox" :aria-label="t('posEventsListLabel')">
        <v-list-item
          v-for="event in events"
          :key="event.id"
          role="option"
          :active="event.id === modelValue"
          @click="$emit('update:modelValue', event.id)"
        >
          <v-list-item-title>{{ event.name }}</v-list-item-title>
          <v-list-item-subtitle>{{ dateLabel(event) }}</v-list-item-subtitle>
          <template #append>
            <span class="pos-event__chip" :class="`pos-event__chip--${event.status}`">{{ statusLabel(event) }}</span>
          </template>
        </v-list-item>
        <p class="pos-event__note">{{ t('posEventsOnlyNote') }}</p>
      </v-list>
    </v-menu>
    <span v-if="hint" class="pos-event__hint">· {{ hint }}</span>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { POS_EVENT_STATUS_KEYS, usePosFormat } from '@/composables/usePosFormat'

// Sélecteur d'évènement du bandeau rouge : seuls les évènements en cours et à venir sont proposés.
const props = defineProps({
  events: { type: Array, default: () => [] },
  modelValue: { type: String, default: null },
})
defineEmits(['update:modelValue'])

const { t, date, eventLabel } = usePosFormat()
const selected = computed(() => props.events.find((e) => e.id === props.modelValue) || null)
const selectedLabel = computed(() => eventLabel(selected.value))
const statusLabel = (event) => t(POS_EVENT_STATUS_KEYS[event.status] || POS_EVENT_STATUS_KEYS.upcoming)
const dateLabel = (event) => date(event.eventDate)
const hint = computed(() => (selected.value ? statusLabel(selected.value) : ''))
</script>

<style scoped>
.pos-event {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 6px;
  color: rgba(255, 255, 255, 0.85);
  font-size: var(--fs-base);
}
.pos-event__btn {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  min-height: 28px;
  padding: 0;
  border: 0;
  background: transparent;
  color: #ffffff;
  font: inherit;
  cursor: pointer;
}
.pos-event__btn:focus-visible {
  outline: 2px solid rgba(255, 255, 255, 0.6);
  outline-offset: 2px;
}
.pos-event__hint {
  font-weight: var(--fw-semibold);
}
.pos-event__chip {
  padding: 3px 10px;
  border-radius: 999px;
  font-size: var(--fs-sm);
  font-weight: var(--fw-bold);
}
.pos-event__chip--live {
  background: #f0fdf4;
  color: #16a34a;
}
.pos-event__chip--upcoming {
  background: #fffbeb;
  color: #b45309;
}
.pos-event__note {
  margin: 0;
  padding: 8px 16px 6px;
  color: #6b7280;
  font-size: var(--fs-sm);
  line-height: 1.4;
}
</style>
