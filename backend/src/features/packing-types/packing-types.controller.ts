import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, PartialType } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { CurrentTenant } from '../../core/auth/decorators/current-tenant.decorator';
import { PackingTypesService } from './packing-types.service';
import { RequirePermissions } from '../../core/auth/decorators/permissions.decorator';

class CreatePackingTypeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;
}

class UpdatePackingTypeDto extends PartialType(CreatePackingTypeDto) {}

@ApiTags('Packing Types')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtDatabaseGuard)
@Controller('packing-types')
export class PackingTypesController {
  constructor(private readonly packingTypesService: PackingTypesService) {}

  @Get()
  @ApiOperation({ summary: 'Lister les packing types du tenant (paginé)' })
  findAll(
    @CurrentTenant() tenantId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    return this.packingTypesService.findAll(tenantId, page ? +page : undefined, limit ? +limit : undefined, search);
  }

  @RequirePermissions('menu.config.manage')
  @Post()
  @ApiOperation({ summary: 'Créer un packing type' })
  create(@Body() dto: CreatePackingTypeDto, @CurrentTenant() tenantId: string) {
    return this.packingTypesService.create(dto.name, tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Récupérer un packing type par id' })
  findOne(@Param('id') id: string, @CurrentTenant() tenantId: string) {
    return this.packingTypesService.findOne(id, tenantId);
  }

  @RequirePermissions('menu.config.manage')
  @Patch(':id')
  @ApiOperation({ summary: 'Mettre à jour un packing type' })
  update(@Param('id') id: string, @Body() dto: UpdatePackingTypeDto, @CurrentTenant() tenantId: string) {
    return this.packingTypesService.update(id, dto.name, tenantId);
  }

  @RequirePermissions('menu.config.manage')
  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer un packing type' })
  remove(@Param('id') id: string, @CurrentTenant() tenantId: string) {
    return this.packingTypesService.remove(id, tenantId);
  }
}
