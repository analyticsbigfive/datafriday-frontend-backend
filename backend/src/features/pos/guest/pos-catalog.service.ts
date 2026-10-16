import { Injectable } from '@nestjs/common';
import type { GuestPinUser } from '../../../core/auth/strategies/jwt-guest-pin.strategy';
import { SaleLinePricingService } from '../../../shared/sales/sale-line-pricing.service';
import { PaymentMethodsService } from '../../payment-methods/payment-methods.service';
import { PosAvailabilityService } from '../availability/pos-availability.service';
import { PosCatalog } from '../pos.contracts';
import { PosSaleContextService } from '../sales/pos-sale-context.service';
import { PosSalesQueryService } from '../sales/pos-sales-query.service';

/** Catégorie des articles sans catégorie produit : la caisse a besoin d'un rail complet. */
export const POS_UNCATEGORIZED = { id: 'uncategorized', label: 'Autres' } as const;

/**
 * Catalogue de la caisse : articles du PdV dans la configuration de l'évènement, prix et promotions
 * (si activées pour l'évènement), TVA, disponibilité stock (lot L5) et moyens de paiement utilisables.
 * Même résolution de prix que l'écriture de la vente (SaleLinePricingService) : prix affiché = prix facturé.
 */
@Injectable()
export class PosCatalogService {
  constructor(
    private readonly context: PosSaleContextService,
    private readonly pricing: SaleLinePricingService,
    private readonly availability: PosAvailabilityService,
    private readonly paymentMethods: PaymentMethodsService,
    private readonly salesQuery: PosSalesQueryService,
  ) {}

  async getCatalog(guest: GuestPinUser): Promise<PosCatalog> {
    const ctx = await this.context.load(guest);
    const menuItemIds = [...ctx.assignedMenuItemIds];

    const [resolved, stock, methods, nextTicketNumber] = await Promise.all([
      this.pricing.resolveLines(guest.tenantId, guest.spaceId, menuItemIds, ctx.settings.promosEnabled),
      this.availability.computeForPdv(guest.tenantId, guest.spaceId, ctx.event.id, guest.elementId, menuItemIds),
      this.paymentMethods.resolveForEvent(guest.tenantId, ctx.event.id),
      this.salesQuery.nextTicketNumber({ tenantId: guest.tenantId, spaceId: guest.spaceId, eventId: ctx.event.id, elementId: guest.elementId }),
    ]);

    const categories = new Map<string, string>();
    const items = [...resolved.values()]
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
      .map((line) => {
        const categoryId = line.categoryId ?? POS_UNCATEGORIZED.id;
        categories.set(categoryId, line.categoryLabel ?? POS_UNCATEGORIZED.label);
        const level = stock.get(line.menuItemId);
        return {
          menuItemId: line.menuItemId,
          name: line.name,
          categoryId,
          unitPrice: line.unitPrice,
          originalUnitPrice: line.originalUnitPrice,
          promotionLabel: line.promotionLabel,
          vatRate: line.vatRate,
          note: line.note,
          availability: level?.availability ?? ('available' as const),
          remainingUnits: level?.remainingUnits ?? null,
        };
      });

    return {
      pdv: { elementId: guest.elementId, name: ctx.elementName },
      event: { id: ctx.event.id, name: ctx.event.name },
      vendorName: guest.vendorName ?? '',
      settings: {
        paymentMethodIds: ctx.settings.paymentMethodIds,
        promosEnabled: ctx.settings.promosEnabled,
        cancelEnabled: ctx.settings.cancelEnabled,
        lowStockUnits: ctx.settings.lowStockUnits,
        tipsEnabled: ctx.settings.tipsEnabled,
      },
      paymentMethods: methods,
      categories: [...categories.entries()]
        .map(([id, label]) => ({ id, label }))
        .sort((a, b) => a.label.localeCompare(b.label, 'fr')),
      items,
      nextTicketNumber,
    };
  }
}
