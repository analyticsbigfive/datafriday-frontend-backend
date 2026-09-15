/**
 * Réparation BUG-384-02 (docs/bugs/) — retire des agrégats d'un espace les lignes écrites sous une
 * intégration qui n'est PAS mappée à cet espace (étape 1 du wizard, `WeezeventLocationSpaceMapping`),
 * puis recalcule le rollup `Event.revenue` / `transactionCount` des events touchés.
 *
 * Origine : un job d'agrégation lancé sans `integrationId` (backfill BUG-352 du 08/09/2026,
 * `synchronize` par espace) rattachait, en mode fenêtre `range`, TOUTES les ventes du tenant tombant
 * dans la journée de l'event — Le Mans-Brest 22/08 affichait 112 k€ (66 k€ Weez + 46 k€ FC Nantes
 * Digifood) au lieu de 66 k€. Les lignes retirées ici existent déjà, à l'identique, dans l'espace de
 * leur intégration : aucune vente réelle n'est perdue.
 *
 * À lancer APRÈS déploiement du fix writer (sinon le prochain job non scopé re-pollue).
 * Idempotent, DRY-RUN par défaut, rapport avant/après par event en CSV.
 *
 *   npx tsx scripts/repair-foreign-integration-aggs.ts                         # aperçu, tous tenants
 *   npx tsx scripts/repair-foreign-integration-aggs.ts --tenant <id>[,<id>]    # aperçu, tenant(s) donné(s)
 *   npx tsx scripts/repair-foreign-integration-aggs.ts --tenant <id> --apply   # applique
 *   ... --csv chemin/rapport.csv                                               # rapport (défaut scripts/logs/)
 *
 * Caches Redis : les endpoints batch de l'Analyse cachent leurs réponses par event (BUG-143-01).
 * Si REDIS_URL est défini, les motifs `spaces:evtimeline|baskets|unmapped:{tenant}:{space}:*` sont
 * purgés en mode --apply ; sinon le script liste les motifs à purger à la main.
 */
import 'reflect-metadata';
import { mkdirSync, writeFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { EventRollupService } from '../src/features/aggregation/event-rollup.service';
import { SpaceIntegrationScopeService } from '../src/features/aggregation/space-integration-scope.service';
import { eventBatchCachePatterns } from '../src/shared/constants/event-batch-cache';

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
const APPLY = process.argv.includes('--apply');
const argValue = (flag: string): string | undefined => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const TENANT_IDS = (argValue('--tenant') || '').split(',').map((s) => s.trim()).filter(Boolean);
const CSV_PATH = argValue('--csv') || `scripts/logs/repair-bug-384-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
// Clés RedisService : préfixe `datafriday:` (redis.service.ts, keyPrefix).
const REDIS_KEY_PREFIX = 'datafriday:';

const scope = new SpaceIntegrationScopeService(prisma as any);
const rollup = new EventRollupService(prisma as any);

interface ForeignEventRow {
  tenantId: string;
  spaceId: string;
  spaceName: string | null;
  eventId: string;
  eventName: string | null;
  eventDate: Date | null;
  rollupRevenue: number | null;
  rollupTransactions: number | null;
  foreignRevenue: number;
  foreignTransactions: number;
  foreignRows: number;
  foreignIntegrations: string;
  legitRevenue: number;
  legitTransactions: number;
}

/** Une ligne par event touché : rollup actuel, part étrangère, valeur attendue après réparation. */
async function findForeignByEvent(): Promise<ForeignEventRow[]> {
  const tenantClause = TENANT_IDS.length ? `AND a."tenantId" = ANY($1)` : '';
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `
    WITH scoped AS (
      SELECT a."tenantId", a."spaceId", a."weezeventEventId", a."integrationId", a."revenueHt", a."transactionsCount",
             (m."spaceId" = a."spaceId") AS legit
      FROM "SpaceRevenueMinuteAgg" a
      LEFT JOIN "WeezeventLocationSpaceMapping" m
        ON m."weezeventLocationId" = a."integrationId" AND m."tenantId" = a."tenantId"
      WHERE a."integrationId" IS NOT NULL
        -- Espace sans aucune intégration mappée : on ne sait pas qualifier ses lignes, on n'y touche pas
        AND EXISTS (SELECT 1 FROM "WeezeventLocationSpaceMapping" sm WHERE sm."tenantId" = a."tenantId" AND sm."spaceId" = a."spaceId")
        ${tenantClause}
    )
    SELECT s."tenantId", s."spaceId", sp.name AS "spaceName",
           s."weezeventEventId" AS "eventId", e.name AS "eventName", e."eventDate",
           e.revenue::float AS "rollupRevenue", e."transactionCount" AS "rollupTransactions",
           COALESCE(SUM(s."revenueHt") FILTER (WHERE NOT s.legit), 0)::float AS "foreignRevenue",
           COALESCE(SUM(s."transactionsCount") FILTER (WHERE NOT s.legit), 0)::int AS "foreignTransactions",
           COUNT(*) FILTER (WHERE NOT s.legit)::int AS "foreignRows",
           COALESCE(STRING_AGG(DISTINCT i.name, ' + ') FILTER (WHERE NOT s.legit), '') AS "foreignIntegrations",
           COALESCE(SUM(s."revenueHt") FILTER (WHERE s.legit), 0)::float AS "legitRevenue",
           COALESCE(SUM(s."transactionsCount") FILTER (WHERE s.legit), 0)::int AS "legitTransactions"
    FROM scoped s
    LEFT JOIN "Space" sp ON sp.id = s."spaceId"
    LEFT JOIN "Event" e ON e.id = s."weezeventEventId"
    LEFT JOIN "WeezeventIntegration" i ON i.id = s."integrationId"
    GROUP BY 1,2,3,4,5,6,7,8
    HAVING COUNT(*) FILTER (WHERE NOT s.legit) > 0
    ORDER BY s."tenantId", e."eventDate" DESC NULLS LAST
    `,
    ...(TENANT_IDS.length ? [TENANT_IDS] : []),
  );
  return rows as ForeignEventRow[];
}

const eur = (n: number | null | undefined) => (n == null ? '' : n.toFixed(2));
const csvCell = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function writeReport(rows: ForeignEventRow[]) {
  const header = [
    'tenantId', 'spaceId', 'space', 'eventId', 'event', 'date',
    'rollup_revenue_avant', 'rollup_tx_avant', 'ca_etranger', 'tx_etrangeres', 'integrations_etrangeres',
    'revenue_attendu_apres', 'tx_attendues_apres', 'lignes_supprimees',
  ];
  const lines = rows.map((r) => [
    r.tenantId, r.spaceId, r.spaceName, r.eventId, r.eventName, r.eventDate ? r.eventDate.toISOString().slice(0, 10) : '',
    eur(r.rollupRevenue), r.rollupTransactions ?? '', eur(r.foreignRevenue), r.foreignTransactions, r.foreignIntegrations,
    eur(r.legitRevenue), r.legitTransactions, r.foreignRows,
  ].map(csvCell).join(';'));
  mkdirSync(CSV_PATH.replace(/\/[^/]+$/, ''), { recursive: true });
  writeFileSync(CSV_PATH, [header.join(';'), ...lines].join('\n') + '\n');
}

async function purgeRedis(spaces: Array<{ tenantId: string; spaceId: string }>) {
  const patterns = spaces.flatMap((s) => eventBatchCachePatterns(s.tenantId, s.spaceId).map((p) => REDIS_KEY_PREFIX + p));
  if (!process.env.REDIS_URL) {
    console.log('\nℹ️  REDIS_URL absent : purger à la main les motifs suivants (ou attendre l\'expiration, 6 h max) :');
    for (const p of patterns) console.log(`   ${p}`);
    return;
  }
  const redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 2, lazyConnect: true });
  try {
    await redis.connect();
    let deleted = 0;
    for (const p of patterns) {
      const keys = await redis.keys(p);
      if (keys.length) deleted += await redis.del(...keys);
    }
    console.log(`\n🧹 Redis : ${deleted} clé(s) purgée(s) sur ${patterns.length} motif(s).`);
  } catch (e) {
    console.warn(`\n⚠️  Purge Redis impossible (${(e as Error).message}) — motifs à purger à la main :`);
    for (const p of patterns) console.log(`   ${p}`);
  } finally {
    redis.disconnect();
  }
}

async function main() {
  console.log(APPLY ? '⚙️  MODE APPLY — écritures réelles\n' : '🔍 DRY-RUN — aucune écriture (ajoutez --apply)\n');
  if (TENANT_IDS.length) console.log(`Tenant(s) : ${TENANT_IDS.join(', ')}\n`);

  const rows = await findForeignByEvent();
  if (!rows.length) {
    console.log('✅ Aucune ligne étrangère : rien à réparer.');
    return;
  }

  // Résumé par tenant / espace.
  const byTenant = new Map<string, { events: number; rows: number; revenue: number }>();
  const spaces = new Map<string, { tenantId: string; spaceId: string; spaceName: string | null }>();
  for (const r of rows) {
    const t = byTenant.get(r.tenantId) || { events: 0, rows: 0, revenue: 0 };
    t.events++; t.rows += r.foreignRows; t.revenue += r.foreignRevenue;
    byTenant.set(r.tenantId, t);
    spaces.set(`${r.tenantId}:${r.spaceId}`, { tenantId: r.tenantId, spaceId: r.spaceId, spaceName: r.spaceName });
  }
  for (const [tenantId, t] of byTenant) {
    console.log(`tenant=${tenantId} : ${t.events} event(s), ${t.rows} ligne(s) étrangère(s), ${eur(t.revenue)} € de CA parasite`);
  }

  console.log('\nDétail par event (rollup avant → attendu après) :');
  for (const r of rows) {
    const zeroAfter = r.legitRevenue === 0 ? '  ⚠️  aucune vente propre : passe à 0' : '';
    console.log(
      `  [${r.spaceName}] ${r.eventName} (${r.eventDate?.toISOString().slice(0, 10)}) : ` +
        `${eur(r.rollupRevenue)} € / ${r.rollupTransactions ?? '?'} tx → ${eur(r.legitRevenue)} € / ${r.legitTransactions} tx ` +
        `(retire ${eur(r.foreignRevenue)} € de ${r.foreignIntegrations})${zeroAfter}`,
    );
  }
  writeReport(rows);
  console.log(`\n📄 Rapport : ${CSV_PATH}`);

  if (!APPLY) {
    console.log('\nℹ️  Relancez avec --apply pour exécuter.');
    return;
  }

  // 1. Purge par espace (3 tables, la table jour par produit n'a pas de clé event).
  let purgedTotal = 0;
  for (const s of spaces.values()) {
    const ids = await scope.resolve(s.tenantId, s.spaceId);
    const purged = await scope.purgeForeignRows(s.tenantId, s.spaceId, ids);
    purgedTotal += purged;
    console.log(`  🧹 [${s.spaceName}] ${purged} ligne(s) supprimée(s) (intégrations conservées : ${ids.join(', ')})`);
  }

  // 2. Rollup des events touchés, même formule que le job d'agrégation.
  let refreshed = 0;
  for (const r of rows) {
    const event = await prisma.event.findUnique({
      where: { id: r.eventId },
      select: { id: true, ticketsScanned: true, ticketsSold: true },
    });
    if (!event) continue; // agrégats orphelins d'un event supprimé : lignes purgées, rien à recalculer
    const ids = await scope.resolve(r.tenantId, r.spaceId);
    const res = await rollup.refresh(r.tenantId, r.spaceId, event, ids);
    refreshed++;
    const drift = Math.abs(res.revenue - r.legitRevenue) > 0.01 ? `  ⚠️  écart vs attendu ${eur(r.legitRevenue)}` : '';
    console.log(`  ↻ ${r.eventName} : ${eur(res.revenue)} € / ${res.transactionCount} tx${drift}`);
  }

  await purgeRedis([...spaces.values()]);
  console.log(`\n✅ Réparation appliquée — ${purgedTotal} ligne(s) supprimée(s), ${refreshed} rollup(s) recalculé(s).`);
}

main().catch((e) => { console.error('ERREUR', e); process.exit(1); }).finally(() => prisma.$disconnect());
