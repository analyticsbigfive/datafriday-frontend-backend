<template>
  <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
    <!-- Header -->
    <header class="bg-white dark:bg-gray-900 border-b px-6 py-4 flex items-center justify-between">
      <div class="flex items-center gap-4">
        <!-- Burger gauche : navigation principale -->
        <Button
          variant="ghost"
          size="icon"
          aria-label="Ouvrir la navigation"
          @click="mainNavOpen = true"
        >
          <Menu class="w-5 h-5" />
        </Button>
        <!-- Mobile Burger Menu Button (sidebar interne de la page) -->
        <Button
          v-if="isMobile"
          variant="ghost"
          size="icon"
          @click="openMobileMenu"
        >
          <Menu class="w-5 h-5" />
        </Button>

        <h1 class="text-xl">Edit Events</h1>
      </div>

      <div class="flex items-center gap-2">
        <!-- Close Button -->
        <BaseButton variant="ghost" size="icon" @click="handleClose">
          <X class="w-5 h-5" />
        </BaseButton>

        <!-- Notification Icon -->
        <Button
          v-if="onOpenNotifications"
          variant="ghost"
          size="icon"
          class="relative"
          @click="handleOpenNotifications"
        >
          <IconBell class="w-5 h-5" />
          <span class="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
        </Button>

        <!-- User Menu (avatar) -->
        <UserMenu :onOpenProfile="handleOpenProfileFromSettings" />
      </div>
    </header>

    <!-- Navigation principale (drawer gauche) -->
    <MainNav
      v-model="mainNavOpen"
      :onOpenMenu="handleOpenMenuFromSettings"
      :onOpenEvents="handleOpenEventsFromSettings"
      :onOpenHR="handleOpenHRFromSettings"
      :onOpenAccount="handleOpenAccountFromSettings"
      :onOpenFBIntegration="handleOpenFBIntegrationFromSettings"
    />

    <div class="flex-1 flex overflow-hidden">
      <!-- Sidebar - Desktop -->
      <aside
        v-if="!isMobile"
        class="w-64 bg-white dark:bg-gray-900 border-r dark:border-gray-800"
      >
        <ScrollArea class="h-full">
          <nav class="p-4 space-y-1">
            <button
              v-for="item in sidebarMenuItems"
              :key="item.id"
              @click="setActiveMenu(item.id)"
              :class="[
                'w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-colors',
                activeMenu === item.id
                  ? 'bg-blue-50 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
              ]"
            >
              <component :is="item.icon" class="w-5 h-5" />
              <span>{{ item.label }}</span>
            </button>
          </nav>
        </ScrollArea>
      </aside>

      <!-- Mobile Sidebar Sheet -->
      <Sheet v-if="isMobile" :open="mobileMenuOpen" @update:open="setMobileMenuOpen">
        <SheetContent side="left" class="w-64 p-0">
          <SheetHeader class="p-4 border-b">
            <SheetTitle>Menu</SheetTitle>
            <SheetDescription class="sr-only">
              Navigate between different event management sections
            </SheetDescription>
          </SheetHeader>

          <ScrollArea class="h-[calc(100vh-5rem)]">
            <nav class="p-4 space-y-1">
              <button
                v-for="item in sidebarMenuItems"
                :key="item.id"
                @click="handleMobileMenuClick(item.id)"
                :class="[
                  'w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-colors',
                  activeMenu === item.id
                    ? 'bg-blue-50 text-blue-600'
                    : 'text-gray-700 hover:bg-gray-100'
                ]"
              >
                <component :is="item.icon" class="w-5 h-5" />
                <span>{{ item.label }}</span>
              </button>
            </nav>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      <!-- Main Content -->
      <main class="flex-1 overflow-hidden">
        <EventsListPanel v-if="activeMenu === 'events'" />
        <EventTypesPanel v-else-if="activeMenu === 'event-types'" />
        <EventCategoriesPanel v-else-if="activeMenu === 'event-categories'" />
        <EventSubcategoriesPanel v-else-if="activeMenu === 'event-subcategories'" />
      </main>
    </div>
  </div>
</template>

<script>
// Remplace ces imports par tes composants Vue équivalents.
import UserMenu from './UserMenu.vue'
import MainNav from './MainNav.vue'
import EventsListPanel from './EventsListPanel.vue'
import EventTypesPanel from './EventTypesPanel.vue'
import EventCategoriesPanel from './EventCategoriesPanel.vue'
import EventSubcategoriesPanel from './EventSubcategoriesPanel.vue'

// “UI primitives” (placeholders)
import Button from '../ui/button.vue';
import ScrollArea from '../ui/scrollArea.vue';
import Sheet from '../ui/sheet.vue';
import SheetContent from '../ui/sheetContent.vue'
import SheetHeader from '../ui/sheetHeader.vue'
import SheetTitle from '../ui/sheetTitle.vue'
import SheetDescription from '../ui/sheetDescription.vue'
// Icônes: à mapper selon ta lib (lucide-vue-next, unplugin-icons, etc.)

import { X, Bell, Calendar, Tag, Tags, List as ListIcon, Menu } from 'lucide-vue-next';


export default {
  name: 'ConsolidatedEventsView',

  components: {
    UserMenu,
    MainNav,
    EventsListPanel,
    EventTypesPanel,
    EventCategoriesPanel,
    EventSubcategoriesPanel,

    Button,
    ScrollArea,
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,

    X,
    Bell,
    Calendar,
    Tag,
    Tags,
    ListIcon,
    Menu
  },

  props: {
    onClose: { 
        type: Function, 
        required: true 
    },
    onOpenNotifications: { 
        type: Function, 
        required: false 
    },
    initialView: { 
        type: String, 
        default: 'events' 
    },
    onOpenMenu: { 
        type: Function, 
        required: false 
    },
    onOpenSpace: { 
        type: Function, 
        required: false 
    },
    onOpenEvents: { 
        type: Function, 
        required: false 
    },
    onOpenHR: { 
        type: Function, 
        required: false 
    },
    onOpenAccount: { 
        type: Function, 
        required: false 
    },
    onOpenFBIntegration: { 
        type: Function, 
        required: false 
    }
  },

  data() {
    return {
      activeMenu: this.initialView,
      mobileMenuOpen: false,
      mainNavOpen: false
    }
  },

  computed: {
    // Remplace par ton implémentation (store, composable, matchMedia...)
    isMobile() {
      // exemple très simple (pas SSR-safe, à adapter)
      return typeof window !== 'undefined' ? window.innerWidth < 768 : false
    },

    sidebarMenuItems() {
      return [
        { id: 'events', label: 'Events', icon: 'IconCalendar' },
        { id: 'event-types', label: 'Event Types', icon: 'IconTag' },
        { id: 'event-categories', label: 'Event Categories', icon: 'IconTags' },
        { id: 'event-subcategories', label: 'Event Subcategories', icon: 'IconList' }
      ]
    }
  },

  watch: {
    // équivalent du useEffect([initialView])
    initialView(newVal) {
      this.activeMenu = newVal
    }
  },

  methods: {
    setActiveMenu(id) {
      this.activeMenu = id
    },

    setMobileMenuOpen(val) {
      this.mobileMenuOpen = val
    },

    openMobileMenu() {
      this.mobileMenuOpen = true
    },

    handleMobileMenuClick(id) {
      this.activeMenu = id
      this.mobileMenuOpen = false
    },

    handleClose() {
      this.onClose()
    },

    handleOpenNotifications() {
      if (this.onOpenNotifications) this.onOpenNotifications()
    },

    // --- SettingsMenu handlers (même logique que React) ---
    handleOpenMenuFromSettings(view) {
      if (this.onOpenMenu && view) {
        this.onOpenMenu(view)
        this.onClose()
      }
    },

    handleOpenProfileFromSettings() {
      console.log('Profile clicked from Events View')
    },

    handleEditSpaceFromSettings(spaceId) {
      if (this.onOpenSpace) {
        this.onOpenSpace(spaceId)
        this.onClose()
      }
    },

    handleOpenEventsFromSettings(view) {
      if (view) {
        this.activeMenu = view
        if (this.onOpenEvents) this.onOpenEvents(view)
      }
    },

    handleOpenHRFromSettings(view) {
      if (this.onOpenHR && view) {
        this.onOpenHR(view)
        this.onClose()
      }
    },

    handleOpenAccountFromSettings(view) {
      if (this.onOpenAccount && view) {
        this.onOpenAccount(view)
        this.onClose()
      }
    },

    handleOpenFBIntegrationFromSettings() {
      if (this.onOpenFBIntegration) {
        this.onOpenFBIntegration()
        this.onClose()
      }
    }
  }
}
</script>