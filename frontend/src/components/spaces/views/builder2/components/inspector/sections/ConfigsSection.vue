<template>
  <!-- Adhésions élément ↔ configurations : 1 clic = 1 requête (INSERT/DELETE d'une
       ligne ConfigurationElement). Cœur du modèle v2 — remplace la synchro
       cross-config par nom+type de la v1 (doc §2.2). -->
  <SectionCard :title="t('b2ConfigsTitle')" icon="mdi-cog-outline" default-open>
    <div class="cs-hint">{{ t('b2ConfigsVisibleIn') }}</div>
    <div class="cs-list">
      <label
        v-for="config in store.configsSorted.value"
        :key="config.id"
        class="cs-item"
        :class="{ 'cs-item--disabled': isLocked(config.id) }"
      >
        <input
          type="checkbox"
          class="cs-check"
          :checked="isMember(config.id)"
          :disabled="isLocked(config.id)"
          @change="toggle(config.id)"
        />
        <span class="cs-name">{{ config.name }}</span>
        <span v-if="config.id === store.state.activeConfigId" class="cs-current">({{ t('b2Active') }})</span>
        <v-progress-circular
          v-if="isSyncing(config.id)"
          indeterminate
          size="12"
          width="2"
          color="#ff3131"
          class="cs-spinner"
        />
      </label>
      
    </div>
    <div v-if="memberCount <= 1" class="cs-hint cs-hint--warn">
      {{ t('b2ConfigsLastOneHint') }}
    </div>
  </SectionCard>
</template>

<script setup>
import { computed, inject } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import SectionCard from './SectionCard.vue'

const { t } = useI18n()
const store = inject('builderStore')
const element = computed(() => store.selectedElement.value)

const memberIds = computed(() => store.state.memberships[element.value?.id] || [])
const memberCount = computed(() => memberIds.value.length)

function isMember(configId) {
  return memberIds.value.includes(configId)
}

function isSyncing(configId) {
  return store.state.syncingMemberships.includes(`${element.value?.id}:${configId}`)
}

// Verrouillé = config active dont l'élément est déjà membre (on ne se retire pas
// de la config qu'on édite) ou synchro en cours.
function isLocked(configId) {
  return (configId === store.state.activeConfigId && isMember(configId)) || isSyncing(configId)
}

function toggle(configId) {
  const el = element.value
  if (!el) return
  store.toggleMembership(el.id, configId, !isMember(configId))
}
</script>

<style scoped>
.cs-hint {
  font-size: var(--fs-sm);
  line-height: 1.4;
  color: rgba(var(--v-theme-on-surface), 0.55);
  margin-bottom: 10px;
}
.cs-hint--warn {
  margin: 10px 0 0;
  color: #b45309;
}
.cs-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.cs-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.12s ease;
}
.cs-item:hover { background: rgba(var(--v-theme-on-surface), 0.04); }
.cs-item--disabled,
.cs-item--disabled:hover {
  cursor: default;
  background: transparent;
}
.cs-check {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  accent-color: #ff3131;
  cursor: pointer;
}
.cs-item--disabled .cs-check { cursor: default; }
.cs-name {
  font-size: var(--fs-base);
  font-weight: 500;
  color: rgb(var(--v-theme-on-surface));
}
.cs-current {
  font-size: var(--fs-sm);
  color: rgba(var(--v-theme-on-surface), 0.45);
}
.cs-spinner { margin-left: auto; }
</style>
