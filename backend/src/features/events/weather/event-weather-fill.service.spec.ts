import { EventWeatherFillService, localDay, WEATHER_RETRY_AFTER_MS } from './event-weather-fill.service';

describe('EventWeatherFillService', () => {
  const now = new Date('2026-10-14T02:00:00Z');
  let prisma: any;
  let weather: { resolveMany: jest.Mock };
  let service: EventWeatherFillService;

  const row = (id: string, day: string, tz = 'Europe/Paris') => ({
    id,
    eventDate: new Date(`${day}T00:00:00Z`),
    sessions: null,
    space: { city: 'Paris', country: 'France', timezone: tz },
  });

  beforeEach(() => {
    prisma = { event: { findMany: jest.fn(), update: jest.fn().mockResolvedValue({}) } };
    weather = { resolveMany: jest.fn() };
    service = new EventWeatherFillService(prisma, weather as any);
  });

  it('localDay donne le jour local du fuseau', () => {
    expect(localDay(new Date('2026-10-13T23:30:00Z'), 'Europe/Paris')).toBe('2026-10-14');
    expect(localDay(new Date('2026-10-13T23:30:00Z'), 'America/New_York')).toBe('2026-10-13');
  });

  it('cible les events jamais tentés, ou sans météo retentés après 7 jours sur 30 jours', () => {
    const where: any = service.buildWhere(now, ['x']);
    expect(where.isSimulated).toBe(false);
    expect(where.id).toEqual({ notIn: ['x'] });
    expect(where.OR[0]).toEqual({ weatherFetchedAt: null });
    expect(where.OR[1].weatherCode).toBeNull();
    expect(where.OR[1].weatherFetchedAt.lt).toEqual(new Date(now.getTime() - WEATHER_RETRY_AFTER_MS));
  });

  it('remplit les events trouvés et marque les introuvables sans météo', async () => {
    prisma.event.findMany.mockResolvedValue([row('a', '2026-10-13'), row('b', '2026-10-12')]);
    weather.resolveMany.mockResolvedValue(
      new Map([
        ['a', { kind: 'ok', weatherCode: 61, temperatureC: 12.3 }],
        ['b', { kind: 'missing' }],
      ]),
    );
    const result = await service.fillBatch(100, { now });
    expect(result).toMatchObject({ scanned: 2, filled: 1, missing: 1, failed: 0 });
    expect(prisma.event.update).toHaveBeenCalledWith({
      where: { id: 'a' },
      data: { weatherCode: 61, temperatureC: 12.3, weatherFetchedAt: now },
    });
    // Introuvable : weatherFetchedAt posé pour ne pas être retenté chaque nuit.
    expect(prisma.event.update).toHaveBeenCalledWith({
      where: { id: 'b' },
      data: { weatherCode: null, temperatureC: null, weatherFetchedAt: now },
    });
  });

  it("n'écrit rien pour un échec transitoire (retenté la nuit suivante)", async () => {
    prisma.event.findMany.mockResolvedValue([row('a', '2026-10-13')]);
    weather.resolveMany.mockResolvedValue(new Map([['a', { kind: 'error' }]]));
    const result = await service.fillBatch(100, { now });
    expect(result.failed).toBe(1);
    expect(prisma.event.update).not.toHaveBeenCalled();
  });

  it("un échec d'écriture n'arrête pas le lot", async () => {
    prisma.event.findMany.mockResolvedValue([row('a', '2026-10-13'), row('b', '2026-10-13')]);
    weather.resolveMany.mockResolvedValue(
      new Map([
        ['a', { kind: 'ok', weatherCode: 0, temperatureC: 20 }],
        ['b', { kind: 'ok', weatherCode: 1, temperatureC: 21 }],
      ]),
    );
    prisma.event.update.mockRejectedValueOnce(new Error('boom'));
    const result = await service.fillBatch(100, { now });
    expect(prisma.event.update).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ filled: 2, failed: 1 });
  });

  it("ignore l'event du jour (pas encore passé dans le fuseau du Space)", async () => {
    // 02:00Z le 14 = 04:00 Paris le 14 : l'event du 14 n'est pas passé, celui du 13 oui.
    prisma.event.findMany.mockResolvedValue([row('today', '2026-10-14'), row('past', '2026-10-13')]);
    weather.resolveMany.mockResolvedValue(new Map([['past', { kind: 'missing' }]]));
    await service.fillBatch(100, { now });
    expect(weather.resolveMany).toHaveBeenCalledWith([expect.objectContaining({ id: 'past' })]);
  });

  it('dry-run : résout mais ne modifie rien', async () => {
    prisma.event.findMany.mockResolvedValue([row('a', '2026-10-13')]);
    weather.resolveMany.mockResolvedValue(new Map([['a', { kind: 'ok', weatherCode: 3, temperatureC: 9 }]]));
    const result = await service.fillBatch(100, { now, dryRun: true });
    expect(result.filled).toBe(1);
    expect(prisma.event.update).not.toHaveBeenCalled();
  });

  it('borne le lot par take et trie du plus récent au plus ancien', async () => {
    prisma.event.findMany.mockResolvedValue([]);
    await service.fillBatch(100, { now });
    expect(prisma.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100, orderBy: { eventDate: 'desc' } }),
    );
  });
});
