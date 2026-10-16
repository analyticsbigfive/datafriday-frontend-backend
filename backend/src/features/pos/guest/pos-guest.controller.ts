import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../core/auth/decorators/current-user.decorator';
import { Public } from '../../../core/auth/decorators/public.decorator';
import { JwtGuestPinGuard } from '../../../core/auth/guards/jwt-guest-pin.guard';
import type { GuestPinUser } from '../../../core/auth/strategies/jwt-guest-pin.strategy';
import { PosCatalog, PosClosing, PosCreateSaleResult, PosSaleRow, PosSalesPage } from '../pos.contracts';
import { PosSaleCancelService } from '../sales/pos-sale-cancel.service';
import { PosSaleContextService } from '../sales/pos-sale-context.service';
import { PosSaleService } from '../sales/pos-sale.service';
import { PosSalesQueryService, PosSalesScope } from '../sales/pos-sales-query.service';
import { PosCatalogService } from './pos-catalog.service';
import { PosCreateSaleDto, PosGuestSalesQueryDto } from './pos-guest.dto';

/**
 * Surface invité de la caisse POS. @Public() neutralise les guards staff, l'authentification réelle
 * est JwtGuestPinGuard (relit l'accès en base à chaque requête : ■ coupe la session immédiatement).
 * Aucune route n'accepte PdV, espace ou évènement en entrée : tout le périmètre vient du jeton, et
 * toute session qui n'est pas de phase `pos` (inventaire, ventilation) est refusée.
 */
@ApiTags('POS invité')
@Controller('guest-pin/pos')
@Public()
@UseGuards(JwtGuestPinGuard)
@ApiBearerAuth('guest-pin-jwt')
export class PosGuestController {
  constructor(
    private readonly context: PosSaleContextService,
    private readonly catalog: PosCatalogService,
    private readonly sales: PosSaleService,
    private readonly cancellation: PosSaleCancelService,
    private readonly salesQuery: PosSalesQueryService,
  ) {}

  @Get('catalog')
  @ApiOperation({ summary: 'Catalogue de la caisse : articles du PdV, prix, promos, TVA, disponibilité, moyens de paiement' })
  getCatalog(@CurrentUser() guest: GuestPinUser): Promise<PosCatalog> {
    this.context.assertPosGuest(guest);
    return this.catalog.getCatalog(guest);
  }

  @Post('sales')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Encaisse un ticket (idempotent sur clientTicketId : un rejeu renvoie la vente avec replayed=true)' })
  createSale(
    @CurrentUser() guest: GuestPinUser,
    @Body() dto: PosCreateSaleDto,
    @Headers('x-guest-device-id') deviceId: string | undefined,
  ): Promise<PosCreateSaleResult> {
    return this.sales.createSale(guest, dto, deviceId ?? null);
  }

  @Post('sales/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Annule un ticket du PdV (marquage supprimé, exclu des agrégats)' })
  cancel(@CurrentUser() guest: GuestPinUser, @Param('id') id: string): Promise<PosSaleRow> {
    return this.cancellation.cancel(guest, id);
  }

  @Post('sales/:id/restore')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rétablit un ticket annulé du PdV' })
  restore(@CurrentUser() guest: GuestPinUser, @Param('id') id: string): Promise<PosSaleRow> {
    return this.cancellation.restore(guest, id);
  }

  @Get('sales')
  @ApiOperation({ summary: 'Historique des tickets du PdV (curseur, 50 par défaut, 200 au plus)' })
  listSales(@CurrentUser() guest: GuestPinUser, @Query() query: PosGuestSalesQueryDto): Promise<PosSalesPage> {
    this.context.assertPosGuest(guest);
    // elementId volontairement absent du DTO : le PdV est celui du jeton.
    return this.salesQuery.list(this.scopeOf(guest), query);
  }

  @Get('closing')
  @ApiOperation({ summary: 'Récapitulatif de clôture du PdV' })
  closing(@CurrentUser() guest: GuestPinUser): Promise<PosClosing> {
    this.context.assertPosGuest(guest);
    return this.salesQuery.closing(this.scopeOf(guest));
  }

  private scopeOf(guest: GuestPinUser): PosSalesScope & { elementId: string } {
    return { tenantId: guest.tenantId, spaceId: guest.spaceId, eventId: guest.eventId, elementId: guest.elementId };
  }
}
