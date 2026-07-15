<template>
  <div
    data-slot="card-footer"
    class="flex items-center px-6 pb-6 [.border-t]:pt-6"
    :class="className"
  >
    <slot />
  </div>
</template>

<script>
export default {
  name: 'UiCardFooter',
  props: {
    className: {
      type: String,
      default: '',
    },
  },
}
</script>