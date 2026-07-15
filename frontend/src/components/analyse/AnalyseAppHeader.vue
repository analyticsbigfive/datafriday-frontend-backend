<template>
  <v-app-bar
    color="surface"
    :elevation="isScrolled ? 4 : 1"
    density="compact"
    :class="['analyse-header px-4', { 'analyse-header--scrolled': isScrolled }]"
    height="104"
  >
    <!-- Gauche : chevron qui replie/déplie le rail de navigation du Dashboard
      (parité EventPredict). Flèche gauche = déplié, droite = replié. -->
    <v-btn
      icon
      variant="text"
      size="small"
      class="nav-toggle"
      :aria-label="t('anHeaderToggleNav')"
      :title="t('anHeaderToggleNav')"
      @click="openMainNavigation"
    >
      <ChevronLeft v-if="navExpanded" :size="20" />
      <ChevronRight v-else :size="20" />
    </v-btn>

    <!-- Sélecteur d'espace : de retour dans le header (emplacement initial). -->
    <WorkspaceSpaceSwitcher :space-name="spaceName" class="ml-1" />

    <v-spacer />

    <!-- Centre : 8 KPIs inline -->
    <div class="d-none d-lg-flex align-center kpi-row">
      <component
        :is="kpi.clickable ? 'button' : 'div'"
        v-for="kpi in kpiList"
        :key="kpi.label"
        :type="kpi.clickable ? 'button' : undefined"
        :class="['kpi-cell', { 'kpi-cell-btn': kpi.clickable }]"
        :style="{ '--kpi-color': kpi.color, '--kpi-rgb': kpi.rgb }"
        @click="kpi.clickable && $emit('open-chart', kpi.kind)"
      >
        <div class="kpi-label">{{ kpi.label }}</div>
        <div class="kpi-value">{{ kpi.value }}</div>
        <div
          v-if="kpi.variation != null"
          class="kpi-variation"
          :style="{ color: kpi.variation >= 0 ? '#10B981' : '#ff3131' }"
        >
          <TrendingUp v-if="kpi.variation >= 0" :size="11" />
          <TrendingDown v-else :size="11" />
          {{ Math.abs(kpi.variation).toFixed(1) }}%
        </div>
      </component>
    </div>

    <v-spacer />

    <!-- Droite : notifications + user + Make a copy + Share
    <v-menu v-model="alertsMenu" :close-on-content-click="false" location="bottom end" offset="8">
      <template #activator="{ props: menuProps }">
        <v-badge
          :color="hasUnread ? 'red' : 'transparent'"
          :content="hasUnread ? alerts.length : ''"
          :dot="!hasUnread"
          offset-x="4"
          offset-y="4"
          class="mr-3"
        >
          <v-btn icon variant="text" size="small" v-bind="menuProps" aria-label="Alertes">
            <v-icon>mdi-bell-outline</v-icon>
          </v-btn>
        </v-badge>
      </template>

      <v-card width="380" class="alerts-card" elevation="6">
        <v-card-title class="d-flex align-center pa-3">
          <v-icon class="mr-2" size="20">mdi-bell-ring-outline</v-icon>
          <span class="text-subtitle-1 font-weight-bold">{{ t('anAlertsInsights') }}</span>
          <v-spacer />
          <v-btn
            v-if="alerts.length"
            size="x-small"
            variant="text"
            @click="markAllRead"
          >
            {{ t('anMarkAllRead') }}
          </v-btn>
        </v-card-title>
        <v-divider />
        <v-list density="compact" class="alerts-list py-0">
          <template v-if="alerts.length">
            <v-list-item
              v-for="alert in alerts"
              :key="alert.id"
              :class="['alert-item', { 'alert-item--unread': !readIds.has(alert.id) }]"
              @click="onAlertClick(alert)"
            >
              <template #prepend>
                <v-icon :color="alert.color" size="22">{{ alert.icon }}</v-icon>
              </template>
              <v-list-item-title class="text-body-2 font-weight-medium">
                {{ alert.title }}
              </v-list-item-title>
              <v-list-item-subtitle class="text-caption">
                {{ alert.detail }}
              </v-list-item-subtitle>
            </v-list-item>
          </template>
          <v-list-item v-else class="text-center py-6">
            <v-list-item-title class="text-caption text-medium-emphasis">
              <v-icon size="32" color="success" class="mb-2 d-block mx-auto">mdi-check-circle-outline</v-icon>
              {{ t('anNoAlerts') }}
            </v-list-item-title>
          </v-list-item>
        </v-list>
      </v-card>
    </v-menu> -->

    <!-- Notifications -->
    <v-btn icon variant="text" class="action-btn mr-2">
      <v-badge color="#ff3131" content="3" offset-x="-2" offset-y="2">
        <Bell :size="20" />
      </v-badge>
    </v-btn>

    <!-- Paramètres (ouvre le drawer du Dashboard) -->
    <v-btn icon variant="text" class="action-btn mr-2" @click="openGlobalSettings">
      <Settings :size="20" />
    </v-btn>

    <v-divider vertical class="mx-3" />

    <!-- Profil utilisateur (parité DashboardView) -->
    <v-menu v-model="showUserMenu" :close-on-content-click="false" location="bottom end" offset="8">
      <template #activator="{ props: menuProps }">
        <div class="user-profile" v-bind="menuProps">
          <v-avatar size="36" color="#ff3131" class="user-avatar">
            <span class="text-white font-weight-bold" style="font-size: 0.85rem;">{{ userInitials }}</span>
          </v-avatar>
          <div class="user-info ml-3 d-none d-sm-flex">
            <div class="user-name">{{ userName }}</div>
            <div class="user-role">{{ userRoleName || tenant?.name || 'Admin' }}</div>
          </div>
          <ChevronDown :size="16" class="ml-2 d-none d-sm-block" />
        </div>
      </template>

      <v-card class="user-menu-card" elevation="8" rounded="lg">
        <!-- Profile header -->
        <div class="ump-header">
          <v-avatar size="52" color="#ff3131" class="ump-avatar">
            <span class="text-white font-weight-bold" style="font-size: 1.1rem;">{{ userInitials }}</span>
          </v-avatar>
          <div class="ump-header-info">
            <div class="ump-name">{{ userName }}</div>
            <div class="ump-email">{{ userEmail }}</div>
            <v-chip v-if="userRoleName" size="x-small" color="#ff3131" variant="tonal" rounded="lg" class="mt-1">
              {{ userRoleName }}
            </v-chip>
          </div>
        </div>

        <v-divider />

        <!-- Details -->
        <div class="ump-details">
          <div v-if="userPhone" class="ump-detail-row">
            <Phone :size="14" class="ump-detail-icon" />
            <span>{{ userPhone }}</span>
          </div>
          <div v-if="tenant?.name" class="ump-detail-row">
            <Building2 :size="14" class="ump-detail-icon" />
            <span>{{ tenant.name }}</span>
          </div>
        </div>

        <v-divider v-if="userPhone || tenant?.name" />

        <!-- Actions -->
        <v-list density="compact" class="pa-1">
          <v-list-item rounded="lg" class="ump-action-item" @click="goToProfile">
            <template #prepend>
              <UserCog :size="16" class="mr-3 ump-action-icon" />
            </template>
            <v-list-item-title class="text-body-2">{{ t('navProfile') }}</v-list-item-title>
          </v-list-item>
          <v-list-item rounded="lg" class="ump-action-item ump-action-item--logout" @click="onSignOut">
            <template #prepend>
              <LogOut :size="16" class="mr-3" />
            </template>
            <v-list-item-title class="text-body-2">{{ t('signOut') }}</v-list-item-title>
          </v-list-item>
        </v-list>
      </v-card>
    </v-menu>

    <!-- Toggle assistant : visible uniquement sur mobile/tablette -->
    <v-btn
      v-if="$vuetify.display.mdAndDown"
      icon
      variant="text"
      size="small"
      class="ml-2"
      :aria-label="t('anHeaderAnalysisAssistant')"
      @click="$emit('toggle-summary')"
    >
      <v-icon>mdi-robot-happy-outline</v-icon>
    </v-btn>
  </v-app-bar>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useStore } from 'vuex'
import { useRouter } from 'vue-router'
import { Bell, Building2, ChevronDown, ChevronLeft, ChevronRight, LogOut, Phone, Settings, TrendingDown, TrendingUp, UserCog } from 'lucide-vue-next'
import { formatCurrency, formatNumber, formatPercent } from '@/composables/useFormatters'
import WorkspaceSpaceSwitcher from '@/components/WorkspaceSpaceSwitcher.vue'
import { useI18n } from '@/i18n/useI18n'

const { t } = useI18n()

const props = defineProps({
  spaceName: { type: String, default: 'Space' },
  metrics: { type: Object, required: true },
  summary: { type: Object, default: null },
})

const emit = defineEmits(['toggle-summary', 'open-chart'])
const store = useStore()
const router = useRouter()

// ---- Rail de navigation du Dashboard (chevron à gauche du header) ----------
// navExpanded reflète l'état diffusé par DashboardView (déplié/replié) → oriente
// la flèche du chevron (gauche = déplié, droite = replié). Parité EventPredict.
const navExpanded = ref(false)
function openMainNavigation() {
  window.dispatchEvent(new CustomEvent('datafriday:open-main-navigation'))
}
function onNavState(e) {
  navExpanded.value = !!e.detail?.expanded
}

// ---- Compte utilisateur (parité EXACTE avec DashboardView : currentUser) ---
const user = computed(() => store.getters['auth/currentUser'] || null)
const tenant = computed(() => store.getters['auth/currentTenant'] || null)
const userName = computed(() => {
  if (user.value?.firstName && user.value?.lastName) return `${user.value.firstName} ${user.value.lastName}`
  return user.value?.email?.split('@')[0] || t('anHeaderUser')
})
const userEmail = computed(() => user.value?.email || '')
const userInitials = computed(() => {
  if (user.value?.firstName && user.value?.lastName) {
    return `${user.value.firstName[0]}${user.value.lastName[0]}`.toUpperCase()
  }
  return user.value?.email?.[0]?.toUpperCase() || 'U'
})
const userRoleName = computed(() => {
  if (user.value?.role?.name) return user.value.role.name
  if (user.value?.roleName) return user.value.roleName
  const su = (store.getters['users/users'] || []).find((u) => u.email === user.value?.email || u.id === user.value?.id)
  return su?.role?.name || su?.roleName || null
})
const userPhone = computed(() => {
  if (user.value?.phone) return user.value.phone
  const su = (store.getters['users/users'] || []).find((u) => u.email === user.value?.email || u.id === user.value?.id)
  return su?.phone || null
})

function goToProfile() {
  showUserMenu.value = false
  router.push({ path: '/profile' })
}

function openGlobalSettings() {
  // Pont vers DashboardView : la barre globale est masquée sur cette page
  // mais le drawer Settings y est toujours rendu.
  window.dispatchEvent(new CustomEvent('datafriday:open-settings'))
}

async function onSignOut() {
  try {
    await store.dispatch('auth/signOut')
    router.push('/login')
  } catch (e) {
    // silencieux : la déconnexion échoue rarement et la session sera nettoyée au refresh
  }
}

const isScrolled = ref(false)

function updateStickyState() {
  isScrolled.value = window.scrollY > 8
}

onMounted(() => {
  updateStickyState()
  window.addEventListener('scroll', updateStickyState, { passive: true })
  window.addEventListener('datafriday:main-navigation-state', onNavState)
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', updateStickyState)
  window.removeEventListener('datafriday:main-navigation-state', onNavState)
})

// Variations : issues du `summary` fourni par le store (variations recalculées
// côté client à partir des données réelles). En mode single-event, pas de
// variation. Le store renvoie null quand la baseline est absente — on
// propage tel quel pour masquer la chip dans le template.
const isSingleEventMode = computed(() => !!props.metrics?.isSingleEventMode?.value)
const v = (key) => {
  if (isSingleEventMode.value) return null
  // Aligne le header sur FinancialMetricsGrid : suit le mode de comparaison
  // choisi par l'utilisateur (periodède préc. vs N-1).
  const mode = props.summary?.comparisonMode || 'previous_period'
  const raw = mode === 'year_over_year'
    ? (props.summary?.variationsYoY?.[key] ?? props.summary?.variations?.[key])
    : props.summary?.variations?.[key]
  if (raw == null || !Number.isFinite(raw)) return null
  return raw
}

const kpiList = computed(() => [
  {
    label: t('anHeaderKpiRevenue'),
    kind: 'revenue',
    value: formatCurrency(props.metrics.displayRevenue?.value ?? 0),
    variation: v('revenue'),
    color: '#10B981',
    rgb: '16, 185, 129',
    clickable: true,
  },
  {
    label: t('anHeaderKpiAvgPerEvent'),
    kind: 'avg-revenue',
    value: formatCurrency(props.metrics.displayAvgRevenue?.value ?? 0),
    variation: v('avgRevenuePerEvent'),
    color: '#F97316',
    rgb: '249, 115, 22',
    clickable: true,
  },
  {
    label: t('anHeaderKpiAttendees'),
    kind: 'attendees',
    value: formatNumber(props.metrics.displayAttendees?.value ?? 0),
    variation: v('attendees'),
    color: '#0EA5E9',
    rgb: '14, 165, 233',
    clickable: true,
  },
  {
    label: t('anHeaderKpiTransactions'),
    kind: 'transactions',
    value: formatNumber(props.metrics.displayTransactions?.value ?? 0),
    variation: v('transactions'),
    color: '#3B82F6',
    rgb: '59, 130, 246',
    clickable: true,
  },
  {
    label: t('anHeaderKpiPerCap'),
    kind: 'percap',
    value: formatCurrency(props.metrics.displayPerCapita?.value ?? 0, 'EUR', 'fr-FR', 2),
    variation: v('perCapita'),
    color: '#EC4899',
    rgb: '236, 72, 153',
    clickable: true,
  },
  {
    label: t('anHeaderKpiTransformation'),
    kind: 'transformation',
    // Affiche le taux de conversion (% transactions / spectateurs) — inversion
    // demandée cf. revue UI : 'Transfo' = pourcentage, 'Taux transaction' = /min.
    value: (() => {
      const trans = props.metrics.displayTransactions?.value ?? 0
      const attendees = props.metrics.displayAttendees?.value ?? 0
      if (!attendees) return '—'
      return `${((trans / attendees) * 100).toFixed(1).replace('.', ',')} %`
    })(),
    variation: v('transferRate'),
    color: '#14B8A6',
    rgb: '20, 184, 166',
    clickable: true,
  },
  {
    label: t('anHeaderKpiBasket'),
    kind: 'avg-trans',
    value: formatCurrency(
      props.metrics.displayTransactions?.value
        ? props.metrics.displayRevenue.value / props.metrics.displayTransactions.value
        : 0,
      'EUR',
      'fr-FR',
      2
    ),
    variation: v('avgTransaction'),
    color: '#A855F7',
    rgb: '168, 85, 247',
    clickable: true,
  },
  {
    label: t('anHeaderKpiCost'),
    kind: 'cost',
    value: formatCurrency(props.metrics.displayCost?.value ?? 0),
    variation: v('cost'),
    color: '#ff3131',
    rgb: '239, 68, 68',
    clickable: true,
  },
])

// ---- Centre d'alertes : insights auto à partir des KPI / variations -------
const alertsMenu = ref(false)
const readIds = ref(new Set())
const showUserMenu = ref(false)

const ALERT_THRESHOLD = 15 // % de variation considéré comme notable
const MARGIN_LOW = 70      // sous ce seuil → alerte rentabilité
const TRANSFER_LOW = 60    // sous ce seuil → conversion faible

const alerts = computed(() => {
  const list = []
  const variations = props.summary?.variations || {}

      // 1) Variations CA notables (positives ou négatives)
      if (Math.abs(variations.revenue || 0) >= ALERT_THRESHOLD) {
        const up = variations.revenue > 0
        list.push({
          id: 'revenue-variation',
          icon: up ? 'mdi-trending-up' : 'mdi-trending-down',
          color: up ? 'success' : 'error',
          title: `${t('anHeaderKpiRevenue')} ${up ? t('anHeaderAlertRevenueUp') : t('anHeaderAlertRevenueDown')}\xa0: ${variations.revenue > 0 ? '+' : ''}${variations.revenue.toFixed(1)}%`,
          detail: `${t('anHeaderAlertVsPreviousPeriod')} \u2014 ${formatCurrency(props.metrics.displayRevenue?.value ?? 0)}`,
          query: t('anHeaderQueryVsPreviousPeriod'),
        })
      }

      // 2) Coûts qui croissent plus vite que le CA → marge sous pression
      const revVar = variations.revenue || 0
      const costVar = variations.cost || 0
      if (costVar > 10 && costVar > revVar + 5) {
        list.push({
          id: 'cost-pressure',
          icon: 'mdi-alert-octagon-outline',
          color: 'warning',
          title: t('anHeaderAlertCostFasterTitle'),
          detail: `${t('anHeaderKpiCost')} +${costVar.toFixed(1)}% vs ${t('anHeaderKpiRevenue')} ${revVar > 0 ? '+' : ''}${revVar.toFixed(1)}%`,
          query: t('anHeaderQueryTotalCost'),
        })
      }

      // 3) Marge faible
      const margin = props.metrics.displayMargin?.value
      if (Number.isFinite(margin) && margin < MARGIN_LOW) {
        list.push({
          id: 'margin-low',
          icon: 'mdi-percent-outline',
          color: 'warning',
          title: `${t('anHeaderAlertMarginBelow')} ${MARGIN_LOW}%\xa0: ${margin.toFixed(1)}%`,
          detail: t('anHeaderAlertMarginDetail'),
          query: t('anHeaderQueryAvgMargin'),
        })
      }

      // 4) Taux de conversion faible — même définition que le KPI « Transfo »
      // (transactions / spectateurs × 100), sur les données FILTRÉES (le summary
      // espace-large n'a pas de transferRate).
      const _att = props.metrics.displayAttendees?.value || 0
      const tr = _att ? (props.metrics.displayTransactions?.value / _att) * 100 : NaN
      if (Number.isFinite(tr) && tr < TRANSFER_LOW) {
        list.push({
          id: 'transfer-low',
          icon: 'mdi-account-arrow-right-outline',
          color: 'warning',
          title: `${t('anHeaderAlertLowTransferTitle')}\xa0: ${tr.toFixed(1)}%`,
          detail: t('anHeaderAlertLowTransferDetail'),
          query: t('anHeaderQueryKpiSummary'),
        })
      }

      // 5) Panier moyen en évolution
      if (Math.abs(variations.avgTransaction || variations.avgPerTransaction || 0) >= ALERT_THRESHOLD) {
        const v = variations.avgTransaction ?? variations.avgPerTransaction
        const up = v > 0
        list.push({
          id: 'avg-transaction-variation',
          icon: up ? 'mdi-cart-arrow-up' : 'mdi-cart-arrow-down',
          color: up ? 'success' : 'error',
          title: `${t('anHeaderAlertAvgBasket')} ${up ? '+' : ''}${v.toFixed(1)}%`,
          detail: `${t('anHeaderAlertAvgTransaction')} \u2014 ${formatCurrency((props.metrics.displayRevenue?.value || 0) / (props.metrics.displayTransactions?.value || 1))}`,
          query: t('anHeaderQueryAvgBasket'),
        })
      }

  // 6) Per capita en évolution
  if (Math.abs(variations.perCapita || 0) >= ALERT_THRESHOLD) {
    const up = variations.perCapita > 0
    list.push({
      id: 'percapita-variation',
      icon: up ? 'mdi-account-cash-outline' : 'mdi-account-off-outline',
      color: up ? 'success' : 'error',
      title: `${t('anHeaderAlertSpendPerAttendee')} ${up ? '+' : ''}${variations.perCapita.toFixed(1)}%`,
      detail: `${t('anHeaderKpiPerCap')} — ${formatCurrency(props.metrics.displayPerCapita?.value ?? 0, 'EUR', 'fr-FR', 2)}`,
      query: t('anHeaderQueryPerCap'),
    })
  }

      return list
})

const hasUnread = computed(() => alerts.value.some((a) => !readIds.value.has(a.id)))

// Refs needed for copy/share functionality
const copying = ref(false)
const sharing = ref(false)
const snackbar = ref(false)
const snackbarText = ref('')
const snackbarColor = ref('success')

function notify(text, color = 'success') {
  snackbarText.value = text
  snackbarColor.value = color
  snackbar.value = true
}

function markAllRead() {
  for (const a of alerts.value) readIds.value.add(a.id)
}

function onAlertClick(alert) {
  readIds.value.add(alert.id)
  if (alert.query) {
    store.commit('analyse/SET_PENDING_ASSISTANT_QUERY', {
      text: alert.query,
      ts: Date.now(),
    })
    emit('toggle-summary', true)
  }
  alertsMenu.value = false
}

async function captureScreenshot() {
  const target = document.getElementById('analyse-capture-root') || document.body
  const html2canvas = (await import('html2canvas')).default
  const canvas = await html2canvas(target, {
    backgroundColor: '#ffffff',
    scale: window.devicePixelRatio || 1,
    useCORS: true,
    logging: false,
  })
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error(t('anHeaderCaptureFailed')))
    }, 'image/png')
  })
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

async function onCopy() {
  copying.value = true
  try {
    const blob = await captureScreenshot()
    if (navigator.clipboard && window.ClipboardItem) {
      await navigator.clipboard.write([
        new window.ClipboardItem({ 'image/png': blob }),
      ])
      notify(t('anHeaderCaptureCopied'))
    } else {
      downloadBlob(blob, `${props.spaceName ?? 'analyse'}-${Date.now()}.png`)
      notify(t('anHeaderCaptureDownloaded'))
    }
  } catch (e) {
    console.error('[copy]', e)
    notify(t('anHeaderCopyFailed'), 'error')
  } finally {
    copying.value = false
  }
}

async function onShare() {
  sharing.value = true
  try {
    const blob = await captureScreenshot()
    const file = new File([blob], `${props.spaceName ?? 'analyse'}-${Date.now()}.png`, {
      type: 'image/png',
    })
    const shareData = {
      title: `${t('anHeaderDashboard')} ${props.spaceName ?? ''}`,
      text: `${t('anHeaderDashboard')} ${props.spaceName ?? ''} — DataFriday`,
      files: [file],
    }
    if (navigator.canShare && navigator.canShare(shareData)) {
      await navigator.share(shareData)
      notify(t('anHeaderShared'))
    } else if (navigator.share) {
      await navigator.share({ title: shareData.title, text: shareData.text, url: window.location.href })
      notify(t('anHeaderLinkShared'))
      downloadBlob(blob, file.name)
    } else {
      downloadBlob(blob, file.name)
      notify(t('anHeaderNativeShareUnavailable'), 'info')
    }
  } catch (e) {
    if (e?.name === 'AbortError') return
    console.error('[share]', e)
    notify(t('anHeaderShareFailed'), 'error')
  } finally {
    sharing.value = false
  }
}
</script>


<style scoped>
.analyse-header {
  /* Bordure et couleurs dérivées du thème Vuetify (light/dark) — la topbar
     suit le mode choisi par l'utilisateur. Les encadrés KPI restent
     visibles dans les deux modes grâce à leur bordure colorée propre. */
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  position: sticky !important;
  top: 0 !important;
  z-index: 1008 !important;
  transition:
    box-shadow 160ms ease,
    border-color 160ms ease;
}
.analyse-header--scrolled {
  border-bottom-color: rgba(var(--v-theme-on-surface), 0.16);
}
.space-name {
  font-size: 16px;
  color: rgb(var(--v-theme-on-surface));
}
.space-name-chevron {
  color: rgba(var(--v-theme-on-surface), 0.6) !important;
}
.space-name-trigger {
  background: transparent;
  border: 0;
  padding: 4px 8px;
  border-radius: 6px;
  cursor: pointer;
  color: inherit;
  transition: background-color 120ms ease;
}
.space-name-trigger:hover {
  background-color: rgba(var(--v-theme-on-surface), 0.06);
}

/* ── Sélecteur d'espaces : Bootstrap 5 + accents rouge marque (dark-aware) ── */
.ss-bs.card {
  width: 300px;
  background: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.1) !important;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.16) !important;
}
.ss-bs__icon {
  width: 24px;
  height: 24px;
  background: rgba(255, 49, 49, 0.1);
  color: #ff3131;
  flex-shrink: 0;
}
.ss-bs__title {
  font-size: 11px;
  letter-spacing: 0.5px;
  color: rgba(var(--v-theme-on-surface), 0.55);
}
.ss-bs__count {
  background: rgba(255, 49, 49, 0.12) !important;
  color: #ff3131 !important;
  font-size: 11px;
  font-weight: 700;
}
/* Recherche : form-control Bootstrap avec focus rouge marque */
.ss-bs__search .input-group-text,
.ss-bs__search .form-control {
  background: rgba(var(--v-theme-on-surface), 0.03);
  border-color: #e5e7eb;
  color: rgb(var(--v-theme-on-surface));
}
.ss-bs__search .input-group-text { color: #9ca3af; }
.ss-bs__search .form-control::placeholder { color: #9ca3af; }
.ss-bs__search .form-control:focus {
  border-color: #ff3131;
  box-shadow: none;
}
.ss-bs__search:focus-within .input-group-text,
.ss-bs__search:focus-within .form-control {
  border-color: #ff3131;
  background: rgb(var(--v-theme-surface));
}
.ss-bs__search:focus-within {
  border-radius: 999px;
  box-shadow: 0 0 0 3px rgba(255, 49, 49, 0.12);
}
.ss-bs__scroll { max-height: 280px; overflow-y: auto; }
/* Lignes list-group : accent rouge sur actif, pas d'icône devant */
.ss-bs__item {
  background: transparent;
  color: rgb(var(--v-theme-on-surface));
  border: 0 !important;
  font-size: 13.5px;
  padding: 9px 14px;
}
.ss-bs__item:hover { background: rgba(var(--v-theme-on-surface), 0.05); color: rgb(var(--v-theme-on-surface)); }
.ss-bs__item:focus { box-shadow: none; }
.ss-bs__item--active { background: rgba(255, 49, 49, 0.08); }
.ss-bs__item--active span { color: #ff3131; font-weight: 700; }
.ss-bs__check { color: #ff3131; flex-shrink: 0; }
.ss-bs__footer {
  border: 0;
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  color: rgba(var(--v-theme-on-surface), 0.8);
  font-size: 13px;
  font-weight: 600;
  padding: 10px 14px;
}
.ss-bs__footer:hover { background: rgba(255, 49, 49, 0.06); color: #ff3131; }
.kpi-row {
  /* Lot 4.8 — espacement plus généreux entre les KPI du topbar
     (cf. modifs.yaml — padding/marges insuffisants en mode desktop). */
  gap: 8px;
  padding: 4px 8px;
  /* Distribute available width equally so each KPI pill takes the same column,
     regardless of label length (cf. screenshot — "MOYENNE PAR TRANSACTION"
     used to dwarf shorter pills). */
  flex: 1 1 auto;
  display: flex;
}
.kpi-cell {
  /* Same flex basis ensures equal widths across all 8 cells. */
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  /* Carte (parité WorkspaceAppHeader / EventPredict) : fond BLANC, border neutre
     + rail latéral 3px coloré (la couleur du KPI migre de la bordure au rail),
     valeur en sombre. */
  padding: 5px 10px 5px 12px;
  border-radius: 9px;
  border: 1px solid #e2e8f0;
  background: #ffffff;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  position: relative;
  overflow: hidden;
}
.kpi-cell::before {
  content: "";
  position: absolute;
  inset: 0 auto 0 0;
  width: 3px;
  background: var(--kpi-color, #64748b);
}
.kpi-cell-btn {
  cursor: pointer;
  appearance: none;
  font: inherit;
  transition:
    background-color 140ms ease,
    box-shadow 140ms ease,
    transform 140ms ease;
}
.kpi-cell-btn:hover {
  background-color: rgba(var(--kpi-rgb), 0.12);
  box-shadow: 0 0 0 4px rgba(var(--kpi-rgb), 0.08);
}
.kpi-cell-btn:active {
  transform: translateY(1px);
}
.kpi-cell-btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(var(--kpi-rgb), 0.35);
}
.kpi-label {
  /* Carte à fond blanc → gris fixe (pas de dérivé thème : la cellule reste
     toujours blanche). */
  color: #64748b;
  font-size: 8px;
  font-weight: 700;
  line-height: 1.1;
  margin-bottom: 1px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  /* Long labels (e.g. "MOYENNE PAR TRANSACTION") wrap on 2 lines instead of
     stretching the cell — keeps the 8-pill strip equal-width. */
  white-space: normal;
  overflow-wrap: break-word;
  word-break: break-word;
  max-width: 100%;
}
.kpi-value {
  font-size: 12px;
  font-weight: 800;
  line-height: 1.15;
  letter-spacing: -0.2px;
  color: #0f172a;
  font-variant-numeric: tabular-nums;
}
.kpi-variation {
  font-size: 10px;
  font-weight: 600;
  line-height: 1;
  display: flex;
  align-items: center;
  gap: 2px;
  margin-top: 2px;
}
.alerts-card {
  border-radius: 12px;
  overflow: hidden;
}
.alerts-list {
  max-height: 420px;
  overflow-y: auto;
}
.alert-item {
  border-left: 3px solid transparent;
  cursor: pointer;
  transition: background-color 120ms ease;
}
.alert-item:hover {
  background-color: rgba(0, 0, 0, 0.03);
}
.alert-item--unread {
  border-left-color: #7C4DFF;
  background-color: rgba(124, 77, 255, 0.04);
}

/* ── Profil utilisateur (parité DashboardView) ── */
.user-profile {
  display: flex;
  align-items: center;
  padding: 8px 16px;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  margin-right: 8px;
}
.user-profile:hover {
  background-color: rgba(255, 49, 49, 0.08);
  transform: translateY(-1px);
}
.user-avatar {
  transition: all 0.3s ease;
  box-shadow: 0 2px 8px rgba(255, 49, 49, 0.2);
}
.user-profile:hover .user-avatar {
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(255, 49, 49, 0.3);
}
.user-info {
  display: flex;
  flex-direction: column;
}
.user-name {
  font-size: 0.875rem;
  font-weight: 600;
  color: rgb(var(--v-theme-on-surface));
  line-height: 1.2;
}
.user-role {
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
  line-height: 1.2;
}
.user-menu-card {
  min-width: 300px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  animation: slideDown 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
}
@keyframes slideDown {
  from { opacity: 0; transform: translateY(-8px); }
  to   { opacity: 1; transform: translateY(0); }
}
.ump-header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px 16px 14px;
}
.ump-avatar {
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(255, 49, 49, 0.25);
}
.ump-header-info { flex: 1; min-width: 0; }
.ump-name {
  font-size: 0.9375rem;
  font-weight: 700;
  color: rgb(var(--v-theme-on-surface));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ump-email {
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-surface), 0.55);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 1px;
}
.ump-details {
  padding: 10px 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ump-detail-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), 0.65);
}
.ump-detail-icon { flex-shrink: 0; color: rgba(var(--v-theme-on-surface), 0.4); }
.ump-action-item {
  transition: background 0.15s ease;
  min-height: 36px !important;
}
.ump-action-item .ump-action-icon { color: rgba(var(--v-theme-on-surface), 0.55); }
.ump-action-item--logout:hover {
  background-color: rgba(255, 49, 49, 0.07) !important;
  color: #ff3131;
}
</style>
