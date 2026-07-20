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
