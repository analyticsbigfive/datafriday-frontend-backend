<template>
  <section class="sbp" :class="{ 'sbp--open': open }">
    <button type="button" class="sbp-head" :aria-expanded="open" @click="toggle">
      <v-icon size="14" class="sbp-chevron">mdi-chevron-right</v-icon>
      <span class="sbp-title"><slot name="icon" />{{ title }}</span>
      <span v-if="$slots.meta" class="sbp-meta" @click.stop><slot name="meta" /></span>
    </button>
    <div v-show="open" class="sbp-body">
      <slot />
    </div>
  </section>
</template>

<script>
/**
 * Carte de section repliable, partagée par TOUTES les sections latérales de l'écran
 * Logistique (Summary, Filters, Reconciliation, Pertes, Restock alerts, Tasks).
 * Retour utilisateur 08/2026 : chaque section doit s'ouvrir/se fermer indépendamment,
 * jamais de hauteur imposée par la présence d'une section voisine (ancien hack
 * `.lg-agg { max-height: 44% }`, retiré). L'état ouvert/fermé persiste par section
 * via localStorage (storageKey), pour respecter le choix de l'utilisateur d'une
 * session à l'autre.
 */
export default {
  name: 'SidebarPanel',
  props: {
    title: { type: String, required: true },
    defaultOpen: { type: Boolean, default: true },
    /** Clé unique pour mémoriser l'état ouvert/fermé (ex. "lg-panel-summary").
     *  Vide = pas de mémorisation (état repart de defaultOpen à chaque montage). */
    storageKey: { type: String, default: '' },
  },
  data() {
    return { open: this.readStoredOpen() ?? this.defaultOpen }
  },
  methods: {
    readStoredOpen() {
      if (!this.storageKey) return null
      try {
        const raw = window.localStorage.getItem(`sidebarPanel:${this.storageKey}`)
        return raw === null ? null : raw === '1'
      } catch {
        return null
      }
    },
    toggle() {
      this.open = !this.open
      if (!this.storageKey) return
      try {
        window.localStorage.setItem(`sidebarPanel:${this.storageKey}`, this.open ? '1' : '0')
      } catch {
        // Stockage indisponible (navigation privée, quota) : perte silencieuse acceptable,
        // seule la persistance entre sessions est perdue, pas le fonctionnement du toggle.
      }
    },
  },
}
</script>

<style scoped>
.sbp {
  background: var(--lg-surface, #ffffff);
  border: 1px solid var(--lg-border, #e5e7eb);
  border-radius: var(--fb-radius-panel, 12px);
  overflow: hidden;
  flex-shrink: 0;
}
.sbp-head {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 12px;
  border: none;
  background: transparent;
  cursor: pointer;
  font: inherit;
  color: inherit;
  text-align: left;
}
.sbp-head:hover { background: rgba(0, 0, 0, 0.03); }
.sbp-chevron { transition: transform 0.15s ease; opacity: 0.55; flex-shrink: 0; }
.sbp--open .sbp-chevron { transform: rotate(90deg); }
.sbp-title {
  display: flex;
  align-items: center;
  font-size: 0.6875rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--lg-muted, #6b7280);
  flex: 1;
  min-width: 0;
}
.sbp-title :deep(svg),
.sbp-title :deep(.v-icon) { margin-right: 6px; }
.sbp-meta { margin-left: auto; flex-shrink: 0; }
.sbp-body { padding: 0 12px 12px; }
</style>
