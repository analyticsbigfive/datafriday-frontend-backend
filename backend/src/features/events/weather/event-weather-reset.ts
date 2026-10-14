/** Champs météo remis à zéro : l'event redevient éligible au prochain passage de nuit. */
export const WEATHER_RESET = { weatherCode: null, temperatureC: null, weatherFetchedAt: null } as const;

interface WeatherRelevantEvent {
  eventDate: Date;
  sessions: string | null;
  spaceId: string | null;
}

interface WeatherRelevantChanges {
  eventDate?: string | Date;
  sessions?: unknown;
  spaceId?: string | null;
}

/**
 * Vrai si la modification change ce dont dépend la météo : le jour, l'heure du show (sessions) ou
 * la ville (espace). Compare aux valeurs existantes : renvoyer la même date ne vide rien.
 */
export function weatherDependsOnChange(existing: WeatherRelevantEvent, dto: WeatherRelevantChanges): boolean {
  if (dto.eventDate !== undefined && new Date(dto.eventDate).getTime() !== existing.eventDate.getTime()) return true;
  if (dto.sessions !== undefined) {
    const next = dto.sessions ? JSON.stringify(dto.sessions) : null;
    if (next !== existing.sessions) return true;
  }
  return dto.spaceId !== undefined && dto.spaceId !== existing.spaceId;
}

/** Fragment `data` Prisma à étaler dans update() quand la modification invalide la météo. */
export function weatherResetFor(existing: WeatherRelevantEvent, dto: WeatherRelevantChanges) {
  return weatherDependsOnChange(existing, dto) ? WEATHER_RESET : {};
}
