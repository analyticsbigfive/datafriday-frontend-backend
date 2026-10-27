import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { UpsertInventoryRowDto } from '../dto/builder-v2.dto';
import { BuilderV2SupportService } from './builder-v2-support.service';

/** Profil minimal nécessaire pour scoper une requête par espace accessible. */
type SpaceScopedUser = { id: string; isSuperAdmin: boolean; isOwner: boolean; allSpacesAccess: boolean };

/**
 * Upsert d'une seule ligne d'inventaire d'un élément (identifiée par son nom), sans toucher aux autres lignes.
 * Contrairement à putInventory (remplacement complet), utilisable par la page Stockage produit par produit.
 */
@Injectable()
export class BuilderV2InventoryRowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly builderV2SupportService: BuilderV2SupportService,
  ) {}

  async upsertRow(elementId: string, tenantId: string, dto: UpsertInventoryRowDto, configId?: string, user?: SpaceScopedUser) {
    const element = await this.builderV2SupportService.getElementOrThrow(elementId, tenantId, user);
    const targetConfigIds = await this.resolveTargetConfigIds(elementId, configId);

    await this.prisma.$transaction(async (tx) => {
      for (const targetConfigId of targetConfigIds) {
        const existing = await tx.elementInventory.findFirst({
          where: { elementId, configId: targetConfigId, name: dto.name },
        });
        if (existing) {
          const data = this.buildUpdate(dto);
          if (Object.keys(data).length) await tx.elementInventory.update({ where: { id: existing.id }, data });
        } else {
          await tx.elementInventory.create({
            data: {
              elementId, configId: targetConfigId, name: dto.name,
              quantity: dto.quantity ?? 0, unit: dto.unit ?? null,
              minStock: dto.minStock ?? null, maxStock: dto.maxStock ?? null,
              isCustom: true, isStored: dto.isStored ?? null, menuItemId: null,
            },
          });
        }
      }
    });

    await this.builderV2SupportService.invalidate(tenantId, element.zone!.spaceId);
    return this.prisma.elementInventory.findMany({
      where: { elementId, configId: { in: targetConfigIds }, name: dto.name },
    });
  }

  /** Champs fournis uniquement ; null explicite autorisé pour minStock/maxStock (effacement). */
  private buildUpdate(dto: UpsertInventoryRowDto) {
    const data: Record<string, unknown> = {};
    if (dto.quantity !== undefined && dto.quantity !== null) data.quantity = dto.quantity;
    if (dto.isStored !== undefined && dto.isStored !== null) data.isStored = dto.isStored;
    if (dto.unit !== undefined) data.unit = dto.unit;
    if (dto.minStock !== undefined) data.minStock = dto.minStock;
    if (dto.maxStock !== undefined) data.maxStock = dto.maxStock;
    return data;
  }

  /** configId explicite : vérifie l'appartenance ; sinon toutes les configs membres ; aucune : [null]. */
  private async resolveTargetConfigIds(elementId: string, configId?: string): Promise<(string | null)[]> {
    const memberships = await this.prisma.configurationElement.findMany({
      where: { elementId },
      select: { configId: true },
      orderBy: { createdAt: 'asc' },
    });
    const memberIds = memberships.map((m) => m.configId);
    if (configId) {
      if (!memberIds.includes(configId)) {
        throw new BadRequestException(`L'élément ${elementId} n'appartient pas à la configuration ${configId}`);
      }
      return [configId];
    }
    return memberIds.length ? memberIds : [null];
  }
}
