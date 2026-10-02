import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Prisma } from '@prisma/client';
import { Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../core/database/prisma.service';
import { QueueService } from '../../../core/queue/queue.service';
import { QUEUES } from '../../../core/queue/queue.constants';
import { MenuItemPricingService } from '../../../shared/pricing/menu-item-pricing.service';
import { SpaceAccessService } from '../../../core/auth/space-access.service';
import { SimulateSaleLineDto } from '../dto/logistics.dto';
import { StartSimulationRunDto } from '../dto/simulation-run.dto';
import { LogisticsElementScopeService } from './logistics-element-scope.service';
import { RecipeExplosionService } from './recipe-explosion.service';
import { SimulationTickJobData, SalesRawRow, SHOP_TYPES } from '../logistics.types';

/**
 * Simulation de ventes (outil QA, 11_LIVE.md) : vente simulée, purge, runs d'auto-simulation.
 * Écrit des SalesTransaction : distinct de la logistique proprement dite.
 */
@Injectable()
export class SalesSimulationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
    @InjectQueue(QUEUES.SIMULATION) private readonly simulationQueue: Queue<SimulationTickJobData>,
    private readonly pricingService: MenuItemPricingService,
    private readonly spaceAccess: SpaceAccessService,
    private readonly logisticsElementScopeService: LogisticsElementScopeService,
    private readonly recipeExplosionService: RecipeExplosionService,
  ) {}

  private readonly logger = new Logger(SalesSimulationService.name);

  // \u2500\u2500\u2500 Simulation de vente (QA / tests logistique) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

  /**
   * Simule une vente Weezevent : cr\u00E9e une WeezeventTransaction + ses
   * WeezeventTransactionItem synth\u00E9tiques dans les m\u00EAmes tables que le pipeline
   * r\u00E9el (donc lues par getStock/deriveSalesRaw exactement comme une vraie vente),
   * marqu\u00E9es `metadata.isSimulated=true`. N\u00E9cessite que le PDV et chaque menu item
   * soient d\u00E9j\u00E0 mapp\u00E9s \u00E0 Weezevent (WeezeventLocationShopMapping /
   * WeezeventProductMapping) \u2014 sinon une vraie vente ne serait pas compt\u00E9e non
   * plus, donc rien \u00E0 simuler.
   * \u26A0\uFE0F Non filtr\u00E9e des autres endpoints (dashboards revenus/analytics) : purger
   * via purgeSimulatedSales une fois le test termin\u00E9.
   */
  async simulateSale(
    spaceId: string,
    elementId: string,
    lines: SimulateSaleLineDto[],
    tenantId: string,
    userId?: string,
    realMode = false,
    ensureLiveEvent = false,
    simulationRunId?: string,
  ) {
    if (!lines?.length) throw new BadRequestException('Aucune ligne \u00E0 simuler');
    const element = await this.logisticsElementScopeService.getElementOrThrow(elementId, tenantId);
    if (element.spaceId !== spaceId) {
      throw new BadRequestException(`Element ${elementId} n'appartient pas \u00E0 l'espace ${spaceId}`);
    }

    const shopMapping = await this.prisma.locationShopMapping.findFirst({
      where: { tenantId, spaceElementId: elementId },
    });
    if (!shopMapping) {
      throw new BadRequestException(`"${element.name}" n'est rattach\u00E9 \u00E0 aucune location Weezevent \u2014 vente non simulable.`);
    }
    const location = await this.prisma.salesLocation.findFirst({
      where: { tenantId, OR: [{ id: shopMapping.salesLocationId }, { externalId: shopMapping.salesLocationId }] },
    });
    if (!location) {
      throw new BadRequestException(`Location Weezevent introuvable pour "${element.name}".`);
    }

    // Sans ça, la vente reste rattachée au SalesEvent déjà stocké sur la location — sur
    // un tenant de test, souvent un event réel synchronisé il y a des mois : rien ne
    // s'affiche jamais sous "Aujourd'hui" (toute la chaîne d'agrégation/affichage pivote
    // sur Event.eventDate, jamais sur SalesLocation.eventId directement). `ensureLiveEvent`
    // crée/réutilise un Event+SalesEvent datés aujourd'hui pour que le test soit visible.
    const salesEventId = ensureLiveEvent
      ? await this.ensureTodaySalesEvent(tenantId, location, spaceId, element)
      : location.eventId;

    const menuItemIds = [...new Set(lines.map((l) => l.menuItemId))];
    // ProductMapping reste n\u00E9cessaire pour attribuer la vente \u00E0 un produit Weezevent
    // (reporting/corr\u00E9lation), MAIS le PRIX factur\u00E9 vient d\u00E9sormais du catalogue
    // DataFriday de l'ESPACE courant (SpaceMenuItem.priceTtc \u2192 MenuItem.basePrice),
    // pas de SalesProduct.basePrice. Raison : un menu item peut \u00EAtre mapp\u00E9 \u00E0 PLUSIEURS
    // produits Weezevent (sch\u00E9ma : @@unique([salesProductId]) seulement, aucune
    // contrainte sur menuItemId) \u2014 un doublon de mapping vers un produit au prix
    // incomplet (basePrice null) rendait la vente simul\u00E9e silencieusement gratuite,
    // alors que le prix catalogue DataFriday, lui, est toujours la source unique et
    // fiable (menu-item-pricing.service.ts). Le prix de vente r\u00E9el (webhook Weezevent)
    // n'est PAS concern\u00E9 : il porte son propre prix, ind\u00E9pendant de cette r\u00E9solution.
    const [menuItems, spaceMenuItems, productMappings, tenantDefaultVatRate] = await Promise.all([
      this.prisma.menuItem.findMany({
        where: { id: { in: menuItemIds }, tenantId, deletedAt: null },
        select: { id: true, name: true, basePrice: true, vatRate: true },
      }),
      this.prisma.spaceMenuItem.findMany({ where: { spaceId, menuItemId: { in: menuItemIds } } }),
      this.prisma.productMapping.findMany({ where: { tenantId, menuItemId: { in: menuItemIds } } }),
      this.pricingService.getTenantDefaultVatRate(tenantId),
    ]);
    const menuItemById = new Map(menuItems.map((m) => [m.id, m]));
    const spaceOverrideById = new Map(spaceMenuItems.map((s) => [s.menuItemId, s]));
    const mappingByMenuItemId = new Map(productMappings.map((m) => [m.menuItemId, m]));
    const missing = menuItemIds.filter((id) => !mappingByMenuItemId.has(id));
    if (missing.length) {
      const names = missing.map((id) => menuItemById.get(id)?.name ?? id).join(', ');
      throw new BadRequestException(`Non mapp\u00E9 \u00E0 un produit Weezevent : ${names}. Vente non simulable pour ces menu items.`);
    }
    const productIds = [...new Set(productMappings.map((m) => m.salesProductId))];
    const products = await this.prisma.salesProduct.findMany({ where: { id: { in: productIds } } });
    const productById = new Map(products.map((p) => [p.id, p]));

    const transactionDate = new Date();
    const itemsData = lines.map((line) => {
      const menuItem = menuItemById.get(line.menuItemId);
      const mapping = mappingByMenuItemId.get(line.menuItemId)!;
      const product = productById.get(mapping.salesProductId);
      const spaceOverride = spaceOverrideById.get(line.menuItemId);
      const unitPrice = spaceOverride?.priceTtc ?? menuItem?.basePrice ?? new Prisma.Decimal(0);
      const vat = spaceOverride?.vatRate ?? menuItem?.vatRate ?? tenantDefaultVatRate ?? 0;
      return {
        menuItemId: line.menuItemId,
        productId: mapping.salesProductId,
        productName: menuItem?.name ?? product?.name ?? null,
        quantity: line.quantity,
        unitPrice,
        vat,
        rawData: { simulated: true },
      };
    });
    const amount = itemsData.reduce((sum, it) => sum + Number(it.unitPrice) * it.quantity, 0);

    // Calcule la consommation AVANT d'écrire quoi que ce soit : si le résultat ne
    // peut pas être correctement reflété sur le stock (pack size manquante/invalide
    // et vrac insuffisant pour absorber la vente), on refuse la vente plutôt que de
    // créer une transaction dont l'effet réel serait silencieusement clampé à 0
    // (cf. normalizeLevel) — un « succès » trompeur.
    const raw: SalesRawRow[] = lines.map((line) => ({
      elementId,
      menuItemId: line.menuItemId,
      eventId: salesEventId,
      eventName: null,
      qty: line.quantity,
      lastAt: transactionDate,
    }));
    const consumptionPreview = await this.recipeExplosionService.explodeSalesToConsumption(raw, tenantId);
    const problems = await this.checkConsumptionFeasibility(tenantId, elementId, consumptionPreview);
    // Mode réel : se comporte comme le pipeline webhook, qui n'a jamais ce garde-fou —
    // la vente est enregistrée quoi qu'il arrive, quitte à ce que normalizeLevel clampe
    // silencieusement le stock mal configuré à 0 (comportement réel, pas un bug).
    if (!realMode && problems.length) {
      throw new BadRequestException(`Vente non simulable — configuration de stock incomplète : ${problems.join(' ; ')}`);
    }

    const transaction = await this.prisma.salesTransaction.create({
      data: {
        externalId: `SIM-${randomUUID()}`,
        tenantId,
        integrationId: location.integrationId,
        // Sans ce champ explicite, Prisma applique le défaut du schéma (WEEZEVENT)
        // même si `location` est en réalité une location Digifood — la transaction
        // simulée porterait alors un tag faux. `location.provider` est déjà fiable
        // (posé explicitement à l'ingestion réelle, cf. digifood-ingestion.service.ts).
        provider: location.provider,
        amount,
        status: 'V',
        transactionDate,
        eventId: salesEventId,
        locationId: location.id,
        locationName: location.name,
        metadata: {
          isSimulated: true,
          simulatedByUserId: userId ?? null,
          simulatedElementId: elementId,
          ...(simulationRunId ? { simulationRunId } : {}),
        },
        rawData: { simulated: true },
        items: {
          create: itemsData.map(({ menuItemId: _menuItemId, ...data }) => data),
        },
      },
      include: { items: true },
    });

    // Best-effort, miroir du chemin webhook réel (WebhookEventHandler.triggerLiveAggregation) :
    // sans ça, une vente simulée n'avance jamais Shop Performance/POS Performance/Event
    // Revenue by Shop (alimentés par SpaceRevenueMinuteAgg, pas par la transaction brute),
    // sauf rattrapage par le cron 5 min ET seulement si un Event DataFriday est actif.
    // Ne doit jamais faire échouer simulateSale : la transaction est déjà committée.
    try {
      await this.triggerLiveAggregationForEvent(tenantId, location.integrationId, salesEventId);
    } catch (e: any) {
      this.logger.warn(`[simulateSale] agrégation live non déclenchée : ${e?.message}`);
    }

    return {
      transactionId: transaction.id,
      elementId,
      elementName: element.name,
      items: itemsData.map((it) => ({ menuItemId: it.menuItemId, productName: it.productName, quantity: it.quantity })),
      consumptionPreview,
    };
  }

  /**
   * Rattache une vente simulée à un Event/SalesEvent datés AUJOURD'HUI plutôt qu'au
   * `SalesEvent` déjà stocké sur `SalesLocation.eventId` (souvent un event réel synchronisé
   * il y a des mois sur un tenant de test). Toute la chaîne d'agrégation/affichage
   * (`getLiveStatus`, `triggerLiveAggregationForEvent`, `AggregationService`,
   * `getEventTimelineBatch`, et le getter front `filteredEvents`) pivote sur
   * `Event.eventDate` (DataFriday) — jamais sur `SalesLocation.eventId` directement. Sans
   * ce rattachement explicite, une vente simulée ne s'affiche jamais sous "Aujourd'hui".
   * Idempotent : réutilise l'Event/SalesEvent du jour s'il en existe déjà un pour cet
   * espace (pas de duplication à chaque vente simulée le même jour). Tagué
   * `metadata.isSimulated=true` côté SalesEvent et `isSimulated=true` + nom `[Simulé] ...`
   * côté Event, pour rester identifiable/purgeable (cf. purgeSimulatedSales) et pour être
   * exclu d'EventPredict / de l'écran Live (GET /events?excludeSimulated=true).
   */
  private async ensureTodaySalesEvent(
    tenantId: string,
    location: { integrationId: string },
    spaceId: string,
    element: { name: string },
  ): Promise<string> {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    const label = `[Simulé] ${element.name} — ${todayStart.toISOString().slice(0, 10)}`;

    // 1. Event DataFriday du jour déjà lié à un SalesEvent pour cet espace → réutiliser tel quel.
    const existingLinkedEvent = await this.prisma.event.findFirst({
      where: { tenantId, spaceId, eventDate: { gte: todayStart, lt: tomorrowStart }, weezeventEventId: { not: null } },
      select: { weezeventEventId: true },
    });
    if (existingLinkedEvent?.weezeventEventId) return existingLinkedEvent.weezeventEventId;

    // 2. SalesEvent du jour pour cette intégration → réutiliser, sinon créer.
    let salesEvent = await this.prisma.salesEvent.findFirst({
      where: { tenantId, integrationId: location.integrationId, startDate: { gte: todayStart, lt: tomorrowStart } },
      select: { id: true },
    });
    if (!salesEvent) {
      salesEvent = await this.prisma.salesEvent.create({
        data: {
          externalId: `SIM-EVT-${randomUUID()}`,
          tenantId,
          integrationId: location.integrationId,
          name: label,
          organizationId: 'simulated',
          startDate: now,
          metadata: { isSimulated: true },
          rawData: { simulated: true },
        },
        select: { id: true },
      });
    }

    // 3. Event DataFriday du jour pour cet espace → réutiliser (et lier si besoin), sinon créer.
    const existingEvent = await this.prisma.event.findFirst({
      where: { tenantId, spaceId, eventDate: { gte: todayStart, lt: tomorrowStart } },
      select: { id: true, weezeventEventId: true },
    });
    if (existingEvent) {
      if (!existingEvent.weezeventEventId) {
        await this.prisma.event.update({ where: { id: existingEvent.id }, data: { weezeventEventId: salesEvent.id } });
      }
    } else {
      // `isSimulated` UNIQUEMENT sur la branche de création : les branches de
      // réutilisation ci-dessus (et le retour anticipé §1) peuvent pointer sur un
      // VRAI event du jour — le flaguer le masquerait d'EventPredict/Live.
      await this.prisma.event.create({
        data: { name: label, eventDate: now, spaceId, tenantId, weezeventEventId: salesEvent.id, isSimulated: true },
      });
    }

    return salesEvent.id;
  }

  /**
   * Miroir de WebhookEventHandler.triggerLiveAggregation
   * (weezevent/services/webhook-event.handler.ts:179-215) — dupliqué plutôt que
   * partagé pour éviter un cycle de modules (LogisticsModule est importé par
   * SpacesModule, qui est dans la chaîne de dépendance d'AggregationModule via
   * MappingsModule → SpacesModule ; même raison documentée côté weezevent).
   * No-op silencieux si `weezeventEventId` est vide ou ne résout à aucun Event
   * DataFriday scopé à un space (BUG-021 disambiguation) — reflète fidèlement ce
   * qu'un vrai webhook ferait dans ce cas.
   */
  private async triggerLiveAggregationForEvent(
    tenantId: string,
    integrationId: string,
    weezeventEventId: string | null,
  ): Promise<void> {
    if (!weezeventEventId) return;
    const dfEvent = await this.prisma.event.findFirst({
      where: { tenantId, weezeventEventId, spaceId: { not: null } },
      select: { id: true, spaceId: true, eventDate: true },
    });
    if (!dfEvent?.spaceId) return;

    const jobLog = await this.prisma.aggregationJobLog.create({
      data: {
        tenantId,
        spaceId: dfEvent.spaceId,
        jobType: 'incremental',
        status: 'pending',
        fromDate: dfEvent.eventDate,
        toDate: dfEvent.eventDate,
        metadata: { eventIds: [dfEvent.id], trigger: 'simulate-sale' },
      },
    });
    await this.queueService.queueAggregationJob({
      type: 'process-events',
      tenantId,
      spaceId: dfEvent.spaceId,
      jobLogId: jobLog.id,
      eventIds: [dfEvent.id],
      integrationId,
    });
  }

  /**
   * Une ligne de consommation est « impossible à refléter » si elle ferait passer
   * le vrac sous 0 sans pouvoir emprunter un pack entier (unitsPerPack manquant/0
   * sur le StockLevel suivi, ou à défaut sur le Market Price du référentiel, ou
   * pas assez de packs en stock) — cf. `normalizeLevel` qui clampe alors
   * silencieusement à 0 sans que la vente soit réellement reflétée.
   */
  private async checkConsumptionFeasibility(
    tenantId: string,
    elementId: string,
    consumption: Array<{ itemKey: string; quantity: number }>,
  ): Promise<string[]> {
    if (!consumption.length) return [];
    const itemKeys = [...new Set(consumption.map((c) => c.itemKey))];
    const [levels, marketPrices] = await Promise.all([
      this.prisma.stockLevel.findMany({ where: { tenantId, elementId, itemKey: { in: itemKeys } } }),
      this.prisma.marketPrice.findMany({
        where: { tenantId, deletedAt: null, itemName: { in: itemKeys, mode: 'insensitive' } },
        select: { itemName: true, packedUnits: true },
        // Tri déterministe (BUG-133-02) : plusieurs Market Price peuvent partager
        // un itemName, "dernier gagne" ci-dessous doit pointer vers la même ligne
        // à chaque appel plutôt qu'un ordre Postgres arbitraire.
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    const levelByKey = new Map(levels.map((l) => [l.itemKey, l]));
    const uppByName = new Map(marketPrices.map((m) => [m.itemName.trim().toLowerCase(), m.packedUnits]));

    const problems: string[] = [];
    for (const c of consumption) {
      const level = levelByKey.get(c.itemKey);
      const currentPacked = level?.packedUnits ?? 0;
      const currentLoose = level?.looseUnits ?? 0;
      const upp =
        level?.unitsPerPack && level.unitsPerPack > 0
          ? level.unitsPerPack
          : (uppByName.get(c.itemKey.trim().toLowerCase()) ?? null);
      const nextLoose = currentLoose - c.quantity;
      if (nextLoose < -1e-9) {
        const canBorrow = !!upp && upp > 0 && currentPacked >= Math.ceil((-nextLoose - 1e-9) / upp);
        if (!canBorrow) {
          problems.push(
            `"${c.itemKey}" (stock ${currentPacked} pack × ${upp ?? '?'} + ${currentLoose} vrac, insuffisant pour -${c.quantity} — taille de pack Market Price manquante ou invalide)`,
          );
        }
      }
    }
    return problems;
  }

  /**
   * Purge les ventes simul\u00E9es (`metadata.isSimulated=true`) d'un PDV \u2014 nettoyage
   * post-test. Cascade sur WeezeventTransactionItem (onDelete: Cascade).
   */
  async purgeSimulatedSales(spaceId: string, elementId: string, tenantId: string) {
    const element = await this.logisticsElementScopeService.getElementOrThrow(elementId, tenantId);
    if (element.spaceId !== spaceId) {
      throw new BadRequestException(`Element ${elementId} n'appartient pas \u00E0 l'espace ${spaceId}`);
    }
    const shopMapping = await this.prisma.locationShopMapping.findFirst({
      where: { tenantId, spaceElementId: elementId },
    });
    if (!shopMapping) return { deletedCount: 0, deletedEventCount: 0 };
    const location = await this.prisma.salesLocation.findFirst({
      where: { tenantId, OR: [{ id: shopMapping.salesLocationId }, { externalId: shopMapping.salesLocationId }] },
      select: { id: true },
    });
    if (!location) return { deletedCount: 0, deletedEventCount: 0 };

    // Capture les SalesEvent concern\u00E9s AVANT suppression, pour pouvoir nettoyer ceux
    // cr\u00E9\u00E9s par ensureTodaySalesEvent qui ne servent plus \u00E0 rien apr\u00E8s ce purge.
    const toDelete = await this.prisma.salesTransaction.findMany({
      where: { tenantId, locationId: location.id, metadata: { path: ['isSimulated'], equals: true } },
      select: { eventId: true },
    });
    const candidateEventIds = [...new Set(toDelete.map((t) => t.eventId).filter((id): id is string => !!id))];

    const { count } = await this.prisma.salesTransaction.deleteMany({
      where: {
        tenantId,
        locationId: location.id,
        metadata: { path: ['isSimulated'], equals: true },
      },
    });

    const deletedEventCount = await this.cleanupOrphanedSimulatedSalesEvents(tenantId, candidateEventIds);
    return { deletedCount: count, deletedEventCount };
  }

  /**
   * Nettoie les SalesEvent cr\u00E9\u00E9s par `ensureTodaySalesEvent` (`metadata.isSimulated`) qui ne
   * sont plus r\u00E9f\u00E9renc\u00E9s par AUCUNE transaction (simul\u00E9e ou r\u00E9elle) apr\u00E8s une purge \u2014 jamais
   * un event r\u00E9el. Extrait de `purgeSimulatedSales` pour \u00EAtre partag\u00E9 avec `purgeSimulatedSalesByIds`.
   */
  private async cleanupOrphanedSimulatedSalesEvents(tenantId: string, candidateEventIds: string[]): Promise<number> {
    let deletedEventCount = 0;
    for (const salesEventId of candidateEventIds) {
      const salesEvent = await this.prisma.salesEvent.findUnique({
        where: { id: salesEventId },
        select: { id: true, metadata: true },
      });
      if (!(salesEvent?.metadata as any)?.isSimulated) continue;

      const remaining = await this.prisma.salesTransaction.count({ where: { tenantId, eventId: salesEventId } });
      if (remaining > 0) continue;

      const dfEvent = await this.prisma.event.findFirst({
        where: { tenantId, weezeventEventId: salesEventId },
        select: { id: true, spaceId: true },
      });
      if (dfEvent) {
        await this.prisma.spaceRevenueMinuteAgg.deleteMany({
          where: { tenantId, spaceId: dfEvent.spaceId ?? undefined, weezeventEventId: dfEvent.id },
        });
        await this.prisma.event.delete({ where: { id: dfEvent.id } });
      }
      await this.prisma.salesEvent.delete({ where: { id: salesEventId } });
      deletedEventCount++;
    }
    return deletedEventCount;
  }

  /**
   * Liste pagin\u00E9e (curseur) des ventes simul\u00E9es d'un espace, tous PDV confondus \u2014 QA
   * (11_LIVE.md, LiveSimulationHistoryDialog.vue). M\u00EAme cha\u00EEne de jointure que
   * `simulateSale`/`purgeSimulatedSales` (LocationShopMapping \u2192 SalesLocation), \u00E9largie \u00E0
   * TOUS les PDV de l'espace au lieu d'un seul.
   */
  async listSimulatedSales(spaceId: string, tenantId: string, limit = 50, cursor?: string) {
    await this.spaceAccess.assertSpaceAccessible(spaceId, tenantId);
    const elements = await this.prisma.spaceElement.findMany({
      where: { ...this.logisticsElementScopeService.spaceElementScopeWhere(spaceId, tenantId), type: { in: SHOP_TYPES } } as any,
      select: { id: true, name: true },
    });
    if (!elements.length) return { items: [], nextCursor: null };
    const nameById = new Map(elements.map((e) => [e.id, e.name]));

    const mappings = await this.prisma.locationShopMapping.findMany({
      where: { tenantId, spaceElementId: { in: elements.map((e) => e.id) } },
      select: { salesLocationId: true },
    });
    if (!mappings.length) return { items: [], nextCursor: null };
    const salesLocationIds = [...new Set(mappings.map((m) => m.salesLocationId))];
    const locations = await this.prisma.salesLocation.findMany({
      where: { tenantId, OR: [{ id: { in: salesLocationIds } }, { externalId: { in: salesLocationIds } }] },
      select: { id: true },
    });
    if (!locations.length) return { items: [], nextCursor: null };
    const locationIds = locations.map((l) => l.id);

    const rows = await this.prisma.salesTransaction.findMany({
      where: { tenantId, locationId: { in: locationIds }, metadata: { path: ['isSimulated'], equals: true } },
      orderBy: { transactionDate: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { items: true },
    });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    return {
      items: page.map((t) => ({
        id: t.id,
        elementId: (t.metadata as any)?.simulatedElementId ?? null,
        elementName: nameById.get((t.metadata as any)?.simulatedElementId) ?? null,
        runId: (t.metadata as any)?.simulationRunId ?? null,
        amount: t.amount,
        transactionDate: t.transactionDate,
        items: t.items.map((i) => ({ productId: i.productId, productName: i.productName, quantity: i.quantity })),
      })),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }

  /**
   * Purge s\u00E9lective par ids de transaction (QA, history dialog) \u2014 contrairement \u00E0
   * `purgeSimulatedSales` (tout un PDV d'un coup), permet de ne retirer que les lignes
   * coch\u00E9es. V\u00E9rifie que chaque id appartient bien \u00E0 un PDV de CET espace/tenant avant
   * suppression \u2014 un id forg\u00E9 d'un autre espace/tenant ne peut rien purger.
   */
  async purgeSimulatedSalesByIds(spaceId: string, tenantId: string, transactionIds: string[]) {
    await this.spaceAccess.assertSpaceAccessible(spaceId, tenantId);
    if (!transactionIds?.length) return { deletedCount: 0, deletedEventCount: 0 };
    const elements = await this.prisma.spaceElement.findMany({
      where: { ...this.logisticsElementScopeService.spaceElementScopeWhere(spaceId, tenantId), type: { in: SHOP_TYPES } } as any,
      select: { id: true },
    });
    const elementIds = new Set(elements.map((e) => e.id));
    const rows = await this.prisma.salesTransaction.findMany({
      where: { id: { in: transactionIds }, tenantId, metadata: { path: ['isSimulated'], equals: true } },
      select: { id: true, eventId: true, metadata: true },
    });
    const allowed = rows.filter((r) => elementIds.has((r.metadata as any)?.simulatedElementId));
    if (!allowed.length) return { deletedCount: 0, deletedEventCount: 0 };
    const candidateEventIds = [...new Set(allowed.map((r) => r.eventId).filter((id): id is string => !!id))];
    const { count } = await this.prisma.salesTransaction.deleteMany({ where: { id: { in: allowed.map((r) => r.id) } } });
    const deletedEventCount = await this.cleanupOrphanedSimulatedSalesEvents(tenantId, candidateEventIds);
    return { deletedCount: count, deletedEventCount };
  }

  // \u2500\u2500\u2500 Runs d'auto-simulation (QA, server-side, BullMQ Job Scheduler) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

  /** Idempotent : un run d\u00E9j\u00E0 actif pour cet espace est renvoy\u00E9 tel quel, pas de doublon. */
  async startSimulationRun(spaceId: string, tenantId: string, userId: string, dto: StartSimulationRunDto) {
    await this.spaceAccess.assertSpaceAccessible(spaceId, tenantId);
    const existing = await this.prisma.simulationRun.findFirst({ where: { tenantId, spaceId, status: 'active' } });
    if (existing) return existing;
    const run = await this.prisma.simulationRun.create({
      data: {
        tenantId,
        spaceId,
        intervalMs: dto.intervalMs,
        realMode: dto.realMode ?? true,
        configId: dto.configId ?? null,
        status: 'active',
        startedByUserId: userId,
      },
    });
    await this.simulationQueue.upsertJobScheduler(
      run.id,
      { every: dto.intervalMs },
      { name: 'simulation-tick', data: { runId: run.id } },
    );
    return run;
  }

  async stopSimulationRun(spaceId: string, runId: string, tenantId: string, userId: string) {
    await this.spaceAccess.assertSpaceAccessible(spaceId, tenantId);
    const run = await this.prisma.simulationRun.findFirst({ where: { id: runId, tenantId, spaceId } });
    if (!run) throw new NotFoundException(`Run ${runId} introuvable`);
    if (run.status === 'active') {
      await this.simulationQueue.removeJobScheduler(run.id).catch(() => {});
      await this.prisma.simulationRun.update({
        where: { id: run.id },
        data: { status: 'stopped', stoppedAt: new Date(), stoppedByUserId: userId },
      });
    }
    return this.prisma.simulationRun.findUnique({ where: { id: run.id } });
  }

  async getActiveSimulationRun(spaceId: string, tenantId: string) {
    await this.spaceAccess.assertSpaceAccessible(spaceId, tenantId);
    return this.prisma.simulationRun.findFirst({ where: { tenantId, spaceId, status: 'active' } });
  }

  async listSimulationRuns(spaceId: string, tenantId: string, limit = 20) {
    await this.spaceAccess.assertSpaceAccessible(spaceId, tenantId);
    return this.prisma.simulationRun.findMany({
      where: { tenantId, spaceId },
      orderBy: { startedAt: 'desc' },
      take: limit,
    });
  }
}
