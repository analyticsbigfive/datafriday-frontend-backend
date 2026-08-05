<template>
  <v-navigation-drawer
    v-model="drawer"
    location="left"
    temporary
    width="288"
    class="main-nav-drawer"
  >
    <div class="main-nav-header pa-3 d-flex align-center">
      <span class="text-subtitle-2 font-weight-bold flex-grow-1">Navigation</span>
      <v-btn
        icon="mdi-close"
        size="small"
        variant="text"
        density="comfortable"
        aria-label="Fermer"
        @click="drawer = false"
      />
    </div>
    <v-divider />

    <v-list density="comfortable" nav class="pa-2">
      <v-list-item
        v-if="onNavigateToSpaces && can('nav.spaces')"
        prepend-icon="mdi-domain"
        title="Espaces"
        @click="trigger('spaces')"
      />
      <!-- Outils F&B (Analyse / Prédire / Préd. Événement / Live) : ce tiroir
           sert SpacesPage, MenuBuilder et Account — sans ces entrées, les outils
           et le Live n'étaient atteignables que depuis le dropdown « Outils »
           interne aux écrans Analyse/EventPredict/Inventaire/Logistique/
           Réarmement. Comme Inventory/Réarmement ci-dessous, ils passent par
           `trigger()` qui résout `:spaceId` depuis la route (repli /spaces). -->
      <v-list-item
        v-if="can('front.fb.analyse')"
        prepend-icon="mdi-chart-line"
        title="Analyse"
        @click="trigger('space-analyse')"
      />
      <v-list-item
        v-if="can('front.fb.predict')"
        prepend-icon="mdi-trending-up"
        title="Prédire"
        @click="trigger('space-predict')"
      />
      <v-list-item
        v-if="can('front.fb.eventPredict')"
        prepend-icon="mdi-lightning-bolt"
        title="Préd. Événement"
        @click="trigger('space-event-predict')"
      />
      <v-list-item
        v-if="can('front.fb.live')"
        prepend-icon="mdi-record-circle-outline"
        title="Live"
        @click="trigger('space-live')"
      />
      <v-list-item
        v-if="onOpenAccount && canAny(ACCOUNT_CODES)"
        prepend-icon="mdi-account-circle-outline"
        title="Account"
        @click="trigger('account')"
      />
      <v-list-item
        v-if="onOpenEvents && can('menu.events.manage')"
        prepend-icon="mdi-calendar-star"
        title="Events"
        @click="trigger('events')"
      />
      <v-list-item
        v-if="onOpenHR && can('menu.hr.manage')"
        prepend-icon="mdi-account-multiple-outline"
        title="HR"
        @click="trigger('hr')"
      />
      <v-list-item
        v-if="onOpenFBIntegration && can('menu.integration.fb')"
        prepend-icon="mdi-database-sync-outline"
        title="F&B Integration"
        @click="trigger('fb')"
      />
      <v-list-item
        v-if="onOpenInventory && can('front.fb.spaceInventory')"
        prepend-icon="mdi-package-variant-closed"
        title="Inventory"
        @click="trigger('inventory')"
      />
      <v-list-item
        v-if="can('front.fb.spaceInventory')"
        prepend-icon="mdi-clipboard-arrow-up-outline"
        title="Pre-event Inventory"
        @click="trigger('space-pre-inventory')"
      />
      <v-list-item
        v-if="can('front.fb.spaceInventory')"
        prepend-icon="mdi-clipboard-list-outline"
        title="Post-event Inventory"
        @click="trigger('space-inventory')"
      />
      <v-list-item
        v-if="can('front.fb.logistic')"
        prepend-icon="mdi-forklift"
        title="Logistique"
        @click="trigger('space-logistic')"
      />
      <v-list-item
        v-if="canAny(RESTOCK_CODES)"
        prepend-icon="mdi-truck-delivery-outline"
        title="Réarmement"
        @click="trigger('restock')"
      />
      <v-list-item
        v-if="onOpenMenu && canAny(FB_MENU_CODES)"
        prepend-icon="mdi-silverware-fork-knife"
        title="F&B Menu"
        @click="trigger('menu')"
      />
    </v-list>
  </v-navigation-drawer>
</template>

<script setup>
import { computed } from 'vue'
import { usePermissions } from '@/composables/usePermissions'

const { can, canAny } = usePermissions()
const FB_MENU_CODES = [
  'menu.fb.suppliers',
  'menu.fb.marketPrices',
  'menu.fb.components',
  'menu.fb.menuItems',
  'menu.fb.spaceMenu',
]
const ACCOUNT_CODES = ['org.users.view', 'org.roles.manage', 'org.permissions.manage']
const RESTOCK_CODES = ['front.fb.restock', 'front.fb.restockBoard']

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  onNavigateToSpaces: { type: Function, default: null },
  onOpenAccount: { type: Function, default: null },
  onOpenEvents: { type: Function, default: null },
  onOpenHR: { type: Function, default: null },
  onOpenFBIntegration: { type: Function, default: null },
  onOpenInventory: { type: Function, default: null },
  onOpenMenu: { type: Function, default: null },
})

const emit = defineEmits(['update:modelValue'])

const drawer = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

import { useRouter, useRoute } from 'vue-router'
const router = useRouter()
const route = useRoute()

// Destinations scopées à un espace : le `:spaceId` vient de la route courante.
// Ce tiroir est aussi ouvert depuis des pages HORS espace (SpacesPage, Account,
// MenuBuilder) où il n'y a pas de spaceId → repli sur `/spaces` pour que
// l'utilisateur en choisisse un. Analyse/Prédire/Préd. Événement partagent la
// route `space-analyse`, différenciées par `?toolbox=` ; Live a sa route dédiée.
const SPACE_SCOPED_PATHS = {
  'space-analyse': (id) => `/spaces/${id}`,
  'space-predict': (id) => `/spaces/${id}?toolbox=predict`,
  'space-event-predict': (id) => `/spaces/${id}?toolbox=event-predict`,
  'space-live': (id) => `/spaces/${id}/live`,
  'space-pre-inventory': (id) => `/spaces/${id}/pre-inventory`,
  'space-inventory': (id) => `/spaces/${id}/inventory`,
  'space-logistic': (id) => `/spaces/${id}/logistic`,
  restock: (id) => `/spaces/${id}/restock`,
}

function trigger(kind) {
  const toPath = SPACE_SCOPED_PATHS[kind]
  if (toPath) {
    const spaceId = route.params?.spaceId
    router.push(spaceId ? toPath(spaceId) : '/spaces')
    drawer.value = false
    return
  }
  const handlers = {
    spaces: props.onNavigateToSpaces,
    account: props.onOpenAccount,
    events: props.onOpenEvents,
    hr: props.onOpenHR,
    fb: props.onOpenFBIntegration,
    inventory: props.onOpenInventory,
    menu: props.onOpenMenu,
  }
  const fn = handlers[kind]
  if (typeof fn === 'function') fn()
  drawer.value = false
}
</script>

<style scoped>
.main-nav-drawer {
  z-index: 1200;
}
.main-nav-header {
  min-height: 56px;
}
</style>
