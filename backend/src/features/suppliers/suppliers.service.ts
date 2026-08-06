import { Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { SupabaseStorageService } from '../../core/supabase/supabase-storage.service';
import { SpaceAccessService } from '../../core/auth/space-access.service';

/** Profil minimal nécessaire pour scoper une requête par espace accessible. */
type SpaceScopedUser = { id: string; isSuperAdmin: boolean; isOwner: boolean; allSpacesAccess: boolean };

@Injectable()
export class SuppliersService {
  private readonly logger = new Logger(SuppliersService.name);

  constructor(
    private prisma: PrismaService,
    private storage: SupabaseStorageService,
    private spaceAccess: SpaceAccessService,
  ) {}

  /**
   * Lève 403 si `user` n'a accès à aucun des espaces desservis par ce fournisseur (`sites`) —
   * que ce soit pour le LIRE (findOne) ou le modifier. Un fournisseur sans site déclaré
   * (`sites` vide, desservant tout le tenant) reste visible/modifiable par quiconque a la
   * permission fonctionnelle.
   */
  private async assertSpaceAccess(sites: string[] | undefined, user?: SpaceScopedUser) {
    if (!user || !sites?.length) return;
    if (this.spaceAccess.hasFullAccess(user)) return;
    const accessible = await this.spaceAccess.getAccessibleSpaceIds(user);
    if (accessible === 'ALL') return;
    const allowed = sites.some((sid) => accessible.includes(sid));
    if (!allowed) {
      throw new ForbiddenException("Vous n'avez pas accès à l'espace de ce fournisseur.");
    }
  }

  async create(createSupplierDto: CreateSupplierDto, tenantId: string) {
    this.logger.log(`Creating supplier "${createSupplierDto.name}" for tenant ${tenantId}`);
    try {
      const picture = await this.storage.resolveImage(createSupplierDto.picture, 'suppliers');
      const supplier = await this.prisma.supplier.create({
        data: {
          name: createSupplierDto.name,
          email: createSupplierDto.email,
          tel: createSupplierDto.phone,
          address: createSupplierDto.address,
          city: createSupplierDto.city,
          postcode: createSupplierDto.postcode,
          picture,
          notes: createSupplierDto.notes,
          contactName: createSupplierDto.contactName,
          sites: createSupplierDto.spaceIds || [],
          configurationIds: createSupplierDto.configurationIds || [],
          sectors: createSupplierDto.sectors || [],
          // tenantId est injecté par le middleware d'isolation (PrismaService).
          // On ne pose PAS la relation `tenant: { connect }` ici : elle entrerait
          // en conflit avec le scalaire `tenantId` injecté → "Unknown argument tenantId".
          tenantId,
        },
      });
      this.logger.log(`Supplier created successfully: ${supplier.id}`);
      return supplier;
    } catch (error) {
      this.logger.error(`Failed to create supplier: ${error.message}`, error.stack);
      if (error.code === 'P2003') {
        throw new BadRequestException(`Invalid tenantId provided`);
      }
      if (error.code === 'P2002') {
        throw new BadRequestException(`A supplier with this name already exists`);
      }
      throw error;
    }
  }

  async findAll(tenantId: string, page = 1, limit = 100, user?: SpaceScopedUser) {
    this.logger.log(`Fetching suppliers for tenant ${tenantId} (page=${page}, limit=${limit})`);
    try {
      const skip = (page - 1) * limit;
      // Un utilisateur restreint à certains espaces ne doit voir que les fournisseurs qui y
      // sont déclarés (+ les fournisseurs sans site déclaré, desservant tout le tenant) —
      // jamais la liste entière du tenant, y compris les espaces auxquels il n'a pas droit.
      const where: any = { tenantId };
      if (user && !this.spaceAccess.hasFullAccess(user)) {
        const accessible = await this.spaceAccess.getAccessibleSpaceIds(user);
        if (accessible !== 'ALL') {
          where.OR = [{ sites: { isEmpty: true } }, { sites: { hasSome: accessible } }];
        }
      }
      const [suppliers, total] = await this.prisma.$transaction([
        this.prisma.supplier.findMany({
          where,
          orderBy: { name: 'asc' },
          skip,
          take: limit,
        }),
        this.prisma.supplier.count({ where }),
      ]);
      this.logger.log(`Found ${suppliers.length} suppliers (total: ${total})`);
      return {
        data: suppliers,
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      };
    } catch (error) {
      this.logger.error(`Failed to fetch suppliers: ${error.message}`, error.stack);
      throw error;
    }
  }

  async findOne(id: string, tenantId: string, user?: SpaceScopedUser) {
    this.logger.log(`Fetching supplier ${id} for tenant ${tenantId}`);
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, tenantId },
    });

    if (!supplier) {
      this.logger.warn(`Supplier ${id} not found for tenant ${tenantId}`);
      throw new NotFoundException(`Supplier with ID ${id} not found`);
    }

    await this.assertSpaceAccess(supplier.sites, user);
    return supplier;
  }

  async update(id: string, updateSupplierDto: UpdateSupplierDto, tenantId: string, user?: SpaceScopedUser) {
    this.logger.log(`Updating supplier ${id} for tenant ${tenantId}`);
    // Verify existence
    await this.findOne(id, tenantId, user);

    const updateData: any = {};
    if (updateSupplierDto.name !== undefined) updateData.name = updateSupplierDto.name;
    if (updateSupplierDto.email !== undefined) updateData.email = updateSupplierDto.email;
    if (updateSupplierDto.phone !== undefined) updateData.tel = updateSupplierDto.phone;
    if (updateSupplierDto.address !== undefined) updateData.address = updateSupplierDto.address;
    if (updateSupplierDto.city !== undefined) updateData.city = updateSupplierDto.city;
    if (updateSupplierDto.postcode !== undefined) updateData.postcode = updateSupplierDto.postcode;
    if (updateSupplierDto.picture !== undefined) updateData.picture = await this.storage.resolveImage(updateSupplierDto.picture, 'suppliers');
    if (updateSupplierDto.contactName !== undefined) updateData.contactName = updateSupplierDto.contactName;
    if (updateSupplierDto.notes !== undefined) updateData.notes = updateSupplierDto.notes;
    if (updateSupplierDto.spaceIds !== undefined) updateData.sites = updateSupplierDto.spaceIds;
    if (updateSupplierDto.configurationIds !== undefined) updateData.configurationIds = updateSupplierDto.configurationIds;
    if (updateSupplierDto.sectors !== undefined) updateData.sectors = updateSupplierDto.sectors;

    try {
      const supplier = await this.prisma.supplier.update({
        where: { id },
        data: updateData,
      });
      this.logger.log(`Supplier ${id} updated successfully`);
      return supplier;
    } catch (error) {
      this.logger.error(`Failed to update supplier ${id}: ${error.message}`, error.stack);
      if (error.code === 'P2025') {
        throw new NotFoundException(`Supplier with ID ${id} not found`);
      }
      throw error;
    }
  }

  async remove(id: string, tenantId: string, user?: SpaceScopedUser) {
    this.logger.log(`Deleting supplier ${id} for tenant ${tenantId}`);
    // Verify existence
    await this.findOne(id, tenantId, user);

    try {
      const result = await this.prisma.supplier.delete({
        where: { id },
      });
      this.logger.log(`Supplier ${id} deleted successfully`);
      return result;
    } catch (error) {
      this.logger.error(`Failed to delete supplier ${id}: ${error.message}`, error.stack);
      if (error.code === 'P2025') {
        throw new NotFoundException(`Supplier with ID ${id} not found`);
      }
      throw error;
    }
  }
}
