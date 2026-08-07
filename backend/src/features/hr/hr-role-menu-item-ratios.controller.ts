import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, PartialType } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsIn, IsNumber, Min, IsInt, IsBoolean, IsOptional, IsArray } from 'class-validator';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { CurrentTenant } from '../../core/auth/decorators/current-tenant.decorator';
import { CurrentUser } from '../../core/auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../core/auth/decorators/permissions.decorator';
import { HrService } from './hr.service';

/**
 * Association Rôle ↔ Menu Item(s), scopée par espace — variante « espace-scopée » du mécanisme
 * Sinking Rule (qui reste tag-scopé, global). Un rôle est dimensionné selon le volume de vente
 * (CA ou Quantités) d'un ou plusieurs MenuItem sur CET espace : qty = floor(valeur courante /
 * ratioValue) * unitQty. Consommée par StaffingCalculatorService.applyMenuItemRatios — voir
 * 11_RH_STAFFING.md §11.16, résout QUESTIONS_A_BERTRAND.md #47.
 */
class CreateHrRoleMenuItemRatioDto {
  @IsString()
  @IsNotEmpty()
  spaceId: string;

  @IsString()
  @IsNotEmpty()
  roleId: string;

  @IsIn(['REVENUE', 'QUANTITY'])
  ratioBasis: string;

  @IsNumber()
  @Min(0.01)
  ratioValue: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  unitQty?: number;

  @IsOptional()
  @IsBoolean()
  allMenuItems?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  menuItemIds?: string[];
}

class UpdateHrRoleMenuItemRatioDto extends PartialType(CreateHrRoleMenuItemRatioDto) {}

@ApiTags('HR — Role/MenuItem ratios')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtDatabaseGuard)
@RequirePermissions('menu.hr.manage')
@Controller('hr/role-menu-item-ratios')
export class HrRoleMenuItemRatiosController {
  constructor(private readonly service: HrService) {}

  @Get()
  @ApiOperation({ summary: "Lister les associations Rôle↔MenuItem du tenant (filtrable par espace)" })
  findAll(@Query('spaceId') spaceId: string | undefined, @CurrentTenant() tenantId: string, @CurrentUser() user: any) {
    return this.service.findAllRoleMenuItemRatios(tenantId, { spaceId }, user);
  }

  @Post()
  @ApiOperation({ summary: 'Créer une association Rôle↔MenuItem' })
  create(@Body() dto: CreateHrRoleMenuItemRatioDto, @CurrentTenant() tenantId: string) {
    return this.service.createRoleMenuItemRatio(dto, tenantId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Mettre à jour une association Rôle↔MenuItem' })
  update(@Param('id') id: string, @Body() dto: UpdateHrRoleMenuItemRatioDto, @CurrentTenant() tenantId: string, @CurrentUser() user: any) {
    return this.service.updateRoleMenuItemRatio(id, dto, tenantId, user);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer une association Rôle↔MenuItem' })
  remove(@Param('id') id: string, @CurrentTenant() tenantId: string, @CurrentUser() user: any) {
    return this.service.removeRoleMenuItemRatio(id, tenantId, user);
  }
}
