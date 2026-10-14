<template>
  <aside
    ref="rootRef"
    class="cmp-drawer"
    :class="{ 'cmp-drawer--mobile': mobile, 'cmp-drawer--away': away }"
    :role="mobile ? 'dialog' : 'complementary'"
    :aria-modal="mobile ? 'true' : undefined"
    :aria-hidden="away ? 'true' : undefined"
    :inert="away || undefined"
    :aria-label="t('anCmpDrawerLabel')"
    tabindex="-1"
    @keydown.esc.stop="emit('close')"
    @keydown.tab="onTab"
  >
    <header class="cmp-drawer__head">
      <button
        type="button"
        class="cmp-drawer__btn cmp-drawer__btn--close"
        :aria-label="t('anCmpClose')"
        :title="t('anCmpClose')"
        @click="emit('close')"
      >
        <v-icon size="18">mdi-close</v-icon>
      </button>
      <!-- Vue rapport : la bande des puces prend la place du titre et le bouton d'extension
           passe dans le bandeau rouge « Comparaison » (pas de doublon). -->
      <ComparisonMobileSwitch
        v-if="mobile"
        class="cmp-drawer__switch"
        :model-value="mobileView"
        :shown="!away"
        @update:model-value="emit('update:mobileView', $event)"
      />
      <slot v-if="reportMode && !mobile" name="head"></slot>
      <h2 v-if="!reportMode && !mobile" class="cmp-drawer__title">{{ t('anCmpTitle') }}</h2>
      <span v-if="!reportMode && !mobile" class="cmp-drawer__spacer"></span>
      <button
        v-if="!reportMode && !mobile"
        type="button"
        class="cmp-drawer__btn cmp-drawer__btn--edge"
        :aria-label="expandLabel"
        :title="expandLabel"
        :aria-pressed="layout === 'drawer'"
        @click="emit('toggle-expand')"
      >
        <v-icon size="18">{{ layout === 'drawer' ? 'mdi-chevron-double-right' : 'mdi-chevron-double-left' }}</v-icon>
      </button>
    </header>
    <!-- Mobile : la bande des puces passe sous le sélecteur (qui reste seul collant). -->
    <div v-if="mobile && reportMode" class="cmp-drawer__headrow"><slot name="head"></slot></div>

    <div class="cmp-drawer__body">
      <!-- Contenu des étapes 5b-2 (formulaire) et 5b-3 (rapport). -->
      <slot>
        <p class="cmp-drawer__placeholder">{{ t('anCmpPlaceholder') }}</p>
      </slot>
    </div>
  </aside>
</template>

<script setup>
// Conteneur de la 4e colonne de la grille Analyse (drawer Comparaison, desktop).
// Ne porte aucune logique métier : en-tête (fermer, titre, élargir), slot de contenu,
// focus (pris à l'ouverture, rendu à l'élément qui l'avait à la fermeture) et Échap.
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import ComparisonMobileSwitch from './ComparisonMobileSwitch.vue'

const props = defineProps({
  // Disposition courante de la grille ('split' | 'drawer' | 'main'), pour l'icône du bouton.
  layout: { type: String, default: 'split' },
  // true quand le rapport (ou son chargement) est affiché : en-tête = fermer + slot `head`.
  reportMode: { type: Boolean, default: false },
  // Mobile (<= 900 px) : plein écran en overlay, sélecteur Principal | Comparaison, pas d'extension.
  mobile: { type: Boolean, default: false },
  // Écran mobile affiché ('main' | 'cmp'). En 'main' l'overlay est glissé hors écran mais reste
  // monté : le rapport et son état sont conservés.
  mobileView: { type: String, default: 'cmp' },
})
const emit = defineEmits(['close', 'toggle-expand', 'update:mobileView'])

const { t } = useI18n()
const rootRef = ref(null)
let previouslyFocused = null

// Mobile et écran principal affiché : le drawer est hors écran (ni visible ni focusable).
const away = computed(() => props.mobile && props.mobileView !== 'cmp')

// Piège de focus simple (mobile, drawer affiché) : Tab / Maj+Tab bouclent dans le drawer.
function onTab(event) {
  if (!props.mobile || away.value) return
  const root = rootRef.value
  if (!root) return
  const nodes = Array.from(
    root.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')
  )
  if (!nodes.length) return
  const first = nodes[0]
  const last = nodes[nodes.length - 1]
  const active = document.activeElement
  if (event.shiftKey && (active === first || active === root)) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && active === last) {
    event.preventDefault()
    first.focus()
  }
}

const expandLabel = computed(() =>
  props.layout === 'drawer' ? t('anCmpRestoreWidths') : t('anCmpExpandDrawer')
)

onMounted(() => {
  previouslyFocused = document.activeElement
  nextTick(() => {
    const el = rootRef.value
    if (el && typeof el.focus === 'function') el.focus({ preventScroll: true })
  })
})

onBeforeUnmount(() => {
  const el = previouslyFocused
  previouslyFocused = null
  if (el && typeof el.focus === 'function' && document.contains(el)) {
    el.focus({ preventScroll: true })
  }
})
</script>

<style scoped>
.cmp-drawer {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  max-height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: thin;
  padding-left: 18px;
  border-left: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  outline: none;
  animation: cmp-drawer-in 0.2s ease 0.08s both;
  /* Jetons du rapport de comparaison (maquette), hérités par tous les composants du drawer. */
  --cr-surface: rgb(var(--v-theme-surface));
  --cr-surface2: rgba(var(--v-theme-on-surface), 0.05);
  --cr-line: rgba(var(--v-border-color), var(--v-border-opacity));
  --cr-fg: rgb(var(--v-theme-on-surface));
  --cr-muted: rgba(var(--v-theme-on-surface), 0.62);
  --cr-cmp: #7c3aed;
  --cr-cmp-bg: #f3edff;
  --cr-cmp-line: #d8c8fb;
  --cr-warn: #8a5a00;
  --cr-warn-bg: #fff7e6;
  --cr-band: #ff3131;
}
.v-theme--dataFridayDark .cmp-drawer {
  --cr-cmp: #b79bff;
  --cr-cmp-bg: rgba(183, 155, 255, 0.14);
  --cr-cmp-line: rgba(183, 155, 255, 0.35);
  --cr-warn: #f2c46b;
  --cr-warn-bg: #33270f;
}
@keyframes cmp-drawer-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
.cmp-drawer__head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  min-width: 0;
}
.cmp-drawer__title {
  margin: 0;
  font-size: var(--fs-lg, 18px);
  font-weight: 500;
}
.cmp-drawer__spacer { flex: 1; }
.cmp-drawer__btn {
  display: inline-grid;
  place-items: center;
  flex: none;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  background: rgb(var(--v-theme-surface));
  color: inherit;
  cursor: pointer;
  transition: background 0.12s;
}
.cmp-drawer__btn:hover { background: rgba(var(--v-theme-on-surface), 0.06); }
.cmp-drawer__btn:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
}
.cmp-drawer__body { flex: 1; min-height: 0; }
.cmp-drawer__placeholder {
  margin: 0;
  font-size: var(--fs-sm, 13px);
  color: rgba(var(--v-theme-on-surface), 0.55);
}
/* Mobile : overlay plein écran (z-index des overlays d'Analyse), glissé depuis la droite. */
.cmp-drawer--mobile {
  position: fixed;
  inset: 0;
  z-index: 3000;
  width: 100%;
  max-height: none;
  box-sizing: border-box;
  overscroll-behavior: contain;
  padding: 0 12px 16px;
  border-left: 0;
  background: rgb(var(--v-theme-background));
  transform: translateX(0);
  transition: transform 0.25s ease;
  animation: cmp-drawer-slide 0.25s ease backwards;
}
.cmp-drawer--mobile.cmp-drawer--away {
  transform: translateX(100%);
  visibility: hidden;
  pointer-events: none;
  transition: transform 0.25s ease, visibility 0s linear 0.25s;
}
@keyframes cmp-drawer-slide {
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
}
.cmp-drawer--mobile .cmp-drawer__head {
  position: sticky;
  top: 0;
  z-index: 6;
  margin-bottom: 8px;
  padding: 8px 0;
  background: rgb(var(--v-theme-background));
}
.cmp-drawer--mobile .cmp-drawer__btn { width: 44px; height: 44px; }
.cmp-drawer__switch { flex: 1 1 0; }
.cmp-drawer__headrow { min-width: 0; margin-bottom: 10px; }
/* Les 5 widgets : défilement horizontal à ~62 % de largeur (maquette .k5). */
.cmp-drawer--mobile :deep(.fmg-row) { flex-wrap: nowrap; overflow-x: auto; scroll-snap-type: x proximity; }
.cmp-drawer--mobile :deep(.fmg-row > .v-col) {
  flex: 0 0 62% !important;
  width: 62%;
  max-width: 260px;
  scroll-snap-align: start;
}
/* Tableaux : leur conteneur défile, jamais la page. */
.cmp-drawer--mobile :deep(.v-table__wrapper) { overflow-x: auto; }
@media (prefers-reduced-motion: reduce) {
  .cmp-drawer { animation: none; }
  .cmp-drawer--mobile,
  .cmp-drawer--mobile.cmp-drawer--away { transition: none; animation: none; }
  .cmp-drawer__btn { transition: none; }
}
</style>
