<template>
  <!-- Champ du formulaire de comparaison : libellé + contrôle (slot) + mention facultative.
       Le libellé est un <label for> pour un contrôle unique, un <span id> pour un groupe
       (le groupe se rattache à lui par aria-labelledby). -->
  <div class="cf-field">
    <label v-if="forId" :for="forId" :id="labelId" class="cf-lab">{{ label }}</label>
    <span v-else :id="labelId" class="cf-lab">{{ label }}</span>
    <slot />
    <span v-if="hint" class="cf-hint" :id="hintId">{{ hint }}</span>
  </div>
</template>

<script setup>
defineProps({
  label: { type: String, required: true },
  // id du contrôle unique à lier ; absent pour un groupe de contrôles.
  forId: { type: String, default: '' },
  labelId: { type: String, default: undefined },
  hint: { type: String, default: '' },
  hintId: { type: String, default: undefined },
})
</script>

<style scoped>
.cf-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 14px;
  min-width: 0;
}
.cf-lab {
  font-size: var(--fs-sm);
  font-weight: var(--fw-medium);
  line-height: 1.3;
  color: var(--cf-muted);
}
.cf-hint {
  font-size: var(--fs-sm);
  line-height: 1.3;
  color: var(--cf-muted);
  min-height: 1em;
}
</style>
