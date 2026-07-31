import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, PartialType } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { CurrentTenant } from '../../core/auth/decorators/current-tenant.decorator';
import { StorageTypesService } from './storage-types.service';
import { RequirePermissions } from '../../core/auth/decorators/permissions.decorator';

class CreateStorageTypeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;
}

class UpdateStorageTypeDto extends PartialType(CreateStorageTypeDto) {}

@ApiTags('Storage Types')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtDatabaseGuard)
@Controller('storage-types')
export class StorageTypesController {
  constructor(private readonly storageTypesService: StorageTypesService) {}

  @Get()
  @ApiOperation({ summary: 'Lister les storage types du tenant (paginé)' })
  findAll(
    @CurrentTenant() tenantId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    return this.storageTypesService.findAll(tenantId, page ? +page : undefined, limit ? +limit : undefined, search);
  }

  @RequirePermissions('menu.config.manage')
  @Post()
  @ApiOperation({ summary: 'Créer un storage type' })
  create(@Body() dto: CreateStorageTypeDto, @CurrentTenant() tenantId: string) {
    return this.storageTypesService.create(dto.name, tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Récupérer un storage type par id' })
  findOne(@Param('id') id: string, @CurrentTenant() tenantId: string) {
    return this.storageTypesService.findOne(id, tenantId);
  }

  @RequirePermissions('menu.config.manage')
  @Patch(':id')
  @ApiOperation({ summary: 'Mettre à jour un storage type (renomme aussi partout où le nom est utilisé)' })
  update(@Param('id') id: string, @Body() dto: UpdateStorageTypeDto, @CurrentTenant() tenantId: string) {
    return this.storageTypesService.update(id, dto.name, tenantId);
  }

  @RequirePermissions('menu.config.manage')
  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer un storage type' })
  remove(@Param('id') id: string, @CurrentTenant() tenantId: string) {
    return this.storageTypesService.remove(id, tenantId);
  }
}
