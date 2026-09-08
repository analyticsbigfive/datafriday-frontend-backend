import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { RequirePermissions } from '../../core/auth/decorators/permissions.decorator';
import { CurrentUser } from '../../core/auth/decorators/current-user.decorator';
import type { CurrentUserData } from '../../core/auth/decorators/current-user.decorator';
import { GuestPinAccessService } from './guest-pin-access.service';
import { CreateWindowDto } from './dto/create-window.dto';
import { SetPinDto } from './dto/set-pin.dto';

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
  constructor(private readonly service: GuestPinAccessService) {}

  @Post()
  @ApiOperation({ summary: 'Démarrer (ou rouvrir) une fenêtre pré/post-event' })
  async createWindow(@Body() dto: CreateWindowDto, @CurrentUser() user: CurrentUserData) {
    return this.service.createOrReopenWindow(dto, user);
  }

  @Get(':spaceId/:eventId')
  @ApiOperation({ summary: "Tableau de statut des fenêtres et accès PIN d'un event" })
  async statusBoard(
    @Param('spaceId') spaceId: string,
    @Param('eventId') eventId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.getStatusBoard(spaceId, eventId, user);
  }

  @Post(':windowId/pins')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Génère (ou régénère) le PIN d\'un PDV pour cette fenêtre — affiché une seule fois' })
  async setPin(
    @Param('windowId') windowId: string,
    @Body() dto: SetPinDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.setPin(windowId, dto.elementId, user);
  }

  @Post('pins/:accessId/reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Régénère le PIN d'un accès existant (dégèle si soumis)" })
  async resetPin(@Param('accessId') accessId: string, @CurrentUser() user: CurrentUserData) {
    return this.service.resetPin(accessId, user);
  }

  @Post('pins/:accessId/revoke')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Révoque définitivement un accès PIN pour ce PDV' })
  async revoke(@Param('accessId') accessId: string, @CurrentUser() user: CurrentUserData) {
    await this.service.revokeAccess(accessId, user);
    return { ok: true };
  }

  @Post('pins/:accessId/validate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Valide le comptage soumis par ce PDV (verrouille — seule action qui le fait)' })
  async validate(@Param('accessId') accessId: string, @CurrentUser() user: CurrentUserData) {
    return this.service.validateAccess(accessId, user);
  }

  @Post('pins/:accessId/request-correction')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Renvoie ce PDV pour correction (réouvre l\'écriture, même PIN)' })
  async requestCorrection(@Param('accessId') accessId: string, @CurrentUser() user: CurrentUserData) {
    return this.service.requestCorrection(accessId, user);
  }

  @Post(':windowId/close')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Clôture la fenêtre : révoque TOUS les accès invité et pousse la logistique',
  })
  async closeWindow(@Param('windowId') windowId: string, @CurrentUser() user: CurrentUserData) {
    return this.service.closeWindow(windowId, user);
  }
}
