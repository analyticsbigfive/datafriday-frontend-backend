/** Météo à l'heure du show stockée sur l'event (Event.weatherCode / Event.temperatureC). */
export interface EventWeather {
  /** Code WMO (0 = dégagé, 61 = pluie, 95 = orage...). */
  weatherCode: number;
  /** Température en °C, arrondie à 0,1. */
  temperatureC: number;
}

/** Ce que le service a besoin de savoir d'un event pour résoudre sa météo. */
export interface WeatherEventInput {
  id: string;
  /** Jour calendaire de l'event (ancré à minuit UTC). */
  eventDate: Date;
  /** Event.sessions brut (JSON sérialisé), porte showTime. */
  sessions?: unknown;
  space?: { city?: string | null; country?: string | null } | null;
}

/**
 * Issue de la résolution d'un event :
 * - ok : météo trouvée ;
 * - missing : donnée introuvable de façon durable (ville vide ou inconnue, date hors archive) ;
 * - error : échec transitoire (réseau, délai dépassé, quota), à retenter dès la prochaine passe.
 */
export type WeatherOutcome =
  | ({ kind: 'ok' } & EventWeather)
  | { kind: 'missing' }
  | { kind: 'error' };
