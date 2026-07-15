<template>
  <div
    data-slot="avatar-fallback"
    :class="['bg-muted flex size-full items-center justify-center rounded-full', className]"
    v-bind="$attrs"
  >
    <slot />
  </div>
</template>

<script>
export default {
  name: 'AvatarFallback',
  inheritAttrs: false,
  props: {
    className: {
      type: String,
      default: '',
    },
  },
}
</script>