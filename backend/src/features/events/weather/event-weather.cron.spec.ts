import { EventWeatherCronService, NIGHTLY_WEATHER_BATCH } from './event-weather.cron';
import { passthroughTenantContext } from '../../../core/tenant/tenant-context.testing';

describe('EventWeatherCronService', () => {
  let fill: { fillBatch: jest.Mock };
  let redis: { acquireLock: jest.Mock; releaseLock: jest.Mock };
  let cron: EventWeatherCronService;

  beforeEach(() => {
    fill = { fillBatch: jest.fn().mockResolvedValue({ scanned: 3, filled: 2, missing: 1, failed: 0, ids: [] }) };
    redis = { acquireLock: jest.fn().mockResolvedValue(true), releaseLock: jest.fn().mockResolvedValue(undefined) };
    cron = new EventWeatherCronService(fill as any, redis as any, passthroughTenantContext() as any);
  });

  it('traite un lot borné puis libère le verrou', async () => {
    await cron.nightly();
    expect(fill.fillBatch).toHaveBeenCalledWith(NIGHTLY_WEATHER_BATCH);
    expect(redis.releaseLock).toHaveBeenCalled();
  });

  it("ne fait rien si une autre instance tient le verrou", async () => {
    redis.acquireLock.mockResolvedValue(false);
    await cron.nightly();
    expect(fill.fillBatch).not.toHaveBeenCalled();
    expect(redis.releaseLock).not.toHaveBeenCalled();
  });

  it('continue sans verrou si Redis est indisponible', async () => {
    redis.acquireLock.mockRejectedValue(new Error('redis down'));
    await cron.nightly();
    expect(fill.fillBatch).toHaveBeenCalled();
  });

  it('ne jette jamais et libère le verrou si le lot échoue', async () => {
    fill.fillBatch.mockRejectedValue(new Error('db'));
    await expect(cron.nightly()).resolves.toBeUndefined();
    expect(redis.releaseLock).toHaveBeenCalled();
  });
});
