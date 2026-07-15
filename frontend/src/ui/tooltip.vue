<template>
  <!-- Ancre pour le positionnement du contenu -->
  <span class="relative inline-flex" data-slot="tooltip">
    <slot />
  </span>
</template>

<script>
import { provide } from 'vue'

export default {
  name: 'Tooltip',
  data() {
    return {
      open: false,
    }
  },
  created() {
    provide('tooltipContext', {
      setOpen: (val) => {
        this.open = val
      },
      isOpen: () => this.open,
    })
  },
}
</script>