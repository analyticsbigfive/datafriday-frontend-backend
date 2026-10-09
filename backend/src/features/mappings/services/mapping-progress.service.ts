import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { findDistinctMerchantIds, findDistinctMerchantIntegrations } from '../../../shared/sales/distinct-merchants.queries';
import { countEndedEventsBySpace } from '../../../shared/utils/count-ended-events';

/**
 * Avancement du rattachement par intégration et résumé des lieux.
 */
@Injectable()
export class MappingProgressService {
  constructor(
    private prisma: PrismaService,
  ) {}

  private readonly logger = new Logger(MappingProgressService.name);

  // ─── Integration Progress ────────────────────────────────

  /**
   * Un point de vente de cette intégration (location cuid via createLocationShopMapping OU
   * merchant id via createMerchantElementMapping — les deux écrivent dans LocationShopMapping.
   * salesLocationId, cf. BUG-017) est-il mappé à un SpaceElement ?
   *
   * Source unique utilisée par getIntegrationProgress, getAllIntegrationProgress (step2) et
   * AggregationStatusService.getStep4Context (hasMappings) — BUG-017/BUG-029 corrigés ensemble : ces 3
   * endroits réimplémentaient chacun leur propre logique de calcul, avec des définitions
   * divergentes (l'une comptait par merchantId en filtrant le mauvais champ, l'autre par location
   * cuid uniquement, la troisième ignorait complètement le scoping par intégration).
   */
  async hasShopMappingForIntegration(tenantId: string, integrationId: string): Promise<boolean> {
    const mapped = await this.getShopMappedIntegrationIds(tenantId, [integrationId]);
    return mapped.has(integrationId);
  }

  /**
   * Version batchée de hasShopMappingForIntegration : pour un ensemble d'intégrations, une seule
   * volée de requêtes (indépendante de N) plutôt que N×2 — utilisée par getAllIntegrationProgress.
   */
  private async getShopMappedIntegrationIds(
    tenantId: string,
    integrationIds: string[],
  ): Promise<Set<string>> {
    if (integrationIds.length === 0) return new Set();

    const [locations, merchantTxs, mappings] = await Promise.all([
      this.prisma.salesLocation.findMany({
        where: { tenantId, integrationId: { in: integrationIds } },
        select: { id: true, integrationId: true },
      }),
      findDistinctMerchantIntegrations(this.prisma, { tenantId, integrationIds }),
      this.prisma.locationShopMapping.findMany({
        where: { tenantId },
        select: { salesLocationId: true },
      }),
    ]);

    const mappedSalesLocationIds = new Set(mappings.map((m) => m.salesLocationId));
    const result = new Set<string>();

    for (const loc of locations) {
      if (mappedSalesLocationIds.has(loc.id)) result.add(loc.integrationId);
    }
    for (const tx of merchantTxs) {
      if (tx.merchantId && mappedSalesLocationIds.has(tx.merchantId)) result.add(tx.integrationId);
    }

    return result;
  }

  async getIntegrationProgress(tenantId: string, weezeventLocationId: string) {
    // Step 1: Location→Space mapping exists?
    const locationMapping = await this.prisma.locationSpaceMapping.findUnique({
      where: {
        tenantId_salesLocationId: { tenantId, salesLocationId: weezeventLocationId },
      },
    });

    const step1 = !!locationMapping;
    let step2 = false;
    let step3 = false;
    let step4 = false;
    let step5 = false;

    if (locationMapping) {
      // Step 2 (BUG-017 corrigé) : source unique partagée avec getAllIntegrationProgress et
      // AggregationStatusService.getStep4Context — auparavant cette route comptait les mappings par
      // merchantId en filtrant WeezeventTransaction.locationId (mauvais espace d'id : ce champ
      // contient un cuid WeezeventLocation, pas l'integrationId reçu ici), donnant quasi toujours
      // step2=false. hasShopMappingForIntegration couvre les deux conventions réelles (location
      // cuid ET merchant id).
      step2 = await this.hasShopMappingForIntegration(tenantId, weezeventLocationId);

      // Step 3: Product→MenuItem mappings exist?
      const productMappings = await this.prisma.productMapping.count({
        where: { tenantId },
      });
      step3 = productMappings > 0;

      // Step 4: All past events have been aggregated?
      const [completedJobs, pastEventCount] = await Promise.all([
        this.prisma.aggregationJobLog.count({
          where: { tenantId, spaceId: locationMapping.spaceId, status: 'completed' },
        }),
        // Events TERMINÉS seulement : le match du jour n'est pas « à agréger » dès minuit.
        countEndedEventsBySpace(this.prisma, { tenantId, spaceId: locationMapping.spaceId }).then(
          (bySpace) => bySpace.get(locationMapping.spaceId) ?? 0,
        ),
      ]);
      step4 = pastEventCount > 0 && completedJobs >= pastEventCount;

      // Step 5: Space revenue aggregations exist?
      const aggregations = await this.prisma.spaceRevenueMinuteAgg.count({
        where: {
          tenantId,
          spaceId: locationMapping.spaceId,
        },
      });
      step5 = aggregations > 0;
    }

    return {
      weezeventLocationId,
      spaceId: locationMapping?.spaceId || null,
      steps: {
        step1_space_mapped: step1,
        step2_shops_mapped: step2,
        step3_menu_mapped: step3,
        step4_events_processed: step4,
        step5_synchronized: step5,
      },
      completedSteps: [step1, step2, step3, step4, step5].filter(Boolean).length,
      totalSteps: 5,
    };
  }

  /**
   * Retourne la progression d'intégration pour toutes les intégrations Weezevent du tenant.
   * Optimisé : précharge les compteurs en parallèle pour éviter N×5 queries.
   * Utilisé par l'écran "LocationListItem" du wizard.
   *
   * Clé de conception :
   *  - L'entité primaire du wizard est WeezeventIntegration (= un compte Weezevent / "location" dans l'UI).
   *  - WeezeventLocationSpaceMapping.weezeventLocationId stocke l'integrationId (convention step1).
   *  - LocationShopMapping.salesLocationId stocke SOIT un WeezeventLocation.id (cuid), SOIT un
   *    merchantId, selon que le mapping a été fait via la route location ou merchant (step2, voir
   *    hasShopMappingForIntegration / getShopMappedIntegrationIds).
   */
  async getAllIntegrationProgress(tenantId: string) {
    this.logger.log(`Fetching integration progress for all integrations of tenant ${tenantId}`);

    // 1. Toutes les intégrations Weezevent du tenant (= "locations" dans le wizard)
    const integrations = await this.prisma.integration.findMany({
      where: { tenantId },
      select: { id: true, name: true },
    });

    if (integrations.length === 0) {
      return { data: [], meta: { total: 0 } };
    }

    const integrationIds = integrations.map((i) => i.id);

    // 2. Précharge en parallèle (évite N×5 queries série)
    const [
      locationMappings,          // step1 : integrationId → spaceId
      shopMappedIntegrationIds,  // step2 (BUG-017/029 : source unique, cf. plus bas)
      productMappingsCount,      // step3
      aggJobs,                   // step4 — completed jobs per spaceId
      pastEvents,                // step4 — past events per spaceId
      revenueAggs,               // step5
    ] = await Promise.all([
      // step1 : WeezeventLocationSpaceMapping.weezeventLocationId = integrationId (convention step1)
      this.prisma.locationSpaceMapping.findMany({
        where: { tenantId, salesLocationId: { in: integrationIds } },
        select: { salesLocationId: true, spaceId: true },
      }),
      this.getShopMappedIntegrationIds(tenantId, integrationIds),
      this.prisma.productMapping.count({ where: { tenantId } }),
      this.prisma.aggregationJobLog.groupBy({
        by: ['spaceId'],
        where: { tenantId, status: 'completed' },
        _count: true,
      }),
      countEndedEventsBySpace(this.prisma, { tenantId }),
      this.prisma.spaceRevenueMinuteAgg.groupBy({
        by: ['spaceId'],
        where: { tenantId },
        _count: true,
      }),
    ]);

    // Index en Maps pour lookups O(1)
    const integSpaceMap = new Map(locationMappings.map((m) => [m.salesLocationId, m.spaceId]));
    const aggJobCountBySpace = new Map(aggJobs.filter((j) => j.spaceId).map((j) => [j.spaceId as string, j._count]));
    const pastEventCountBySpace = pastEvents;
    const revenueBySpace = new Set(revenueAggs.map((r) => r.spaceId).filter(Boolean));

    // 3. Calcul par intégration
    const data = integrations.map((integ) => {
      // step1 : l'intégration est-elle liée à un espace ?
      const spaceId = integSpaceMap.get(integ.id) ?? null;
      const step1 = !!spaceId;

      // step2 : au moins un point de vente (location ou merchant) mappé à un SpaceElement ?
      const step2 = shopMappedIntegrationIds.has(integ.id);

      // step3 : global au tenant (pas par intégration)
      const step3 = productMappingsCount > 0;

      const pastEvtCount = (spaceId && pastEventCountBySpace.get(spaceId)) || 0;
      const completedJobCount = (spaceId && aggJobCountBySpace.get(spaceId)) || 0;
      const step4 = pastEvtCount > 0 && completedJobCount >= pastEvtCount;
      const step5 = !!spaceId && revenueBySpace.has(spaceId);

      const completedSteps = [step1, step2, step3, step4, step5].filter(Boolean).length;

      return {
        weezeventLocationId: integ.id, // compatibilité frontend : le wizard identifie les intégrations par leur id
        name: integ.name,
        spaceId,
        steps: {
          step1_space_mapped: step1,
          step2_shops_mapped: step2,
          step3_menu_mapped: step3,
          step4_events_processed: step4,
          step5_synchronized: step5,
        },
        completedSteps,
        totalSteps: 5,
      };
    });

    return {
      data,
      meta: {
        total: data.length,
        fullyConfigured: data.filter((d) => d.completedSteps === 5).length,
        partiallyConfigured: data.filter((d) => d.completedSteps > 0 && d.completedSteps < 5).length,
        notStarted: data.filter((d) => d.completedSteps === 0).length,
      },
    };
  }

  /**
   * Résumé post-sync pour une location : counts utiles à l'écran WizardSuccess.
   */
  async getLocationSummary(tenantId: string, weezeventLocationId: string) {
    const locationMapping = await this.prisma.locationSpaceMapping.findUnique({
      where: { tenantId_salesLocationId: { tenantId, salesLocationId: weezeventLocationId } },
    });
    if (!locationMapping) {
      throw new NotFoundException(`Location ${weezeventLocationId} not mapped to a space`);
    }

    const [merchantIds, merchantMappings, productMappings, totalProducts, eventsCount] = await Promise.all([
      findDistinctMerchantIds(this.prisma, { tenantId, locationId: weezeventLocationId }),
      this.prisma.locationShopMapping.count({ where: { tenantId } }),
      this.prisma.productMapping.count({ where: { tenantId } }),
      this.prisma.salesProduct.count({ where: { tenantId } }),
      this.prisma.aggregationJobLog.count({
        where: { tenantId, spaceId: locationMapping.spaceId, status: 'completed' },
      }),
    ]);

    return {
      weezeventLocationId,
      spaceId: locationMapping.spaceId,
      merchants: {
        total: merchantIds.length,
        mapped: merchantMappings,
      },
      products: {
        total: totalProducts,
        mapped: productMappings,
      },
      events: {
        processed: eventsCount,
      },
    };
  }
}
