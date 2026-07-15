<template>
  <div
    class="relative flex w-full touch-none items-center select-none data-[disabled]:opacity-50"
    :class="[
      orientation === 'vertical'
        ? 'h-full min-h-44 w-auto flex-col'
        : '',
      rootClass,
    ]"
    :data-disabled="disabled ? 'true' : undefined"
    :data-orientation="orientation"
    @pointerdown.stop.prevent="onTrackPointerDown"
    ref="trackRef"
  >
    <!-- Track -->
    <div
      class="bg-muted relative grow overflow-hidden rounded-full"
      :class="orientation === 'vertical'
        ? 'h-full w-1.5'
        : 'h-4 w-full'"
      data-slot="slider-track"
    >
      <!-- Range -->
      <div
        class="bg-primary absolute"
        data-slot="slider-range"
        :style="rangeStyle"
      />
    </div>

    <!-- Thumbs -->
    <button
      v-for="(val, index) in internalValues"
      :key="index"
      type="button"
      class="border-primary bg-background ring-ring/50 block size-4 shrink-0 rounded-full border shadow-sm transition-[color,box-shadow] hover:ring-4 focus-visible:ring-4 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
      data-slot="slider-thumb"
      :style="thumbStyle(index)"
      :disabled="disabled"
      @pointerdown.stop.prevent="onThumbPointerDown(index, $event)"
    />
  </div>
</template>

<script>
export default {
  name: 'Slider',

  props: {
    className: {
      type: String,
      default: '',
    },
    // Valeur contrôlée (tableau de 1 ou 2 nombres)
    value: {
      type: Array,
      default: null,
    },
    // Valeur par défaut (fallback si value non fournie)
    defaultValue: {
      type: Array,
      default: null,
    },
    min: {
      type: Number,
      default: 0,
    },
    max: {
      type: Number,
      default: 100,
    },
    step: {
      type: Number,
      default: 1,
    },
    disabled: {
      type: Boolean,
      default: false,
    },
    orientation: {
      type: String,
      default: 'horizontal', // seule orientation utilisée dans ton code
    },
    // Callback façon React : (values: number[]) => void
    onValueChange: {
      type: Function,
      default: null,
    },
  },

  data() {
    return {
      // état interne quand le composant n’est pas strictement contrôlé
      internalValues: this.resolveInitialValues(),
      isDragging: false,
      activeThumbIndex: null,
      trackRect: null,
    };
  },

  computed: {
    rootClass() {
      // correspond au cn(...) de la version React
      return this.className || '';
    },

    // Valeur “source de vérité” (si value prop existe, on la suit)
    controlledValues() {
      if (Array.isArray(this.value) && this.value.length > 0) {
        return [...this.value];
      }
      return null;
    },

    effectiveValues() {
      return this.controlledValues ?? this.internalValues;
    },

    // Style du range (entre min et max des valeurs)
    rangeStyle() {
      const values = this.effectiveValues.slice().sort((a, b) => a - b);
      const minVal = values.length === 1 ? this.min : values[0];
      const maxVal = values[values.length - 1];

      const start = this.valueToPercent(minVal);
      const end = this.valueToPercent(maxVal);
      const size = end - start;

      if (this.orientation === 'vertical') {
        return {
          bottom: `${start}%`,
          height: `${size}%`,
          left: 0,
          right: 0,
        };
      }

      return {
        left: `${start}%`,
        width: `${size}%`,
        top: 0,
        bottom: 0,
      };
    },
  },

  watch: {
    value: {
      immediate: true,
      handler() {
        // si le parent contrôle value, on synchronise l’interne
        if (this.controlledValues) {
          this.internalValues = [...this.controlledValues];
        }
      },
    },
    min() {
      this.clampAll();
    },
    max() {
      this.clampAll();
    },
  },

  mounted() {
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
  },

  beforeUnmount() {
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
  },

  methods: {
    resolveInitialValues() {
      const { value, defaultValue, min, max } = this;
      if (Array.isArray(value) && value.length) {
        return [...value];
      }
      if (Array.isArray(defaultValue) && defaultValue.length) {
        return [...defaultValue];
      }
      // fallback comme dans le TSX : [min, max]
      return [min, max];
    },

    valueToPercent(val) {
      const range = this.max - this.min || 1;
      return ((val - this.min) / range) * 100;
    },

    percentToValue(percent) {
      const range = this.max - this.min;
      let value = this.min + (percent / 100) * range;
      // snap au step
      if (this.step > 0) {
        value = Math.round(value / this.step) * this.step;
      }
      return this.clamp(value);
    },

    clamp(val) {
      return Math.min(this.max, Math.max(this.min, val));
    },

    clampAll() {
      const vals = this.effectiveValues.map(v => this.clamp(v));
      this.setValues(vals);
    },

    setValues(newValues) {
      // garde l’ordre des thumbs mais s’assure que les valeurs restent dans [min,max]
      const clamped = newValues.map(v => this.clamp(v));
      this.internalValues = clamped;

      if (this.onValueChange) {
        this.onValueChange([...clamped]);
      }

      // possibilité d’utiliser v-model:value si besoin
      this.$emit('update:value', [...clamped]);
    },

    thumbStyle(index) {
      const val = this.effectiveValues[index];
      const percent = this.valueToPercent(val);

      if (this.orientation === 'vertical') {
        return {
          position: 'absolute',
          bottom: `${percent}%`,
          transform: 'translateY(50%)',
        };
      }

      return {
        position: 'absolute',
        left: `${percent}%`,
        transform: 'translateX(-50%)',
      };
    },

    updateTrackRect() {
      const el = this.$refs.trackRef;
      if (el) {
        this.trackRect = el.getBoundingClientRect();
      }
    },

    onThumbPointerDown(index, event) {
        if (this.disabled) return;
        this.updateTrackRect();
        this.isDragging = true;
        this.activeThumbIndex = index;

        const el = event.target;
        if (el && typeof el.focus === 'function') {
            el.focus();
        }
    },

    onTrackPointerDown(event) {
      if (this.disabled) return;
      this.updateTrackRect();
      if (!this.trackRect) return;

      const percent = this.pointerEventToPercent(event);
      const value = this.percentToValue(percent);

      // choisir le thumb le plus proche
      const values = this.effectiveValues;
      let closestIndex = 0;
      let minDist = Infinity;
      values.forEach((v, i) => {
        const d = Math.abs(v - value);
        if (d < minDist) {
          minDist = d;
          closestIndex = i;
        }
      });

      this.activeThumbIndex = closestIndex;
      this.isDragging = true;
      this.updateValueFromPointer(event);
    },

    pointerEventToPercent(event) {
      if (!this.trackRect) return 0;
      if (this.orientation === 'vertical') {
        const offset = this.trackRect.bottom - event.clientY;
        const percent = (offset / this.trackRect.height) * 100;
        return Math.min(100, Math.max(0, percent));
      } else {
        const offset = event.clientX - this.trackRect.left;
        const percent = (offset / this.trackRect.width) * 100;
        return Math.min(100, Math.max(0, percent));
      }
    },

    updateValueFromPointer(event) {
      if (this.activeThumbIndex == null) return;
      const percent = this.pointerEventToPercent(event);
      const newVal = this.percentToValue(percent);

      const values = [...this.effectiveValues];
      values[this.activeThumbIndex] = newVal;

      // si 2 thumbs, on garde l’ordre cohérent
      if (values.length === 2 && values[0] > values[1]) {
        values.sort((a, b) => a - b);
      }

      this.setValues(values);
    },

    onPointerMove(event) {
      if (!this.isDragging || this.disabled) return;
      this.updateValueFromPointer(event);
    },

    onPointerUp() {
      if (!this.isDragging) return;
      this.isDragging = false;
      this.activeThumbIndex = null;
    },
  },
};
</script>
