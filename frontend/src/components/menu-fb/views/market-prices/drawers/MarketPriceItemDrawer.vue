<template>
  <Teleport to="body">
    <Transition name="mpid">
      <div v-if="modelValue" class="mpid-overlay" @mousedown.self="close">
        <div class="d-flex flex-column mpid-panel" :class="{ 'mpid-panel--dark': isDark }">
          <div class="mpid__header">
            <div class="mpid__header-titles">
              <div class="mpid__title">{{ title }}</div>
              <div class="mpid__subtitle">{{ itemName }}</div>
            </div>
            <button class="mpid__close" type="button" @click="close"><X :size="18" /></button>
          </div>
          <div class="mpid__content">
            <MarketPriceItemPanel :item-name="itemName" :is-dark="isDark" @changed="$emit('changed')" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script>
import { X } from 'lucide-vue-next';
import MarketPriceItemPanel from '../components/MarketPriceItemPanel.vue';

/** Tiroir « Prix du marché » d'un article, ouvert depuis une ligne d'ingrédient de recette. */
export default {
  name: 'MarketPriceItemDrawer',
  components: { X, MarketPriceItemPanel },
  props: {
    modelValue: { type: Boolean, default: false },
    itemName: { type: String, default: '' },
    isDark: { type: Boolean, default: false },
  },
  emits: ['update:modelValue', 'changed'],
  computed: {
    title() {
      return (localStorage.getItem('appLocale') || 'en') === 'fr' ? 'Prix du marché' : 'Market prices';
    },
  },
  methods: {
    close() {
      this.$emit('update:modelValue', false);
    },
  },
};
</script>

<style scoped>
.mpid-overlay {
  position: fixed;
  inset: 0;
  z-index: 9000;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  justify-content: flex-end;
}
.mpid-panel {
  width: 1100px;
  max-width: 96vw;
  height: 100%;
  background: #ffffff;
  box-shadow: -4px 0 32px rgba(0, 0, 0, 0.18);
  overflow: hidden;
}
.mpid-panel--dark { background: #0f172a; color: #e2e8f0; }
.mpid__header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px 24px;
  background: #ff3131;
  color: #fff;
}
.mpid__header-titles { flex: 1; min-width: 0; }
.mpid__title { font-size: 16px; font-weight: 700; }
.mpid__subtitle { font-size: 12px; opacity: 0.85; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mpid__close {
  width: 32px; height: 32px; border: none; border-radius: 8px;
  background: rgba(255, 255, 255, 0.18); color: #fff; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
}
.mpid__content { flex: 1; overflow-y: auto; padding: 20px 24px; }
.mpid-enter-active, .mpid-leave-active { transition: opacity 0.25s ease; }
.mpid-enter-from, .mpid-leave-to { opacity: 0; }
</style>
