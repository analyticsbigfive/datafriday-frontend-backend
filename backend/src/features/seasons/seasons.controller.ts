import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, PartialType } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsDateString, IsBoolean, IsOptional, IsArray } from 'class-validator';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { CurrentTenant } from '../../core/auth/decorators/current-tenant.decorator';
import { RequirePermissions } from '../../core/auth/decorators/permissions.decorator';
import { SeasonsService } from './seasons.service';

class CreateSeasonDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsOptional()
  @IsBoolean()
  allSpaces?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  spaceIds?: string[];
}

class UpdateSeasonDto extends PartialType(CreateSeasonDto) {}

@ApiTags('Seasons — custom date ranges')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtDatabaseGuard)
@Controller('seasons')
export class SeasonsController {
  constructor(private readonly service: SeasonsService) {}

  // GET volontairement SANS RequirePermissions supplémentaire : la liste des
  // saisons alimente le picker de dates d'Analyse/Predict, accessible à tout
  // utilisateur authentifié du tenant. Seule l'ÉDITION est réservée à la
  // permission de configuration.
  @Get()
  @ApiOperation({ summary: 'Lister les saisons (périodes personnalisées) du tenant' })
  findAll(@CurrentTenant() tenantId: string) {
    return this.service.findAll(tenantId);
  }

  @RequirePermissions('menu.config.manage')
  @Post()
  @ApiOperation({ summary: 'Créer une saison (rattachée à un ensemble de spaces)' })
  create(@Body() dto: CreateSeasonDto, @CurrentTenant() tenantId: string) {
    return this.service.create(dto, tenantId);
  }

  @RequirePermissions('menu.config.manage')
  @Patch(':id')
  @ApiOperation({ summary: 'Mettre à jour une saison' })
  update(@Param('id') id: string, @Body() dto: UpdateSeasonDto, @CurrentTenant() tenantId: string) {
    return this.service.update(id, dto, tenantId);
  }

  @RequirePermissions('menu.config.manage')
  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer une saison' })
  remove(@Param('id') id: string, @CurrentTenant() tenantId: string) {
    return this.service.remove(id, tenantId);
  }
}
