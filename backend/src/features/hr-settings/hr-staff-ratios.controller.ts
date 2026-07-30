import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, PartialType } from '@nestjs/swagger';
import { IsInt, Min, IsBoolean, IsOptional, IsArray, IsString } from 'class-validator';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { CurrentTenant } from '../../core/auth/decorators/current-tenant.decorator';
import { RequirePermissions } from '../../core/auth/decorators/permissions.decorator';
import { HrSettingsService } from './hr-settings.service';

class CreateHrStaffRatioDto {
  @IsInt()
  @Min(0)
  staffPerZoneManager: number;

  @IsOptional()
  @IsBoolean()
  allSpaces?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  spaceIds?: string[];
}

class UpdateHrStaffRatioDto extends PartialType(CreateHrStaffRatioDto) {}

@ApiTags('HR Settings — Staff par Responsable de zone')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtDatabaseGuard)
@RequirePermissions('menu.hr.manage')
@Controller('hr-settings/staff-ratios')
export class HrStaffRatiosController {
  constructor(private readonly service: HrSettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Lister les ratios staff/Responsable de zone du tenant' })
  findAll(@CurrentTenant() tenantId: string) {
    return this.service.findAllStaffRatios(tenantId);
  }

  @Post()
  @ApiOperation({ summary: 'Créer un ratio staff/Responsable de zone (rattaché à un ensemble de spaces)' })
  create(@Body() dto: CreateHrStaffRatioDto, @CurrentTenant() tenantId: string) {
    return this.service.createStaffRatio(dto, tenantId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Mettre à jour un ratio staff/Responsable de zone' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateHrStaffRatioDto,
    @CurrentTenant() tenantId: string,
  ) {
    return this.service.updateStaffRatio(id, dto, tenantId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer un ratio staff/Responsable de zone' })
  remove(@Param('id') id: string, @CurrentTenant() tenantId: string) {
    return this.service.removeStaffRatio(id, tenantId);
  }
}
