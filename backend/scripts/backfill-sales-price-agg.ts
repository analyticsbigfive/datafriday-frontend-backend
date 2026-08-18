/**
 * Backfill BUG-337-02 (docs/bugs/) — peuple `SalesPriceAgg` pour les intégrations Weezevent déjà
 * synchronisées AVANT ce fix (les hooks d'écriture ne couvrent que les ventes synchronisées
 * APRÈS). Idempotent (`refreshForIntegration` fait un delete+insert complet par intégration,
 * relançable sans risque).
 *
 * ~20-40s par intégration avec un gros historique (mesuré sur un tenant réel avant ce fix) —
 * séquentiel volontairement, pas en parallèle (éviter N scans complets simultanés sur la même base).
 *
 *   npx tsx scripts/backfill-sales-price-agg.ts            # aperçu (ne modifie rien)
 *   npx tsx scripts/backfill-sales-price-agg.ts --apply    # applique
 */
import { PrismaClient } from '@prisma/client';
import { SalesPriceAggService } from '../src/shared/pricing/sales-price-agg.service';

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
const APPLY = process.argv.includes('--apply');
const priceAgg = new SalesPriceAggService(prisma as any);

async function main() {
  console.log(APPLY ? '⚙️  MODE APPLY — écritures réelles\n' : '🔍 DRY-RUN — aucune écriture (ajoutez --apply)\n');

  // Toutes intégrations actives (Weezevent + Digifood) — les deux écrivent dans les mêmes tables
  // Sales*/WeezeventTransaction* partagées (discriminées par `provider`), refreshForIntegration
  // ne filtre pas non plus par provider.
  const integrations = await prisma.integration.findMany({
    where: { enabled: true },
    select: { id: true, tenantId: true, name: true, provider: true },
  });
  console.log(`${integrations.length} intégration(s) active(s) à traiter.\n`);

  for (const [i, integ] of integrations.entries()) {
    const label = `[${i + 1}/${integrations.length}] tenant=${integ.tenantId} integration=${integ.id} (${integ.name}, ${integ.provider})`;
    if (!APPLY) {
      console.log(`${label} — aperçu, rien écrit`);
      continue;
    }
    const start = Date.now();
    try {
      await priceAgg.refreshForIntegration(integ.tenantId, integ.id);
      console.log(`${label} — OK en ${Date.now() - start}ms`);
    } catch (err) {
      console.error(`${label} — ÉCHEC: ${(err as Error).message}`);
    }
  }

  console.log(APPLY ? '\n✅ Backfill appliqué.' : '\nℹ️  Relancez avec --apply pour appliquer.');
}

main()
  .catch((e) => {
    console.error('ERREUR', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
