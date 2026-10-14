import { weatherDependsOnChange, weatherResetFor, WEATHER_RESET } from './event-weather-reset';

describe('invalidation de la météo à la modification', () => {
  const existing = {
    eventDate: new Date('2026-10-13T00:00:00Z'),
    sessions: JSON.stringify([{ doorsOpening: '19:00', showTime: '20:30' }]),
    spaceId: 'space-1',
  };

  it('remet la météo à null si la date change', () => {
    expect(weatherResetFor(existing, { eventDate: '2026-10-20' })).toEqual(WEATHER_RESET);
    expect(WEATHER_RESET).toEqual({ weatherCode: null, temperatureC: null, weatherFetchedAt: null });
  });

  it("remet la météo à null si les sessions (heure du show) changent", () => {
    expect(weatherDependsOnChange(existing, { sessions: [{ doorsOpening: '19:00', showTime: '21:00' }] })).toBe(true);
    expect(weatherDependsOnChange(existing, { sessions: null })).toBe(true);
  });

  it("remet la météo à null si l'espace change", () => {
    expect(weatherDependsOnChange(existing, { spaceId: 'space-2' })).toBe(true);
    expect(weatherDependsOnChange(existing, { spaceId: null })).toBe(true);
  });

  it('ne touche à rien si les valeurs sont identiques ou absentes', () => {
    expect(weatherResetFor(existing, {})).toEqual({});
    expect(weatherResetFor(existing, { eventDate: '2026-10-13' })).toEqual({});
    expect(weatherResetFor(existing, { sessions: [{ doorsOpening: '19:00', showTime: '20:30' }], spaceId: 'space-1' })).toEqual({});
  });
});
