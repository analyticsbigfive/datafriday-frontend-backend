<template>
  <Teleport to="body">
    <Transition name="wmtd-backdrop">
      <div v-if="modelValue" class="wmtd-backdrop" @click="close"></div>
    </Transition>
    <Transition name="wmtd-panel">
      <nav v-if="modelValue" class="wmtd-panel" role="navigation" :aria-label="title">
        <div class="wmtd-header">
          <span class="wmtd-header__title">{{ title }}</span>
          <button class="wmtd-close" @click="close" aria-label="Close">
            <X :size="18" />
          </button>
        </div>

        <ul class="wmtd-list">
          <li v-for="item in items" :key="item.value">
            <button
              type="button"
              class="wmtd-item"
              :class="{ 'wmtd-item--active': item.value === currentValue }"
              :disabled="item.value === currentValue"
              @click="select(item)"
            >
              <v-icon size="19" class="wmtd-item__icon">{{ item.icon }}</v-icon>
              <span class="wmtd-item__label">{{ item.label }}</span>
            </button>
          </li>
        </ul>
      </nav>
    </Transition>
  </Teleport>
</template>

<script>
import { X } from 'lucide-vue-next'

export default {
  name: 'WorkspaceMobileToolDrawer',
  components: { X },
  props: {
    modelValue: { type: Boolean, default: false },
    items: { type: Array, default: () => [] },
    currentValue: { type: String, default: '' },
    title: { type: String, default: 'Outils' },
  },
  emits: ['update:modelValue', 'select'],
  methods: {
    close() {
      this.$emit('update:modelValue', false)
    },
    select(item) {
      if (item.value === this.currentValue) return
      this.$emit('select', item.value)
      this.close()
    },
  },
}
</script>

<style scoped>
.wmtd-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(17, 24, 39, .45);
  z-index: 1000;
}

.wmtd-panel {
  position: fixed;
  top: 0;
  bottom: 0;
  left: 0;
  z-index: 1001;
  width: min(300px, 84vw);
  background: #fff;
  box-shadow: 8px 0 30px rgba(0, 0, 0, .18);
  padding: 14px 10px calc(14px + env(safe-area-inset-bottom, 0px));
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.wmtd-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px 14px;
}
.wmtd-header__title {
  font-size: var(--fs-lg);
  font-weight: 700;
  color: #111827;
}
.wmtd-close {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: none;
  background: #f3f4f6;
  color: #6b7280;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.wmtd-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.wmtd-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 12px;
  border: none;
  border-radius: 12px;
  background: transparent;
  color: #374151;
  font-size: var(--fs-md);
  font-weight: 600;
  text-align: left;
  cursor: pointer;
}
.wmtd-item:hover:not(:disabled) { background: #f9fafb; }
.wmtd-item__icon { color: #9ca3af; flex-shrink: 0; }

.wmtd-item--active {
  background: rgba(255, 49, 49, .08);
  color: #ff3131;
  cursor: default;
}
.wmtd-item--active .wmtd-item__icon { color: #ff3131; }

/* Transitions */
.wmtd-backdrop-enter-active, .wmtd-backdrop-leave-active { transition: opacity .2s ease; }
.wmtd-backdrop-enter-from, .wmtd-backdrop-leave-to { opacity: 0; }

.wmtd-panel-enter-active { transition: transform .26s cubic-bezier(.32, .72, 0, 1); }
.wmtd-panel-leave-active { transition: transform .18s ease-in; }
.wmtd-panel-enter-from, .wmtd-panel-leave-to { transform: translateX(-100%); }
</style>
