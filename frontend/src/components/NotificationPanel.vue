<template>
  <!-- Classe --dark sur la racine PROPRE : le panneau vit dans un v-menu
       téléporté hors du v-app, .v-theme--dataFridayDark n'y descend pas
       (BUG-198/199). isDark vient de useTheme(), pas d'une prop. -->
  <div class="np-panel" :class="{ 'np-panel--dark': isDark }">
    <div class="np-head">
      <Bell :size="18" class="np-head-bell" />
      <span class="np-title">{{ t('notifPanelTitle') }}</span>
      <span v-if="unreadCount > 0" class="np-count-pill">
        {{ interpolate(t('notifUnreadPill'), { n: unreadCount }) }}
      </span>
      <button class="np-close" :aria-label="t('close')" @click="onClose">
        <X :size="15" />
      </button>
    </div>

    <div v-if="notifications.length === 0" class="np-empty">
      <Bell :size="34" class="np-empty-bell" />
      <div class="np-empty-title">{{ t('notifEmptyTitle') }}</div>
      <div class="np-empty-sub">{{ t('notifEmptySub') }}</div>
    </div>

    <div v-else class="np-rows">
      <!-- Ligne cliquable : marque LUE + navigue via meta (resolveNotificationRoute).
           Sans cible reconnue, le clic marque lu et ferme — jamais d'erreur. -->
      <div
        v-for="notification in notifications"
        :key="notification.id"
        class="np-row"
        :class="{ 'np-row--read': notification.read }"
        role="button"
        tabindex="0"
        :aria-label="t('notifOpenAria')"
        @click="onRowClick(notification)"
        @keydown.enter.prevent="onRowClick(notification)"
      >
        <div class="np-chip" :class="`np-chip--${getNotificationTone(notification.type)}`">
          <component :is="getNotificationIcon(notification.type)" :size="16" />
        </div>

        <div class="np-row-body">
          <div class="np-row-top">
            <span class="np-row-title">{{ displayTitle(notification) }}</span>
            <span class="np-row-time">{{ formatTimestamp(notification.ts) }}</span>
          </div>
          <div v-if="displayMessage(notification)" class="np-row-msg">
            {{ displayMessage(notification) }}
          </div>
        </div>

        <span class="np-dot" :class="{ 'np-dot--off': notification.read }" />
      </div>
    </div>

    <div v-if="notifications.length > 0" class="np-foot">
      <button class="np-foot-btn" @click="markAllRead">{{ t('notifMarkAllRead') }}</button>
      <button class="np-foot-btn np-foot-btn--danger" @click="clearAll">{{ t('notifClearAll') }}</button>
    </div>
  </div>
</template>

<script>
import {
  X,
  Bell,
  AlertCircle,
  CheckCircle,
  Info,
  CalendarClock,
  UtensilsCrossed,
  Package,
} from 'lucide-vue-next'
import { useTheme } from 'vuetify'
import { useI18n } from '@/i18n/useI18n'
import { resolveNotificationRoute, interpolate } from '@/utils/notificationRouting'

export default {
  name: 'NotificationPanel',

  setup() {
    const { global } = useTheme()
    // t() réactif au switch de langue — les items i18n (titleKey/messageKey)
    // sont traduits AU RENDU, pas au push.
    const { t } = useI18n()
    return { theme: global, t }
  },

  components: {
    X,
    Bell,
    AlertCircle,
    CheckCircle,
    Info,
    CalendarClock,
    UtensilsCrossed,
    Package,
  },

  props: {
    // Rendu le plus souvent dans un v-menu (NotificationBell) : la croix ferme.
    onClose: {
      type: Function,
      default: () => {},
    },
  },

  computed: {
    isDark() {
      return this.theme.current.value.dark
    },
    // Source de vérité = store Vuex (miroir localStorage). Plus de mock.
    notifications() {
      return this.$store.getters['notifications/items'] || []
    },
    unreadCount() {
      return this.$store.getters['notifications/unreadCount'] || 0
    },
  },

  methods: {
    interpolate,
    markAllRead() {
      this.$store.dispatch('notifications/markAllRead')
    },
    clearAll() {
      this.$store.dispatch('notifications/clear')
    },
    // Items i18n (titleKey/messageKey + params) traduits au rendu ; items
    // legacy (title/message en dur) affichés tels quels — rétro-compat LS.
    displayTitle(n) {
      return n.titleKey ? interpolate(this.t(n.titleKey), n.params) : n.title
    },
    displayMessage(n) {
      return n.messageKey ? interpolate(this.t(n.messageKey), n.params) : n.message
    },
    onRowClick(n) {
      this.$store.dispatch('notifications/markRead', n.id)
      const route = resolveNotificationRoute(n)
      // Fermer AVANT le push : la surface téléportée du v-menu ne doit pas
      // traîner au-dessus de la page de destination.
      this.onClose()
      if (route) this.$router.push(route).catch(() => {})
    },

    // Renvoie un NOM de composant (résolu par <component :is>).
    getNotificationIcon(type) {
      switch (type) {
        case 'event':
          return 'CalendarClock'
        case 'menuitem':
          return 'UtensilsCrossed'
        case 'inventory':
          return 'Package'
        case 'success':
          return 'CheckCircle'
        case 'warning':
        case 'error':
          return 'AlertCircle'
        default:
          return 'Info'
      }
    },

    // Teinte du chip icône : la couleur porte le type, sans envahir la ligne.
    getNotificationTone(type) {
      switch (type) {
        case 'event':
          return 'event'
        case 'menuitem':
        case 'success':
          return 'success'
        case 'inventory':
        case 'warning':
          return 'warning'
        case 'error':
          return 'error'
        default:
          return 'info'
      }
    },

    formatTimestamp(ts) {
      const d = typeof ts === 'number' ? new Date(ts) : new Date(ts || Date.now())
      const diffMs = Date.now() - d.getTime()
      const diffMins = Math.floor(diffMs / 60000)
      const diffHours = Math.floor(diffMs / 3600000)
      const diffDays = Math.floor(diffMs / 86400000)

      if (diffMins < 1) return this.t('notifJustNow')
      if (diffMins < 60) return interpolate(this.t('notifMinAgo'), { n: diffMins })
      if (diffHours < 24) return interpolate(this.t('notifHoursAgo'), { n: diffHours })
      return interpolate(this.t('notifDaysAgo'), { n: diffDays })
    },
  },
}
</script>

<style scoped>
.np-panel {
  background: #fff;
  color: #1f2937;
  font-size: 14px;
  display: flex;
  flex-direction: column;
  height: 100%;
  /* Dans le v-menu (surface flex + max-height), le panneau doit pouvoir
     rétrécir pour que la liste scrolle sans clipper le footer. */
  flex: 1;
  min-height: 0;
}

/* ---- Header ---- */
.np-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px 12px;
}
.np-head-bell {
  flex: none;
  color: #6b7280;
}
.np-title {
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.01em;
}
.np-count-pill {
  font-size: 11px;
  font-weight: 600;
  color: #ff3131;
  background: #fff1f1;
  border-radius: 999px;
  padding: 2px 8px;
}
.np-close {
  margin-left: auto;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  border: none;
  background: none;
  color: #9ca3af;
  display: grid;
  place-items: center;
  cursor: pointer;
}
.np-close:hover {
  background: #f9fafb;
  color: #1f2937;
}

/* ---- Liste ---- */
.np-rows {
  padding: 4px 8px 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  overflow-y: auto;
}
.np-row {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 10px;
  border-radius: 10px;
  transition: background 0.12s;
  cursor: pointer;
}
.np-row:hover {
  background: #f9fafb;
}

.np-chip {
  flex: none;
  width: 32px;
  height: 32px;
  border-radius: 9px;
  display: grid;
  place-items: center;
}
.np-chip--event {
  background: #eef2ff;
  color: #4f46e5;
}
.np-chip--success {
  background: #f0fdf4;
  color: #16a34a;
}
.np-chip--warning {
  background: #fff7ed;
  color: #ea580c;
}
.np-chip--error {
  background: #fef2f2;
  color: #dc2626;
}
.np-chip--info {
  background: #eff6ff;
  color: #2563eb;
}

.np-row-body {
  flex: 1;
  min-width: 0;
}
.np-row-top {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.np-row-title {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.np-row--read .np-row-title {
  font-weight: 500;
  color: #6b7280;
}
.np-row-time {
  margin-left: auto;
  flex: none;
  font-size: 11px;
  color: #9ca3af;
  font-variant-numeric: tabular-nums;
}
.np-row-msg {
  font-size: 13px;
  color: #6b7280;
  margin-top: 1px;
}

.np-dot {
  flex: none;
  align-self: center;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #ff3131;
}
.np-dot--off {
  visibility: hidden;
}

/* ---- Footer ---- */
.np-foot {
  display: flex;
  gap: 8px;
  padding: 10px 12px;
  border-top: 1px solid #e5e7eb;
}
.np-foot-btn {
  flex: 1;
  font: inherit;
  font-size: 12.5px;
  font-weight: 500;
  color: #6b7280;
  background: none;
  border: none;
  border-radius: 8px;
  padding: 7px 0;
  cursor: pointer;
}
.np-foot-btn:hover {
  background: #f9fafb;
  color: #1f2937;
}
.np-foot-btn--danger:hover {
  color: #ff3131;
  background: #fff1f1;
}

/* ---- État vide ---- */
.np-empty {
  padding: 36px 20px 40px;
  text-align: center;
}
.np-empty-bell {
  color: #9ca3af;
  opacity: 0.45;
  margin-bottom: 10px;
}
.np-empty-title {
  font-size: 13.5px;
  font-weight: 600;
}
.np-empty-sub {
  font-size: 12.5px;
  color: #9ca3af;
  margin-top: 2px;
}

/* ---- Dark (BUG-247-01) — palette slate, overrides uniquement, clair inchangé.
   Chips de type conservés (teintes pastel lisibles sur leurs propres fonds). ---- */
.np-panel--dark {
  background: #1e293b;
  color: #e2e8f0;
}
.np-panel--dark .np-head-bell { color: #94a3b8; }
.np-panel--dark .np-count-pill { background: rgba(255, 49, 49, .14); }
.np-panel--dark .np-close { color: #94a3b8; }
.np-panel--dark .np-close:hover { background: rgba(255, 255, 255, .08); color: #f9fafb; }
.np-panel--dark .np-row:hover { background: rgba(255, 255, 255, .04); }
.np-panel--dark .np-row--read .np-row-title { color: #94a3b8; }
.np-panel--dark .np-row-time { color: #64748b; }
.np-panel--dark .np-row-msg { color: #94a3b8; }
.np-panel--dark .np-foot { border-top-color: rgba(255, 255, 255, .08); }
.np-panel--dark .np-foot-btn { color: #94a3b8; }
.np-panel--dark .np-foot-btn:hover { background: rgba(255, 255, 255, .06); color: #f9fafb; }
.np-panel--dark .np-foot-btn--danger:hover { color: #ff3131; background: rgba(255, 49, 49, .12); }
.np-panel--dark .np-empty-bell { color: #64748b; }
.np-panel--dark .np-empty-sub { color: #64748b; }
</style>
