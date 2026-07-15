<script>
import Button from "../ui/button.vue";
import { Menu, X } from "lucide-vue-next";
import UserMenu from "./UserMenu.vue";
import MainNav from "./MainNav.vue";
import isMobile from "../ui/useMobile";
import { useI18n } from "@/i18n/useI18n";

const SECTION_KEY_BY_ROUTE = {
  "space-analyse": "invToolAnalyse",
  "space-predict": "invToolPredict",
  "space-inventory": "hdrSecInventory",
  "space-restock": "invToolRestock",
  SpaceBuilder: "hdrSecBuilder",
  spaces: "hdrSecSpaces",
  "spaces-overview": "hdrSecSpaces",
  dashboard: "hdrSecDashboard",
  events: "hdrSecEvents",
  "event-types": "hdrSecEventTypes",
  "event-categories": "hdrSecEventCategories",
  "event-subcategories": "hdrSecEventSubcategories",
  suppliers: "hdrSecSuppliers",
};

export default {
  name: "AppHeader",
  mixins: [isMobile],
  setup() {
    return { t: useI18n().t };
  },
  components: {
    Button,
    Menu,
    X,
    UserMenu,
    MainNav,
  },

  props: {
    title: {
      type: String,
      default: "",
    },
    titleElement: {
      type: [Object, String, Function],
      default: null,
    },
    middleContent: {
      type: [Object, String, Function],
      default: null,
    },
    showBackButton: {
      type: Boolean,
      default: false,
    },
    onBack: {
      type: Function,
      default: null,
    },
    showBurgerMenu: {
      type: Boolean,
      default: false,
    },
    burgerMenuOpen: {
      type: Boolean,
      default: false,
    },
    onToggleBurgerMenu: {
      type: Function,
      default: null,
    },
    showCloseButton: {
      type: Boolean,
      default: false,
    },
    onClose: {
      type: Function,
      default: null,
    },
    // Profil utilisateur (UserMenu)
    onOpenProfile: {
      type: Function,
      default: null,
    },
    // Navigation principale (MainNav, accessible via le burger gauche)
    onOpenMenu: { type: Function, default: null },
    onOpenSpace: { type: Function, default: null },
    onEditSpace: { type: Function, default: null },
    onNavigateToSpaces: { type: Function, default: null },
    onOpenEvents: { type: Function, default: null },
    onOpenHR: { type: Function, default: null },
    onOpenAccount: { type: Function, default: null },
    onOpenFBIntegration: { type: Function, default: null },
    onOpenInventory: { type: Function, default: null },
  },

  data() {
    return {
      mainNavOpen: false,
    };
  },

  computed: {
    hasNavTargets() {
      return !!(
        this.onNavigateToSpaces ||
        this.onOpenAccount ||
        this.onOpenEvents ||
        this.onOpenHR ||
        this.onOpenFBIntegration ||
        this.onOpenInventory ||
        this.onOpenMenu
      );
    },
    // Contexte affiché dans la zone titre quand le parent ne fournit pas de title.
    contextSpaceName() {
      return this.$store?.state?.analyse?.space?.name || "";
    },
    sectionLabel() {
      const key = SECTION_KEY_BY_ROUTE[this.$route?.name];
      return key ? this.t(key) : "";
    },
  },
};
</script>

<template>
  <header
    class="bg-white dark:bg-gray-900 border-b px-4 py-3 flex items-center justify-between gap-4"
  >
    <!-- Left Column: Burger Menu + Title -->
    <div
      :class="`flex items-center gap-3 min-w-0 ${isMobile ? 'flex-1' : 'w-64'}`"
    >
      <Button
        v-if="showBackButton && onBack"
        variant="ghost"
        size="sm"
        @click="onBack"
      >
        <X class="w-5 h-5" />
      </Button>

      <Button
        v-if="showBurgerMenu && onToggleBurgerMenu"
        variant="ghost"
        size="sm"
        @click="onToggleBurgerMenu"
      >
        <X v-if="burgerMenuOpen" class="w-5 h-5" />
        <Menu v-else class="w-5 h-5" />
      </Button>

      <!-- Burger gauche : ouvre MainNav (visible dès qu'au moins une cible
           de navigation est fournie par le parent). -->
      <Button
        v-if="!showBurgerMenu && hasNavTargets"
        variant="ghost"
        size="sm"
        aria-label="Ouvrir la navigation"
        @click="mainNavOpen = true"
      >
        <Menu class="w-5 h-5" />
      </Button>

      <h1 v-if="title" class="text-xl font-semibold truncate">{{ title }}</h1>

      <div
        v-else-if="$slots.titleElement || titleElement"
        class="text-xl font-semibold truncate"
      >
        <slot name="titleElement">
          <component v-if="titleElement" :is="titleElement" />
        </slot>
      </div>

      <!-- Contexte auto : Espace · Section (quand aucun title/titleElement fourni) -->
      <div
        v-else-if="contextSpaceName || sectionLabel"
        class="flex items-baseline gap-2 min-w-0"
      >
        <h1 class="text-xl font-semibold truncate">{{ contextSpaceName || sectionLabel }}</h1>
        <span
          v-if="contextSpaceName && sectionLabel"
          class="text-sm text-gray-400 dark:text-gray-500 truncate"
        >· {{ sectionLabel }}</span>
      </div>
    </div>

    <!-- Middle Column: Custom Content -->
    <div
      v-if="middleContent"
      class="flex-1 flex items-center justify-center min-w-0"
    >
      <component :is="middleContent" />
    </div>

    <!-- Right Column: Close + UserMenu -->
    <div
      :class="`flex items-center gap-2 justify-end flex-shrink-0 ${isMobile ? 'w-auto' : 'w-80'}`"
    >
      <Button
        v-if="showCloseButton && onClose"
        variant="ghost"
        size="sm"
        @click="onClose"
      >
        <X class="w-5 h-5" />
      </Button>

      <UserMenu :onOpenProfile="onOpenProfile" />
    </div>

    <MainNav
      v-model="mainNavOpen"
      :onNavigateToSpaces="onNavigateToSpaces"
      :onOpenAccount="onOpenAccount"
      :onOpenEvents="onOpenEvents"
      :onOpenHR="onOpenHR"
      :onOpenFBIntegration="onOpenFBIntegration"
      :onOpenInventory="onOpenInventory"
      :onOpenMenu="onOpenMenu"
    />
  </header>
</template>
