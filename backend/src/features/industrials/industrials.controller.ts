import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, PartialType } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { CurrentTenant } from '../../core/auth/decorators/current-tenant.decorator';
import { IndustrialsService } from './industrials.service';
import { RequirePermissions } from '../../core/auth/decorators/permissions.decorator';

class CreateIndustrialDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;
}

class UpdateIndustrialDto extends PartialType(CreateIndustrialDto) {}

@ApiTags('Industrials')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtDatabaseGuard)
@Controller('industrials')
export class IndustrialsController {
  constructor(private readonly industrialsService: IndustrialsService) {}

  @Get()
  @ApiOperation({ summary: 'Lister les industrials du tenant (paginé)' })
  findAll(
    @CurrentTenant() tenantId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    return this.industrialsService.findAll(tenantId, page ? +page : undefined, limit ? +limit : undefined, search);
  }

  @RequirePermissions('menu.config.manage')
  @Post()
  @ApiOperation({ summary: 'Créer un industrial' })
  create(@Body() dto: CreateIndustrialDto, @CurrentTenant() tenantId: string) {
    return this.industrialsService.create(dto.name, tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Récupérer un industrial par id' })
  findOne(@Param('id') id: string, @CurrentTenant() tenantId: string) {
    return this.industrialsService.findOne(id, tenantId);
  }

  @RequirePermissions('menu.config.manage')
  @Patch(':id')
  @ApiOperation({ summary: 'Mettre à jour un industrial' })
  update(@Param('id') id: string, @Body() dto: UpdateIndustrialDto, @CurrentTenant() tenantId: string) {
    return this.industrialsService.update(id, dto.name, tenantId);
  }

  @RequirePermissions('menu.config.manage')
  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer un industrial' })
  remove(@Param('id') id: string, @CurrentTenant() tenantId: string) {
    return this.industrialsService.remove(id, tenantId);
  }
}
