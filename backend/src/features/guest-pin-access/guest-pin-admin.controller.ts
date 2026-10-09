import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { RequirePermissions } from '../../core/auth/decorators/permissions.decorator';
import { CurrentUser } from '../../core/auth/decorators/current-user.decorator';
import type { CurrentUserData } from '../../core/auth/decorators/current-user.decorator';
import { CreateWindowDto, WindowElementDto, WindowTargetDto } from './dto/create-window.dto';
import { GuestPinWindowService } from './services/guest-pin-window.service';
import { GuestPinPhaseService } from './services/guest-pin-phase.service';

/**
 * Surface directeur — guards globaux standards (JwtDatabaseGuard/TenantGuard/
 * RolesGuard/PermissionsGuard/SpaceAccessGuard, cf. app.module.ts), rien de
 * spécifique à ce contrôleur au-delà de la permission dédiée.
 */
@ApiTags('Guest PIN — Back-office directeur')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtDatabaseGuard)
@RequirePermissions('front.fb.guestPinManage')
@Controller('inventory-windows')
export class GuestPinAdminController {
  constructor(
    private readonly guestPinWindowService: GuestPinWindowService,
    private readonly guestPinPhaseService: GuestPinPhaseService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Démarrer (ou rouvrir) une fenêtre pré/post-event' })
  async createWindow(@Body() dto: CreateWindowDto, @CurrentUser() user: CurrentUserData) {
    return this.guestPinWindowService.createOrReopenWindow(dto, user);
  }

  @Post('start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Démarrage / Reprise du bandeau : ouvre l\'accès PIN à tous les PDV, arrête l\'autre phase' })
  async start(@Body() dto: WindowTargetDto, @CurrentUser() user: CurrentUserData) {
    return this.guestPinPhaseService.startWindow(dto, user);
  }

  @Post('stop')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Arrêt du bandeau : coupe l\'accès PIN de tous les PDV, sans push Logistic, PIN conservé' })
  async stop(@Body() dto: WindowTargetDto, @CurrentUser() user: CurrentUserData) {
    return this.guestPinPhaseService.stopWindow(dto, user);
  }

  @Post('elements/start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ouvre l\'accès PIN à un seul PDV (même fenêtre arrêtée), arrête l\'autre phase pour ce PDV' })
  async startElement(@Body() dto: WindowElementDto, @CurrentUser() user: CurrentUserData) {
    return this.guestPinPhaseService.startElement(dto, user);
  }

  @Post('elements/stop')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Coupe l\'accès PIN d\'un seul PDV' })
  async stopElement(@Body() dto: WindowElementDto, @CurrentUser() user: CurrentUserData) {
    return this.guestPinPhaseService.stopElement(dto, user);
  }

  // Déclarée avant ':spaceId/:eventId' (préfixe 'spaces/' distinct de toute façon).
  @Get('spaces/:spaceId/storage-slugs')
  @ApiOperation({ summary: "Slug du lien QR code de chaque stockage de l'espace ({ elementId: slug })" })
  async storageSlugs(@Param('spaceId') spaceId: string, @CurrentUser() user: CurrentUserData) {
    return this.guestPinWindowService.getStorageSlugs(spaceId, user);
  }

  @Get(':spaceId/:eventId')
  @ApiOperation({ summary: "Tableau de statut des fenêtres et accès PIN d'un event" })
  async statusBoard(
    @Param('spaceId') spaceId: string,
    @Param('eventId') eventId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.guestPinWindowService.getStatusBoard(spaceId, eventId, user);
  }

  @Get(':spaceId/:eventId/periods')
  @ApiOperation({ summary: 'Périodes pre/post-event (ouverture des portes, fin de l\'event) et leur état actuel' })
  async periods(
    @Param('spaceId') spaceId: string,
    @Param('eventId') eventId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.guestPinWindowService.getPeriods(spaceId, eventId, user);
  }

  @Post(':windowId/pin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Génère (ou régénère) LE PIN partagé de cette fenêtre — vaut pour tous les PDV, affiché une seule fois' })
  async setWindowPin(@Param('windowId') windowId: string, @CurrentUser() user: CurrentUserData) {
    return this.guestPinWindowService.setWindowPin(windowId, user);
  }

  @Post('pins/:accessId/reactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Réactive un PDV précédemment révoqué (sans toucher au PIN partagé)' })
  async reactivate(@Param('accessId') accessId: string, @CurrentUser() user: CurrentUserData) {
    return this.guestPinWindowService.reactivateAccess(accessId, user);
  }

  @Post('pins/:accessId/revoke')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Révoque définitivement un accès PIN pour ce PDV' })
  async revoke(@Param('accessId') accessId: string, @CurrentUser() user: CurrentUserData) {
    await this.guestPinWindowService.revokeAccess(accessId, user);
    return { ok: true };
  }

  @Post('pins/:accessId/validate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Valide le comptage soumis par ce PDV (verrouille — seule action qui le fait)' })
  async validate(@Param('accessId') accessId: string, @CurrentUser() user: CurrentUserData) {
    return this.guestPinWindowService.validateAccess(accessId, user);
  }

  @Post('pins/:accessId/request-correction')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Renvoie ce PDV pour correction (réouvre l\'écriture, même PIN)' })
  async requestCorrection(@Param('accessId') accessId: string, @CurrentUser() user: CurrentUserData) {
    return this.guestPinWindowService.requestCorrection(accessId, user);
  }

  @Post(':windowId/close')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Clôture la fenêtre : révoque TOUS les accès invité et pousse la logistique',
  })
  async closeWindow(@Param('windowId') windowId: string, @CurrentUser() user: CurrentUserData) {
    return this.guestPinWindowService.closeWindow(windowId, user);
  }
}
