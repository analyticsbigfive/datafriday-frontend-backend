import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { SupabaseStorageService } from '../../core/supabase/supabase-storage.service';
import { SpaceAccessService } from '../../core/auth/space-access.service';
import { RedisService } from '../../core/redis/redis.service';
import { mergeScopedSpaces } from '../../shared/utils/scoped-spaces';
import { CreateKitchenDto } from './dto/create-kitchen.dto';
import { UpdateKitchenDto } from './dto/update-kitchen.dto';

/** Profil minimal nécessaire pour scoper une requête par espace accessible. */
type SpaceScopedUser = { id: string; isSuperAdmin: boolean; isOwner: boolean; allSpacesAccess: boolean };

/**
 * Cuisines de préparation (Settings > Menu F&B > Cuisines, demande Bertrand 2026-10-08).
 * Même fiche et même règle d'accès que les fournisseurs (SuppliersService) : un compte
 * restreint ne voit que les cuisines rattachées à l'un de ses espaces.
 */
@Injectable()
export class KitchensService {
  private readonly logger = new Logger(KitchensService.name);

  constructor(
    private prisma: PrismaService,
    private storage: SupabaseStorageService,
    private spaceAccess: SpaceAccessService,
    private redis: RedisService,
  ) {}

  private async visibleSpaces(user?: SpaceScopedUser): Promise<'ALL' | string[]> {
    if (!user || this.spaceAccess.hasFullAccess(user)) return 'ALL';
    return this.spaceAccess.getAccessibleSpaceIds(user);
  }

  /** Un compte restreint n'ajoute que ses espaces ; ceux qu'il ne voit pas sont conservés. */
  private async scopedSites(requested: string[], existing: string[], user?: SpaceScopedUser) {
    const { spaces, foreign } = mergeScopedSpaces(requested, existing, await this.visibleSpaces(user));
    if (foreign.length) {
      throw new ForbiddenException("Vous ne pouvez rattacher une cuisine qu'à vos propres espaces.");
    }
    return spaces;
  }

  private async assertSpaceAccess(sites: string[] | undefined, user?: SpaceScopedUser) {
    if (!user || this.spaceAccess.hasFullAccess(user)) return;
    const accessible = await this.spaceAccess.getAccessibleSpaceIds(user);
    if (accessible === 'ALL') return;
    if (!sites?.some((sid) => accessible.includes(sid))) {
      throw new ForbiddenException("Vous n'avez pas accès à l'espace de cette cuisine.");
    }
  }

  async create(dto: CreateKitchenDto, tenantId: string, user?: SpaceScopedUser) {
    // Un compte restreint ne rattache une cuisine qu'à ses propres espaces.
    const sites = await this.scopedSites(dto.spaceIds, [], user);
    const picture = await this.storage.resolveImage(dto.picture, 'kitchens');
    const kitchen = await this.prisma.kitchen.create({
      data: {
        name: dto.name,
        picture,
        contactName: dto.contactName,
        email: dto.email || null,
        tel: dto.phone,
        address: dto.address,
        city: dto.city,
        postcode: dto.postcode,
        sites,
        notes: dto.notes,
        // tenantId injecté aussi par le middleware d'isolation (cf. SuppliersService).
        tenantId,
      },
    });
    this.logger.log(`Kitchen created: ${kitchen.id}`);
    return kitchen;
  }

  async findAll(tenantId: string, page = 1, limit = 100, user?: SpaceScopedUser) {
    const where: Prisma.KitchenWhereInput = { tenantId };
    if (user && !this.spaceAccess.hasFullAccess(user)) {
      const accessible = await this.spaceAccess.getAccessibleSpaceIds(user);
      if (accessible !== 'ALL') where.sites = { hasSome: accessible };
    }
    const [kitchens, total] = await this.prisma.$transaction([
      this.prisma.kitchen.findMany({ where, orderBy: { name: 'asc' }, skip: (page - 1) * limit, take: limit }),
      this.prisma.kitchen.count({ where }),
    ]);
    return { data: kitchens, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: string, tenantId: string, user?: SpaceScopedUser) {
    const kitchen = await this.prisma.kitchen.findFirst({ where: { id, tenantId } });
    if (!kitchen) throw new NotFoundException(`Kitchen with ID ${id} not found`);
    await this.assertSpaceAccess(kitchen.sites, user);
    return kitchen;
  }

  async update(id: string, dto: UpdateKitchenDto, tenantId: string, user?: SpaceScopedUser) {
    const existing = await this.findOne(id, tenantId, user);
    const data: Prisma.KitchenUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.picture !== undefined) data.picture = await this.storage.resolveImage(dto.picture, 'kitchens');
    if (dto.contactName !== undefined) data.contactName = dto.contactName;
    if (dto.email !== undefined) data.email = dto.email || null;
    if (dto.phone !== undefined) data.tel = dto.phone;
    if (dto.address !== undefined) data.address = dto.address;
    if (dto.city !== undefined) data.city = dto.city;
    if (dto.postcode !== undefined) data.postcode = dto.postcode;
    if (dto.spaceIds !== undefined) data.sites = await this.scopedSites(dto.spaceIds, existing.sites, user);
    if (dto.notes !== undefined) data.notes = dto.notes;
    return this.prisma.kitchen.update({ where: { id }, data });
  }

  /**
   * Les fiches qui préparaient dans cette cuisine perdent leur cuisine (champ vide),
   * pas seulement le lien : sans ça elles resteraient « Central » sans cuisine.
   */
  async remove(id: string, tenantId: string, user?: SpaceScopedUser) {
    await this.findOne(id, tenantId, user);
    const [, , kitchen] = await this.prisma.$transaction([
      this.prisma.menuComponent.updateMany({ where: { kitchenId: id }, data: { kitchenId: null, kitchenType: null } }),
      this.prisma.menuItem.updateMany({ where: { kitchenId: id }, data: { kitchenId: null, kitchenType: null } }),
      this.prisma.kitchen.delete({ where: { id } }),
    ]);
    // Listes en cache des composants et menu items : elles portaient encore cette cuisine.
    await Promise.all([
      this.redis.deletePattern(`menu-components:${tenantId}:*`),
      this.redis.deletePattern(`menu-items:${tenantId}:*`),
    ]);
    this.logger.log(`Kitchen ${id} deleted`);
    return kitchen;
  }
}
