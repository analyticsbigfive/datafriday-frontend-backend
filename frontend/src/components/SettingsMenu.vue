<template>
  <Sheet :open="settingsSheetOpen" :onOpenChange="val => (settingsSheetOpen = val)">
    <!-- Trigger: bouton Settings avec icône -->
    <template #trigger>
      <SheetTrigger>
        <Button variant="ghost" size="icon">
          <Settings class="w-5 h-5" />
        </Button>
      </SheetTrigger>
    </template>

    <!-- Contenu latéral -->
    <SheetContent
      side="right"
      :class="[
        'p-0 transition-all duration-200',
        (showEditSpaceSubmenu || showMenuSubmenu || showEventsSubmenu || showHRSubmenu || showDataIntegrationSubmenu || showAccountSubmenu)
          ? 'w-[80rem]'
          : 'w-64',
      ]"
      aria-describedby="settings-menu-description"
    >
      <!-- Header -->
      <SheetHeader class="border-b">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <SheetTitle>Settings</SheetTitle>
          </div>
          <button
            type="button"
            class="inline-flex items-center justify-center rounded-md p-1 hover:bg-gray-100 dark:hover:bg-gray-800"
            @click="closeSettings"
          >
            <X class="w-4 h-4" />
          </button>
        </div>
      </SheetHeader>

      <div class="flex h-[calc(100vh-5rem)]">
        <!-- Colonne principale (gauche) -->

        <div
          :class="[
            showEditSpaceSubmenu || showMenuSubmenu || showEventsSubmenu || showHRSubmenu || showDataIntegrationSubmenu || showAccountSubmenu 
              ? isMobile ? 'w-24' : 'w-40'
              : 'w-64',
            'border-r transition-all duration-200'
          ]"
        >
          <ScrollArea class="h-full">
            <div class="p-2">
              <button
                type="button"
                class="w-full text-left py-2.5 mb-1 rounded-lg transition-colors flex items-center justify-between truncate text-sm"
                :class="[
                  showEditSpaceSubmenu || showMenuSubmenu || showEventsSubmenu || showHRSubmenu || showDataIntegrationSubmenu || showAccountSubmenu
                    ? 'px-2'
                    : 'px-4',
                  'hover:bg-gray-100 dark:hover:bg-gray-800',
                  showEditSpaceSubmenu ? 'bg-gray-100 dark:bg-gray-800' : '',
                ]"
                @click="toggleEditSpaceSubmenu"
              >
                <span>
                  {{
                    (showEditSpaceSubmenu || showMenuSubmenu || showEventsSubmenu || showHRSubmenu || showDataIntegrationSubmenu || showAccountSubmenu) && isMobile
                      ? 'Edi'
                      : 'Edit Space'
                  }}
                </span>
                <ChevronRight
                  v-if="!((showEditSpaceSubmenu || showMenuSubmenu || showEventsSubmenu || showHRSubmenu || showDataIntegrationSubmenu || showAccountSubmenu) && isMobile)"
                  class="w-4 h-4 transition-transform"
                  :class="showEditSpaceSubmenu ? 'rotate-90' : ''"
                />
              </button>
              <button
                type="button"
                class="w-full text-left py-2.5 mb-1 rounded-lg transition-colors flex items-center justify-between truncate text-sm"
                :class="[
                  showEditSpaceSubmenu || showMenuSubmenu || showEventsSubmenu || showHRSubmenu || showDataIntegrationSubmenu || showAccountSubmenu
                    ? 'px-2'
                    : 'px-4',
                  'hover:bg-gray-100 dark:hover:bg-gray-800',
                  showMenuSubmenu ? 'bg-gray-100 dark:bg-gray-800' : ''
                ]"
                @click="toggleMenuSubmenu"
              >
                <span>
                  {{
                    (showEditSpaceSubmenu || showMenuSubmenu || showEventsSubmenu || showHRSubmenu || showDataIntegrationSubmenu || showAccountSubmenu) && isMobile
                      ? 'F&B'
                      : 'Edit F&B Menu'
                  }}
                </span>
                <ChevronRight
                  v-if="!((showEditSpaceSubmenu || showMenuSubmenu || showEventsSubmenu || showHRSubmenu || showDataIntegrationSubmenu || showAccountSubmenu) && isMobile)"
                  class="w-4 h-4 transition-transform"
                  :class="{ 'rotate-90': showMenuSubmenu }"
                />
              </button>
              <button
                type="button"
                class="w-full text-left py-2.5 mb-1 rounded-lg transition-colors flex items-center justify-between truncate text-sm"
                :class="[
                  showEditSpaceSubmenu || showMenuSubmenu || showEventsSubmenu || showHRSubmenu || showDataIntegrationSubmenu || showAccountSubmenu
                    ? 'px-2'
                    : 'px-4',
                  'hover:bg-gray-100 dark:hover:bg-gray-800',
                  showEventsSubmenu ? 'bg-gray-100 dark:bg-gray-800' : ''
                ]"
                @click="toggleEventsSubmenu"
              >
                <span>
                  {{
                    (showEditSpaceSubmenu || showMenuSubmenu || showEventsSubmenu || showHRSubmenu || showDataIntegrationSubmenu || showAccountSubmenu) && isMobile
                      ? 'Eve'
                      : 'Edit Events'
                  }}
                </span>
                <ChevronRight
                  v-if="!((showEditSpaceSubmenu || showMenuSubmenu || showEventsSubmenu || showHRSubmenu || showDataIntegrationSubmenu || showAccountSubmenu) && isMobile)"
                  class="w-4 h-4 transition-transform"
                  :class="{ 'rotate-90': showEventsSubmenu }"
                />
              </button>
              <button
                type="button"
                class="w-full text-left py-2.5 mb-1 rounded-lg transition-colors flex items-center justify-between truncate text-sm"
                :class="[
                  showEditSpaceSubmenu || showMenuSubmenu || showEventsSubmenu || showHRSubmenu || showDataIntegrationSubmenu || showAccountSubmenu
                    ? 'px-2'
                    : 'px-4',
                  'hover:bg-gray-100 dark:hover:bg-gray-800',
                  showHRSubmenu ? 'bg-gray-100 dark:bg-gray-800' : ''
                ]"
                @click="toggleHRSubmenu"
              >
                <span>
                  {{
                    (showEditSpaceSubmenu || showMenuSubmenu || showEventsSubmenu || showHRSubmenu || showDataIntegrationSubmenu || showAccountSubmenu) && isMobile
                      ? 'HR'
                      : 'Edit HR'
                  }}
                </span>
                <ChevronRight
                  v-if="!((showEditSpaceSubmenu || showMenuSubmenu || showEventsSubmenu || showHRSubmenu || showDataIntegrationSubmenu || showAccountSubmenu) && isMobile)"
                  class="w-4 h-4 transition-transform"
                  :class="{ 'rotate-90': showHRSubmenu }"
                />
              </button>
              <button
                type="button"
                class="w-full text-left py-2.5 mb-1 rounded-lg transition-colors flex items-center justify-between truncate text-sm"
                :class="[
                  showEditSpaceSubmenu || showMenuSubmenu || showEventsSubmenu || showHRSubmenu || showDataIntegrationSubmenu || showAccountSubmenu
                    ? 'px-2'
                    : 'px-4',
                  'hover:bg-gray-100 dark:hover:bg-gray-800',
                  showDataIntegrationSubmenu ? 'bg-gray-100 dark:bg-gray-800' : ''
                ]"
                @click="toggleDataIntegrationSubmenu"
              >
                <span>
                  {{
                    (showEditSpaceSubmenu || showMenuSubmenu || showEventsSubmenu || showHRSubmenu || showDataIntegrationSubmenu || showAccountSubmenu) && isMobile
                      ? 'Dat'
                      : 'Data Integration'
                  }}
                </span>
                <ChevronRight
                  v-if="!((showEditSpaceSubmenu || showMenuSubmenu || showEventsSubmenu || showHRSubmenu || showDataIntegrationSubmenu || showAccountSubmenu) && isMobile)"
                  class="w-4 h-4 transition-transform"
                  :class="{ 'rotate-90': showDataIntegrationSubmenu }"
                />
              </button>
              <button
                type="button"
                class="w-full text-left py-2.5 mb-1 rounded-lg transition-colors flex items-center justify-between truncate text-sm"
                :class="[
                  showEditSpaceSubmenu || showMenuSubmenu || showEventsSubmenu || showHRSubmenu || showDataIntegrationSubmenu || showAccountSubmenu
                    ? 'px-2'
                    : 'px-4',
                  'hover:bg-gray-100 dark:hover:bg-gray-800'
                ]"
                @click="closeSettings"
              >
                <span>
                  {{
                    (showEditSpaceSubmenu || showMenuSubmenu || showEventsSubmenu || showHRSubmenu || showDataIntegrationSubmenu || showAccountSubmenu) && isMobile
                      ? 'Use'
                      : 'Users'
                  }}
                </span>
              </button>
              <button
                type="button"
                class="w-full text-left py-2.5 mb-1 rounded-lg transition-colors flex items-center justify-between truncate text-sm"
                :class="[
                  showEditSpaceSubmenu || showMenuSubmenu || showEventsSubmenu || showHRSubmenu || showDataIntegrationSubmenu || showAccountSubmenu
                    ? 'px-2'
                    : 'px-4',
                  'hover:bg-gray-100 dark:hover:bg-gray-800',
                  showAccountSubmenu ? 'bg-gray-100 dark:bg-gray-800' : ''
                ]"
                @click="toggleAccountSubmenu"
              >
                <span>
                  {{
                    (showEditSpaceSubmenu || showMenuSubmenu || showEventsSubmenu || showHRSubmenu || showDataIntegrationSubmenu || showAccountSubmenu) && isMobile
                      ? 'Acc'
                      : 'Account'
                  }}
                </span>
                <ChevronRight
                  v-if="!((showEditSpaceSubmenu || showMenuSubmenu || showEventsSubmenu || showHRSubmenu || showDataIntegrationSubmenu || showAccountSubmenu) && isMobile)"
                  class="w-4 h-4 transition-transform"
                  :class="{ 'rotate-90': showAccountSubmenu }"
                />
              </button>
              <div :class="[(showEditSpaceSubmenu || showMenuSubmenu || showEventsSubmenu || showHRSubmenu || showDataIntegrationSubmenu || showAccountSubmenu) ? 'mx-2' : 'mx-4', 'my-3 border-t']"></div>
              <ThemeToggle :isCompact="showEditSpaceSubmenu || showMenuSubmenu || showEventsSubmenu || showHRSubmenu || showDataIntegrationSubmenu || showAccountSubmenu" :isMobile="isMobile" />
            </div>
          </ScrollArea>
        </div>
        
        <!-- Colonne Edit Space -->
        <div
          v-if="showEditSpaceSubmenu"
          class="flex-1 bg-gray-50 dark:bg-gray-900 border-r relative"
        >
          <!-- Mobile Close Button -->
          <Button
            v-if="isMobile"
            variant="ghost"
            size="icon"
            class="absolute top-2 right-2 z-10 h-8 w-8"
            @click="showEditSpaceSubmenu = false"
          >
            <X class="w-4 h-4" />
          </Button>

          <div class="h-full flex flex-col">
            <div class="p-4 border-b space-y-2">
              <h3 class="text-sm font-semibold">Edit Space</h3>

              <div class="relative w-full sm:w-48">
                <!-- Icône -->
                <span class="pointer-events-none absolute inset-y-0 left-3 flex items-center">
                  <Search class="w-4 h-4 text-gray-400" />
                </span>

                <!-- Champ -->
                <Input
                  type="text"
                  placeholder="Search..."
                  v-model="searchQuery"
                  class="h-8 w-full pl-10 pr-3 text-xs"
                />
              </div>
            </div>

            <ScrollArea class="flex-1">
              <div class="p-2">
                <div class="space-y-0.5">
                  <button
                    v-for="space in filteredSpaces"
                    :key="space.id"
                    class="w-full flex items-center justify-between text-left px-3 py-2 rounded-md transition-colors hover:bg-white dark:hover:bg-gray-800 text-sm"
                    @click="handleEditSpace(space.id)"
                  >
                    <span class="truncate">{{ space.name }}</span>
                  </button>
                </div>
              </div>
            </ScrollArea>
          </div>
        </div>

        <!-- Colonne Menu -->
        <div
          v-if="showMenuSubmenu"
          class="flex-1 bg-gray-50 dark:bg-gray-900 border-r relative"
        >
          <!-- Mobile Close Button -->
          <Button
            v-if="isMobile"
            variant="ghost"
            size="icon"
            class="absolute top-2 right-2 z-10 h-8 w-8"
            @click="showMenuSubmenu = false"
          >
            <X class="w-4 h-4" />
          </Button>

          <div class="p-4">
            <h3 class="text-sm font-semibold mb-3">Menu</h3>

            <ScrollArea class="h-[calc(100vh-10rem)]">
              <div class="space-y-3">
                <!-- Section Supply -->
                <div>
                  <h4 class="text-xs font-semibold text-gray-500 mb-1">
                    Supply
                  </h4>
                  <div class="space-y-0.5">
                    <button
                      class="w-full text-left px-3 py-2 rounded-md transition-colors hover:bg-white dark:hover:bg-gray-800 text-sm"
                      @click="handleOpenMenu('suppliers')"
                    >
                      Suppliers
                    </button>
                    <button
                      class="w-full text-left px-3 py-2 rounded-md transition-colors hover:bg-white dark:hover:bg-gray-800 text-sm"
                      @click="handleOpenMenu('market-prices')"
                    >
                      Market Prices
                    </button>

                  </div>
                </div>

                <!-- Section Menu -->
                <div>
                  <h4 class="text-xs font-semibold text-gray-500 mb-1">
                    Menu
                  </h4>
                  <div class="space-y-0.5">
                    <button
                      class="w-full text-left px-3 py-2 rounded-md transition-colors hover:bg-white dark:hover:bg-gray-800 text-sm"
                      @click="handleOpenMenu('components')"
                    >
                      Components
                    </button>
                    <button
                      class="w-full text-left px-3 py-2 rounded-md transition-colors hover:bg-white dark:hover:bg-gray-800 text-sm"
                      @click="handleOpenMenu('menu-items')"
                    >
                      Menu Items
                    </button>
                    <button
                      class="w-full text-left px-3 py-2 rounded-md transition-colors hover:bg-white dark:hover:bg-gray-800 text-sm"
                      @click="handleOpenMenu('space-menus')"
                    >
                      Space Menus
                    </button>
                  </div>
                </div>

                <!-- Section Reports / Cost Tracking -->
                <div>
                  <h4 class="text-xs font-semibold text-gray-500 mb-1">
                    Reports
                  </h4>
                  <div class="space-y-0.5">
                    <button
                      class="w-full text-left px-3 py-2 rounded-md transition-colors hover:bg-white dark:hover:bg-gray-800 text-sm"
                      @click="handleOpenMenu('cost-tracking')"
                    >
                      Cost Tracking
                    </button>

                    <button
                      class="w-full text-left px-3 py-2 rounded-md transition-colors hover:bg-white dark:hover:bg-gray-800 text-sm"
                      @click="handleOpenMenu('margin-reports')"
                    >
                      Margin Reports
                    </button>
                  </div>
                </div>
              </div>
            </ScrollArea>
          </div>
        </div>

        <!-- Colonne Events -->
        <div
          v-if="showEventsSubmenu"
          class="flex-1 bg-gray-50 dark:bg-gray-900 border-r relative"
        >
          <!-- Mobile Close Button -->
          <Button
            v-if="isMobile"
            variant="ghost"
            size="icon"
            class="absolute top-2 right-2 z-10 h-8 w-8"
            @click="showEventsSubmenu = false"
          >
            <X class="w-4 h-4" />
          </Button>

          <div class="p-4">
            <h3 class="text-sm font-semibold mb-3">Events</h3>

            <ScrollArea class="h-[calc(100vh-10rem)]">
              <div class="space-y-0.5">
                <button
                  class="w-full text-left px-3 py-2 rounded-md transition-colors hover:bg-white dark:hover:bg-gray-800 text-sm"
                  @click="
                    () => {
                      handleOpenEvents && handleOpenEvents('events')
                    }
                  "
                >
                  Events
                </button>
                <button
                  class="w-full text-left px-3 py-2 rounded-md transition-colors hover:bg-white dark:hover:bg-gray-800 text-sm"
                  @click="
                    () => {
                      handleOpenEvents && handleOpenEvents('event-types')
                    }
                  "
                >
                  Event Types
                </button>
                <button
                  class="w-full text-left px-3 py-2 rounded-md transition-colors hover:bg-white dark:hover:bg-gray-800 text-sm"
                  @click="
                    () => {
                      handleOpenEvents &&
                        handleOpenEvents('event-categories')
                    }
                  "
                >
                  Event Categories
                </button>
                <button
                  class="w-full text-left px-3 py-2 rounded-md transition-colors hover:bg-white dark:hover:bg-gray-800 text-sm"
                  @click="
                    () => {
                      handleOpenEvents &&
                        handleOpenEvents('event-subcategories')
                    }
                  "
                >
                  Event Subcategories
                </button>
              </div>
            </ScrollArea>
          </div>
        </div>

        <!-- Colonne HR -->
        <div
          v-if="showHRSubmenu"
          class="flex-1 bg-gray-50 dark:bg-gray-900 border-r relative"
        >
          <!-- Mobile Close Button -->
          <Button
            v-if="isMobile"
            variant="ghost"
            size="icon"
            class="absolute top-2 right-2 z-10 h-8 w-8"
            @click="showHRSubmenu = false"
          >
            <X class="w-4 h-4" />
          </Button>

          <div class="p-4">
            <h3 class="text-sm font-semibold mb-3">HR</h3>

            <ScrollArea class="h-[calc(100vh-10rem)]">
              <div class="space-y-0.5">
                <button
                  class="w-full text-left px-3 py-2 rounded-md transition-colors hover:bg-white dark:hover:bg-gray-800 text-sm"
                  @click="
                    () => {
                      handleOpenHR && handleOpenHR('suppliers')
                    }
                  "
                >
                  Suppliers
                </button>
                <button
                  class="w-full text-left px-3 py-2 rounded-md transition-colors hover:bg-white dark:hover:bg-gray-800 text-sm"
                  @click="
                    () => {
                      handleOpenHR && handleOpenHR('positions')
                    }
                  "
                >
                  Positions
                </button>
              </div>
            </ScrollArea>
          </div>
        </div>

        <!-- Colonne Data Integration (déjà vue) -->
        <div
          v-if="showDataIntegrationSubmenu"
          class="flex-1 bg-gray-50 dark:bg-gray-900 relative"
        >
          <!-- Mobile Close Button -->
          <Button
            v-if="isMobile"
            variant="ghost"
            size="icon"
            class="absolute top-2 right-2 z-10 h-8 w-8"
            @click="showDataIntegrationSubmenu = false"
          >
            <X class="w-4 h-4" />
          </Button>
          <div class="p-4">
            <h3 class="text-sm font-semibold mb-3">Data Integration</h3>

            <ScrollArea class="h-[calc(100vh-10rem)]">
              <div class="space-y-0.5">
                <button
                  class="w-full text-left px-3 py-2 rounded-md transition-colors hover:bg-white dark:hover:bg-gray-800 text-sm"
                  @click="
                    () => {
                      $router.push({ name: 'data-integration-fb' })
                      settingsSheetOpen = false
                      showEditSpaceSubmenu = false
                      showMenuSubmenu = false
                      showEventsSubmenu = false
                      showHRSubmenu = false
                      showDataIntegrationSubmenu = false
                    }
                  "
                >
                  F&amp;B
                </button>
              </div>
            </ScrollArea>
          </div>
        </div>

        <div v-if="showAccountSubmenu" class="flex-1 bg-gray-50 dark:bg-gray-900 relative">
          <Button
            v-if="isMobile"
            variant="ghost"
            size="icon"
            class="absolute top-2 right-2 z-10 h-8 w-8"
            @click="showAccountSubmenu = false"
          >
            <X class="w-4 h-4" />
          </Button>
          <div class="p-4">
            <h3 class="text-sm font-semibold mb-3">Account</h3>
            <ScrollArea class="h-[calc(100vh-10rem)]">
              <div class="space-y-0.5">
                <button
                  class="w-full text-left px-3 py-2 rounded-md transition-colors hover:bg-white dark:hover:bg-gray-800 text-sm"
                  @click="() => {
                      handleOpenAccount && handleOpenAccount('preferences')
                  }"
                >
                  Preferences
                </button>
              </div>
            </ScrollArea>
          </div>  
        </div>
      </div>
    </SheetContent>
  </Sheet>
</template>

<script>
import { Settings, ChevronRight, X, Search } from 'lucide-vue-next';
import * as api from '../utils/api';
import ThemeToggle from '../ui/themeToggle.vue';
import Button from '../ui/button.vue';
import Sheet from '../ui/sheet.vue';
import SheetContent from '../ui/sheetContent.vue';
import SheetHeader from '../ui/sheetHeader.vue';
import SheetTitle from '../ui/sheetTitle.vue';
import SheetDescription from '../ui/sheetDescription.vue';
import SheetTrigger from '../ui/sheetTrigger.vue';
import ScrollArea from '../ui/scrollArea.vue';
import Input from '../ui/input.vue';
export default {
  name: 'SettingsMenu',
  components: {
    Settings,
    ChevronRight,
    X,
    Search,
    Button,
    Input,
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
    SheetTrigger,
    ScrollArea,
    ThemeToggle
  },
  props: {
    onOpenMenu: { 
      type: Function, 
      required: true
    },
    onOpenProfile: { 
      type: Function, 
      required: true 
    },
    onOpenSpace: { 
      type: Function, 
      default: null 
    },
    onEditSpace: { 
      type: Function, 
      default: null 
    },
    onNavigateToSpaces: { 
      type: Function, 
      default: null 
    },
    onOpenEvents: { 
      type: Function, 
      default: null 
    },
    onOpenHR: { 
      type: Function, 
      default: null 
    },
    onOpenFBIntegration: { 
      type: Function, 
      default: null 
    },
    onOpenAccount: { 
      type: Function, 
      default: null
    }
  },
  data() {
    return {
      isMobile: false,
      settingsSheetOpen: false,
      searchQuery: '',
      showEditSpaceSubmenu: false,
      showMenuSubmenu: false,
      showEventsSubmenu: false,
      showHRSubmenu: false,
      showDataIntegrationSubmenu: false,
      showAccountSubmenu: false,
      spaces: []
    };
  },
  computed: {
    filteredSpaces() {
      const q = this.searchQuery.trim().toLowerCase();
      if (!q) return this.spaces;
      return this.spaces.filter(space =>
        (space.name || '').toLowerCase().includes(q)
      );
    }
  },
  watch: {
    settingsSheetOpen(isOpen) {
      if (isOpen) {
        this.loadSpaces();
      } else {
        this.resetSubmenus();
      }
    }
  },
  mounted() {
    const updateIsMobile = () => {
      this.isMobile = window.matchMedia('(max-width: 768px)').matches;
    };
    updateIsMobile();
    window.addEventListener('resize', updateIsMobile);
    this._removeResize = () => window.removeEventListener('resize', updateIsMobile);
  },
  beforeUnmount() {
    if (this._removeResize) this._removeResize();
  },
  methods: {
    async loadSpaces() {
      try {
        const spaces = await api.getAllSpaces();
        this.spaces = spaces || [];
      } catch (error) {
        console.error('Failed to load spaces:', error);
        this.spaces = [];
      }
    },
    resetSubmenus() {
      this.showEditSpaceSubmenu = false;
      this.showMenuSubmenu = false;
      this.showEventsSubmenu = false;
      this.showHRSubmenu = false;
      this.showDataIntegrationSubmenu = false;
      this.showAccountSubmenu = false;
      this.searchQuery = '';
    },
    toggleEditSpaceSubmenu() {
      this.showEditSpaceSubmenu = !this.showEditSpaceSubmenu;
      this.hideOthers('edit');
    },
    toggleMenuSubmenu() {
      this.showMenuSubmenu = !this.showMenuSubmenu;
      this.hideOthers('menu');
    },
    toggleEventsSubmenu() {
      this.showEventsSubmenu = !this.showEventsSubmenu;
      this.hideOthers('events');
    },
    toggleHRSubmenu() {
      this.showHRSubmenu = !this.showHRSubmenu;
      this.hideOthers('hr');
    },
    toggleDataIntegrationSubmenu() {
      this.showDataIntegrationSubmenu = !this.showDataIntegrationSubmenu;
      this.hideOthers('data');
    },
    toggleAccountSubmenu() {
      this.showAccountSubmenu = !this.showAccountSubmenu;
      this.hideOthers('account');
    },
    hideOthers(active) {
      if (active !== 'edit') this.showEditSpaceSubmenu = false;
      if (active !== 'menu') this.showMenuSubmenu = false;
      if (active !== 'events') this.showEventsSubmenu = false;
      if (active !== 'hr') this.showHRSubmenu = false;
      if (active !== 'data') this.showDataIntegrationSubmenu = false;
      if (active !== 'account') this.showAccountSubmenu = false;
    },
    openSettings() {
      this.settingsSheetOpen = true;
    },
    closeSettings() {
      this.settingsSheetOpen = false;
    },
    handleOpenProfile() {
      this.onOpenProfile?.();
      this.closeSettings();
    },
    handleOpenMenu(view) {
      this.onOpenMenu?.(view);
      this.closeSettings();
    },
    handleOpenEvents(view) {
      this.onOpenEvents?.(view);
      this.closeSettings();
    },
    handleOpenHR(view) {
      this.onOpenHR?.(view);
      this.closeSettings();
    },
    handleOpenFBIntegration() {
      this.onOpenFBIntegration?.();
      this.closeSettings();
    },
    handleEditSpace(spaceId) {
      this.onEditSpace?.(spaceId);
      this.closeSettings();
    },
    handleOpenAccount(view) {
      this.onOpenAccount?.(view);
      console.log('Account view opened:', view);
      this.closeSettings();
    },
    handleNavigateToSpaces() {
      this.onNavigateToSpaces?.();
      this.closeSettings();
    }
  }
};
</script>