<template>
  <div
    data-slot="card"
    class="bg-card text-card-foreground flex flex-col gap-6 rounded-xl border"
    :class="className"
  >
    <slot />
  </div>
</template>

<script>
export default {
  name: 'UiCard',
  props: {
    className: {
      type: String,
      default: '',
    },
  },
}
</script>