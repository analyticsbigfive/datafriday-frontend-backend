import { Injectable, NotFoundException, ConflictException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { JwtDatabaseStrategy } from '../../core/auth/strategies/jwt-db-lookup.strategy';
import { SupabaseAdminService } from '../../core/supabase/supabase-admin.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { QueryUserDto } from './dto/query-user.dto';
import { Prisma, UserRole } from '@prisma/client';
import { UserSupportService } from './services/user-support.service';

/**
 * Utilisateurs d'un tenant : création, lecture, modification, suppression et statistiques.
 */
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtDatabaseStrategy: JwtDatabaseStrategy,
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly userSupportService: UserSupportService,
  ) {}

  private readonly logger = new Logger(UsersService.name);

  /**
   * Create a new user for a tenant
   */
  async create(tenantId: string, dto: CreateUserDto) {
    // Check if user with same email already exists in tenant
    const existing = await this.prisma.user.findFirst({
      where: {
        email: dto.email,
        tenantId,
      },
    });

    if (existing) {
      throw new ConflictException(`User with email ${dto.email} already exists in this organization`);
    }

    const { systemKey: role, roleId } = await this.userSupportService.resolveRole(tenantId, {
      roleId: dto.roleId,
      role: dto.role,
    });
    const fullName = `${dto.firstName} ${dto.lastName}`;

    // 1) Provision the real Supabase auth account — its id becomes the DB User id
    //    so the user can actually authenticate (JWT `sub` === User.id).
    const supabaseUser = await this.supabaseAdmin.createUser({
      email: dto.email,
      password: dto.password,
      emailConfirm: true,
      userMetadata: { firstName: dto.firstName, lastName: dto.lastName, tenantId },
    });

    // 2) Mirror in our DB (atomique : user + membership + accès espaces).
    //    On failure, roll back the Supabase account to avoid orphans.
    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            id: supabaseUser.id,
            email: dto.email,
            firstName: dto.firstName,
            lastName: dto.lastName,
            fullName,
            phone: dto.phone,
            role,
            roleId,
            avatar: dto.avatar,
            tenantId,
            // Accès aux espaces découplé du rôle : flag = "tous les espaces".
            allSpacesAccess: !!dto.allSpaces,
          },
          include: {
            tenant: { select: { id: true, name: true, slug: true } },
          },
        });

        await tx.userTenant.create({
          data: {
            userId: created.id,
            tenantId,
            role,
            roleId,
            isOwner: false,
          },
        });

        // Périmètre d'espaces : si "tous", le flag suffit. Sinon, on accorde la sélection.
        if (!dto.allSpaces) {
          const spaceIds = await this.userSupportService.resolveTargetSpaceIds(tx, tenantId, dto);
          if (spaceIds.length) {
            await tx.userSpaceAccess.createMany({
              data: spaceIds.map((spaceId) => ({ userId: created.id, spaceId, role })),
              skipDuplicates: true,
            });
          }
        }

        return created;
      });

      this.logger.log(`User ${user.email} (${user.id}) created for tenant ${tenantId}`);

      return this.userSupportService.sanitizeUser(user);
    } catch (error) {
      await this.supabaseAdmin.deleteUser(supabaseUser.id);
      this.logger.error(
        `DB user creation failed for ${dto.email}; rolled back Supabase account ${supabaseUser.id}`,
      );
      throw error;
    }
  }

  /**
   * Find all users for a tenant with pagination and filters
   */
  async findAll(tenantId: string, query: QueryUserDto) {
    const { search, role, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where: any = { tenantId };

    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { fullName: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (role) {
      where.role = role;
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          // Rôle RBAC dynamique : exposé en objet `{ id, name, systemKey }` par
          // sanitizeUser (colonne "Role" de la liste users côté front).
          roleRef: { select: { id: true, name: true, systemKey: true } },
          // isOwner DE CE TENANT (pas des autres organisations de l'utilisateur) — permet au
          // front de désactiver la suppression/rétrogradation du owner (cf. sanitizeUser).
          userTenants: { where: { tenantId }, select: { isOwner: true } },
          _count: {
            select: {
              pinnedSpaces: true,
              spaceAccess: true,
            },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    // Enrichir avec le statut de connexion (Supabase) : "active" si déjà connecté,
    // "pending" si invité jamais connecté, "unknown" si l'info est indisponible.
    const authInfo = await this.supabaseAdmin.getAuthInfoByIds(users.map((u) => u.id));

    return {
      data: users.map((u) => this.userSupportService.sanitizeUser(this.userSupportService.withAuthStatus(u, authInfo.get(u.id)))),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Find one user by ID
   */
  async findOne(id: string, tenantId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, tenantId },
      include: {
        // Rôle RBAC dynamique (cf. findAll) — fiabilise le préremplissage du
        // drawer d'édition (roleId) et l'affichage du rôle.
        roleRef: { select: { id: true, name: true, systemKey: true } },
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        pinnedSpaces: {
          include: {
            space: {
              select: {
                id: true,
                name: true,
                image: true,
              },
            },
          },
        },
        spaceAccess: {
          include: {
            space: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        _count: {
          select: {
            pinnedSpaces: true,
            spaceAccess: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    const authInfo = (await this.supabaseAdmin.getAuthInfoByIds([id])).get(id);

    return this.userSupportService.sanitizeUser(this.userSupportService.withAuthStatus(user, authInfo));
  }

  /**
   * Update a user
   */
  async update(id: string, tenantId: string, dto: UpdateUserDto) {
    // Verify user exists and belongs to tenant
    await this.findOne(id, tenantId);

    const updateData: any = {};

    if (dto.email) updateData.email = dto.email;
    if (dto.firstName) updateData.firstName = dto.firstName;
    if (dto.lastName) updateData.lastName = dto.lastName;
    if (dto.phone !== undefined) updateData.phone = dto.phone;
    if (dto.role) updateData.role = dto.role;
    if (dto.avatar !== undefined) updateData.avatar = dto.avatar;

    // Update fullName if names changed
    if (dto.firstName || dto.lastName) {
      const current = await this.prisma.user.findUnique({ where: { id } });
      const firstName = dto.firstName || current?.firstName || '';
      const lastName = dto.lastName || current?.lastName || '';
      updateData.fullName = `${firstName} ${lastName}`;
    }

    // Le rôle dynamique (roleId) reste géré par changeRole (protections dédiées).
    const hasSpaceUpdate = dto.allSpaces !== undefined || dto.spaceIds !== undefined;
    if (hasSpaceUpdate) {
      // Accès aux espaces découplé du rôle : flag = "tous les espaces".
      updateData.allSpacesAccess = !!dto.allSpaces;
    }

    const user = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: updateData,
        include: {
          tenant: { select: { id: true, name: true, slug: true } },
        },
      });

      if (hasSpaceUpdate) {
        if (dto.allSpaces) {
          // Accès complet via le flag → les accès spécifiques deviennent inutiles.
          await tx.userSpaceAccess.deleteMany({ where: { userId: id, space: { tenantId } } });
        } else {
          await this.syncSpaceAccess(tx, id, tenantId, updated.role, { spaceIds: dto.spaceIds });
        }
      }

      return updated;
    });

    // Le périmètre d'espaces fait partie du contexte d'auth → invalider le cache.
    if (hasSpaceUpdate) {
      await this.jwtDatabaseStrategy.invalidateUserCache(id);
    }

    this.logger.log(`User ${id} updated`);

    return this.userSupportService.sanitizeUser(user);
  }

  /**
   * Synchronise les UserSpaceAccess d'un utilisateur sur la cible (`allSpaces`/`spaceIds`) :
   * ajoute les manquants, retire ceux hors-cible. Scopé aux espaces du tenant courant
   * (ne touche pas les accès d'un autre tenant pour un user multi-org).
   */
  private async syncSpaceAccess(
    tx: Prisma.TransactionClient,
    userId: string,
    tenantId: string,
    role: UserRole,
    opts: { allSpaces?: boolean; spaceIds?: string[] },
  ): Promise<void> {
    const targetIds = await this.userSupportService.resolveTargetSpaceIds(tx, tenantId, opts);
    const targetSet = new Set(targetIds);

    const current = await tx.userSpaceAccess.findMany({
      where: { userId, space: { tenantId } },
      select: { spaceId: true },
    });
    const currentSet = new Set(current.map((c) => c.spaceId));

    const toAdd = targetIds.filter((s) => !currentSet.has(s));
    const toRemove = [...currentSet].filter((s) => !targetSet.has(s));

    if (toAdd.length) {
      await tx.userSpaceAccess.createMany({
        data: toAdd.map((spaceId) => ({ userId, spaceId, role })),
        skipDuplicates: true,
      });
    }
    if (toRemove.length) {
      await tx.userSpaceAccess.deleteMany({ where: { userId, spaceId: { in: toRemove } } });
    }
  }

  /**
   * Delete a user (soft delete via removing from tenant)
   */
  async remove(id: string, tenantId: string, currentUserId: string) {
    // Cannot delete yourself
    if (id === currentUserId) {
      throw new ForbiddenException('You cannot delete your own account');
    }

    // Verify user exists and belongs to tenant
    await this.findOne(id, tenantId);

    // Check if user is tenant owner
    const userTenant = await this.prisma.userTenant.findFirst({
      where: { userId: id, tenantId },
    });

    if (userTenant?.isOwner) {
      throw new ForbiddenException('Cannot delete the organization owner');
    }

    // Delete UserTenant relation for THIS tenant
    await this.prisma.userTenant.deleteMany({
      where: { userId: id, tenantId },
    });

    // Does the user still belong to any other organization?
    const remainingMemberships = await this.prisma.userTenant.count({
      where: { userId: id },
    });

    // Delete the user row for this tenant
    await this.prisma.user.delete({
      where: { id },
    });

    // Only tear down the Supabase auth account when the user has no remaining
    // organization (otherwise they'd lose access to their other tenants).
    if (remainingMemberships === 0) {
      await this.supabaseAdmin.deleteUser(id);
    }

    // The user's role/permissions changed — invalidate their auth cache cluster-wide.
    await this.jwtDatabaseStrategy.invalidateUserCache(id);

    this.logger.log(`User ${id} deleted from tenant ${tenantId}`);

    return { success: true, message: 'User deleted successfully' };
  }

  /**
   * Get user statistics for a tenant
   */
  async getStatistics(tenantId: string) {
    const [total, byRole, recentUsers] = await Promise.all([
      this.prisma.user.count({ where: { tenantId } }),
      this.prisma.user.groupBy({
        by: ['role'],
        where: { tenantId },
        _count: true,
      }),
      this.prisma.user.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          createdAt: true,
        },
      }),
    ]);

    const roleStats = {
      ADMIN: 0,
      MANAGER: 0,
      STAFF: 0,
      VIEWER: 0,
    };

    byRole.forEach(r => {
      roleStats[r.role] = r._count;
    });

    return {
      total,
      byRole: roleStats,
      recentUsers,
    };
  }
}
