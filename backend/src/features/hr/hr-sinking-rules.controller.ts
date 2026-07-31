import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, PartialType } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsNumber, Min } from 'class-validator';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { CurrentTenant } from '../../core/auth/decorators/current-tenant.decorator';
import { RequirePermissions } from '../../core/auth/decorators/permissions.decorator';
import { HrService } from './hr.service';

/**
 * Règles « Sinking RH » (STF-2) : dotation conditionnelle d'un rôle selon la
 * catégorie FNB détectée sur un PDV (+ condition optionnelle sur un attribut
 * d'équipement, ex. nbFriteuses ≥ seuil). Consommées par
 * StaffingService.generate() — voir staffing-calculator.service.ts::applySinkingRules.
 * CFG-2 Étape 4.5 : `fnbCategory` valide son existence contre Subtype (département `shop`)
 * dans HrService.resolveFnbCategories(), plus de liste figée HR_FNB_CATEGORIES.
 */
class CreateHrSinkingRuleDto {
  @IsString()
  @IsNotEmpty()
  roleId: string;

  @IsString()
  @IsNotEmpty()
  fnbCategory: string;

  @IsOptional()
  @IsString()
  conditionAttribute?: string;

  @IsOptional()
  @IsNumber()
  conditionMinValue?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  mandatoryQty?: number;
}

class UpdateHrSinkingRuleDto extends PartialType(CreateHrSinkingRuleDto) {}

@ApiTags('HR — Sinking rules')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtDatabaseGuard)
@RequirePermissions('menu.hr.manage')
@Controller('hr/sinking-rules')
export class HrSinkingRulesController {
  constructor(private readonly service: HrService) {}

  @Get()
  @ApiOperation({ summary: 'Lister les règles Sinking RH du tenant (filtrable par rôle)' })
  findAll(@Query('roleId') roleId: string | undefined, @CurrentTenant() tenantId: string) {
    return this.service.findAllSinkingRules(tenantId, { roleId });
  }

  @Post()
  @ApiOperation({ summary: 'Créer une règle Sinking RH' })
  create(@Body() dto: CreateHrSinkingRuleDto, @CurrentTenant() tenantId: string) {
    return this.service.createSinkingRule(dto, tenantId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Mettre à jour une règle Sinking RH' })
  update(@Param('id') id: string, @Body() dto: UpdateHrSinkingRuleDto, @CurrentTenant() tenantId: string) {
    return this.service.updateSinkingRule(id, dto, tenantId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer une règle Sinking RH' })
  remove(@Param('id') id: string, @CurrentTenant() tenantId: string) {
    return this.service.removeSinkingRule(id, tenantId);
  }
}
