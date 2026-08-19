import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, PartialType } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { CurrentTenant } from '../../core/auth/decorators/current-tenant.decorator';
import { PromotionTypesService } from './promotion-types.service';
import { RequirePermissions } from '../../core/auth/decorators/permissions.decorator';

class CreatePromotionTypeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;
}

class UpdatePromotionTypeDto extends PartialType(CreatePromotionTypeDto) {}

@ApiTags('Promotion Types')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtDatabaseGuard)
@Controller('promotion-types')
export class PromotionTypesController {
  constructor(private readonly promotionTypesService: PromotionTypesService) {}

  @Get()
  @ApiOperation({ summary: 'Lister les types de promotion du tenant (paginé)' })
  findAll(
    @CurrentTenant() tenantId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    return this.promotionTypesService.findAll(tenantId, page ? +page : undefined, limit ? +limit : undefined, search);
  }

  @RequirePermissions('menu.config.manage')
  @Post()
  @ApiOperation({ summary: 'Créer un type de promotion' })
  create(@Body() dto: CreatePromotionTypeDto, @CurrentTenant() tenantId: string) {
    return this.promotionTypesService.create(dto.name, tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Récupérer un type de promotion par id' })
  findOne(@Param('id') id: string, @CurrentTenant() tenantId: string) {
    return this.promotionTypesService.findOne(id, tenantId);
  }

  @RequirePermissions('menu.config.manage')
  @Patch(':id')
  @ApiOperation({ summary: 'Mettre à jour un type de promotion' })
  update(@Param('id') id: string, @Body() dto: UpdatePromotionTypeDto, @CurrentTenant() tenantId: string) {
    return this.promotionTypesService.update(id, dto.name, tenantId);
  }

  @RequirePermissions('menu.config.manage')
  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer un type de promotion' })
  remove(@Param('id') id: string, @CurrentTenant() tenantId: string) {
    return this.promotionTypesService.remove(id, tenantId);
  }
}
