/**
 * Configuration déclarative des menus (DashboardView.vue).
 * Chaque item porte un code de permission RBAC (`permission`).
 * `permission: null` => toujours visible (aucune restriction).
 *
 * cf. docs/RBAC_SYSTEM.md §3.4 et §4 (mapping menu <-> permission <-> rôle)
 * cf. docs/HANDOFF_FRONT_SIDEBAR_RBAC.md
 */

/**
 * Sidebar gauche (drawer permanent). `route: null` => entrée affichée mais
 * désactivée (page pas encore livrée — dashboards analytics globaux).
 *
 * `spaceRoute` (au lieu de `route`) => chemin dépendant de l'espace courant :
 * le `:spaceId` est substitué par DashboardView.goToFromMainNav depuis la route
 * active, avec repli sur `/spaces` (choix de l'espace) quand on est sur une page
 * hors espace. Sans ce mécanisme, les outils ne seraient atteignables que depuis
 * une page déjà scopée à un espace.
 *
 * ⚠️ Les codes `nav.analytics.*` ne sont attribués qu'au rôle ADMIN dans le
 * catalogue backend (SYSTEM_ROLES). Tant qu'un rôle métier ne les reçoit pas,
 * la section "Analytics" reste invisible pour lui (comportement attendu).
 */
export const MAIN_NAVIGATION = [
  {
    section: 'navMenu',
    items: [
      { title: 'navSpaces', value: 'spaces', icon: 'Building2', route: '/spaces', permission: 'nav.spaces' },
    ],
  },
  {
    // Outils F&B. Jusqu'ici ils n'étaient atteignables QUE par le dropdown
    // « Outils » interne à Analyse / EventPredict / Inventaire / Logistique /
    // Réarmement : depuis n'importe quelle autre page (Events, HR, Menus,
    // Account…) le tiroir global n'offrait que « Espaces » + la section
    // Analytics désactivée. Ces entrées rendent les outils — et le Live —
    // joignables depuis TOUTES les pages.
    // Libellés : on réutilise les clés `anTool*` / `invToolPreInventory` déjà
    // traduites en/fr (pas de nouvelle clé de libellé à maintenir).
    section: 'navTools',
    items: [
      { title: 'anToolAnalyse', value: 'tool-analyse', icon: 'LineChart', spaceRoute: '/spaces/:spaceId', permission: 'front.fb.analyse' },
      { title: 'anToolPredict', value: 'tool-predict', icon: 'TrendingUp', spaceRoute: '/spaces/:spaceId?toolbox=predict', permission: 'front.fb.predict' },
      { title: 'anToolEventPredict', value: 'tool-event-predict', icon: 'Zap', spaceRoute: '/spaces/:spaceId?toolbox=event-predict', permission: 'front.fb.eventPredict' },
      { title: 'anToolLive', value: 'tool-live', icon: 'Radio', spaceRoute: '/spaces/:spaceId/live', permission: 'front.fb.live' },
      { title: 'invToolPreInventory', value: 'tool-pre-inventory', icon: 'ClipboardList', spaceRoute: '/spaces/:spaceId/pre-inventory', permission: 'front.fb.spaceInventory' },
      { title: 'anToolInventory', value: 'tool-inventory', icon: 'Package', spaceRoute: '/spaces/:spaceId/inventory', permission: 'front.fb.spaceInventory' },
      { title: 'anToolLogistic', value: 'tool-logistic', icon: 'Forklift', spaceRoute: '/spaces/:spaceId/logistic', permission: 'front.fb.logistic' },
      { title: 'anToolRestock', value: 'tool-restock', icon: 'Truck', spaceRoute: '/spaces/:spaceId/restock', permission: ['front.fb.restock', 'front.fb.restockBoard'] },
    ],
  },
  {
    section: 'navAnalytics',
    items: [
      { title: 'navFb', value: 'fb', icon: 'Coffee', route: null, permission: 'nav.analytics.fb' },
      { title: 'navHospitality', value: 'hospitality', icon: 'Building', route: null, permission: 'nav.analytics.hospitality' },
      { title: 'navMerch', value: 'merch', icon: 'ShoppingBag', route: null, permission: 'nav.analytics.merch' },
      { title: 'navTicketing', value: 'ticketing', icon: 'Ticket', route: null, permission: 'nav.analytics.ticketing' },
      { title: 'navStorage', value: 'storage', icon: 'Warehouse', route: null, permission: 'nav.analytics.storage' },
    ],
  },
]

export const SETTINGS_NAVIGATION = [
  {
    section: 'navConfiguration',
    groups: [
      {
        key: 'settings-edit-space',
        icon: 'Building2',
        title: 'navEditSpace',
        // Groupe déroulant DYNAMIQUE, placé en tête : ses items sont la liste des
        // spaces existants (résolue dans DashboardView via le store), chacun
        // redirigeant vers son builder 3D `/spaces/:id/builder2`. `permission` au
        // niveau groupe car il n'y a pas d'items statiques à filtrer un par un.
        dynamic: 'spaces',
        permission: 'space.edit',
        items: [],
      },
      {
        key: 'settings-fb',
        icon: 'UtensilsCrossed',
        title: 'navMenuFB',
        items: [
          { title: 'suppliers', route: '/menu-fb/suppliers', permission: 'menu.fb.suppliers' },
          { title: 'navMarketPricesList', route: '/menu-fb/market-prices', permission: 'menu.fb.marketPrices' },
          { title: 'navComponents', route: '/menu-fb/components', permission: 'menu.fb.components' },
          { title: 'navMenuItems', route: '/menu-fb/menu-items', permission: 'menu.fb.menuItems' },
          { title: 'navSpaceMenu', route: '/menu-fb/space-menus', permission: 'menu.fb.spaceMenu' },
        ],
      },
      {
        key: 'settings-events',
        icon: 'CalendarCheck',
        title: 'navEvents',
        items: [
          { title: 'navEvents', route: '/events', permission: 'menu.events.manage' },
          { title: 'navEventTypes', route: '/events/event-types', permission: 'menu.events.manage' },
          { title: 'navEventCategories', route: '/events/event-categories', permission: 'menu.events.manage' },
          { title: 'navEventSubcategories', route: '/events/event-subcategories', permission: 'menu.events.manage' },
        ],
      },
      {
        key: 'settings-hr',
        icon: 'UserCog',
        title: 'navEditHR',
        items: [
          { title: 'navHrSuppliers', route: '/hr', permission: 'menu.hr.manage' },
          { title: 'navHrPositions', route: '/hr/positions', permission: 'menu.hr.manage' },
          { title: 'navHrSettings', route: '/hr/settings', permission: 'menu.hr.manage' },
        ],
      },
      {
        key: 'settings-configurations',
        icon: 'Layers',
        title: 'navConfigurations',
        items: [
          { title: 'navProductTypes', route: '/configurations/product-types', permission: 'menu.config.manage' },
          { title: 'navProductCategories', route: '/configurations/product-categories', permission: 'menu.config.manage' },
          { title: 'navMarketPriceTypes', route: '/configurations/market-price-types', permission: 'menu.config.manage' },
          { title: 'navMarketPriceCategories', route: '/configurations/market-price-categories', permission: 'menu.config.manage' },
          { title: 'navComponentTypes', route: '/configurations/component-types', permission: 'menu.config.manage' },
          { title: 'navComponentCategories', route: '/configurations/component-categories', permission: 'menu.config.manage' },
          { title: 'navBrandNames', route: '/configurations/brand-names', permission: 'menu.config.manage' },
          { title: 'navDisplayNames', route: '/configurations/display-names', permission: 'menu.config.manage' },
          { title: 'navIndustrials', route: '/configurations/industrials', permission: 'menu.config.manage' },
          { title: 'navPackingTypes', route: '/configurations/packing-types', permission: 'menu.config.manage' },
          { title: 'navStorageTypes', route: '/configurations/storage-types', permission: 'menu.config.manage' },
        ],
      },
    ],
    standalone: [
      { title: 'navDataIntegration', icon: 'Plug', route: { name: 'data-integration-fb' }, permission: 'menu.integration.fb' },
    ],
  },
  {
    section: 'navOrganisation',
    groups: [
      {
        key: 'settings-access',
        icon: 'Shield',
        title: 'navAccess',
        items: [
          { title: 'navUsers', route: '/users', permission: 'org.users.view' },
          { title: 'navRoles', route: '/roles', permission: 'org.roles.manage' },
          // { title: 'navPermissions', route: '/permissions', permission: 'org.permissions.manage' },
        ],
      },
    ],
  },
]
