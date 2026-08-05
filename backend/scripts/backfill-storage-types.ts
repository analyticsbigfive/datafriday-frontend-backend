/**
 * Backfill StorageType — seed les 3 lignes historiques (Dry/Cold/Frozen) pour chaque tenant.
 * Idempotent (skipDuplicates sur @@unique([tenantId, name])). DRY-RUN par défaut.
 *
 *   npx tsx scripts/backfill-storage-types.ts            # aperçu (ne modifie rien)
 *   npx tsx scripts/backfill-storage-types.ts --apply    # applique
 *
 * `code` (dry/cold/belowzero) est le seul lien stable avec les sous-types du tool "Storage" du
 * Builder v2 (elementTaxonomy.js) — sans ces 3 lignes, un tenant existant perdrait le libellé de
 * ses sous-types Storage déjà posés en plan (SpaceElement.subtypes[] reste inchangé, seul
 * l'affichage dans Configurations dépendrait de ces lignes).
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
const APPLY = process.argv.includes('--apply');

const DEFAULT_STORAGE_TYPES: Array<{ name: string; code: string }> = [
  { name: 'Dry', code: 'dry' },
  { name: 'Cold', code: 'cold' },
  { name: 'Frozen', code: 'belowzero' },
];

async function main() {
  console.log(APPLY ? '⚙️  MODE APPLY — écritures réelles\n' : '🔍 DRY-RUN — aucune écriture (ajoutez --apply)\n');

  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });

  let tenantsMissingSome = 0;
  let rowsCreated = 0;

  for (const tenant of tenants) {
    const existing = await prisma.storageType.findMany({
      where: { tenantId: tenant.id, name: { in: DEFAULT_STORAGE_TYPES.map((d) => d.name) } },
      select: { name: true },
    });
    const existingNames = new Set(existing.map((e) => e.name));
    const missing = DEFAULT_STORAGE_TYPES.filter((d) => !existingNames.has(d.name));
    if (!missing.length) continue;

    tenantsMissingSome++;
    rowsCreated += missing.length;

    if (APPLY) {
      await prisma.storageType.createMany({
        data: missing.map((d) => ({ name: d.name, code: d.code, tenantId: tenant.id })),
        skipDuplicates: true,
      });
    }
  }

  console.log(`Tenants: ${tenants.length} — tenants avec des lignes manquantes: ${tenantsMissingSome} — lignes à créer: ${rowsCreated}`);
  console.log(`\n${APPLY ? '✅ Backfill appliqué.' : 'ℹ️  Relancez avec --apply pour exécuter.'}`);
}

main().catch((e) => { console.error('ERREUR', e); process.exit(1); }).finally(() => prisma.$disconnect());
