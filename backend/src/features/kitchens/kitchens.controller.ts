import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { CurrentUser } from '../../core/auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../core/auth/decorators/permissions.decorator';
import { KitchensService } from './kitchens.service';
import { CreateKitchenDto } from './dto/create-kitchen.dto';
import { UpdateKitchenDto } from './dto/update-kitchen.dto';

/**
 * Écriture sous le droit « Composants » : les cuisines n'existent que pour les fiches
 * composant / menu item (pas de droit dédié, que les rôles existants n'auraient pas).
 * Lecture ouverte à tout utilisateur connecté (liste des choix de la fiche Menu Item).
 */
@ApiTags('Kitchens')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtDatabaseGuard)
@Controller('kitchens')
export class KitchensController {
  constructor(private readonly kitchensService: KitchensService) {}

  @RequirePermissions('menu.fb.components')
  @Post()
  @ApiOperation({ summary: 'Créer une cuisine' })
  create(@Body() dto: CreateKitchenDto, @CurrentUser() user: any) {
    return this.kitchensService.create(dto, user.tenantId, user);
  }

  @Get()
  @ApiOperation({ summary: 'Lister les cuisines (limitées aux espaces accessibles)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAll(@Query('page') page?: string, @Query('limit') limit?: string, @CurrentUser() user?: any) {
    return this.kitchensService.findAll(
      user.tenantId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 100,
      user,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtenir une cuisine' })
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.kitchensService.findOne(id, user.tenantId, user);
  }

  @RequirePermissions('menu.fb.components')
  @Patch(':id')
  @ApiOperation({ summary: 'Mettre à jour une cuisine' })
  update(@Param('id') id: string, @Body() dto: UpdateKitchenDto, @CurrentUser() user: any) {
    return this.kitchensService.update(id, dto, user.tenantId, user);
  }

  @RequirePermissions('menu.fb.components')
  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer une cuisine (les fiches rattachées perdent leur cuisine)' })
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.kitchensService.remove(id, user.tenantId, user);
  }
}
