import { Injectable, Logger, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';

/**
 * Types et catégories de produits du tenant.
 */
@Injectable()
export class ProductTaxonomyService {
  constructor(
    private prisma: PrismaService,
  ) {}

  private readonly logger = new Logger(ProductTaxonomyService.name);

  // ── ProductType & ProductCategory ────────────────
  // BUG-169 : pagination réelle (skip/take), même shape/clamp que findAll (menu-items) —
  // évite un findMany() non borné sur ce référentiel. Le front (store productTypes.js)
  // boucle sur les pages pour reconstituer la liste complète (contrat inchangé côté UI).
  async getProductTypes(tenantId: string, page = 1, limit = 200, search?: string) {
    const safeLimit = Math.min(Math.max(limit, 1), 500);
    const skip = (page - 1) * safeLimit;
    const where: any = {
      AND: [
        { OR: [{ tenantId }, { tenantId: null }] },
        ...(search ? [{ name: { contains: search, mode: 'insensitive' } }] : []),
      ],
    };
    const [data, total] = await Promise.all([
      this.prisma.productType.findMany({
        where,
        orderBy: { name: 'asc' },
        include: {
          categories: {
            where: { OR: [{ tenantId }, { tenantId: null }] },
          },
        },
        skip,
        take: safeLimit,
      }),
      this.prisma.productType.count({ where }),
    ]);
    return { data, meta: { total, page, limit: safeLimit, totalPages: Math.ceil(total / safeLimit) } };
  }

  // BUG-87 : la contrainte unique Postgres (@@unique([tenantId, name])) est sensible à la casse —
  // sans ce garde-fou pré-insertion, "Food" et "food" peuvent coexister comme deux ProductType
  // distincts pour le même tenant. Pattern identique à menu-items.service.ts:273 (dedupeByName).
  private async assertProductTypeNameAvailable(name: string, tenantId: string | undefined, excludeId?: string) {
    const duplicate = await this.prisma.productType.findFirst({
      where: {
        tenantId,
        name: { equals: name, mode: 'insensitive' },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    if (duplicate) {
      throw new BadRequestException(`Un type nommé « ${name} » existe déjà`);
    }
  }

  // Scope aligné sur la contrainte unique réelle (@@unique([tenantId, typeId, name])) : deux
  // catégories de même nom sont autorisées si elles appartiennent à des ProductType différents.
  private async assertProductCategoryNameAvailable(
    name: string,
    tenantId: string | undefined,
    typeId: string,
    excludeId?: string,
  ) {
    const duplicate = await this.prisma.productCategory.findFirst({
      where: {
        tenantId,
        typeId,
        name: { equals: name, mode: 'insensitive' },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    if (duplicate) {
      throw new BadRequestException(`Une catégorie nommée « ${name} » existe déjà pour ce type`);
    }
  }

  async createProductType(name: string, tenantId?: string) {
    await this.assertProductTypeNameAvailable(name, tenantId);
    try {
      return await this.prisma.productType.create({ data: { name, tenantId }, include: { categories: true } });
    } catch (error) {
      if (error.code === 'P2002') {
        throw new BadRequestException(`Un type nommé « ${name} » existe déjà`);
      }
      throw error;
    }
  }

  async deleteProductType(id: string, tenantId: string) {
    const productType = await this.prisma.productType.findFirst({
      where: { id, OR: [{ tenantId }, { tenantId: null }] },
    });

    if (!productType) {
      throw new NotFoundException(`Product type with ID ${id} not found`);
    }

    // BUG-79 : ProductCategory.type est onDelete: Cascade et MenuItem.typeId n'a pas d'onDelete
    // explicite (SET NULL par défaut) — sans cette garde, supprimer un ProductType cascade-supprime
    // silencieusement ses ProductCategory enfants et met NULL sur MenuItem.typeId. Même pattern que
    // deleteEventType (BUG-75, events.service.ts:297-309).
    // Ces comptages ne filtrent pas par tenantId : pour un type global (tenantId null, partagé par
    // tous les tenants), c'est l'usage réel, tous tenants confondus, qui doit bloquer la suppression —
    // pas le simple fait d'être global. Un type système sans aucune dépendance est supprimable.
    const categoryCount = await this.prisma.productCategory.count({ where: { typeId: id } });
    if (categoryCount > 0) {
      throw new ConflictException(
        `Impossible de supprimer ce type : ${categoryCount} catégorie(s) en dépendent encore. Supprimez-les d'abord.`,
      );
    }
    // deletedAt: null — les menu items sont SOFT-deleted (remove() pose deletedAt) ; sans ce
    // filtre, des articles déjà supprimés bloquaient encore la suppression du type.
    const menuItemCount = await this.prisma.menuItem.count({ where: { typeId: id, deletedAt: null } });
    if (menuItemCount > 0) {
      // Payload structuré (au-delà du `message`) pour que le front puisse proposer un lien direct
      // vers la liste des Menu Items déjà filtrée sur ce type, plutôt que de laisser l'utilisateur
      // chercher "le bon menu item" à la main parmi potentiellement des milliers de lignes.
      throw new ConflictException({
        message: `Impossible de supprimer ce type : ${menuItemCount} article(s) de menu en dépendent encore. Réassignez-les d'abord.`,
        blockedBy: 'menuItems',
        count: menuItemCount,
        filterField: 'type',
        filterValue: productType.name,
      });
    }

    await this.prisma.productType.delete({ where: { id } });
    this.logger.log(`Product type ${id} deleted`);
  }

  async updateProductType(id: string, name: string, tenantId: string) {
    const productType = await this.prisma.productType.findFirst({
      where: { id, OR: [{ tenantId }, { tenantId: null }] },
    });

    if (!productType) {
      throw new NotFoundException(`Product type with ID ${id} not found`);
    }

    if (productType.tenantId === null) {
      throw new BadRequestException(`Cannot update global product type`);
    }

    if (name !== undefined) {
      await this.assertProductTypeNameAvailable(name, tenantId, id);
    }

    const updated = await this.prisma.productType.update({
      where: { id },
      data: { name },
      include: { categories: true },
    });
    this.logger.log(`Product type ${id} updated`);
    return updated;
  }

  // BUG-169 : idem getProductTypes — pagination réelle, même shape/clamp que findAll.
  async getProductCategories(tenantId: string, typeId?: string, page = 1, limit = 200, search?: string) {
    const safeLimit = Math.min(Math.max(limit, 1), 500);
    const skip = (page - 1) * safeLimit;
    const where: any = {
      AND: [
        { OR: [{ tenantId }, { tenantId: null }] },
        ...(typeId ? [{ typeId }] : []),
        ...(search ? [{ name: { contains: search, mode: 'insensitive' } }] : []),
      ],
    };
    const [data, total] = await Promise.all([
      this.prisma.productCategory.findMany({
        where,
        orderBy: { name: 'asc' },
        include: { type: true },
        skip,
        take: safeLimit,
      }),
      this.prisma.productCategory.count({ where }),
    ]);
    return { data, meta: { total, page, limit: safeLimit, totalPages: Math.ceil(total / safeLimit) } };
  }

  async createProductCategory(
    name: string,
    typeId?: string,
    tenantId?: string,
    productTypeId?: string,
  ) {
    const resolvedTypeId = typeId ?? productTypeId;

    if (!resolvedTypeId) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: [
          {
            property: 'typeId',
            constraints: {
              isNotEmpty: 'typeId should not be empty',
              isString: 'typeId must be a string',
            },
            messages: [
              'typeId should not be empty',
              'typeId must be a string',
            ],
            value: resolvedTypeId,
          },
        ],
      });
    }

    const productType = await this.prisma.productType.findFirst({
      where: {
        id: resolvedTypeId,
        OR: [{ tenantId }, { tenantId: null }],
      },
    });

    if (!productType) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: [
          {
            property: 'typeId',
            constraints: {
              exists: 'typeId must reference an accessible product type',
            },
            messages: ['typeId must reference an accessible product type'],
            value: resolvedTypeId,
          },
        ],
      });
    }

    await this.assertProductCategoryNameAvailable(name, tenantId, resolvedTypeId);

    try {
      return await this.prisma.productCategory.create({
        data: {
          name,
          tenantId,
          type: {
            connect: { id: resolvedTypeId },
          },
        },
        include: { type: true },
      });
    } catch (error) {
      if (error.code === 'P2002') {
        throw new BadRequestException(`Une catégorie nommée « ${name} » existe déjà pour ce type`);
      }
      throw error;
    }
  }

  async deleteProductCategory(id: string, tenantId: string) {
    const productCategory = await this.prisma.productCategory.findFirst({
      where: { id, OR: [{ tenantId }, { tenantId: null }] },
    });

    if (!productCategory) {
      throw new NotFoundException(`Product category with ID ${id} not found`);
    }

    // BUG-79 : MenuItem.categoryId n'a pas d'onDelete explicite (SET NULL par défaut) — sans cette
    // garde, supprimer une ProductCategory encore utilisée met silencieusement NULL sur
    // MenuItem.categoryId. Même pattern que deleteEventCategory (BUG-75).
    // Comptage non filtré par tenantId : pour une catégorie globale, c'est l'usage réel tous
    // tenants confondus qui doit bloquer la suppression — pas le simple fait d'être globale.
    // deletedAt: null — menu items SOFT-deleted : ne pas compter les articles déjà supprimés,
    // sinon la catégorie reste bloquée alors que plus aucun article actif ne l'utilise.
    const menuItemCount = await this.prisma.menuItem.count({ where: { categoryId: id, deletedAt: null } });
    if (menuItemCount > 0) {
      throw new ConflictException({
        message: `Impossible de supprimer cette catégorie : ${menuItemCount} article(s) de menu en dépendent encore. Réassignez-les d'abord.`,
        blockedBy: 'menuItems',
        count: menuItemCount,
        filterField: 'category',
        filterValue: productCategory.name,
      });
    }

    await this.prisma.productCategory.delete({ where: { id } });
    this.logger.log(`Product category ${id} deleted`);
  }

  async updateProductCategory(
    id: string,
    data: { name?: string; typeId?: string; productTypeId?: string },
    tenantId: string,
  ) {
    const productCategory = await this.prisma.productCategory.findFirst({
      where: { id, OR: [{ tenantId }, { tenantId: null }] },
    });

    if (!productCategory) {
      throw new NotFoundException(`Product category with ID ${id} not found`);
    }

    if (productCategory.tenantId === null) {
      throw new BadRequestException(`Cannot update global product category`);
    }

    const resolvedTypeId = data.typeId ?? data.productTypeId;
    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;

    if (resolvedTypeId !== undefined) {
      const productType = await this.prisma.productType.findFirst({
        where: { id: resolvedTypeId, OR: [{ tenantId }, { tenantId: null }] },
      });
      if (!productType) {
        throw new BadRequestException({
          message: 'Validation failed',
          errors: [
            {
              property: 'typeId',
              constraints: {
                exists: 'typeId must reference an accessible product type',
              },
              messages: ['typeId must reference an accessible product type'],
              value: resolvedTypeId,
            },
          ],
        });
      }
      updateData.type = { connect: { id: resolvedTypeId } };
    }

    if (data.name !== undefined || resolvedTypeId !== undefined) {
      await this.assertProductCategoryNameAvailable(
        data.name ?? productCategory.name,
        tenantId,
        resolvedTypeId ?? productCategory.typeId,
        id,
      );
    }

    const updated = await this.prisma.productCategory.update({
      where: { id },
      data: updateData,
      include: { type: true },
    });
    this.logger.log(`Product category ${id} updated`);
    return updated;
  }
}
