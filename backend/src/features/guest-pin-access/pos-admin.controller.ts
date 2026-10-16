import { Body, Controller, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { RequirePermissions } from '../../core/auth/decorators/permissions.decorator';
import { CurrentUser } from '../../core/auth/decorators/current-user.decorator';
import type { CurrentUserData } from '../../core/auth/decorators/current-user.decorator';
import { SpaceAccessService } from '../../core/auth/space-access.service';
import { hasPermission } from '../../core/rbac/permission.util';
import { PosElementIdsDto } from './dto/pos-access.dto';
import { PosAccessService } from './pos-access.service';
import type { PosAccessStatus, PosBulkResult } from './pos-access.service';

/** Permission requise pour lire le PIN en clair (lot L8 : à ajouter au catalogue). */
const POS_MANAGE_PERMISSION = 'front.fb.posManage';

/**
 * Caisses POS : démarrer (▶) et arrêter (■) l'accès invité de chaque PdV pour un évènement.
 * Un PIN et un QR par PdV. Le PIN n'est renvoyé qu'avec `front.fb.posManage`.
 * Les permissions `front.fb.pos` et `front.fb.posManage` seront créées au catalogue par le lot L8.
 */
@ApiTags('POS : accès caisses')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtDatabaseGuard)
@RequirePermissions('front.fb.pos')
@Controller('pos')
export class PosAdminController {
  constructor(
    private readonly service: PosAccessService,
    private readonly spaceAccess: SpaceAccessService,
  ) {}

  @Post(':spaceId/events/:eventId/pdv/:elementId/start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Démarre (ou reprend) la caisse d'un PdV : fenêtre pos, PIN et accès actifs" })
  async start(@Param() p: PdvParams, @CurrentUser() user: CurrentUserData) {
    await this.spaceAccess.assertCanAccessSpace(user, p.spaceId);
    return this.view(await this.service.start(user.tenantId!, p.spaceId, p.eventId, p.elementId, user.id), user);
  }

  @Post(':spaceId/events/:eventId/pdv/:elementId/stop')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Arrête la caisse d'un PdV : la session du vendeur est révoquée immédiatement" })
  async stop(@Param() p: PdvParams, @CurrentUser() user: CurrentUserData) {
    await this.spaceAccess.assertCanAccessSpace(user, p.spaceId);
    return this.view(await this.service.stop(user.tenantId!, p.spaceId, p.eventId, p.elementId, user.id), user);
  }

  @Post(':spaceId/events/:eventId/pdv/:elementId/reset-pin')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(POS_MANAGE_PERMISSION)
  @ApiOperation({ summary: "Génère un nouveau PIN pour la caisse d'un PdV démarré" })
  async resetPin(@Param() p: PdvParams, @CurrentUser() user: CurrentUserData) {
    await this.spaceAccess.assertCanAccessSpace(user, p.spaceId);
    return this.view(await this.service.regeneratePin(user.tenantId!, p.spaceId, p.eventId, p.elementId, user.id), user);
  }

  @Post(':spaceId/events/:eventId/start-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Démarre les caisses de la liste de PdV (un échec isolé ne bloque pas les autres)' })
  async startAll(@Param() p: EventParams, @Body() dto: PosElementIdsDto, @CurrentUser() user: CurrentUserData) {
    await this.spaceAccess.assertCanAccessSpace(user, p.spaceId);
    return this.bulkView(await this.service.startAll(user.tenantId!, p.spaceId, p.eventId, dto.elementIds, user.id), user);
  }

  @Post(':spaceId/events/:eventId/stop-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Arrête les caisses de la liste de PdV' })
  async stopAll(@Param() p: EventParams, @Body() dto: PosElementIdsDto, @CurrentUser() user: CurrentUserData) {
    await this.spaceAccess.assertCanAccessSpace(user, p.spaceId);
    return this.bulkView(await this.service.stopAll(user.tenantId!, p.spaceId, p.eventId, dto.elementIds, user.id), user);
  }

  /** PIN en clair réservé à `front.fb.posManage`. */
  private view(status: PosAccessStatus, user: CurrentUserData): PosAccessStatus {
    return hasPermission(user, POS_MANAGE_PERMISSION) ? status : { ...status, pin: null };
  }

  private bulkView(bulk: PosBulkResult, user: CurrentUserData): PosBulkResult {
    return { ...bulk, results: bulk.results.map((s) => this.view(s, user)) };
  }
}

interface EventParams {
  spaceId: string;
  eventId: string;
}

interface PdvParams extends EventParams {
  elementId: string;
}
