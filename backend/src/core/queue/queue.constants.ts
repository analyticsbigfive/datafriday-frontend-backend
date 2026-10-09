// Queue name constants - separate file to avoid circular dependencies

export const QUEUES = {
  DATA_SYNC: 'data-sync',
  AGGREGATION: 'aggregation',
  SIMULATION: 'simulation-run',
} as const;
