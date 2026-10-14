import { EventWeatherService, resolveShowHour } from './event-weather.service';

/** Toutes les requêtes réseau sont moquées : aucun vrai appel Open-Meteo. */
describe('EventWeatherService', () => {
  const realFetch = global.fetch;
  let fetchMock: jest.Mock;
  let service: EventWeatherService;

  const hours = Array.from({ length: 24 }, (_, h) => `2026-10-13T${String(h).padStart(2, '0')}:00`);
  const archiveBody = {
    hourly: {
      time: hours,
      temperature_2m: hours.map((_, h) => 10 + h + 0.04),
      weather_code: hours.map((_, h) => h),
    },
  };
  const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
  const geoBody = { results: [{ latitude: 48.85, longitude: 2.35, country: 'France', country_code: 'FR' }] };

  /** Route la réponse selon l'URL appelée. */
  function route(geo: unknown = json(geoBody), archive: unknown = json(archiveBody)) {
    fetchMock.mockImplementation(async (url: string) => (url.includes('geocoding-api') ? geo : archive));
  }

  const event = (over: Record<string, unknown> = {}) => ({
    id: 'e1',
    eventDate: new Date('2026-10-13T00:00:00Z'),
    sessions: '[{"doorsOpening":"19:00","showTime":"20:30"}]',
    space: { city: 'Paris', country: 'France' },
    ...over,
  });

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as any;
    service = new EventWeatherService();
    // Supprime la pause entre appels pour accélérer les tests.
    (service as any).lastCallAt = -1e12;
  });
  afterEach(() => {
    global.fetch = realFetch;
    jest.restoreAllMocks();
  });

  describe('resolveShowHour', () => {
    it("prend l'heure de sessions[0].showTime", () => {
      expect(resolveShowHour('[{"doorsOpening":"19:00","showTime":"20:30"}]')).toBe(20);
      expect(resolveShowHour([{ showTime: '9:15' }])).toBe(9);
    });
    it('se replie sur 20h sans session, sans showTime ou avec une valeur invalide', () => {
      expect(resolveShowHour(null)).toBe(20);
      expect(resolveShowHour('[]')).toBe(20);
      expect(resolveShowHour('[{"doorsOpening":"19:00"}]')).toBe(20);
      expect(resolveShowHour('[{"showTime":"soir"}]')).toBe(20);
      expect(resolveShowHour('[{"showTime":"27:00"}]')).toBe(20);
    });
  });

  it("renvoie la météo à l'heure du show, température arrondie à 0,1", async () => {
    route();
    const weather = await service.fetchEventWeather(event());
    expect(weather).toEqual({ weatherCode: 20, temperatureC: 30 });
  });

  it('utilise 20h quand aucune heure de show', async () => {
    route();
    const weather = await service.fetchEventWeather(event({ sessions: null }));
    expect(weather?.weatherCode).toBe(20);
  });

  it('interroge Open-Meteo avec la date, le fuseau auto et les variables horaires', async () => {
    route();
    await service.fetchEventWeather(event());
    const archiveUrl = fetchMock.mock.calls.map((c) => c[0] as string).find((u) => u.includes('archive-api'))!;
    expect(archiveUrl).toContain('start_date=2026-10-13');
    expect(archiveUrl).toContain('end_date=2026-10-13');
    expect(archiveUrl).toContain('timezone=auto');
    expect(archiveUrl).toContain('hourly=temperature_2m%2Cweather_code');
  });

  it('regroupe : un géocodage par ville, un appel archive par (ville, date)', async () => {
    route();
    const outcomes = await service.resolveMany([
      event({ id: 'a', sessions: '[{"showTime":"18:00"}]' }),
      event({ id: 'b', sessions: '[{"showTime":"21:00"}]' }),
      event({ id: 'c', eventDate: new Date('2026-10-14T00:00:00Z') }),
    ]);
    const urls = fetchMock.mock.calls.map((c) => c[0] as string);
    expect(urls.filter((u) => u.includes('geocoding-api'))).toHaveLength(1);
    expect(urls.filter((u) => u.includes('archive-api'))).toHaveLength(2);
    // Même appel archive, heures de show différentes.
    expect(outcomes.get('a')).toMatchObject({ kind: 'ok', weatherCode: 18 });
    expect(outcomes.get('b')).toMatchObject({ kind: 'ok', weatherCode: 21 });
  });

  it('préfère le résultat du pays demandé', async () => {
    route(
      json({
        results: [
          { latitude: 1, longitude: 1, country: 'Canada' },
          { latitude: 48.8, longitude: 2.3, country: 'France' },
        ],
      }),
    );
    await service.fetchEventWeather(event());
    const archiveUrl = fetchMock.mock.calls.map((c) => c[0] as string).find((u) => u.includes('archive-api'))!;
    expect(archiveUrl).toContain('latitude=48.8');
  });

  it('ne jette jamais : réseau en panne => outcome error, null en mode simple', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNRESET'));
    const outcomes = await service.resolveMany([event()]);
    expect(outcomes.get('e1')).toEqual({ kind: 'error' });
    await expect(service.fetchEventWeather(event())).resolves.toBeNull();
  });

  it('HTTP 500 est transitoire (error), pas introuvable', async () => {
    route(json(geoBody), json({}, 500));
    expect((await service.resolveMany([event()])).get('e1')).toEqual({ kind: 'error' });
  });

  it('ville inconnue, ville vide ou date hors archive => missing, sans jeter', async () => {
    route(json({ results: [] }));
    expect((await service.resolveMany([event()])).get('e1')).toEqual({ kind: 'missing' });

    const noCity = await service.resolveMany([event({ space: { city: '  ' } }), event({ id: 'e2', space: null })]);
    expect(noCity.get('e1')).toEqual({ kind: 'missing' });
    expect(noCity.get('e2')).toEqual({ kind: 'missing' });

    route(json(geoBody), json({ error: true, reason: 'out of range' }, 400));
    expect((await service.resolveMany([event({ id: 'e3', eventDate: new Date('2999-01-01T00:00:00Z') })])).get('e3')).toEqual({
      kind: 'missing',
    });
  });

  it('met la ville inconnue en cache négatif : pas de nouveau géocodage', async () => {
    route(json({ results: [] }));
    await service.resolveMany([event()]);
    await service.resolveMany([event({ id: 'e2' })]);
    expect(fetchMock.mock.calls.filter((c) => (c[0] as string).includes('geocoding-api'))).toHaveLength(1);
  });
});
