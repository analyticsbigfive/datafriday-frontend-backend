import { Injectable, Logger, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';

/**
 * CRUD for the Component taxonomy (ComponentType / ComponentCategory).
 * Mirrors the Market Price taxonomy but is a fully separate set of tables
 * so the two lists never share values.
 */
@Injectable()
export class ComponentTaxonomyService {
  private readonly logger = new Logger(ComponentTaxonomyService.name);

  constructor(private prisma: PrismaService) {}

  // BUG-87 : la contrainte unique Postgres (@@unique([tenantId, name])) est sensible à la casse —
  // sans ce garde-fou pré-insertion, "Sauce" et "sauce" peuvent coexister comme deux ComponentType
  // distincts pour le même tenant. Pattern identique à menu-items.service.ts:273/events.service.ts:593.
  private async assertTypeNameAvailable(name: string, tenantId: string | undefined, excludeId?: string) {
    const duplicate = await this.prisma.componentType.findFirst({
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
  // catégories de même nom sont autorisées si elles appartiennent à des ComponentType différents.
  private async assertCategoryNameAvailable(
    name: string,
    tenantId: string | undefined,
    typeId: string,
    excludeId?: string,
  ) {
    const duplicate = await this.prisma.componentCategory.findFirst({
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

  // ---------------- Types ----------------

  // BUG-169 : pagination réelle (skip/take), même shape/clamp que menu-items findAll —
  // évite un findMany() non borné sur ce référentiel. Le front (store componentTypes.js)
  // boucle sur les pages pour reconstituer la liste complète (contrat inchangé côté UI).
  // `search` : filtre serveur pour l'écran ComponentTypeList (pagination réelle), même
  // pattern que menu-items findAll (contains/insensitive sur le nom).
  async getTypes(tenantId: string, page = 1, limit = 200, search?: string) {
    const safeLimit = Math.min(Math.max(limit, 1), 500);
    const skip = (page - 1) * safeLimit;
    const where: any = { OR: [{ tenantId }, { tenantId: null }] };
    if (search) where.name = { contains: search, mode: 'insensitive' };
    const [data, total] = await Promise.all([
      this.prisma.componentType.findMany({
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
      this.prisma.componentType.count({ where }),
    ]);
    return { data, meta: { total, page, limit: safeLimit, totalPages: Math.ceil(total / safeLimit) } };
  }

  async createType(name: string, tenantId?: string) {
    await this.assertTypeNameAvailable(name, tenantId);
    return this.prisma.componentType.create({
      data: { name, tenantId },
      include: { categories: true },
    });
  }

  async updateType(id: string, name: string, tenantId: string) {
    const type = await this.prisma.componentType.findFirst({
      where: { id, OR: [{ tenantId }, { tenantId: null }] },
    });
    if (!type) {
      throw new NotFoundException(`Component type with ID ${id} not found`);
    }
    if (type.tenantId === null) {
      throw new BadRequestException(`Cannot update global component type`);
    }
    if (name !== undefined) {
      await this.assertTypeNameAvailable(name, tenantId, id);
    }
    const updated = await this.prisma.componentType.update({
      where: { id },
      data: { name },
      include: { categories: true },
    });
    this.logger.log(`Component type ${id} updated`);
    return updated;
  }

  async deleteType(id: string, tenantId: string) {
    const type = await this.prisma.componentType.findFirst({
      where: { id, OR: [{ tenantId }, { tenantId: null }] },
    });
    if (!type) {
      throw new NotFoundException(`Component type with ID ${id} not found`);
    }
    if (type.tenantId === null) {
      throw new BadRequestException(`Cannot delete global component type`);
    }
    // BUG-81 : ComponentCategory.type est onDelete: Cascade et MenuComponent.componentTypeId est
    // onDelete: SetNull — sans cette garde, supprimer un ComponentType cascade-supprime
    // silencieusement ses ComponentCategory enfants et met NULL sur MenuComponent.componentTypeId.
    // Même pattern que deleteEventType (BUG-75).
    const categoryCount = await this.prisma.componentCategory.count({ where: { typeId: id } });
    if (categoryCount > 0) {
      throw new ConflictException(
        `Impossible de supprimer ce type : ${categoryCount} catégorie(s) en dépendent encore. Supprimez-les d'abord.`,
      );
    }
    const componentCount = await this.prisma.menuComponent.count({ where: { componentTypeId: id } });
    if (componentCount > 0) {
      // Payload structuré pour que le front propose un lien direct vers /components filtré sur ce
      // type, plutôt que de laisser l'utilisateur chercher le bon composant à la main.
      throw new ConflictException({
        message: `Impossible de supprimer ce type : ${componentCount} composant(s) de menu en dépendent encore. Réassignez-les d'abord.`,
        blockedBy: 'menuComponents',
        count: componentCount,
        filterField: 'type',
        filterValue: type.name,
      });
    }
    await this.prisma.componentType.delete({ where: { id } });
    this.logger.log(`Component type ${id} deleted`);
  }

  // ---------------- Categories ----------------

  // BUG-169 : idem getTypes — pagination réelle, même shape/clamp que menu-items findAll.
  // `search` : filtre serveur pour l'écran ComponentCategoryList (pagination réelle), même
  // pattern que menu-items findAll (contains/insensitive sur le nom).
  async getCategories(tenantId: string, typeId?: string, page = 1, limit = 200, search?: string) {
    const safeLimit = Math.min(Math.max(limit, 1), 500);
    const skip = (page - 1) * safeLimit;
    const where: any = {
      AND: [
        { OR: [{ tenantId }, { tenantId: null }] },
        ...(typeId ? [{ typeId }] : []),
      ],
    };
    if (search) where.name = { contains: search, mode: 'insensitive' };
    const [data, total] = await Promise.all([
      this.prisma.componentCategory.findMany({
        where,
        orderBy: { name: 'asc' },
        include: { type: true },
        skip,
        take: safeLimit,
      }),
      this.prisma.componentCategory.count({ where }),
    ]);
    return { data, meta: { total, page, limit: safeLimit, totalPages: Math.ceil(total / safeLimit) } };
  }

  async createCategory(name: string, typeId: string | undefined, tenantId?: string) {
    if (!typeId) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: [
          {
            property: 'typeId',
            constraints: {
              isNotEmpty: 'typeId should not be empty',
              isString: 'typeId must be a string',
            },
            messages: ['typeId should not be empty', 'typeId must be a string'],
            value: typeId,
          },
        ],
      });
    }

    const type = await this.prisma.componentType.findFirst({
      where: { id: typeId, OR: [{ tenantId }, { tenantId: null }] },
    });
    if (!type) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: [
          {
            property: 'typeId',
            constraints: { exists: 'typeId must reference an accessible component type' },
            messages: ['typeId must reference an accessible component type'],
            value: typeId,
          },
        ],
      });
    }

    await this.assertCategoryNameAvailable(name, tenantId, typeId);

    return this.prisma.componentCategory.create({
      data: { name, tenantId, type: { connect: { id: typeId } } },
      include: { type: true },
    });
  }

  async updateCategory(
    id: string,
    data: { name?: string; typeId?: string },
    tenantId: string,
  ) {
    const category = await this.prisma.componentCategory.findFirst({
      where: { id, OR: [{ tenantId }, { tenantId: null }] },
    });
    if (!category) {
      throw new NotFoundException(`Component category with ID ${id} not found`);
    }
    if (category.tenantId === null) {
      throw new BadRequestException(`Cannot update global component category`);
    }

    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;

    if (data.typeId !== undefined) {
      const type = await this.prisma.componentType.findFirst({
        where: { id: data.typeId, OR: [{ tenantId }, { tenantId: null }] },
      });
      if (!type) {
        throw new BadRequestException({
          message: 'Validation failed',
          errors: [
            {
              property: 'typeId',
              constraints: { exists: 'typeId must reference an accessible component type' },
              messages: ['typeId must reference an accessible component type'],
              value: data.typeId,
            },
          ],
        });
      }
      updateData.type = { connect: { id: data.typeId } };
    }

    if (data.name !== undefined || data.typeId !== undefined) {
      await this.assertCategoryNameAvailable(
        data.name ?? category.name,
        tenantId,
        data.typeId ?? category.typeId,
        id,
      );
    }

    const updated = await this.prisma.componentCategory.update({
      where: { id },
      data: updateData,
      include: { type: true },
    });
    this.logger.log(`Component category ${id} updated`);
    return updated;
  }

  async deleteCategory(id: string, tenantId: string) {
    const category = await this.prisma.componentCategory.findFirst({
      where: { id, OR: [{ tenantId }, { tenantId: null }] },
    });
    if (!category) {
      throw new NotFoundException(`Component category with ID ${id} not found`);
    }
    if (category.tenantId === null) {
      throw new BadRequestException(`Cannot delete global component category`);
    }
    // BUG-81 : MenuComponent.componentCategoryId est onDelete: SetNull — sans cette garde,
    // supprimer une ComponentCategory encore utilisée met silencieusement NULL sur
    // MenuComponent.componentCategoryId. Même pattern que deleteEventCategory (BUG-75).
    const componentCount = await this.prisma.menuComponent.count({ where: { componentCategoryId: id } });
    if (componentCount > 0) {
      throw new ConflictException({
        message: `Impossible de supprimer cette catégorie : ${componentCount} composant(s) de menu en dépendent encore. Réassignez-les d'abord.`,
        blockedBy: 'menuComponents',
        count: componentCount,
        filterField: 'category',
        filterValue: category.name,
      });
    }
    await this.prisma.componentCategory.delete({ where: { id } });
    this.logger.log(`Component category ${id} deleted`);
  }
}
