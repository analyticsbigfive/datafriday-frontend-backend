import { Controller, Get, Post, Delete, Body, Param, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiBody } from '@nestjs/swagger';
import { GrantSpaceAccessDto } from './dto/grant-space-access.dto';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { RolesGuard } from '../../core/auth/guards/roles.guard';
import { RequirePermissions } from '../../core/auth/decorators/permissions.decorator';
import { CurrentUser } from '../../core/auth/decorators/current-user.decorator';
import { SpaceIdParam } from '../../core/auth/decorators/space-id-param.decorator';
import { SpaceAccessGrantService } from './services/space-access-grant.service';

/**
 * Accès des utilisateurs à un espace : octroi, retrait, liste.
 */
@ApiTags('Spaces')
@ApiBearerAuth('supabase-jwt')
@Controller('spaces')
// Ce contrôleur expose `/spaces/:id` → indique au SpaceAccessGuard que l'id d'espace
// est porté par le param `id` (et non `spaceId`).
@SpaceIdParam('id')
@UseGuards(JwtDatabaseGuard, RolesGuard)
export class SpaceAccessController {
  constructor(
    private readonly spaceAccessGrantService: SpaceAccessGrantService,
  ) {}

  /**
   * Grant user access to a space
   */
  @Post(':id/access')
  @RequirePermissions('space.edit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Donner accès à un utilisateur',
    description:
      'Accorde un accès spécifique à un utilisateur sur cet espace. Réservé aux ADMIN et MANAGER.',
  })
  @ApiParam({ name: 'id', description: 'ID de l\'espace' })
  @ApiBody({ type: GrantSpaceAccessDto })
  @ApiResponse({ status: 200, description: 'Accès accordé' })
  @ApiResponse({ status: 404, description: 'Espace ou utilisateur non trouvé' })
  async grantAccess(
    @Param('id') id: string,
    @Body() body: GrantSpaceAccessDto,
    @CurrentUser() user: any,
  ) {
    return this.spaceAccessGrantService.grantAccess(id, body.userId, body.role, user.tenantId);
  }

  /**
   * Revoke user access to a space
   */
  @Delete(':id/access/:userId')
  @RequirePermissions('space.edit')
  @ApiOperation({
    summary: 'Révoquer l\'accès d\'un utilisateur',
    description: 'Retire l\'accès d\'un utilisateur à cet espace. Réservé aux ADMIN et MANAGER.',
  })
  @ApiParam({ name: 'id', description: 'ID de l\'espace' })
  @ApiParam({ name: 'userId', description: 'ID de l\'utilisateur' })
  @ApiResponse({ status: 200, description: 'Accès révoqué' })
  @ApiResponse({ status: 404, description: 'Accès non trouvé' })
  async revokeAccess(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @CurrentUser() user: any,
  ) {
    return this.spaceAccessGrantService.revokeAccess(id, userId, user.tenantId);
  }

  /**
   * Get users with access to a space
   */
  @Get(':id/users')
  @RequirePermissions('space.edit')
  @ApiOperation({
    summary: 'Lister les utilisateurs ayant accès',
    description: 'Retourne la liste des utilisateurs avec leurs rôles sur cet espace.',
  })
  @ApiParam({ name: 'id', description: 'ID de l\'espace' })
  @ApiResponse({
    status: 200,
    description: 'Liste des utilisateurs',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          userId: { type: 'string' },
          spaceId: { type: 'string' },
          role: { type: 'string', enum: ['ADMIN', 'MANAGER', 'STAFF', 'VIEWER'] },
          grantedAt: { type: 'string', format: 'date-time' },
          user: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              email: { type: 'string' },
              firstName: { type: 'string' },
              lastName: { type: 'string' },
              role: { type: 'string' },
            },
          },
        },
      },
    },
  })
  async getSpaceUsers(@Param('id') id: string, @CurrentUser() user: any) {
    return this.spaceAccessGrantService.getSpaceUsers(id, user.tenantId);
  }
}
