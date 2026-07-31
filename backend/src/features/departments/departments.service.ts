import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';

export interface UpsertDepartmentInput {
  name?: string;
  color?: string;
  icon?: string;
  needsRh?: boolean;
  isSeller?: boolean;
  allowsSuppliers?: boolean;
  sortOrder?: number;
}

/**
 * CFG-2 (taxonomie unifiée) — CRUD Department/Subtype. GLOBAL — un seul jeu de départements/
 * sous-types pour toute la plateforme (décision explicite : "les 8 départements sont pareils
 * pour tout le monde"), pas de scoping par tenant. Lecture ouverte à tout utilisateur
 * authentifié (contrôleur), écriture réservée au super-admin plateforme (SuperAdminGuard côté
 * contrôleur — ce service ne fait aucune vérification de rôle lui-même).
 *
 * Reprend l'idiome `code` de StorageTypesService (storage-types/storage-types.service.ts) :
 * rename toujours autorisé même sur une ligne `code`-portée, delete bloqué si `code !== null`.
 * Reprend la forme deux-niveaux + garde-fous de dépendances de ComponentTaxonomyService
 * (menu-components/component-taxonomy.service.ts).
 *
 * Étape 1 seule livrée pour l'instant : rien ne lit encore cette table (SpaceElement.type,
 * HrRole.department, HrSupplier.departments, elementTaxonomy.js restent inchangés).
 */
@Injectable()
export class DepartmentsService {
  constructor(private prisma: PrismaService) {}

  private async assertDepartmentNameAvailable(name: string, excludeId?: string) {
    const duplicate = await this.prisma.department.findFirst({
      where: { name: { equals: name, mode: 'insensitive' }, ...(excludeId ? { id: { not: excludeId } } : {}) },
    });
    if (duplicate) {
      throw new BadRequestException(`Un département nommé « ${name} » existe déjà`);
    }
  }

  private async assertSubtypeNameAvailable(name: string, departmentId: string, excludeId?: string) {
    const duplicate = await this.prisma.subtype.findFirst({
      where: {
        departmentId,
        name: { equals: name, mode: 'insensitive' },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    if (duplicate) {
      throw new BadRequestException(`Un sous-type nommé « ${name} » existe déjà pour ce département`);
    }
  }

  // ---------------- Departments ----------------

  async getDepartments(page = 1, limit = 200, search?: string) {
    const safeLimit = Math.min(Math.max(limit, 1), 500);
    const skip = (Math.max(page, 1) - 1) * safeLimit;
    const where: any = {};
    if (search) where.name = { contains: search, mode: 'insensitive' };
    const [data, total] = await Promise.all([
      this.prisma.department.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        include: { subtypes: { orderBy: { name: 'asc' } } },
        skip,
        take: safeLimit,
      }),
      this.prisma.department.count({ where }),
    ]);
    return { data, meta: { total, page: Math.max(page, 1), limit: safeLimit, totalPages: Math.ceil(total / safeLimit) || 1 } };
  }

  async findDepartment(id: string) {
    const dept = await this.prisma.department.findFirst({ where: { id }, include: { subtypes: true } });
    if (!dept) throw new NotFoundException(`Department ${id} not found`);
    return dept;
  }

  async createDepartment(input: UpsertDepartmentInput) {
    const name = (input.name ?? '').trim();
    if (!name) throw new BadRequestException('name is required');
    await this.assertDepartmentNameAvailable(name);
    // `code` reste toujours null pour un département créé par le super-admin — il n'existe
    // encore dans aucun SpaceElement.type (Étape 2, pas branchée), donc pas besoin d'identifiant
    // stable.
    return this.prisma.department.create({
      data: {
        name,
        code: null,
        color: input.color ?? '#94a3b8',
        icon: input.icon ?? 'mdi-shape',
        needsRh: input.needsRh ?? false,
        isSeller: input.isSeller ?? false,
        allowsSuppliers: input.allowsSuppliers ?? true,
        sortOrder: input.sortOrder ?? 0,
      },
      include: { subtypes: true },
    });
  }

  async updateDepartment(id: string, input: UpsertDepartmentInput) {
    const dept = await this.prisma.department.findFirst({ where: { id } });
    if (!dept) throw new NotFoundException(`Department ${id} not found`);

    const data: any = {};
    if (input.name !== undefined) {
      const trimmed = input.name.trim();
      if (trimmed !== dept.name) await this.assertDepartmentNameAvailable(trimmed, id);
      data.name = trimmed; // renommer un département `code`-porté reste autorisé, cf. doc du modèle.
    }
    if (input.color !== undefined) data.color = input.color;
    if (input.icon !== undefined) data.icon = input.icon;
    if (input.needsRh !== undefined) data.needsRh = input.needsRh;
    if (input.isSeller !== undefined) data.isSeller = input.isSeller;
    if (input.allowsSuppliers !== undefined) data.allowsSuppliers = input.allowsSuppliers;
    if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;

    return this.prisma.department.update({ where: { id }, data, include: { subtypes: true } });
  }

  async deleteDepartment(id: string) {
    const dept = await this.prisma.department.findFirst({ where: { id } });
    if (!dept) throw new NotFoundException(`Department ${id} not found`);

    // Un département historique (code non-null) ne peut jamais être supprimé — SpaceElement.type
    // y référera par ce code stable dès l'Étape 2, sans cascade possible côté plan.
    if (dept.code !== null) {
      throw new BadRequestException(`Impossible de supprimer « ${dept.name} » : ce département historique est utilisé par le Builder 3D.`);
    }

    // BUG-81-style guard : Subtype.departmentId est onDelete: Cascade en base, mais on bloque
    // explicitement plutôt que de laisser une suppression silencieuse emporter ses sous-types.
    const subtypeCount = await this.prisma.subtype.count({ where: { departmentId: id } });
    if (subtypeCount > 0) {
      throw new ConflictException({
        message: `Impossible de supprimer ce département : ${subtypeCount} sous-type(s) en dépendent encore. Supprimez-les d'abord.`,
        blockedBy: 'subtypes',
        count: subtypeCount,
        filterField: 'department',
        filterValue: dept.name,
      });
    }

    await this.prisma.department.delete({ where: { id } });
    return { deleted: true };
  }

  // ---------------- Subtypes ----------------

  async getSubtypes(departmentId?: string, page = 1, limit = 200, search?: string) {
    const safeLimit = Math.min(Math.max(limit, 1), 500);
    const skip = (Math.max(page, 1) - 1) * safeLimit;
    const where: any = { ...(departmentId ? { departmentId } : {}) };
    if (search) where.name = { contains: search, mode: 'insensitive' };
    const [data, total] = await Promise.all([
      this.prisma.subtype.findMany({ where, orderBy: { name: 'asc' }, include: { department: true }, skip, take: safeLimit }),
      this.prisma.subtype.count({ where }),
    ]);
    return { data, meta: { total, page: Math.max(page, 1), limit: safeLimit, totalPages: Math.ceil(total / safeLimit) || 1 } };
  }

  async createSubtype(name: string, departmentId: string) {
    const trimmed = (name ?? '').trim();
    if (!trimmed) throw new BadRequestException('name is required');
    const dept = await this.prisma.department.findFirst({ where: { id: departmentId } });
    if (!dept) throw new BadRequestException('departmentId must reference an existing department');
    await this.assertSubtypeNameAvailable(trimmed, departmentId);
    return this.prisma.subtype.create({
      data: { departmentId, name: trimmed, code: null },
      include: { department: true },
    });
  }

  async updateSubtype(id: string, data: { name?: string; departmentId?: string }) {
    const subtype = await this.prisma.subtype.findFirst({ where: { id } });
    if (!subtype) throw new NotFoundException(`Subtype ${id} not found`);

    const updateData: any = {};
    const targetDepartmentId = data.departmentId ?? subtype.departmentId;
    if (data.departmentId !== undefined) {
      const dept = await this.prisma.department.findFirst({ where: { id: data.departmentId } });
      if (!dept) throw new BadRequestException('departmentId must reference an existing department');
      updateData.departmentId = data.departmentId;
    }
    if (data.name !== undefined) {
      const trimmed = data.name.trim();
      await this.assertSubtypeNameAvailable(trimmed, targetDepartmentId, id);
      updateData.name = trimmed; // renommer un sous-type `code`-porté reste autorisé.
    }

    return this.prisma.subtype.update({ where: { id }, data: updateData, include: { department: true } });
  }

  async deleteSubtype(id: string) {
    const subtype = await this.prisma.subtype.findFirst({ where: { id } });
    if (!subtype) throw new NotFoundException(`Subtype ${id} not found`);

    // Même garde que Department : un sous-type historique (code non-null) correspond déjà à des
    // valeurs persistées dans SpaceElement.subtypes[] côté Builder — ne jamais le supprimer.
    if (subtype.code !== null) {
      throw new BadRequestException(`Impossible de supprimer « ${subtype.name} » : ce sous-type historique est utilisé par le Builder 3D.`);
    }

    await this.prisma.subtype.delete({ where: { id } });
    return { deleted: true };
  }
}
