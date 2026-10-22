/**
 * Baseline des snapshots de coûts (chantier Cost tracking) : un snapshot `baseline` par article
 * qui n'en a pas encore, depuis les valeurs actuelles (coût, recette, prix). Idempotent : un
 * article dont l'empreinte est déjà celle de son dernier snapshot n'est pas réécrit.
 *
 *   npx tsx scripts/backfill-cost-snapshots.ts --dry-run
 *   npx tsx scripts/backfill-cost-snapshots.ts
 *   npx tsx scripts/backfill-cost-snapshots.ts --tenant <tenantId>
 *
 * --dry-run : compte les articles par tenant, n'écrit rien.
 */
import { PrismaClient } from '@prisma/client';
import { MenuItemCostSnapshotService } from '../src/features/menu-items/services/menu-item-cost-snapshot.service';

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
const DRY_RUN = process.argv.includes('--dry-run');
const tenantArgIndex = process.argv.indexOf('--tenant');
const ONLY_TENANT = tenantArgIndex >= 0 ? process.argv[tenantArgIndex + 1] : undefined;

/** Taille de page de lecture des ids : le service découpe lui-même en lots de 500 pour l'écriture. */
const PAGE_SIZE = 2000;

async function main() {
  console.log(DRY_RUN ? 'DRY-RUN (rien n\'est écrit)\n' : 'MODE ÉCRITURE\n');
  const service = new MenuItemCostSnapshotService(prisma as any);

  const tenants = await prisma.tenant.findMany({
    where: ONLY_TENANT ? { id: ONLY_TENANT } : {},
    select: { id: true, name: true },
  });

  let totalItems = 0;
  let totalCreated = 0;
  for (const tenant of tenants) {
    let cursor: string | undefined;
    let items = 0;
    let created = 0;
    // Pagination par curseur d'id : jamais tous les articles du tenant en mémoire d'un coup.
    for (;;) {
      // eslint-disable-next-line no-await-in-loop -- pages séquentielles pour ne pas saturer le pooler
      const page = await prisma.menuItem.findMany({
        where: { tenantId: tenant.id, deletedAt: null },
        select: { id: true },
        orderBy: { id: 'asc' },
        take: PAGE_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (!page.length) break;
      items += page.length;
      if (!DRY_RUN) {
        // eslint-disable-next-line no-await-in-loop -- idem
        created += await service.recordIfChanged(tenant.id, page.map((p) => p.id), 'baseline');
      }
      cursor = page[page.length - 1].id;
    }
    totalItems += items;
    totalCreated += created;
    console.log(`${tenant.name} (${tenant.id}) : ${items} article(s)${DRY_RUN ? '' : `, ${created} snapshot(s) créé(s)`}`);
  }
  console.log(`\nTotal : ${totalItems} article(s)${DRY_RUN ? '' : `, ${totalCreated} snapshot(s) créé(s)`}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
