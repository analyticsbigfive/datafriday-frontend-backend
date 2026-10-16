// Queue name constants - separate file to avoid circular dependencies

export const QUEUES = {
  DATA_SYNC: 'data-sync',
  AGGREGATION: 'aggregation',
  SIMULATION: 'simulation-run',
} as const;

/**
 * Priorité BullMQ de la file d'agrégation (1 = la plus haute). Un job minute du Live (une vente
 * vient d'arriver, objectif d'affichage < 30 s) passe devant un rebuild complet en attente, sans
 * nouvelle file (ADR_MULTI_SOURCE 4.4). BullMQ sert un job SANS priorité avant un job avec : les
 * deux types reçoivent donc une priorité explicite.
 */
export const AGGREGATION_JOB_PRIORITY = {
  MINUTES: 1,
  REBUILD: 10,
} as const;
