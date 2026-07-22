import {
    Controller,
    Get,
    Patch,
    Delete,
    Param,
    Body,
    UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { SuperAdminGuard } from '../../core/auth/guards/super-admin.guard';
import { AllowNoTenant } from '../../core/auth/decorators/allow-no-tenant.decorator';
import { OrganizationsService } from './organizations.service';
import { UpdateOrganizationDto } from './dto/update-organization.dto';

// ⚠️ Surface d'administration PLATEFORME (cross-tenant) — réservée au super-admin (BUG-035).
// GET/PATCH/DELETE :id opèrent sur `prisma.tenant` avec un `id` arbitraire fourni par l'appelant,
// et le modèle `Tenant` est EXCLU de l'auto-scoping Prisma (pas de `tenantId` scalaire). Sans ce
// guard, tout utilisateur authentifié — n'importe quel rôle, n'importe quel tenant — pouvait lire,
// modifier (dont `plan`) ou suspendre (`DELETE` → `status: SUSPENDED`) l'organisation d'un tiers.
// Correctif aligné sur TenantsController (même modèle, même classe de faille = P0-1).
// `@AllowNoTenant` : un super-admin plateforme peut ne pas avoir de tenant courant (sinon le
// TenantGuard global le bloquerait avant d'atteindre le SuperAdminGuard).
@ApiTags('Organizations')
@ApiBearerAuth('supabase-jwt')
@Controller('organizations')
@AllowNoTenant()
@UseGuards(JwtDatabaseGuard, SuperAdminGuard)
export class OrganizationsController {
    constructor(
        private readonly organizationsService: OrganizationsService,
    ) { }

    @Get(':id')
    @ApiOperation({ summary: 'Obtenir une organisation' })
    @ApiParam({ name: 'id', description: 'ID de l’organisation' })
    @ApiResponse({ status: 200, description: 'Détails de l’organisation' })
    async getOrganization(@Param('id') id: string) {
        return this.organizationsService.getOrganization(id);
    }

    @Patch(':id')
    @ApiOperation({ summary: 'Mettre à jour une organisation' })
    @ApiParam({ name: 'id', description: 'ID de l’organisation' })
    @ApiResponse({ status: 200, description: 'Organisation mise à jour' })
    async updateOrganization(
        @Param('id') id: string,
        @Body() dto: UpdateOrganizationDto,
    ) {
        return this.organizationsService.updateOrganization(id, dto);
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Supprimer une organisation' })
    @ApiParam({ name: 'id', description: 'ID de l’organisation' })
    @ApiResponse({ status: 200, description: 'Organisation supprimée' })
    async deleteOrganization(@Param('id') id: string) {
        return this.organizationsService.deleteOrganization(id);
    }
}
