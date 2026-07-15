<template>
  <v-menu
    v-model="menuOpen"
    :close-on-content-click="false"
    location="bottom end"
    offset="8"
  >
    <template #activator="{ props: menuProps }">
      <button
        type="button"
        class="user-menu-avatar"
        v-bind="menuProps"
        :title="displayName || 'Compte'"
        aria-label="Ouvrir le menu utilisateur"
      >
        <img
          v-if="avatarUrl"
          :src="avatarUrl"
          :alt="displayName || 'Avatar'"
          class="user-menu-avatar-img"
        />
        <span v-else class="user-menu-avatar-initials">{{ initials }}</span>
      </button>
    </template>

    <v-card width="288" class="user-menu-card" elevation="6">
      <!-- Profil -->
      <div class="user-menu-profile pa-3 d-flex align-center">
        <div class="user-menu-profile-avatar mr-3">
          <img
            v-if="avatarUrl"
            :src="avatarUrl"
            :alt="displayName || 'Avatar'"
            class="user-menu-avatar-img"
          />
          <span v-else class="user-menu-avatar-initials">{{ initials }}</span>
        </div>
        <div class="d-flex flex-column min-w-0">
          <span class="text-body-2 font-weight-medium text-truncate">
            {{ displayName || 'Utilisateur' }}
          </span>
          <span class="text-caption text-medium-emphasis text-truncate">
            {{ email || '—' }}
          </span>
        </div>
      </div>

      <!-- Bandeau organisation -->
      <div v-if="organizationName" class="user-menu-org d-flex align-center px-3 py-2">
        <v-icon size="16" class="mr-2 text-medium-emphasis">mdi-domain</v-icon>
        <span class="text-caption text-medium-emphasis text-uppercase mr-2">Organisation</span>
        <span class="text-body-2 font-weight-medium text-truncate" :title="organizationName">
          {{ organizationName }}
        </span>
      </div>

      <v-divider />

      <!-- Préférences -->
      <v-list density="compact" class="py-1">
        <v-list-item class="pa-0">
          <ThemeToggle />
        </v-list-item>

        <v-list-item
          prepend-icon="mdi-translate"
          class="user-menu-list-item"
          @click="onLanguageClick"
        >
          <v-list-item-title class="text-body-2">Langue</v-list-item-title>
          <template #append>
            <span class="text-caption text-medium-emphasis">{{ language }}</span>
          </template>
        </v-list-item>

        <v-list-item
          v-if="onOpenProfile"
          prepend-icon="mdi-account-outline"
          class="user-menu-list-item"
          @click="handleOpenProfile"
        >
          <v-list-item-title class="text-body-2">Profil</v-list-item-title>
        </v-list-item>
      </v-list>

      <v-divider />

      <!-- Déconnexion -->
      <v-list density="compact" class="py-1">
        <v-list-item
          prepend-icon="mdi-logout"
          class="user-menu-list-item user-menu-logout"
          :disabled="loggingOut"
          @click="handleLogout"
        >
          <v-list-item-title class="text-body-2">
            {{ loggingOut ? 'Déconnexion…' : 'Déconnexion' }}
          </v-list-item-title>
        </v-list-item>
      </v-list>
    </v-card>
  </v-menu>
</template>

<script setup>
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { useStore } from 'vuex'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import ThemeToggle from '@/ui/themeToggle.vue'
import { getCurrentLocale, setCurrentLocale } from '@/i18n'

defineProps({
  // Conservé pour compatibilité avec les pages qui voulaient ouvrir un
  // écran « Profil » dédié — facultatif (le menu inclut déjà l'identité).
  onOpenProfile: { type: Function, default: null },
})

const router = useRouter()
const store = useStore()

const menuOpen = ref(false)
const loggingOut = ref(false)
const locale = ref(getCurrentLocale())
const language = computed(() => locale.value.toUpperCase())
const userMeta = ref(null)

function handleLocaleChanged(event) {
  locale.value = event.detail.locale
}

onMounted(async () => {
  window.addEventListener('locale-changed', handleLocaleChanged)
  try {
    const { data } = await supabase.auth.getUser()
    userMeta.value = data?.user || null
  } catch (e) {
    // Pas de session active — on laisse les fallbacks afficher des placeholders.
    console.warn('[UserMenu] getUser KO:', e?.message)
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('locale-changed', handleLocaleChanged)
})

const displayName = computed(() => {
  const meta = userMeta.value?.user_metadata || {}
  return meta.full_name || meta.name || userMeta.value?.email?.split('@')[0] || ''
})

const email = computed(() => userMeta.value?.email || '')

const organizationName = computed(() => {
  return (
    store.getters['auth/tenantName'] ||
    store.getters['auth/currentTenant']?.name ||
    ''
  )
})

const avatarUrl = computed(() => {
  const meta = userMeta.value?.user_metadata || {}
  return meta.avatar_url || meta.picture || null
})

const initials = computed(() => {
  const src = displayName.value || email.value || '?'
  const parts = src.replace(/[^a-zA-Z0-9 ]/g, ' ').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
})

function handleOpenProfile() {
  menuOpen.value = false
}

function onLanguageClick() {
  setCurrentLocale(locale.value === 'fr' ? 'en' : 'fr')
}

async function handleLogout() {
  loggingOut.value = true
  try {
    if (store.hasModule && store.hasModule('auth')) {
      await store.dispatch('auth/signOut')
    } else {
      await supabase.auth.signOut()
    }
  } catch (e) {
    console.error('[UserMenu] signOut KO:', e?.message)
  } finally {
    loggingOut.value = false
    menuOpen.value = false
    try { await router.push('/login') } catch (_) { /* route absente : noop */ }
  }
}
</script>

<style scoped>
.user-menu-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.16);
  background: rgba(var(--v-theme-on-surface), 0.04);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  overflow: hidden;
  transition: background-color 120ms ease, box-shadow 120ms ease;
  padding: 0;
}
.user-menu-avatar:hover {
  background: rgba(var(--v-theme-on-surface), 0.08);
}
.user-menu-avatar:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(var(--v-theme-primary), 0.35);
}
.user-menu-avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.user-menu-avatar-initials {
  font-size: 13px;
  font-weight: 600;
  color: rgb(var(--v-theme-on-surface));
}
.user-menu-card {
  border-radius: 12px;
  overflow: hidden;
}
.user-menu-org {
  background: rgba(var(--v-theme-on-surface), 0.04);
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.06);
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.06);
}
.user-menu-profile-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: rgba(var(--v-theme-on-surface), 0.06);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
}
.user-menu-list-item {
  min-height: 40px;
}
.user-menu-logout :deep(.v-list-item__prepend > .v-icon) {
  color: rgb(var(--v-theme-error));
}
</style>
