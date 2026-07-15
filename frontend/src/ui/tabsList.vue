<template>
  <div
    data-slot="tabs-list"
    class="bg-muted text-muted-foreground inline-flex h-9 w-fit items-center justify-center rounded-xl p-[3px] flex"
    :class="className"
  >
    <slot />
  </div>
</template>

<script>
export default {
  name: 'TabsList',

  props: {
    className: {
      type: String,
      default: '',
    },
  },
}
</script>
<style scoped lang="scss">
:deep([data-slot="tabs-trigger"][data-state='active']) {
  background-color: white !important;
  color: black !important;
}

:deep([data-slot="tabs-trigger"][data-state='active'] .v-icon) {
  color: black !important;
}
</style>