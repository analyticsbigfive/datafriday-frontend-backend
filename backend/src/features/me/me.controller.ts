import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { AllowNoTenant } from '../../core/auth/decorators/allow-no-tenant.decorator';
import { CurrentUser, CurrentUserData } from '../../core/auth/decorators/current-user.decorator';
import { UpdateMeDto } from './dto/update-me.dto';
import { MeService } from './me.service';

@ApiTags('Me')
@ApiBearerAuth('supabase-jwt')
@Controller('me')
@UseGuards(JwtDatabaseGuard)
@AllowNoTenant() // post-login / pre-onboarding surface — auth required, tenant optional
export class MeController {
    constructor(
        private readonly meService: MeService,
    ) { }

    /**
     * Get current user with their organization
     */
    @Get()
    @ApiOperation({
        summary: 'Obtenir le profil utilisateur courant',
        description: 'Retourne les informations de l\'utilisateur connecté avec son organisation.',
    })
    @ApiResponse({
        status: 200,
        description: 'Profil utilisateur',
        schema: {
            type: 'object',
            properties: {
                id: { type: 'string' },
                email: { type: 'string' },
                firstName: { type: 'string' },
                lastName: { type: 'string' },
                fullName: { type: 'string' },
                tenantId: { type: 'string' },
                isOwner: { type: 'boolean' },
                tenant: {
                    type: 'object',
                    properties: {
                        id: { type: 'string' },
                        name: { type: 'string' },
                        slug: { type: 'string' },
                        plan: { type: 'string' },
                        status: { type: 'string' },
                    },
                },
                role: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', nullable: true },
                        name: { type: 'string', nullable: true },
                        systemKey: { type: 'string', enum: ['ADMIN', 'MANAGER', 'STAFF', 'VIEWER'], nullable: true },
                        isSystem: { type: 'boolean' },
                        permissions: { type: 'array', items: { type: 'string' } },
                    },
                },
            },
        },
    })
    @ApiResponse({ status: 401, description: 'Non authentifié' })
    @ApiResponse({ status: 404, description: 'Utilisateur non trouvé en base (nécessite onboarding)' })
    async getCurrentUser(@CurrentUser() user: CurrentUserData) {
        return this.meService.getCurrentUser(user);
    }

    /**
     * Update the current user's OWN profile (identity fields only).
     * Used notably when accepting an invitation (the invited user sets their name).
     * A user can never change their own role/permissions/tenant here.
     */
    @Patch()
    @ApiOperation({
        summary: 'Mettre à jour son propre profil',
        description: 'Met à jour les champs identité (prénom, nom, avatar) de l\'utilisateur connecté.',
    })
    @ApiResponse({ status: 200, description: 'Profil mis à jour' })
    @ApiResponse({ status: 401, description: 'Non authentifié' })
    async updateMe(@CurrentUser() user: CurrentUserData, @Body() dto: UpdateMeDto) {
        return this.meService.updateMe(user, dto);
    }

    /**
     * Get current user's tenant/organization
     */
    @Get('tenant')
    @ApiOperation({
        summary: 'Obtenir l\'organisation de l\'utilisateur courant',
        description: 'Retourne les détails complets de l\'organisation à laquelle appartient l\'utilisateur.',
    })
    @ApiResponse({
        status: 200,
        description: 'Détails de l\'organisation',
    })
    @ApiResponse({ status: 401, description: 'Non authentifié' })
    @ApiResponse({ status: 404, description: 'Aucune organisation associée' })
    async getCurrentUserTenant(@CurrentUser() user: any) {
        return this.meService.getCurrentUserTenant(user);
    }
}
