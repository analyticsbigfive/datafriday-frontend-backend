<template>
  <v-dialog :model-value="modelValue" max-width="560" scrollable @update:model-value="$emit('update:modelValue', $event)">
    <v-card v-if="zone" rounded="xl" elevation="8">

      <!-- Header — parité v1 : icône rouge + titre/sous-titre + bouton fermer -->
      <div class="b2-dlg-header">
        <div class="d-flex align-center gap-3">
          <div class="b2-dlg-icon">
            <Edit2Icon :size="17" color="#ff3131" />
          </div>
          <div>
            <div class="font-weight-semibold" style="font-size: var(--fs-lg);">{{ t('b2EditZoneTitle') }}</div>
            <div class="text-medium-emphasis" style="font-size: var(--fs-base);">{{ t('b2EditZoneSubtitle') }}</div>
          </div>
        </div>
        <v-btn icon size="small" variant="text" @click="$emit('update:modelValue', false)">
          <XIcon :size="16" />
        </v-btn>
      </div>

      <!-- Body -->
      <v-card-text class="px-5 py-4" style="max-height: 65vh;">

        <!-- Name -->
        <div class="mb-4">
          <div class="b2-field-label">{{ t('b2NameLabel') }}</div>
          <v-text-field
            v-model="form.name"
            :placeholder="t('b2ZoneNamePlaceholder')"
            variant="outlined"
            density="compact"
            rounded="lg"
            hide-details
          />
        </div>

        <!-- Dimensions -->
        <div class="mb-4">
          <div class="b2-field-label mb-2">{{ t('b2DimensionsLabel') }}</div>
          <div :class="['b2-dims', zone.kind === 'FLOOR' ? 'b2-dims--3' : 'b2-dims--2']">
            <div>
              <div class="b2-sub-label">{{ t('b2WidthM') }}</div>
              <v-text-field v-model.number="form.width" type="number" min="1" variant="outlined" density="compact" rounded="lg" hide-details />
            </div>
            <div>
              <div class="b2-sub-label">{{ t('b2LengthM') }}</div>
              <v-text-field v-model.number="form.length" type="number" min="1" variant="outlined" density="compact" rounded="lg" hide-details />
            </div>
            <div v-if="zone.kind === 'FLOOR'">
              <div class="b2-sub-label">{{ t('b2HeightM') }}</div>
              <v-text-field v-model.number="form.height" type="number" min="1" variant="outlined" density="compact" rounded="lg" hide-details />
            </div>
          </div>
        </div>

        <!-- Corner Radius -->
        <div class="mb-4">
          <div class="d-flex align-center justify-space-between mb-2">
            <div class="b2-field-label mb-0">{{ t('b2CornerRadiusM') }}</div>
            <v-btn icon size="x-small" variant="tonal" @click="linkedCorners = !linkedCorners">
              <LinkIcon v-if="linkedCorners"   key="linked"   :size="13" />
              <UnlinkIcon v-else               key="unlinked" :size="13" />
            </v-btn>
          </div>
          <template v-if="linkedCorners">
            <v-text-field
              :model-value="form.cornerRadius.topLeft"
              :placeholder="t('b2AllCorners')"
              type="number" min="0"
              variant="outlined" density="compact" rounded="lg" hide-details
              @update:model-value="(v) => setCorner('topLeft', v)"
            />
          </template>
          <div v-else class="b2-dims b2-dims--2">
            <div v-for="corner in CORNERS" :key="corner.key">
              <div class="b2-sub-label">{{ t(corner.labelKey) }}</div>
              <v-text-field
                :model-value="form.cornerRadius[corner.key]"
                type="number" min="0"
                variant="outlined" density="compact" rounded="lg" hide-details
                @update:model-value="(v) => setCorner(corner.key, v)"
              />
            </div>
          </div>
        </div>

        <!-- Hole (FLOOR only) -->
        <template v-if="zone.kind === 'FLOOR'">
          <div class="b2-hole-box">
            <v-checkbox v-model="form.hole.enabled" density="compact" hide-details color="#ff3131">
              <template #label>
                <span class="text-body-2 font-weight-medium">{{ t('b2CreateHoleLabel') }}</span>
              </template>
            </v-checkbox>

            <template v-if="form.hole.enabled">
              <v-divider class="my-3" style="opacity: .1;" />
              <div class="b2-dims b2-dims--2 mb-3">
                <div>
                  <div class="b2-sub-label">{{ t('b2HoleWidthM') }}</div>
                  <v-text-field v-model.number="form.hole.width" type="number" variant="outlined" density="compact" rounded="lg" hide-details />
                </div>
                <div>
                  <div class="b2-sub-label">{{ t('b2HoleLengthM') }}</div>
                  <v-text-field v-model.number="form.hole.length" type="number" variant="outlined" density="compact" rounded="lg" hide-details />
                </div>
                <div>
                  <div class="b2-sub-label">{{ t('b2XPositionRange') }}</div>
                  <v-text-field v-model.number="form.hole.x" type="number" step="0.1" min="0" max="1" variant="outlined" density="compact" rounded="lg" hide-details />
                </div>
                <div>
                  <div class="b2-sub-label">{{ t('b2YPositionRange') }}</div>
                  <v-text-field v-model.number="form.hole.y" type="number" step="0.1" min="0" max="1" variant="outlined" density="compact" rounded="lg" hide-details />
                </div>
              </div>

              <div class="d-flex align-center justify-space-between mb-2">
                <div class="b2-field-label mb-0">{{ t('b2HoleCornerRadiusLabel') }}</div>
                <v-btn icon size="x-small" variant="tonal" @click="linkedHoleCorners = !linkedHoleCorners">
                  <LinkIcon v-if="linkedHoleCorners"   key="hl-linked"   :size="13" />
                  <UnlinkIcon v-else                   key="hl-unlinked" :size="13" />
                </v-btn>
              </div>
              <v-text-field
                v-if="linkedHoleCorners"
                :model-value="form.holeRadius"
                :placeholder="t('b2AllCorners')"
                type="number" min="0"
                variant="outlined" density="compact" rounded="lg" hide-details
                @update:model-value="(v) => form.holeRadius = Math.max(0, Number(v) || 0)"
              />
              <div v-else class="b2-dims b2-dims--2">
                <div v-for="corner in CORNERS" :key="corner.key">
                  <div class="b2-sub-label">{{ t(corner.labelKey) }}</div>
                  <v-text-field
                    :model-value="form.holeCornerRadius[corner.key]"
                    type="number" min="0"
                    variant="outlined" density="compact" rounded="lg" hide-details
                    @update:model-value="(v) => setHoleCorner(corner.key, v)"
                  />
                </div>
              </div>
              <p class="text-caption text-medium-emphasis mt-2 mb-0" style="font-size: var(--fs-sm);">
                {{ t('b2DragHoleHint') }}
              </p>
            </template>
          </div>
        </template>

      </v-card-text>

      <!-- Footer — parité v1 -->
      <div class="b2-dlg-footer">
        <v-btn variant="text" size="small" @click="$emit('update:modelValue', false)">{{ t('cancel') }}</v-btn>
        <v-btn color="#ff3131" variant="flat" size="small" @click="save">{{ t('saveChanges') }}</v-btn>
      </div>

    </v-card>
  </v-dialog>
</template>

<script setup>
import { reactive, ref, inject, watch } from 'vue'
import { Edit2 as Edit2Icon, X as XIcon, Link as LinkIcon, Unlink as UnlinkIcon } from 'lucide-vue-next'
import { useI18n } from '@/i18n/useI18n'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  zone: { type: Object, default: null },
})
const emit = defineEmits(['update:modelValue'])

const { t } = useI18n()
const store = inject('builderStore')

const CORNERS = [
  { key: 'topLeft',     labelKey: 'b2CornerTopLeftPlain' },
  { key: 'topRight',    labelKey: 'b2CornerTopRightPlain' },
  { key: 'bottomLeft',  labelKey: 'b2CornerBottomLeftPlain' },
  { key: 'bottomRight', labelKey: 'b2CornerBottomRightPlain' },
]

const linkedCorners     = ref(true)
const linkedHoleCorners = ref(true)

const form = reactive({
  name: '', width: 0, length: 0, height: 0,
  cornerRadius: { topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 },
  hole: { enabled: false, x: 0.5, y: 0.5, width: 10, length: 10 },
  holeRadius: 0,
  holeCornerRadius: { topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 },
})

function setCorner(key, raw) {
  const value = Math.max(0, Number(raw) || 0)
  if (linkedCorners.value) {
    form.cornerRadius = { topLeft: value, topRight: value, bottomLeft: value, bottomRight: value }
  } else {
    form.cornerRadius = { ...form.cornerRadius, [key]: value }
  }
}

function setHoleCorner(key, raw) {
  const value = Math.max(0, Number(raw) || 0)
  form.holeCornerRadius = { ...form.holeCornerRadius, [key]: value }
}

watch(() => props.modelValue, (open) => {
  if (!open || !props.zone) return
  const z = props.zone
  form.name   = z.name
  form.width  = z.width
  form.length = z.length
  form.height = z.height

  const radius = z.geometry?.cornerRadius || {}
  form.cornerRadius = {
    topLeft:     radius.topLeft     || 0,
    topRight:    radius.topRight    || 0,
    bottomLeft:  radius.bottomLeft  || 0,
    bottomRight: radius.bottomRight || 0,
  }
  const allSame = form.cornerRadius.topLeft === form.cornerRadius.topRight
    && form.cornerRadius.topLeft === form.cornerRadius.bottomLeft
    && form.cornerRadius.topLeft === form.cornerRadius.bottomRight
  linkedCorners.value = allSame

  const hole = z.geometry?.hole
  form.hole = hole
    ? { enabled: !!hole.enabled, x: hole.x, y: hole.y, width: hole.width, length: hole.length }
    : { enabled: false, x: 0.5, y: 0.5, width: 10, length: 10 }

  const hr = hole?.cornerRadius || {}
  form.holeCornerRadius = {
    topLeft:     hr.topLeft     || 0,
    topRight:    hr.topRight    || 0,
    bottomLeft:  hr.bottomLeft  || 0,
    bottomRight: hr.bottomRight || 0,
  }
  form.holeRadius = hr.topLeft || 0
  const allHoleSame = form.holeCornerRadius.topLeft === form.holeCornerRadius.topRight
    && form.holeCornerRadius.topLeft === form.holeCornerRadius.bottomLeft
    && form.holeCornerRadius.topLeft === form.holeCornerRadius.bottomRight
  linkedHoleCorners.value = allHoleSame
})

function save() {
  const zone = props.zone
  const holeCornerRadius = linkedHoleCorners.value
    ? { topLeft: form.holeRadius, topRight: form.holeRadius, bottomLeft: form.holeRadius, bottomRight: form.holeRadius }
    : { ...form.holeCornerRadius }

  const patch = {
    name: form.name,
    width: form.width,
    length: form.length,
    ...(zone.kind === 'FLOOR' ? { height: form.height } : {}),
    geometry: {
      ...(zone.geometry || {}),
      cornerRadius: { ...form.cornerRadius },
      hole: { ...form.hole, cornerRadius: holeCornerRadius },
    },
  }
  const previous = {
    name: zone.name, width: zone.width, length: zone.length,
    ...(zone.kind === 'FLOOR' ? { height: zone.height } : {}),
    geometry: zone.geometry || null,
  }
  store.commitZonePatch(zone.id, patch, previous, `Zone ${zone.name}`)
  emit('update:modelValue', false)
}
</script>

<style scoped>
/* Header — parité v1 */
.b2-dlg-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 20px 16px;
  border-bottom: 1px solid rgba(0, 0, 0, .08);
}

.b2-dlg-icon {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: rgba(255, 49, 49, .1);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

/* Footer — parité v1 */
.b2-dlg-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 20px;
  border-top: 1px solid rgba(0, 0, 0, .08);
}

/* Labels de section — parité v1 */
.b2-field-label {
  font-size: .75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .06em;
  color: #6c757d;
  margin-bottom: 4px;
}

.b2-sub-label {
  font-size: .75rem;
  color: #6c757d;
  margin-bottom: 4px;
}

/* Grilles de dimensions */
.b2-dims {
  display: grid;
  gap: 8px;
}
.b2-dims--2 { grid-template-columns: 1fr 1fr; }
.b2-dims--3 { grid-template-columns: 1fr 1fr 1fr; }

/* Section trou — parité v1 */
.b2-hole-box {
  border-radius: 12px;
  padding: 12px;
  background: rgba(0, 0, 0, .03);
  border: 1px solid rgba(0, 0, 0, .07);
}
</style>
