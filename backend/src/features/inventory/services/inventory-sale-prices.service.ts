import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { SpaceAccessService } from '../../../core/auth/space-access.service';
import {
  ItemSalePrice,
  SalePriceMarketPrice,
  SalePriceRecipeLine,
  SaleTotals,
  catalogPriceHt,
  computeSalePrices,
  eventSalesDayWindow,
} from '../inventory-sale-prices.util';

export interface EventSalePricesResponse {
  eventId: string;
  /** Jours calendaires (YYYY-MM-DD, inclus) lus dans l'agregat journalier de ventes. */
  window: { from: string; to: string };
  prices: ItemSalePrice[];
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Prix de vente HT unitaire des articles comptes d'un event (lecture seule). Charge les lignes,
 * le calcul vit dans `inventory-sale-prices.util`.
 */
@Injectable()
export class InventorySalePricesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly spaceAccess: SpaceAccessService,
  ) {}

  async getEventSalePrices(spaceId: string, eventId: string, tenantId: string): Promise<EventSalePricesResponse> {
    await this.spaceAccess.assertSpaceInTenant(spaceId, tenantId);
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, spaceId, tenantId },
      select: { id: true, eventDate: true, eventStartDate: true, eventEndDate: true, integrationId: true },
    });
    if (!event) throw new NotFoundException(`Event ${eventId} not found in space ${spaceId}`);

    const win = eventSalesDayWindow(event);
    const window = { from: isoDay(win.from), to: isoDay(win.to) };

    const counts = await this.prisma.inventoryCount.findMany({
      where: { tenantId, spaceId, eventId, isCounted: true },
      select: { itemId: true },
      distinct: ['itemId'],
    });
    const itemIds = counts.map((c) => c.itemId);
    if (!itemIds.length) return { eventId, window, prices: [] };

    const [menuItems, marketPriceRows, components, ingredientLinks] = await Promise.all([
      this.prisma.menuItem.findMany({
        where: { tenantId, id: { in: itemIds }, deletedAt: null },
        select: { id: true, basePrice: true, vatRate: true },
      }),
      this.prisma.marketPrice.findMany({
        where: { tenantId, id: { in: itemIds } },
        select: { id: true, unit: true, recipeUnit: true, purchaseUnitConversion: true },
      }),
      this.prisma.menuComponent.findMany({ where: { tenantId, id: { in: itemIds } }, select: { id: true } }),
      // Plats dont la recette utilise un ingredient du lot (index MenuItemIngredient.ingredientId).
      this.prisma.menuItemIngredient.findMany({
        where: { ingredient: { tenantId, marketPriceId: { in: itemIds } }, menuItem: { tenantId, deletedAt: null } },
        select: { menuItemId: true },
      }),
    ]);
    const menuItemIds = new Set(menuItems.map((m) => m.id));
    const marketPrices = new Map<string, SalePriceMarketPrice>(
      marketPriceRows
        .filter((m) => !menuItemIds.has(m.id))
        .map((m) => [
          m.id,
          { id: m.id, unit: m.unit, recipeUnit: m.recipeUnit, purchaseUnitConversion: m.purchaseUnitConversion },
        ]),
    );
    const usingMenuIds = [...new Set(ingredientLinks.map((l) => l.menuItemId))];

    // Toutes les lignes de ces recettes : necessaire pour savoir si la recette est mono-ligne.
    const lineRows = usingMenuIds.length
      ? await this.prisma.menuItemIngredient.findMany({
          where: { menuItemId: { in: usingMenuIds } },
          select: { menuItemId: true, numberOfUnits: true, ingredient: { select: { marketPriceId: true } } },
        })
      : [];
    const recipeLines: SalePriceRecipeLine[] = lineRows.map((l) => ({
      menuItemId: l.menuItemId,
      marketPriceId: l.ingredient?.marketPriceId ?? null,
      numberOfUnits: Number(l.numberOfUnits),
    }));

    // Plats concernes : comptes tels quels + plats a recette mono-ligne (seuls utiles aux ingredients).
    const relevantMenuIds = [...new Set([...menuItemIds, ...usingMenuIds])];
    const [salesByMenuItem, catalog] = await Promise.all([
      this.loadSalesByMenuItem(spaceId, tenantId, relevantMenuIds, win, event.integrationId),
      this.loadCatalogPriceHt(spaceId, tenantId, relevantMenuIds, new Map(menuItems.map((m) => [m.id, m]))),
    ]);

    const prices = computeSalePrices({
      itemIds,
      menuItemIds,
      marketPrices,
      componentIds: new Set(components.map((c) => c.id)),
      salesByMenuItem,
      catalogPriceHtByMenuItem: catalog,
      recipeLines,
    });
    return { eventId, window, prices };
  }

  /**
   * CA HT et quantites par plat sur les jours de l'event : SpaceProductRevenueDailyAgg
   * (index tenant/space/day, filtre integration quand l'event en a une, BUG-378-02) puis
   * rattachement produit Weezevent vers plat par WeezeventProductMapping.
   */
  private async loadSalesByMenuItem(
    spaceId: string,
    tenantId: string,
    menuItemIds: string[],
    win: { from: Date; to: Date; tooWide: boolean },
    integrationId: string | null,
  ): Promise<Map<string, SaleTotals>> {
    const out = new Map<string, SaleTotals>();
    if (win.tooWide || !menuItemIds.length) return out;
    const mappings = await this.prisma.productMapping.findMany({
      where: { tenantId, menuItemId: { in: menuItemIds } },
      select: { salesProductId: true, menuItemId: true },
    });
    if (!mappings.length) return out;
    const menuByProduct = new Map(mappings.map((m) => [m.salesProductId, m.menuItemId]));
    const rows = await this.prisma.spaceProductRevenueDailyAgg.groupBy({
      by: ['weezeventProductId'],
      where: {
        tenantId,
        spaceId,
        day: { gte: win.from, lte: win.to },
        weezeventProductId: { in: [...menuByProduct.keys()] },
        ...(integrationId ? { integrationId } : {}),
      },
      _sum: { revenueHt: true, quantity: true },
    });
    for (const r of rows) {
      const menuItemId = menuByProduct.get(r.weezeventProductId);
      if (!menuItemId) continue;
      const cur = out.get(menuItemId) ?? { revenueHt: 0, quantity: 0 };
      cur.revenueHt += Number(r._sum.revenueHt ?? 0);
      cur.quantity += Number(r._sum.quantity ?? 0);
      out.set(menuItemId, cur);
    }
    return out;
  }

  /** Prix catalogue HT de l'espace : SpaceMenuItem (TTC, TVA) avec repli MenuItem (basePrice, vatRate). */
  private async loadCatalogPriceHt(
    spaceId: string,
    tenantId: string,
    menuItemIds: string[],
    known: Map<string, { id: string; basePrice: unknown; vatRate: unknown }>,
  ): Promise<Map<string, number | null>> {
    const out = new Map<string, number | null>();
    if (!menuItemIds.length) return out;
    const missing = menuItemIds.filter((id) => !known.has(id));
    const [spaceLinks, extra] = await Promise.all([
      this.prisma.spaceMenuItem.findMany({
        where: { spaceId, menuItemId: { in: menuItemIds } },
        select: { menuItemId: true, priceTtc: true, vatRate: true },
      }),
      missing.length
        ? this.prisma.menuItem.findMany({
            where: { tenantId, id: { in: missing }, deletedAt: null },
            select: { id: true, basePrice: true, vatRate: true },
          })
        : [],
    ]);
    const items = new Map(known);
    for (const m of extra) items.set(m.id, m);
    const linkById = new Map(spaceLinks.map((l) => [l.menuItemId, l]));
    const num = (v: unknown) => (v == null ? null : Number(v));
    for (const [id, mi] of items) {
      const link = linkById.get(id);
      const ttc = num(link?.priceTtc) ?? num(mi.basePrice);
      const vat = num(link?.vatRate) ?? num(mi.vatRate);
      out.set(id, catalogPriceHt(ttc, vat));
    }
    return out;
  }
}
