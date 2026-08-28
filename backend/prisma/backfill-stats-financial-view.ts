/// <reference types="node" />
/**
 * Backfill one-shot — accorde `stats.financial.view` à TOUS les rôles existants, tous
 * tenants confondus, y compris les rôles custom créés par un tenant (qui ne matchent aucun
 * nom de `SYSTEM_ROLES` et ne sont donc PAS couverts par la propagation automatique de
 * `ensureSystemPermissionCatalog`/`grantNewPermissionsToExistingRoles`, cf. docs/bugs/38_*.md).
 *
 * Lancer UNE SEULE FOIS, juste après le déploiement de la permission `stats.financial.view`
 * (avant ou après `npm run rbac:backfill`, peu importe l'ordre entre les deux) :
 *
 *   npm run rbac:backfill-stats-financial-view
 *
 * ⚠️ Ne pas réutiliser ce script comme modèle pour une future permission sans relire
 * docs/bugs/38_clonage_role_sans_resync_permissions.md : un resync large est sûr ICI
 * uniquement parce que `stats.financial.view` vient d'être créé — aucun admin n'a jamais pu
 * le retirer d'un rôle avant que ce script tourne. Un resync du même type sur une permission
 * DÉJÀ EXISTANTE écraserait des retraits volontaires.
 *
 * Idempotent (`skipDuplicates`) — ré-exécutable sans effet de bord.
 */
import { PrismaClient } from '@prisma/client';
import { ensureSystemPermissionCatalog } from '../src/core/rbac/permission-catalog';

const prisma = new PrismaClient();
const CODE = 'stats.financial.view';

async function main() {
  console.log(`🔧 Backfill "${CODE}" — début`);

  // S'assure que la permission existe en base avant de la distribuer.
  const permissionIdByCode = await ensureSystemPermissionCatalog(prisma);
  const permissionId = permissionIdByCode[CODE];
  if (!permissionId) {
    throw new Error(`Permission "${CODE}" introuvable dans le catalogue après ensureSystemPermissionCatalog`);
  }

  const roles = await prisma.role.findMany({ select: { id: true } });
  console.log(`ℹ️  ${roles.length} rôle(s) au total (tous tenants, système + custom)`);

  const { count } = await prisma.rolePermission.createMany({
    data: roles.map((role) => ({ roleId: role.id, permissionId })),
    skipDuplicates: true,
  });

  console.log(`✅ Backfill "${CODE}" — terminé : ${count} attribution(s) créée(s)`);
}

main()
  .catch((e) => {
    console.error(`❌ Backfill "${CODE}" — échec`, e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
