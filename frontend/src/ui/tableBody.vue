<template>
  <tbody
    data-slot="table-body"
    class="[&_tr:last-child]:border-0"
  >
    <slot />
  </tbody>
</template>

<script>
export default {
  name: 'TableBody',
}
</script>