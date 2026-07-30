import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, PartialType } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsNumber, Min, IsBoolean, IsIn } from 'class-validator';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { CurrentTenant } from '../../core/auth/decorators/current-tenant.decorator';
import { RequirePermissions } from '../../core/auth/decorators/permissions.decorator';
import { HrService, HR_PERSON_CONTRACTS } from './hr.service';

class CreateHrPersonDto {
  @IsString()
  @IsNotEmpty()
  roleId: string;

  @IsString()
  @IsNotEmpty()
  firstName: string;

  @IsString()
  @IsNotEmpty()
  lastName: string;

  @IsIn(HR_PERSON_CONTRACTS as unknown as string[])
  contractType: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  hourlyRate?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

class UpdateHrPersonDto extends PartialType(CreateHrPersonDto) {}

@ApiTags('HR — Persons')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtDatabaseGuard)
@RequirePermissions('menu.hr.manage')
@Controller('hr/persons')
export class HrPersonsController {
  constructor(private readonly service: HrService) {}

  @Get()
  @ApiOperation({ summary: 'Lister les personnes internes (dropdown « Nom » des lignes staff)' })
  @ApiQuery({ name: 'roleId', required: false })
  @ApiQuery({ name: 'contractType', required: false, enum: HR_PERSON_CONTRACTS as unknown as string[] })
  findAll(
    @CurrentTenant() tenantId: string,
    @Query('roleId') roleId?: string,
    @Query('contractType') contractType?: string,
  ) {
    return this.service.findAllPersons(tenantId, { roleId, contractType });
  }

  @Post()
  @ApiOperation({ summary: 'Créer une personne interne (CDI/CDD)' })
  create(@Body() dto: CreateHrPersonDto, @CurrentTenant() tenantId: string) {
    return this.service.createPerson(dto as any, tenantId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Mettre à jour une personne interne' })
  update(@Param('id') id: string, @Body() dto: UpdateHrPersonDto, @CurrentTenant() tenantId: string) {
    return this.service.updatePerson(id, dto, tenantId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer une personne interne' })
  remove(@Param('id') id: string, @CurrentTenant() tenantId: string) {
    return this.service.removePerson(id, tenantId);
  }
}
