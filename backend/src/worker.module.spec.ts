import { Test } from '@nestjs/testing';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { SchedulerRegistry } from '@nestjs/schedule';

/**
 * Graphe d'injection des deux process. Compile sans démarrer (pas de onModuleInit,
 * donc ni base ni Redis requis). Ce test aurait détecté que le worker ne démarrait
 * pas (ClsService absent, 2026-10-02).
 */
const REQUIRED_ENV = {
  DATABASE_URL: 'postgresql://user@localhost:5432/unused',
  ENCRYPTION_KEY: 'a'.repeat(64),
  JWT_SECRET: 'test',
  GUEST_PIN_JWT_SECRET: 'test',
  GUEST_PIN_HMAC_SECRET: 'test',
};

const BULL_PROCESSOR_METADATA = 'bullmq:processor_metadata';

function loadedProcessors(moduleRef: { get: (t: unknown) => unknown }): string[] {
  const discovery = moduleRef.get(DiscoveryService) as DiscoveryService;
  const reflector = moduleRef.get(Reflector) as Reflector;
  return discovery
    .getProviders()
    .filter((w) => w.metatype && reflector.get(BULL_PROCESSOR_METADATA, w.metatype as never))
    .map((w) => w.name as string)
    .sort();
}

describe('Process modules (injection)', () => {
  const overrides: Record<string, string> = { ...REQUIRED_ENV, BACKGROUND_JOBS_IN_API: 'false' };
  const previous: Record<string, string | undefined> = {};
  beforeAll(() => {
    for (const [key, value] of Object.entries(overrides)) {
      previous[key] = process.env[key];
      process.env[key] = value;
    }
  });
  afterAll(() => {
    // Restaure clé par clé : réaffecter process.env casserait son comportement natif.
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('le worker compile et charge tous les processors et crons', async () => {
    const { WorkerModule } = await import('./worker.module');
    const moduleRef = await Test.createTestingModule({
      imports: [WorkerModule],
      providers: [DiscoveryService, MetadataScanner],
    }).compile();

    expect(loadedProcessors(moduleRef)).toEqual([
      'AggregationProcessor',
      'DataSyncProcessor',
      'SimulationRunProcessor',
    ]);
    expect(moduleRef.get(SchedulerRegistry, { strict: false })).toBeDefined();
    await moduleRef.close();
  }, 60_000);

  it('l’API compile sans aucun processor ni cron', async () => {
    const { AppModule } = await import('./app.module');
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      providers: [DiscoveryService, MetadataScanner],
    }).compile();

    expect(loadedProcessors(moduleRef)).toEqual([]);
    expect(() => moduleRef.get(SchedulerRegistry, { strict: false })).toThrow();
    await moduleRef.close();
  }, 60_000);
});
