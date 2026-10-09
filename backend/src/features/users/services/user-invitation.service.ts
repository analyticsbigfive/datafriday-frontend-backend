import { Injectable, NotFoundException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../core/database/prisma.service';
import { JwtDatabaseStrategy } from '../../../core/auth/strategies/jwt-db-lookup.strategy';
import { SupabaseAdminService } from '../../../core/supabase/supabase-admin.service';
import { InviteUserDto } from '../dto/invite-user.dto';
import { UserRole } from '@prisma/client';
import { UserSupportService } from './user-support.service';

/**
 * Invitation d'un utilisateur (nouveau compte ou compte existant rattaché au tenant) et relance.
 */
@Injectable()
export class UserInvitationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtDatabaseStrategy: JwtDatabaseStrategy,
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly config: ConfigService,
    private readonly userSupportService: UserSupportService,
  ) {}

  private readonly logger = new Logger(UserInvitationService.name);

  /**
   * Invite a user to the tenant.
   *
   * Three cases, handled gracefully:
   *  - brand-new email → create the Supabase account + send the invitation email;
   *  - email already has a Supabase account but no DB profile → attach it to this
   *    tenant (they sign in with their existing password, no email);
   *  - email already belongs to a DB profile → clear 409 (already member here, or
   *    rattached to another organization).
   */
  async invite(tenantId: string, dto: InviteUserDto, invitedBy: string) {
    // Already a member of THIS tenant?
    const existing = await this.prisma.user.findFirst({
      where: { email: dto.email, tenantId },
    });

    if (existing) {
      throw new ConflictException(`User ${dto.email} is already a member of this organization`);
    }

    const { systemKey: role, roleId } = await this.userSupportService.resolveRole(tenantId, {
      roleId: dto.roleId,
      role: dto.role,
    });

    // Admin may pre-fill the name; otherwise the invitee sets it on acceptance.
    const firstName = dto.firstName?.trim() || 'Invited';
    const lastName = dto.lastName?.trim() || 'User';
    const fullName = `${firstName} ${lastName}`.trim();
    const profile = { email: dto.email, firstName, lastName, fullName, phone: dto.phone ?? null, role, roleId };
    const spaceOpts = { allSpaces: dto.allSpaces, spaceIds: dto.spaceIds };

    // Does this email already have a Supabase auth account?
    const existingSupabaseUser = await this.supabaseAdmin.getUserByEmail(dto.email);
    if (existingSupabaseUser) {
      return this.attachExistingAccountToTenant(existingSupabaseUser.id, tenantId, profile, spaceOpts);
    }

    // Brand-new person: send the real invitation email + create the (pending) auth
    // user. The returned id is reused as the DB User id so they can authenticate.
    const redirectTo = this.config.get<string>('INVITE_REDIRECT_URL');
    const supabaseUser = await this.supabaseAdmin.inviteUserByEmail(dto.email, {
      redirectTo,
      data: { tenantId, invitedBy, firstName, lastName },
    });

    // Mirror in our DB (pending profile, completed when the invite is accepted).
    try {
      const user = await this.createMembership(supabaseUser.id, tenantId, profile, spaceOpts);
      this.logger.log(
        `Invitation sent to ${dto.email} (${user.id}) for tenant ${tenantId} by ${invitedBy}`,
      );
      return {
        success: true,
        message: `Invitation sent to ${dto.email}`,
        user: this.userSupportService.sanitizeUser(user),
      };
    } catch (error) {
      await this.supabaseAdmin.deleteUser(supabaseUser.id);
      this.logger.error(
        `DB user creation failed for invite ${dto.email}; rolled back Supabase account ${supabaseUser.id}`,
      );
      throw error;
    }
  }

  /**
   * Re-send the invitation email to a user who was invited but never logged in.
   *
   * Supabase's `inviteUserByEmail` (the only primitive that actually *sends* an
   * email) refuses an existing account, so we can't just call it twice. Instead,
   * for a still-pending user we tear down the stale auth+DB records (capturing
   * role + space scope first) and run a fresh invite — preserving their access.
   *
   * Guard rails:
   *  - the user must exist in this tenant (404 otherwise);
   *  - if they have already signed in → 409 (re-invite is pointless; tell them to
   *    use "forgot password");
   *  - if the account is attached to several organizations → 409 (recreating the
   *    id would break the other memberships; use password reset instead).
   */
  async reinvite(id: string, tenantId: string, invitedBy: string) {
    if (!this.supabaseAdmin.isEnabled()) {
      throw new BadRequestException(
        'La réinvitation nécessite la configuration Supabase Admin (SUPABASE_SERVICE_ROLE_KEY).',
      );
    }

    const user = await this.prisma.user.findFirst({ where: { id, tenantId } });
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    // Already active? (signed in at least once) → re-invite is a no-op.
    const authUser = await this.supabaseAdmin.getUserById(id);
    if (authUser?.last_sign_in_at) {
      throw new ConflictException(
        "Cet utilisateur s'est déjà connecté — la réinvitation est inutile. Il peut utiliser « mot de passe oublié ».",
      );
    }

    // Recreating the Supabase id is only safe when this is the user's sole org.
    const membershipCount = await this.prisma.userTenant.count({ where: { userId: id } });
    if (membershipCount > 1) {
      throw new ConflictException(
        'Ce compte est rattaché à plusieurs organisations — utilisez la réinitialisation de mot de passe plutôt que la réinvitation.',
      );
    }

    // Preserve role + explicit space access across the fresh invite.
    const spaceAccess = await this.prisma.userSpaceAccess.findMany({
      where: { userId: id, space: { tenantId } },
      select: { spaceId: true },
    });
    const inviteDto: InviteUserDto = {
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone ?? undefined,
      roleId: user.roleId ?? undefined,
      role: user.roleId ? undefined : user.role,
      allSpaces: user.allSpacesAccess,
      spaceIds: user.allSpacesAccess ? undefined : spaceAccess.map((s) => s.spaceId),
    };

    // Tear down the stale pending records (DB cascade removes membership + space
    // access + pins), then send a brand-new invitation email.
    await this.supabaseAdmin.deleteUser(id);
    await this.prisma.user.delete({ where: { id } });
    await this.jwtDatabaseStrategy.invalidateUserCache(id);

    const result = await this.invite(tenantId, inviteDto, invitedBy);

    this.logger.log(`User ${user.email} re-invited for tenant ${tenantId} by ${invitedBy}`);

    return {
      success: true,
      message: `Invitation renvoyée à ${user.email}`,
      user: result.user,
    };
  }

  /**
   * Attach an EXISTING Supabase account to a tenant. Never duplicates the User
   * row (User.id = Supabase id is the primary key).
   */
  private async attachExistingAccountToTenant(
    supabaseUserId: string,
    tenantId: string,
    profile: { email: string; firstName: string; lastName: string; fullName: string; phone?: string | null; role: UserRole; roleId: string | null },
    spaceOpts: { allSpaces?: boolean; spaceIds?: string[] } = {},
  ) {
    const dbUser = await this.prisma.user.findUnique({ where: { id: supabaseUserId } });

    if (dbUser) {
      if (dbUser.tenantId === tenantId) {
        throw new ConflictException(`User ${profile.email} is already a member of this organization`);
      }
      // Multi-organization per user isn't exposed in the app yet — fail clearly.
      throw new ConflictException(
        `Un compte existe déjà avec l'email ${profile.email} et est rattaché à une autre organisation.`,
      );
    }

    // Supabase account exists but no DB profile (e.g. abandoned signup): create
    // the profile + membership. They already have a password → no email needed.
    const user = await this.createMembership(supabaseUserId, tenantId, profile, spaceOpts);
    await this.jwtDatabaseStrategy.invalidateUserCache(user.id);
    this.logger.log(`Linked existing Supabase account ${supabaseUserId} to tenant ${tenantId}`);

    return {
      success: true,
      message:
        "Ce compte existait déjà : il a été rattaché à votre organisation. L'utilisateur peut se connecter avec son mot de passe existant.",
      user: this.userSupportService.sanitizeUser(user),
    };
  }

  /**
   * Create the User row + UserTenant membership for a given Supabase id, plus les
   * accès espaces optionnels (`allSpaces`/`spaceIds`). Transactionnel.
   */
  private async createMembership(
    userId: string,
    tenantId: string,
    profile: { email: string; firstName: string; lastName: string; fullName: string; phone?: string | null; role: UserRole; roleId: string | null },
    spaceOpts: { allSpaces?: boolean; spaceIds?: string[] } = {},
  ) {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          id: userId,
          email: profile.email,
          firstName: profile.firstName,
          lastName: profile.lastName,
          fullName: profile.fullName,
          phone: profile.phone ?? null,
          role: profile.role,
          roleId: profile.roleId,
          tenantId,
          allSpacesAccess: !!spaceOpts.allSpaces,
        },
      });

      await tx.userTenant.create({
        data: {
          userId: user.id,
          tenantId,
          role: profile.role,
          roleId: profile.roleId,
          isOwner: false,
        },
      });

      if (!spaceOpts.allSpaces) {
        const spaceIds = await this.userSupportService.resolveTargetSpaceIds(tx, tenantId, spaceOpts);
        if (spaceIds.length) {
          await tx.userSpaceAccess.createMany({
            data: spaceIds.map((spaceId) => ({ userId: user.id, spaceId, role: profile.role })),
            skipDuplicates: true,
          });
        }
      }

      return user;
    });
  }
}
