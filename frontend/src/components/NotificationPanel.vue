<template>
  <div class="np-panel">
    <div class="np-head">
      <Bell :size="18" class="np-head-bell" />
      <span class="np-title">Notifications</span>
      <span v-if="unreadCount > 0" class="np-count-pill">
        {{ unreadCount }} non lue{{ unreadCount !== 1 ? 's' : '' }}
      </span>
      <button class="np-close" aria-label="Fermer" @click="onClose">
        <X :size="15" />
      </button>
    </div>

    <div v-if="notifications.length === 0" class="np-empty">
      <Bell :size="34" class="np-empty-bell" />
      <div class="np-empty-title">Aucune notification</div>
      <div class="np-empty-sub">Vous êtes à jour !</div>
    </div>

    <div v-else class="np-rows">
      <div
        v-for="notification in notifications"
        :key="notification.id"
        class="np-row"
        :class="{ 'np-row--read': notification.read }"
      >
        <div class="np-chip" :class="`np-chip--${getNotificationTone(notification.type)}`">
          <component :is="getNotificationIcon(notification.type)" :size="16" />
        </div>

        <div class="np-row-body">
          <div class="np-row-top">
            <span class="np-row-title">{{ notification.title }}</span>
            <span class="np-row-time">{{ formatTimestamp(notification.ts) }}</span>
          </div>
          <div v-if="notification.message" class="np-row-msg">
            {{ notification.message }}
          </div>
        </div>

        <span class="np-dot" :class="{ 'np-dot--off': notification.read }" />
      </div>
    </div>

    <div v-if="notifications.length > 0" class="np-foot">
      <button class="np-foot-btn" @click="markAllRead">Tout marquer lu</button>
      <button class="np-foot-btn np-foot-btn--danger" @click="clearAll">Tout effacer</button>
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

export default {
  name: 'NotificationPanel',

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
    // Source de vérité = store Vuex (miroir localStorage). Plus de mock.
    notifications() {
      return this.$store.getters['notifications/items'] || []
    },
    unreadCount() {
      return this.$store.getters['notifications/unreadCount'] || 0
    },
  },

  methods: {
    markAllRead() {
      this.$store.dispatch('notifications/markAllRead')
    },
    clearAll() {
      this.$store.dispatch('notifications/clear')
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

      if (diffMins < 1) return "À l'instant"
      if (diffMins < 60) return `il y a ${diffMins} min`
      if (diffHours < 24) return `il y a ${diffHours} h`
      return `il y a ${diffDays} j`
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
</style>
