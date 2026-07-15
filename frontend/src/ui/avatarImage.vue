<template>
  <img
    data-slot="avatar-image"
    :class="['aspect-square size-full', className]"
    v-bind="$attrs"
  />
</template>
<script>
export default {
  name: 'AvatarImage',
  inheritAttrs: false,
  props: {
    className: {
      type: String,
      default: '',
    },
  },
}
</script>