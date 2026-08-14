<template>
  <!-- Cloche partagée : identique dans WorkspaceAppHeader (Analyse/Restock/
       Logistique/Inventaire) et EventPredict → « partie droite » harmonisée.
       Badge = non-lus réels du store. Aucun polling. -->
  <v-menu
    v-model="open"
    :close-on-content-click="false"
    location="bottom end"
    offset="10"
  >
    <template #activator="{ props: menuProps }">
      <v-btn
        icon
        variant="text"
        size="small"
        class="mr-1"
        :aria-label="ariaLabel"
        :title="ariaLabel"
        v-bind="menuProps"
      >
        <v-badge
          v-if="unreadCount > 0"
          color="#ff3131"
          :content="badgeContent"
          offset-x="-2"
          offset-y="2"
        >
          <Bell :size="20" />
        </v-badge>
        <Bell v-else :size="20" />
      </v-btn>
    </template>

    <!-- Surface téléportée (v-menu) → classe --dark sur sa propre racine
         (BUG-247-01, même contrainte que NotificationPanel). -->
    <div class="notif-menu-surface" :class="{ 'notif-menu-surface--dark': isDark }">
      <NotificationPanel :on-close="close" />
    </div>
  </v-menu>
</template>

<script>
import { Bell } from 'lucide-vue-next'
import { useTheme } from 'vuetify'
import NotificationPanel from '@/components/NotificationPanel.vue'

export default {
  name: 'NotificationBell',

  components: { Bell, NotificationPanel },

  setup() {
    const { global } = useTheme()
    return { theme: global }
  },

  props: {
    ariaLabel: { type: String, default: 'Notifications' },
  },

  data: () => ({ open: false }),

  computed: {
    isDark() {
      return this.theme.current.value.dark
    },
    unreadCount() {
      return this.$store.getters['notifications/unreadCount'] || 0
    },
    badgeContent() {
      return this.unreadCount > 99 ? '99+' : String(this.unreadCount)
    },
  },

  methods: {
    close() {
      this.open = false
    },
    // Plus de markAllRead à la fermeture (harmonisation 14/08) : le badge ne
    // s'éteint que par clic sur un item (markRead) ou « Tout marquer lu » —
    // sinon il ne mesure rien.
  },
}
</script>

<style scoped>
.notif-menu-surface {
  width: 360px;
  max-width: calc(100vw - 24px);
  max-height: min(520px, calc(100vh - 96px));
  display: flex;
  flex-direction: column;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  box-shadow: 0 12px 40px rgba(15, 23, 42, 0.18);
  overflow: hidden;
}

/* Dark (BUG-247-01) — overrides uniquement, clair inchangé. */
.notif-menu-surface--dark {
  background: #1e293b;
  border-color: rgba(255, 255, 255, .08);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
}
</style>
