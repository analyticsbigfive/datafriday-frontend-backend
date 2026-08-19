<template>
  <v-menu location="bottom start" offset="6" :close-on-content-click="true">
    <template #activator="{ props: menuProps }">
      <button
        type="button"
        class="lcs-trigger"
        v-bind="menuProps"
        :aria-label="t('logiConfigSelectLabel')"
      >
        <Layers v-if="isAggregate" :size="14" />
        <Tag v-else :size="14" />
        <span class="lcs-trigger-label">{{ activeLabel }}</span>
        <span class="lcs-trigger-chevron">
          <ChevronDown :size="12" />
        </span>
      </button>
    </template>

    <div class="lcs-menu">
      <div class="lcs-menu-kicker">{{ t('logiConfigSelectViewKicker') }}</div>
      <button
        type="button"
        class="lcs-menu-item"
        :class="{ 'lcs-menu-item--active': isAggregate }"
        @click="select('all')"
      >
        <span class="lcs-menu-icon" :class="{ 'lcs-menu-icon--active': isAggregate }"><Layers :size="15" /></span>
        <span class="lcs-menu-label">
          <span class="lcs-menu-name" :class="{ 'lcs-menu-name--active': isAggregate }">{{ t('logiConfigAll') }}</span>
          <span class="lcs-menu-meta">{{ t('logiConfigAllMeta', { count: configurations.length }) }}</span>
        </span>
        <Check v-if="isAggregate" :size="16" class="lcs-menu-check" />
      </button>

      <template v-if="configurations.length">
        <div class="lcs-menu-sep"></div>
        <div class="lcs-menu-kicker">{{ t('logiConfigSelectListKicker') }}</div>
        <button
          v-for="cfg in configurations"
          :key="cfg.id"
          type="button"
          class="lcs-menu-item"
          :class="{ 'lcs-menu-item--active': !isAggregate && String(cfg.id) === String(modelValue) }"
          @click="select(cfg.id)"
        >
          <span class="lcs-menu-icon" :class="{ 'lcs-menu-icon--active': !isAggregate && String(cfg.id) === String(modelValue) }"><Tag :size="15" /></span>
          <span class="lcs-menu-label">
            <span class="lcs-menu-name" :class="{ 'lcs-menu-name--active': !isAggregate && String(cfg.id) === String(modelValue) }">{{ cfg.name || cfg.title }}</span>
          </span>
          <Check v-if="!isAggregate && String(cfg.id) === String(modelValue)" :size="16" class="lcs-menu-check" />
        </button>
      </template>
    </div>
  </v-menu>
</template>

<script setup>
import { computed } from 'vue'
import { Layers, Tag, ChevronDown, Check } from 'lucide-vue-next'
import { useI18n } from '@/i18n/useI18n'

const { t } = useI18n()

const props = defineProps({
  configurations: { type: Array, default: () => [] },
  modelValue: { type: String, default: 'all' },
})
const emit = defineEmits(['update:modelValue'])

const isAggregate = computed(() => props.modelValue === 'all' || !props.modelValue)

const activeLabel = computed(() => {
  if (isAggregate.value) return t('logiConfigAll')
  const cfg = props.configurations.find((c) => String(c.id) === String(props.modelValue))
  return cfg?.name || cfg?.title || t('logiConfigAll')
})

function select(id) {
  if (String(id) === String(props.modelValue)) return
  emit('update:modelValue', id)
}
</script>

<style scoped>
.lcs-trigger {
  margin-top: 5px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: rgba(255, 255, 255, .16);
  border: 1.5px solid rgba(255, 255, 255, .55);
  border-radius: 100px;
  padding: 5px 8px 5px 12px;
  color: #fff;
  font-size: 12.5px;
  font-weight: 700;
  cursor: pointer;
  transition: background .15s ease;
}
.lcs-trigger:hover { background: rgba(255, 255, 255, .26); }
.lcs-trigger:focus-visible { outline: 2px solid rgba(255, 255, 255, .85); outline-offset: 2px; }
.lcs-trigger-label {
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lcs-trigger-chevron {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, .22);
  border-radius: 999px;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}

.lcs-menu {
  width: 320px;
  max-height: 60vh;
  overflow-y: auto;
  background: var(--fb-surface, #fff);
  border: 1px solid var(--fb-border, #e5e7eb);
  border-radius: 14px;
  box-shadow: 0 16px 40px rgba(15, 23, 42, .22);
  padding: 8px;
}
.lcs-menu-kicker {
  font-size: .6875rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: .06em;
  color: var(--fb-faint, #9ca3af);
  padding: 8px 12px 4px;
}
.lcs-menu-item {
  width: 100%;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  text-align: left;
  cursor: pointer;
  font: inherit;
  color: inherit;
}
.lcs-menu-item:hover { background: var(--fb-subtle, #f7f7f8); }
.lcs-menu-item--active { background: var(--fb-danger-soft, #fef2f2); }
.lcs-menu-item--active:hover { background: var(--fb-danger-soft, #fef2f2); }
.lcs-menu-icon {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: var(--fb-subtle, #f1f5f9);
  color: var(--fb-muted, #64748b);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.lcs-menu-icon--active { background: #ff3131; color: #fff; }
.lcs-menu-label { min-width: 0; display: flex; flex-direction: column; gap: 2px; flex: 1; }
.lcs-menu-name {
  font-size: .85rem;
  font-weight: 700;
  color: var(--fb-text, #212121);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.lcs-menu-name--active { color: #ff3131; }
.lcs-menu-meta { font-size: .7rem; color: var(--fb-faint, #9ca3af); }
.lcs-menu-check { color: #ff3131; flex-shrink: 0; }
.lcs-menu-sep { height: 1px; background: var(--fb-border, #e5e7eb); margin: 6px 4px; }
</style>
