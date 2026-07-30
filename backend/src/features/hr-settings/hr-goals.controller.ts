import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, PartialType } from '@nestjs/swagger';
import { IsNumber, Min, IsBoolean, IsOptional, IsArray, IsString } from 'class-validator';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { CurrentTenant } from '../../core/auth/decorators/current-tenant.decorator';
import { RequirePermissions } from '../../core/auth/decorators/permissions.decorator';
import { HrSettingsService } from './hr-settings.service';

class CreateHrGoalDto {
  @IsNumber()
  @Min(0)
  goalPerTpe: number;

  @IsOptional()
  @IsBoolean()
  allSpaces?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  spaceIds?: string[];
}

class UpdateHrGoalDto extends PartialType(CreateHrGoalDto) {}

@ApiTags('HR Settings — Goals')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtDatabaseGuard)
@RequirePermissions('menu.hr.manage')
@Controller('hr-settings/goals')
export class HrGoalsController {
  constructor(private readonly service: HrSettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Lister les objectifs de CA par TPE du tenant' })
  findAll(@CurrentTenant() tenantId: string) {
    return this.service.findAllGoals(tenantId);
  }

  @Post()
  @ApiOperation({ summary: 'Créer un objectif de CA par TPE (rattaché à un ensemble de spaces)' })
  create(@Body() dto: CreateHrGoalDto, @CurrentTenant() tenantId: string) {
    return this.service.createGoal(dto, tenantId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Mettre à jour un objectif de CA par TPE' })
  update(@Param('id') id: string, @Body() dto: UpdateHrGoalDto, @CurrentTenant() tenantId: string) {
    return this.service.updateGoal(id, dto, tenantId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer un objectif de CA par TPE' })
  remove(@Param('id') id: string, @CurrentTenant() tenantId: string) {
    return this.service.removeGoal(id, tenantId);
  }
}
