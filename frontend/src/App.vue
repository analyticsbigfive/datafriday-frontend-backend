<template>
  <v-app>
    <v-main>
      <router-view/>
      <RouteTransitionLoader />
      <GlobalConfirmDialog />
      <!-- Toggle « Démo » masqué (on travaille sur l'API). Le composant et le
           code demoMode restent intacts ; remonter <DemoModeBanner /> pour le
           réactiver. -->
      <!-- <DemoModeBanner /> -->
      <!-- Toaster vue-sonner global : style notif de l'app (n'était pas monté). -->
      <Toaster position="top-right" rich-colors close-button />
      <!-- Widget flottant de sync Weezevent : monté ici (racine toujours montée) pour
           survivre à la navigation inter-routes. Il s'auto-active via localStorage et
           écoute l'événement `weezevent-job-minimized`. -->
      <SyncJobFloatingWidget />
      <!-- Même widget, réutilisé pour l'import CSV Digifood (voir SyncJobFloatingWidget.vue,
           props provider/jobStatusFetcher/storageKey/minimizedEventName) — décalé verticalement
           pour ne pas se superposer si un sync Weezevent ET un import Digifood tournent en même
           temps. -->
      <SyncJobFloatingWidget
        provider="digifood"
        :job-status-fetcher="getDigifoodCsvImportJobStatus"
        storage-key="digifood_csv_import_active_job_id"
        minimized-event-name="digifood-csv-import-job-minimized"
        :offset-bottom="200"
      />
    </v-main>
  </v-app>
</template>

<script>
import { Toaster } from 'vue-sonner'
import 'vue-sonner/style.css'
import RouteTransitionLoader from '@/components/RouteTransitionLoader.vue'
import GlobalConfirmDialog from '@/components/GlobalConfirmDialog.vue'
import DemoModeBanner from '@/components/DemoModeBanner.vue'
import SyncJobFloatingWidget from '@/components/SyncJobFloatingWidget.vue'
import { getDigifoodCsvImportJobStatus } from '@/api/endpoints/aggregation.api.js'

export default {
  name: 'App',
  components: { RouteTransitionLoader, GlobalConfirmDialog, DemoModeBanner, Toaster, SyncJobFloatingWidget },

  data: () => ({
    //
  }),

  methods: {
    getDigifoodCsvImportJobStatus,
  },

  mounted() {
    // Notifications : la clé localStorage est scopée par utilisateur
    // (harmonisation 14/08). Un seul watch sur auth/userId couvre boot, login,
    // logout et switch de compte — tous les signOut passent par CLEAR_AUTH qui
    // remet userId à null. setUser hydrate/purge en conséquence.
    this._unwatchNotifUser = this.$store.watch(
      () => this.$store.getters['auth/userId'],
      (id) => this.$store.dispatch('notifications/setUser', id),
      { immediate: true },
    )
    // Notifications serveur (décision Bertrand 08/2026) : poll démarré/arrêté sur le
    // même signal, module séparé (store/modules/serverNotifications.js, pas de
    // réseau dans `notifications`, volontairement local-only).
    this._unwatchServerNotifUser = this.$store.watch(
      () => this.$store.getters['auth/userId'],
      (id) => this.$store.dispatch(id ? 'serverNotifications/startPolling' : 'serverNotifications/stopPolling'),
      { immediate: true },
    )
    // Cross-onglet : ré-hydrate quand un AUTRE onglet écrit la clé courante
    // (event `storage`, passif). e.key === null = localStorage.clear() ailleurs.
    this._onNotifStorage = (e) => {
      const key = this.$store.getters['notifications/storageKey']
      if (e.key === null || (key && e.key === key)) {
        this.$store.dispatch('notifications/hydrate')
      }
    }
    window.addEventListener('storage', this._onNotifStorage)
  },

  beforeUnmount() {
    if (this._onNotifStorage) {
      window.removeEventListener('storage', this._onNotifStorage)
      this._onNotifStorage = null
    }
    if (this._unwatchNotifUser) {
      this._unwatchNotifUser()
      this._unwatchNotifUser = null
    }
    if (this._unwatchServerNotifUser) {
      this._unwatchServerNotifUser()
      this._unwatchServerNotifUser = null
      this.$store.dispatch('serverNotifications/stopPolling')
    }
  },
}
</script>

<style>
/* --- Global pill toggle (Quantit� / CA, Total / Moy., etc.) ---
   Applied to every <v-btn-toggle class="pill-toggle"> across analyse views. */
.pill-toggle {
  border-radius: 9999px !important;
  background-color: #ffffff;
  border: 1px solid #E5E7EB !important;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  overflow: hidden;
}
.pill-toggle .v-btn {
  border: none !important;
  box-shadow: none !important;
  background-color: transparent !important;
  border-radius: 0 !important;
  text-transform: none !important;
  font-weight: 500;
  letter-spacing: 0;
  color: #374151 !important;
}
.pill-toggle .v-btn--active {
  background-color: #E5E7EB !important;
  color: #111827 !important;
  font-weight: 600;
}
.pill-toggle .v-btn:hover:not(.v-btn--active) {
  background-color: #F9FAFB !important;
}

/* ─── Lot 0.5 — Padding compact pour les expansion panels (8px partout) ─── */
.v-expansion-panel-text__wrapper {
  padding: 8px !important;
}
.v-expansion-panel-title {
  padding: 8px !important;
  min-height: 40px !important;
}

/* ──────────────────────────────────────────────────────────────────────────
   Dark mode — inspiré de la versionReact (`globals.css`).
   Le ThemeProvider React applique une classe `.dark` sur <html> ; on fait
   pareil via `src/plugins/vuetify.js`. Les composants Vuetify sont déjà
   théméfiés via `dataFridayDark`, ces règles couvrent les overrides en
   `style scoped` qui hardcodent des couleurs claires (et ne réagissent
   donc pas au thème). On vise un rendu cohérent sur tout l'écran Analyse.
   ────────────────────────────────────────────────────────────────────── */
.v-theme--dataFridayDark {
  color-scheme: dark;
}

/* Pill toggle — variante sombre. */
.v-theme--dataFridayDark .pill-toggle {
  background-color: #2F2F2F;
  border-color: #444 !important;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
}
.v-theme--dataFridayDark .pill-toggle .v-btn {
  color: #D1D5DB !important;
}
.v-theme--dataFridayDark .pill-toggle .v-btn--active {
  background-color: #3F3F46 !important;
  color: #FAFAFA !important;
}
.v-theme--dataFridayDark .pill-toggle .v-btn:hover:not(.v-btn--active) {
  background-color: #353535 !important;
}

/* FilterSummary — chips et pills de comparaison.
   Plus de `background-color` ici : à l'époque de cette règle, FilterSummary était
   un bandeau sticky autonome sur fond de page, d'où un fond sombre + une bordure
   basse. Depuis, il est rendu DANS le bandeau rouge d'AnalyseView
   (.av-header__row2) — le #1A1A1A repeignait donc la ligne « Tout l'historique »
   en quasi-noir par-dessus le rouge, uniquement en thème sombre (en clair aucune
   règle équivalente n'existait, le rouge restait visible). Le fond du bandeau est
   la seule source de vérité : ce bloc ne gère plus que les éléments internes. */
.v-theme--dataFridayDark .chip-events,
.v-theme--dataFridayDark .chip-events :deep(.v-chip__content) {
  background-color: #2A2F36 !important;
  color: #E5E7EB !important;
}
.v-theme--dataFridayDark .compare-toggle {
  background-color: #1E2A44;
}
.v-theme--dataFridayDark .compare-pill {
  color: #BFDBFE;
}
.v-theme--dataFridayDark .compare-pill:hover {
  background-color: rgba(255, 255, 255, 0.08);
}
.v-theme--dataFridayDark .compare-pill--active {
  background-color: #3B82F6;
  color: #ffffff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
}
.v-theme--dataFridayDark .chip-filter,
.v-theme--dataFridayDark .chip-filter :deep(.v-chip__content) {
  background-color: #2E1A4A !important;
  color: #DDD6FE !important;
}

/* AnalyseAppHeader — bordure sticky en sombre. */
.v-theme--dataFridayDark .analyse-header {
  border-bottom-color: rgba(255, 255, 255, 0.08);
}
.v-theme--dataFridayDark .analyse-header--scrolled {
  border-bottom-color: rgba(255, 255, 255, 0.16);
}

/* Section titles & labels durcis en clair → adaptés en sombre. */
.v-theme--dataFridayDark .section-title,
.v-theme--dataFridayDark .shop-name {
  color: #FAFAFA !important;
}
.v-theme--dataFridayDark .shop-stats,
.v-theme--dataFridayDark .section-subtitle {
  color: #9CA3AF !important;
}

/* MenuItemsByShopTable — recherche + tableau articles. */
.v-theme--dataFridayDark .mibs-search {
  background-color: #2A2A2A;
  border-color: #3F3F46;
}
.v-theme--dataFridayDark .mibs-search-input {
  color: #FAFAFA;
}
.v-theme--dataFridayDark .mibs-search-input::placeholder {
  color: #9CA3AF;
}
.v-theme--dataFridayDark .mibs-search-scope {
  background-color: #3F3F46;
  color: #FAFAFA;
}
.v-theme--dataFridayDark .mibs-items-table :deep(th) {
  background-color: #2F2F2F;
  color: #9CA3AF;
}
.v-theme--dataFridayDark .mibs-items-table .mibs-thumb {
  background-color: #2A2A2A;
  border-color: #3F3F46;
}
.v-theme--dataFridayDark .mibs-items-table .mibs-item-name {
  color: #93C5FD;
}
.v-theme--dataFridayDark .mibs-items-table .mibs-events-cell {
  color: #9CA3AF;
}
.v-theme--dataFridayDark .mibs-items-table tr:hover .mibs-events-cell {
  color: #C4B5FD;
}

/* ShopPerformanceByTransactionRate — banner gradient + body. */
.v-theme--dataFridayDark .shop-banner {
  background: linear-gradient(135deg, #2E1A4A 0%, #3A1E50 100%);
}
.v-theme--dataFridayDark .shop-card:hover {
  box-shadow: 0 4px 12px rgba(159, 122, 255, 0.25);
  border-color: rgba(159, 122, 255, 0.6);
}

/* Tous les titres « .chart-title », « .section-title » etc. dans les
   composants Analyse hardcodent #212121 → on force un blanc cassé en sombre.
   Plain class selectors traversent les style scoped (data-v-xxx attribut). */
.v-theme--dataFridayDark .chart-title,
.v-theme--dataFridayDark .chart-card-title,
.v-theme--dataFridayDark .donut-title {
  color: #FAFAFA !important;
}
.v-theme--dataFridayDark .chart-subtitle,
.v-theme--dataFridayDark .legend-label,
.v-theme--dataFridayDark .donut-subtitle {
  color: #D1D5DB !important;
}

/* Toolbar "Shops | Menu Types | By Date | Average" — pills sombres. */
.v-theme--dataFridayDark .chart-toolbar .v-btn,
.v-theme--dataFridayDark .chart-toolbar .v-btn-toggle {
  background-color: #2F2F2F !important;
  border-color: #444 !important;
  color: #E5E7EB !important;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.4) !important;
}
.v-theme--dataFridayDark .chart-toolbar .v-btn:hover {
  background-color: #353535 !important;
  border-color: #555 !important;
}
.v-theme--dataFridayDark .chart-toolbar .v-btn-toggle .v-btn {
  background-color: transparent !important;
  border: 0 !important;
}
.v-theme--dataFridayDark .chart-toolbar .v-btn-toggle .v-btn--active {
  background-color: #3F3F46 !important;
  color: #FAFAFA !important;
}

/* AnalyseView main background — fond gris clair → presque noir en sombre. */
.v-theme--dataFridayDark .analyse-app,
.v-theme--dataFridayDark .main-content {
  background-color: #1A1A1A !important;
}

/* Chart cards (EventRevenueByShop/etc.) — fond blanc → surface sombre. */
.v-theme--dataFridayDark .v-card.bg-white,
.v-theme--dataFridayDark .v-card[style*="background-color: #ffffff"],
.v-theme--dataFridayDark .v-card[style*="background-color: #fff"] {
  background-color: #252525 !important;
}

/* v-alert (bandeau "Données de démo Adidas Arena") — texte sombre par défaut.
   On force une couleur lisible sur fond tonal sombre. */
.v-theme--dataFridayDark .v-alert--variant-tonal .v-alert__content,
.v-theme--dataFridayDark .v-alert--variant-tonal {
  color: rgba(var(--v-theme-on-surface), 0.95) !important;
}
.v-theme--dataFridayDark .v-alert--variant-tonal code {
  background-color: rgba(255, 255, 255, 0.06);
  color: #FAFAFA;
  padding: 1px 4px;
  border-radius: 3px;
}

/* Légendes/labels des donuts/pies (`#424242`, `#9e9e9e`). */
.v-theme--dataFridayDark .legend-label {
  color: #D1D5DB !important;
}

/* FilterPanel sidebar — events list, range labels, ms-label. */
.v-theme--dataFridayDark .event-name {
  color: #FAFAFA !important;
}
.v-theme--dataFridayDark .event-date,
.v-theme--dataFridayDark .range-label,
.v-theme--dataFridayDark .ms-label {
  color: #9CA3AF !important;
}

/* SummaryPanel (drawer droit) — métriques shops, perf events. */
.v-theme--dataFridayDark .summary-panel,
.v-theme--dataFridayDark .summary-panel .v-card,
.v-theme--dataFridayDark .summary-panel .v-list,
.v-theme--dataFridayDark .summary-panel .v-list-item {
  background-color: #1F1F1F !important;
}
.v-theme--dataFridayDark .summary-panel .text-medium-emphasis,
.v-theme--dataFridayDark .text-medium-emphasis {
  color: #9CA3AF !important;
}

/* ShopPerformance card body — overlay text reste blanc, mais le corps a des
   `text-medium-emphasis` et des couleurs hardcodées (#0D47A1 etc.). On
   éclaircit les valeurs pour rester lisibles. */
.v-theme--dataFridayDark .shop-card .text-high-emphasis {
  color: #FAFAFA !important;
}

/* Classes utilitaires Tailwind portées telles quelles depuis la versionReact :
   on les remappe sur des tons sombres équivalents. */
.v-theme--dataFridayDark .bg-white {
  background-color: #252525 !important;
}
.v-theme--dataFridayDark .bg-gray-50 {
  background-color: #1F1F1F !important;
}
.v-theme--dataFridayDark .bg-gray-100 {
  background-color: #2A2A2A !important;
}
.v-theme--dataFridayDark .text-gray-500,
.v-theme--dataFridayDark .text-gray-600,
.v-theme--dataFridayDark .text-gray-700 {
  color: #D1D5DB !important;
}
.v-theme--dataFridayDark .text-gray-800,
.v-theme--dataFridayDark .text-gray-900 {
  color: #FAFAFA !important;
}
.v-theme--dataFridayDark .border-gray-200,
.v-theme--dataFridayDark .border-gray-300 {
  border-color: #3F3F46 !important;
}

/* DonutChartCard — fond carte + textes des légendes (label + montant à droite).
   La bordure est gérée dans le composant (retirée en sombre) : la déclarer ici
   ne servait à rien, la règle scopée du composant gagnait à specificité égale. */
.v-theme--dataFridayDark .donut-card {
  background-color: #1F1F1F !important;
}
.v-theme--dataFridayDark .legend-text {
  color: #E5E7EB !important;
}
.v-theme--dataFridayDark .legend-value {
  color: #FAFAFA !important;
}

/* SummaryPanel — listes Top events / Top items (drawer droit). */
.v-theme--dataFridayDark .item-name {
  color: #FAFAFA !important;
}
.v-theme--dataFridayDark .item-units,
.v-theme--dataFridayDark .item-units-below,
.v-theme--dataFridayDark .item-rate {
  color: #9CA3AF !important;
}
.v-theme--dataFridayDark .item-value {
  color: #34D399 !important;
}
.v-theme--dataFridayDark .item-value.event-value {
  color: #2DD4BF !important;
}
/* Cartes vert pâle des évènements → fond sombre + bordure teal discrète. */
.v-theme--dataFridayDark .event-row {
  background-color: #15241F !important;
  border-color: #14532D !important;
}
.v-theme--dataFridayDark .metric-suffix {
  color: #6B7280 !important;
}
.v-theme--dataFridayDark .txn-rate-chip {
  background-color: #2E1A4A !important;
  color: #C4B5FD !important;
}

/* Layout shell */
.v-theme--dataFridayDark .data-integration-view {
  background: #111827 !important;
}

/* Sidebar */
.v-theme--dataFridayDark .data-integration-view .sidebar {
  background: #1f2937 !important;
  border-right-color: rgba(255, 255, 255, 0.10) !important;
}
.v-theme--dataFridayDark .data-integration-view .sidebar-item {
  color: #d1d5db !important;
}
.v-theme--dataFridayDark .data-integration-view .sidebar-item:hover {
  background: #2d3748 !important;
}
.v-theme--dataFridayDark .data-integration-view .sidebar-item.active {
  background: rgba(255, 49, 49, 0.15) !important;
  color: #f87171 !important;
}

/* Title bar */
.v-theme--dataFridayDark .data-integration-view .title-bar {
  background: #1f2937 !important;
  border-bottom-color: rgba(255, 255, 255, 0.10) !important;
}
.v-theme--dataFridayDark .data-integration-view .title-bar-text {
  color: #f9fafb !important;
}

/* Integration cards */
.v-theme--dataFridayDark .data-integration-view .integration-card {
  background: #1f1f1f !important;
  border-color: #2d2d2d !important;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4) !important;
}
.v-theme--dataFridayDark .data-integration-view .integration-card:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5) !important;
}

/* Chips (date + org ID) */
.v-theme--dataFridayDark .data-integration-view .card-chip {
  background: #252525 !important;
  border-color: #374151 !important;
  color: #9ca3af !important;
}

/* Section label */
.v-theme--dataFridayDark .data-integration-view .card-section-label {
  color: #6b7280 !important;
}

/* Native date inputs */
.v-theme--dataFridayDark .data-integration-view .date-input {
  background: #1e1e2e !important;
  border-color: #374151 !important;
  color: #d1d5db !important;
  color-scheme: dark;
}
.v-theme--dataFridayDark .data-integration-view .date-input:hover {
  background: #252535 !important;
  border-color: #4b5563 !important;
}
.v-theme--dataFridayDark .data-integration-view .date-input:focus {
  background: #252535 !important;
  border-color: #ff3131 !important;
  box-shadow: 0 0 0 3px rgba(255, 49, 49, 0.15) !important;
}
.v-theme--dataFridayDark .data-integration-view .date-input-label {
  color: #6b7280 !important;
}

/* Divider */
.v-theme--dataFridayDark .data-integration-view .card-divider {
  border-top-color: #2d2d2d !important;
}

/* Sync history */
.v-theme--dataFridayDark .data-integration-view .sync-history {
  border-color: #2d2d2d !important;
}
.v-theme--dataFridayDark .data-integration-view .sync-history-item {
  background: #1f1f1f !important;
  border-bottom-color: #252525 !important;
}
.v-theme--dataFridayDark .data-integration-view .sync-history-item:hover {
  background: #252525 !important;
}
.v-theme--dataFridayDark .data-integration-view .sync-history-range {
  color: #d1d5db !important;
}
.v-theme--dataFridayDark .data-integration-view .sync-history-count {
  color: #9ca3af !important;
}

/* Job stats panel */
.v-theme--dataFridayDark .data-integration-view .sync-job-stats {
  border-bottom-color: #2d2d2d !important;
}
.v-theme--dataFridayDark .data-integration-view .sync-job-stat-item {
  background: #252525 !important;
}
.v-theme--dataFridayDark .data-integration-view .sync-job-stat-value {
  color: #f9fafb !important;
}
.v-theme--dataFridayDark .data-integration-view .sync-job-stat-label {
  color: #6b7280 !important;
}

/* Location row & badge */
.v-theme--dataFridayDark .data-integration-view .location-row {
  color: #9ca3af !important;
}
.v-theme--dataFridayDark .data-integration-view .location-row:hover {
  color: #d1d5db !important;
}
.v-theme--dataFridayDark .data-integration-view .location-badge {
  background: #252525 !important;
  color: #9ca3af !important;
}
.v-theme--dataFridayDark .data-integration-view .location-badge--linked {
  background: rgba(22, 163, 74, 0.15) !important;
  color: #4ade80 !important;
}
.v-theme--dataFridayDark .data-integration-view .location-link-btn {
  background: rgba(255, 49, 49, 0.1) !important;
  border-color: rgba(255, 49, 49, 0.35) !important;
  color: #f87171 !important;
}
.v-theme--dataFridayDark .data-integration-view .location-link-btn:hover {
  background: rgba(255, 49, 49, 0.2) !important;
}
.v-theme--dataFridayDark .data-integration-view .location-item {
  background: #252525 !important;
  color: #9ca3af !important;
}
.v-theme--dataFridayDark .data-integration-view .location-map-btn:hover {
  background: rgba(255, 255, 255, 0.08) !important;
}

/* Drawer integration options */
.v-theme--dataFridayDark .data-integration-view .drawer-header {
  border-bottom-color: #2d2d2d !important;
}
.v-theme--dataFridayDark .data-integration-view .drawer-integration-option {
  border-color: #374151 !important;
}
.v-theme--dataFridayDark .data-integration-view .drawer-integration-option:hover:not(.disabled) {
  border-color: #3b82f6 !important;
  background: rgba(37, 99, 235, 0.08) !important;
}

</style>
