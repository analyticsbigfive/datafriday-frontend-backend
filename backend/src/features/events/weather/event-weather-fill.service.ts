import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../core/database/prisma.service';
import { EventWeatherService } from './event-weather.service';
import type { WeatherEventInput } from './event-weather.types';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Un event sans météo trouvée n'est retenté qu'une fois par semaine... */
export const WEATHER_RETRY_AFTER_MS = 7 * DAY_MS;
/** ...et seulement pendant 30 jours après sa date (au-delà, l'absence est jugée définitive). */
export const WEATHER_RETRY_WINDOW_MS = 30 * DAY_MS;

export interface WeatherFillResult {
  /** Events examinés dans le lot. */
  scanned: number;
  /** Events dont la météo a été trouvée et enregistrée. */
  filled: number;
  /** Events marqués « introuvable » (weatherFetchedAt posé, météo nulle). */
  missing: number;
  /** Échecs transitoires, laissés tels quels pour la prochaine passe. */
  failed: number;
}

const EVENT_SELECT = {
  id: true,
  eventDate: true,
  sessions: true,
  space: { select: { city: true, country: true, timezone: true } },
} as const;

/**
 * Jour calendaire local « YYYY-MM-DD » d'un instant dans un fuseau. Sert à décider si un event
 * est passé « selon le fuseau du Space » (eventDate est ancrée à minuit UTC, pas à l'heure locale).
 */
export function localDay(instant: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
  } catch {
    return instant.toISOString().slice(0, 10);
  }
}

/**
 * Remplit la météo des events passés. Partagé par le job de nuit (lots de 100) et le script de
 * rattrapage (tous les events, lot par lot).
 *
 * Règle de sélection : un event est éligible s'il est PASSÉ (eventDate au plus tard hier, fuseau
 * du Space) et que
 *   - weatherFetchedAt est null (jamais tenté), ou
 *   - weatherCode est null (tentative infructueuse), la dernière tentative date de plus de 7 jours
 *     et l'event a moins de 30 jours (archive parfois en retard de quelques jours).
 * Une tentative « introuvable » pose weatherFetchedAt sans météo, donc pas de nouvel essai la nuit
 * suivante. Un échec transitoire (réseau) ne touche à rien : l'event reste éligible.
 */
@Injectable()
export class EventWeatherFillService {
  private readonly logger = new Logger(EventWeatherFillService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly weather: EventWeatherService,
  ) {}

  /** Filtre Prisma des events à traiter. */
  buildWhere(now: Date, excludeIds: string[] = []): Prisma.EventWhereInput {
    return {
      isSimulated: false,
      spaceId: { not: null },
      // Marge d'un jour côté base ; la règle exacte « hier au plus tard » se fait dans le fuseau du Space.
      eventDate: { lte: now },
      ...(excludeIds.length ? { id: { notIn: excludeIds } } : {}),
      OR: [
        { weatherFetchedAt: null },
        {
          weatherCode: null,
          weatherFetchedAt: { lt: new Date(now.getTime() - WEATHER_RETRY_AFTER_MS) },
          eventDate: { gte: new Date(now.getTime() - WEATHER_RETRY_WINDOW_MS) },
        },
      ],
    };
  }

  /**
   * Traite UN lot d'au plus `limit` events (les plus récents d'abord). `excludeIds` évite de
   * reprendre dans la même exécution un event déjà vu (échec transitoire). En dryRun, rien n'est
   * écrit en base, mais la météo est quand même résolue pour mesurer ce qui serait enregistré.
   */
  async fillBatch(
    limit: number,
    options: { now?: Date; dryRun?: boolean; excludeIds?: string[] } = {},
  ): Promise<WeatherFillResult & { ids: string[] }> {
    const now = options.now ?? new Date();
    const rows = await this.prisma.event.findMany({
      where: this.buildWhere(now, options.excludeIds),
      select: EVENT_SELECT,
      orderBy: { eventDate: 'desc' },
      take: limit,
    });
    const past = rows.filter((row) => this.isPast(row.eventDate, row.space?.timezone, now));
    const result = { scanned: rows.length, filled: 0, missing: 0, failed: 0, ids: rows.map((r) => r.id) };
    if (!past.length) return result;

    const outcomes = await this.weather.resolveMany(past as WeatherEventInput[]);
    for (const row of past) {
      const outcome = outcomes.get(row.id) ?? { kind: 'error' as const };
      if (outcome.kind === 'error') {
        result.failed++;
        continue;
      }
      const data =
        outcome.kind === 'ok'
          ? { weatherCode: outcome.weatherCode, temperatureC: outcome.temperatureC, weatherFetchedAt: now }
          : { weatherCode: null, temperatureC: null, weatherFetchedAt: now };
      if (outcome.kind === 'ok') result.filled++;
      else result.missing++;
      if (options.dryRun) continue;
      try {
        // eslint-disable-next-line no-await-in-loop -- une écriture à la fois : un échec n'arrête pas le lot
        await this.prisma.event.update({ where: { id: row.id }, data });
      } catch (error) {
        result.failed++;
        this.logger.warn(`Météo event ${row.id} non enregistrée : ${(error as Error)?.message}`);
      }
    }
    return result;
  }

  /** Vrai si le jour de l'event est strictement avant « aujourd'hui » dans le fuseau du Space. */
  private isPast(eventDate: Date, timeZone: string | null | undefined, now: Date): boolean {
    return eventDate.toISOString().slice(0, 10) < localDay(now, timeZone || 'Europe/Paris');
  }
}
