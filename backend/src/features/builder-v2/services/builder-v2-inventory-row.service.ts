import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { UpsertInventoryRowDto } from '../dto/builder-v2.dto';
import { resolveInventoryLinks } from '../../logistics/services/inventory-market-price-resolver';
import { normalizeItemName } from '../../logistics/services/storage-stored-items';
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

    // Lien Market Price résolu côté serveur : id du DTO (du tenant) ou, à défaut, nom normalisé.
    const [link] = await resolveInventoryLinks(this.prisma, tenantId, [{ name: dto.name, marketPriceId: dto.marketPriceId }]);
    const rowName = link.name;

    await this.prisma.$transaction(async (tx) => {
      for (const targetConfigId of targetConfigIds) {
        const existing = await this.findExisting(tx, elementId, targetConfigId, rowName, link.marketPriceId);
        if (existing) {
          const data: Record<string, unknown> = this.buildUpdate(dto);
          // Complète le lien des lignes historiques et suit le nom courant du Market Price.
          if (link.marketPriceId && existing.marketPriceId !== link.marketPriceId) data.marketPriceId = link.marketPriceId;
          if (link.marketPriceId && existing.name !== rowName) data.name = rowName;
          if (Object.keys(data).length) await tx.elementInventory.update({ where: { id: existing.id }, data });
        } else {
          await tx.elementInventory.create({
            data: {
              elementId, configId: targetConfigId, name: rowName, marketPriceId: link.marketPriceId,
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
      where: {
        elementId,
        configId: { in: targetConfigIds },
        ...(link.marketPriceId ? { OR: [{ marketPriceId: link.marketPriceId }, { name: rowName }] } : { name: rowName }),
      },
    });
  }

  /** Ligne existante : par marketPriceId d'abord, puis par nom (lignes historiques sans lien). */
  private async findExisting(tx: any, elementId: string, configId: string | null, name: string, marketPriceId: string | null) {
    if (marketPriceId) {
      const byId = await tx.elementInventory.findFirst({ where: { elementId, configId, marketPriceId } });
      if (byId) return byId;
    }
    const byName = await tx.elementInventory.findFirst({ where: { elementId, configId, name } });
    if (byName) return byName;
    // Nom différent seulement par la casse/espaces : même article historique.
    const rows = await tx.elementInventory.findMany({ where: { elementId, configId, marketPriceId: null } });
    const key = normalizeItemName(name);
    return rows.find((r: { name: string }) => normalizeItemName(r.name) === key) ?? null;
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
