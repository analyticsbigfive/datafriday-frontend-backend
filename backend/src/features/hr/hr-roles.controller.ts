import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, PartialType } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsArray, IsNumber, Min, IsIn } from 'class-validator';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { CurrentTenant } from '../../core/auth/decorators/current-tenant.decorator';
import { CurrentUser } from '../../core/auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../core/auth/decorators/permissions.decorator';
import {
  HrService,
  HR_CONTRACT_TYPES,
  HR_RATE_TYPES,
} from './hr.service';

/**
 * La validation CONDITIONNELLE (contractType requis si F&B ; rateType+rate si
 * CDD/AGENCY/FREELANCE ; suppliers si AGENCY) vit dans HrService.normalizeRole —
 * le DTO ne porte que les contraintes inconditionnelles.
 *
 * CFG-2 Étape 4 : `department` n'est plus validé par une liste figée (@IsIn) — son existence
 * (contre la table globale Department, filtrée needsRh) est vérifiée dans
 * HrService.normalizeRole(), même idiome que `type` sur UpdateSpaceElementDto.
 * CFG-2 Étape 4.5 : `fnbCategories` suit le même principe — existence vérifiée contre Subtype
 * (département `shop`) dans HrService.resolveFnbCategories(), plus de liste figée HR_FNB_CATEGORIES.
 */
class CreateHrRoleDto {
  @IsString()
  @IsNotEmpty()
  department: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsIn(HR_CONTRACT_TYPES as unknown as string[])
  contractType?: string;

  @IsOptional()
  @IsIn(HR_RATE_TYPES as unknown as string[])
  rateType?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  rate?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  fnbCategories?: string[];

  @IsOptional()
  @IsString()
  algoKey?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  supplierIds?: string[];
}

class UpdateHrRoleDto extends PartialType(CreateHrRoleDto) {}

@ApiTags('HR — Roles')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtDatabaseGuard)
@RequirePermissions('menu.hr.manage')
@Controller('hr/roles')
export class HrRolesController {
  constructor(private readonly service: HrService) {}

  @Get()
  @ApiOperation({ summary: 'Lister les rôles RH du tenant' })
  findAll(@CurrentTenant() tenantId: string, @CurrentUser() user: any) {
    return this.service.findAllRoles(tenantId, user);
  }

  @Post()
  @ApiOperation({ summary: 'Créer un rôle RH (validation conditionnelle F&B / AGENCY)' })
  create(@Body() dto: CreateHrRoleDto, @CurrentTenant() tenantId: string, @CurrentUser() user: any) {
    return this.service.createRole(dto, tenantId, user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Mettre à jour un rôle RH' })
  update(@Param('id') id: string, @Body() dto: UpdateHrRoleDto, @CurrentTenant() tenantId: string, @CurrentUser() user: any) {
    return this.service.updateRole(id, dto, tenantId, user);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer un rôle RH' })
  remove(@Param('id') id: string, @CurrentTenant() tenantId: string, @CurrentUser() user: any) {
    return this.service.removeRole(id, tenantId, user);
  }
}
