/**
 * Baseline des versions de coût des briques (chantier Cost tracking, lot 2a) : une version
 * `baseline` par ingrédient, emballage et composant non supprimé qui n'en a pas encore, depuis
 * les valeurs actuelles (coût unitaire, fournisseur). Idempotent : une brique dont le coût et le
 * fournisseur sont déjà ceux de sa dernière version n'est pas réécrite.
 *
 *   npx tsx scripts/backfill-brick-cost-snapshots.ts --dry-run
 *   npx tsx scripts/backfill-brick-cost-snapshots.ts
 *   npx tsx scripts/backfill-brick-cost-snapshots.ts --tenant <tenantId>
 *
 * --dry-run : compte les briques par tenant, n'écrit rien.
 */
import { PrismaClient } from '@prisma/client';
import { BrickCostSnapshotService, BrickKind } from '../src/features/menu-items/services/brick-cost-snapshot.service';

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
const DRY_RUN = process.argv.includes('--dry-run');
const tenantArgIndex = process.argv.indexOf('--tenant');
const ONLY_TENANT = tenantArgIndex >= 0 ? process.argv[tenantArgIndex + 1] : undefined;

/** Taille de page de lecture des ids : le service découpe lui-même en lots de 500 pour l'écriture. */
const PAGE_SIZE = 2000;

const KINDS: Array<{ kind: BrickKind; label: string }> = [
  { kind: 'ingredient', label: 'ingrédient(s)' },
  { kind: 'packaging', label: 'emballage(s)' },
  { kind: 'component', label: 'composant(s)' },
];

/** Page d'ids des briques non supprimées d'un tenant, par curseur d'id. */
function pageOf(kind: BrickKind, tenantId: string, cursor?: string): Promise<Array<{ id: string }>> {
  const args = {
    where: { tenantId, deletedAt: null },
    select: { id: true },
    orderBy: { id: 'asc' as const },
    take: PAGE_SIZE,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  };
  if (kind === 'ingredient') return prisma.ingredient.findMany(args);
  if (kind === 'packaging') return prisma.packaging.findMany(args);
  return prisma.menuComponent.findMany(args);
}

async function main() {
  console.log(DRY_RUN ? 'DRY-RUN (rien n\'est écrit)\n' : 'MODE ÉCRITURE\n');
  const service = new BrickCostSnapshotService(prisma as any);

  const tenants = await prisma.tenant.findMany({
    where: ONLY_TENANT ? { id: ONLY_TENANT } : {},
    select: { id: true, name: true },
  });

  let totalBricks = 0;
  let totalCreated = 0;
  for (const tenant of tenants) {
    const parts: string[] = [];
    for (const { kind, label } of KINDS) {
      let cursor: string | undefined;
      let bricks = 0;
      let created = 0;
      // Pagination par curseur d'id : jamais toutes les briques du tenant en mémoire d'un coup.
      for (;;) {
        // eslint-disable-next-line no-await-in-loop -- pages séquentielles pour ne pas saturer le pooler
        const page = await pageOf(kind, tenant.id, cursor);
        if (!page.length) break;
        bricks += page.length;
        if (!DRY_RUN) {
          // eslint-disable-next-line no-await-in-loop -- idem
          created += await service.recordIfChanged(tenant.id, kind, page.map((p) => p.id), 'baseline');
        }
        cursor = page[page.length - 1].id;
      }
      totalBricks += bricks;
      totalCreated += created;
      parts.push(`${bricks} ${label}${DRY_RUN ? '' : ` (${created} version(s))`}`);
    }
    console.log(`${tenant.name} (${tenant.id}) : ${parts.join(', ')}`);
  }
  console.log(`\nTotal : ${totalBricks} brique(s)${DRY_RUN ? '' : `, ${totalCreated} version(s) créée(s)`}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
