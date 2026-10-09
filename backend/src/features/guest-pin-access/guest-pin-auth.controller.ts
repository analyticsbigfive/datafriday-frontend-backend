import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Headers,
  Ip,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Public } from '../../core/auth/decorators/public.decorator';
import { JwtGuestPinGuard } from '../../core/auth/guards/jwt-guest-pin.guard';
import { CurrentUser } from '../../core/auth/decorators/current-user.decorator';
import type { GuestPinUser } from '../../core/auth/strategies/jwt-guest-pin.strategy';
import { LoginPinDto } from './dto/login-pin.dto';
import { SaveGuestCountDto } from './dto/save-guest-count.dto';
import { GuestVentilationDepositDto } from './dto/ventilation.dto';
import { VentilationAccessService } from './ventilation-access.service';
import { GuestPinCountingService } from './services/guest-pin-counting.service';
import { GuestPinSessionService } from './services/guest-pin-session.service';

/**
 * Surface invité (managers de PDV sans compte). @Public() neutralise les guards
 * globaux staff (JwtDatabaseGuard/TenantGuard, cf. app.module.ts) — l'authentification
 * réelle passe par JwtGuestPinGuard, appliqué localement.
 *
 * Aucune route ici n'accepte spaceId/elementId/eventId en entrée : tout vient de
 * `request.user` (payload du JWT invité, résolu en base à chaque requête par
 * JwtGuestPinStrategy — révocation immédiate garantie).
 */
@ApiTags('Guest PIN')
@Controller('guest-pin')
@Public()
export class GuestPinAuthController {
  constructor(
    private readonly guestPinCountingService: GuestPinCountingService,
    private readonly guestPinSessionService: GuestPinSessionService,
    private readonly ventilation: VentilationAccessService,
  ) {}

  @Get('context/:slug')
  @ApiOperation({ summary: "Nom du PDV (ou de l'espace pour le QR Ventilation) + accès actif ou non, résolus depuis l'URL scannée (avant tout PIN)" })
  async context(@Param('slug') slug: string) {
    // QR « Ventilation » d'un espace (slug préfixé, jamais celui d'un élément).
    const space = await this.ventilation.findSpaceBySlug(slug);
    if (space) return this.ventilation.getPublicContext(space);
    return this.guestPinSessionService.getPublicContext(slug);
  }

  @Post('login/:slug')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Connexion invité par PIN (manager de PDV, sans compte) — un seul lien par PDV, la phase se déduit de la fenêtre ouverte' })
  async login(
    @Param('slug') slug: string,
    @Body() dto: LoginPinDto,
    @Headers('x-guest-device-id') deviceId: string | undefined,
    @Ip() ip: string,
  ) {
    const space = await this.ventilation.findSpaceBySlug(slug);
    if (space) return this.ventilation.login(space, dto.pin, deviceId, ip);
    return this.guestPinSessionService.login(dto.pin, deviceId, ip, slug);
  }

  @Get('ventilation')
  @UseGuards(JwtGuestPinGuard)
  @ApiBearerAuth('guest-pin-jwt')
  @ApiOperation({ summary: 'Feuille de ventilation du match (logisticien) : lignes de réarmement, corrections, dépôts déjà faits' })
  async ventilationSheet(@CurrentUser() user: GuestPinUser, @Headers('x-guest-device-id') deviceId: string | undefined) {
    return this.ventilation.getSheet(user, deviceId);
  }

  @Post('ventilation/deposits')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtGuestPinGuard)
  @ApiBearerAuth('guest-pin-jwt')
  @ApiOperation({ summary: 'Confirme un dépôt (raison « Ventilation ») sur une ligne de la feuille du match' })
  async ventilationDeposit(
    @CurrentUser() user: GuestPinUser,
    @Body() dto: GuestVentilationDepositDto,
    @Headers('x-guest-device-id') deviceId: string | undefined,
  ) {
    return this.ventilation.deposit(user, dto, deviceId);
  }

  @Post('ventilation/deposits/:movementId/cancel')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtGuestPinGuard)
  @ApiBearerAuth('guest-pin-jwt')
  @ApiOperation({ summary: 'Annule un dépôt saisi avec cet accès (mouvement inverse)' })
  async ventilationCancel(
    @CurrentUser() user: GuestPinUser,
    @Param('movementId') movementId: string,
    @Headers('x-guest-device-id') deviceId: string | undefined,
  ) {
    return this.ventilation.cancel(user, movementId, deviceId);
  }

  @Get('session')
  @UseGuards(JwtGuestPinGuard)
  @ApiBearerAuth('guest-pin-jwt')
  @ApiOperation({ summary: 'État courant de la session invité (réhydratation après refresh)' })
  async session(@CurrentUser() user: GuestPinUser) {
    return this.guestPinSessionService.getSession(user);
  }

  @Get('catalog')
  @UseGuards(JwtGuestPinGuard)
  @ApiBearerAuth('guest-pin-jwt')
  @ApiOperation({ summary: "Catalogue brut du PDV de l'invité (mêmes données que le staff, explosées côté client par buildConsolidatedInventory)" })
  async catalog(@CurrentUser() user: GuestPinUser) {
    return this.guestPinCountingService.getCatalog(user);
  }

  @Get('inventory')
  @UseGuards(JwtGuestPinGuard)
  @ApiBearerAuth('guest-pin-jwt')
  @ApiOperation({ summary: "Comptages déjà sauvegardés pour le PDV de l'invité" })
  async inventory(@CurrentUser() user: GuestPinUser) {
    return this.guestPinCountingService.getInventory(user);
  }

  @Post('inventory/counts')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtGuestPinGuard)
  @ApiBearerAuth('guest-pin-jwt')
  @ApiOperation({ summary: 'Sauvegarde un comptage pour le PDV de l\'invité' })
  async saveCount(@CurrentUser() user: GuestPinUser, @Body() dto: SaveGuestCountDto) {
    return this.guestPinCountingService.saveCount(user, dto);
  }

  @Post('element-complete')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtGuestPinGuard)
  @ApiBearerAuth('guest-pin-jwt')
  @ApiOperation({ summary: "Tous les articles du PDV sont comptés : régénère la feuille pre-event et recale la Logistique" })
  async elementComplete(@CurrentUser() user: GuestPinUser) {
    return this.guestPinCountingService.notifyElementComplete(user);
  }

  @Post('submit')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtGuestPinGuard)
  @ApiBearerAuth('guest-pin-jwt')
  @ApiOperation({ summary: '"J\'ai terminé" — gèle ce PDV (lecture seule), sans clôturer la fenêtre' })
  async submit(@CurrentUser() user: GuestPinUser) {
    return this.guestPinCountingService.submitCount(user);
  }
}
