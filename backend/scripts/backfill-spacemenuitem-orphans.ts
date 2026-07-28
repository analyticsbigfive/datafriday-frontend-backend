/**
 * BUG-051 — supprime les SpaceMenuItem (prix par espace) orphelins d'un MenuItem soft-deleted.
 *
 * Usage :
 *   npx tsx scripts/backfill-spacemenuitem-orphans.ts            # dry-run (compte seulement)
 *   npx tsx scripts/backfill-spacemenuitem-orphans.ts --apply     # supprime réellement
 *   npx tsx scripts/backfill-spacemenuitem-orphans.ts --apply --tenant=<tenantId>  # un seul tenant
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');
const tenantArg = process.argv.find((a) => a.startsWith('--tenant='));
const tenantId = tenantArg ? tenantArg.split('=')[1] : undefined;

async function main() {
  const orphans = await prisma.spaceMenuItem.findMany({
    where: { menuItem: { deletedAt: { not: null }, ...(tenantId ? { tenantId } : {}) } },
    select: { id: true, spaceId: true, menuItemId: true, menuItem: { select: { name: true, tenantId: true } } },
  });

  const bySpace = new Map<string, number>();
  for (const o of orphans) bySpace.set(o.spaceId, (bySpace.get(o.spaceId) ?? 0) + 1);

  console.log(`Orphaned SpaceMenuItem rows found: ${orphans.length}${tenantId ? ` (tenant=${tenantId})` : ' (all tenants)'}`);
  for (const [spaceId, count] of bySpace) {
    console.log(`  space=${spaceId} orphans=${count}`);
  }

  if (!apply) {
    console.log('\nDry-run only — pass --apply to actually delete these rows.');
    return;
  }

  if (orphans.length === 0) {
    console.log('Nothing to delete.');
    return;
  }

  const result = await prisma.spaceMenuItem.deleteMany({
    where: { id: { in: orphans.map((o) => o.id) } },
  });
  console.log(`\nDeleted ${result.count} orphaned SpaceMenuItem row(s).`);
}

main()
  .catch((e) => {
    console.error('ERROR', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
