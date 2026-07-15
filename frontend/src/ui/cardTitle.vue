<template>
  <h4
    data-slot="card-title"
    class="leading-none"
    :class="className"
  >
    <slot />
  </h4>
</template>

<script>
export default {
  name: 'UiCardTitle',
  props: {
    className: {
      type: String,
      default: '',
    },
  },
}
</script>