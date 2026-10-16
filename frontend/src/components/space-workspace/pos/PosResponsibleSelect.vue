<template>
  <v-menu v-if="canEdit" location="bottom start">
    <template #activator="{ props: menuProps }">
      <button v-bind="menuProps" type="button" class="pos-resp" :disabled="disabled">
        <v-icon size="14">mdi-account-outline</v-icon>
        {{ label }}
        <v-icon size="14">mdi-chevron-down</v-icon>
      </button>
    </template>
    <v-list density="compact" min-width="220" max-height="320">
      <v-list-item :active="!responsibleId" @click="$emit('select', null, '')">
        <v-list-item-title>{{ t('posResponsibleNone') }}</v-list-item-title>
      </v-list-item>
      <v-list-item
        v-for="person in options"
        :key="person.value"
        :active="person.value === responsibleId"
        @click="$emit('select', person.value, person.title)"
      >
        <v-list-item-title>{{ person.title }}</v-list-item-title>
      </v-list-item>
    </v-list>
  </v-menu>
  <span v-else class="pos-resp pos-resp--readonly">
    <v-icon size="14">mdi-account-outline</v-icon>
    {{ label }}
  </span>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from '@/i18n/useI18n'

// Responsable RH d'une caisse (traçabilité, décision 3). Lecture seule quand la liste RH n'est
// pas accessible à l'utilisateur.
const props = defineProps({
  responsibleId: { type: String, default: null },
  responsibleName: { type: String, default: null },
  options: { type: Array, default: () => [] }, // [{ value, title }]
  canEdit: { type: Boolean, default: true },
  disabled: { type: Boolean, default: false },
})
defineEmits(['select'])

const { t } = useI18n()
const label = computed(() =>
  t('posResponsible').replace('{name}', props.responsibleName || t('posResponsibleNone'))
)
</script>

<style scoped>
.pos-resp {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  margin-top: 6px;
  padding: 0 10px;
  border: 1px solid var(--fb-border, #e5e7eb);
  border-radius: 999px;
  background: var(--fb-subtle, #fafafa);
  color: var(--fb-text, #212121);
  font-size: var(--fs-base);
  font-weight: var(--fw-semibold);
  white-space: nowrap;
  cursor: pointer;
}
.pos-resp--readonly {
  cursor: default;
}
.pos-resp:disabled {
  opacity: 0.6;
  cursor: default;
}
.pos-resp:focus-visible {
  outline: 3px solid rgba(255, 49, 49, 0.18);
  outline-offset: 2px;
}
</style>
