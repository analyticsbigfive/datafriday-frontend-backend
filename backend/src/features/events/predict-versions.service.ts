import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { sanitizePredictedTimeline } from './predicted-timeline-snapshot';
import { CreatePredictVersionDto, PatchPredictVersionDto } from './dto/predict-version.dto';

@Injectable()
export class PredictVersionsService {
  private readonly logger = new Logger(PredictVersionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(eventId: string, tenantId: string) {
    return this.prisma.eventPredictVersion.findMany({
      where: { eventId, tenantId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  /** Plafond d'ids par requête de synthèse (disponibilité Predict du formulaire de comparaison). */
  static readonly SUMMARY_MAX_EVENT_IDS = 500;

  /**
   * Parmi les eventIds demandés, ceux qui ont AU MOINS une version du tenant courant.
   * Ne lit que la colonne eventId (jamais les colonnes JSON lourdes). Ids dédoublonnés.
   */
  async eventIdsWithVersions(eventIds: string[], tenantId: string): Promise<string[]> {
    const ids = [...new Set((eventIds ?? []).filter((id) => typeof id === 'string' && id.length > 0))];
    if (ids.length === 0) return [];
    if (ids.length > PredictVersionsService.SUMMARY_MAX_EVENT_IDS) {
      throw new BadRequestException(
        `Trop d'événements demandés (${ids.length}), maximum ${PredictVersionsService.SUMMARY_MAX_EVENT_IDS}`,
      );
    }
    const rows = await this.prisma.eventPredictVersion.findMany({
      where: { tenantId, eventId: { in: ids } },
      select: { eventId: true },
      distinct: ['eventId'],
    });
    return rows.map((r) => r.eventId);
  }

  async findById(id: string, tenantId: string) {
    const version = await this.prisma.eventPredictVersion.findFirst({
      where: { id, tenantId },
    });
    if (!version) throw new NotFoundException(`PredictVersion ${id} not found`);
    return version;
  }

  async create(eventId: string, tenantId: string, dto: CreatePredictVersionDto, userId?: string) {
    // BUG-076 : eventId (pris depuis l'URL) n'a pas de FK Prisma déclarée — sans cette
    // vérification, un eventId erroné/typo créait une EventPredictVersion orpheline (même
    // famille de garde déjà ajoutée pour les FK de taxonomie d'Event, cf. BUG-67).
    const event = await this.prisma.event.findFirst({ where: { id: eventId, tenantId }, select: { id: true } });
    if (!event) throw new NotFoundException(`Event ${eventId} not found`);

    const predictedTimeline = sanitizePredictedTimeline(dto.predictedTimeline);
    return this.prisma.eventPredictVersion.create({
      data: {
        tenantId,
        eventId,
        spaceId: dto.spaceId ?? null,
        name: dto.name,
        isDefault: false,
        eventSnapshot: dto.eventSnapshot as any,
        totalRevenue: dto.totalRevenue ?? 0,
        adjustedTotalRevenue: dto.adjustedTotalRevenue ?? 0,
        perCapita: dto.perCapita ?? 0,
        adjustedPerCapita: dto.adjustedPerCapita ?? 0,
        menuConfig: (dto.menuConfig ?? {}) as any,
        quantityAdjustments: (dto.quantityAdjustments ?? {}) as any,
        manualQuantities: (dto.manualQuantities ?? {}) as any,
        predictedRecords: (dto.predictedRecords ?? []) as any,
        ...(predictedTimeline ? { predictedTimeline: predictedTimeline as any } : {}),
        selectedPredictionEventIds: dto.selectedPredictionEventIds ?? [],
        selectedTimeRange: (dto.selectedTimeRange ?? null) as any,
        createdBy: userId ?? null,
      },
    });
  }

  async patch(id: string, tenantId: string, dto: PatchPredictVersionDto) {
    await this.findById(id, tenantId);
    const data: Record<string, any> = {};
    const scalarFields = [
      'name', 'spaceId', 'eventSnapshot', 'totalRevenue', 'adjustedTotalRevenue',
      'perCapita', 'adjustedPerCapita', 'menuConfig', 'quantityAdjustments',
      'manualQuantities', 'predictedRecords', 'selectedPredictionEventIds', 'selectedTimeRange',
    ] as const;
    for (const field of scalarFields) {
      if (dto[field] !== undefined) data[field] = dto[field];
    }
    // Json nullable : l'effacement passe par Prisma.DbNull, la valeur par le snapshot nettoyé.
    if (dto.predictedTimeline !== undefined) {
      const snapshot = sanitizePredictedTimeline(dto.predictedTimeline);
      data.predictedTimeline = snapshot ? (snapshot as any) : Prisma.DbNull;
    }
    return this.prisma.eventPredictVersion.update({ where: { id }, data });
  }

  async removeById(id: string, tenantId: string) {
    await this.findById(id, tenantId);
    await this.prisma.eventPredictVersion.delete({ where: { id } });
  }

  async setDefault(eventId: string, versionId: string | null | undefined, tenantId: string) {
    const ops: any[] = [
      this.prisma.eventPredictVersion.updateMany({
        where: { eventId, tenantId },
        data: { isDefault: false },
      }),
    ];
    if (versionId) {
      // Vérifie l'ownership avant d'écrire — sans ce lookup, un versionId
      // d'un autre tenant (ou d'un autre event) serait accepté tel quel par
      // l'update ci-dessous (BUG-65).
      await this.findById(versionId, tenantId);
      ops.push(
        this.prisma.eventPredictVersion.update({
          where: { id: versionId },
          data: { isDefault: true },
        }),
      );
    }
    await this.prisma.$transaction(ops);
    return { defaultVersionId: versionId || null };
  }
}
