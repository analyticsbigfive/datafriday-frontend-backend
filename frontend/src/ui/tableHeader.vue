<template>
  <thead
    data-slot="table-header"
    class="[&_tr]:border-b"
  >
    <slot />
  </thead>
</template>

<script>
export default {
  name: 'TableHeader',
}
</script>