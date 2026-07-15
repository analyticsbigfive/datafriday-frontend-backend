<template>
  <div
    data-slot="card-header"
    class="@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-6 pt-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6"
    :class="className"
  >
    <slot />
  </div>
</template>

<script>
export default {
  name: 'UiCardHeader',
  props: {
    className: {
      type: String,
      default: '',
    },
  },
}
</script>