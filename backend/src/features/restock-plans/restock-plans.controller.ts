import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiBody,
  ApiResponse,
} from '@nestjs/swagger';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { RequirePermissions } from '../../core/auth/decorators/permissions.decorator';
import { CurrentUser } from '../../core/auth/decorators/current-user.decorator';
import { RestockPlansService } from './restock-plans.service';
import { RestockPlanDto } from './dto/restock-plan.dto';

// Deux contrôleurs, même découpage que predict-versions : les routes scopées
// espace d'un côté, les routes par id de l'autre — pas de collision possible
// entre un segment statique et `:id`.
//
// ⚠️ Bodies typés `Record<string, unknown>` et NON `RestockPlanDto` : le
// ValidationPipe global (whitelist + forbidNonWhitelisted) s'exécute avant tout
// pipe de route et stripperait les blobs de la photo → plan sauvegardé vide,
// sans erreur. La whitelist réelle vit dans le service. Même contrat que
// restock-state.controller.ts.

@ApiTags('Restock Plans')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtDatabaseGuard)
@Controller('spaces/:spaceId/restock-plans')
export class RestockPlansController {
  constructor(private readonly service: RestockPlansService) {}

  @Get()
  // Lecture : Réarmement comme Tableau de Réarmement (OR), parité restock-state.
  @RequirePermissions('front.fb.restock', 'front.fb.restockBoard')
  @ApiOperation({
    summary: "Lister les plans de réarmement d'un espace (métadonnées seules, sans les lignes)",
  })
  @ApiParam({ name: 'spaceId', description: 'ID du space' })
  @ApiQuery({ name: 'take', required: false, description: 'Nombre max de plans (défaut 50)' })
  @ApiResponse({ status: 200, description: 'Plans triés du plus récemment modifié au plus ancien' })
  async list(
    @Param('spaceId') spaceId: string,
    @CurrentUser() user: any,
    @Query('take') take?: string,
  ) {
    return this.service.list(spaceId, user.tenantId, take ? Number(take) : undefined);
  }

  @Post()
  @RequirePermissions('front.fb.restock')
  @ApiOperation({ summary: 'Enregistrer un nouveau plan (photo figée des lignes calculées)' })
  @ApiParam({ name: 'spaceId', description: 'ID du space' })
  @ApiBody({
    type: RestockPlanDto,
    description:
      'Plan de réarmement. Les lignes sont stockées telles quelles (photo) ; les compteurs sont recalculés serveur.',
  })
  @ApiResponse({ status: 201, description: 'Plan créé' })
  @ApiResponse({ status: 400, description: 'Nom manquant, plan trop volumineux ou quota atteint' })
  async create(
    @Param('spaceId') spaceId: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: any,
  ) {
    return this.service.create(spaceId, user.tenantId, body, user.id);
  }
}

@ApiTags('Restock Plans')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtDatabaseGuard)
@Controller('restock-plans')
export class RestockPlansStandaloneController {
  constructor(private readonly service: RestockPlansService) {}

  @Get(':id')
  @RequirePermissions('front.fb.restock', 'front.fb.restockBoard')
  @ApiOperation({ summary: 'Lire un plan complet (photo comprise)' })
  @ApiParam({ name: 'id', description: 'ID du plan' })
  @ApiResponse({ status: 200, description: 'Plan' })
  @ApiResponse({ status: 404, description: 'Plan introuvable' })
  async get(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.findById(id, user.tenantId);
  }

  @Patch(':id')
  @RequirePermissions('front.fb.restock')
  @ApiOperation({ summary: 'Mettre à jour un plan (renommage, corrections, nouvelle photo)' })
  @ApiParam({ name: 'id', description: 'ID du plan' })
  @ApiResponse({ status: 200, description: 'Plan mis à jour' })
  @ApiResponse({ status: 404, description: 'Plan introuvable' })
  async patch(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: any,
  ) {
    return this.service.patch(id, user.tenantId, body);
  }

  @Post(':id/duplicate')
  @RequirePermissions('front.fb.restock')
  @ApiOperation({ summary: 'Dupliquer un plan (copie serveur, sans ré-téléverser la photo)' })
  @ApiParam({ name: 'id', description: 'ID du plan source' })
  @ApiResponse({ status: 201, description: 'Copie créée' })
  @ApiResponse({ status: 404, description: 'Plan introuvable' })
  async duplicate(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: any,
  ) {
    const name = typeof body?.name === 'string' ? body.name : undefined;
    return this.service.duplicate(id, user.tenantId, name, user.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('front.fb.restock')
  @ApiOperation({ summary: 'Supprimer un plan' })
  @ApiParam({ name: 'id', description: 'ID du plan' })
  @ApiResponse({ status: 204, description: 'Plan supprimé' })
  @ApiResponse({ status: 404, description: 'Plan introuvable' })
  async remove(@Param('id') id: string, @CurrentUser() user: any) {
    await this.service.remove(id, user.tenantId);
  }
}
