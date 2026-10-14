import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { CurrentUser } from '../../core/auth/decorators/current-user.decorator';
import { PredictVersionsService } from './predict-versions.service';

/**
 * Synthèse légère des versions Event Predict (GET /predict-versions/summary).
 * Contrôleur distinct : les routes existantes sont 'events/:eventId/predict-versions' et
 * PATCH/DELETE 'predict-versions/:id' (autres verbes), donc aucune capture de 'summary'.
 * Pas de @RequirePermissions : même niveau que le GET de liste des versions.
 */
@ApiTags('Event Predict Versions')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtDatabaseGuard)
@Controller('predict-versions')
export class PredictVersionsSummaryController {
  constructor(private readonly service: PredictVersionsService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Events ayant au moins une version de prédiction (groupé, léger)' })
  @ApiQuery({ name: 'eventIds', description: 'IDs séparés par des virgules (maximum 500)' })
  @ApiResponse({ status: 200, description: '{ eventIds: string[] }' })
  @ApiResponse({ status: 400, description: 'Plus de 500 ids' })
  async summary(
    @Query('eventIds') eventIds: string | string[] | undefined,
    @CurrentUser() user: any,
  ) {
    if (eventIds !== undefined && typeof eventIds !== 'string' && !Array.isArray(eventIds)) {
      throw new BadRequestException('eventIds invalide');
    }
    const raw = Array.isArray(eventIds) ? eventIds.join(',') : (eventIds ?? '');
    const ids = raw.split(',').map((s) => s.trim()).filter(Boolean);
    return { eventIds: await this.service.eventIdsWithVersions(ids, user.tenantId) };
  }
}
