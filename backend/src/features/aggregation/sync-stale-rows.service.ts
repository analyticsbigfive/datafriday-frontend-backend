import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { selectDatabaseNow } from './sync-stale-rows.queries';

/** Event du run qui n'a pas pu être retraité : ses lignes existantes sont conservées. */
export interface FailedSyncEvent {
  eventId: string;
  date?: Date | string | null;
}

/**
 * Incident Jean Bouin 2026-10-01 : fin de resynchronisation (« Synchroniser », Data Integration).
 *
 * Avant, la resync effaçait TOUTES les lignes d'agrégats de l'intégration au début, puis
 * reconstruisait event par event. Un plantage en cours de route (Redis saturé, 01/10 Jean
 * Bouin) laissait l'espace vide, et chaque relance BullMQ refaisait la purge : seul le premier
 * event revenait (PFC-Metz), les 13 matchs PFC 2026 restaient sans données dans l'Analyse.
 *
 * Désormais, chaque event est effacé puis réécrit par executeProcessEvents (déjà le cas), et ce
 * balayage, lancé UNIQUEMENT une fois la reconstruction terminée, retire ce que le run n'a pas
 * réécrit : lignes d'events retirés de l'espace, résidus sans event, jours devenus vides.
 * Critère : `updatedAt` antérieur au début du run (horloge de la base, comme les NOW() des
 * INSERT). Les lignes des events en échec sont gardées : une donnée ancienne vaut mieux qu'un
 * trou.
 */
@Injectable()
export class SyncStaleRowsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Horloge de la base, prise avant la reconstruction (référence du balayage). */
  async databaseNow(): Promise<Date> {
    const rows = await selectDatabaseNow(this.prisma);
    return rows[0].now;
  }

  async purge(
    tenantId: string,
    spaceId: string,
    integrationId: string | undefined,
    syncStartedAt: Date,
    failedEvents: ReadonlyArray<FailedSyncEvent>,
  ): Promise<number> {
    const base = {
      tenantId,
      spaceId,
      updatedAt: { lt: syncStartedAt },
      ...(integrationId ? { integrationId } : {}),
    };
    const failedIds = failedEvents.map((e) => e.eventId);
    const failedDays = failedEvents.map((e) => utcDay(e.date)).filter((d): d is Date => d !== null);

    // `weezeventEventId` nullable sur minute/article : un `notIn` seul écarterait aussi les
    // lignes NULL (sémantique SQL), qui sont précisément des résidus à retirer.
    const keepFailedNullable = failedIds.length
      ? { OR: [{ weezeventEventId: null }, { weezeventEventId: { notIn: failedIds } }] }
      : {};
    const minuteWhere: Prisma.SpaceRevenueMinuteAggWhereInput = { ...base, ...keepFailedNullable };
    const itemWhere: Prisma.SpaceRevenueMinuteItemAggWhereInput = {
      ...base,
      ...keepFailedNullable,
    };
    const basketWhere: Prisma.SpaceBasketMinuteAggWhereInput = {
      ...base,
      ...(failedIds.length ? { weezeventEventId: { notIn: failedIds } } : {}),
    };
    // Table journalière sans clé event : on épargne les jours des events en échec.
    const dailyWhere: Prisma.SpaceProductRevenueDailyAggWhereInput = {
      ...base,
      ...(failedDays.length ? { day: { notIn: failedDays } } : {}),
    };

    const minute = await this.prisma.spaceRevenueMinuteAgg.deleteMany({ where: minuteWhere });
    const item = await this.prisma.spaceRevenueMinuteItemAgg.deleteMany({ where: itemWhere });
    const basket = await this.prisma.spaceBasketMinuteAgg.deleteMany({ where: basketWhere });
    const daily = await this.prisma.spaceProductRevenueDailyAgg.deleteMany({ where: dailyWhere });
    return minute.count + item.count + basket.count + daily.count;
  }
}

/** Jour calendaire tel que l'écrit insertDailyProductAggSql (`eventDate::date`, session UTC). */
function utcDay(date: Date | string | null | undefined): Date | null {
  if (!date) return null;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
