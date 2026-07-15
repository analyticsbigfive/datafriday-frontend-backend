<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center"
    role="alertdialog"
    aria-modal="true"
  >
    <div
      data-slot="alert-dialog-content"
      class="bg-background text-foreground w-full max-w-lg rounded-xl border shadow-lg p-6 relative"
    >
      <slot />
    </div>
  </div>
</template>

<script>
export default {
  name: 'AlertDialogContent',
  inject: ['alertDialog'],

  methods: {
    close() {
      this.alertDialog && this.alertDialog.setOpen(false)
    },
  },
}
</script>