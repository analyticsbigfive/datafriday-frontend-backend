import { createRouter, createWebHistory } from 'vue-router'
import store from '@/store'
import { requireOrganization, guestOnly, spaceEntryGuard, onboardingGuard } from './guards'

// Views — PERF: imports LAZY (`() => import(...)`) au lieu de statiques. En
// statique, ces ~31 vues étaient inlinées dans le chunk eager `app.js` (953KB),
// téléchargé+parsé au premier paint de CHAQUE route (login inclus) avant même
// d'atteindre l'écran demandé. En lazy, chacune part dans son propre chunk chargé
// à la navigation. Vue Router accepte une fonction renvoyant une promesse comme
// `component`, donc les définitions de routes (`component: XView`) sont inchangées.
const LoginView = () => import('../views/LoginView.vue')
const SignUpView = () => import('../views/SignUpView.vue')
const ForgotPasswordView = () => import('../views/ForgotPasswordView.vue')
const ResetPasswordView = () => import('../views/ResetPasswordView.vue')
const VerifyEmailView = () => import('../views/VerifyEmailView.vue')
const OnboardingView = () => import('../views/OnboardingView.vue')
const DashboardView = () => import('../views/DashboardView.vue')
const SpaceListView = () => import('../components/spaces/views/SpaceListView.vue')

// Routes Events Views
const EventsListView = () => import('../components/events/views/EventsListView.vue')
const EventsTypeListView = () => import('../components/events/views/EventsTypeListView.vue')
const EventsCategorieListView = () => import('../components/events/views/EventsCategorieListView.vue')
const EventsSubcategorieListView = () => import('../components/events/views/EventsSubcategorieListView.vue')

// Route HR View (Edit HR : bibliothèques Suppliers / Staff Positions)
const HrView = () => import('../components/hr/views/HrView.vue')

// Routes Menu FB Views — lazy comme le reste (en statique, ces 18 vues admin
// étaient inlinées dans app.js et payées au premier paint de toutes les routes).
const SuppliersListView = () => import('../components/menu-fb/views/suppliers/views/SuppliersListView.vue')
const MarketPriceListView = () => import('@/components/menu-fb/views/market-prices/views/MarketPriceListView.vue')
const componentListView = () => import('@/components/menu-fb/views/component-library/views/componentListView.vue')
const ComponentCreateView = () => import('@/components/menu-fb/views/component-library/views/ComponentCreateView.vue')
const SpaceMenuView = () => import('@/components/menu-fb/views/space-menus/views/SpaceMenuView.vue')
const ShopDetailView = () => import('@/components/menu-fb/views/space-menus/views/ShopDetailView.vue')
const MenuItemView = () => import('@/components/menu-fb/views/menu-items/views/MenuItemView.vue')
const MenuItemCreateView = () => import('@/components/menu-fb/views/menu-items/views/MenuItemCreateView.vue')
const ProductCategoryList = () => import('@/components/products/views/ProductCategoryList.vue')
const ProductTypeList = () => import('@/components/products/views/ProductTypeList.vue')
const MarketPriceCategoryList = () => import('@/components/market-prices/views/MarketPriceCategoryList.vue')
const MarketPriceTypeList = () => import('@/components/market-prices/views/MarketPriceTypeList.vue')
const ComponentTypeList = () => import('@/components/menu-fb/views/component-library/views/ComponentTypeList.vue')
const ComponentCategoryList = () => import('@/components/menu-fb/views/component-library/views/ComponentCategoryList.vue')
const BrandNameListView = () => import('@/components/brand-name/views/BrandNameListView.vue')
const DisplayNameListView = () => import('@/components/display-name/views/DisplayNameListView.vue')
const IndustrialListView = () => import('@/components/industrial/views/IndustrialListView.vue')
const PackingTypeListView = () => import('@/components/packing-type/views/PackingTypeListView.vue')
const PermissionListView = () => import('@/components/permission/views/PermissionListView.vue')
const RoleListView = () => import('@/components/role/views/RoleListView.vue')
const UserListView = () => import('@/components/user/views/UserListView.vue')
const UserCreateView = () => import('@/components/user/views/UserCreateView.vue')
const ProfileView = () => import('@/components/user/views/ProfileView.vue')

const routes = [
  // Public routes (guest only)
  {
    path: '/login',
    name: 'login',
    component: LoginView,
    beforeEnter: guestOnly,
    meta: { title: 'Connexion' }
  },
  {
    path: '/signup',
    name: 'signup',
    component: SignUpView,
    beforeEnter: guestOnly,
    meta: { title: 'Créer un compte' }
  },
  {
    path: '/forgot-password',
    name: 'forgot-password',
    component: ForgotPasswordView,
    beforeEnter: guestOnly,
    meta: { title: 'Mot de passe oublié' }
  },
  {
    path: '/reset-password',
    name: 'reset-password',
    component: ResetPasswordView,
    meta: { title: 'Réinitialiser le mot de passe' }
  },
  {
    // Landing page for Supabase invitation emails (INVITE_REDIRECT_URL).
    // The invite token establishes a session; the user sets name + password here.
    path: '/accept-invite',
    name: 'accept-invite',
    component: () => import('../views/AcceptInviteView.vue'),
    meta: { title: 'Activer mon compte' }
  },
  {
    path: '/verify-email',
    name: 'verify-email',
    component: VerifyEmailView,
    meta: { title: 'Vérification  email' }
  },
  
  // Auth callback (pour OAuth)
  {
    path: '/auth/callback',
    name: 'auth-callback',
    component: () => import('../views/AuthCallbackView.vue'),
    meta: { title: 'Authentification...' }
  },
  
  // Onboarding (auth required, no org)
  {
    path: '/onboarding',
    name: 'onboarding',
    component: OnboardingView,
    beforeEnter: onboardingGuard,
    meta: { title: 'Configuration' }
  },
  
  // Protected routes (auth + org required)
  {
    path: '/dashboard',
    name: 'dashboard',
    component: DashboardView,
    beforeEnter: requireOrganization,
    meta: { title: 'Tableau de bord' },
    redirect: '/spaces',
    children: [
      {
        path: '/spaces',
        name: 'spaces',
        component: SpaceListView,
        meta: { title: 'Liste des spaces', keepAlive: true }
      },

      {
        path: '/spaces-overview',
        name: 'spaces-overview',
        component: () => import('@/views/SpacesOverviewView.vue'),
        meta: { title: 'Overview espaces', keepAlive: true }
      },

      {
        path: '/spaces/:spaceId',
        name: 'space-analyse',
        component: () => import('@/components/analyse/AnalyseView.vue'),
        // Vue par défaut d'un espace : le guard fait atterrir chaque rôle sur
        // son 1er écran autorisé (Analyse sinon Inventory/Réarmement…).
        beforeEnter: spaceEntryGuard,
        meta: { title: 'Analyse' }
      },

      {
        // Builder v2 (refonte — docs/REFONTE_3D_BUILDER_V2.md) : autosave granulaire,
        // pas de keep-alive nécessaire (aucun état non sauvegardé à préserver). Builder v1
        // (Config.data JSON blob) retiré — builder2 est l'unique parcours d'édition d'espace.
        name: 'SpaceBuilder2',
        path: '/spaces/:spaceId/builder2',
        component: () => import('@/components/spaces/views/builder2/BuilderPage.vue'),
        meta: { title: 'Builder v2', permission: 'space.edit' }
      },

      {
        path: '/spaces/:spaceId/predict',
        name: 'space-predict',
        component: () => import('@/views/SpacePredictView.vue'),
        meta: { title: 'Event Predict', keepAlive: true, permission: 'front.fb.eventPredict' }
      },

      {
        path: '/spaces/:spaceId/inventory',
        name: 'space-inventory',
        component: () => import('@/views/SpaceInventoryView.vue'),
        meta: { title: 'Post-event Inventory', keepAlive: true, permission: 'front.fb.spaceInventory', inventoryMode: 'post' }
      },

      {
        // Pre-event Inventory : MÊME composant en mode 'pre' (event FUTUR,
        // quantités attendues gatées) — 2 instances keepAlive distinctes (key =
        // route.path). Doc : docs/modules/10_POST_EVENT_INVENTORY.md §8.
        path: '/spaces/:spaceId/pre-inventory',
        name: 'space-pre-inventory',
        component: () => import('@/views/SpaceInventoryView.vue'),
        meta: { title: 'Pre-event Inventory', keepAlive: true, permission: 'front.fb.spaceInventory', inventoryMode: 'pre' }
      },

      {
        path: '/spaces/:spaceId/logistic',
        name: 'space-logistic',
        component: () => import('@/views/SpaceLogisticView.vue'),
        meta: { title: 'Logistique', keepAlive: true, permission: 'front.fb.logistic' }
      },

      {
        path: '/spaces/:spaceId/restock',
        name: 'space-restock',
        component: () => import('@/views/SpaceRestockView.vue'),
        meta: { title: 'Réarmement', keepAlive: true, permission: ['front.fb.restock', 'front.fb.restockBoard'] }
      },

      {
        path: '/events',
        name: 'events',
        component: EventsListView,
        meta: { title: 'Liste des événements', keepAlive: true, permission: 'menu.events.manage' }
      },
      {
        path: '/events/event-types',
        name: 'event-types',
        component: EventsTypeListView,
        meta: { title: 'Liste des types d\'événements', keepAlive: true, permission: 'menu.events.manage' }
      },
      { path: '/event-types', redirect: '/events/event-types' },
      {
        path: '/events/event-categories',
        name: 'event-categories',
        component: EventsCategorieListView,
        meta: { title: 'Liste des catégories d\'événements', keepAlive: true, permission: 'menu.events.manage' }
      },
      { path: '/event-categories', redirect: '/events/event-categories' },
      {
        path: '/events/event-subcategories',
        name: 'event-subcategories',
        component: EventsSubcategorieListView,
        meta: { title: 'Liste des sous catégories d\'événements', keepAlive: true, permission: 'menu.events.manage' }
      },
      { path: '/event-subcategories', redirect: '/events/event-subcategories' },

      {
        path: '/hr',
        name: 'hr',
        component: HrView,
        meta: { title: 'Edit HR', keepAlive: true, permission: 'menu.hr.manage' }
      },

      {
        path: '/menu-fb/suppliers',
        name: 'suppliers',
        component: SuppliersListView,
        meta: { title: 'Liste des fournisseurs', keepAlive: true, permission: 'menu.fb.suppliers' }
      },
      { path: '/suppliers', redirect: '/menu-fb/suppliers' },
      {
        path: '/menu-fb/market-prices',
        name: 'market-prices',
        component: MarketPriceListView,
        meta: { title: 'Liste des prix du marché', keepAlive: true, permission: 'menu.fb.marketPrices' }
      },
      { path: '/market-prices', redirect: '/menu-fb/market-prices' },
      {
        path: '/menu-fb/components',
        name: 'components',
        component: componentListView,
        meta: { title: 'Liste des composants', keepAlive: true, permission: 'menu.fb.components' }
      },
      { path: '/components', redirect: '/menu-fb/components' },
      {
        path: '/menu-fb/components/new',
        name: 'component-create',
        component: ComponentCreateView,
        meta: { title: 'Create component', permission: 'menu.fb.components' }
      },
      { path: '/components/new', redirect: '/menu-fb/components/new' },
      {
        path: '/menu-fb/components/edit/:id',
        name: 'component-edit',
        component: ComponentCreateView,
        meta: { title: 'Edit component', permission: 'menu.fb.components' }
      },
      { path: '/components/edit/:id', redirect: to => `/menu-fb/components/edit/${to.params.id}` },
      {
        path: '/menu-fb/space-menus',
        name: 'space-menus',
        component: SpaceMenuView,
        meta: { title: 'Space Menu', keepAlive: true, permission: 'menu.fb.spaceMenu' }
      },
      { path: '/space-menus', redirect: '/menu-fb/space-menus' },
      {
        path: '/menu-fb/space-menus/:spaceId/shops/:shopId',
        name: 'shop-detail',
        component: ShopDetailView,
        meta: { title: 'Shop detail', permission: 'menu.fb.spaceMenu' }
      },
      { path: '/space-menus/:spaceId/shops/:shopId', redirect: to => `/menu-fb/space-menus/${to.params.spaceId}/shops/${to.params.shopId}` },
      {
        path: '/menu-fb/menu-items',
        name: 'menu-items',
        component: MenuItemView,
        meta: { title: 'Menu items', keepAlive: true, permission: 'menu.fb.menuItems' }
      },
      { path: '/menu-items', redirect: '/menu-fb/menu-items' },
      {
        path: '/menu-fb/menu-items/create',
        name: 'menu-item-create',
        component: MenuItemCreateView,
        meta: { title: 'Create menu item', permission: 'menu.fb.menuItems' }
      },
      { path: '/menu-items/create', redirect: '/menu-fb/menu-items/create' },
      {
        path: '/menu-fb/menu-items/edit/:id',
        name: 'menu-item-edit',
        component: MenuItemCreateView,
        meta: { title: 'Edit menu item', permission: 'menu.fb.menuItems' }
      },
      { path: '/menu-items/edit/:id', redirect: to => `/menu-fb/menu-items/edit/${to.params.id}` },
      {
        path: '/configurations/product-categories',
        name: 'product-categories',
        component: ProductCategoryList,
        meta: { title: 'Liste des catégories de produits', keepAlive: true, permission: 'menu.config.manage' }
      },
      { path: '/product-categories', redirect: '/configurations/product-categories' },
      {
        path: '/configurations/product-types',
        name: 'product-types',
        component: ProductTypeList,
        meta: { title: 'Liste des types de produits', keepAlive: true, permission: 'menu.config.manage' }
      },
      { path: '/product-types', redirect: '/configurations/product-types' },
      {
        path: '/configurations/market-price-categories',
        name: 'market-price-categories',
        component: MarketPriceCategoryList,
        meta: { title: 'Market Price Categories', keepAlive: true, permission: 'menu.config.manage' }
      },
      { path: '/market-price-categories', redirect: '/configurations/market-price-categories' },
      {
        path: '/configurations/market-price-types',
        name: 'market-price-types',
        component: MarketPriceTypeList,
        meta: { title: 'Market Price Types', keepAlive: true, permission: 'menu.config.manage' }
      },
      { path: '/market-price-types', redirect: '/configurations/market-price-types' },
      {
        path: '/configurations/component-categories',
        name: 'component-categories',
        component: ComponentCategoryList,
        meta: { title: 'Component Categories', keepAlive: true, permission: 'menu.config.manage' }
      },
      { path: '/component-categories', redirect: '/configurations/component-categories' },
      {
        path: '/configurations/component-types',
        name: 'component-types',
        component: ComponentTypeList,
        meta: { title: 'Component Types', keepAlive: true, permission: 'menu.config.manage' }
      },
      { path: '/component-types', redirect: '/configurations/component-types' },
      {
        path: '/configurations/brand-names',
        name: 'brand-names',
        component: BrandNameListView,
        meta: { title: 'Liste des marques', keepAlive: true, permission: 'menu.config.manage' }
      },
      { path: '/brand-names', redirect: '/configurations/brand-names' },
      {
        path: '/configurations/display-names',
        name: 'display-names',
        component: DisplayNameListView,
        meta: { title: "Liste des noms d'affichage", keepAlive: true, permission: 'menu.config.manage' }
      },
      { path: '/display-names', redirect: '/configurations/display-names' },
      {
        path: '/configurations/industrials',
        name: 'industrials',
        component: IndustrialListView,
        meta: { title: 'Liste des industriels', keepAlive: true, permission: 'menu.config.manage' }
      },
      { path: '/industrials', redirect: '/configurations/industrials' },
      {
        path: '/configurations/packing-types',
        name: 'packing-types',
        component: PackingTypeListView,
        meta: { title: 'Liste des packing types', keepAlive: true, permission: 'menu.config.manage' }
      },
      { path: '/packing-types', redirect: '/configurations/packing-types' },
      {
        path: '/permissions',
        name: 'permissions',
        component: PermissionListView,
        meta: { title: 'Liste des permissions', permission: 'org.permissions.manage' }
      },
      {
        path: '/roles',
        name: 'roles',
        component: RoleListView,
        meta: { title: 'Liste des rôles', permission: 'org.roles.manage' }
      },
      {
        path: '/users',
        name: 'users',
        component: UserListView,
        meta: { title: 'Utilisateurs', permission: 'org.users.view' }
      },
      {
        path: '/users/create',
        name: 'users-create',
        component: UserCreateView,
        meta: { title: 'Créer des utilisateurs', permission: 'org.users.manage' }
      },
      {
        path: '/profile',
        name: 'profile',
        component: ProfileView,
        meta: { title: 'Mon profil' }
      },
      {
        path: '/data-integration/fb',
        name: 'data-integration-fb',
        component: () => import('@/views/DataIntegrationView.vue'),
        meta: { title: 'Data Integration - F&B', keepAlive: true, permission: 'menu.integration.fb' }
      },
    ]
  },
  
  // Banc de test du moteur predict (données mock, sans authentification).
  // Non monté en production (BUG-028) : c'est un outil de développement, et l'exposer
  // en prod ajoutait une surface non authentifiée sans contrepartie fonctionnelle.
  // Volontairement laissé SANS guard hors production — c'est ce qui en fait un banc
  // de test utilisable sans compte.
  ...(process.env.NODE_ENV === 'production'
    ? []
    : [{
      path: '/predict-test',
      name: 'predict-test',
      component: () => import('../views/PredictTestView.vue'),
      meta: { title: 'Predict — Test Harness' }
    }]),

  // Home redirect
  {
    path: '/',
    name: 'home',
    redirect: '/dashboard'
  },
  
  // Legacy routes - keep for compatibility
  {
    path: '/about',
    name: 'about',
    component: () => import('../views/AboutView.vue'),
    meta: { title: 'À propos' }
  },

  
  
  // 404 catch-all
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    redirect: '/dashboard'
  }
]

const router = createRouter({
  history: createWebHistory(process.env.BASE_URL),
  routes
})

// Gating par permission : toute route portant `meta.permission` exige cette
// permission RBAC (cohérent avec le backend). Sinon → redirection vers /spaces.
// ADMIN passe toujours (le getter `can` renvoie true pour ADMIN).
router.beforeEach(async (to, _from, next) => {
  const permission = to.meta?.permission
  if (!permission) return next()

  if (!store.getters['auth/isInitialized']) {
    await store.dispatch('auth/initialize')
  }
  if (!store.getters['auth/isAuthenticated']) {
    return next({ path: '/login', query: { redirect: to.fullPath } })
  }
  if (!store.getters['auth/hasOrganization']) {
    return next('/onboarding')
  }
  // `permission` peut être un code (string) ou une liste (OR logique).
  const can = store.getters['auth/can']
  const allowed = Array.isArray(permission) ? permission.some(can) : can(permission)
  return allowed ? next() : next('/spaces')
})

// Update document title
router.afterEach((to) => {
  document.title = to.meta.title
    ? `${to.meta.title} | DataFriday`
    : 'DataFriday'
})

// Rechargement automatique en cas de ChunkLoadError (chunks obsolètes après un redéploiement)
router.onError((err, to) => {
  if (err?.name === 'ChunkLoadError' || /Loading chunk .* failed/.test(err?.message)) {
    if (!sessionStorage.getItem('chunk_reload_attempted')) {
      sessionStorage.setItem('chunk_reload_attempted', '1');
      window.location.href = to.fullPath;
    }
  }
})

router.afterEach(() => {
  sessionStorage.removeItem('chunk_reload_attempted');
})

export default router
