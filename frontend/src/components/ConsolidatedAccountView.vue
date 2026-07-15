<template>
  <div class="h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
    <!-- Header -->
    <header class="bg-white dark:bg-gray-900 border-b px-6 py-4 flex items-center justify-between">
      <div class="flex items-center gap-4">
        <!-- Burger gauche : navigation principale (Account / Events / HR / …) -->
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
          @click="mobileMenuOpen = true"
        >
          <Menu class="w-5 h-5" />
        </Button>
        <h1 class="text-xl">
          {{ activeTab === 'preferences' ? 'Analyse View Preferences' : 'Account Settings' }}
        </h1>
      </div>

      <div class="flex items-center gap-2">
        <!-- Close Button -->
        <Button variant="ghost" size="icon" @click="handleClose">
          <X class="w-5 h-5" />
        </Button>

        <!-- User Menu (avatar) -->
        <UserMenu :onOpenProfile="onOpenProfile" />
      </div>

    </header>

    <!-- Navigation principale (drawer gauche) -->
    <MainNav
      v-model="mainNavOpen"
      :onOpenMenu="handleOpenMenu"
      :onNavigateToSpaces="onNavigateToSpaces"
      :onOpenEvents="onOpenEvents"
      :onOpenHR="onOpenHR"
      :onOpenFBIntegration="onOpenFBIntegration"
      :onOpenAccount="handleOpenAccountFromSettings"
    />

    <!-- Main Content Area -->
    <div class="flex flex-1 overflow-hidden">
      <!-- Desktop Sidebar -->
      <aside v-if="!isMobile" class="w-64 bg-white dark:bg-gray-900 border-r">
        <nav class="p-4 space-y-1">
          <button
            v-for="item in sidebarMenuItems"
            :key="item.id"
            @click="() => handleNavClick(item.id)"
            :class="[
              'w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-colors',
              activeTab === item.id
                ? 'bg-gray-100 dark:bg-gray-800'
                : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
            ]"
          >
            <component :is="item.icon" class="w-5 h-5" />
            <span>{{ item.label }}</span>
          </button>
        </nav>
      </aside>

      <!-- Mobile Sidebar Sheet -->
      <Sheet v-if="isMobile" :open="mobileMenuOpen" @open-change="mobileMenuOpen = $event">
        <SheetContent side="left" class="w-64 p-0">
          <SheetHeader class="p-4 border-b">
            <SheetTitle>Account Menu</SheetTitle>
            <SheetDescription class="sr-only">
              Navigation menu for account settings
            </SheetDescription>
          </SheetHeader>
          <nav class="p-4 space-y-1">
            <button
              v-for="item in sidebarMenuItems"
              :key="item.id"
              @click="() => handleMobileNavClick(item.id)"
              :class="[
                'w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-colors',
                activeTab === item.id
                  ? 'bg-gray-100 dark:bg-gray-800'
                  : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
              ]"
            >
              <component :is="item.icon" class="w-5 h-5" />
              <span>{{ item.label }}</span>
            </button>
          </nav>
        </SheetContent>
      </Sheet>

      <!-- Content Area -->
      <main class="flex-1 overflow-auto">
        <ScrollArea class="h-full">
          <div class="p-8">
            <template v-if="activeTab === 'preferences'">
              <div class="max-w-2xl space-y-8">
                <!-- Analyse View Section -->
                <section class="space-y-6">
                  <div>
                    <h2 class="text-lg font-semibold mb-1">Analyse View</h2>
                    <p class="text-sm text-gray-600 dark:text-gray-400">
                      Configure default settings for the Analyse View
                    </p>
                  </div>

                  <div v-if="loading" class="text-sm text-gray-500">
                    Loading preferences...
                  </div>
                  <div v-else class="space-y-4">
                    <div>
                      <label class="block text-sm font-medium mb-2">
                        Default Date Range
                      </label>
                      <select
                        v-model="defaultDateRangePreset"
                        @change="handleSavePreference($event.target.value)"
                        class="w-full max-w-sm px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option
                          v-for="preset in PREFERENCE_DATE_RANGE_PRESETS"
                          :key="preset.value"
                          :value="preset.value"
                        >
                          {{ preset.label }}
                        </option>
                      </select>
                      <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
                        This setting determines the default date range filter when you open the Analyse view.
                      </p>
                    </div>

                    <!-- How it Works -->
                    <div class="mt-6 p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-900">
                      <h3 class="text-sm font-semibold mb-2 text-blue-900 dark:text-blue-100">
                        How it works
                      </h3>
                      <ul class="text-sm space-y-1 text-blue-800 dark:text-blue-200">
                        <li>• When you open the Analyse View, it will automatically load all your event data first</li>
                        <li>• Then, your selected default date range filter will be applied</li>
                        <li>• You can always change the date range using the filters at any time</li>
                        <li>• This preference is saved and will be remembered across sessions</li>
                      </ul>
                    </div>
                  </div>
                </section>

                <!-- Divider -->
                <div class="border-t dark:border-gray-700"></div>

                <!-- Predict View Section -->
                <section class="space-y-6">
                  <div>
                    <h2 class="text-lg font-semibold mb-1">Predict View</h2>
                    <p class="text-sm text-gray-600 dark:text-gray-400">
                      Configure default settings for the Predict View
                    </p>
                  </div>

                  <div v-if="loading" class="text-sm text-gray-500">
                    Loading preferences...
                  </div>
                  <div v-else class="space-y-4">
                    <div>
                      <label class="block text-sm font-medium mb-2">
                        Default Date Range
                      </label>
                      <select
                        v-model="defaultPredictDateRangePreset"
                        @change="handleSavePredictPreference($event.target.value)"
                        class="w-full max-w-sm px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option
                          v-for="preset in PREFERENCE_PREDICT_DATE_RANGE_PRESETS"
                          :key="preset.value"
                          :value="preset.value"
                        >
                          {{ preset.label }}
                        </option>
                      </select>
                      <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
                        This setting determines the default date range filter when you switch to the Predict view.
                      </p>
                    </div>

                    <!-- How it Works -->
                    <div class="mt-6 p-4 bg-purple-50 dark:bg-purple-950/20 rounded-lg border border-purple-200 dark:border-purple-900">
                      <h3 class="text-sm font-semibold mb-2 text-purple-900 dark:text-purple-100">
                        How it works
                      </h3>
                      <ul class="text-sm space-y-1 text-purple-800 dark:text-purple-200">
                        <li>• When you switch to Predict from the Tools dropdown, your saved date range will be applied</li>
                        <li>• Predict view focuses on future events and uses different date presets than Analyse view</li>
                        <li>• You can always change the date range using the filters at any time</li>
                        <li>• This preference is saved separately from your Analyse view preference</li>
                      </ul>
                    </div>
                  </div>
                </section>
              </div>
            </template>
          </div>
        </ScrollArea>
      </main>
    </div>
  </div>
</template>

<script>
import { X, Settings2, Menu } from 'lucide-vue-next';
import Button from '../ui/button.vue';
import UserMenu from './UserMenu.vue';
import MainNav from './MainNav.vue';
import Sheet from '../ui/sheet.vue';
import SheetContent from '../ui/sheetContent.vue';
import SheetHeader from '../ui/sheetHeader.vue';
import SheetTitle from '../ui/sheetTitle.vue';
import SheetDescription from '../ui/sheetDescription.vue';
import ScrollArea from '../ui/scrollArea.vue';
import {
  PREFERENCE_DATE_RANGE_PRESETS,
  DATE_RANGE_LABEL_MAP,
  PREFERENCE_PREDICT_DATE_RANGE_PRESETS,
  PREDICT_DATE_RANGE_LABEL_MAP
} from '../constants/dateRangePresets.js';
import * as api from '../utils/api';

export default {
  name: 'ConsolidatedAccountView',
  components: {
    X,
    Settings2,
    Menu,
    Button,
    UserMenu,
    MainNav,
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
    ScrollArea
  },
  props: {
    onClose: { type: Function, default: null },
    onOpenNotifications: { type: Function, default: null },
    onOpenMenu: { type: Function, default: null },
    onOpenSpace: { type: Function, default: null },
    onOpenEvents: { type: Function, default: null },
    onOpenHR: { type: Function, default: null },
    onOpenAccount: { type: Function, default: null },
    initialView: { type: String, default: 'preferences' },
    onOpenFBIntegration: { type: Function, default: null },
    onEditSpace: { type: Function, default: null },
    onNavigateToSpaces: { type: Function, default: null },
    onOpenProfile: { type: Function, default: null }
  },
  data() {
    return {
      activeTab: this.initialView,
      mobileMenuOpen: false,
      mainNavOpen: false,
      defaultDateRangePreset: 'all',
      defaultPredictDateRangePreset: 'thismonth',
      loading: true,
      sidebarMenuItems: [
        { id: 'preferences', label: 'Preferences', icon: Settings2 }
      ]
    };
  },
  computed: {
    isMobile() {
      return window.innerWidth < 768;
    }
  },
  watch: {
    initialView(newVal) {
      this.activeTab = newVal;
    }
  },
  mounted() {
    this.loadPreferences();
  },
  methods: {
    async loadPreferences() {
      try {
        const prefs = await api.getUserPreferences();
        if (prefs) {
          this.defaultDateRangePreset = prefs.defaultDateRangePreset || 'all';
          this.defaultPredictDateRangePreset = prefs.defaultPredictDateRangePreset || 'thismonth';
        }
      } catch (error) {
        console.error('Failed to load preferences:', error);
      } finally {
        this.loading = false;
      }
    },
    async handleSavePreference(newValue) {
      console.log('[PREFERENCES] Saving Analyse preference:', newValue);
      this.defaultDateRangePreset = newValue;
      try {
        const result = await api.saveUserPreferences({ defaultDateRangePreset: newValue });
        console.log('[PREFERENCES] Save result:', result);
        this.$toast?.success?.(
          `Default date range set to "${DATE_RANGE_LABEL_MAP[newValue] || newValue}"`
        );
      } catch (error) {
        console.error('[PREFERENCES] Failed to save preferences:', error);
        this.$toast?.error?.('Failed to save preferences. Please try again.');
      }
    },
    async handleSavePredictPreference(newValue) {
      console.log('[PREFERENCES] Saving Predict preference:', newValue);
      this.defaultPredictDateRangePreset = newValue;
      try {
        const result = await api.saveUserPreferences({ defaultPredictDateRangePreset: newValue });
        console.log('[PREFERENCES] Save result:', result);
        this.$toast?.success?.(
          `Default Predict date range set to "${PREDICT_DATE_RANGE_LABEL_MAP[newValue] || newValue}"`
        );
      } catch (error) {
        console.error('[PREFERENCES] Failed to save Predict preferences:', error);
        this.$toast?.error?.('Failed to save preferences. Please try again.');
      }
    },
    handleNavClick(id) {
      this.activeTab = id;
      if (this.onOpenAccount) {
        this.onOpenAccount(id);
      }
    },
    handleMobileNavClick(id) {
      this.activeTab = id;
      this.mobileMenuOpen = false;
      if (this.onOpenAccount) {
        this.onOpenAccount(id);
      }
    },
    handleClose() {
      this.onClose && this.onClose();
    },
    handleOpenMenu(view) {
      if (view && this.onOpenMenu) {
        this.onOpenMenu(view);
      }
    },
    handleOpenAccountFromSettings(view = 'preferences') {
      this.activeTab = view;
      if (this.onOpenAccount) {
        this.onOpenAccount(view);
      }
    }
  }
};
</script>