/**
 * Artefact de validation de la page Analyse.
 * Fiches : web BUG-353-01 / BUG-354-01 / BUG-355-01 — api BUG-135-01 / BUG-136-01.
 *
 * LECTURE SEULE — aucune écriture, aucun `--apply`. Compare, pour UN événement, ce que
 * l'Analyse publie avec la vérité brute lue directement dans `WeezeventTransaction` +
 * `WeezeventTransactionItem`, et affiche les écarts.
 *
 * Il répond à trois questions distinctes, jamais confondues :
 *   1. « les chiffres sont-ils justes ? »        → comparaison DataFriday vs vérité brute
 *   2. « que compte-t-on exactement ? »          → LIGNES / UNITÉS / TICKETS en 3 colonnes
 *   3. « le SpaceMenu influence-t-il encore ? »  → non, par construction : le rapprochement
 *      article n'existe plus côté client. La preuve DURABLE est le test unitaire
 *      `frontend/tests/unit/analyseReconciliation.spec.js` (bloc « BUG-353-01 »), qui
 *      réconcilie la même vente avec et sans assignation SpaceMenu et exige un résultat
 *      identique. Ce script vérifie ici le pendant côté données : chaque unité affichée
 *      provient d'une ligne `WeezeventProductMapping`, et de rien d'autre.
 *
 * Les jointures produit se font sur `menuItemId`, JAMAIS sur le nom — un audit qui
 * joindrait par libellé hériterait du défaut qu'il est censé mesurer.
 *
 *   npx tsx scripts/verify-event-analytics.ts --event=<Event.id>
 *   npx tsx scripts/verify-event-analytics.ts --event=<Event.id> --top=30
 *
 * Exemple de référence (dev) — Le Mans FC, « Le Mans-Brest » du 22/08/2026 :
 *   npx tsx scripts/verify-event-analytics.ts --event=5d8d0500-f7ad-4bdf-9767-bbe5a5e15a89
 *   → 13 925 lignes · 25 867 unités · 5 721 tickets · Bud 33cl 916 u / 14 PdV
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });

function arg(name: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

const EVENT_ID = arg('event');
const TOP = Number(arg('top') || 20);

const nf = new Intl.NumberFormat('fr-FR');
const cf = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const n = (v: unknown) => nf.format(Number(v ?? 0));
const eur = (v: unknown) => `${cf.format(Number(v ?? 0))} €`;

function rule(title: string) {
  console.log(`\n${title}\n${'─'.repeat(Math.max(title.length, 60))}`);
}

/**
 * Écart signé + pourcentage, avec un marqueur lisible d'un coup d'œil.
 * `money` : formatage à 2 décimales (un écart de 0,53 € ne doit pas s'afficher « 1 »).
 * `tol`   : sous ce seuil absolu, l'écart est considéré comme nul (arrondis de TVA).
 */
function delta(a: number, b: number, { money = false, tol = 0 } = {}): string {
  const d = a - b;
  if (Math.abs(d) <= tol) return '✓';
  const pct = b === 0 ? Infinity : (d / b) * 100;
  const sign = d > 0 ? '+' : '';
  const amount = money ? `${cf.format(d)} €` : nf.format(d);
  return `✗  ${sign}${amount} (${sign}${cf.format(pct)} %)`;
}

async function main() {
  if (!EVENT_ID) {
    console.error('Usage : npx tsx scripts/verify-event-analytics.ts --event=<Event.id> [--top=20]');
    process.exit(1);
  }

  const event = await prisma.event.findUnique({
    where: { id: EVENT_ID },
    select: {
      id: true, name: true, eventDate: true, spaceId: true, tenantId: true,
      revenue: true, transactionCount: true, avgSpendPerTx: true,
    },
  });
  if (!event || !event.spaceId || !event.tenantId) {
    console.error(`Event ${EVENT_ID} introuvable (ou sans spaceId/tenantId).`);
    process.exit(1);
  }
  const { spaceId, tenantId } = event;

  const space = await prisma.space.findUnique({ where: { id: spaceId }, select: { name: true } });

  rule(`ÉVÉNEMENT  ${event.name} — ${new Date(event.eventDate).toLocaleDateString('fr-FR')}`);
  console.log(`espace     ${space?.name ?? '?'} (${spaceId})`);
  console.log(`event id   ${event.id}`);

  // ── Fenêtre d'agrégation réellement écrite ────────────────────────────────
  // On l'ancre sur SpaceRevenueMinuteAgg plutôt que de recalculer resolveEventWindow :
  // l'audit doit mesurer ce que la page LIT, pas ce qu'un second calcul déciderait.
  const bounds = await prisma.$queryRaw<Array<{ minMinute: Date | null; maxMinute: Date | null; rows: bigint }>>`
    SELECT MIN("minute") AS "minMinute", MAX("minute") AS "maxMinute", COUNT(*)::bigint AS "rows"
    FROM "SpaceRevenueMinuteAgg"
    WHERE "tenantId" = ${tenantId} AND "spaceId" = ${spaceId} AND "weezeventEventId" = ${event.id}
  `;
  const minMinute = bounds[0]?.minMinute;
  const maxMinute = bounds[0]?.maxMinute;
  if (!minMinute || !maxMinute) {
    console.error('\nAucune ligne SpaceRevenueMinuteAgg pour cet event — rien à comparer.');
    console.error("L'agrégation n'a pas tourné, ou l'event est tagué avec un autre id.");
    process.exit(1);
  }
  const windowEnd = new Date(maxMinute.getTime() + 60_000);
  console.log(`fenêtre    ${minMinute.toISOString()} → ${windowEnd.toISOString()} (${n(bounds[0].rows)} lignes d'agrégat)`);

  // ── Vérité brute ───────────────────────────────────────────────────────────
  const truth = await prisma.$queryRaw<Array<{
    lines: bigint; units: number; tickets: bigint; revenueHt: number;
    mappedLines: bigint; mappedUnits: number; mappedTickets: bigint; mappedRevenueHt: number;
    unmappedProductLines: bigint; unmappedShopLines: bigint;
    unmappedProductRevenue: number;
  }>>`
    SELECT
      COUNT(ti."id")::bigint                                                   AS "lines",
      COALESCE(SUM(ti."quantity"), 0)::float8                                  AS "units",
      COUNT(DISTINCT t."id")::bigint                                           AS "tickets",
      COALESCE(SUM(ti."unitPrice" * ti."quantity" / (1 + ti."vat" / 100)), 0)::float8 AS "revenueHt",
      -- Vérité MAPPÉE = ce que la page doit publier depuis BUG-137-01 : lignes dont
      -- l'article ET le PdV sont mappés ; ticket compté s'il a >= 1 ligne mappée.
      COUNT(ti."id") FILTER (WHERE wpm."menuItemId" IS NOT NULL AND lsm."spaceElementId" IS NOT NULL)::bigint AS "mappedLines",
      COALESCE(SUM(ti."quantity") FILTER (WHERE wpm."menuItemId" IS NOT NULL AND lsm."spaceElementId" IS NOT NULL), 0)::float8 AS "mappedUnits",
      COUNT(DISTINCT t."id") FILTER (WHERE wpm."menuItemId" IS NOT NULL AND lsm."spaceElementId" IS NOT NULL)::bigint AS "mappedTickets",
      COALESCE(SUM(ti."unitPrice" * ti."quantity" / (1 + ti."vat" / 100))
               FILTER (WHERE wpm."menuItemId" IS NOT NULL AND lsm."spaceElementId" IS NOT NULL), 0)::float8 AS "mappedRevenueHt",
      COUNT(ti."id") FILTER (WHERE wpm."menuItemId" IS NULL)::bigint           AS "unmappedProductLines",
      COUNT(ti."id") FILTER (WHERE lsm."spaceElementId" IS NULL)::bigint       AS "unmappedShopLines",
      COALESCE(SUM(CASE WHEN wpm."menuItemId" IS NULL
                        THEN ti."unitPrice" * ti."quantity" / (1 + ti."vat" / 100)
                        ELSE 0 END), 0)::float8                                AS "unmappedProductRevenue"
    FROM "WeezeventTransaction" t
    JOIN "WeezeventTransactionItem" ti ON ti."transactionId" = t."id"
    LEFT JOIN "WeezeventProductMapping" wpm
      ON wpm."weezeventProductId" = ti."productId" AND wpm."tenantId" = t."tenantId"
    LEFT JOIN "WeezeventLocationShopMapping" lsm
      ON lsm."weezeventLocationId" = t."locationId" AND lsm."tenantId" = t."tenantId"
    WHERE t."tenantId" = ${tenantId}
      AND t."deletedAt" IS NULL
      AND t."transactionDate" >= ${minMinute}
      AND t."transactionDate" <  ${windowEnd}
  `;
  const T = truth[0];

  // ── Ce que DataFriday publie ───────────────────────────────────────────────
  const dfAgg = await prisma.$queryRaw<Array<{ txCount: number; units: number; revenueHt: number }>>`
    SELECT
      COALESCE(SUM("transactionsCount"), 0)::int  AS "txCount",
      COALESCE(SUM("itemsCount"), 0)::float8      AS "units",
      COALESCE(SUM("revenueHt"), 0)::float8       AS "revenueHt"
    FROM "SpaceRevenueMinuteAgg"
    WHERE "tenantId" = ${tenantId} AND "spaceId" = ${spaceId} AND "weezeventEventId" = ${event.id}
  `;
  const D = dfAgg[0];

  rule('1 · TOTAUX — trois compteurs distincts, jamais interchangeables');
  console.log('La page compte TOUTES les ventes (décision JLH 2026-08-24) : cible = vérité');
  console.log('brute. La colonne « dont mappées » chiffre la part rattachée au catalogue —');
  console.log('le reste apparaît sous « Non mappées » à l\'écran, jamais écarté.');
  console.log('');
  console.log('                        agrégat shop-level     vérité brute     dont mappées');
  console.log(`lignes de vente        ${'—'.padStart(16)}  ${n(T.lines).padStart(16)}  ${n(T.mappedLines).padStart(14)}`);
  console.log(`unités vendues         ${n(D.units).padStart(16)}  ${n(T.units).padStart(16)}  ${n(T.mappedUnits).padStart(14)}`);
  console.log(`TICKETS distincts      ${n(D.txCount).padStart(16)}  ${n(T.tickets).padStart(16)}  ${n(T.mappedTickets).padStart(14)}`);
  console.log(`CA HT                  ${eur(D.revenueHt).padStart(16)}  ${eur(T.revenueHt).padStart(16)}  ${eur(T.mappedRevenueHt).padStart(14)}`);
  console.log('');
  console.log(`écart unités agrégat vs brut   ${delta(Number(D.units), Number(T.units))}`);
  console.log(`écart tickets agrégat vs brut  ${delta(Number(D.txCount), Number(T.tickets))}`);
  console.log(`écart CA agrégat vs brut       ${delta(Number(D.revenueHt), Number(T.revenueHt), { money: true, tol: 1 })}`);
  const trueTickets = Number(T.tickets);
  console.log('');
  console.log(`Event.transactionCount ${n(event.transactionCount ?? 0)}   (attendu ${n(trueTickets)})`);
  const avgBefore = event.transactionCount ? Number(event.revenue ?? 0) / Number(event.transactionCount) : 0;
  const avgAfter = trueTickets ? Number(T.revenueHt) / trueTickets : 0;
  console.log(`panier moyen           ${eur(event.avgSpendPerTx ?? avgBefore)}  → attendu ${eur(avgAfter)}`);

  // Couverture du recalcul (BUG-135-01) — MESURÉE, pas déduite d'une coïncidence.
  // La version précédente signalait le défaut par l'égalité « transactionCount ==
  // nombre de lignes » : un event partiellement réparé l'aurait cassée en silence.
  const coverage = await prisma.$queryRaw<Array<{ rows: bigint; repaired: bigint }>>`
    WITH matchable AS (
      SELECT DISTINCT
        t."tenantId"                              AS "tenantId",
        date_trunc('minute', t."transactionDate") AS "minute",
        t."locationId"                            AS "locationId",
        t."merchantId"                            AS "merchantId",
        lsm."spaceElementId"                      AS "spaceElementId"
      FROM "WeezeventTransaction" t
      JOIN "WeezeventTransactionItem" ti ON ti."transactionId" = t."id"
      LEFT JOIN "WeezeventLocationShopMapping" lsm
        ON lsm."weezeventLocationId" = t."locationId" AND lsm."tenantId" = t."tenantId"
      WHERE t."deletedAt" IS NULL
    )
    SELECT COUNT(*)::bigint AS "rows", COUNT(m."minute")::bigint AS "repaired"
    FROM "SpaceRevenueMinuteAgg" a
    LEFT JOIN matchable m
      ON a."tenantId" = m."tenantId"
     AND a."minute"   = m."minute"
     AND a."weezeventLocationId" IS NOT DISTINCT FROM m."locationId"
     AND a."weezeventMerchantId" IS NOT DISTINCT FROM m."merchantId"
     AND a."spaceElementId"      IS NOT DISTINCT FROM m."spaceElementId"
    WHERE a."tenantId" = ${tenantId} AND a."spaceId" = ${spaceId}
      AND a."weezeventEventId" = ${event.id}
  `;
  const covRows = Number(coverage[0]?.rows ?? 0);
  const covOk = Number(coverage[0]?.repaired ?? 0);
  console.log(`lignes d'agrégat rattachables au grain courant   ${n(covOk)} / ${n(covRows)}`);
  if (Number(event.transactionCount ?? 0) !== trueTickets) {
    if (covOk === covRows) {
      console.log("⚠  Compteur faux, event ENTIÈREMENT réparable : appliquer la migration");
      console.log('   prisma/migrations/20260824120000_fix_transactions_count/migration.sql');
    } else {
      console.log("⚠  Compteur faux et event NON entièrement rattachable (convention d'id");
      console.log('   antérieure) : re-agrégation nécessaire, POST /aggregation/process-events');
      console.log('   sur cet espace. La migration SQL laisse volontairement ces events en l\'état.');
    }
  }

  rule('2 · NON MAPPÉES — comptées, affichées « Non mappées » (BUG-137-01)');
  console.log(`lignes sans mapping ARTICLE   ${n(T.unmappedProductLines).padStart(10)}   ${eur(T.unmappedProductRevenue)}`);
  console.log(`lignes sans mapping PdV       ${n(T.unmappedShopLines).padStart(10)}`);
  console.log('→ décision JLH 2026-08-24 (après avoir envisagé puis écarté l\'exclusion) : ces');
  console.log('  ventes RESTENT comptées dans toutes les vues, sous « Non mappées ». Le bandeau');
  console.log('  de la page chiffre ce volume — à résorber en repassant les mappings Data');
  console.log('  Integration (cause unique mesurée : produit importé mais jamais mappé, étape 3).');

  // ── Par article, joint sur menuItemId ─────────────────────────────────────
  const byItem = await prisma.$queryRaw<Array<{
    menuItemId: string | null; menuItemName: string | null;
    units: number; lines: bigint; tickets: bigint; pdvCount: bigint;
  }>>`
    SELECT
      wpm."menuItemId"                                        AS "menuItemId",
      COALESCE(mi."name", '« Non mappées »')                  AS "menuItemName",
      COALESCE(SUM(ti."quantity"), 0)::float8                 AS "units",
      COUNT(ti."id")::bigint                                  AS "lines",
      COUNT(DISTINCT t."id")::bigint                          AS "tickets",
      COUNT(DISTINCT lsm."spaceElementId")::bigint            AS "pdvCount"
    FROM "WeezeventTransaction" t
    JOIN "WeezeventTransactionItem" ti ON ti."transactionId" = t."id"
    LEFT JOIN "WeezeventProductMapping" wpm
      ON wpm."weezeventProductId" = ti."productId" AND wpm."tenantId" = t."tenantId"
    LEFT JOIN "MenuItem" mi ON mi."id" = wpm."menuItemId"
    LEFT JOIN "WeezeventLocationShopMapping" lsm
      ON lsm."weezeventLocationId" = t."locationId" AND lsm."tenantId" = t."tenantId"
    WHERE t."tenantId" = ${tenantId}
      AND t."deletedAt" IS NULL
      AND t."transactionDate" >= ${minMinute}
      AND t."transactionDate" <  ${windowEnd}
    GROUP BY wpm."menuItemId", mi."name"
    ORDER BY 3 DESC
    LIMIT ${TOP}
  `;

  rule(`3 · PAR ARTICLE (top ${TOP}) — joint sur menuItemId, jamais sur le nom`);
  console.log('unités      lignes     tickets   PdV   menuItemId                        article');
  for (const r of byItem) {
    console.log(
      `${n(r.units).padStart(8)}  ${n(r.lines).padStart(10)}  ${n(r.tickets).padStart(10)}  ${n(r.pdvCount).padStart(4)}   ` +
      `${(r.menuItemId ?? '—').padEnd(32)}  ${r.menuItemName}`,
    );
  }

  // ── Par PdV, joint sur spaceElementId ─────────────────────────────────────
  const byShop = await prisma.$queryRaw<Array<{
    spaceElementId: string | null; shopName: string | null;
    units: number; lines: bigint; tickets: bigint;
  }>>`
    SELECT
      lsm."spaceElementId"                                    AS "spaceElementId",
      COALESCE(se."name", t."locationName", '« PdV non mappé »') AS "shopName",
      COALESCE(SUM(ti."quantity"), 0)::float8                 AS "units",
      COUNT(ti."id")::bigint                                  AS "lines",
      COUNT(DISTINCT t."id")::bigint                          AS "tickets"
    FROM "WeezeventTransaction" t
    JOIN "WeezeventTransactionItem" ti ON ti."transactionId" = t."id"
    LEFT JOIN "WeezeventLocationShopMapping" lsm
      ON lsm."weezeventLocationId" = t."locationId" AND lsm."tenantId" = t."tenantId"
    LEFT JOIN "SpaceElement" se ON se."id" = lsm."spaceElementId"
    WHERE t."tenantId" = ${tenantId}
      AND t."deletedAt" IS NULL
      AND t."transactionDate" >= ${minMinute}
      AND t."transactionDate" <  ${windowEnd}
    GROUP BY lsm."spaceElementId", se."name", t."locationName"
    ORDER BY 3 DESC
    LIMIT ${TOP}
  `;

  rule(`4 · PAR POINT DE VENTE (top ${TOP}) — joint sur spaceElementId`);
  console.log('unités      lignes     tickets   point de vente');
  for (const r of byShop) {
    console.log(
      `${n(r.units).padStart(8)}  ${n(r.lines).padStart(10)}  ${n(r.tickets).padStart(10)}   ${r.shopName}`,
    );
  }

  // ── Indépendance SpaceMenu, côté données ──────────────────────────────────
  const spaceMenuCount = await prisma.spaceMenuItem.count({ where: { spaceId } });
  const mappedItemIds = new Set(byItem.map((r) => r.menuItemId).filter(Boolean) as string[]);
  const inSpaceMenu = mappedItemIds.size
    ? await prisma.spaceMenuItem.count({ where: { spaceId, menuItemId: { in: [...mappedItemIds] } } })
    : 0;

  rule('5 · INDÉPENDANCE SPACEMENU');
  console.log(`SpaceMenuItem de l'espace                       ${n(spaceMenuCount)}`);
  console.log(`articles du top ${TOP} présents dans le SpaceMenu    ${n(inSpaceMenu)} / ${n(mappedItemIds.size)}`);
  console.log('');
  console.log("Ce ratio est INFORMATIF : il ne change rien aux chiffres ci-dessus. Depuis BUG-353-01,");
  console.log("l'identité article de l'Analyse vient de WeezeventProductMapping (résolue côté");
  console.log('backend) et le SpaceMenu ne participe plus au calcul. La garantie durable est le');
  console.log("test frontend/tests/unit/analyseReconciliation.spec.js, bloc « BUG-353-01 » :");
  console.log('   pnpm test:unit -- tests/unit/analyseReconciliation.spec.js');
  console.log("Pour le vérifier à la main : retirer un article du SpaceMenu, recharger l'Analyse,");
  console.log('ses unités doivent être inchangées.');

  rule('6 · COMPLÉTUDE D’IMPORT');
  console.log("Les écarts ci-dessus opposent DataFriday à sa propre base. Un écart avec l'export");
  console.log("Weezevent d'origine est un axe SÉPARÉ (transactions jamais importées, bornes de");
  console.log(`fenêtre) : sur l'event de référence, 14 138 lignes / 5 802 tickets à l'export contre`);
  console.log(`${n(T.lines)} lignes / ${n(T.tickets)} tickets en base. À traiter comme une question`);
  console.log("d'import, pas de calcul.");
  console.log('');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
