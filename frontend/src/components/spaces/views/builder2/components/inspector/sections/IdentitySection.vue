<template>
  <!-- Champ Name statique (pas d'accordéon) — cf. capture. -->
  <div class="id-field">
    <label class="id-label" for="id-name">{{ t('b2NameLabel') }}</label>
    <input
      id="id-name"
      class="id-input"
      type="text"
      :value="element.name"
      @change="(e) => commit('name', e.target.value)"
    />
  </div>
</template>

<script setup>
import { computed, inject } from 'vue'
import { useI18n } from '@/i18n/useI18n'

const { t } = useI18n()
const store = inject('builderStore')
const element = computed(() => store.selectedElement.value)

function commit(key, value) {
  const el = element.value
  if (!el || el[key] === value) return
  store.commitElementPatch(el.id, { [key]: value }, { [key]: el[key] }, 'Identité')
}
</script>

<style scoped>
.id-field {
  padding: 16px 0;
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}
.id-label {
  display: block;
  font-size: var(--fs-md);
  font-weight: 700;
  color: rgb(var(--v-theme-on-surface));
  margin-bottom: 10px;
}
.id-input {
  width: 100%;
  padding: 11px 14px;
  font-size: var(--fs-md);
  color: rgb(var(--v-theme-on-surface));
  background: rgba(var(--v-theme-on-surface), 0.05);
  border: 1px solid transparent;
  border-radius: 10px;
  outline: none;
  transition: background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
}
.id-input:hover { background: rgba(var(--v-theme-on-surface), 0.07); }
.id-input:focus {
  background: rgb(var(--v-theme-surface));
  border-color: #ff3131;
  box-shadow: 0 0 0 3px rgba(255, 49, 49, 0.12);
}
</style>
