import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { RolesGuard } from '../../core/auth/guards/roles.guard';
import { CurrentUser } from '../../core/auth/decorators/current-user.decorator';
import { SpaceIdParam } from '../../core/auth/decorators/space-id-param.decorator';
import { UpdateWeezeventEventMetadataDto } from './dto/update-weezevent-event-metadata.dto';
import { SpaceWeezeventEventService } from './services/space-weezevent-event.service';

/**
 * Intégrations de ventes d'un espace et événements Weezevent associés.
 */
@ApiTags('Spaces')
@ApiBearerAuth('supabase-jwt')
@Controller('spaces')
// Ce contrôleur expose `/spaces/:id` → indique au SpaceAccessGuard que l'id d'espace
// est porté par le param `id` (et non `spaceId`).
@SpaceIdParam('id')
@UseGuards(JwtDatabaseGuard, RolesGuard)
export class SpaceIntegrationsController {
  constructor(
    private readonly spaceWeezeventEventService: SpaceWeezeventEventService,
  ) {}

  /**
   * BUG-369-02 : liste des intégrations rattachées à un espace (ex. PFC + SFP sur un même
   * espace partagé) — sert à peupler le sélecteur "Changer l'intégration" du wizard, en cache
   * côté front (peu de churn : ne change qu'à l'ajout d'une nouvelle intégration).
   */
  @Get(':id/integrations')
  @ApiOperation({ summary: 'Liste des intégrations rattachées à un espace' })
  @ApiParam({ name: 'id', description: 'ID de l\'espace' })
  @ApiResponse({ status: 200, description: 'Liste des intégrations (id, name, provider)' })
  @ApiResponse({ status: 404, description: 'Espace non trouvé' })
  async getSpaceIntegrations(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    return this.spaceWeezeventEventService.getSpaceIntegrations(id, user.tenantId);
  }

  /**
   * List WeezeventEvents for a space, including enrichment metadata
   */
  @Get(':id/weezevent-events')
  @ApiOperation({ summary: 'Liste des WeezeventEvents d\'un espace avec métadonnées d\'enrichissement' })
  @ApiParam({ name: 'id', description: 'ID de l\'espace' })
  @ApiQuery({ name: 'integrationId', required: false, description: 'ID de l\'intégration — désambiguïse un espace mappé par plusieurs intégrations (BUG-319-02)' })
  @ApiResponse({ status: 200, description: 'Liste des événements Weezevent avec métadonnées' })
  @ApiResponse({ status: 404, description: 'Espace non trouvé' })
  async getWeezeventEventsForSpace(
    @Param('id') id: string,
    @Query('integrationId') integrationId: string | undefined,
    @CurrentUser() user: any,
  ) {
    return this.spaceWeezeventEventService.getWeezeventEventsForSpace(id, user.tenantId, integrationId);
  }

  /**
   * Update enrichment metadata for a WeezeventEvent (doorsOpening, showTime, category, team…)
   */
  @Patch(':id/weezevent-events/:eventId')
  @ApiOperation({ summary: 'Mettre à jour les métadonnées d\'enrichissement d\'un WeezeventEvent' })
  @ApiParam({ name: 'id', description: 'ID de l\'espace' })
  @ApiParam({ name: 'eventId', description: 'ID du WeezeventEvent' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        doorsOpening:   { type: 'string', nullable: true, example: '18:30' },
        showTime:       { type: 'string', nullable: true, example: '20:00' },
        category:       { type: 'string', nullable: true, example: 'sport' },
        eventType:      { type: 'string', nullable: true, example: 'home' },
        team:           { type: 'string', nullable: true, example: 'PSG' },
        visitingTeam:   { type: 'string', nullable: true, example: 'Lyon' },
        hasIntermission:{ type: 'boolean', nullable: true },
        performer:      { type: 'string', nullable: true, example: 'Coldplay' },
        openingAct:     { type: 'string', nullable: true, example: 'The xx' },
        sponsor:        { type: 'string', nullable: true, example: 'Sponsor SA' },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Métadonnées mises à jour' })
  @ApiResponse({ status: 404, description: 'Espace ou événement non trouvé' })
  async updateWeezeventEventMetadata(
    @Param('id') id: string,
    @Param('eventId') eventId: string,
    @Body() body: UpdateWeezeventEventMetadataDto,
    @CurrentUser() user: any,
  ) {
    return this.spaceWeezeventEventService.updateWeezeventEventMetadata(id, eventId, body, user.tenantId);
  }

  /**
   * Sync attendees for a WeezeventEvent from the WeezPay API (G6)
   */
  @Post(':id/weezevent-events/:eventId/sync-attendees')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Synchronise les participants d\'un événement depuis l\'API WeezPay' })
  @ApiParam({ name: 'id', description: 'ID de l\'espace' })
  @ApiParam({ name: 'eventId', description: 'ID du WeezeventEvent' })
  @ApiResponse({ status: 200, description: 'Participants synchronisés', schema: { type: 'object', properties: { synced: { type: 'number' } } } })
  @ApiResponse({ status: 404, description: 'Espace ou événement non trouvé' })
  async syncEventAttendees(
    @Param('id') id: string,
    @Param('eventId') eventId: string,
    @CurrentUser() user: any,
  ) {
    return this.spaceWeezeventEventService.syncEventAttendees(id, eventId, user.tenantId);
  }
}
