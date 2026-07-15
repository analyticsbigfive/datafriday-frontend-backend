<template>
  <div
    data-slot="card-content"
    class="px-6 [&:last-child]:pb-6"
    :class="className"
  >
    <slot />
  </div>
</template>

<script>
export default {
  name: 'UiCardContent',
  props: {
    className: {
      type: String,
      default: '',
    },
  },
}
</script>