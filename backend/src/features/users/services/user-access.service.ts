import { Injectable, NotFoundException, ForbiddenException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { JwtDatabaseStrategy } from '../../../core/auth/strategies/jwt-db-lookup.strategy';
import { ChangeRoleDto } from '../dto/change-role.dto';
import { UserRole } from '@prisma/client';
import { UsersService } from '../users.service';

/**
 * Rôle et accès aux espaces d'un utilisateur.
 */
@Injectable()
export class UserAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtDatabaseStrategy: JwtDatabaseStrategy,
    private readonly usersService: UsersService,
  ) {}

  private readonly logger = new Logger(UserAccessService.name);

  /**
   * Change user role
   */
  async changeRole(
    id: string,
    tenantId: string,
    dto: ChangeRoleDto,
    currentUserId: string,
    currentUserRole: UserRole,
  ) {
    // Cannot change own role
    if (id === currentUserId) {
      throw new ForbiddenException('You cannot change your own role');
    }

    if (!dto.roleId && !dto.role) {
      throw new BadRequestException('Either roleId or role must be provided');
    }

    // Resolve the dynamic Role row (new `roleId`, or legacy `role` enum mapped via systemKey)
    let roleRecord: { id: string; name: string; systemKey: UserRole | null } | null = null;
    let resolvedRole: UserRole;

    if (dto.roleId) {
      roleRecord = await this.prisma.role.findFirst({
        where: { id: dto.roleId, tenantId },
        select: { id: true, name: true, systemKey: true },
      });

      if (!roleRecord) {
        throw new NotFoundException(`Role ${dto.roleId} not found`);
      }

      resolvedRole = roleRecord.systemKey ?? UserRole.VIEWER;
    } else {
      resolvedRole = dto.role as UserRole;
      roleRecord = await this.prisma.role.findFirst({
        where: { tenantId, systemKey: resolvedRole },
        select: { id: true, name: true, systemKey: true },
      });
    }

    // Only ADMIN can promote to ADMIN
    if (resolvedRole === UserRole.ADMIN && currentUserRole !== UserRole.ADMIN) {
      throw new ForbiddenException('Only admins can promote users to admin');
    }

    // Verify user exists
    const user = await this.usersService.findOne(id, tenantId);

    // Cannot demote organization owner
    const userTenant = await this.prisma.userTenant.findFirst({
      where: { userId: id, tenantId },
    });

    if (userTenant?.isOwner && resolvedRole !== UserRole.ADMIN) {
      throw new ForbiddenException('Cannot demote the organization owner');
    }

    const data = {
      role: resolvedRole,
      roleId: roleRecord?.id,
    };

    // Update role in User table
    await this.prisma.user.update({
      where: { id },
      data,
    });

    // Update role in UserTenant table
    await this.prisma.userTenant.updateMany({
      where: { userId: id, tenantId },
      data,
    });

    // Invalidate the JWT-DB auth cache so the new role/permissions apply immediately
    await this.jwtDatabaseStrategy.invalidateUserCache(id);

    this.logger.log(`User ${id} role changed to ${resolvedRole}`);

    return {
      ...user,
      role: resolvedRole,
      roleId: roleRecord?.id ?? null,
      message: `Role changed to ${resolvedRole}`,
    };
  }

  /**
   * Grant space access to a user
   */
  async grantSpaceAccess(
    userId: string,
    spaceId: string,
    tenantId: string,
    role: UserRole = UserRole.VIEWER,
  ) {
    // Verify user exists
    await this.usersService.findOne(userId, tenantId);

    // Verify space exists and belongs to tenant
    const space = await this.prisma.space.findFirst({
      where: { id: spaceId, tenantId },
    });

    if (!space) {
      throw new NotFoundException(`Space ${spaceId} not found`);
    }

    const access = await this.prisma.userSpaceAccess.upsert({
      where: {
        userId_spaceId: { userId, spaceId },
      },
      create: {
        userId,
        spaceId,
        role,
      },
      update: {
        role,
      },
      include: {
        space: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return access;
  }

  /**
   * Revoke space access from a user
   */
  async revokeSpaceAccess(userId: string, spaceId: string, tenantId: string) {
    // Verify user exists
    await this.usersService.findOne(userId, tenantId);

    await this.prisma.userSpaceAccess.deleteMany({
      where: { userId, spaceId },
    });

    return { success: true, message: 'Space access revoked' };
  }
}
