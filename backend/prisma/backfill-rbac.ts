/// <reference types="node" />
/**
 * Backfill RBAC — aligne TOUS les tenants existants sur le catalogue/rôles cible.
 *
 * Idempotent : ré-exécutable sans effet de bord.
 *
 * ⚠️ ORDRE DE DÉPLOIEMENT CRITIQUE
 *   Le run par défaut est **purement additif** (catalogue + rôles métier) et donc SÛR à exécuter
 *   AVANT ou APRÈS le déploiement du code. Il NE TOUCHE PAS aux anciens rôles MANAGER/STAFF/VIEWER.
 *
 *   La dé-systématisation (passer MANAGER/STAFF/VIEWER en `systemKey=null`) **casse le code ANCIEN**
 *   (son RolesGuard lit `systemKey`) → ne JAMAIS la faire avant le déploiement. Elle est donc gardée
 *   derrière un flag explicite, à lancer UNIQUEMENT une fois le nouveau code en prod :
 *
 *   npm run rbac:backfill                          # additif seul (catalogue + 6 rôles métier) — SÛR
 *   REMAP_LEGACY_TO="Analyste F&B" npm run rbac:backfill
 *                                                  # + réassigne les users encore sur MANAGER/STAFF/VIEWER
 *   DESYSTEMATIZE_LEGACY=1 npm run rbac:backfill    # POST-DEPLOY uniquement : retire le statut système
 *                                                  #   des anciens rôles (les rend éditables/supprimables)
 *
 * Étapes par tenant :
 *  1. (global) (ré)insère le catalogue de permissions système (nouveaux codes inclus).
 *  2. crée les rôles système cibles manquants : ADMIN + 6 rôles métier (ne réécrit pas les perms existantes).
 *  3. (optionnel REMAP_LEGACY_TO) remap des users encore sur un ancien rôle vers le rôle nommé.
 *  4. (optionnel DESYSTEMATIZE_LEGACY=1, POST-DEPLOY) dé-systématise MANAGER/STAFF/VIEWER.
 */
import { PrismaClient } from '@prisma/client';
import { ensureSystemPermissionCatalog, cloneSystemRolesForTenant } from '../src/core/rbac/permission-catalog';

const prisma = new PrismaClient();

const LEGACY_ROLE_NAMES = ['MANAGER', 'STAFF', 'VIEWER'];

// Grants additifs ciblés : nouveaux codes à poser sur des rôles métier DÉJÀ créés
// (cloneSystemRolesForTenant ne touche pas aux permissions des rôles existants).
// Additif et idempotent — ne retire jamais rien. `front.fb.logisticReconcile` n'est
// accordé à aucun rôle métier par défaut : l'admin l'assigne via l'écran Rôles.
const ADDITIVE_ROLE_GRANTS: Record<string, string[]> = {
  'Logistic F&B': ['front.fb.logistic'],
};

async function main() {
  const remapTo = process.env.REMAP_LEGACY_TO?.trim() || null;
  const desystematize = process.env.DESYSTEMATIZE_LEGACY === '1';
  console.log('🔧 RBAC backfill — début' + (desystematize ? ' (DÉ-SYSTÉMATISATION activée — post-deploy)' : ' (additif seul — sûr)'));

  // 1. Catalogue global (idempotent)
  await ensureSystemPermissionCatalog(prisma);
  console.log('✅ Catalogue de permissions système à jour');

  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });
  console.log(`ℹ️  ${tenants.length} tenant(s) à traiter`);

  let totalLegacyUsers = 0;

  for (const tenant of tenants) {
    // 2. Rôles cibles (ADMIN + rôles métier) — crée les rôles manquants avec leurs
    //    permissions par défaut ; ne réécrit pas les permissions des rôles déjà présents.
    const roleIdByName = await cloneSystemRolesForTenant(prisma, tenant.id);

    // 2bis. Grants additifs sur rôles existants (nouveaux codes du catalogue)
    for (const [roleName, codes] of Object.entries(ADDITIVE_ROLE_GRANTS)) {
      const roleId = roleIdByName[roleName];
      if (!roleId) continue;
      const perms = await prisma.permission.findMany({
        where: { tenantId: null, code: { in: codes } },
        select: { id: true },
      });
      if (perms.length) {
        // @@id([roleId, permissionId]) → skipDuplicates rend le grant idempotent.
        await prisma.rolePermission.createMany({
          data: perms.map((perm) => ({ roleId, permissionId: perm.id })),
          skipDuplicates: true,
        });
      }
    }

    // Anciens rôles génériques restants (pour remap / dé-systématisation / reporting)
    const legacyRoles = await prisma.role.findMany({
      where: { tenantId: tenant.id, name: { in: LEGACY_ROLE_NAMES } },
      select: { id: true, name: true },
    });
    const legacyRoleIds = legacyRoles.map((r) => r.id);

    // Combien de users sont encore assignés à un ancien rôle ?
    const [usersOnLegacy, userTenantsOnLegacy] = await Promise.all([
      legacyRoleIds.length
        ? prisma.user.count({ where: { tenantId: tenant.id, roleId: { in: legacyRoleIds } } })
        : Promise.resolve(0),
      legacyRoleIds.length
        ? prisma.userTenant.count({ where: { tenantId: tenant.id, roleId: { in: legacyRoleIds } } })
        : Promise.resolve(0),
    ]);
    totalLegacyUsers += usersOnLegacy;

    // 3. Remap optionnel (réassigne les users AVANT toute dé-systématisation)
    if (remapTo && legacyRoleIds.length && (usersOnLegacy > 0 || userTenantsOnLegacy > 0)) {
      const targetRoleId = roleIdByName[remapTo];
      if (!targetRoleId) {
        throw new Error(
          `REMAP_LEGACY_TO="${remapTo}" introuvable parmi les rôles système (${Object.keys(roleIdByName).join(', ')})`,
        );
      }
      await prisma.user.updateMany({
        where: { tenantId: tenant.id, roleId: { in: legacyRoleIds } },
        data: { roleId: targetRoleId },
      });
      await prisma.userTenant.updateMany({
        where: { tenantId: tenant.id, roleId: { in: legacyRoleIds } },
        data: { roleId: targetRoleId },
      });
    }

    // 4. Dé-systématisation — POST-DEPLOY UNIQUEMENT (casse l'ancien code qui lit systemKey).
    let desysCount = 0;
    if (desystematize && legacyRoleIds.length) {
      const r = await prisma.role.updateMany({
        where: { id: { in: legacyRoleIds }, isSystem: true },
        data: { isSystem: false, systemKey: null },
      });
      desysCount = r.count;
    }

    const remapNote = remapTo ? ` → remap ${usersOnLegacy} user(s) vers "${remapTo}"` : '';
    const desysNote = desystematize ? ` ; ${desysCount} ancien(s) rôle(s) dé-systématisé(s)` : '';
    console.log(
      `  • ${tenant.name} : rôles cibles OK ; ${usersOnLegacy} user(s) legacy${remapNote}${desysNote}`,
    );
  }

  if (!remapTo && totalLegacyUsers > 0) {
    console.log(
      `\n⚠️  ${totalLegacyUsers} utilisateur(s) restent sur un ancien rôle (MANAGER/STAFF/VIEWER).\n` +
        `   Réassigne-les via l'admin, ou relance avec REMAP_LEGACY_TO="<Nom du rôle>".`,
    );
  }

  console.log('✅ RBAC backfill — terminé');
}

main()
  .catch((e) => {
    console.error('❌ RBAC backfill — échec', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
