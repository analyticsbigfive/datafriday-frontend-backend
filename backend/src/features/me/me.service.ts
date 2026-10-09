import { Injectable, NotFoundException } from '@nestjs/common';
import { CurrentUserData } from '../../core/auth/decorators/current-user.decorator';
import { PrismaService } from '../../core/database/prisma.service';
import { JwtDatabaseStrategy } from '../../core/auth/strategies/jwt-db-lookup.strategy';
import { UpdateMeDto } from './dto/update-me.dto';

/**
 * Profil de l'utilisateur connecté : lecture, mise à jour et organisation de rattachement.
 */
@Injectable()
export class MeService {

    constructor(
        private readonly prisma: PrismaService,
        private readonly jwtDatabaseStrategy: JwtDatabaseStrategy,
    ) { }

    /**
     * Get current user with their organization
     */
    async getCurrentUser(user: CurrentUserData) {
        if (!user.tenantId) {
            throw new NotFoundException('Utilisateur non trouvé en base (nécessite onboarding)');
        }

        return user;
    }

    /**
     * Update the current user's OWN profile (identity fields only).
     * Used notably when accepting an invitation (the invited user sets their name).
     * A user can never change their own role/permissions/tenant here.
     */
    async updateMe(user: CurrentUserData, dto: UpdateMeDto) {
        const data: any = {};
        if (dto.firstName !== undefined) data.firstName = dto.firstName;
        if (dto.lastName !== undefined) data.lastName = dto.lastName;
        if (dto.phone !== undefined) data.phone = dto.phone;
        if (dto.avatar !== undefined) data.avatar = dto.avatar;

        if (dto.firstName !== undefined || dto.lastName !== undefined) {
            const current = await this.prisma.user.findUnique({
                where: { id: user.id },
                select: { firstName: true, lastName: true },
            });
            const firstName = dto.firstName ?? current?.firstName ?? '';
            const lastName = dto.lastName ?? current?.lastName ?? '';
            data.fullName = `${firstName} ${lastName}`.trim();
        }

        const updated = await this.prisma.user.update({
            where: { id: user.id },
            data,
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                fullName: true,
                phone: true,
                avatar: true,
                tenantId: true,
            },
        });

        // Identity fields are part of the cached auth payload — refresh it everywhere.
        await this.jwtDatabaseStrategy.invalidateUserCache(user.id);

        return updated;
    }

    /**
     * Get current user's tenant/organization
     */
    async getCurrentUserTenant(user: any) {
        const dbUser = await this.prisma.user.findUnique({
            where: { id: user.id },
            include: {
                tenant: true,
            },
        });

        if (!dbUser?.tenant) {
            throw new NotFoundException('Aucune organisation associée à cet utilisateur');
        }

        return dbUser.tenant;
    }
}
