<template>
  <div
    data-slot="card-action"
    class="col-start-2 row-span-2 row-start-1 self-start justify-self-end"
    :class="className"
  >
    <slot />
  </div>
</template>

<script>
export default {
  name: 'UiCardAction',
  props: {
    className: {
      type: String,
      default: '',
    },
  },
}
</script>