import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { buildSalesPriceAggDeltas, SalesPriceAggDeltaRow, SalesPriceAggDeltaSource } from './sales-price-agg-delta';

/**
 * Écriture de SalesPriceAgg (BUG-337-02, docs/bugs/) — pré-agrégat lu par les méthodes
 * getLatestSalesPrices/getModalSalesPrices de MenuItemPricingService à la place du raw JOIN
 * WeezeventTransactionItem/WeezeventTransaction (17-40s mesurés sur un tenant réel).
 *
 * Deux stratégies, choisies par l'appelant selon le volume :
 *  - applyDelta : incrémental, O(lignes écrites). L'appelant connaît exactement les items qu'il
 *    vient d'insérer (et de supprimer en cas de ré-émission), on upsert +n/-n sur salesCount
 *    sans relire l'historique. Pour le steady-state (webhook, sync incrémental, Digifood).
 *    Remplace l'ancien refreshForKeys (delete+recompute "ciblé") qui, pour 2 clés, rejoignait
 *    TOUTES les transactions de la location (72k tx, ~200k lectures aléatoires sur la table
 *    items de 3,5 GB) : lancé N fois en parallèle par les webhooks, il saturait le disque
 *    (85 % IOwait mesuré en prod le 2026-09-21).
 *  - refreshForIntegration : recalcul complet d'une intégration (même coût que l'ancienne requête,
 *    mais payé UNE fois par job de sync au lieu d'une fois par page vue), réservé au premier sync
 *    complet, au backfill, et à la fin d'un job de sync massif. Corrige aussi toute dérive du
 *    delta (suppressions hors flux, changements de statut).
 *
 * Les deux omettent volontairement les filtres status/deletedAt — les requêtes raw remplacées
 * dans menu-item-pricing.service.ts ne les avaient pas non plus ; les ajouter changerait le
 * comportement en silence.
 */
@Injectable()
export class SalesPriceAggService {
  private readonly logger = new Logger(SalesPriceAggService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Upsert incrémental : +1 par item ajouté, -1 par item supprimé, par clé SalesPriceAgg.
   * Une seule requête INSERT ... ON CONFLICT DO UPDATE, aucun scan de l'historique. Les lignes
   * dont le compteur tombe à 0 ou moins sont purgées (clé indexée tenant+location, table petite).
   * Ne doit jamais faire échouer l'appelant : catch systématique côté appelant (applyDeltaSafe).
   */
  async applyDelta(
    tenantId: string,
    integrationId: string,
    added: SalesPriceAggDeltaSource[],
    removed: SalesPriceAggDeltaSource[] = [],
  ): Promise<void> {
    const rows = buildSalesPriceAggDeltas(added, removed);
    if (!rows.length) return;

    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO "SalesPriceAgg"
        ("id","tenantId","integrationId","locationId","productId","itemWeezeventId","productNameNorm","unitPrice","vat","salesCount","lastSoldAt","createdAt","updatedAt")
      VALUES ${Prisma.join(rows.map((r) => this.deltaValues(tenantId, integrationId, r)))}
      ON CONFLICT ("tenantId","locationId","productId","itemWeezeventId","productNameNorm","unitPrice","vat")
      DO UPDATE SET
        "salesCount" = "SalesPriceAgg"."salesCount" + EXCLUDED."salesCount",
        "lastSoldAt" = GREATEST("SalesPriceAgg"."lastSoldAt", EXCLUDED."lastSoldAt"),
        "updatedAt" = NOW()
    `);

    if (rows.some((r) => r.delta < 0)) {
      const locationIds = [...new Set(rows.map((r) => r.locationId))];
      await this.prisma.$executeRaw(Prisma.sql`
        DELETE FROM "SalesPriceAgg"
        WHERE "tenantId" = ${tenantId} AND "locationId" IN (${Prisma.join(locationIds)}) AND "salesCount" <= 0
      `);
    }
  }

  private deltaValues(tenantId: string, integrationId: string, r: SalesPriceAggDeltaRow): Prisma.Sql {
    return Prisma.sql`(gen_random_uuid(), ${tenantId}, ${integrationId}, ${r.locationId}, ${r.productId}, ${r.itemWeezeventId}, ${r.productNameNorm}, ${r.unitPrice}::numeric, ${r.vat}::numeric, ${r.delta}::int, ${r.lastSoldAt}::timestamp, NOW(), NOW())`;
  }

  /**
   * Refresh complet d'une intégration : delete+recompute depuis TOUT l'historique
   * WeezeventTransactionItem/WeezeventTransaction (même coût que l'ancienne requête à la volée,
   * 20-40s sur un gros tenant). Réservé au premier sync complet, au backfill, et à la fin d'un job
   * de sync massif (bisection worker) — jamais appelé depuis un chemin de lecture HTTP.
   *
   * Pas de $transaction englobant delete+insert : garder une
   * transaction ouverte 20-40s sur un scan multi-millions de lignes risque verrous/vacuum/
   * réplication. La brève fenêtre table-vide s'auto-corrige (les lecteurs retombent sur
   * priceSource:'catalog' quelques secondes) — même arbitrage que le précédent
   * AggregationService.executeProcessEvents, qui ne wrap pas non plus ses delete+insert.
   *
   * ON CONFLICT : un webhook peut insérer une clé via applyDelta entre le DELETE et la fin de
   * l'INSERT ; sans lui, l'INSERT entier échouait sur la contrainte unique et l'intégration
   * restait vide jusqu'au prochain recalcul. GREATEST garde le compteur le plus complet.
   */
  async refreshForIntegration(tenantId: string, integrationId: string): Promise<void> {
    await this.prisma.$executeRaw(Prisma.sql`
      DELETE FROM "SalesPriceAgg" WHERE "tenantId" = ${tenantId} AND "integrationId" = ${integrationId}
    `);
    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO "SalesPriceAgg"
        ("id","tenantId","integrationId","locationId","productId","itemWeezeventId","productNameNorm","unitPrice","vat","salesCount","lastSoldAt","createdAt","updatedAt")
      SELECT
        gen_random_uuid(), ${tenantId}, ${integrationId}, t."locationId",
        COALESCE(ti."productId", ''), COALESCE(ti."rawData"->>'item_id', ''), COALESCE(LOWER(TRIM(ti."productName")), ''),
        ti."unitPrice", ti."vat", COUNT(*)::int, MAX(t."transactionDate"), NOW(), NOW()
      FROM "WeezeventTransactionItem" ti
      JOIN "WeezeventTransaction" t ON t."id" = ti."transactionId"
      WHERE t."tenantId" = ${tenantId} AND t."integrationId" = ${integrationId}
        AND ti."unitPrice" > 0 AND t."locationId" IS NOT NULL
      GROUP BY t."locationId", COALESCE(ti."productId",''), COALESCE(ti."rawData"->>'item_id',''), COALESCE(LOWER(TRIM(ti."productName")),''), ti."unitPrice", ti."vat"
      ON CONFLICT ("tenantId","locationId","productId","itemWeezeventId","productNameNorm","unitPrice","vat")
      DO UPDATE SET
        "salesCount" = GREATEST("SalesPriceAgg"."salesCount", EXCLUDED."salesCount"),
        "lastSoldAt" = GREATEST("SalesPriceAgg"."lastSoldAt", EXCLUDED."lastSoldAt"),
        "updatedAt" = NOW()
    `);
  }

  /** Best-effort : log et avale l'erreur, ne doit jamais casser le flux appelant (sync/webhook). */
  async applyDeltaSafe(
    tenantId: string,
    integrationId: string,
    added: SalesPriceAggDeltaSource[],
    removed: SalesPriceAggDeltaSource[] = [],
  ): Promise<void> {
    try {
      await this.applyDelta(tenantId, integrationId, added, removed);
    } catch (err) {
      this.logger.warn(`SalesPriceAgg applyDelta failed (tenant=${tenantId}, integration=${integrationId}): ${(err as Error).message}`);
    }
  }

  /** Best-effort : log et avale l'erreur, ne doit jamais casser le flux appelant (sync/job). */
  async refreshForIntegrationSafe(tenantId: string, integrationId: string): Promise<void> {
    try {
      await this.refreshForIntegration(tenantId, integrationId);
    } catch (err) {
      this.logger.warn(`SalesPriceAgg refreshForIntegration failed (tenant=${tenantId}, integration=${integrationId}): ${(err as Error).message}`);
    }
  }
}
