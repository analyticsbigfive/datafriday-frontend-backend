import { BadRequestException } from '@nestjs/common';

/**
 * Courbe prédite par minute, figée dans EventPredictVersion.predictedTimeline.
 *
 * Grain : UNE valeur par minute (CA et quantités sommés sur tous les PdV et articles). Le
 * grain PdV x minute ou article x minute dépasserait la limite de corps de requête par défaut
 * (100 ko) sur un gros événement ; la courbe totale tient en quelques ko. Format colonnaire
 * (trois tableaux de même longueur) pour éviter de répéter les clés par point.
 *
 * `v` versionne le format : un grain plus fin pourra s'ajouter sans migration (colonne Json).
 */
export interface PredictedTimelineSnapshot {
  v: 1;
  grain: 'minute';
  /** Minutes locales datées "YYYY-MM-DDTHH:MM" (ou "HH:MM" si la source n'est pas datée). */
  m: string[];
  /** Quantité prédite par minute. */
  q: number[];
  /** CA prédit par minute (EUR). */
  r: number[];
}

/** Un événement long (48 h) tient largement en 1 minute / point. */
export const PREDICTED_TIMELINE_MAX_POINTS = 4000;

/**
 * Valide la forme et la taille. Renvoie le snapshot nettoyé (nombres finis, minutes en
 * chaînes), ou null si absent. Lève 400 si la structure est incohérente.
 */
export function sanitizePredictedTimeline(input: unknown): PredictedTimelineSnapshot | null {
  if (input === null || input === undefined) return null;
  const raw = input as Partial<PredictedTimelineSnapshot>;
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.m) || !Array.isArray(raw.q) || !Array.isArray(raw.r)) {
    throw new BadRequestException('predictedTimeline invalide : m, q et r doivent être des tableaux');
  }
  const n = raw.m.length;
  if (raw.q.length !== n || raw.r.length !== n) {
    throw new BadRequestException('predictedTimeline invalide : m, q et r doivent avoir la même longueur');
  }
  if (n > PREDICTED_TIMELINE_MAX_POINTS) {
    throw new BadRequestException(`predictedTimeline trop longue (${n} points, maximum ${PREDICTED_TIMELINE_MAX_POINTS})`);
  }
  const num = (x: unknown) => (Number.isFinite(Number(x)) ? Number(x) : 0);
  return {
    v: 1,
    grain: 'minute',
    m: raw.m.map((x) => String(x)),
    q: raw.q.map(num),
    r: raw.r.map(num),
  };
}
