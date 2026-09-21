/// <reference types="node" />
/**
 * Backfill SpaceBasketMinuteAgg (paniers pré-agrégés de l'Analyse) pour les espaces déjà agrégés.
 *
 * Les pipelines d'agrégation (rebuild complet, live à la minute) écrivent la table pour tout
 * event traité APRÈS son introduction ; ce script remplit l'historique sans rejouer les rebuilds
 * complets (mêmes fenêtres que executeProcessEvents, via BasketAggregationService.backfillSpace).
 * Idempotent : delete + insert par event, ré-exécutable.
 *
 *   npx tsx scripts/backfill-basket-agg.ts                 # dry-run : liste les espaces
 *   npx tsx scripts/backfill-basket-agg.ts --apply         # écrit
 *   npx tsx scripts/backfill-basket-agg.ts --apply --space <spaceId>
 *
 * Lit DATABASE_URL (backend/.env = PRODUCTION : ne lancer --apply que sur demande explicite).
 */
import { PrismaClient } from '@prisma/client';
import { BasketAggregationService } from '../src/features/aggregation/basket-aggregation.service';
import { EventWindowResolverService } from '../src/features/aggregation/event-window-resolver.service';
import { SpaceIntegrationScopeService } from '../src/features/aggregation/space-integration-scope.service';

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
const APPLY = process.argv.includes('--apply');
const spaceArgIdx = process.argv.indexOf('--space');
const ONLY_SPACE = spaceArgIdx > -1 ? process.argv[spaceArgIdx + 1] : null;

// Pas de Redis hors application : le cache des conteneurs de saison est simplement absent.
const redisStub = { get: async () => null, set: async () => undefined } as any;
const service = new BasketAggregationService(
  prisma as any,
  new EventWindowResolverService(prisma as any, redisStub),
  new SpaceIntegrationScopeService(prisma as any),
);

async function main() {
  console.log(APPLY ? '⚙️  MODE APPLY — écritures réelles\n' : '🔍 DRY-RUN — aucune écriture (ajoutez --apply)\n');

  // Espaces ayant déjà des agrégats minute : ce sont eux que l'Analyse lit.
  const spaces = await prisma.$queryRaw<Array<{ tenantId: string; spaceId: string; n: number }>>`
    SELECT "tenantId", "spaceId", COUNT(*)::int AS n
    FROM "SpaceRevenueMinuteAgg"
    GROUP BY 1, 2 ORDER BY 3 DESC
  `;
  const targets = ONLY_SPACE ? spaces.filter((s) => s.spaceId === ONLY_SPACE) : spaces;
  console.log(`${targets.length} espace(s) à traiter.\n`);

  let totalRows = 0;
  for (const [i, sp] of targets.entries()) {
    const label = `[${i + 1}/${targets.length}] tenant=${sp.tenantId} space=${sp.spaceId} (${sp.n} lignes minute)`;
    if (!APPLY) {
      console.log(`${label} — aperçu, rien écrit`);
      continue;
    }
    const start = Date.now();
    try {
      const res = await service.backfillSpace(sp.tenantId, sp.spaceId);
      totalRows += res.rows;
      console.log(`${label} — ${res.events} event(s), ${res.rows} ligne(s) paniers, ${res.skipped.length} ignoré(s) en ${Date.now() - start}ms`);
      if (res.skipped.length) console.log(`   ignorés : ${res.skipped.join(', ')}`);
    } catch (err) {
      console.error(`${label} — ÉCHEC: ${(err as Error).message}`);
    }
  }

  console.log(APPLY ? `\n✅ Backfill appliqué : ${totalRows} ligne(s) écrites.` : '\nℹ️  Relancez avec --apply pour appliquer.');
}

main()
  .catch((e) => {
    console.error('ERREUR', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
