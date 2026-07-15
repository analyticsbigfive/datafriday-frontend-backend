<template>
  <Dialog v-bind="$attrs">
    <DialogContent
      class="overflow-hidden p-0"
      aria-describedby="command-dialog-description"
    >
      <DialogHeader class="sr-only">
        <DialogTitle>{{ title }}</DialogTitle>
        <DialogDescription id="command-dialog-description">
          {{ description }}
        </DialogDescription>
      </DialogHeader>

      <Command
        className="[&_[cmdk-group-heading]]:text-muted-foreground **:data-[slot=command-input-wrapper]:h-12 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group]]:px-2 [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5"
      >
        <slot />
      </Command>
    </DialogContent>
  </Dialog>
</template>

<script>
import Command from "./Command.vue";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./dialog";

export default {
  name: "CommandDialog",
  components: {
    Command,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
  },

  inheritAttrs: false,

  props: {
    title: {
      type: String,
      default: "Command Palette",
    },
    description: {
      type: String,
      default: "Search for a command to run...",
    },
  },
};
</script>
