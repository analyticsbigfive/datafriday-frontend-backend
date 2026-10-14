import { Injectable, Logger } from '@nestjs/common';
import { parseEventSessions } from '../../../shared/utils/event-window.util';
import type { EventWeather, WeatherEventInput, WeatherOutcome } from './event-weather.types';

const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive';
/** Délai maximal d'un appel Open-Meteo : au-delà, l'event est retenté à la passe suivante. */
const REQUEST_TIMEOUT_MS = 8000;
/** Pause entre deux appels réseau : la limite gratuite d'Open-Meteo tolère quelques requêtes par seconde. */
const PAUSE_BETWEEN_CALLS_MS = 350;
/** Heure retenue quand l'event n'a pas d'heure de show (comme le Rapport J+1 du front). */
const DEFAULT_SHOW_HOUR = 20;

interface Coords {
  latitude: number;
  longitude: number;
}

interface HourlyDay {
  times: string[];
  temperatures: Array<number | null>;
  codes: Array<number | null>;
}

/** Erreur interne : échec transitoire à ne pas confondre avec une donnée absente. */
class TransientWeatherError extends Error {}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Heure du show (0 à 23) : sessions[0].showTime, sinon 20h. */
export function resolveShowHour(sessions: unknown): number {
  const showTime = parseEventSessions(sessions)[0]?.showTime;
  const match = /^(\d{1,2})[:h]/.exec(String(showTime ?? '').trim());
  const hour = match ? parseInt(match[1], 10) : NaN;
  return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : DEFAULT_SHOW_HOUR;
}

/** Clé de ville stable pour les caches et le regroupement. */
function cityKey(city: string, country?: string | null): string {
  return `${city.trim().toLowerCase()}|${String(country ?? '').trim().toLowerCase()}`;
}

/**
 * Météo historique d'un event via Open-Meteo (gratuit, sans clé). Port serveur de
 * frontend/src/utils/eventWeather.js : géocodage de Space.city / Space.country puis archive
 * horaire du jour de l'event, lue à l'heure du show.
 *
 * Contrat : ne JETTE jamais. Les appels sont séquentiels et espacés (limite gratuite), un seul
 * géocodage par ville (cache mémoire du process) et un seul appel archive par (ville, date),
 * quel que soit le nombre d'events qui les partagent.
 */
@Injectable()
export class EventWeatherService {
  private readonly logger = new Logger(EventWeatherService.name);
  /** Ville -> coordonnées, ou null si la ville est introuvable (cache négatif aussi). */
  private readonly geoCache = new Map<string, Coords | null>();
  private lastCallAt = 0;

  /**
   * Résout la météo d'un lot d'events. Les events de même ville et même date partagent un seul
   * appel archive. Chaque event reçoit toujours une issue, même si tout échoue.
   */
  async resolveMany(events: WeatherEventInput[]): Promise<Map<string, WeatherOutcome>> {
    const outcomes = new Map<string, WeatherOutcome>();
    const groups = new Map<string, WeatherEventInput[]>();
    for (const event of events) {
      const city = event.space?.city?.trim();
      const day = this.dayOf(event.eventDate);
      if (!city || !day) {
        outcomes.set(event.id, { kind: 'missing' });
        continue;
      }
      const key = `${cityKey(city, event.space?.country)}#${day}`;
      groups.set(key, [...(groups.get(key) ?? []), event]);
    }

    for (const group of groups.values()) {
      // eslint-disable-next-line no-await-in-loop -- un groupe (ville, date) à la fois : appels espacés pour la limite gratuite
      const hourly = await this.loadGroup(group[0]);
      for (const event of group) {
        outcomes.set(event.id, this.pick(hourly, resolveShowHour(event.sessions)));
      }
    }
    return outcomes;
  }

  /** Météo d'un seul event, ou null (introuvable ou échec). Ne jette jamais. */
  async fetchEventWeather(event: WeatherEventInput): Promise<EventWeather | null> {
    const outcome = (await this.resolveMany([event])).get(event.id);
    return outcome?.kind === 'ok' ? { weatherCode: outcome.weatherCode, temperatureC: outcome.temperatureC } : null;
  }

  /** Charge l'archive horaire du groupe : HourlyDay, 'missing' (durable) ou 'error' (transitoire). */
  private async loadGroup(event: WeatherEventInput): Promise<HourlyDay | 'missing' | 'error'> {
    try {
      const coords = await this.geocode(event.space!.city!, event.space?.country);
      if (!coords) return 'missing';
      const day = this.dayOf(event.eventDate)!;
      const params = new URLSearchParams({
        latitude: String(coords.latitude),
        longitude: String(coords.longitude),
        start_date: day,
        end_date: day,
        hourly: 'temperature_2m,weather_code',
        timezone: 'auto',
      });
      const body = await this.getJson(`${ARCHIVE_URL}?${params}`);
      const times: string[] = body?.hourly?.time ?? [];
      if (!times.length) return 'missing';
      return {
        times,
        temperatures: body.hourly.temperature_2m ?? [],
        codes: body.hourly.weather_code ?? [],
      };
    } catch (error) {
      this.logger.warn(`Météo indisponible pour ${event.space?.city} : ${(error as Error)?.message}`);
      return 'error';
    }
  }

  /** Lit l'heure du show dans l'archive du jour (heures locales grâce à timezone=auto). */
  private pick(hourly: HourlyDay | 'missing' | 'error', hour: number): WeatherOutcome {
    if (hourly === 'missing' || hourly === 'error') return { kind: hourly };
    // Les heures sont des « YYYY-MM-DDTHH:00 » locales : on lit le HH, sans passer par Date.
    let idx = hourly.times.findIndex((t) => parseInt(t.slice(11, 13), 10) === hour);
    if (idx < 0) idx = Math.min(hour, hourly.times.length - 1);
    const temperature = hourly.temperatures[idx];
    const code = hourly.codes[idx];
    if (typeof temperature !== 'number' || typeof code !== 'number') return { kind: 'missing' };
    return { kind: 'ok', weatherCode: code, temperatureC: Math.round(temperature * 10) / 10 };
  }

  /** Ville -> coordonnées. Préfère le résultat du pays demandé, sinon le premier. Cache par ville. */
  private async geocode(city: string, country?: string | null): Promise<Coords | null> {
    const key = cityKey(city, country);
    if (this.geoCache.has(key)) return this.geoCache.get(key) ?? null;
    const params = new URLSearchParams({ name: city.trim(), count: '5', language: 'fr', format: 'json' });
    const body = await this.getJson(`${GEOCODE_URL}?${params}`);
    const results: Array<{ latitude: number; longitude: number; country?: string; country_code?: string }> =
      body?.results ?? [];
    const wanted = String(country ?? '').trim().toLowerCase();
    const hit =
      (wanted &&
        results.find((r) => r.country?.toLowerCase() === wanted || r.country_code?.toLowerCase() === wanted)) ||
      results[0];
    const coords = hit ? { latitude: hit.latitude, longitude: hit.longitude } : null;
    this.geoCache.set(key, coords);
    return coords;
  }

  /**
   * GET JSON avec délai maximal et pause d'espacement. Une réponse 400 ou 404 (date hors archive,
   * paramètre refusé) est une absence durable (null) ; tout autre échec est transitoire (throw).
   */
  private async getJson(url: string): Promise<any> {
    const wait = this.lastCallAt + PAUSE_BETWEEN_CALLS_MS - Date.now();
    if (wait > 0) await sleep(wait);
    this.lastCallAt = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (res.status === 400 || res.status === 404) return null;
      if (!res.ok) throw new TransientWeatherError(`HTTP ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  /** Jour calendaire « YYYY-MM-DD » de l'event (date ancrée à minuit UTC), ou null si invalide. */
  private dayOf(date: Date): string | null {
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date.toISOString().slice(0, 10) : null;
  }
}
