<template>
  <span data-slot="select-value" class="flex items-center gap-2">
    <span v-if="displayLabel">{{ displayLabel }}</span>
    <span v-else class="text-muted-foreground">
      {{ placeholder }}
    </span>
  </span>
</template>

<script>
export default {
  name: 'SelectValue',

  props: {
    placeholder: {
      type: String,
      default: '',
    },
  },

  inject: ['selectContext'],

  computed: {
    displayLabel() {
      const api = this.selectContext
      if (!api) return null
      const label = api.getLabel && api.getLabel()
      const value = api.getValue && api.getValue()
      return label || value || null
    },
  },
}
</script>