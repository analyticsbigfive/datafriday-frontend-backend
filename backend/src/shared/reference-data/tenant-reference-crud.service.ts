import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

/** Sous-ensemble du délégué Prisma d'une table de référentiel (id, name, tenantId). */
export interface ReferenceDelegate {
  findMany(args: unknown): Promise<unknown[]>;
  count(args: unknown): Promise<number>;
  findFirst(args: unknown): Promise<unknown>;
  create(args: unknown): Promise<unknown>;
  update(args: unknown): Promise<unknown>;
  delete(args: unknown): Promise<unknown>;
}

export interface ReferenceConfig {
  /** Message 400 quand le nom existe déjà (insensible à la casse). */
  duplicateMessage: (name: string) => string;
  /** Libellé du 404, ex. « Brand » -> « Brand <id> not found ». */
  notFoundLabel: string;
  /** Garde avant suppression : la relation est onDelete SetNull, on refuse au lieu de détacher. */
  dependents?: { count: (id: string) => Promise<number>; message: (count: number) => string };
}

/**
 * CRUD commun des référentiels nommés d'un tenant (marques, industriels, noms d'affichage,
 * types de promotion...). Chaque service ne fournit que son délégué Prisma et ses messages.
 */
export abstract class TenantReferenceCrudService {
  protected abstract get delegate(): ReferenceDelegate;
  protected abstract readonly config: ReferenceConfig;

  // BUG-169 : pagination bornée { data, meta: { total, page, limit, totalPages } } ; le front
  // boucle sur les pages pour reconstituer la liste complète sans troncature silencieuse.
  async findAll(tenantId: string, page = 1, limit = 200, search?: string) {
    const safePage = Math.max(page, 1);
    const safeLimit = Math.min(Math.max(limit, 1), 500);
    const where: Record<string, unknown> = { tenantId };
    if (search) where.name = { contains: search, mode: 'insensitive' };
    const [data, total] = await Promise.all([
      this.delegate.findMany({ where, orderBy: { name: 'asc' }, skip: (safePage - 1) * safeLimit, take: safeLimit }),
      this.delegate.count({ where }),
    ]);
    return { data, meta: { total, page: safePage, limit: safeLimit, totalPages: Math.ceil(total / safeLimit) || 1 } };
  }

  async create(name: string, tenantId: string) {
    const trimmedName = name.trim();
    await this.assertUniqueName(trimmedName, tenantId);
    try {
      return await this.delegate.create({ data: { name: trimmedName, tenantId } });
    } catch (error) {
      throw this.translateDuplicate(error, name);
    }
  }

  async findOne(id: string, tenantId: string) {
    const row = await this.delegate.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundException(`${this.config.notFoundLabel} ${id} not found`);
    return row;
  }

  async update(id: string, name: string | undefined, tenantId: string) {
    const row = await this.findOne(id, tenantId);
    if (name === undefined) return row;
    const trimmedName = name.trim();
    await this.assertUniqueName(trimmedName, tenantId, id);
    try {
      return await this.delegate.update({ where: { id }, data: { name: trimmedName } });
    } catch (error) {
      throw this.translateDuplicate(error, name);
    }
  }

  async remove(id: string, tenantId: string) {
    await this.findOne(id, tenantId);
    if (this.config.dependents) {
      const count = await this.config.dependents.count(id);
      if (count > 0) throw new ConflictException(this.config.dependents.message(count));
    }
    await this.delegate.delete({ where: { id } });
    return { deleted: true };
  }

  private async assertUniqueName(name: string, tenantId: string, excludeId?: string) {
    const duplicate = await this.delegate.findFirst({
      where: { tenantId, name: { equals: name, mode: 'insensitive' }, ...(excludeId && { id: { not: excludeId } }) },
      select: { id: true },
    });
    if (duplicate) throw new BadRequestException(this.config.duplicateMessage(name));
  }

  private translateDuplicate(error: unknown, name: string): unknown {
    return (error as { code?: string })?.code === 'P2002'
      ? new BadRequestException(this.config.duplicateMessage(name))
      : error;
  }
}
