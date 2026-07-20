<template>
  <v-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    max-width="520"
  >
    <div class="pdd-card">
      <!-- Head -->
      <div class="pdd-card__head">
        <div class="pdd-card__icon-wrap">
          <Trash2 :size="20" color="#ff3131" />
        </div>
        <div style="flex: 1; min-width: 0;">
          <div class="pdd-card__title">{{ title }}</div>
          <div v-if="subtitle" class="pdd-card__sub">{{ subtitle }}</div>
        </div>
        <button class="pdd-card__close" @click="$emit('update:modelValue', false)">
          <X :size="18" />
        </button>
      </div>

      <!-- Body -->
      <div class="pdd-card__body">
        <v-alert v-if="error" type="error" variant="tonal" density="compact" rounded="lg" class="mb-4">
          {{ error }}
          <div v-if="actionLink" class="pdd-card__action-link">
            <router-link :to="actionLink.to" @click="$emit('update:modelValue', false)">
              {{ actionLink.label }}
            </router-link>
          </div>
        </v-alert>
        <p class="pdd-card__msg">
          {{ message }} <strong>{{ itemName }}</strong>&nbsp;?
        </p>
      </div>

      <!-- Footer -->
      <div class="pdd-card__foot">
        <button class="pdd-fbtn pdd-fbtn--cancel" @click="$emit('update:modelValue', false)">
          {{ cancelLabel }}
        </button>
        <button
          class="pdd-fbtn pdd-fbtn--danger"
          :disabled="loading"
          @click="$emit('confirm')"
        >
          <Trash2 :size="15" />
          {{ confirmLabel }}
        </button>
      </div>
    </div>
  </v-dialog>
</template>

<script>
import { Trash2, X, AlertCircle } from 'lucide-vue-next';

export default {
  name: 'ProductDeleteDialog',
  components: { Trash2, X, AlertCircle },
  props: {
    modelValue: { type: Boolean, default: false },
    itemName: { type: String, default: '' },
    loading: { type: Boolean, default: false },
    error: { type: String, default: '' },
    // { label: string, to: RouteLocation } — rendu comme lien cliquable sous le message d'erreur
    // quand la suppression est bloquée par des lignes dépendantes (ex. "Voir les N menu items
    // concernés" → /menu-items?type=<name> déjà filtré). Évite d'obliger l'utilisateur à chercher
    // à la main la bonne ligne parmi potentiellement des milliers.
    actionLink: { type: Object, default: null },
    isDark: { type: Boolean, default: false },
    title: { type: String, default: 'Supprimer' },
    subtitle: { type: String, default: '' },
    message: { type: String, default: 'Supprimer' },
    cancelLabel: { type: String, default: 'Annuler' },
    confirmLabel: { type: String, default: 'Supprimer' },
  },
  emits: ['update:modelValue', 'confirm'],
};
</script>

<style scoped>
/* ── Card ── */
.pdd-card {
  background: #fff;
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, .15);
}

.pdd-card__head {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 22px 22px 16px;
}

.pdd-card__icon-wrap {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  background: #fef2f2;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.pdd-card__title {
  font-size: 16px;
  font-weight: 700;
  color: #111827;
}

.pdd-card__sub {
  font-size: 13px;
  color: #6b7280;
  margin-top: 2px;
}

.pdd-card__close {
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  color: #9ca3af;
  border-radius: 8px;
  display: flex;
  align-items: center;
  transition: color .15s, background .15s;
  flex-shrink: 0;
}
.pdd-card__close:hover {
  color: #374151;
  background: #f3f4f6;
}

.pdd-card__body {
  padding: 0 22px 20px;
}

.pdd-card__action-link {
  margin-top: 6px;
}
.pdd-card__action-link a {
  color: inherit;
  font-weight: 600;
  text-decoration: underline;
}

.pdd-card__msg {
  font-size: 14px;
  color: #374151;
  margin: 0;
}

.pdd-card__foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 22px 22px;
  border-top: 1px solid #f3f4f6;
}

/* ── Buttons ── */
.pdd-fbtn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 20px;
  height: 40px;
  border-radius: 50px;
  font-size: 13.5px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: all .2s;
}
.pdd-fbtn--cancel {
  background: #f3f4f6;
  color: #374151;
}
.pdd-fbtn--cancel:hover {
  background: #e5e7eb;
}
.pdd-fbtn--danger {
  background: #ff3131;
  color: #fff;
}
.pdd-fbtn--danger:hover {
  box-shadow: 0 4px 12px rgba(255, 49, 49, .35);
}
.pdd-fbtn:disabled {
  opacity: .5;
  cursor: not-allowed;
}
</style>
