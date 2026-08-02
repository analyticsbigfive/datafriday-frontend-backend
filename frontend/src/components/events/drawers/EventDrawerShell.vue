<template>
  <Teleport to="body">
    <v-navigation-drawer
      v-if="modelValue"
      :model-value="modelValue"
      location="right"
      temporary
      :persistent="persistent"
      :width="width"
      class="eds-drawer"
      :class="{ 'eds--dark': isDark }"
      @update:model-value="$emit('update:modelValue', $event)"
    >
      <header class="eds-header">
        <div class="eds-header__icon">
          <slot name="icon">
            <v-icon color="white">mdi-calendar</v-icon>
          </slot>
        </div>
        <div class="eds-header__text">
          <div class="eds-header__title">{{ title }}</div>
          <div v-if="subtitle" class="eds-header__sub">{{ subtitle }}</div>
        </div>
        <button
          type="button"
          class="eds-header__close"
          aria-label="Fermer"
          @click="$emit('update:modelValue', false)"
        >
          <v-icon size="18">mdi-close</v-icon>
        </button>
      </header>

      <div class="eds-body" :class="{ 'eds-body--flush': flush }">
        <slot />
      </div>

      <!-- BUG-273 : erreur de sauvegarde rendue ICI (hors zone scrollable .eds-body,
           toujours visible) plutôt qu'en haut du corps du formulaire — sur un drawer long,
           une erreur affichée en haut restait invisible tant que l'utilisateur n'avait pas
           remonté manuellement jusqu'en haut après avoir cliqué "Enregistrer" en bas. -->
      <div v-if="errorMessage" class="eds-error-bar">
        <AlertCircle :size="14" />
        <span>{{ errorMessage }}</span>
      </div>

      <footer v-if="$slots.footer" class="eds-footer">
        <slot name="footer" />
      </footer>
    </v-navigation-drawer>
  </Teleport>
</template>

<script setup>
import { AlertCircle } from 'lucide-vue-next';

defineProps({
  modelValue: { type: Boolean, default: false },
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
  width: { type: [Number, String], default: 560 },
  flush: { type: Boolean, default: false },
  // BUG-148 : forwardé au v-navigation-drawer sous-jacent — sans lui, migrer un drawer vers ce
  // shell réintroduirait BUG-134 (fermable en cliquant en dehors pendant une requête en cours).
  persistent: { type: Boolean, default: false },
  // BUG-148 : les 3 drawers du domaine Événements supportent tous le dark mode (palette
  // identique : fond #111827, bordures rgba(255,255,255,.08)) — sans ce prop, les migrer vers ce
  // shell aurait régressé leur support dark mode.
  isDark: { type: Boolean, default: false },
  // BUG-273 : message d'erreur affiché juste au-dessus du footer (toujours visible, même
  // corps du formulaire scrollé) — le consommateur passe son `formError`/`error` local ici
  // au lieu de le rendre lui-même en haut du slot par défaut.
  errorMessage: { type: String, default: '' },
})

defineEmits(['update:modelValue'])
</script>

<style scoped>
.eds-drawer {
  position: fixed !important;
  inset: 0 0 0 auto !important;
  width: min(560px, 100vw) !important;
  height: 100dvh !important;
  max-height: 100dvh !important;
  z-index: 2200 !important;
}

.eds-drawer:not(.v-navigation-drawer--active) {
  display: none !important;
}

/* Le scrim (backdrop cliquable qui ferme le drawer) porte le scopeId de ce
   composant. Téléporté sur <body>, il hérite d'un z-index de layout (~1005) qui
   passe SOUS les overlays plein écran (ex. EventPredict, z-index:1100) : le clic
   « à côté » atterrit sur l'overlay et le drawer devient impossible à fermer.
   On le force juste sous le drawer (2200) et au-dessus de tout overlay. */
.v-navigation-drawer__scrim {
  position: fixed !important;
  inset: 0 !important;
  z-index: 2199 !important;
}

.eds-drawer :deep(.v-navigation-drawer__content) {
  display: flex;
  flex-direction: column;
}

.eds-header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 20px 20px 18px;
  background: #ff3131;
  flex-shrink: 0;
}

.eds-header__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 13px;
  background: rgba(255, 255, 255, 0.18);
  flex-shrink: 0;
}

.eds-header__text {
  min-width: 0;
  flex: 1;
}

.eds-header__title {
  color: #fff;
  font-size: var(--fs-lg);
  font-weight: 700;
}

.eds-header__sub {
  margin-top: 2px;
  overflow: hidden;
  color: rgba(255, 255, 255, 0.75);
  font-size: var(--fs-sm);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.eds-header__close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.15);
  color: rgba(255, 255, 255, 0.85);
  cursor: pointer;
  transition: background 0.2s;
}

.eds-header__close:hover {
  background: rgba(255, 255, 255, 0.25);
}

.eds-header__close:focus-visible {
  outline: 2px solid #fff;
  outline-offset: 2px;
}

.eds-body {
  min-height: 0;
  padding: 24px 22px 16px;
  overflow-y: auto;
  background: #f9fafb;
  flex: 1;
}

.eds-body--flush {
  padding: 0;
}

.eds-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 22px;
  border-top: 1px solid var(--fb-border, #e5e7eb);
  background: var(--fb-surface, #fff);
  flex-shrink: 0;
}

/* BUG-273 : barre d'erreur fixe, entre le corps scrollable et le footer — jamais
   scrollée hors champ, toujours juste au-dessus des boutons d'action. */
.eds-error-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 22px;
  background: #fef2f2;
  border-top: 1px solid #fecaca;
  color: #991b1b;
  font-size: var(--fs-base, 14px);
  flex-shrink: 0;
}

.eds-error-bar span { min-width: 0; }

/* Dark mode (BUG-148) */
.eds--dark :deep(.v-navigation-drawer__content) { background: #111827; }
.eds--dark .eds-body { background: #111827; }
.eds--dark .eds-error-bar {
  background: rgba(255, 49, 49, .12);
  border-top-color: rgba(255, 49, 49, .3);
  color: #fca5a5;
}
.eds--dark .eds-footer {
  background: #1f2937;
  border-top-color: #374151;
}

@media (max-width: 640px) {
  .eds-drawer {
    width: 100vw !important;
  }

  .eds-header {
    padding: 16px;
  }

  .eds-body {
    padding: 18px 16px;
  }

  .eds-error-bar {
    padding: 10px 16px;
  }

  .eds-footer {
    padding: 14px 16px;
  }
}
</style>
