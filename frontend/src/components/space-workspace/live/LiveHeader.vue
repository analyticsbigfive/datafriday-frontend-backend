<template>
  <!-- Bandeau rouge « espace de travail » (parité Restock/Logistique .sr-header/.lg-header).
       Chantier 379 : composant DÉDIÉ Live, aucun import d'AnalyseView — on reproduit
       seulement le look du design system workspace, sans coupler la logique. -->
  <header class="lh-band" :class="{ 'lh-band--dark': isDark }">
    <div class="lh-band__inner">
      <div class="lh-band__left">
        <!-- ☰ nav entre outils (parité v1 Live) : ouvre WorkspaceMobileToolDrawer côté vue. -->
        <button
          type="button"
          class="lh-tools-trigger"
          :aria-label="t('srToolsLabel')"
          @click="$emit('open-tools')"
        >
          <v-icon size="22">mdi-menu</v-icon>
        </button>
        <div class="lh-band__text">
          <h1 class="lh-band__title">
            <span v-if="spaceName" class="lh-band__title-space">{{ spaceName }}</span>
            <span v-if="spaceName" class="lh-band__title-sep"> : </span>{{ t('anToolLive') }}
          </h1>
          <p class="lh-band__subtitle">{{ eventName || t('liveHeaderNoEvent') }}</p>
        </div>
        <span v-if="isLive" class="lh-badge">
          <span class="lh-pulse"></span>
          {{ t('anToolLive') }}
        </span>
      </div>
      <div class="lh-band__right">
        <!-- ✏️ Voir / modifier l'event live (parité v1 Live) : ouvre EventFormDrawer côté vue. -->
        <button
          v-if="canEdit"
          type="button"
          class="lh-icon-btn"
          :aria-label="t('anLiveEditEvent')"
          :title="t('anLiveEditEvent')"
          @click="$emit('edit-event')"
        >
          <v-icon size="18">mdi-pencil-outline</v-icon>
        </button>
        <span v-if="isLive && sinceLabel" class="lh-since">
          {{ t('liveHeaderSince') }} {{ sinceLabel }}
        </span>
      </div>
    </div>
  </header>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from '@/i18n/useI18n'

const { t } = useI18n()

const props = defineProps({
  spaceName: { type: String, default: '' },
  isLive: { type: Boolean, default: false },
  eventName: { type: String, default: '' },
  since: { type: String, default: null },
  isDark: { type: Boolean, default: false },
  // Affiche l'icône ✏️ d'édition d'event (un event live est résolu).
  canEdit: { type: Boolean, default: false },
})

defineEmits(['open-tools', 'edit-event'])

const sinceLabel = computed(() => {
  if (!props.since) return ''
  const mins = Math.max(0, Math.round((Date.now() - new Date(props.since).getTime()) / 60000))
  return mins < 60 ? `${mins} min` : `${Math.round(mins / 60)} h`
})
</script>

<style scoped>
/* ── Bandeau rouge (mêmes tokens visuels que .sr-header/.lg-header) ── */
.lh-band {
  background: #ff3131;
  border-radius: 18px;
  box-shadow: 0 8px 24px rgba(255, 49, 49, 0.28);
  margin-bottom: 16px;
  /* Épinglé au scroll sous le header blanc (parité Logistique .lg-header). */
  position: sticky;
  top: 0;
  z-index: 20;
}
.lh-band__inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 22px;
  flex-wrap: wrap;
}
.lh-band__left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  flex: 1 1 auto;
}
/* ☰ nav outils — pastille blanche translucide cliquable (parité pastilles des
   autres bandeaux). */
.lh-tools-trigger {
  width: 44px;
  height: 44px;
  border: 0;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: #fff;
  cursor: pointer;
  transition: background 0.15s ease, transform 0.15s ease;
}
.lh-tools-trigger:hover { background: rgba(255, 255, 255, 0.32); }
.lh-tools-trigger:active { transform: scale(0.94); }
.lh-tools-trigger:focus-visible { outline: 2px solid rgba(255, 255, 255, 0.85); outline-offset: 2px; }
.lh-band__text { min-width: 0; }
.lh-band__title {
  margin: 0;
  font-size: 20px;
  font-weight: 800;
  color: #fff;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.lh-band__title-sep { opacity: 0.7; }
.lh-band__subtitle {
  margin: 3px 0 0;
  font-size: 12.5px;
  color: rgba(255, 255, 255, 0.82);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* Badge LIVE pulsant (repris de l'ancien LiveHeader, adapté au fond rouge :
   pastille blanche translucide au lieu de rouge sur blanc). */
.lh-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: rgba(255, 255, 255, 0.22);
  color: #fff;
  font-size: var(--fs-xs, 11px);
  font-weight: var(--fw-bold, 700);
  letter-spacing: 0.4px;
  padding: 4px 10px;
  border-radius: 999px;
  flex-shrink: 0;
}
.lh-pulse {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #fff;
  animation: lh-pulse 1.4s ease-in-out infinite;
}
@keyframes lh-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
@media (prefers-reduced-motion: reduce) { .lh-pulse { animation: none; } }
.lh-band__right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
/* ✏️ bouton-icône blanc translucide sur le rouge. */
.lh-icon-btn {
  width: 36px;
  height: 36px;
  border: 0;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.16);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: #fff;
  cursor: pointer;
  transition: background 0.15s ease, transform 0.15s ease;
}
.lh-icon-btn:hover { background: rgba(255, 255, 255, 0.3); }
.lh-icon-btn:active { transform: scale(0.94); }
.lh-icon-btn:focus-visible { outline: 2px solid rgba(255, 255, 255, 0.85); outline-offset: 2px; }
.lh-since {
  font-size: var(--fs-base, 13px);
  color: rgba(255, 255, 255, 0.9);
  flex-shrink: 0;
}

/* Dark mode : le bandeau rouge reste identique dans les deux thèmes (parité
   Restock, cf. commentaire « #ff3131 identique dans les deux thèmes »). */

/* ── Mobile : bandeau pleine largeur, coins carrés, épinglé (à l'image des
     autres sections). Les -12px annulent le padding de .lv-wrap (12px mobile). ── */
@media (max-width: 600px) {
  .lh-band {
    margin: -12px -12px 16px;
    border-radius: 0;
    box-shadow: none;
  }
  .lh-band__inner { padding: 12px 16px; }
  .lh-band__title { font-size: 17px; }
}
</style>
