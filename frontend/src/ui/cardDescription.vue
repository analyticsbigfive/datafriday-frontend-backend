<template>
  <p
    data-slot="card-description"
    class="text-muted-foreground"
    :class="className"
  >
    <slot />
  </p>
</template>

<script>
export default {
  name: 'UiCardDescription',
  props: {
    className: {
      type: String,
      default: '',
    },
  },
}
</script>