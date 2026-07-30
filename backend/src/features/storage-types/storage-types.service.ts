import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';

@Injectable()
export class StorageTypesService {
  constructor(private prisma: PrismaService) {}

  // Même pagination bornée que packing-types.service.ts::findAll.
  async findAll(tenantId: string, page = 1, limit = 200, search?: string) {
    const safePage = Math.max(page, 1);
    const safeLimit = Math.min(Math.max(limit, 1), 500);
    const where: any = { tenantId };
    if (search) where.name = { contains: search, mode: 'insensitive' };
    const [data, total] = await Promise.all([
      this.prisma.storageType.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
      }),
      this.prisma.storageType.count({ where }),
    ]);
    return {
      data,
      meta: { total, page: safePage, limit: safeLimit, totalPages: Math.ceil(total / safeLimit) || 1 },
    };
  }

  // Même idiome BUG-87 que packing-types.service.ts (dup check insensible à la casse en plus
  // de la contrainte DB, case-sensitive).
  private async assertNoDuplicateName(name: string, tenantId: string, excludeId?: string) {
    const duplicate = await this.prisma.storageType.findFirst({
      where: {
        tenantId,
        name: { equals: name, mode: 'insensitive' },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    if (duplicate) {
      throw new BadRequestException(`A storage type "${name}" already exists`);
    }
  }

  async create(name: string, tenantId: string) {
    const trimmed = name.trim();
    await this.assertNoDuplicateName(trimmed, tenantId);
    try {
      // `code` reste null pour toute ligne créée par un tenant : elle n'existe encore dans
      // aucun SpaceElement.subtypes[] du Builder, donc pas besoin d'identifiant stable.
      return await this.prisma.storageType.create({
        data: { name: trimmed, tenantId, code: null },
      });
    } catch (error) {
      if (error.code === 'P2002') {
        throw new BadRequestException(`A storage type "${name}" already exists`);
      }
      throw error;
    }
  }

  async findOne(id: string, tenantId: string) {
    const item = await this.prisma.storageType.findFirst({ where: { id, tenantId } });
    if (!item) throw new NotFoundException(`StorageType ${id} not found`);
    return item;
  }

  async update(id: string, name: string | undefined, tenantId: string) {
    const item = await this.prisma.storageType.findFirst({ where: { id, tenantId } });
    if (!item) throw new NotFoundException(`StorageType ${id} not found`);
    if (name === undefined) return item;

    const trimmed = name.trim();
    const oldName = item.name;
    const nameChanged = trimmed !== oldName;
    if (nameChanged) {
      await this.assertNoDuplicateName(trimmed, tenantId, id);
    }

    try {
      // Renommer une ligne historique (code non-null, ex. "Cold") reste autorisé : le Builder ne
      // dépend que de `code`, jamais de `name` — voir le commentaire du modèle StorageType.
      // Cascade de renommage en transaction, même motif que packing-types.service.ts (BUG-84),
      // étendue aux 7 colonnes qui stockent ce nom en texte libre. MenuItem.storageType est un
      // tableau : pas de `updateMany` array-replace natif en Prisma, on utilise array_replace()
      // en SQL brut dans la même transaction (Prisma 5.x autorise de mélanger $executeRaw et des
      // appels de modèle dans la forme tableau de $transaction).
      const [updated] = await this.prisma.$transaction([
        this.prisma.storageType.update({
          where: { id },
          data: { name: trimmed },
        }),
        ...(nameChanged
          ? [
              this.prisma.ingredient.updateMany({
                where: { storageType: oldName, tenantId },
                data: { storageType: trimmed },
              }),
              this.prisma.packaging.updateMany({
                where: { storageType: oldName, tenantId },
                data: { storageType: trimmed },
              }),
              this.prisma.menuComponent.updateMany({
                where: { storageType: oldName, tenantId },
                data: { storageType: trimmed },
              }),
              this.prisma.menuItemComponent.updateMany({
                where: { storageType: oldName, menuItem: { tenantId } },
                data: { storageType: trimmed },
              }),
              this.prisma.menuItemIngredient.updateMany({
                where: { storageType: oldName, menuItem: { tenantId } },
                data: { storageType: trimmed },
              }),
              this.prisma.menuItemPackaging.updateMany({
                where: { storageType: oldName, menuItem: { tenantId } },
                data: { storageType: trimmed },
              }),
              this.prisma.$executeRaw`UPDATE "MenuItem" SET "storageType" = array_replace("storageType", ${oldName}, ${trimmed}) WHERE "tenantId" = ${tenantId} AND ${oldName} = ANY("storageType")`,
            ]
          : []),
      ]);
      return updated;
    } catch (error) {
      if (error.code === 'P2002') {
        throw new BadRequestException(`A storage type "${name}" already exists`);
      }
      throw error;
    }
  }

  async remove(id: string, tenantId: string) {
    const item = await this.prisma.storageType.findFirst({ where: { id, tenantId } });
    if (!item) throw new NotFoundException(`StorageType ${id} not found`);

    // Une ligne `code`-portée (Dry/Cold/Frozen historiques) ne peut jamais être supprimée, sans
    // exception : le Builder y réfère par ce code stable dans SpaceElement.subtypes[], sans
    // cascade possible côté plan (contrairement au renommage, décorrélé de `code`).
    if (item.code !== null) {
      throw new BadRequestException(
        `Impossible de supprimer "${item.name}" : ce type de stockage historique est utilisé par le Builder 3D.`,
      );
    }

    const [ingredientCount, packagingCount, menuComponentCount, miComponentCount, miIngredientCount, miPackagingCount, menuItemRows] =
      await Promise.all([
        this.prisma.ingredient.count({ where: { storageType: item.name, tenantId } }),
        this.prisma.packaging.count({ where: { storageType: item.name, tenantId } }),
        this.prisma.menuComponent.count({ where: { storageType: item.name, tenantId } }),
        this.prisma.menuItemComponent.count({ where: { storageType: item.name, menuItem: { tenantId } } }),
        this.prisma.menuItemIngredient.count({ where: { storageType: item.name, menuItem: { tenantId } } }),
        this.prisma.menuItemPackaging.count({ where: { storageType: item.name, menuItem: { tenantId } } }),
        this.prisma.menuItem.count({ where: { storageType: { has: item.name }, tenantId } }),
      ]);
    const totalUsage =
      ingredientCount + packagingCount + menuComponentCount + miComponentCount + miIngredientCount + miPackagingCount + menuItemRows;

    if (totalUsage > 0) {
      // Même payload structuré que ComponentType/PackingType pour le deep-link frontend.
      throw new ConflictException({
        message: `Impossible de supprimer ce type de stockage : ${totalUsage} élément(s) l'utilisent encore.`,
        blockedBy: 'storageType',
        count: totalUsage,
        filterField: 'storageType',
        filterValue: item.name,
      });
    }

    await this.prisma.storageType.delete({ where: { id } });
    return { deleted: true };
  }
}
