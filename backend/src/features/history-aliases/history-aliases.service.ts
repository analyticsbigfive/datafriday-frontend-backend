import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { CreateHistoryAliasDto } from './dto/history-alias.dto';

/**
 * Alias « historique emprunté » Event Predict (maquettes 08/2026).
 * CRUD de stockage uniquement : la RÉSOLUTION des alias est 100 % frontend
 * (activeTimelineData d'EventPredictView) — la page Analyse ne lit jamais
 * cette table.
 */
@Injectable()
export class HistoryAliasesService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertSpaceOwnership(spaceId: string, tenantId: string): Promise<void> {
    const space = await this.prisma.space.findFirst({
      where: { id: spaceId, tenantId },
      select: { id: true },
    });
    if (!space) throw new ForbiddenException(`Space ${spaceId} not found for tenant`);
  }

  async list(spaceId: string, tenantId: string) {
    // Query déjà scopée (tenantId, spaceId) : un space étranger → liste vide,
    // aucune fuite (même logique que RestockStateService.get).
    return this.prisma.menuItemHistoryAlias.findMany({
      where: { tenantId, spaceId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(dto: CreateHistoryAliasDto, tenantId: string, userId?: string) {
    const sourceName = (dto.sourceName || '').trim();
    if (!sourceName) {
      throw new BadRequestException('sourceName is required');
    }
    await this.assertSpaceOwnership(dto.spaceId, tenantId);
    // La cible doit être un article du tenant (même contrôle que
    // predict-versions : findFirst id + tenantId).
    const target = await this.prisma.menuItem.findFirst({
      where: { id: dto.targetMenuItemId, tenantId },
      select: { id: true },
    });
    if (!target) {
      throw new NotFoundException(`MenuItem ${dto.targetMenuItemId} not found for tenant`);
    }
    // Garde-fou anti-chaîne (A→B puis B→C) : une source ne peut pas être déjà
    // cible d'un autre alias de l'espace, et réciproquement la cible ne peut
    // pas être déjà source (par id catalogue).
    const [sourceIsTarget, targetIsSource] = await Promise.all([
      dto.sourceMenuItemId
        ? this.prisma.menuItemHistoryAlias.findFirst({
            where: { tenantId, spaceId: dto.spaceId, targetMenuItemId: dto.sourceMenuItemId },
            select: { id: true },
          })
        : Promise.resolve(null),
      this.prisma.menuItemHistoryAlias.findFirst({
        where: { tenantId, spaceId: dto.spaceId, sourceMenuItemId: dto.targetMenuItemId },
        select: { id: true },
      }),
    ]);
    if (sourceIsTarget || targetIsSource) {
      throw new BadRequestException(
        'Alias chains are not allowed: pick the original source item directly.',
      );
    }
    // Upsert sur (tenant, space, sourceName) : re-mapper une même source
    // écrase la cible — UX « corriger sans supprimer d'abord ».
    return this.prisma.menuItemHistoryAlias.upsert({
      where: {
        tenantId_spaceId_sourceName: { tenantId, spaceId: dto.spaceId, sourceName },
      },
      update: {
        sourceMenuItemId: dto.sourceMenuItemId ?? null,
        targetMenuItemId: dto.targetMenuItemId,
        updatedAt: new Date(),
      },
      create: {
        tenantId,
        spaceId: dto.spaceId,
        sourceMenuItemId: dto.sourceMenuItemId ?? null,
        sourceName,
        targetMenuItemId: dto.targetMenuItemId,
        createdBy: userId ?? null,
      },
    });
  }

  async remove(id: string, tenantId: string) {
    const alias = await this.prisma.menuItemHistoryAlias.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!alias) throw new NotFoundException(`Alias ${id} not found for tenant`);
    await this.prisma.menuItemHistoryAlias.delete({ where: { id } });
  }
}
