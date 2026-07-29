<template>
  <v-app>
    <!-- Mobile : drawer masqué par défaut, ouvert en overlay (temporary) via le
         bouton de la barre — mécanisme slide conservé, jamais de rail.
         Desktop : comportement permanent + rail inchangé. -->
    <v-navigation-drawer
      v-model="drawer"
      :rail="!isMobile && rail"
      :permanent="!isMobile && (!isSelfHeadedRoute || isRailPushRoute)"
      :temporary="isMobile || (isSelfHeadedRoute && !isRailPushRoute)"
      @click="!isMobile && (rail = false)"
      rail-width="70"
      class="main-nav-drawer"
    >
      <template #prepend>
        <v-list-item class="logo-item">
          <template #prepend>
            <v-img
              :src="require('../assets/datafriday.png')"
              height="32"
              width="32"
            ></v-img>
          </template>
          <template #title>
            <span class="font-weight-bold logo-text">DataFriday</span>
          </template>
        </v-list-item>
      </template>

      <!-- Sidebar gauche pilotée par MAIN_NAVIGATION + filtrée par rôle (can()).
           Entrées sans `route` (analytics globaux à venir) = visibles mais désactivées. -->
      <template v-for="section in visibleMainNavigation" :key="section.section">
        <v-list-item class="menu section-header">{{ t(section.section) }}</v-list-item>

        <v-list density="compact" nav>
          <v-list-item
            v-for="item in section.items"
            :key="item.value"
            :title="t(item.title)"
            :value="item.value"
            :disabled="!item.route"
            color="#ff3131"
            @click="goToFromMainNav(item.route)"
          >
            <template v-slot:prepend>
              <component :is="iconComponents[item.icon]" :size="18" color="#b2bec3" class="mr-3" />
            </template>
          </v-list-item>
        </v-list>
      </template>
    </v-navigation-drawer>

    <v-navigation-drawer
      v-model="settingsDrawer"
      location="right"
      temporary
      width="360"
      class="settings-drawer"
      style="z-index: 2000 !important;"
    >
      <div class="settings-drawer-inner">
        <!-- En-tête -->
        <div class="settings-drawer-header">
          <div class="d-flex align-center justify-space-between px-4 py-3">
            <div class="d-flex align-center">
              <Settings :size="20" color="#ff3131" class="mr-2" />
              <span class="font-weight-bold" style="font-size: 1rem;">{{ t('navSettings') }}</span>
            </div>
            <v-btn icon variant="text" density="compact" @click="settingsDrawer = false">
              <ChevronRight :size="18" />
            </v-btn>
          </div>
        </div>

        <!-- Zone scrollable : Configuration + Preferences -->
        <div class="settings-drawer-content">
          <template v-for="section in visibleSettingsNavigation" :key="section.section">
            <v-list-item class="menu section-header">{{ t(section.section) }}</v-list-item>

            <v-list density="compact" nav>
              <v-list-group
                v-for="group in section.groups"
                :key="group.key"
                :value="group.key"
                color="#ff3131"
              >
                <template #activator="{ props }">
                  <v-list-item v-bind="props" color="#ff3131">
                    <template #prepend>
                      <component :is="iconComponents[group.icon]" :size="18" color="#b2bec3" class="mr-3" />
                    </template>
                    <template #title>
                      <span>{{ t(group.title) }}</span>
                    </template>
                  </v-list-item>
                </template>

                <!-- Barre de recherche du groupe dynamique « Edit space » -->
                <div
                  v-if="group.dynamic === 'spaces'"
                  class="settings-space-search"
                  @click.stop
                >
                  <Search :size="15" class="settings-space-search__icon" />
                  <input
                    v-model="editSpaceSearch"
                    type="search"
                    class="settings-space-search__input"
                    :placeholder="t('editSpaceSearchPlaceholder')"
                    @keydown.stop
                  />
                </div>

                <v-list-item
                  v-for="item in filteredGroupItems(group)"
                  :key="item.route"
                  :title="t(item.title)"
                  :value="`${group.key}-${item.title}`"
                  color="#ff3131"
                  @click="goToFromSettings(item.route)"
                />

                <!-- État vide (groupe « Edit space ») : soit la recherche ne
                     matche rien, soit aucun espace n'existe. -->
                <div
                  v-if="group.dynamic === 'spaces' && !filteredGroupItems(group).length"
                  class="settings-space-empty"
                >
                  {{ editSpaceSearch ? t('editSpaceNoResult') : t('editSpaceEmpty') }}
                </div>
              </v-list-group>

              <v-list-item
                v-for="item in section.standalone"
                :key="item.title"
                :title="t(item.title)"
                :value="`standalone-${item.title}`"
                color="#ff3131"
                @click="goToFromSettings(item.route)"
              >
                <template v-slot:prepend>
                  <component :is="iconComponents[item.icon]" :size="18" color="#b2bec3" class="mr-3" />
                </template>
              </v-list-item>
            </v-list>
          </template>

          <v-list-item class="menu section-header">{{ t('navPreferences') }}</v-list-item>

          <v-list density="compact" nav>
            <v-list-item color="#ff3131">
              <template #prepend>
                <Languages :size="18" color="#b2bec3" class="mr-3" />
              </template>
              <template #title>
                <div class="d-flex align-center justify-space-between">
                  <span>{{ t('navLanguage') }}</span>
                  <v-btn-toggle
                    v-model="locale"
                    mandatory
                    density="compact"
                    rounded="lg"
                    color="#ff3131"
                    class="ml-2"
                    @update:model-value="changeLocale"
                  >
                    <v-btn value="en" size="x-small" class="text-none px-2">
                      EN
                    </v-btn>
                    <v-btn value="fr" size="x-small" class="text-none px-2">
                      FR
                    </v-btn>
                  </v-btn-toggle>
                </div>
              </template>
            </v-list-item>

            <v-list-item color="#ff3131">
              <template #prepend>
                <Moon :size="18" color="#b2bec3" class="mr-3" v-if="theme === 'dataFridayDark'" />
                <Sun :size="18" color="#b2bec3" class="mr-3" v-else />
              </template>
              <template #title>
                <div class="d-flex align-center justify-space-between">
                  <span>{{ t('navTheme') }}</span>
                  <v-btn-toggle
                    v-model="theme"
                    mandatory
                    density="compact"
                    rounded="lg"
                    color="#ff3131"
                    class="ml-2"
                    @update:model-value="changeTheme"
                  >
                    <v-btn value="dataFridayLight" size="x-small" class="text-none px-2">
                      <Sun :size="14" />
                    </v-btn>
                    <v-btn value="dataFridayDark" size="x-small" class="text-none px-2">
                      <Moon :size="14" />
                    </v-btn>
                  </v-btn-toggle>
                </div>
              </template>
            </v-list-item>
          </v-list>
        </div>
      </div>
    </v-navigation-drawer>

    <v-app-bar v-if="!isSelfHeadedRoute" elevation="0" class="app-bar-custom">
      <v-app-bar-nav-icon @click.stop="toggleSidebar" class="nav-icon-hover">
        <ChevronRight v-if="!drawer || rail" />
        <ChevronLeft v-else />
      </v-app-bar-nav-icon>

      <!-- Logo : affiché dans la barre en mobile (le drawer gauche qui le porte
           sur desktop est masqué). Ramène à la liste des espaces. -->
      <div
        v-if="isMobile"
        class="app-bar-logo"
        role="button"
        aria-label="Accueil"
        @click="goToSpaces"
      >
        <v-img :src="require('../assets/datafriday.png')" height="28" width="28" />
      </div>

      <!-- Teleport target: route-specific header content (e.g. SpaceBuilder).
           flex-grow-1 SANS v-spacer ensuite : la cible occupe toute la largeur
           dispo (jusqu'aux actions à droite), pour que le contenu builder
           téléporté (ConfigSelector centré, statut collé aux actions) s'étale
           correctement. Cible vide sur les autres routes = agit comme spacer. -->
      <div id="space-builder-header-target" class="d-flex align-center flex-grow-1"></div>

      <!-- Action buttons — cloche masquée en mobile pour libérer de la place. -->
      <v-btn v-if="!isMobile" icon variant="text" class="action-btn">
        <v-badge color="#ff3131" content="3" offset-x="-2" offset-y="2">
          <Bell :size="20" />
        </v-badge>
      </v-btn>

      <v-btn icon variant="text" class="action-btn" @click="openSettingsDrawer">
        <Settings :size="20" />
      </v-btn>

      <v-divider vertical class="mx-3"></v-divider>

      <!-- User profile with menu -->
      <v-menu
        v-model="showUserMenu"
        :close-on-content-click="false"
        location="bottom end"
        offset="8"
      >
        <template v-slot:activator="{ props }">
          <div class="user-profile" v-bind="props">
            <v-avatar size="36" color="#ff3131" class="user-avatar">
              <span class="text-white font-weight-bold" style="font-size: 0.85rem;">{{ userInitials }}</span>
            </v-avatar>
          </div>
        </template>

        <v-card class="user-menu-card" elevation="8" rounded="lg">
          <!-- Profile header -->
          <div class="ump-header">
            <v-avatar size="52" color="#ff3131" class="ump-avatar">
              <span class="text-white font-weight-bold" style="font-size: 1.1rem;">{{ userInitials }}</span>
            </v-avatar>
            <div class="ump-header-info">
              <div class="ump-name">{{ userName }}</div>
              <div class="ump-email">{{ user?.email }}</div>
              <v-chip v-if="userRoleName" size="x-small" color="#ff3131" variant="tonal" rounded="lg" class="mt-1">
                {{ userRoleName }}
              </v-chip>
            </div>
          </div>

          <v-divider />

          <!-- Details -->
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

          <!-- Actions -->
          <v-list density="compact" class="pa-1">
            <v-list-item rounded="lg" class="ump-action-item" @click="goToProfile">
              <template #prepend>
                <UserCog :size="16" class="mr-3 ump-action-icon" />
              </template>
              <v-list-item-title class="text-body-2">{{ t('navProfile') }}</v-list-item-title>
            </v-list-item>
            <v-list-item rounded="lg" class="ump-action-item ump-action-item--logout" @click="handleSignOut">
              <template #prepend>
                <LogOut :size="16" class="mr-3" />
              </template>
              <v-list-item-title class="text-body-2">{{ t('signOut') }}</v-list-item-title>
            </v-list-item>
          </v-list>
        </v-card>
      </v-menu>
    </v-app-bar>

    <v-main>
      <RouterView v-slot="{ Component, route }">
        <keep-alive v-if="route.meta.keepAlive">
          <component :is="Component" :key="route.name" />
        </keep-alive>
        <!-- :key=path (PAS fullPath) : la query (?event/?config/?toolbox) est
             de l'ÉTAT interne des vues, écrit par elles-mêmes (deep-link sync).
             Keyer sur fullPath remontait TOUTE la vue (loadSpace + loadAll,
             ~17 s de backend) à chaque sélection d'event/config/toolbox. Le
             back/forward navigateur sur query-only est couvert par des
             watchers dédiés (AnalyseView ?toolbox, EventPredictView ?event). -->
        <component v-else :is="Component" :key="route.path" />
      </RouterView>
    </v-main>
  </v-app>
</template>

<script>
import { mapActions, mapGetters } from "vuex";
import { t as translate } from '@/i18n';
import isMobileMixin from "@/ui/useMobile";
import {
  Bell,
  Carrot,
  Settings,
  LogOut,
  Building2,
  Calendar,
  UtensilsCrossed,
  Users,
  Plus,
  CalendarPlus,
  FileText,
  UserPlus,
  Copy,
  Check,
  Coffee,
  Building,
  ShoppingBag,
  Ticket,
  Plug,
  Warehouse,
  ChevronLeft,
  ChevronRight,
  CalendarCheck,
  Layers,
  Moon,
  Sun,
  Store,
  Languages,
  UserCog,
  Shield,
  Phone,
  Search,
} from "lucide-vue-next";
import { SETTINGS_NAVIGATION, MAIN_NAVIGATION } from '@/constants/navigation';

const SETTINGS_ICONS = {
  UtensilsCrossed,
  CalendarCheck,
  Layers,
  Plug,
  UserCog,
  Shield,
  // Icônes de la sidebar gauche (MAIN_NAVIGATION)
  Building2,
  Coffee,
  Building,
  ShoppingBag,
  Ticket,
  Warehouse,
};

export default {
  name: "DashboardView",

  mixins: [isMobileMixin],

  components: {
    Moon,
    Sun,
    Carrot,
    ChevronLeft,
    ChevronRight,
    Warehouse,
    Settings,
    Plug,
    Ticket,
    ShoppingBag,
    Building,
    Coffee,
    Bell,
    Settings,
    LogOut,
    Building2,
    Calendar,
    UtensilsCrossed,
    CalendarCheck,
    Layers,
    Users,
    Plus,
    CalendarPlus,
    FileText,
    UserPlus,
    Copy,
    Check,
    Coffee,
    Store,
    Languages,
    UserCog,
    Shield,
    Phone,
    Search,
  },

  data() {
    return {
      iconComponents: SETTINGS_ICONS,
      showUserMenu: false,
      copied: false,
      drawer: true,
      rail: false,
      // True tant que l'overlay EventPredict est monté (émis par EventPredictView
      // via window event). Pilote le drawer permanent+rail qui POUSSE l'overlay.
      eventPredictActive: false,
      settingsDrawer: false,
      // Filtre de la barre de recherche du groupe déroulant « Edit space ».
      editSpaceSearch: '',
      locale: localStorage.getItem('appLocale') || 'en',
      theme: (() => {
        // Lire depuis les deux clés possibles (datafriday:theme = clé vuetify.js, appTheme = ancienne clé)
        const saved = localStorage.getItem('datafriday:theme') || localStorage.getItem('appTheme') || 'dataFridayLight';
        // Normalise legacy values
        if (saved === 'light') return 'dataFridayLight';
        if (saved === 'dark') return 'dataFridayDark';
        return saved;
      })(),
    };
  },

  computed: {
    ...mapGetters("auth", ["currentUser", "currentTenant", "can", "isSuperAdmin"]),
    user() {
      return this.currentUser;
    },
    tenant() {
      return this.currentTenant;
    },
    userName() {
      if (this.user?.firstName && this.user?.lastName) {
        return `${this.user.firstName} ${this.user.lastName}`;
      }
      return this.user?.email?.split("@")[0] || "Utilisateur";
    },
    isAnalyseRoute() {
      return this.$route.name === 'space-analyse';
    },
    // Routes qui rendent leur PROPRE header (WorkspaceAppHeader dans leur propre
    // <v-app>, comme Analyse) → DashboardView masque sa barre ET son drawer.
    isSelfHeadedRoute() {
      return this.isSelfHeadedRouteName(this.$route.name);
    },
    isFocusWorkspaceRoute() {
      return this.isFocusWorkspaceRouteName(this.$route.name);
    },
    // Drawer rail PERMANENT qui POUSSE la page (comme Menus des Espaces) au lieu
    // d'un overlay qui recouvre. Vrai pour :
    //  - l'overlay EventPredict actif (teleporté → décalé via --df-nav-left)
    //  - Inventaire / Réarmement (v-app en flux → poussés nativement par Vuetify)
    // Ces routes gardent leur propre header (isSelfHeadedRoute) mais avec le rail.
    isRailPushRoute() {
      return this.eventPredictActive || this.isRailPushRouteName(this.$route.name);
    },
    userInitials() {
      if (this.user?.firstName && this.user?.lastName) {
        return `${this.user.firstName[0]}${this.user.lastName[0]}`.toUpperCase();
      }
      return this.user?.email?.[0]?.toUpperCase() || "U";
    },
    userRoleName() {
      if (this.user?.role?.name) return this.user.role.name;
      if (this.user?.roleName) return this.user.roleName;
      const storeUser = (this.$store.getters['users/users'] || [])
        .find((u) => u.email === this.user?.email || u.id === this.user?.id);
      return storeUser?.role?.name || storeUser?.roleName || null;
    },
    userPhone() {
      if (this.user?.phone) return this.user.phone;
      const storeUser = (this.$store.getters['users/users'] || [])
        .find((u) => u.email === this.user?.email || u.id === this.user?.id);
      return storeUser?.phone || null;
    },
    visibleMainNavigation() {
      return MAIN_NAVIGATION
        .map((section) => ({
          ...section,
          items: section.items.filter((i) => !i.permission || this.can(i.permission)),
        }))
        .filter((section) => section.items.length > 0);
    },
    // Items du groupe déroulant « Edit space » : un item par space existant,
    // pointant vers son builder 3D. Le titre est le nom du space (t() retombe
    // sur la valeur brute puisque ce n'est pas une clé i18n).
    editSpaceItems() {
      const spaces = this.$store.getters['spaces/spaces'] || [];
      return spaces
        .filter((s) => s && s.id != null)
        .map((s) => ({
          title: s.name || s.spaceName || s.title || `Space ${s.id}`,
          route: `/spaces/${s.id}/builder2`,
        }));
    },
    visibleSettingsNavigation() {
      return SETTINGS_NAVIGATION
        .map((section) => ({
          ...section,
          groups: (section.groups || [])
            .map((group) => {
              // Groupe dynamique (ex. « Edit space ») : items résolus au runtime,
              // gated par la permission de groupe (pas d'items statiques à filtrer).
              if (group.dynamic === 'spaces') {
                const permitted = this.can(group.permission);
                return { ...group, _permitted: permitted, items: permitted ? this.editSpaceItems : [] };
              }
              return { ...group, items: group.items.filter((i) => this.can(i.permission)) };
            })
            // Groupe dynamique : reste visible dès que la permission est là (même
            // sans espace) pour pouvoir afficher un état vide. Groupes statiques :
            // masqués si aucun item autorisé.
            .filter((group) => (group.dynamic === 'spaces' ? group._permitted : group.items.length > 0)),
          standalone: (section.standalone || []).filter((i) => this.can(i.permission)),
        }))
        .filter((section) => section.groups.length > 0 || section.standalone.length > 0);
    },
  },

  watch: {
    drawer(val) {
      if (val) this.settingsDrawer = false;
      this.syncNavLeftVar();
    },
    rail() {
      this.syncNavLeftVar();
    },
    settingsDrawer(val) {
      if (val) {
        this.drawer = false;
        // Alimente le groupe déroulant « Edit space » (cache TTL côté store, donc
        // pas de refetch inutile à chaque ouverture).
        this.$store.dispatch('spaces/fetchSpaces').catch(() => {});
      } else {
        this.applyRouteSidebarMode(this.$route.name);
      }
    },
    '$route'(to) {
      this.applyRouteSidebarMode(to?.name);
    },
    // L'overlay EventPredict s'ouvre/ferme SANS changer de route (toolbox dans
    // AnalyseView) → recalcul du mode drawer + décalage overlay.
    eventPredictActive() {
      this.applyRouteSidebarMode(this.$route.name);
      this.syncNavLeftVar();
    },
    // Bascule mobile <-> desktop : on recalcule le mode pour ne pas rester
    // coincé en rail (desktop) ou en overlay ouvert (mobile).
    isMobile() {
      this.applyRouteSidebarMode(this.$route.name);
    },
  },

  methods: {
    ...mapActions("auth", ["signOut"]),

    t(key) {
      return translate(key, this.locale);
    },

    isFocusWorkspaceRouteName(name) {
      return ['space-inventory', 'space-pre-inventory', 'space-logistic', 'space-restock'].includes(name);
    },
    // Doit rester aligné avec le computed isSelfHeadedRoute.
    isSelfHeadedRouteName(name) {
      // Pages plein écran avec leur propre header (pas de barre/drawer Dashboard).
      // space-restock inclus : il rend son propre WorkspaceAppHeader (sinon la
      // barre Dashboard s'empilait AU-DESSUS → header dupliqué).
      // 'hr' RETIRÉ : HrSuppliersView est une page Settings classique (comme
      // /menu-fb/suppliers), sans header propre → elle garde la barre Dashboard.
      // 'hr-settings' RETIRÉ aussi (refonte charte HR) : HrSettingsView est rendue
      // dans le chrome Dashboard (header hsl sticky dans le flux), comme Suppliers.
      return ['space-analyse', 'space-live', 'space-predict', 'space-inventory', 'space-pre-inventory', 'space-logistic', 'space-restock'].includes(name);
    },
    // Doit rester aligné avec le computed isRailPushRoute (partie route).
    isRailPushRouteName(name) {
      return ['space-analyse', 'space-live', 'space-inventory', 'space-pre-inventory', 'space-logistic', 'space-restock'].includes(name);
    },

    applyRouteSidebarMode(routeName) {
      // Mobile : sidebar toujours masquée (s'ouvre en overlay via le bouton).
      // Jamais de mode rail — le rail est un pattern desktop.
      if (this.isMobile) {
        this.drawer = false;
        this.rail = false;
        return;
      }
      // Rail-push (overlay EventPredict actif OU Inventaire / Réarmement) :
      // drawer permanent en rail qui POUSSE la page. Le chevron déploie/replie.
      if (this.eventPredictActive || this.isRailPushRouteName(routeName)) {
        this.drawer = true;
        this.rail = true;
        return;
      }
      // Routes auto-headées (Réarmement, Inventaire) : drawer global masqué,
      // elles ont leur propre header + navigation.
      if (this.isSelfHeadedRouteName(routeName)) {
        this.drawer = false;
        this.rail = false;
        return;
      }
      if (this.isFocusWorkspaceRouteName(routeName)) {
        this.drawer = true;
        this.rail = true;
        return;
      }
      // Routes normales : drawer visible mais REPLIÉ (rail) — il ne s'étend
      // en grand que sur clic explicite (@click="rail = false"), pas à chaque
      // navigation.
      this.drawer = true;
      this.rail = true;
    },

    // Écrit la largeur RÉELLE du drawer sur documentElement (--df-nav-left) pour
    // que l'overlay EventPredict (teleporté sur <body>, hors .v-main) puisse se
    // décaler et être POUSSÉ par le rail au lieu d'être recouvert. rail=70px,
    // déployé=256px (largeur drawer par défaut), fermé/mobile=0.
    syncNavLeftVar() {
      if (typeof document === 'undefined') return;
      let left = 0;
      if (!this.isMobile && this.drawer) {
        left = this.rail ? 70 : 256;
      }
      document.documentElement.style.setProperty('--df-nav-left', `${left}px`);
      // Diffuse l'état déplié/replié aux overlays (EventPredict) pour qu'ils
      // orientent leur chevron (large → flèche gauche, rail → flèche droite).
      window.dispatchEvent(new CustomEvent('datafriday:main-navigation-state', {
        detail: { expanded: left >= 256 },
      }));
    },

    toggleSidebar() {
      // Mobile : simple bascule ouverture/fermeture de l'overlay (slide), sans rail.
      if (this.isMobile) {
        this.rail = false;
        this.drawer = !this.drawer;
        return;
      }
      if (!this.drawer) {
        this.drawer = true;
        this.rail = this.isFocusWorkspaceRoute;
        return;
      }
      if (this.rail) {
        this.rail = false;
        return;
      }
      if (this.isFocusWorkspaceRoute) {
        this.rail = true;
        return;
      }
      this.drawer = false;
    },

    openSettingsDrawer() {
      this.settingsDrawer = true;
    },

    goToSpaces() {
      this.$router.push({ path: "/spaces" });
    },

    // Sidebar gauche : navigation. `route` falsy (analytics à venir) = no-op
    // (l'item est déjà rendu `:disabled`). Le watcher `$route` referme le drawer
    // en mobile via applyRouteSidebarMode.
    goToFromMainNav(route) {
      if (!route) return;
      this.$router.push(route);
    },

    goToFromSettings(route) {
      this.settingsDrawer = false;
      this.editSpaceSearch = '';
      this.$router.push(route);
    },

    // Items affichés d'un groupe : pour le groupe dynamique « Edit space », on
    // applique le filtre de la barre de recherche (sur le nom du space).
    filteredGroupItems(group) {
      if (group.dynamic !== 'spaces') return group.items;
      const q = (this.editSpaceSearch || '').trim().toLowerCase();
      if (!q) return group.items;
      return group.items.filter((i) => String(i.title || '').toLowerCase().includes(q));
    },

    goToProfile() {
      this.showUserMenu = false;
      this.$router.push({ path: '/profile' });
    },

    async handleSignOut() {
      await this.signOut();
      this.$router.push("/login");
    },

    async copyInvitationCode() {
      try {
        await navigator.clipboard.writeText(this.tenant?.invitationCode || "");
        this.copied = true;
        setTimeout(() => {
          this.copied = false;
        }, 2000);
      } catch (error) {
        console.error("Failed to copy:", error);
      }
    },

    changeLocale(newLocale) {
      this.locale = newLocale;
      localStorage.setItem('appLocale', newLocale);
      // Émettre un événement global pour que tous les composants puissent réagir
      window.dispatchEvent(new CustomEvent('locale-changed', { detail: { locale: newLocale } }));
    },

    changeTheme(newTheme) {
      this.theme = newTheme;
      localStorage.setItem('appTheme', newTheme);
      localStorage.setItem('datafriday:theme', newTheme);
      // Appliquer le thème à Vuetify (doit correspondre aux noms déclarés dans vuetify.js)
      this.$vuetify.theme.change(newTheme);
      // Synchronise la classe `.dark` sur <html> pour Tailwind / sélecteurs globaux
      if (typeof document !== 'undefined') {
        document.documentElement.classList.toggle('dark', newTheme === 'dataFridayDark');
      }
      // Émettre un événement global
      window.dispatchEvent(new CustomEvent('theme-changed', { detail: { theme: newTheme } }));
    },
  },

  created() {
    // Enregistré en created() (parent AVANT montage des enfants) pour ne PAS
    // manquer le signal de l'overlay EventPredict, dont le mount enfant précède
    // le mounted() de ce parent.
    this._eventPredictActiveHandler = (e) => {
      this.eventPredictActive = !!e?.detail?.active;
    };
    window.addEventListener('datafriday:eventpredict-active', this._eventPredictActiveHandler);

    // Anti-flash : si l'URL ouvre déjà l'overlay EventPredict
    // (?toolbox=event-predict), on met le drawer en rail AVANT le 1er rendu.
    // Sinon il s'affiche déployé puis se replie quand l'enfant EventPredictView
    // émet le signal (son mount suit le rendu du parent).
    if (this.$route?.query?.toolbox === 'event-predict') {
      this.eventPredictActive = true;
      this.applyRouteSidebarMode(this.$route.name);
    }
  },

  mounted() {
    this.applyRouteSidebarMode(this.$route.name);
    this.syncNavLeftVar();

    // Appliquer le thème sauvegardé
    this.$vuetify.theme.change(this.theme);
    // Synchronise la classe `.dark` sur <html>
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark', this.theme === 'dataFridayDark');
    }

    // Reactive locale update
    this._localeHandler = (e) => { this.locale = e.detail.locale; };
    window.addEventListener('locale-changed', this._localeHandler);

    // Ouvre le drawer Settings depuis AnalyseAppHeader (barre globale masquée sur la route analyse)
    this._settingsHandler = () => { this.settingsDrawer = true; };
    window.addEventListener('datafriday:open-settings', this._settingsHandler);
    this._mainNavigationHandler = () => {
      this.drawer = true;
      // Rail-push (EventPredict / Inventaire / Réarmement) : drawer déjà
      // permanent en rail → le chevron BASCULE rail <-> large. On lit l'état
      // courant (ne PAS forcer rail=true avant, sinon le toggle renvoie
      // toujours false et le drawer ne se replie jamais). Sinon : ouvre le
      // drawer déplié.
      if (this.isRailPushRoute) {
        this.rail = !this.rail;
      } else {
        this.rail = false;
      }
    };
    window.addEventListener('datafriday:open-main-navigation', this._mainNavigationHandler);

    // Close dropdown when clicking outside
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".relative")) {
        this.showUserMenu = false;
      }
    });
  },

  beforeUnmount() {
    window.removeEventListener('locale-changed', this._localeHandler);
    window.removeEventListener('datafriday:open-settings', this._settingsHandler);
    window.removeEventListener('datafriday:open-main-navigation', this._mainNavigationHandler);
    window.removeEventListener('datafriday:eventpredict-active', this._eventPredictActiveHandler);
  },
};
</script>

<style scoped>
/* App Bar Styling */
.main-nav-drawer {
  z-index: 2100 !important;
}

/* Rail replié : masquer les libellés qui « bavent » (MENU / ANALYTICS via slot
   par défaut, non gérés par le rail Vuetify) + tout élément tagué data-rail-hide.
   Vuetify pose .v-navigation-drawer--rail sur la racine du drawer quand replié. */
.main-nav-drawer.v-navigation-drawer--rail .section-header,
.main-nav-drawer.v-navigation-drawer--rail [data-rail-hide] {
  display: none !important;
}

.app-bar-custom {
  position: fixed !important;
  top: 0 !important;
  z-index: 1000 !important;
  background: rgb(var(--v-theme-surface)) !important;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  backdrop-filter: blur(10px);
}

.app-bar-logo {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  margin-left: 4px;
  margin-right: 8px;
  cursor: pointer;
  border-radius: 8px;
  padding: 2px;
  transition: background-color 0.2s ease;
}

.app-bar-logo:hover {
  background-color: rgba(255, 49, 49, 0.08);
}

.nav-icon-hover {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.nav-icon-hover:hover {
  background-color: rgba(255, 49, 49, 0.08);
  transform: scale(1.05);
}

/* Action Buttons */
.action-btn {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  margin: 0 4px;
}

.action-btn:hover {
  background-color: rgba(255, 49, 49, 0.08);
  transform: translateY(-2px);
}

/* User Profile */
.user-profile {
  display: flex;
  align-items: center;
  padding: 4px;
  border-radius: 50%;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  margin-right: 8px;
}

.user-profile:hover {
  background-color: rgba(255, 49, 49, 0.08);
  transform: translateY(-1px);
}

.user-avatar {
  transition: all 0.3s ease;
  box-shadow: 0 2px 8px rgba(255, 49, 49, 0.2);
}

.user-profile:hover .user-avatar {
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(255, 49, 49, 0.3);
}

.user-info {
  display: flex;
  flex-direction: column;
}

.user-name {
  font-size: 0.875rem;
  font-weight: 600;
  color: rgb(var(--v-theme-on-surface));
  line-height: 1.2;
}

.user-role {
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
  line-height: 1.2;
}

/* User Menu Card */
.user-menu-card {
  min-width: 300px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  animation: slideDown 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
}

@keyframes slideDown {
  from { opacity: 0; transform: translateY(-8px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* Profile header */
.ump-header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px 16px 14px;
}

.ump-avatar {
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(255, 49, 49, 0.25);
}

.ump-header-info {
  flex: 1;
  min-width: 0;
}

.ump-name {
  font-size: 0.9375rem;
  font-weight: 700;
  color: rgb(var(--v-theme-on-surface));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ump-email {
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-surface), 0.55);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 1px;
}

/* Details section */
.ump-details {
  padding: 10px 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ump-detail-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), 0.65);
}

.ump-detail-icon {
  flex-shrink: 0;
  color: rgba(var(--v-theme-on-surface), 0.4);
}

/* Action items */
.ump-action-item {
  transition: background 0.15s ease;
  min-height: 36px !important;
}

.ump-action-item .ump-action-icon {
  color: rgba(var(--v-theme-on-surface), 0.55);
}

.ump-action-item--logout:hover {
  background-color: rgba(255, 49, 49, 0.07) !important;
  color: #ff3131;
}

/* Navigation Drawer */
.logo-item {
  padding: 16px;
  margin-bottom: 8px;
}

/* Logo épinglé : le slot prepend ne scroll pas */
:deep(.v-navigation-drawer__prepend) {
  flex-shrink: 0;
  position: sticky;
  top: 0;
  z-index: 1;
  background: rgb(var(--v-theme-surface));
}

/* Settings Drawer Layout */
.settings-drawer-inner {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.settings-drawer-header {
  flex-shrink: 0;
}

.settings-drawer-content {
  flex: 1;
  overflow-y: auto;
}

/* Barre de recherche du groupe déroulant « Edit space » (tokens Vuetify → dark auto). */
.settings-space-search {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 4px 24px 8px 24px;
  padding: 6px 12px;
  border-radius: 10px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.14);
  background: rgba(var(--v-theme-on-surface), 0.04);
}
.settings-space-search:focus-within {
  border-color: #ff3131;
  box-shadow: 0 0 0 3px rgba(255, 49, 49, 0.12);
}
.settings-space-search__icon { color: rgba(var(--v-theme-on-surface), 0.45); flex-shrink: 0; }
.settings-space-search__input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  font-size: var(--fs-base);
  color: rgb(var(--v-theme-on-surface));
  font-family: inherit;
}
.settings-space-search__input::placeholder { color: rgba(var(--v-theme-on-surface), 0.4); }

/* État vide du groupe « Edit space » (aucun résultat / aucun espace). */
.settings-space-empty {
  margin: 2px 24px 8px 24px;
  padding: 8px 4px;
  font-size: var(--fs-sm);
  font-style: italic;
  color: rgba(var(--v-theme-on-surface), 0.5);
  text-align: center;
}



.logo-text {
  background: linear-gradient(135deg, #ff3131 0%, #e74c3c 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  font-size: 1.1rem;
}

/* Section Headers */
.section-header {
  text-transform: uppercase;
  font-size: 0.65rem;
  color: rgba(var(--v-theme-on-surface), 0.5);
  font-weight: 600;
  letter-spacing: 0.5px;
  margin-top: 8px;
  padding-left: 16px !important;
}

.menu {
  text-transform: uppercase;
  font-size: 0.65rem;
  color: rgba(var(--v-theme-on-surface), 0.5);
}

/* List Items Animation */
:deep(.v-list-item) {
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  border-radius: 8px;
  margin: 2px 8px;
}

:deep(.v-list-item:hover) {
  transform: translateX(4px);
  background-color: rgba(255, 49, 49, 0.05);
}

:deep(.v-list-item--active) {
  background: linear-gradient(90deg, rgba(255, 49, 49, 0.1) 0%, rgba(255, 49, 49, 0.05) 100%);
  border-left: 3px solid #ff3131;
}

/* Smooth transitions for drawers */
:deep(.v-navigation-drawer) {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
}

/* Icons hover effect */
:deep(.v-list-item__prepend) {
  transition: all 0.3s ease;
}

:deep(.v-list-item:hover .v-list-item__prepend) {
  transform: scale(1.1);
}

/* Divider styling */
:deep(.v-divider) {
  opacity: 0.6;
}

/* Main content area */
:deep(.v-main) {
  background: rgb(var(--v-theme-background));
}
</style>

<!-- Règles non-scoped : nécessaires pour que l'override de Vuetify s'applique
     correctement sur .v-navigation-drawer__content (les :deep() scoped ne
     percent pas dans Vuetify 3 avec ce build setup). -->
<style>
/* Drawers — contenu non scrollable */
.main-nav-drawer .v-navigation-drawer__content,
.settings-drawer .v-navigation-drawer__content {
  overflow: hidden !important;
  display: flex;
  flex-direction: column;
}

/* Vuetify 3.12+ ne génère plus de .v-main__wrap.
   Le scroll vertical est géré par chaque page via son propre conteneur racine.
   On n'impose aucun overflow sur .v-main pour éviter le scroll horizontal
   parasite (overflow-y:auto force overflow-x:auto en CSS). */

/* Dark mode — section « Configuration » du settings-drawer et ses sous-menus.
   Le drawer suit déjà les variables de thème Vuetify ; on garantit ici que les
   groupes (v-list-group) et surtout leurs sous-items DÉPLIÉS restent sur fond
   sombre, texte clair, survol/actif cohérents. Scopé sous `.dark` → le mode
   clair n'est jamais affecté. Placé en style non-scopé pour percer Vuetify. */
.dark .settings-drawer .settings-drawer-content .v-list,
.dark .settings-drawer .settings-drawer-content .v-list-group,
.dark .settings-drawer .settings-drawer-content .v-list-group__items {
  background: transparent !important;
}
.dark .settings-drawer .settings-drawer-content .v-list-item-title,
.dark .settings-drawer .settings-drawer-content .v-list-item__content {
  color: rgb(var(--v-theme-on-surface)) !important;
}
.dark .settings-drawer .settings-drawer-content .v-list-item:hover {
  background-color: rgba(255, 49, 49, 0.08) !important;
}
.dark .settings-drawer .settings-drawer-content .v-list-item--active {
  background: linear-gradient(90deg, rgba(255, 49, 49, 0.20) 0%, rgba(255, 49, 49, 0.08) 100%) !important;
}
</style>
