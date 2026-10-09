import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { CurrentUserData } from '../../../core/auth/decorators/current-user.decorator';
import { SpaceCrudService } from './space-crud.service';

/**
 * Espaces épinglés et droits d'accès des utilisateurs aux espaces.
 */
@Injectable()
export class SpaceAccessGrantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly spaceCrudService: SpaceCrudService,
  ) {}

  /**
   * Pin a space for a user
   */
  async pin(spaceId: string, userId: string, tenantId: string) {
    // Verify space exists and belongs to tenant
    await this.spaceCrudService.findOne(spaceId, tenantId);

    // Check if already pinned
    const existing = await this.prisma.userPinnedSpace.findUnique({
      where: {
        userId_spaceId: {
          userId,
          spaceId,
        },
      },
    });

    if (existing) {
      return {
        message: 'Space already pinned',
        pinned: existing,
      };
    }

    const pinned = await this.prisma.userPinnedSpace.create({
      data: {
        userId,
        spaceId,
      },
      include: {
        space: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
      },
    });

    return {
      message: 'Space pinned successfully',
      pinned,
    };
  }

  /**
   * Unpin a space for a user
   */
  async unpin(spaceId: string, userId: string, tenantId: string) {
    // Verify space exists and belongs to tenant
    await this.spaceCrudService.findOne(spaceId, tenantId);

    const existing = await this.prisma.userPinnedSpace.findUnique({
      where: {
        userId_spaceId: {
          userId,
          spaceId,
        },
      },
    });

    if (!existing) {
      throw new NotFoundException('Space is not pinned');
    }

    await this.prisma.userPinnedSpace.delete({
      where: {
        userId_spaceId: {
          userId,
          spaceId,
        },
      },
    });

    return {
      message: 'Space unpinned successfully',
    };
  }

  /**
   * Get pinned spaces for a user
   */
  async getPinned(
    userId: string,
    tenantId: string,
    user: Pick<CurrentUserData, 'id' | 'isSuperAdmin' | 'isOwner' | 'allSpacesAccess'>,
  ) {
    const accessibleIds = await this.spaceCrudService.restrictedSpaceIds(user);
    const spaceWhere: any = { tenantId };
    if (accessibleIds !== null) spaceWhere.id = { in: accessibleIds };

    const pinned = await this.prisma.userPinnedSpace.findMany({
      where: {
        userId,
        space: spaceWhere,
      },
      include: {
        space: {
          include: {
            _count: {
              select: {
                configs: true,
              },
            },
          },
        },
      },
      orderBy: {
        pinnedAt: 'desc',
      },
    });

    return pinned.map((p) => p.space);
  }

  /**
   * Grant user access to a space
   */
  async grantAccess(
    spaceId: string,
    userId: string,
    role: 'ADMIN' | 'MANAGER' | 'STAFF' | 'VIEWER',
    tenantId: string,
  ) {
    // Verify space exists and belongs to tenant
    await this.spaceCrudService.findOne(spaceId, tenantId);

    // Verify user belongs to same tenant
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        tenantId,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found in this tenant');
    }

    // Check if access already exists
    const existing = await this.prisma.userSpaceAccess.findUnique({
      where: {
        userId_spaceId: {
          userId,
          spaceId,
        },
      },
    });

    if (existing) {
      // Update role if different
      if (existing.role !== role) {
        return await this.prisma.userSpaceAccess.update({
          where: {
            userId_spaceId: {
              userId,
              spaceId,
            },
          },
          data: { role },
          include: {
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
            space: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        });
      }
      return existing;
    }

    const access = await this.prisma.userSpaceAccess.create({
      data: {
        userId,
        spaceId,
        role,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
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
   * Revoke user access to a space
   */
  async revokeAccess(spaceId: string, userId: string, tenantId: string) {
    // Verify space exists and belongs to tenant
    await this.spaceCrudService.findOne(spaceId, tenantId);

    const existing = await this.prisma.userSpaceAccess.findUnique({
      where: {
        userId_spaceId: {
          userId,
          spaceId,
        },
      },
    });

    if (!existing) {
      throw new NotFoundException('User access not found');
    }

    await this.prisma.userSpaceAccess.delete({
      where: {
        userId_spaceId: {
          userId,
          spaceId,
        },
      },
    });

    return {
      message: 'Access revoked successfully',
    };
  }

  /**
   * Get users with access to a space
   */
  async getSpaceUsers(spaceId: string, tenantId: string) {
    // Verify space exists and belongs to tenant
    await this.spaceCrudService.findOne(spaceId, tenantId);

    const users = await this.prisma.userSpaceAccess.findMany({
      where: {
        spaceId,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
      },
      orderBy: {
        grantedAt: 'desc',
      },
    });

    return users;
  }

  /**
   * Set pinned spaces for a user (replace all)
   */
  async setPinnedSpaces(
    userId: string,
    tenantId: string,
    spaceIds: string[],
    user: Pick<CurrentUserData, 'id' | 'isSuperAdmin' | 'isOwner' | 'allSpacesAccess'>,
  ) {
    // Verify all spaces exist and belong to tenant
    const validSpaces = await this.prisma.space.findMany({
      where: {
        id: { in: spaceIds },
        tenantId,
      },
      select: { id: true },
    });

    const validSpaceIds = validSpaces.map((s) => s.id);

    // Delete all current pinned spaces for this user in this tenant
    await this.prisma.userPinnedSpace.deleteMany({
      where: {
        userId,
        space: {
          tenantId,
        },
      },
    });

    // Create new pinned spaces
    if (validSpaceIds.length > 0) {
      await this.prisma.userPinnedSpace.createMany({
        data: validSpaceIds.map((spaceId) => ({
          userId,
          spaceId,
        })),
      });
    }

    // Return updated pinned spaces
    return this.getPinned(userId, tenantId, user);
  }
}
