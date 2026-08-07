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
          { title: 'navSeasons', route: '/configurations/seasons', permission: 'menu.config.manage' },
          // GLOBAL (pas de scoping tenant), réservé au super-admin PLATEFORME — `requiresSuperAdmin`
          // est un flag séparé de `permission` (RBAC par tenant) : un rôle ADMIN de tenant ne doit
          // PAS voir ce menu (contrairement à ce que `can()` accorderait automatiquement à ce rôle
          // si on utilisait `permission` ici — isSuperAdmin est un flag plateforme, pas un rôle
          // tenant). Filtré dans DashboardView.vue::visibleSettingsNavigation.
          { title: 'navDepartments', route: '/configurations/departments', permission: null, requiresSuperAdmin: true },
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
          // requiresOwner : la gestion des rôles est verrouillée au owner côté backend
          // (roles.service.ts) — un rôle ADMIN de tenant a `org.roles.manage` par défaut,
          // donc `permission` seule ne suffit pas à cacher ce lien pour un admin non-owner.
          { title: 'navRoles', route: '/roles', permission: 'org.roles.manage', requiresOwner: true },
          // { title: 'navPermissions', route: '/permissions', permission: 'org.permissions.manage' },
        ],
      },
    ],
  },
]
