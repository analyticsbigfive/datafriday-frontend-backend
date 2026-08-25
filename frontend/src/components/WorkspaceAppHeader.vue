<template>
  <v-app-bar
    flat
    density="compact"
    height="64"
    :class="['workspace-app-bar px-2 px-sm-3', { 'workspace-app-bar--scrolled': isScrolled, 'workspace-app-bar--dark': isDark }]"
  >
    <!-- Gauche : navigation principale + espace + accueil. -->
    <v-btn
      icon
      variant="text"
      class="wsh-nav-trigger"
      aria-label="Déployer / replier le menu"
      title="Déployer / replier le menu"
      @click="openMainNavigation"
    >
      <ChevronRight :size="20" />
    </v-btn>
    <!-- Accueil AVANT le sélecteur d'espace (icône mdi pleine, parité EP). -->
    <v-btn
      v-if="showHome"
      icon
      variant="text"
      class="ml-1"
      aria-label="Accueil"
      title="Accueil"
      @click="goHome"
    >
      <v-icon size="20">mdi-home</v-icon>
    </v-btn>
    <WorkspaceSpaceSwitcher v-if="showSpaceSwitcher" :space-name="spaceName" />
    <span v-if="section" class="wsh-section d-none d-sm-inline">· {{ section }}</span>

    <v-spacer />

    <!-- Centre : bande KPI (desktop) -->
    <div v-if="kpis.length" class="d-none d-lg-flex align-center wsh-kpi-row">
      <div
        v-for="kpi in kpis"
        :key="kpi.label"
        class="wsh-kpi-cell"
        :class="{ 'wsh-kpi-cell--clickable': kpi.kind }"
        :style="kpiVars(kpi.color)"
        role="button"
        :tabindex="kpi.kind ? 0 : -1"
        @click="kpi.kind && $emit('kpi-click', kpi.kind)"
        @keydown.enter="kpi.kind && $emit('kpi-click', kpi.kind)"
      >
        <div class="wsh-kpi-label">{{ kpi.label }}</div>
        <div class="wsh-kpi-value">
          {{ kpi.value }}
          <span
            v-if="kpi.variation != null"
            class="wsh-kpi-var"
            :class="{ 'wsh-kpi-var--bad': kpiVarBad(kpi) }"
          >
            {{ kpi.variation >= 0 ? '▲' : '▼' }}{{ Math.abs(kpi.variation).toFixed(1) }}%
          </span>
        </div>
      </div>
    </div>

    <v-spacer />

    <!-- Droite : notifications + réglages + profil — cluster à PARITÉ .ep-header
         (cloche partagée branchée, boutons size=small, pas de séparateur). -->
    <NotificationBell />
    <v-btn icon variant="text" size="small" class="mr-1" aria-label="Réglages" @click="openSettings">
      <Settings :size="20" />
    </v-btn>

    <!-- Profil utilisateur : composant partagé, activateur compact (parité EP). -->
    <WorkspaceUserMenu compact />

    <!-- 2e ligne optionnelle (ex : barre de filtres/comparaison d'Analyse). -->
    <template v-if="$slots.extension" #extension>
      <div class="wsh-extension">
        <slot name="extension" />
      </div>
    </template>
  </v-app-bar>
</template>

<script setup>
// Header « espace de travail » réutilisable, calqué sur AnalyseAppHeader.
// Rendu DIRECTEMENT dans le <v-app> de chaque vue (Inventaire / Réarmement /
// Predict) — pas de teleport. Les KPIs sont passés en prop (pas téléportés),
// ce qui évite le crash __vnode rencontré avec l'approche teleport.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useTheme } from 'vuetify'
import { ChevronRight, Settings } from 'lucide-vue-next'
import WorkspaceSpaceSwitcher from '@/components/WorkspaceSpaceSwitcher.vue'
import WorkspaceUserMenu from '@/components/WorkspaceUserMenu.vue'
import NotificationBell from '@/components/NotificationBell.vue'

const props = defineProps({
  spaceName: { type: String, default: '' },
  section: { type: String, default: '' },
  // [{ label, value, color }] — color = nom Vuetify/clé connue (success, blue…).
  kpis: { type: Array, default: () => [] },
  // Affiche un bouton « Accueil » (→ liste des espaces) après le hamburger.
  // Off par défaut : DashboardView (/spaces) utilise aussi ce header et n'en a pas besoin.
  showHome: { type: Boolean, default: false },
  // Affiche le sélecteur d'espace dans le header. Off pour les vues qui le
  // portent ailleurs (ex. Logistic : dans le bandeau rouge).
  showSpaceSwitcher: { type: Boolean, default: true },
})

defineEmits(['kpi-click'])

const router = useRouter()

// Dark mode autonome : quand le thème Vuetify est sombre, on override le chrome
// blanc translucide de la barre + les pastilles KPI (fond blanc en clair).
const theme = useTheme()
const isDark = computed(() => !!theme.global.current.value.dark)

function openMainNavigation() {
  window.dispatchEvent(new CustomEvent('datafriday:open-main-navigation'))
}

function goHome() {
  router.push({ name: 'spaces' })
}

function openSettings() {
  // Pont vers DashboardView : son drawer Settings reste monté même quand la
  // barre globale est masquée sur cette route.
  window.dispatchEvent(new CustomEvent('datafriday:open-settings'))
}
// ---- Couleurs KPI → variables CSS (bordure + fond colorés) ----
const KPI_RGB = {
  success: '34, 197, 94', green: '34, 197, 94',
  blue: '59, 130, 246', primary: '255, 49, 49',
  purple: '168, 85, 247', warning: '245, 158, 11',
  orange: '249, 115, 22', grey: '100, 116, 139', gray: '100, 116, 139',
  red: '239, 68, 68', teal: '20, 184, 166',
}
function hexToRgb(hex) {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = parseInt(full, 16)
  if (Number.isNaN(n)) return null
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`
}
function kpiVars(color) {
  // Accepte une clé connue (success, blue…) OU une couleur hex (#10B981).
  const rgb = KPI_RGB[color]
    || (typeof color === 'string' && color.startsWith('#') ? hexToRgb(color) : null)
    || '100, 116, 139'
  return { '--kpi-color': `rgb(${rgb})`, '--kpi-rgb': rgb }
}

// Variation « mauvaise » (rouge) : baisse sur une métrique positive, ou hausse
// sur une métrique inversée (coût). Sinon vert.
function kpiVarBad(kpi) {
  const up = kpi.variation >= 0
  return kpi.invert ? up : !up
}

// ---- Élévation au scroll ----
const isScrolled = ref(false)
// Lighthouse 24/08 (BUG-363-01) : 753 ms de reflow forcé au boot — la lecture
// géométrique (scrollTop) partait de façon SYNCHRONE au montage, en plein milieu
// des invalidations de style du premier rendu, et chaque événement scroll refaisait
// un querySelector. Désormais : lecture dans un requestAnimationFrame (après le
// layout du frame), élément .v-main mis en cache, événements scroll coalescés par
// frame (un seul read par frame quelle que soit la rafale).
let scrollHost = null
let stickyRafId = 0
function readSticky() {
  stickyRafId = 0
  if (!scrollHost || !scrollHost.isConnected) scrollHost = document.querySelector('.v-main')
  const y = window.scrollY || scrollHost?.scrollTop || 0
  isScrolled.value = y > 8
}
function updateSticky() {
  if (!stickyRafId) stickyRafId = requestAnimationFrame(readSticky)
}
onMounted(() => {
  updateSticky()
  window.addEventListener('scroll', updateSticky, { passive: true, capture: true })
})
onBeforeUnmount(() => {
  window.removeEventListener('scroll', updateSticky, { capture: true })
  if (stickyRafId) cancelAnimationFrame(stickyRafId)
})
</script>

<style scoped>
.workspace-app-bar {
  /* Chrome IDENTIQUE au header EventPredict (.ep-header) : blanc translucide
     + blur, hairline basse, ombre 1px. */
  border-bottom: 1px solid #e2e8f0 !important;
  background: rgba(255, 255, 255, 0.94) !important;
  backdrop-filter: blur(10px);
  box-shadow: 0 1px 0 rgba(15, 23, 42, 0.03) !important;
  transition: box-shadow 160ms ease, border-color 160ms ease;
  /* HAUTEUR à parité STRICTE avec .ep-header (64px pile, box-border). Le
     density="compact" du v-app-bar rabotait la barre sous 64 → on fixe le
     contenu du toolbar à 64px pour un rendu identique à EventPredict. */
  height: 64px !important;
}
.workspace-app-bar :deep(.v-toolbar__content) {
  height: 64px !important;
}
.workspace-app-bar--scrolled {
  border-bottom-color: rgba(15, 23, 42, 0.12) !important;
}
.wsh-nav-trigger {
  border-radius: 10px !important;
}
.wsh-nav-trigger:hover {
  background: rgba(255, 49, 49, 0.08);
  color: #ff3131;
}
.wsh-section {
  color: rgba(var(--v-theme-on-surface), 0.55);
  font-weight: 600;
  font-size: 0.9rem;
  margin-left: 2px;
}
.wsh-kpi-row {
  gap: 8px;
  padding: 4px 8px;
}
/* Cellule KPI au format carte (parité Analyse / EventPredict) : fond BLANC,
   border neutre + rail latéral 3px coloré (la couleur migre de la bordure vers
   le rail), valeur en sombre. Compact (strip d'en-tête). */
.wsh-kpi-cell {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 78px;
  padding: 5px 10px 5px 11px;
  border-radius: 9px;
  border: 1px solid #e2e8f0;
  background: #ffffff;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  position: relative;
  overflow: hidden;
}
.wsh-kpi-cell::before {
  content: "";
  position: absolute;
  inset: 0 auto 0 0;
  width: 3px;
  background: var(--kpi-color, #64748b);
}
.wsh-kpi-label {
  color: #64748b;
  font-size: 8px;
  font-weight: 700;
  line-height: 1.1;
  margin-bottom: 1px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  white-space: nowrap;
}
.wsh-kpi-value {
  font-size: 12px;
  font-weight: 800;
  line-height: 1.15;
  letter-spacing: -0.2px;
  color: #0f172a;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.wsh-kpi-var {
  margin-left: 4px;
  font-size: 9.5px;
  font-weight: 700;
  color: #16a34a;
  letter-spacing: -0.1px;
}
.wsh-kpi-var--bad { color: #ff3131; }
.wsh-kpi-cell--clickable { cursor: pointer; transition: transform 0.12s ease, box-shadow 0.12s ease; }
.wsh-kpi-cell--clickable:hover { transform: translateY(-1px); box-shadow: 0 2px 8px rgba(var(--kpi-rgb, 0, 0, 0), 0.25); }
/* 2e ligne (extension) : pleine largeur sous la ligne principale. */
.wsh-extension {
  width: 100%;
  display: flex;
  align-items: center;
  min-height: 40px;
  padding: 0 4px 6px;
}
/* Styles profil utilisateur : déplacés dans WorkspaceUserMenu.vue. */

/* ── Dark mode ── (override du chrome blanc translucide + pastilles KPI) */
.workspace-app-bar--dark {
  background: rgba(15, 23, 42, 0.94) !important;
  border-bottom-color: rgba(255, 255, 255, 0.08) !important;
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.35) !important;
}
.workspace-app-bar--dark.workspace-app-bar--scrolled {
  border-bottom-color: rgba(255, 255, 255, 0.14) !important;
}
.workspace-app-bar--dark .wsh-kpi-cell {
  background: #1e293b;
  border-color: rgba(255, 255, 255, 0.10);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
}
.workspace-app-bar--dark .wsh-kpi-label { color: #94a3b8; }
.workspace-app-bar--dark .wsh-kpi-value { color: #f9fafb; }
.workspace-app-bar--dark .wsh-kpi-var { color: #4ade80; }
.workspace-app-bar--dark .wsh-kpi-var--bad { color: #ff6b6b; }
</style>
