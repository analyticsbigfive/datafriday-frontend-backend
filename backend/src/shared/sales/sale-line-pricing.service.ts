import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { MenuItemPricingService } from '../pricing/menu-item-pricing.service';
import { resolveSaleLinePrice, resolveVatRate, SaleLinePrice } from './sale-line-pricing';

/** Une ligne de catalogue résolue pour un espace (prix, promo, TVA, catégorie, composition). */
export interface ResolvedSaleLine extends SaleLinePrice {
  menuItemId: string;
  name: string;
  categoryId: string | null;
  categoryLabel: string | null;
  vatRate: number;
  /** Composition d'un combo (« 1 x Burger, 1 x Frites »), null pour un article simple. */
  note: string | null;
}

/**
 * Charge ce qu'il faut (MenuItem, SpaceMenuItem de l'espace, Promotion, TVA par défaut du tenant)
 * et applique les fonctions pures de `sale-line-pricing.ts`. Utilisé par le catalogue et la
 * création de vente de la caisse POS : un seul calcul, donc un prix affiché = un prix facturé.
 *
 * `tenantId` explicite : appelé depuis des routes invité @Public (scoping Prisma CLS inactif).
 */
@Injectable()
export class SaleLinePricingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: MenuItemPricingService,
  ) {}

  async resolveLines(
    tenantId: string,
    spaceId: string,
    menuItemIds: string[],
    promosEnabled: boolean,
  ): Promise<Map<string, ResolvedSaleLine>> {
    const out = new Map<string, ResolvedSaleLine>();
    const ids = [...new Set(menuItemIds)];
    if (ids.length === 0) return out;

    const [menuItems, spaceItems, tenantDefaultVat] = await Promise.all([
      this.prisma.menuItem.findMany({
        where: { id: { in: ids }, tenantId, deletedAt: null },
        select: {
          id: true,
          name: true,
          basePrice: true,
          vatRate: true,
          discountType: true,
          discountValue: true,
          productCategory: { select: { id: true, name: true } },
          promotion: { select: { isActive: true, promotionType: { select: { name: true } } } },
          comboChildren: { select: { quantity: true, child: { select: { name: true } } } },
        },
      }),
      this.prisma.spaceMenuItem.findMany({ where: { spaceId, menuItemId: { in: ids } } }),
      this.pricing.getTenantDefaultVatRate(tenantId),
    ]);
    const overrideByItem = new Map(spaceItems.map((s) => [s.menuItemId, s]));

    for (const item of menuItems) {
      const override = overrideByItem.get(item.id);
      const price = resolveSaleLinePrice(
        override,
        item,
        item.promotion ? { isActive: item.promotion.isActive, typeName: item.promotion.promotionType?.name ?? null } : null,
        promosEnabled,
      );
      const children = item.comboChildren ?? [];
      out.set(item.id, {
        ...price,
        menuItemId: item.id,
        name: item.name,
        categoryId: item.productCategory?.id ?? null,
        categoryLabel: item.productCategory?.name ?? null,
        vatRate: Number(resolveVatRate(override, item, tenantDefaultVat)),
        note: children.length ? children.map((c) => `${c.quantity} x ${c.child.name}`).join(', ') : null,
      });
    }
    return out;
  }
}
