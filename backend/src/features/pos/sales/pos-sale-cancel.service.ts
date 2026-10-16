import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { GuestPinUser } from '../../../core/auth/strategies/jwt-guest-pin.strategy';
import { PrismaService } from '../../../core/database/prisma.service';
import { SalesPriceAggService } from '../../../shared/pricing/sales-price-agg.service';
import { POS_ERROR_CODES, PosSaleRow } from '../pos.contracts';
import { PosLiveTriggerService } from './pos-live-trigger.service';
import { POS_SALE_SELECT, toSaleRow } from './pos-sale-mapper';
import { PosSaleContextService } from './pos-sale-context.service';
import { posError } from './pos-sale-errors';

type Direction = 'cancel' | 'restore';

/**
 * Annulation et rétablissement d'une vente de caisse par marquage « supprimé » (`deletedAt`,
 * BUG-028) : la ligne reste (numéro de ticket jamais réattribué, historique complet), les
 * agrégats l'excluent. Le delta SalesPriceAgg est inversé et un nouveau job live est mis en file.
 *
 * Périmètre : une vente n'est visible que pour le jeton du PdV ET de l'évènement qui l'a émise ;
 * toute autre vente (autre PdV, autre évènement, autre source) est « introuvable ».
 * Idempotent : annuler une vente déjà annulée (ou rétablir une vente active) renvoie la vente
 * telle quelle, sans delta ni job.
 */
@Injectable()
export class PosSaleCancelService {
  private readonly logger = new Logger(PosSaleCancelService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly context: PosSaleContextService,
    private readonly priceAgg: SalesPriceAggService,
    private readonly live: PosLiveTriggerService,
  ) {}

  cancel(guest: GuestPinUser, saleId: string): Promise<PosSaleRow> {
    return this.flip(guest, saleId, 'cancel');
  }

  restore(guest: GuestPinUser, saleId: string): Promise<PosSaleRow> {
    return this.flip(guest, saleId, 'restore');
  }

  private async flip(guest: GuestPinUser, saleId: string, direction: Direction): Promise<PosSaleRow> {
    this.context.assertPosGuest(guest);
    await this.context.assertCashOpen(guest);
    const ctx = await this.context.load(guest);
    if (!ctx.settings.cancelEnabled) {
      throw posError(ForbiddenException, POS_ERROR_CODES.CANCEL_DISABLED, "L'annulation des tickets est désactivée pour cet évènement.");
    }

    const sale = await this.prisma.salesTransaction.findFirst({
      where: {
        id: saleId,
        tenantId: guest.tenantId,
        provider: 'POS',
        location: { externalId: guest.elementId },
        event: { externalId: guest.eventId },
      },
      select: {
        ...POS_SALE_SELECT,
        integrationId: true,
        locationId: true,
        items: {
          select: { productId: true, productName: true, rawData: true, unitPrice: true, vat: true, quantity: true },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        },
      },
    });
    if (!sale) throw new NotFoundException('Vente introuvable');

    const wantCancelled = direction === 'cancel';
    if ((sale.deletedAt != null) === wantCancelled) return toSaleRow(sale);

    // Écriture conditionnelle : deux requêtes concurrentes ne produisent qu'un seul delta.
    const changed = await this.prisma.salesTransaction.updateMany({
      where: { id: sale.id, tenantId: guest.tenantId, deletedAt: wantCancelled ? null : { not: null } },
      data: { deletedAt: wantCancelled ? new Date() : null },
    });
    if (changed.count === 0) return toSaleRow({ ...sale, deletedAt: wantCancelled ? sale.deletedAt ?? new Date() : null });

    const deltaItems = sale.items.map((i) => ({
      locationId: sale.locationId,
      productId: i.productId,
      productName: i.productName,
      rawData: i.rawData,
      unitPrice: i.unitPrice,
      vat: i.vat,
      transactionDate: sale.transactionDate,
    }));
    void this.priceAgg.applyDeltaSafe(
      guest.tenantId,
      sale.integrationId,
      wantCancelled ? [] : deltaItems,
      wantCancelled ? deltaItems : [],
    );
    void this.live.trigger(
      { tenantId: guest.tenantId, spaceId: guest.spaceId, integrationId: sale.integrationId, eventId: ctx.event.id, eventDate: ctx.event.eventDate },
      wantCancelled ? 'pos-cancel' : 'pos-restore',
    );
    this.logger.log(`Vente POS ${sale.id} ${wantCancelled ? 'annulée' : 'rétablie'} PdV ${guest.elementId} tenant ${guest.tenantId}`);
    return toSaleRow({ ...sale, deletedAt: wantCancelled ? new Date() : null });
  }
}
