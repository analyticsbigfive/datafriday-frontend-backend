import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { dailyRevenueByProduct, minuteRevenueByLocation, minuteRevenueByProduct, unmappedLocationsWithSalesInPeriod, unmappedMerchantsWithSales } from './space-aggregation.queries';

// BUG-352-01 : revenueHt sommait ti."unitPrice" * ti."quantity" — le prix catalogue de
// CHAQUE ligne d'article, y compris les lignes "formule/menu" qui n'ont jamais de paiement
// propre (Weezevent facture le paiement réel sur les lignes composants). Le montant
// réellement payé par ligne vit dans ti."rawData"->'payments' (JSON Weezevent) — seule
// source fiable, la table relationnelle WeezeventPayment n'étant peuplée que par le
// webhook temps réel, pas par le sync batch historique. Les items Digifood
// (t."provider" = 'DIGIFOOD') gardent l'ancienne formule unitPrice, déjà nette de remise.
//
// Affinage post-mesure (même jour) : `ti."rawData"` porte 3 formes distinctes côté
// Weezevent, pas 2 — un COALESCE initial les confondait. Mesuré sur toute la table : clé
// "payments" ABSENTE (20 294 lignes, 77 804 €, ex. "Tsing Tao 25cl" — produit normal, juste
// une lacune de donnée) vs clé PRÉSENTE mais VIDE (6 417 lignes, 27 282 €, vraies lignes
// formule/menu). Le test `?` restaure `unitPrice` uniquement quand la donnée de paiement
// est absente, jamais quand elle est présente-et-vide. Détail complet et mesure d'impact :
// event-aggregation.queries.ts (revenueHtExpr, constante partagée).

interface AggregationJobParams {
  tenantId: string;
  spaceId?: string;
  fromDate: Date;
  toDate: Date;
  jobType: 'full' | 'incremental' | 'rebuild';
}

@Injectable()
export class SpaceAggregationService {
  private readonly logger = new Logger(SpaceAggregationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async runAggregation(params: AggregationJobParams): Promise<void> {
    const { tenantId, spaceId, fromDate, toDate, jobType } = params;

    const jobLog = await this.prisma.aggregationJobLog.create({
      data: {
        tenantId,
        spaceId: spaceId || null,
        jobType,
        status: 'running',
        fromDate,
        toDate,
        transactionsProcessed: 0,
      },
    });

    try {
      this.logger.log(
        `Starting ${jobType} aggregation for tenant ${tenantId}${spaceId ? ` space ${spaceId}` : ''} from ${fromDate.toISOString()} to ${toDate.toISOString()}`,
      );

      let transactionsProcessed = 0;

      if (spaceId) {
        transactionsProcessed = await this.aggregateForSpace(
          tenantId,
          spaceId,
          fromDate,
          toDate,
        );
      } else {
        transactionsProcessed = await this.aggregateForTenant(
          tenantId,
          fromDate,
          toDate,
        );
      }

      await this.prisma.aggregationJobLog.update({
        where: { id: jobLog.id },
        data: {
          status: 'completed',
          completedAt: new Date(),
          transactionsProcessed,
        },
      });

      this.logger.log(
        `Aggregation completed: ${transactionsProcessed} transactions processed`,
      );
    } catch (error) {
      this.logger.error(`Aggregation failed: ${error.message}`, error.stack);

      await this.prisma.aggregationJobLog.update({
        where: { id: jobLog.id },
        data: {
          status: 'failed',
          completedAt: new Date(),
          error: error.message,
          retryCount: { increment: 1 },
        },
      });

      throw error;
    }
  }

  private async aggregateForTenant(
    tenantId: string,
    fromDate: Date,
    toDate: Date,
  ): Promise<number> {
    const spaceMappings =
      await this.prisma.locationSpaceMapping.findMany({
        where: { tenantId },
        select: { spaceId: true },
        distinct: ['spaceId'],
      });

    let totalProcessed = 0;

    for (const mapping of spaceMappings) {
      const processed = await this.aggregateForSpace(
        tenantId,
        mapping.spaceId,
        fromDate,
        toDate,
      );
      totalProcessed += processed;
    }

    return totalProcessed;
  }

  private async aggregateForSpace(
    tenantId: string,
    spaceId: string,
    fromDate: Date,
    toDate: Date,
  ): Promise<number> {
    const space = await this.prisma.space.findUnique({
      where: { id: spaceId },
      select: { timezone: true },
    });

    const timezone = space?.timezone || 'Europe/Paris';

    const locationMappings =
      await this.prisma.locationSpaceMapping.findMany({
        where: { tenantId, spaceId },
        select: { salesLocationId: true },
      });

    // salesLocationId stocke l'integrationId (convention step1).
    // WeezeventTransaction.locationId est une FK vers WeezeventLocation.id (cuid).
    // On résout ici les cuids réels pour que les filtres SQL matchent.
    const integrationIds = locationMappings.map((m) => m.salesLocationId);

    if (integrationIds.length === 0) {
      this.logger.warn(`No location mappings found for space ${spaceId}`);
      return 0;
    }

    const actualLocations = await this.prisma.salesLocation.findMany({
      where: { tenantId, integrationId: { in: integrationIds } },
      select: { id: true },
    });

    const locationIds = actualLocations.map((l) => l.id);

    if (locationIds.length === 0) {
      this.logger.warn(`No WeezeventLocation records found for integrations of space ${spaceId}`);
      return 0;
    }

    const transactions = await minuteRevenueByLocation(this.prisma, tenantId, locationIds, fromDate, toDate);

    for (const agg of transactions) {
      await this.prisma.spaceRevenueMinuteAgg.upsert({
        where: {
          tenantId_spaceId_minute_weezeventEventId_weezeventLocationId_weezeventMerchantId_spaceElementId:
            {
              tenantId,
              spaceId,
              minute: agg.minute,
              weezeventEventId: agg.weezeventEventId,
              weezeventLocationId: agg.weezeventLocationId,
              weezeventMerchantId: agg.weezeventMerchantId,
              spaceElementId: agg.spaceElementId,
            },
        },
        create: {
          tenantId,
          spaceId,
          minute: agg.minute,
          timezone,
          weezeventEventId: agg.weezeventEventId,
          weezeventLocationId: agg.weezeventLocationId,
          weezeventMerchantId: agg.weezeventMerchantId,
          spaceElementId: agg.spaceElementId,
          revenueHt: agg.revenueHt,
          transactionsCount: Number(agg.transactionsCount),
          itemsCount: Number(agg.itemsCount),
        },
        update: {
          revenueHt: agg.revenueHt,
          transactionsCount: Number(agg.transactionsCount),
          itemsCount: Number(agg.itemsCount),
        },
      });
    }

    await this.aggregateProducts(
      tenantId,
      spaceId,
      locationIds,
      fromDate,
      toDate,
      timezone,
    );

    await this.aggregateProductsByMinute(
      tenantId,
      spaceId,
      locationIds,
      fromDate,
      toDate,
      timezone,
    );

    await this.trackUnmappedData(tenantId, locationIds, fromDate, toDate);

    await this.incrementDashboardVersion(spaceId, tenantId);

    return transactions.length;
  }

  // HT dérivé de la TVA DE LA LIGNE DE VENTE (ti."vat", comme aggregation.service.ts),
  // remise déduite. Avant : TVA lue sur le produit avec fallback 20 % codé en dur, en
  // contradiction avec la politique "pas de défaut 20 %" de menu-item-pricing.service.ts.
  private async aggregateProducts(
    tenantId: string,
    spaceId: string,
    locationIds: string[],
    fromDate: Date,
    toDate: Date,
    timezone: string,
  ): Promise<void> {
    const productAggregates = await dailyRevenueByProduct(this.prisma, tenantId, timezone, locationIds, fromDate, toDate);

    for (const agg of productAggregates) {
      await this.prisma.spaceProductRevenueDailyAgg.upsert({
        where: {
          tenantId_spaceId_day_weezeventProductId: {
            tenantId,
            spaceId,
            day: agg.day,
            weezeventProductId: agg.weezeventProductId,
          },
        },
        create: {
          tenantId,
          spaceId,
          day: agg.day,
          weezeventProductId: agg.weezeventProductId,
          revenueHt: agg.revenueHt,
          quantity: Number(agg.quantity),
        },
        update: {
          revenueHt: agg.revenueHt,
          quantity: Number(agg.quantity),
        },
      });
    }
  }

  // SpaceRevenueMinuteItemAgg — sert getEventTimelineBatch (grain event × minute × shop ×
  // article). Contrairement au JOIN mem sur t."merchantId" utilisé plus haut dans
  // aggregateForSpace (pour SpaceRevenueMinuteAgg), on joint ici WeezeventLocationShopMapping
  // sur t."locationId" — le bon champ (même convention que aggregation.service.ts, BUG-014) —
  // pour ne pas reproduire ce bug dans la nouvelle table.
  //
  // BUG-352-01 : utilise REVENUE_HT_EXPR (paiements réels) au lieu de unitPrice*quantity —
  // supprime au passage l'ancien écart volontaire "pas de soustraction de reduction" avec
  // aggregateProducts ci-dessus : REVENUE_HT_EXPR reflète le montant payé, déjà net de
  // toute remise.
  private async aggregateProductsByMinute(
    tenantId: string,
    spaceId: string,
    locationIds: string[],
    fromDate: Date,
    toDate: Date,
    timezone: string,
  ): Promise<void> {
    const itemAggregates = await minuteRevenueByProduct(this.prisma, tenantId, locationIds, fromDate, toDate);

    for (const agg of itemAggregates) {
      await this.prisma.spaceRevenueMinuteItemAgg.upsert({
        where: {
          tenantId_spaceId_minute_weezeventEventId_weezeventLocationId_weezeventMerchantId_spaceElementId_weezeventProductId:
            {
              tenantId,
              spaceId,
              minute: agg.minute,
              weezeventEventId: agg.weezeventEventId,
              weezeventLocationId: agg.weezeventLocationId,
              weezeventMerchantId: agg.weezeventMerchantId,
              spaceElementId: agg.spaceElementId,
              weezeventProductId: agg.weezeventProductId,
            },
        },
        create: {
          tenantId,
          spaceId,
          minute: agg.minute,
          timezone,
          weezeventEventId: agg.weezeventEventId,
          weezeventLocationId: agg.weezeventLocationId,
          weezeventLocationName: agg.weezeventLocationName,
          weezeventMerchantId: agg.weezeventMerchantId,
          spaceElementId: agg.spaceElementId,
          weezeventProductId: agg.weezeventProductId,
          revenueHt: agg.revenueHt,
          transactionsCount: Number(agg.transactionsCount),
          itemsCount: Number(agg.itemsCount),
        },
        update: {
          weezeventLocationName: agg.weezeventLocationName,
          revenueHt: agg.revenueHt,
          transactionsCount: Number(agg.transactionsCount),
          itemsCount: Number(agg.itemsCount),
        },
      });
    }
  }

  private async trackUnmappedData(
    tenantId: string,
    locationIds: string[],
    fromDate: Date,
    toDate: Date,
  ): Promise<void> {
    const unmappedMerchants = await unmappedMerchantsWithSales(this.prisma, tenantId, locationIds, fromDate, toDate);

    for (const merchant of unmappedMerchants) {
      await this.prisma.unmappedDataMetrics.upsert({
        where: {
          tenantId_entityType_entityId: {
            tenantId,
            entityType: 'merchant',
            entityId: merchant.merchantId,
          },
        },
        create: {
          tenantId,
          entityType: 'merchant',
          entityId: merchant.merchantId,
          entityName: merchant.merchantName || 'Unknown',
          transactionCount: Number(merchant.transactionCount),
          revenueHt: merchant.revenueHt,
        },
        update: {
          transactionCount: Number(merchant.transactionCount),
          revenueHt: merchant.revenueHt,
          lastSeenAt: new Date(),
        },
      });
    }

    const unmappedLocations = await unmappedLocationsWithSalesInPeriod(this.prisma, tenantId, fromDate, toDate);

    for (const location of unmappedLocations) {
      await this.prisma.unmappedDataMetrics.upsert({
        where: {
          tenantId_entityType_entityId: {
            tenantId,
            entityType: 'location',
            entityId: location.locationId,
          },
        },
        create: {
          tenantId,
          entityType: 'location',
          entityId: location.locationId,
          entityName: location.locationName || 'Unknown',
          transactionCount: Number(location.transactionCount),
          revenueHt: location.revenueHt,
        },
        update: {
          transactionCount: Number(location.transactionCount),
          revenueHt: location.revenueHt,
          lastSeenAt: new Date(),
        },
      });
    }
  }

  private async incrementDashboardVersion(
    spaceId: string,
    tenantId: string,
  ): Promise<void> {
    await this.prisma.spaceDashboardVersion.upsert({
      where: { spaceId },
      create: {
        spaceId,
        tenantId,
        version: 1,
      },
      update: {
        version: { increment: 1 },
      },
    });
  }

  async getAggregationHealth(
    spaceId: string,
    tenantId: string,
  ): Promise<{
    lastAggregationAt: Date | null;
    dataFreshnessMinutes: number | null;
    missingMappingsCount: {
      locations: number;
      merchants: number;
      products: number;
    };
    aggregationStatus: 'healthy' | 'degraded' | 'error';
    lastError: string | null;
  }> {
    const lastJob = await this.prisma.aggregationJobLog.findFirst({
      where: {
        tenantId,
        spaceId,
        status: 'completed',
      },
      orderBy: { completedAt: 'desc' },
    });

    const lastFailedJob = await this.prisma.aggregationJobLog.findFirst({
      where: {
        tenantId,
        spaceId,
        status: 'failed',
      },
      orderBy: { completedAt: 'desc' },
    });

    const unmappedMetrics = await this.prisma.unmappedDataMetrics.groupBy({
      by: ['entityType'],
      where: { tenantId },
      _count: { id: true },
    });

    const missingMappingsCount = {
      locations:
        unmappedMetrics.find((m) => m.entityType === 'location')?._count.id ||
        0,
      merchants:
        unmappedMetrics.find((m) => m.entityType === 'merchant')?._count.id ||
        0,
      products:
        unmappedMetrics.find((m) => m.entityType === 'product')?._count.id || 0,
    };

    const dataFreshnessMinutes = lastJob?.completedAt
      ? Math.floor(
          (Date.now() - lastJob.completedAt.getTime()) / (1000 * 60),
        )
      : null;

    let aggregationStatus: 'healthy' | 'degraded' | 'error' = 'healthy';

    if (!lastJob) {
      aggregationStatus = 'error';
    } else if (dataFreshnessMinutes && dataFreshnessMinutes > 120) {
      aggregationStatus = 'degraded';
    } else if (
      lastFailedJob &&
      lastFailedJob.completedAt &&
      lastJob.completedAt &&
      lastFailedJob.completedAt > lastJob.completedAt
    ) {
      aggregationStatus = 'error';
    }

    return {
      lastAggregationAt: lastJob?.completedAt || null,
      dataFreshnessMinutes,
      missingMappingsCount,
      aggregationStatus,
      lastError: lastFailedJob?.error || null,
    };
  }
}
