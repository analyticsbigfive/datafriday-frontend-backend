import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsNumber, Min, IsBoolean, IsDateString } from 'class-validator';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { CurrentTenant } from '../../core/auth/decorators/current-tenant.decorator';
import { RequirePermissions } from '../../core/auth/decorators/permissions.decorator';
import { StaffingService } from './staffing.service';

class PatchStaffLineDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  roleId?: string;

  @IsOptional()
  @IsString()
  supplierType?: string;

  @IsOptional()
  @IsString()
  supplierId?: string;

  @IsOptional()
  @IsString()
  personId?: string;

  @IsOptional()
  @IsString()
  personLabel?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  hourlyRate?: number;

  @IsOptional()
  @IsDateString()
  startTime?: string;

  @IsOptional()
  @IsDateString()
  endTime?: string;
}

class CreateStaffLineDto extends PatchStaffLineDto {
  @IsString()
  @IsNotEmpty()
  elementId: string;
}

@ApiTags('Staffing')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtDatabaseGuard)
@RequirePermissions('menu.hr.manage')
@Controller()
export class StaffingController {
  constructor(private readonly service: StaffingService) {}

  @Get('events/:eventId/staffing')
  @ApiOperation({ summary: "Lignes de staff de l'événement groupées par PDV + totaux (§5)" })
  getStaffing(@Param('eventId') eventId: string, @CurrentTenant() tenantId: string) {
    return this.service.getStaffing(eventId, tenantId);
  }

  @Post('events/:eventId/staffing/generate')
  @ApiOperation({
    summary: "(Re)génère les lignes ALGO de l'événement",
    description: 'Les lignes MANUAL ou modifiées par l’utilisateur ne sont jamais écrasées.',
  })
  generate(@Param('eventId') eventId: string, @CurrentTenant() tenantId: string) {
    return this.service.generate(eventId, tenantId);
  }

  @Post('events/:eventId/staffing/lines')
  @ApiOperation({ summary: 'Ajout manuel d’une ligne de staff (bouton « Ajouter un staff »)' })
  addLine(
    @Param('eventId') eventId: string,
    @Body() dto: CreateStaffLineDto,
    @CurrentTenant() tenantId: string,
  ) {
    return this.service.addLine(eventId, dto, tenantId);
  }

  @Patch('staffing/lines/:id')
  @ApiOperation({ summary: 'Modifier une ligne (enabled / fournisseur / personne / horaires / taux)' })
  patchLine(@Param('id') id: string, @Body() dto: PatchStaffLineDto, @CurrentTenant() tenantId: string) {
    return this.service.patchLine(id, dto, tenantId);
  }

  @Delete('staffing/lines/:id')
  @ApiOperation({ summary: 'Supprimer une ligne (lignes MANUAL uniquement)' })
  removeLine(@Param('id') id: string, @CurrentTenant() tenantId: string) {
    return this.service.removeLine(id, tenantId);
  }
}

/** Agrégat des coûts staff ajustés par espace — cartes de l'écran HR Settings. */
@ApiTags('HR Settings — Costs')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtDatabaseGuard)
@RequirePermissions('menu.hr.manage')
@Controller('hr-settings/costs')
export class StaffingCostsController {
  constructor(private readonly service: StaffingService) {}

  @Get()
  @ApiOperation({ summary: 'Σ EventStaffLine enabled × durée × taux, groupé par espace' })
  @ApiQuery({ name: 'spaceId', required: false })
  costs(@CurrentTenant() tenantId: string, @Query('spaceId') spaceId?: string) {
    return this.service.costsBySpace(tenantId, spaceId);
  }
}
