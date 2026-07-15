<template>
  <div
    :class="`${isCompact ? 'px-2' : 'px-4'} py-2.5 rounded-lg transition-colors`"
  >
    <div class="flex items-center justify-between gap-2">
      <div class="flex items-center gap-2 min-w-0">
        <Moon v-if="isDark" class="h-4 w-4" />
        <Sun v-else class="h-4 w-4" />
        <Label
          v-if="!(isCompact && isMobile)"
          class="text-sm cursor-pointer truncate"
        >
          Dark Mode
        </Label>
      </div>

      <Switch
        class="flex-shrink-0"
        :checked="isDark"
        @update:checked="handleToggle"
      />
    </div>

    <div
      v-if="theme === 'system' && !(isCompact && isMobile)"
      class="flex items-center gap-1.5 mt-1.5 text-xs text-muted-foreground"
    >
      <Monitor class="w-3 h-3" />
      <span>System default</span>
    </div>
  </div>
</template>

<script>
import { Moon, Sun, Monitor } from 'lucide-vue-next'
// Adapte ces chemins à tes composants Vue UI
import Label from './label.vue'
import Switch from './switch.vue'

export default {
  name: 'ThemeToggle',

  components: {
    Moon,
    Sun,
    Monitor,
    Label,
    Switch,
  },

  props: {
    isCompact: {
      type: Boolean,
      default: false,
    },
    isMobile: {
      type: Boolean,
      default: false,
    },
    // équivalent de useTheme()
    theme: {
      type: String,
      default: 'system', // 'light' | 'dark' | 'system'
    },
    resolvedTheme: {
      type: String,
      default: 'light', // thème effectif (light/dark)
    },
  },

  emits: ['update:theme', 'change-theme'],

  computed: {
    isDark() {
      // priorité au resolvedTheme comme dans React
      return this.resolvedTheme === 'dark' || this.theme === 'dark'
    },
  },

  methods: {
    handleToggle(checked) {
      // en React: setTheme(checked ? 'dark' : 'light')
      const next = checked ? 'dark' : 'light'
      this.$emit('update:theme', next)
      this.$emit('change-theme', next)
    },
  },
}
</script>