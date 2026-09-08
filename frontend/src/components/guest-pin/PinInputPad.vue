<template>
  <div class="pin-pad" :class="{ 'pin-pad--error': error }">
    <input
      v-for="(digit, index) in digits"
      :key="index"
      :ref="(el) => (inputs[index] = el)"
      class="pin-pad__box"
      type="text"
      inputmode="numeric"
      autocomplete="one-time-code"
      maxlength="1"
      :disabled="disabled"
      :value="digit"
      @input="onInput(index, $event)"
      @keydown="onKeydown(index, $event)"
      @paste="onPaste($event)"
    />
  </div>
</template>

<script>
export default {
  name: 'PinInputPad',

  props: {
    length: { type: Number, default: 6 },
    disabled: { type: Boolean, default: false },
    error: { type: Boolean, default: false },
  },

  emits: ['complete', 'change'],

  data() {
    return {
      digits: Array(this.length).fill(''),
      inputs: [],
    };
  },

  watch: {
    error(isError) {
      if (isError) this.reset();
    },
  },

  mounted() {
    this.focusBox(0);
  },

  methods: {
    focusBox(index) {
      this.$nextTick(() => this.inputs[index]?.focus());
    },

    onInput(index, event) {
      const raw = event.target.value.replace(/\D/g, '');
      this.digits[index] = raw.slice(-1);
      event.target.value = this.digits[index];
      if (this.digits[index] && index < this.length - 1) {
        this.focusBox(index + 1);
      }
      this.maybeComplete();
    },

    onKeydown(index, event) {
      if (event.key === 'Backspace' && !this.digits[index] && index > 0) {
        this.focusBox(index - 1);
      }
    },

    onPaste(event) {
      const pasted = (event.clipboardData?.getData('text') || '').replace(/\D/g, '').slice(0, this.length);
      if (!pasted) return;
      event.preventDefault();
      this.digits = Array(this.length)
        .fill('')
        .map((_, i) => pasted[i] || '');
      this.focusBox(Math.min(pasted.length, this.length - 1));
      this.maybeComplete();
    },

    maybeComplete() {
      const value = this.digits.join('');
      this.$emit('change', value);
      if (value.length === this.length && !this.digits.includes('')) {
        this.$emit('complete', value);
      }
    },

    reset() {
      this.digits = Array(this.length).fill('');
      this.focusBox(0);
    },
  },
};
</script>

<style scoped>
.pin-pad {
  display: flex;
  gap: 8px;
  justify-content: center;
}

.pin-pad__box {
  width: 48px;
  height: 56px;
  border-radius: 10px;
  background: rgba(30, 41, 59, 0.7);
  border: 1.5px solid rgba(51, 65, 85, 0.8);
  color: #fff;
  font-size: 1.5rem;
  font-weight: 700;
  text-align: center;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.pin-pad__box:focus {
  border-color: #ff3131;
  box-shadow: 0 0 0 3px rgba(255, 49, 49, 0.15);
}

.pin-pad--error .pin-pad__box {
  border-color: #ff6e4a;
  box-shadow: 0 0 0 3px rgba(255, 110, 74, 0.15);
}

.pin-pad__box:disabled {
  opacity: 0.4;
}
</style>
