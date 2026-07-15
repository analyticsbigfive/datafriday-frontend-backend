<template>
  <div
    data-slot="avatar"
    :class="['relative flex size-10 shrink-0 overflow-hidden rounded-full', className]"
    v-bind="$attrs"
  >
    <slot />
  </div>
</template>
<script>
export default {
  name: 'Avatar',
  inheritAttrs: false,
  props: {
    className: {
      type: String,
      default: '',
    },
  },
}
</script>