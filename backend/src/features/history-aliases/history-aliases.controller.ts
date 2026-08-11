import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  BadRequestException,
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
import { HistoryAliasesService } from './history-aliases.service';
import { CreateHistoryAliasDto } from './dto/history-alias.dto';

@ApiTags('Menu Item History Aliases')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtDatabaseGuard)
@Controller('menu-item-history-aliases')
export class HistoryAliasesController {
  constructor(private readonly service: HistoryAliasesService) {}

  @Get()
  @RequirePermissions('menu.events.manage')
  @ApiOperation({ summary: 'Lister les alias « historique emprunté » d\'un espace' })
  @ApiQuery({ name: 'spaceId', description: 'ID de l\'espace' })
  @ApiResponse({ status: 200, description: 'Liste des alias (createdAt desc)' })
  async list(@Query('spaceId') spaceId: string, @CurrentUser() user: any) {
    if (!spaceId) throw new BadRequestException('spaceId query param is required');
    return this.service.list(spaceId, user.tenantId);
  }

  @Post()
  @RequirePermissions('menu.events.manage')
  @ApiOperation({
    summary: 'Créer / remplacer un alias (upsert sur tenant + space + sourceName)',
  })
  @ApiBody({ type: CreateHistoryAliasDto })
  @ApiResponse({ status: 201, description: 'Alias créé ou mis à jour' })
  async create(@Body() dto: CreateHistoryAliasDto, @CurrentUser() user: any) {
    return this.service.create(dto, user.tenantId, user.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('menu.events.manage')
  @ApiOperation({ summary: 'Supprimer un alias' })
  @ApiParam({ name: 'id', description: 'ID de l\'alias' })
  @ApiResponse({ status: 204, description: 'Alias supprimé' })
  async remove(@Param('id') id: string, @CurrentUser() user: any) {
    await this.service.remove(id, user.tenantId);
  }
}
