<template>
  <div class="pf" :class="{ 'pf--filled': !!modelValue }" @click="pick">
    <input ref="input" type="file" accept="image/*" class="d-none" @change="onFile" />
    <template v-if="modelValue">
      <img :src="modelValue" alt="" class="pf__img" />
      <button type="button" class="pf__remove" :title="t('delete')" @click.stop="$emit('update:modelValue', '')">
        <X :size="13" color="#ff3131" />
      </button>
    </template>
    <div v-else class="pf__placeholder">
      <ImagePlus :size="24" style="color:#ff3131" />
      <span class="pf__label">{{ t('uploadPicture') }}</span>
    </div>
  </div>
</template>

<script>
import { ImagePlus, X } from 'lucide-vue-next';
import { useI18n } from '@/i18n/useI18n';

/**
 * Champ image d'une fiche : v-model = URL existante, data URI d'un nouveau fichier
 * (envoyé tel quel, le serveur le pose sur Supabase Storage) ou '' (pas d'image).
 */
export default {
  name: 'PictureField',
  components: { ImagePlus, X },
  props: {
    modelValue: { type: String, default: '' },
  },
  emits: ['update:modelValue'],
  setup() {
    return { t: useI18n().t };
  },
  methods: {
    pick() {
      this.$refs.input?.click();
    },
    onFile(event) {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => this.$emit('update:modelValue', String(reader.result || ''));
      reader.readAsDataURL(file);
    },
  },
};
</script>

<style scoped>
.pf {
  position: relative;
  height: 120px;
  border: 2px dashed #e5e7eb;
  border-radius: 12px;
  background: #fafafa;
  overflow: hidden;
  cursor: pointer;
  transition: border-color .2s, background .2s;
}
.pf:hover { border-color: #ff3131; background: #fff5f5; }
.pf--filled { border-style: solid; background: #fff; }
.pf__img { width: 100%; height: 100%; object-fit: cover; }
.pf__placeholder {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.pf__label { font-size: 13px; font-weight: 600; color: #374151; }
.pf__remove {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 8px;
  background: rgba(255,255,255,.9);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(0,0,0,.2);
}
</style>
