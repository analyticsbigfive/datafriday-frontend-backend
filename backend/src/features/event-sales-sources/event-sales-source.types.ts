/**
 * Sources de ventes d'un évènement (ADR_MULTI_SOURCE). Les valeurs sont des chaînes OUVERTES en
 * base (pas d'enum Prisma) : ajouter un mode ou une origine ne demande pas de migration.
 */
export const SALES_SOURCE_WINDOW_MODES = {
  /** Ventes d'un SalesEvent (t.eventId seul). */
  SALES_EVENT: 'sales-event',
  /** Ventes d'un SalesEvent bornées par la fenêtre de l'évènement. */
  SALES_EVENT_RANGE: 'sales-event-range',
  /** Ventes d'une intégration bornées par la fenêtre. */
  INTEGRATION_RANGE: 'integration-range',
  /** Fenêtre de dates seule, bornée aux intégrations mappées à l'espace. */
  DATE_RANGE: 'date-range',
} as const;
export type SalesSourceWindowMode = (typeof SALES_SOURCE_WINDOW_MODES)[keyof typeof SALES_SOURCE_WINDOW_MODES];

export const SALES_SOURCE_ORIGINS = {
  /** Déduite ou matérialisée depuis les champs historiques de l'évènement. */
  AUTO: 'auto',
  /** Posée par le démarrage de la caisse Data Friday. */
  POS: 'pos',
  /** Ajoutée par un utilisateur (pas d'écran en V1). */
  MANUAL: 'manual',
} as const;

/** Source déclarée (ligne active de EventSalesSource), forme lue par les moteurs. */
export interface DeclaredSalesSource {
  eventId: string;
  integrationId: string;
  salesEventId: string | null;
  windowMode: string;
  origin: string;
}
