<template>
  <div class="h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
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
          <MenuIcon class="w-5 h-5" />
        </Button>
        <!-- Mobile Burger Menu Button (sidebar interne de la page) -->
        <Button
          v-if="isMobile"
          variant="ghost"
          size="icon"
          @click="mobileMenuOpen = true"
        >
          <MenuIcon class="w-5 h-5" />
        </Button>

        <h1 class="text-xl">Edit HR</h1>
      </div>

      <div class="flex items-center gap-2">
        <!-- Close Button -->
        <Button
          variant="ghost"
          size="icon"
          @click="handleClose"
        >
          <X class="w-5 h-5" />
        </Button>

        <!-- Notification Icon -->
        <Button
          v-if="onOpenNotifications"
          variant="ghost"
          size="icon"
          class="relative"
          @click="onOpenNotifications && onOpenNotifications()"
        >
          <Bell class="w-5 h-5" />
          <!-- Notification badge -->
          <span class="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
        </Button>

        <!-- User Menu (avatar) -->
        <UserMenu :onOpenProfile="handleOpenProfile" />
      </div>
    </header>

    <!-- Navigation principale (drawer gauche) -->
    <MainNav
      v-model="mainNavOpen"
      :onOpenMenu="handleOpenMenuFromSettings"
      :onOpenEvents="handleOpenEventsFromSettings"
      :onOpenHR="onOpenHR"
      :onOpenFBIntegration="onOpenFBIntegration"
    />

    <!-- Main Content -->
    <div class="flex flex-1 overflow-hidden">
      <!-- Desktop Sidebar -->
      <div
        v-if="!isMobile"
        class="w-64 bg-white dark:bg-gray-900 border-r dark:border-gray-800 flex flex-col"
      >
        <nav class="flex-1 p-2">
          <button
            v-for="item in sidebarMenuItems"
            :key="item.id"
            @click="setActiveTab(item.id)"
            class="w-full text-left px-4 py-2 rounded-md mb-1 flex items-center gap-3"
            :class="activeTab === item.id
              ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
              : 'hover:bg-gray-100 text-gray-700 dark:hover:bg-gray-800 dark:text-gray-300'"
          >
            <component :is="item.icon" class="w-5 h-5" />
            <span>{{ item.label }}</span>
          </button>
        </nav>
      </div>

      <!-- Mobile Sidebar Sheet -->
      <Sheet
        v-if="isMobile"
        :open="mobileMenuOpen"
        @openChange="val => mobileMenuOpen = val"
      >
        <SheetContent side="left" class="w-64 p-0">
          <SheetHeader class="p-4 border-b">
            <SheetTitle>HR Menu</SheetTitle>
            <SheetDescription>
              Navigate between HR sections
            </SheetDescription>
          </SheetHeader>
          <nav class="p-2">
            <button
              v-for="item in sidebarMenuItems"
              :key="item.id"
              @click="handleMobileSelect(item.id)"
              class="w-full text-left px-4 py-2 rounded-md mb-1 flex items-center gap-3"
              :class="activeTab === item.id
                ? 'bg-blue-50 text-blue-600'
                : 'hover:bg-gray-100 text-gray-700'"
            >
              <component :is="item.icon" class="w-5 h-5" />
              <span>{{ item.label }}</span>
            </button>
          </nav>
        </SheetContent>
      </Sheet>

      <!-- Main Content Area -->
      <main class="flex-1 overflow-hidden">
        <HRSuppliersView v-if="activeTab === 'suppliers'" />
        <StaffPositionsView v-if="activeTab === 'positions'" />
      </main>
    </div>
  </div>
</template>

<script>
import Button from '../ui/button.vue';
import UserMenu from './UserMenu.vue';
import MainNav from './MainNav.vue';
import { X, Users, Briefcase, Menu as MenuIcon, Bell } from 'lucide-vue-next';
import useIsMobile from '../ui/useMobile';
import Sheet from '../ui/sheet.vue';
import SheetContent from '../ui/sheetContent.vue'; 
import SheetHeader from '../ui/sheetHeader.vue';
import SheetTitle from '../ui/sheetTitle.vue';
import SheetDescription from '../ui/sheetDescription.vue';
import HRSuppliersView from './HRSuppliersView.vue';
import StaffPositionsView from './StaffPositionsView.vue';

export default {
  name: 'ConsolidatedHRView',
  components: {
    Button,
    UserMenu,
    MainNav,
    X,
    Users,
    Briefcase,
    MenuIcon,
    Bell,
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
    HRSuppliersView,
    StaffPositionsView,
  },
  props: {
    onClose: {
      type: Function,
      required: false,
    },
    onOpenNotifications: {
      type: Function,
      required: false,
    },
    onOpenMenu: {
      type: Function,
      required: false,
    },
    onOpenSpace: {
      type: Function,
      required: false,
    },
    onOpenEvents: {
      type: Function,
      required: false,
    },
    onOpenHR: {
      type: Function,
      required: false,
    },
    initialView: {
      type: String,
      default: 'suppliers',
    },
    onOpenFBIntegration: {
      type: Function,
      required: false,
    },
  },
  data() {
    return {
      activeTab: this.initialView || 'suppliers',
      mobileMenuOpen: false,
      mainNavOpen: false,
      // useIsMobile est un composable, on l'évalue une fois ici
      isMobile: false,
      sidebarMenuItems: [
        { id: 'suppliers', label: 'HR Suppliers', icon: Briefcase },
        { id: 'positions', label: 'Staff Positions', icon: Users },
      ],
    };
  },
  watch: {
    // Sync activeTab with initialView when it changes
    initialView(newVal) {
      this.activeTab = newVal || 'suppliers';
    },
  },
  methods: {
    setActiveTab(id) {
      this.activeTab = id;
    },
    handleClose() {
      if (this.onClose) {
        this.onClose();
      }
    },
    handleOpenMenuFromSettings(view) {
      if (this.onOpenMenu) {
        this.onOpenMenu(view);
        if (this.onClose) this.onClose();
      }
    },
    handleEditSpaceFromSettings(spaceId) {
      if (this.onOpenSpace) {
        this.onOpenSpace(spaceId);
        if (this.onClose) this.onClose();
      }
    },
    handleOpenEventsFromSettings(view) {
      if (this.onOpenEvents) {
        this.onOpenEvents(view);
        if (this.onClose) this.onClose();
      }
    },
    handleOpenProfile() {
      console.log('Profile clicked from HR View');
    },
    handleMobileSelect(id) {
      this.activeTab = id;
      this.mobileMenuOpen = false;
    },
  },
};
</script>