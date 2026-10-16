import { Body, Controller, Get, Header, Param, Put, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtDatabaseGuard } from '../../../core/auth/guards/jwt-db.guard';
import { RequirePermissions } from '../../../core/auth/decorators/permissions.decorator';
import { CurrentUser } from '../../../core/auth/decorators/current-user.decorator';
import type { CurrentUserData } from '../../../core/auth/decorators/current-user.decorator';
import { SpaceAccessService } from '../../../core/auth/space-access.service';
import { hasPermission } from '../../../core/rbac/permission.util';
import type { PosEventDetail, PosEventListItem, PosEventSettingDto, PosPdvSettingUpdate, PosSalesPage } from '../pos.contracts';
import { PosSalesQueryService } from '../sales/pos-sales-query.service';
import { PosEventSettingsBodyDto, PosPdvSettingBodyDto, PosSalesQueryDto } from './dto/pos-config.dto';
import { PosEventsService } from './pos-events.service';
import { buildSalesCsv } from './pos-sales-csv';
import { PosSettingsService } from './pos-settings.service';

/** PIN en clair réservé à cette permission (ajoutée au catalogue par le lot L8). */
export const POS_MANAGE_PERMISSION = 'front.fb.posManage';

/** Pages de 200 tickets, plafond de l'export (200 x 100 = 20 000 tickets) pour borner la mémoire. */
const EXPORT_PAGE_SIZE = 200;
const EXPORT_MAX_PAGES = 100;

interface EventParams {
  spaceId: string;
  eventId: string;
}

/**
 * Outil POS du workspace (staff) : évènements, détail des caisses, réglages, historique des ventes.
 * Permission `front.fb.pos` et accès à l'espace vérifié sur chaque route (comme pos-admin.controller).
 */
@ApiTags('POS : configuration')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtDatabaseGuard)
@RequirePermissions('front.fb.pos')
@Controller('pos')
export class PosConfigController {
  constructor(
    private readonly events: PosEventsService,
    private readonly settings: PosSettingsService,
    private readonly sales: PosSalesQueryService,
    private readonly spaceAccess: SpaceAccessService,
  ) {}

  @Get('hr-persons')
  @ApiOperation({ summary: 'Personnes RH actives proposables comme responsable de caisse (id, prénom, nom)' })
  async hrPersons(@CurrentUser() user: CurrentUserData) {
    return this.settings.listResponsibleCandidates(user.tenantId!);
  }

  @Get(':spaceId/events')
  @ApiOperation({ summary: 'Évènements en cours et à venir de l\'espace' })
  async listEvents(@Param('spaceId') spaceId: string, @CurrentUser() user: CurrentUserData): Promise<PosEventListItem[]> {
    await this.spaceAccess.assertCanAccessSpace(user, spaceId);
    return this.events.listEvents(user.tenantId!, spaceId);
  }

  @Get(':spaceId/events/:eventId')
  @ApiOperation({ summary: 'Détail d\'un évènement : PdV, statut des caisses, réglages, KPI (PIN avec front.fb.posManage)' })
  async detail(@Param() p: EventParams, @CurrentUser() user: CurrentUserData): Promise<PosEventDetail> {
    await this.spaceAccess.assertCanAccessSpace(user, p.spaceId);
    return this.events.getEventDetail(user.tenantId!, p.spaceId, p.eventId, hasPermission(user, POS_MANAGE_PERMISSION));
  }

  @Put(':spaceId/events/:eventId/settings')
  @ApiOperation({ summary: 'Réglages de la caisse pour l\'évènement' })
  async updateSettings(@Param() p: EventParams, @Body() dto: PosEventSettingsBodyDto, @CurrentUser() user: CurrentUserData): Promise<PosEventSettingDto> {
    await this.spaceAccess.assertCanAccessSpace(user, p.spaceId);
    return this.settings.updateEventSettings(user.tenantId!, p.spaceId, p.eventId, dto);
  }

  @Put(':spaceId/events/:eventId/pdv/:elementId')
  @ApiOperation({ summary: 'Responsable RH d\'une caisse' })
  async updatePdv(
    @Param() p: EventParams & { elementId: string },
    @Body() dto: PosPdvSettingBodyDto,
    @CurrentUser() user: CurrentUserData,
  ): Promise<PosPdvSettingUpdate> {
    await this.spaceAccess.assertCanAccessSpace(user, p.spaceId);
    return this.settings.updatePdvSetting(user.tenantId!, p.spaceId, p.eventId, p.elementId, dto, user.id);
  }

  @Get(':spaceId/events/:eventId/sales')
  @ApiOperation({ summary: 'Historique des ventes de l\'évènement, tous PdV (curseur)' })
  async listSales(@Param() p: EventParams, @Query() query: PosSalesQueryDto, @CurrentUser() user: CurrentUserData): Promise<PosSalesPage> {
    await this.spaceAccess.assertCanAccessSpace(user, p.spaceId);
    return this.sales.list(this.scope(user, p), query);
  }

  @Get(':spaceId/events/:eventId/sales/export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiOperation({ summary: 'Export CSV de l\'historique (séparateur ;, BOM UTF-8), mêmes filtres' })
  async exportSales(
    @Param() p: EventParams,
    @Query() query: PosSalesQueryDto,
    @CurrentUser() user: CurrentUserData,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    await this.spaceAccess.assertCanAccessSpace(user, p.spaceId);
    const scope = this.scope(user, p);
    const rows: PosSalesPage['rows'] = [];
    let cursor: string | undefined;
    for (let page = 0; page < EXPORT_MAX_PAGES; page++) {
      // eslint-disable-next-line no-await-in-loop -- pagination par curseur : la page suivante dépend de la précédente
      const result = await this.sales.list(scope, { ...query, cursor, limit: EXPORT_PAGE_SIZE });
      rows.push(...result.rows);
      if (!result.nextCursor) break;
      cursor = result.nextCursor;
    }
    res.setHeader('Content-Disposition', `attachment; filename="ventes-pos-${p.eventId}.csv"`);
    return buildSalesCsv(rows);
  }

  private scope(user: CurrentUserData, p: EventParams) {
    return { tenantId: user.tenantId!, spaceId: p.spaceId, eventId: p.eventId };
  }
}
