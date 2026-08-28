import { Body, Controller, Get, HttpCode, HttpStatus, Logger, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { RequirePermissions } from '../../core/auth/decorators/permissions.decorator';
import { CurrentUser } from '../../core/auth/decorators/current-user.decorator';
import { LogisticTasksService } from './logistic-tasks.service';
import { CreateLogisticTaskBatchDto } from './dto/logistic-tasks.dto';

@ApiTags('LogisticTasks')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtDatabaseGuard)
@RequirePermissions('front.fb.logistic')
@Controller()
export class LogisticTasksController {
  private readonly logger = new Logger(LogisticTasksController.name);

  constructor(private readonly service: LogisticTasksService) {}

  @Post('spaces/:spaceId/logistic-tasks/batch')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Drawer "Restocker" (Live inventory) : crée en un lot les tâches accumulées ("Tâches : N") — chacune ' +
      'assignée à un staff avec priorité, statut PENDING. Aucun mouvement de stock à la création : le stock ne ' +
      "bouge qu'aux phases PICKED_UP (récupérer) puis COMPLETED (déposer), cf. pickup()/drop().",
  })
  @ApiParam({ name: 'spaceId', description: "ID de l'espace" })
  async createBatch(@Param('spaceId') spaceId: string, @Body() dto: CreateLogisticTaskBatchDto, @CurrentUser() user: any) {
    this.logger.log(`POST /spaces/${spaceId}/logistic-tasks/batch (${dto.tasks?.length ?? 0} tâche(s))`);
    return this.service.createBatch(spaceId, dto, user.tenantId, user.id);
  }

  @Get('spaces/:spaceId/logistic-tasks')
  @ApiOperation({ summary: 'Tâches de l\'espace, groupables par staff côté front (assignedToUserId, priority, status).' })
  @ApiParam({ name: 'spaceId', description: "ID de l'espace" })
  @ApiQuery({ name: 'assignedToUserId', required: false })
  async listBySpace(
    @Param('spaceId') spaceId: string,
    @CurrentUser() user: any,
    @Query('assignedToUserId') assignedToUserId?: string,
  ) {
    return this.service.listBySpace(spaceId, user.tenantId, assignedToUserId || undefined);
  }

  @Get('spaces/:spaceId/logistic-tasks/assignable-staff')
  @ApiOperation({
    summary:
      "Utilisateurs assignables (accès à l'espace + permission front.fb.logistic), triés par nombre croissant " +
      'de tâches en cours — alimente le dropdown "Attribuer à" du drawer Restocker.',
  })
  @ApiParam({ name: 'spaceId', description: "ID de l'espace" })
  async listAssignableStaff(@Param('spaceId') spaceId: string, @CurrentUser() user: any) {
    return this.service.listAssignableStaff(spaceId, user.tenantId);
  }

  @Patch('logistic-tasks/:id/pickup')
  @ApiOperation({ summary: 'Case "Récupérer" cochée : décrémente le stock source (LogisticsService.createMovement), statut → PICKED_UP.' })
  @ApiParam({ name: 'id', description: 'ID de la LogisticTask' })
  async pickup(@Param('id') id: string, @CurrentUser() user: any) {
    this.logger.log(`PATCH /logistic-tasks/${id}/pickup`);
    return this.service.pickup(id, user.tenantId, user.id);
  }

  @Patch('logistic-tasks/:id/drop')
  @ApiOperation({ summary: 'Case "Déposer" cochée : crédite le stock destination (LogisticsService.confirmTransfer), statut → COMPLETED.' })
  @ApiParam({ name: 'id', description: 'ID de la LogisticTask' })
  async drop(@Param('id') id: string, @CurrentUser() user: any) {
    this.logger.log(`PATCH /logistic-tasks/${id}/drop`);
    return this.service.drop(id, user.tenantId, user.id);
  }

  @Patch('logistic-tasks/:id/undo-pickup')
  @ApiOperation({
    summary:
      'Case "Récupérer" décochée : annule le mouvement (pas encore confirmé) et réapplique le stock source, statut → PENDING.',
  })
  @ApiParam({ name: 'id', description: 'ID de la LogisticTask' })
  async undoPickup(@Param('id') id: string, @CurrentUser() user: any) {
    this.logger.log(`PATCH /logistic-tasks/${id}/undo-pickup`);
    return this.service.undoPickup(id, user.tenantId);
  }
}
