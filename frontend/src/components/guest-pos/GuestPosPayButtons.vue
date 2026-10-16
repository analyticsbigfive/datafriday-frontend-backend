<template>
  <div class="pos-pay">
    <button
      v-for="method in methods"
      :key="method.id"
      type="button"
      class="pos-pay__btn"
      :class="[`pos-pay__btn--${method.variant}`, { 'pos-pay__btn--disabled': disabled }]"
      :data-kind="method.kind"
      :disabled="disabled"
      @click="$emit('pay', method.id)"
    >
      <GuestPosPaymentIcon :icon-key="method.iconKey" :size="22" />
      <span>{{ method.name }}</span>
    </button>
  </div>
</template>

<script setup>
// Un bouton par moyen de paiement renvoyé par le catalogue. Nom et kind viennent de l'API.
import GuestPosPaymentIcon from './GuestPosPaymentIcon.vue'

defineProps({
  methods: { type: Array, default: () => [] }, // [{ id, name, kind, iconKey, variant }]
  disabled: { type: Boolean, default: false },
})
defineEmits(['pay'])
</script>

<style scoped>
.pos-pay { display: flex; flex-wrap: wrap; gap: 10px; }
.pos-pay__btn {
  flex: 1 1 120px; min-height: 72px; border-radius: 14px; display: flex; align-items: center; justify-content: center; gap: 10px;
  font-size: var(--fs-lg); font-weight: var(--fw-bold); cursor: pointer;
}
.pos-pay__btn--solid { border: 0; background: var(--pos-accent); color: #fff; }
.pos-pay__btn--outline { border: 2px solid var(--pos-text); background: var(--pos-surface); color: var(--pos-text); }
.pos-pay__btn--disabled, .pos-pay__btn:disabled { border: 1px solid var(--pos-border); background: var(--pos-border); color: #9CA3AF; cursor: not-allowed; }
</style>
