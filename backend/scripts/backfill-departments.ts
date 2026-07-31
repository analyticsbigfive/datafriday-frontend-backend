/**
 * Seed Department/Subtype — les 8 départements historiques du Builder v2 + leurs sous-types
 * (LEGACY_DEPARTMENTS). GLOBAL : un seul jeu pour toute la plateforme, pas de boucle par tenant
 * (contrairement à backfill-storage-types.ts, qui est réellement par tenant). Idempotent.
 * DRY-RUN par défaut.
 *
 *   npx tsx scripts/backfill-departments.ts            # aperçu (ne modifie rien)
 *   npx tsx scripts/backfill-departments.ts --apply    # applique
 *
 * `code` est le seul lien stable avec SpaceElement.type/subtypes[] (Étape 2/3, pas encore
 * branchées).
 */
import { PrismaClient } from '@prisma/client';
import { LEGACY_DEPARTMENTS } from '../src/features/departments/legacy-departments.seed';

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
const APPLY = process.argv.includes('--apply');

async function main() {
  console.log(APPLY ? '⚙️  MODE APPLY — écritures réelles\n' : '🔍 DRY-RUN — aucune écriture (ajoutez --apply)\n');

  const existingDepts = await prisma.department.findMany({
    where: { code: { in: LEGACY_DEPARTMENTS.map((d) => d.code) } },
    select: { id: true, code: true },
  });
  const existingByCode = new Map(existingDepts.map((d) => [d.code, d.id]));
  const missingDepts = LEGACY_DEPARTMENTS.filter((d) => !existingByCode.has(d.code));

  if (APPLY) {
    for (const dept of missingDepts) {
      const created = await prisma.department.create({
        data: {
          name: dept.name,
          code: dept.code,
          color: dept.color,
          icon: dept.icon,
          needsRh: dept.needsRh,
          isSeller: dept.isSeller,
          allowsSuppliers: dept.allowsSuppliers,
          sortOrder: dept.sortOrder,
        },
      });
      existingByCode.set(dept.code, created.id);
    }
  }

  let subtypeRowsCreated = 0;
  for (const dept of LEGACY_DEPARTMENTS) {
    const departmentId = existingByCode.get(dept.code);
    if (!departmentId) continue; // DRY-RUN : département pas encore créé, sous-estimation cosmétique
    const existingSubtypes = await prisma.subtype.findMany({
      where: { departmentId, code: { in: dept.subtypes.map((s) => s.code) } },
      select: { code: true },
    });
    const existingCodes = new Set(existingSubtypes.map((s) => s.code));
    const missingSubtypes = dept.subtypes.filter((s) => !existingCodes.has(s.code));
    subtypeRowsCreated += missingSubtypes.length;
    if (APPLY && missingSubtypes.length) {
      await prisma.subtype.createMany({
        data: missingSubtypes.map((s) => ({ departmentId, name: s.name, code: s.code })),
        skipDuplicates: true,
      });
    }
  }

  console.log(`Départements à créer: ${missingDepts.length} — sous-types à créer: ${subtypeRowsCreated}`);
  console.log(`\n${APPLY ? '✅ Seed appliqué.' : 'ℹ️  Relancez avec --apply pour exécuter.'}`);
}

main().catch((e) => { console.error('ERREUR', e); process.exit(1); }).finally(() => prisma.$disconnect());
