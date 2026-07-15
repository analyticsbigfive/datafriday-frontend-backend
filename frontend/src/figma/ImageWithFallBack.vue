<template>
  <div v-if="didError"
       class="inline-block bg-gray-100 text-center align-middle"
       :class="className"
       :style="style">
    <div class="flex items-center justify-center w-full h-full">
      <img
        :src="ERROR_IMG_SRC"
        alt="Error loading image"
        v-bind="restAttrs"
        :data-original-url="src"
      />
    </div>
  </div>
  <img
    v-else
    :src="src"
    :alt="alt"
    :class="className"
    :style="style"
    v-bind="restAttrs"
    @error="handleError"
  />
</template>

<script>
const ERROR_IMG_SRC =
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODgiIGhlaWdodD0iODgiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgc3Ryb2tlPSIjMDAwIiBzdHJva2UtbGluZWpvaW49InJvdW5kIiBvcGFjaXR5PSIuMyIgZmlsbD0ibm9uZSIgc3Ryb2tlLXdpZHRoPSIzLjciPjxyZWN0IHg9IjE2IiB5PSIxNiIgd2lkdGg9IjU2IiBoZWlnaHQ9IjU2IiByeD0iNiIvPjxwYXRoIGQ9Im0xNiA1OCAxNi0xOCAzMiAzMiIvPjxjaXJjbGUgY3g9IjUzIiBjeT0iMzUiIHI9IjciLz48L3N2Zz4KCg=='

export default {
  name: 'ImageWithFallback',

  props: {
    src: {
      type: String,
      default: '',
    },
    alt: {
      type: String,
      default: '',
    },
    className: {
      // pour mapper la prop React className -> :class
      type: String,
      default: '',
    },
    style: {
      type: [String, Object],
      default: null,
    },
  },

  data() {
    return {
      didError: false,
      ERROR_IMG_SRC
    }
  },

  computed: {
    restAttrs() {
      // passe tous les autres attributs HTML (width, height, etc.)
      const { src, alt, className, style, ...rest } = this.$attrs
      return rest
    },
  },

  methods: {
    handleError() {
      this.didError = true
    },
  },

  // exposer la constante si besoin dans le template
  constants: {
    ERROR_IMG_SRC,
  },
}
</script>