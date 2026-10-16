import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { GuestPinUser } from '../../../core/auth/strategies/jwt-guest-pin.strategy';
import { PrismaService } from '../../../core/database/prisma.service';
import { SalesPriceAggService } from '../../../shared/pricing/sales-price-agg.service';
import { SaleLinePricingService } from '../../../shared/sales/sale-line-pricing.service';
import { EventSalesSourceService } from '../../event-sales-sources/event-sales-source.service';
import { PaymentMethodsService } from '../../payment-methods/payment-methods.service';
import { PosCreateSaleBody, PosCreateSaleResult, PosItemRawData, PosSaleRow, PosTransactionMetadata, POS_ERROR_CODES } from '../pos.contracts';
import { PosSourceService } from '../services/pos-source.service';
import { PosLiveTriggerService } from './pos-live-trigger.service';
import { POS_SALE_SELECT, toSaleRow } from './pos-sale-mapper';
import { PosSaleContextService } from './pos-sale-context.service';
import { POS_SALE_ERROR_CODES, posError } from './pos-sale-errors';
import { assertPayments, assertTicketShape, lineTotal, round2, tipTotalOf } from './pos-sale-rules';
import { reserveTicketNumber } from './pos-ticket-number';

/**
 * Écriture d'une vente de caisse (lot L3). La caisse envoie des identifiants et des quantités ;
 * prix, promotion, TVA, nom et moyen de paiement sont TOUS recalculés ici depuis le catalogue et les
 * référentiels, jamais pris dans le corps de la requête.
 *
 * Idempotence : (tenant, intégration POS, externalId = clientTicketId). Un rejeu renvoie la vente
 * existante avec `replayed=true` sans rien réécrire (ni agrégat, ni job live).
 */
@Injectable()
export class PosSaleService {
  private readonly logger = new Logger(PosSaleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly context: PosSaleContextService,
    private readonly pricing: SaleLinePricingService,
    private readonly paymentMethods: PaymentMethodsService,
    private readonly source: PosSourceService,
    private readonly eventSources: EventSalesSourceService,
    private readonly priceAgg: SalesPriceAggService,
    private readonly live: PosLiveTriggerService,
  ) {}

  async createSale(guest: GuestPinUser, body: PosCreateSaleBody, deviceId?: string | null): Promise<PosCreateSaleResult> {
    this.context.assertPosGuest(guest);
    const clientTicketId = body.clientTicketId.trim();

    // Rejeu : avant toute autre vérification, une vente déjà écrite se renvoie telle quelle.
    const integrationId = await this.source.ensureIntegrationForSpace(guest.tenantId, guest.spaceId);
    const replay = await this.findExisting(guest, integrationId, clientTicketId);
    if (replay) return { sale: replay, replayed: true };

    const vendorName = guest.vendorName?.trim();
    if (!vendorName) throw posError(BadRequestException, POS_ERROR_CODES.VENDOR_NAME_REQUIRED, 'Saisissez votre nom pour encaisser.');
    assertTicketShape(body.lines);
    await this.context.assertCashOpen(guest);
    const ctx = await this.context.load(guest);

    const menuItemIds = [...new Set(body.lines.map((l) => l.menuItemId))];
    if (menuItemIds.some((id) => !ctx.assignedMenuItemIds.has(id))) {
      throw posError(BadRequestException, POS_ERROR_CODES.ITEM_NOT_ON_PDV, "Un article n'est pas proposé sur ce point de vente.");
    }
    const [resolved, methods] = await Promise.all([
      this.pricing.resolveLines(guest.tenantId, guest.spaceId, menuItemIds, ctx.settings.promosEnabled),
      this.paymentMethods.resolveForEvent(guest.tenantId, ctx.event.id),
    ]);
    if (menuItemIds.some((id) => !resolved.has(id))) {
      throw posError(BadRequestException, POS_ERROR_CODES.ITEM_NOT_ON_PDV, "Un article n'est plus disponible au catalogue.");
    }

    const lines = body.lines.map((l) => {
      const r = resolved.get(l.menuItemId)!;
      return { ...r, quantity: l.quantity, totalTtc: lineTotal(r.unitPrice, l.quantity) };
    });
    const total = round2(lines.reduce((sum, l) => sum + l.totalTtc, 0));
    const payments = assertPayments(body.payments, methods, total, { tipsEnabled: ctx.settings.tipsEnabled });

    const refs = await this.source.ensureReferentials(guest.tenantId, guest.spaceId, ctx.event.id, [guest.elementId], menuItemIds);
    await this.eventSources.ensurePosSource(guest.tenantId, ctx.event.id, refs.integrationId, refs.salesEventId);
    const locationId = refs.locationIdByElementId.get(guest.elementId);
    if (!locationId) {
      throw posError(BadRequestException, POS_ERROR_CODES.PDV_NOT_IN_EVENT_CONFIG, "Ce point de vente n'a pas de référentiel de ventes.");
    }

    const transactionDate = new Date();
    const itemsData = lines.map((l) => ({
      productId: refs.productIdByMenuItemId.get(l.menuItemId) ?? null,
      productName: l.name,
      quantity: l.quantity,
      // Prix déjà remisé, reduction 0 (convention Digifood) ; prix d'origine et promotion en rawData.
      unitPrice: new Prisma.Decimal(l.unitPrice.toFixed(2)),
      vat: new Prisma.Decimal(l.vatRate.toFixed(2)),
      reduction: new Prisma.Decimal(0),
      rawData: {
        pos: true,
        menuItemId: l.menuItemId,
        originalUnitPrice: l.originalUnitPrice,
        promotionLabel: l.promotionLabel,
      } satisfies PosItemRawData as Prisma.InputJsonValue,
    }));

    let created: PosSaleRow;
    try {
      created = await this.prisma.$transaction(async (tx) => {
        const ticketNumber = await reserveTicketNumber(tx, { tenantId: guest.tenantId, locationId, salesEventId: refs.salesEventId });
        // Course sur le même clientTicketId : le verrou de numérotation sérialise la caisse, on relit sous verrou.
        const raced = await tx.salesTransaction.findUnique({
          where: { tenantId_integrationId_externalId: { tenantId: guest.tenantId, integrationId: refs.integrationId, externalId: clientTicketId } },
          select: { id: true },
        });
        if (raced) throw new ReplayRace();
        const metadata: PosTransactionMetadata = {
          provider: 'pos',
          clientTicketId,
          ticketNumber,
          vendorName,
          responsibleHrPersonId: ctx.responsibleHrPersonId,
          guestAccessId: guest.id,
          deviceId: deviceId ?? null,
          payments,
          // Hors CA et hors TVA : le pourboire ne vit qu'ici, `amount` et les lignes restent le total des articles.
          tipTotal: tipTotalOf(payments),
          elementId: guest.elementId,
          clientCreatedAt: body.clientCreatedAt ?? null,
        };
        const row = await tx.salesTransaction.create({
          data: {
            externalId: clientTicketId,
            tenantId: guest.tenantId,
            integrationId: refs.integrationId,
            provider: 'POS',
            amount: new Prisma.Decimal(total.toFixed(2)),
            status: 'V',
            transactionDate,
            eventId: refs.salesEventId,
            eventName: ctx.event.name,
            locationId,
            locationName: ctx.elementName,
            metadata: metadata as unknown as Prisma.InputJsonValue,
            rawData: { pos: true },
            syncedAt: transactionDate,
            items: { create: itemsData },
          },
          select: POS_SALE_SELECT,
        });
        return toSaleRow(row);
      });
    } catch (err) {
      if (err instanceof ReplayRace || (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) {
        const existing = await this.findExisting(guest, refs.integrationId, clientTicketId);
        if (existing) return { sale: existing, replayed: true };
      }
      throw err;
    }

    // Après commit, best-effort : une vente écrite ne doit jamais échouer sur l'agrégat ou le Live.
    void this.priceAgg.applyDeltaSafe(
      guest.tenantId,
      refs.integrationId,
      itemsData.map((d) => ({ ...d, locationId, transactionDate })),
      [],
    );
    void this.live.trigger(
      { tenantId: guest.tenantId, spaceId: guest.spaceId, integrationId: refs.integrationId, eventId: ctx.event.id, eventDate: ctx.event.eventDate },
      'pos-sale',
    );
    this.logger.log(`Vente POS ${clientTicketId} ticket ${created.ticketNumber} ${total}€ PdV ${guest.elementId} tenant ${guest.tenantId}`);
    return { sale: created, replayed: false };
  }

  /** Vente déjà écrite pour ce ticket tablette. Une vente d'un AUTRE PdV est un conflit, jamais un rejeu. */
  private async findExisting(guest: GuestPinUser, integrationId: string, clientTicketId: string): Promise<PosSaleRow | null> {
    const existing = await this.prisma.salesTransaction.findUnique({
      where: { tenantId_integrationId_externalId: { tenantId: guest.tenantId, integrationId, externalId: clientTicketId } },
      select: POS_SALE_SELECT,
    });
    if (!existing) return null;
    const row = toSaleRow(existing);
    if (row.elementId !== guest.elementId) {
      throw posError(ConflictException, POS_SALE_ERROR_CODES.TICKET_CONFLICT, 'Cet identifiant de ticket est déjà utilisé.');
    }
    return row;
  }
}

/** Signal interne : le ticket a été écrit par une requête concurrente entre la lecture et l'écriture. */
class ReplayRace extends Error {}
