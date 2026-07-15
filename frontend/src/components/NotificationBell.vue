<template>
  <!-- Cloche partagée : identique dans WorkspaceAppHeader (Analyse/Restock/
       Logistique/Inventaire) et EventPredict → « partie droite » harmonisée.
       Badge = non-lus réels du store. Aucun polling. -->
  <v-menu
    v-model="open"
    :close-on-content-click="false"
    location="bottom end"
    offset="10"
    @update:model-value="onToggle"
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

    <div class="notif-menu-surface">
      <NotificationPanel :on-close="close" />
    </div>
  </v-menu>
</template>

<script>
import { Bell } from 'lucide-vue-next'
import NotificationPanel from '@/components/NotificationPanel.vue'

export default {
  name: 'NotificationBell',

  components: { Bell, NotificationPanel },

  props: {
    ariaLabel: { type: String, default: 'Notifications' },
  },

  data: () => ({ open: false }),

  computed: {
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
    onToggle(v) {
      // Fermeture du panneau = « vu » → on éteint le badge, l'historique reste.
      if (!v) this.$store.dispatch('notifications/markAllRead')
    },
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
</style>
