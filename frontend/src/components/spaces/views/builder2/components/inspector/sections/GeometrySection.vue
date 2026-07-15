<template>
  <SectionCard :title="t('b2PositionTitle')" icon="mdi-ruler-square" default-open>
    <!-- Position : X/Y, Largeur/Profondeur, Hauteur (pleine largeur) -->
    <div class="geo-grid">
      <div
        v-for="field in FIELDS"
        :key="field.key"
        class="geo-field"
        :class="{ 'geo-field--full': field.full }"
      >
        <label class="geo-label" :for="`geo-${field.key}`">{{ fieldLabel(field) }}</label>
        <input
          :id="`geo-${field.key}`"
          class="geo-input"
          type="number"
          inputmode="decimal"
          :value="element[field.key]"
          @change="(e) => commit(field.key, e.target.value)"
        />
      </div>
    </div>

    <div class="geo-divider" />

    <!-- Rayon des coins -->
    <div class="geo-corner-head">
      <span class="geo-corner-title">{{ t('b2CornerRadius') }} (m)</span>
      <button
        type="button"
        class="geo-link"
        :class="{ 'geo-link--on': linkedCorners }"
        :title="linkedCorners ? t('b2CornersLinked') : t('b2CornersIndependent')"
        @click="linkedCorners = !linkedCorners"
      >
        <v-icon :icon="linkedCorners ? 'mdi-link-variant' : 'mdi-link-variant-off'" size="16" />
      </button>
    </div>

    <!-- Lié : un seul champ « Tous les coins » -->
    <div v-if="linkedCorners" class="geo-field">
      <label class="geo-sublabel" for="geo-corner-all">{{ t('b2AllCorners') }}</label>
      <input
        id="geo-corner-all"
        class="geo-input"
        type="number"
        min="0"
        inputmode="decimal"
        :value="(element.cornerRadius || {}).topLeft || 0"
        @change="(e) => commitCorner('topLeft', e.target.value)"
      />
    </div>

    <!-- Indépendant : 4 coins -->
    <div v-else class="geo-grid">
      <div v-for="corner in CORNERS" :key="corner.key" class="geo-field">
        <label class="geo-sublabel" :for="`geo-${corner.key}`">{{ t(corner.labelKey) }}</label>
        <input
          :id="`geo-${corner.key}`"
          class="geo-input"
          type="number"
          min="0"
          inputmode="decimal"
          :value="(element.cornerRadius || {})[corner.key] || 0"
          @change="(e) => commitCorner(corner.key, e.target.value)"
        />
      </div>
    </div>

    <div class="geo-divider" />

    <!-- Surface au sol / Volume (calculés) -->
    <div class="geo-metrics">
      <div class="geo-metric">
        <span class="geo-metric__label">{{ t('b2FloorArea') }}</span>
        <span class="geo-metric__value">{{ floorArea }} m²</span>
      </div>
      <div class="geo-metric">
        <span class="geo-metric__label">{{ t('b2Volume') }}</span>
        <span class="geo-metric__value">{{ volume }} m³</span>
      </div>
    </div>
  </SectionCard>
</template>

<script setup>
import { ref, computed, inject } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import SectionCard from './SectionCard.vue'

// `pos` → suffixe « Position » dans le libellé (X Position / Y Position) ;
// `full` → champ pleine largeur (Hauteur).
const FIELDS = [
  { key: 'x', labelKey: 'b2AxisX', pos: true },
  { key: 'y', labelKey: 'b2AxisY', pos: true },
  { key: 'width', labelKey: 'b2Width' },
  { key: 'depth', labelKey: 'b2Depth' },
  { key: 'height3d', labelKey: 'b2Height', full: true },
]

const CORNERS = [
  { key: 'topLeft', labelKey: 'b2CornerTopLeft' },
  { key: 'topRight', labelKey: 'b2CornerTopRight' },
  { key: 'bottomLeft', labelKey: 'b2CornerBottomLeft' },
  { key: 'bottomRight', labelKey: 'b2CornerBottomRight' },
]

const { t } = useI18n()
const store = inject('builderStore')
const element = computed(() => store.selectedElement.value)
const linkedCorners = ref(true)

// Libellé : « X Position (m) », « Largeur (m) », etc.
function fieldLabel(field) {
  const base = field.pos ? `${t(field.labelKey)} ${t('b2PositionTitle')}` : t(field.labelKey)
  return `${base} (m)`
}

// Surface = largeur × profondeur ; Volume = surface × hauteur.
const floorArea = computed(() => {
  const w = Number(element.value?.width) || 0
  const d = Number(element.value?.depth) || 0
  return (w * d).toFixed(2)
})
const volume = computed(() => {
  const h = Number(element.value?.height3d) || 0
  return (Number(floorArea.value) * h).toFixed(2)
})

function commit(key, raw) {
  const el = element.value
  if (!el) return
  const value = Number(raw)
  if (Number.isNaN(value) || el[key] === value) return
  store.commitElementPatch(el.id, { [key]: value }, { [key]: el[key] }, 'Géométrie')
}

function commitCorner(key, raw) {
  const el = element.value
  if (!el) return
  const value = Math.max(0, Number(raw) || 0)
  const previous = { cornerRadius: { ...(el.cornerRadius || {}) } }
  const next = linkedCorners.value
    ? { topLeft: value, topRight: value, bottomLeft: value, bottomRight: value }
    : { ...(el.cornerRadius || {}), [key]: value }
  store.commitElementPatch(el.id, { cornerRadius: next }, previous, 'Coins arrondis')
}
</script>

<style scoped>
/* Grille de champs (2 colonnes ; Hauteur pleine largeur). */
.geo-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.geo-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.geo-field--full { grid-column: 1 / -1; }

.geo-label {
  font-size: 13px;
  font-weight: 600;
  color: rgb(var(--v-theme-on-surface));
}
.geo-sublabel {
  font-size: 12.5px;
  font-weight: 500;
  color: rgba(var(--v-theme-on-surface), 0.5);
}

/* Champ stylisé (fond clair, arrondi, focus rouge). */
.geo-input {
  width: 100%;
  padding: 11px 14px;
  font-size: 14px;
  color: rgb(var(--v-theme-on-surface));
  background: rgba(var(--v-theme-on-surface), 0.05);
  border: 1px solid transparent;
  border-radius: 10px;
  outline: none;
  transition: background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
}
.geo-input::placeholder { color: rgba(var(--v-theme-on-surface), 0.4); }
.geo-input:hover { background: rgba(var(--v-theme-on-surface), 0.07); }
.geo-input:focus {
  background: rgb(var(--v-theme-surface));
  border-color: #ff3131;
  box-shadow: 0 0 0 3px rgba(255, 49, 49, 0.12);
}

/* Séparateurs de blocs. */
.geo-divider {
  height: 1px;
  background: rgba(var(--v-border-color), var(--v-border-opacity));
  margin: 18px 0;
}

/* En-tête « Rayon des coins » + bouton lien. */
.geo-corner-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.geo-corner-title {
  font-size: 13px;
  font-weight: 600;
  color: rgb(var(--v-theme-on-surface));
}
.geo-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: rgba(var(--v-theme-on-surface), 0.5);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}
.geo-link:hover { background: rgba(var(--v-theme-on-surface), 0.06); }
.geo-link--on { background: rgba(255, 49, 49, 0.1); color: #ff3131; }
.geo-link--on:hover { background: rgba(255, 49, 49, 0.16); }

/* Surface au sol / Volume. */
.geo-metrics {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.geo-metric {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.geo-metric__label {
  font-size: 12.5px;
  font-weight: 500;
  color: rgba(var(--v-theme-on-surface), 0.5);
}
.geo-metric__value {
  font-size: 18px;
  font-weight: 700;
  color: rgb(var(--v-theme-on-surface));
}
</style>
