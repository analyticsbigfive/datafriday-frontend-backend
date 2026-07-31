import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, PartialType } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional, IsBoolean, IsInt, MaxLength } from 'class-validator';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { SuperAdminGuard } from '../../core/auth/guards/super-admin.guard';
import { AllowNoTenant } from '../../core/auth/decorators/allow-no-tenant.decorator';
import { DepartmentsService } from './departments.service';

class CreateDepartmentDto {
  @IsString() @IsNotEmpty() @MaxLength(100)
  name: string;

  @IsOptional() @IsString() @MaxLength(20)
  color?: string;

  @IsOptional() @IsString() @MaxLength(100)
  icon?: string;

  @IsOptional() @IsBoolean()
  needsRh?: boolean;

  @IsOptional() @IsBoolean()
  isSeller?: boolean;

  @IsOptional() @IsBoolean()
  allowsSuppliers?: boolean;

  @IsOptional() @IsInt()
  sortOrder?: number;
}

class UpdateDepartmentDto extends PartialType(CreateDepartmentDto) {}

class CreateSubtypeDto {
  @IsString() @IsNotEmpty() @MaxLength(100)
  name: string;

  @IsString() @IsNotEmpty()
  departmentId: string;
}

class UpdateSubtypeDto {
  @IsOptional() @IsString() @MaxLength(100)
  name?: string;

  @IsOptional() @IsString()
  departmentId?: string;
}

// GLOBAL — un seul jeu de départements/sous-types pour toute la plateforme (pas de scoping par
// tenant). Lecture ouverte à tout utilisateur authentifié (Builder/HR de n'importe quel tenant
// doivent pouvoir lire cette liste) ; écriture réservée au super-admin plateforme via
// SuperAdminGuard sur chaque endpoint mutant, cf. TenantsController pour le même motif.
// @AllowNoTenant() : un super-admin plateforme peut agir sans tenant courant.
@ApiTags('Departments')
@ApiBearerAuth('supabase-jwt')
@Controller('departments')
@AllowNoTenant()
@UseGuards(JwtDatabaseGuard)
export class DepartmentsController {
  constructor(private readonly departmentsService: DepartmentsService) {}

  @Get()
  @ApiOperation({ summary: 'Lister les départements (paginé, avec leurs sous-types) — plateforme entière, lecture ouverte' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    return this.departmentsService.getDepartments(page ? +page : undefined, limit ? +limit : undefined, search);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Récupérer un département par id' })
  findOne(@Param('id') id: string) {
    return this.departmentsService.findDepartment(id);
  }

  @UseGuards(SuperAdminGuard)
  @Post()
  @ApiOperation({ summary: 'Créer un département (réservé au super-admin plateforme)' })
  create(@Body() dto: CreateDepartmentDto) {
    return this.departmentsService.createDepartment(dto);
  }

  @UseGuards(SuperAdminGuard)
  @Patch(':id')
  @ApiOperation({ summary: 'Mettre à jour un département — nom/couleur/icône/needsRh/isSeller/allowsSuppliers (réservé au super-admin plateforme)' })
  update(@Param('id') id: string, @Body() dto: UpdateDepartmentDto) {
    return this.departmentsService.updateDepartment(id, dto);
  }

  @UseGuards(SuperAdminGuard)
  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer un département (réservé au super-admin plateforme)' })
  remove(@Param('id') id: string) {
    return this.departmentsService.deleteDepartment(id);
  }
}

@ApiTags('Subtypes')
@ApiBearerAuth('supabase-jwt')
@Controller('subtypes')
@AllowNoTenant()
@UseGuards(JwtDatabaseGuard)
export class SubtypesController {
  constructor(private readonly departmentsService: DepartmentsService) {}

  @Get()
  @ApiOperation({ summary: 'Lister les sous-types (paginé, filtrable par département) — plateforme entière, lecture ouverte' })
  @ApiQuery({ name: 'departmentId', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  findAll(
    @Query('departmentId') departmentId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    return this.departmentsService.getSubtypes(departmentId, page ? +page : undefined, limit ? +limit : undefined, search);
  }

  @UseGuards(SuperAdminGuard)
  @Post()
  @ApiOperation({ summary: 'Créer un sous-type sous un département (réservé au super-admin plateforme)' })
  create(@Body() dto: CreateSubtypeDto) {
    return this.departmentsService.createSubtype(dto.name, dto.departmentId);
  }

  @UseGuards(SuperAdminGuard)
  @Patch(':id')
  @ApiOperation({ summary: 'Mettre à jour un sous-type — nom et/ou changer de département (réservé au super-admin plateforme)' })
  update(@Param('id') id: string, @Body() dto: UpdateSubtypeDto) {
    return this.departmentsService.updateSubtype(id, dto);
  }

  @UseGuards(SuperAdminGuard)
  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer un sous-type (réservé au super-admin plateforme)' })
  remove(@Param('id') id: string) {
    return this.departmentsService.deleteSubtype(id);
  }
}
