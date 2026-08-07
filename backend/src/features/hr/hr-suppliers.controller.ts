import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, PartialType } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsArray } from 'class-validator';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { CurrentTenant } from '../../core/auth/decorators/current-tenant.decorator';
import { CurrentUser } from '../../core/auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../core/auth/decorators/permissions.decorator';
import { HrService } from './hr.service';

class CreateHrSupplierDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  contact?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  tel?: string;

  @IsOptional()
  @IsString()
  picture?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  departments?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  spaceIds?: string[];
}

class UpdateHrSupplierDto extends PartialType(CreateHrSupplierDto) {}

class HrImportDto {
  @IsOptional()
  @IsArray()
  suppliers?: any[];

  @IsOptional()
  @IsArray()
  positions?: any[];
}

@ApiTags('HR — Suppliers')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtDatabaseGuard)
@RequirePermissions('menu.hr.manage')
@Controller('hr/suppliers')
export class HrSuppliersController {
  constructor(private readonly service: HrService) {}

  @Get()
  @ApiOperation({ summary: 'Lister les fournisseurs RH (agences) du tenant' })
  findAll(@CurrentTenant() tenantId: string, @CurrentUser() user: any) {
    return this.service.findAllSuppliers(tenantId, user);
  }

  @Post()
  @ApiOperation({ summary: 'Créer un fournisseur RH' })
  create(@Body() dto: CreateHrSupplierDto, @CurrentTenant() tenantId: string) {
    return this.service.createSupplier(dto, tenantId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Mettre à jour un fournisseur RH' })
  update(@Param('id') id: string, @Body() dto: UpdateHrSupplierDto, @CurrentTenant() tenantId: string, @CurrentUser() user: any) {
    return this.service.updateSupplier(id, dto, tenantId, user);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer un fournisseur RH' })
  remove(@Param('id') id: string, @CurrentTenant() tenantId: string, @CurrentUser() user: any) {
    return this.service.removeSupplier(id, tenantId, user);
  }
}

@ApiTags('HR — Import')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtDatabaseGuard)
@RequirePermissions('menu.hr.manage')
@Controller('hr/import')
export class HrImportController {
  constructor(private readonly service: HrService) {}

  @Post()
  @ApiOperation({
    summary: 'Import one-shot des données RH localStorage (hr_suppliers / staff_positions)',
    description: 'Refusé si des données RH existent déjà en base pour ce tenant (spec §1.4).',
  })
  import(@Body() dto: HrImportDto, @CurrentTenant() tenantId: string) {
    return this.service.importFromLocalStorage(dto, tenantId);
  }
}
