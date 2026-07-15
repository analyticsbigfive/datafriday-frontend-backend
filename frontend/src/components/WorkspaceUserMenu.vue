<template>
  <v-menu v-model="showUserMenu" :close-on-content-click="false" location="bottom end" offset="8">
    <template #activator="{ props: menuProps }">
      <div class="user-profile" v-bind="menuProps">
        <v-avatar :size="compact ? 30 : 36" color="#ff3131" class="user-avatar">
          <span class="text-white font-weight-bold" style="font-size: 0.85rem;">{{ userInitials }}</span>
        </v-avatar>
        <div v-if="!compact" class="user-info ml-3 d-none d-sm-flex">
          <div class="user-name">{{ userName }}</div>
          <div class="user-role">{{ userRoleName || tenant?.name || 'Admin' }}</div>
        </div>
        <ChevronDown :size="16" class="ml-2 d-none d-sm-block" />
      </div>
    </template>

    <v-card class="user-menu-card" elevation="8" rounded="lg">
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

      <v-list density="compact" class="pa-1">
        <v-list-item rounded="lg" class="ump-action-item" @click="goToProfile">
          <template #prepend><UserCog :size="16" class="mr-3 ump-action-icon" /></template>
          <v-list-item-title class="text-body-2">Profil</v-list-item-title>
        </v-list-item>
        <v-list-item rounded="lg" class="ump-action-item ump-action-item--logout" @click="onSignOut">
          <template #prepend><LogOut :size="16" class="mr-3" /></template>
          <v-list-item-title class="text-body-2">Se déconnecter</v-list-item-title>
        </v-list-item>
      </v-list>
    </v-card>
  </v-menu>
</template>

<script setup>
// Menu profil utilisateur UNIQUE pour tous les headers workspace (Analyse /
// Predict / Event Predict / Inventory / Logistic / Restock). Extrait de
// WorkspaceAppHeader (lui-même parité DashboardView) pour garantir le même
// sous-menu partout, y compris dans les headers hors <v-app-bar> (EP overlay).
import { computed, ref } from 'vue'
import { useStore } from 'vuex'
import { useRouter } from 'vue-router'
import { Building2, ChevronDown, LogOut, Phone, UserCog } from 'lucide-vue-next'

defineProps({
  // Activateur réduit (avatar seul, sans nom/rôle) — utilisé par EP.
  compact: { type: Boolean, default: false },
})

const store = useStore()
const router = useRouter()

const user = computed(() => store.getters['auth/currentUser'] || null)
const tenant = computed(() => store.getters['auth/currentTenant'] || null)
const userName = computed(() => {
  if (user.value?.firstName && user.value?.lastName) return `${user.value.firstName} ${user.value.lastName}`
  return user.value?.email?.split('@')[0] || 'Utilisateur'
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
const showUserMenu = ref(false)

function goToProfile() {
  showUserMenu.value = false
  router.push({ path: '/profile' })
}
async function onSignOut() {
  try {
    await store.dispatch('auth/signOut')
    router.push('/login')
  } catch (e) { /* la session sera nettoyée au refresh */ }
}
</script>

<style scoped>
.user-profile {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.user-profile:hover { background-color: rgba(255, 49, 49, 0.08); transform: translateY(-1px); }
.user-avatar { transition: all 0.3s ease; box-shadow: 0 2px 8px rgba(255, 49, 49, 0.2); }
.user-profile:hover .user-avatar { transform: scale(1.05); box-shadow: 0 4px 12px rgba(255, 49, 49, 0.3); }
.user-info { display: flex; flex-direction: column; }
.user-name { font-size: 0.875rem; font-weight: 600; color: rgb(var(--v-theme-on-surface)); line-height: 1.2; }
.user-role { font-size: 0.75rem; color: rgba(var(--v-theme-on-surface), 0.6); line-height: 1.2; }
.user-menu-card { min-width: 300px; border: 1px solid rgba(var(--v-theme-on-surface), 0.12); overflow: hidden; }
.ump-header { display: flex; align-items: center; gap: 14px; padding: 18px 16px 14px; }
.ump-avatar { flex-shrink: 0; box-shadow: 0 2px 8px rgba(255, 49, 49, 0.25); }
.ump-header-info { flex: 1; min-width: 0; }
.ump-name { font-size: 0.9375rem; font-weight: 700; color: rgb(var(--v-theme-on-surface)); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ump-email { font-size: 0.75rem; color: rgba(var(--v-theme-on-surface), 0.55); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 1px; }
.ump-details { padding: 10px 16px; display: flex; flex-direction: column; gap: 6px; }
.ump-detail-row { display: flex; align-items: center; gap: 8px; font-size: 0.8125rem; color: rgba(var(--v-theme-on-surface), 0.65); }
.ump-detail-icon { flex-shrink: 0; color: rgba(var(--v-theme-on-surface), 0.4); }
.ump-action-item { transition: background 0.15s ease; min-height: 36px !important; }
.ump-action-item .ump-action-icon { color: rgba(var(--v-theme-on-surface), 0.55); }
.ump-action-item--logout:hover { background-color: rgba(255, 49, 49, 0.07) !important; color: #ff3131; }
</style>
