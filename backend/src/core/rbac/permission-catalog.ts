import { Prisma, PermissionScope, UserRole } from '@prisma/client';

/**
 * Catalogue de permissions système (RBAC).
 *
 * Source de vérité unique, partagée par :
 * - `prisma/seed.ts` (catalogue global + rôles des tenants existants)
 * - `OnboardingService` (clonage des rôles système pour un nouveau tenant)
 *
 * Voir docs/auth/RBAC_SYSTEM.md §3.2 et datafriday-web/docs/RBAC_SYSTEM.md §4
 * pour le mapping complet menu ↔ permission ↔ rôle par défaut.
 */
export interface PermissionDefinition {
  code: string;
  name: string;
  description?: string;
  category: string;
}

export const SYSTEM_PERMISSIONS: PermissionDefinition[] = [
  // Navigation
  { code: 'nav.spaces', name: 'Accès Spaces', category: 'Navigation', description: 'Accès au menu Spaces' },
  {
    code: 'spaces.viewAll',
    name: 'Voir tous les espaces',
    category: 'Spaces',
    description:
      "Accès à TOUS les espaces de l'organisation. Sans cette permission, l'utilisateur ne voit que les espaces qui lui sont explicitement accordés (UserSpaceAccess).",
  },
  // Conservés pour compat : sections analytiques (autres domaines). `nav.analytics.fb`
  // est remplacé fonctionnellement par `front.fb.analyse` mais gardé pour compatibilité.
  { code: 'nav.analytics.fb', name: 'Analytiques F&B', category: 'Navigation' },
  { code: 'nav.analytics.hospitality', name: 'Analytiques Hospitality', category: 'Navigation' },
  { code: 'nav.analytics.merch', name: 'Analytiques Merch', category: 'Navigation' },
  { code: 'nav.analytics.ticketing', name: 'Analytiques Ticketing', category: 'Navigation' },
  { code: 'nav.analytics.storage', name: 'Analytiques Storage', category: 'Navigation' },

  // Edit Space
  {
    code: 'space.edit',
    name: 'Éditer un espace',
    category: 'Edit Space',
    description: "Création, modification, suppression d'un espace et de ses accès/floors (CRUD spaces).",
  },

  // F&B Front (écrans opérationnels par espace)
  { code: 'front.fb.analyse', name: 'Analyse', category: 'F&B Front' },
  { code: 'front.fb.eventPredict', name: 'Event Predict', category: 'F&B Front' },
  { code: 'front.fb.predict', name: 'Predict', category: 'F&B Front' },
  { code: 'front.fb.spaceInventory', name: 'Space Inventory', category: 'F&B Front' },
  { code: 'front.fb.stockUp', name: 'Stock Up', category: 'F&B Front' },
  { code: 'front.fb.live', name: 'Live', category: 'F&B Front' },
  { code: 'front.fb.shoppingList', name: 'Liste de course', category: 'F&B Front' },
  { code: 'front.fb.restock', name: 'Réarmement', category: 'F&B Front' },
  { code: 'front.fb.restockBoard', name: 'Tableau de Réarmement', category: 'F&B Front' },
  {
    code: 'front.fb.logistic',
    name: 'Logistic',
    category: 'F&B Front',
    description: 'Écran Logistic : stock temps réel par PDV/Storage, ajouts/suppressions, historique.',
  },
  {
    code: 'front.fb.logisticReconcile',
    name: 'Logistic — Réconciliation',
    category: 'F&B Front',
    description: "Reset d'inventaire et accès à la section Réconciliation de l'écran Logistic.",
  },

  // Edit F&B Menu (écrans de configuration back)
  { code: 'menu.fb.suppliers', name: 'Suppliers', category: 'Edit F&B Menu' },
  { code: 'menu.fb.marketPrices', name: 'Market Price List', category: 'Edit F&B Menu' },
  { code: 'menu.fb.components', name: 'Components', category: 'Edit F&B Menu' },
  { code: 'menu.fb.menuItems', name: 'Menu Items', category: 'Edit F&B Menu' },
  { code: 'menu.fb.spaceMenu', name: 'Space Menus', category: 'Edit F&B Menu' },

  // F&B Back (analytics back)
  { code: 'back.fb.costTracking', name: 'Cost Tracking', category: 'F&B Back' },
  { code: 'back.fb.marginReport', name: 'Margin Report', category: 'F&B Back' },

  // Edit Events
  { code: 'menu.events.manage', name: 'Gestion des événements', category: 'Edit Events' },

  // Edit HR (catalogue seul — pas encore d'endpoint dédié)
  { code: 'menu.hr.manage', name: 'Edit HR', category: 'Edit HR' },

  // Configuration
  { code: 'menu.config.manage', name: 'Configurations produits', category: 'Configuration' },

  // Data Integration
  { code: 'menu.integration.fb', name: 'Intégration de données F&B', category: 'Data Integration' },

  // Users
  { code: 'org.users.view', name: 'Voir les utilisateurs', category: 'Users' },
  { code: 'org.users.manage', name: 'Gérer les utilisateurs', category: 'Users' },
  { code: 'org.users.changeRole', name: "Changer le rôle d'un utilisateur", category: 'Users' },

  // Account (rôles & permissions)
  { code: 'org.roles.manage', name: 'Gérer les rôles', category: 'Account' },
  { code: 'org.permissions.manage', name: 'Gérer les permissions', category: 'Account' },
];

const ALL_CODES = SYSTEM_PERMISSIONS.map((p) => p.code);

export interface SystemRoleDefinition {
  // `systemKey` n'est renseigné que pour ADMIN (bypass guard, cf. PermissionsGuard).
  // Les rôles métier sont identifiés par leur `name` et ont `systemKey = null`.
  systemKey: UserRole | null;
  name: string;
  description: string;
  permissions: string[];
}

// Ajouter une permission par défaut à un rôle métier ci-dessous est propagé automatiquement
// aux tenants DÉJÀ créés dès le prochain appel à `ensureSystemPermissionCatalog` (seed/backfill) :
// un code tout juste créé en base est par construction neuf pour tout le monde, donc aucune
// personnalisation admin ne peut être écrasée (voir `ensureSystemPermissionCatalog` ci-dessous).
// Détail : `docs/bugs/38_clonage_role_sans_resync_permissions.md`.
export const SYSTEM_ROLES: SystemRoleDefinition[] = [
  {
    systemKey: UserRole.ADMIN,
    name: 'ADMIN',
    description:
      "Accès complet à l'organisation : toutes les fonctionnalités, gestion des utilisateurs, des rôles et des permissions.",
    // ADMIN possède toujours toutes les permissions (cf. RBAC_SYSTEM.md §3.6)
    permissions: ALL_CODES,
  },
  {
    systemKey: null,
    name: 'Analyste F&B',
    description: 'Analyse F&B : tableaux de bord, prédictions et suivi des coûts/marges.',
    permissions: [
      'nav.spaces',
      'front.fb.analyse',
      'front.fb.eventPredict',
      'front.fb.predict',
      'front.fb.spaceInventory',
      'front.fb.stockUp',
      'front.fb.live',
      'front.fb.shoppingList',
      'back.fb.costTracking',
      'back.fb.marginReport',
    ],
  },
  {
    systemKey: null,
    name: 'Logistic F&B',
    description: 'Logistique F&B : inventaire des espaces, réarmement et écran Logistic.',
    permissions: ['nav.spaces', 'front.fb.spaceInventory', 'front.fb.restock', 'front.fb.logistic'],
  },
  {
    systemKey: null,
    name: 'Technicien Logistic',
    description: 'Technicien logistique : tableau de réarmement.',
    permissions: ['nav.spaces', 'front.fb.restockBoard'],
  },
  {
    systemKey: null,
    name: 'PDV Superviseur',
    description: "Superviseur point de vente : inventaire d'espace et tableau de réarmement.",
    permissions: ['nav.spaces', 'front.fb.spaceInventory', 'front.fb.restockBoard'],
  },
  {
    systemKey: null,
    name: 'Directeur de site',
    description:
      "Directeur de site : écran Logistic complet, y compris le reset d'inventaire et la section Réconciliation.",
    permissions: ['nav.spaces', 'front.fb.logistic', 'front.fb.logisticReconcile'],
  },
  {
    systemKey: null,
    name: 'Chef exécutif',
    description:
      "Chef exécutif : écran Logistic complet, y compris le reset d'inventaire et la section Réconciliation.",
    permissions: ['nav.spaces', 'front.fb.logistic', 'front.fb.logisticReconcile'],
  },
  {
    systemKey: null,
    name: 'Achat F&B',
    description: 'Achats F&B : fournisseurs, prix du marché et écrans analytiques front.',
    permissions: [
      'nav.spaces',
      'menu.fb.suppliers',
      'menu.fb.marketPrices',
      'front.fb.analyse',
      'front.fb.eventPredict',
      'front.fb.predict',
      'front.fb.spaceInventory',
      'front.fb.stockUp',
      'front.fb.live',
      'front.fb.shoppingList',
    ],
  },
  {
    systemKey: null,
    name: 'Chef',
    description: 'Chef : composants, articles de menu et menus par espace.',
    permissions: ['nav.spaces', 'menu.fb.components', 'menu.fb.menuItems', 'menu.fb.spaceMenu'],
  },
];

type RbacClient = Pick<Prisma.TransactionClient, 'permission' | 'role' | 'rolePermission'>;

/**
 * Insère/à jour le catalogue de permissions système (`tenantId = null`, `isSystem = true`).
 * Idempotent — peut être appelé à chaque seed/onboarding sans dupliquer les lignes.
 *
 * Un code qui vient d'être créé ici (jamais vu en base avant) est, par construction, neuf pour
 * tout le monde : il est donc automatiquement accordé aux rôles métier déjà existants qui
 * l'incluent par défaut dans `SYSTEM_ROLES`, sur TOUS les tenants (cf. `docs/bugs/38_*.md`).
 * Sûr — aucune personnalisation admin ne peut avoir retiré une permission qui n'existait pas.
 *
 * Retourne une map `code -> permissionId` pour faciliter le clonage des rôles.
 */
export async function ensureSystemPermissionCatalog(prisma: RbacClient): Promise<Record<string, string>> {
  const permissionIdByCode: Record<string, string> = {};
  const newlyCreatedCodes: string[] = [];

  for (const perm of SYSTEM_PERMISSIONS) {
    const existing = await prisma.permission.findFirst({
      where: { tenantId: null, code: perm.code },
      select: { id: true },
    });

    let permissionId: string;

    if (existing) {
      await prisma.permission.update({
        where: { id: existing.id },
        data: {
          name: perm.name,
          description: perm.description,
          category: perm.category,
        },
      });
      permissionId = existing.id;
    } else {
      const created = await prisma.permission.create({
        data: {
          tenantId: null,
          code: perm.code,
          name: perm.name,
          description: perm.description,
          category: perm.category,
          scope: PermissionScope.SYSTEM,
          isSystem: true,
        },
      });
      permissionId = created.id;
      newlyCreatedCodes.push(perm.code);
    }

    permissionIdByCode[perm.code] = permissionId;
  }

  if (newlyCreatedCodes.length > 0) {
    await grantNewPermissionsToExistingRoles(prisma, newlyCreatedCodes, permissionIdByCode);
  }

  return permissionIdByCode;
}

/**
 * Accorde chaque code neuf aux rôles métier déjà existants (tous tenants confondus) qui
 * l'incluent par défaut dans `SYSTEM_ROLES`. Additif et idempotent (`skipDuplicates`) — ne
 * touche jamais aux permissions retirées ou ajoutées manuellement par un admin sur d'autres codes.
 */
async function grantNewPermissionsToExistingRoles(
  prisma: RbacClient,
  newlyCreatedCodes: string[],
  permissionIdByCode: Record<string, string>,
): Promise<void> {
  const newlyCreatedSet = new Set(newlyCreatedCodes);

  for (const roleDef of SYSTEM_ROLES) {
    const permissionIds = roleDef.permissions
      .filter((code) => newlyCreatedSet.has(code))
      .map((code) => permissionIdByCode[code])
      .filter((id): id is string => Boolean(id));

    if (!permissionIds.length) continue;

    const existingRoles = await prisma.role.findMany({
      where: { name: roleDef.name, isSystem: true },
      select: { id: true },
    });

    for (const role of existingRoles) {
      await prisma.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({ roleId: role.id, permissionId })),
        skipDuplicates: true,
      });
    }
  }
}

/**
 * Clone les rôles système (ADMIN + rôles métier) pour un tenant, avec leur jeu de
 * permissions par défaut (cf. SYSTEM_ROLES). Idempotent (upsert sur `[tenantId, name]`).
 *
 * Pour un rôle déjà présent, on met seulement à jour les métadonnées (description,
 * systemKey, isSystem) : on **ne touche pas** à ses permissions déjà accordées/retirées,
 * afin de préserver d'éventuelles personnalisations de l'admin (les rôles système hors ADMIN
 * sont éditables). Les codes tout juste ajoutés au catalogue sont propagés séparément par
 * `ensureSystemPermissionCatalog` (appelée juste avant, ligne suivante), qui les accorde
 * automatiquement à tous les tenants existants.
 *
 * **Exception ADMIN** : le rôle ADMIN doit TOUJOURS posséder l'intégralité du catalogue
 * (invariant, jamais personnalisé). Ses permissions sont donc resynchronisées à chaque appel
 * pour absorber tout nouveau code ajouté au catalogue (le bypass guard reste vrai quoi qu'il arrive).
 *
 * Retourne une map `roleName -> roleId` (les rôles métier ont `systemKey = null`,
 * on ne peut donc pas indexer par `UserRole`). Ex. `roles['ADMIN']`, `roles['Chef']`.
 */
export async function cloneSystemRolesForTenant(
  prisma: RbacClient,
  tenantId: string,
): Promise<Record<string, string>> {
  const permissionIdByCode = await ensureSystemPermissionCatalog(prisma);
  const roleIdByName: Record<string, string> = {};

  for (const roleDef of SYSTEM_ROLES) {
    const existing = await prisma.role.findFirst({
      where: { tenantId, name: roleDef.name },
      select: { id: true },
    });

    const permissionIds = roleDef.permissions
      .map((code) => permissionIdByCode[code])
      .filter((id): id is string => Boolean(id));

    let roleId: string;

    if (existing) {
      await prisma.role.update({
        where: { id: existing.id },
        data: {
          description: roleDef.description,
          systemKey: roleDef.systemKey,
          isSystem: true,
        },
      });
      // ADMIN : resync complet du catalogue (invariant). Les autres rôles gardent leurs perms.
      if (roleDef.systemKey === UserRole.ADMIN) {
        await prisma.rolePermission.deleteMany({ where: { roleId: existing.id } });
        await prisma.rolePermission.createMany({
          data: permissionIds.map((permissionId) => ({ roleId: existing.id, permissionId })),
        });
      }
      roleId = existing.id;
    } else {
      const created = await prisma.role.create({
        data: {
          tenantId,
          name: roleDef.name,
          description: roleDef.description,
          systemKey: roleDef.systemKey,
          isSystem: true,
          permissions: {
            create: permissionIds.map((permissionId) => ({ permissionId })),
          },
        },
      });
      roleId = created.id;
    }

    roleIdByName[roleDef.name] = roleId;
  }

  return roleIdByName;
}
