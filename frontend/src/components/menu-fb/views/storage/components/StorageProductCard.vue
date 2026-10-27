<template>
  <div class="spc" :class="{ 'spc--dark': isDark, 'spc--selected': selected }">
    <button
      type="button"
      class="spc__select"
      :class="{ 'spc__select--on': selected }"
      role="checkbox"
      :aria-checked="selected"
      :aria-label="selectLabel"
      :title="selectLabel"
      @click.stop="$emit('toggle-select', card)"
    >
      <Check v-if="selected" :size="14" :stroke-width="3" />
    </button>
    <div class="spc__actions">
      <button type="button" class="spc__btn" :title="editLabel" :aria-label="editLabel" @click.stop="$emit('edit', card)">
        <Pencil :size="13" />
      </button>
    </div>

    <div class="spc__avatar" :class="{ 'spc__avatar--img': !!card.image }">
      <img v-if="card.image" :src="card.image" :alt="card.name" />
      <span v-else>{{ initials }}</span>
    </div>

    <div class="spc__name">{{ card.name }}</div>
    <div class="spc__ref">[{{ card.reference }}]</div>

    <div class="spc__spaces">
      <button
        v-for="sp in spaces"
        :key="sp.id"
        type="button"
        class="spc__chip"
        @click.stop="$emit('open-space', { card, spaceId: sp.id, spaceName: sp.name })"
      >{{ sp.name }}</button>
      <span v-if="!spaces.length" class="spc__none">{{ noSpaceLabel }}</span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { Check, Pencil } from 'lucide-vue-next'

const props = defineProps({
  card: { type: Object, required: true },
  // [{ id, name }] déjà résolus par le parent (store spaces)
  spaces: { type: Array, default: () => [] },
  editLabel: { type: String, default: '' },
  noSpaceLabel: { type: String, default: '' },
  selected: { type: Boolean, default: false },
  selectLabel: { type: String, default: '' },
  isDark: { type: Boolean, default: false },
})
defineEmits(['edit', 'open-space', 'toggle-select'])

const initials = computed(() =>
  String(props.card.name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase(),
)
</script>

<style scoped>
.spc { background: #fff; border-radius: 18px; padding: 20px 18px 16px; border: 1px solid #e5e7eb; position: relative; display: flex; flex-direction: column; align-items: center; text-align: center; height: 100%; transition: all .25s cubic-bezier(.4,0,.2,1); }
.spc--dark { background: #1e293b; border-color: rgba(255,255,255,.08); }
.spc:hover { transform: translateY(-3px); box-shadow: 0 10px 28px rgba(0,0,0,.1); border-color: #ff3131; }
.spc--selected { border-color: #ff3131; box-shadow: 0 0 0 1px #ff3131; }
.spc__select { position: absolute; top: 12px; left: 12px; width: 24px; height: 24px; border-radius: 6px; border: 2px solid #d1d5db; background: #fff; color: #fff; display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; }
.spc--dark .spc__select { background: #0f172a; border-color: rgba(255,255,255,.25); }
.spc__select--on, .spc--dark .spc__select--on { background: #ff3131; border-color: #ff3131; }
.spc__select:focus-visible { outline: 2px solid #ff3131; outline-offset: 2px; }
.spc__actions { position: absolute; top: 12px; right: 12px; display: flex; gap: 5px; opacity: 0; transition: opacity .18s; }
.spc:hover .spc__actions, .spc__actions:focus-within { opacity: 1; }
.spc__btn { width: 28px; height: 28px; border: none; border-radius: 8px; background: #eff6ff; color: #2563eb; display: flex; align-items: center; justify-content: center; cursor: pointer; }
@media (hover: none) { .spc__actions { opacity: 1; } }
.spc__btn:hover { background: #dbeafe; }
.spc--dark .spc__btn { background: rgba(37,99,235,.15); color: #93c5fd; }
.spc__avatar { width: 64px; height: 64px; border-radius: 16px; margin-bottom: 14px; display: flex; align-items: center; justify-content: center; font-size: var(--fs-xl); font-weight: 800; color: #fff; background: linear-gradient(135deg,#ff3131,#e84444); overflow: hidden; }
.spc__avatar--img { background: #f3f4f6; }
.spc__avatar img { width: 100%; height: 100%; object-fit: cover; }
.spc__name { font-size: var(--fs-md); font-weight: 700; color: #111827; line-height: 1.25; margin-bottom: 4px; overflow-wrap: anywhere; }
.spc--dark .spc__name { color: #f1f5f9; }
.spc__ref { font-size: var(--fs-sm); color: #9ca3af; overflow-wrap: anywhere; }
.spc__spaces { width: 100%; display: flex; flex-wrap: wrap; justify-content: center; gap: 5px; margin-top: 12px; padding-top: 10px; border-top: 1px solid #f0f0f0; }
.spc--dark .spc__spaces { border-top-color: rgba(255,255,255,.07); }
.spc__chip { display: inline-flex; align-items: center; padding: 3px 9px; border-radius: 100px; font-size: var(--fs-sm); font-weight: 600; background: #fef2f2; color: #ff3131; border: 1px solid #fecaca; cursor: pointer; max-width: 100%; overflow-wrap: anywhere; text-align: left; }
.spc__chip:hover { background: #ff3131; color: #fff; }
.spc__none { font-size: var(--fs-sm); color: #9ca3af; }
</style>
