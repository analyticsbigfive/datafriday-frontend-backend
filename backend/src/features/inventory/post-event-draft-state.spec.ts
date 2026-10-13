import { loadPostEventDraftStates } from './post-event-draft-state';

/** Prisma minimal : espace, events, fenêtres post-event, accès PIN. */
function fakePrisma(data: {
  events: Array<{ id: string; eventDate: string; sessions?: unknown }>;
  windows?: Array<{ id: string; eventId: string; status: string }>;
  accesses?: Array<{ windowId: string; status: string }>;
}) {
  const asEvent = (e: { id: string; eventDate: string; sessions?: unknown }) => ({
    id: e.id,
    eventDate: new Date(e.eventDate),
    eventStartDate: null,
    eventEndDate: null,
    eventEndTime: null,
    sessions: e.sessions ?? null,
  });
  return {
    space: { findFirst: async () => ({ timezone: 'Europe/Paris' }) },
    event: {
      findMany: async ({ where }: any) =>
        data.events
          .map(asEvent)
          .filter((e) => (where.id?.in ? where.id.in.includes(e.id) : true))
          .filter((e) => (where.eventDate ? e.eventDate >= where.eventDate.gte && e.eventDate <= where.eventDate.lte : true)),
    },
    inventoryWindow: {
      findMany: async ({ where }: any) => (data.windows ?? []).filter((w) => where.eventId.in.includes(w.eventId)),
    },
    guestPinAccess: {
      findMany: async ({ where }: any) =>
        (data.accesses ?? []).filter((a) => where.windowId.in.includes(a.windowId) && a.status === where.status),
    },
  } as any;
}

const NOW = new Date('2026-10-13T12:00:00Z');
const run = (prisma: any, eventIds = ['evA']) => loadPostEventDraftStates(prisma, 't1', 's1', eventIds, NOW);

describe('loadPostEventDraftStates', () => {
  const evA = { id: 'evA', eventDate: '2026-10-10T00:00:00Z' };

  it('fenêtre post-event ouverte, aucun match suivant commencé : brouillon', async () => {
    const states = await run(fakePrisma({ events: [evA], windows: [{ id: 'w', eventId: 'evA', status: 'open' }] }));
    expect(states.get('evA')).toBe(true);
  });

  it('après l’Arrêt (fenêtre close, aucun PDV rouvert) : final', async () => {
    const states = await run(fakePrisma({ events: [evA], windows: [{ id: 'w', eventId: 'evA', status: 'closed' }] }));
    expect(states.get('evA')).toBe(false);
  });

  it('fenêtre arrêtée mais un PDV rouvert un par un : brouillon', async () => {
    const states = await run(
      fakePrisma({
        events: [evA],
        windows: [{ id: 'w', eventId: 'evA', status: 'closed' }],
        accesses: [{ windowId: 'w', status: 'active' }],
      }),
    );
    expect(states.get('evA')).toBe(true);
  });

  it('sans fenêtre (comptage staff seul), match non passé : brouillon', async () => {
    const states = await run(fakePrisma({ events: [evA] }));
    expect(states.get('evA')).toBe(true);
  });

  it('match passé (événement suivant de l’espace commencé), fenêtre encore ouverte : final', async () => {
    const states = await run(
      fakePrisma({
        events: [evA, { id: 'evB', eventDate: '2026-10-12T00:00:00Z' }],
        windows: [{ id: 'w', eventId: 'evA', status: 'open' }],
      }),
    );
    expect(states.get('evA')).toBe(false);
  });

  it('événement suivant pas encore commencé : reste brouillon (comptage des jours suivants)', async () => {
    const states = await run(
      fakePrisma({
        events: [evA, { id: 'evB', eventDate: '2026-10-14T00:00:00Z' }],
        windows: [{ id: 'w', eventId: 'evA', status: 'open' }],
      }),
    );
    expect(states.get('evA')).toBe(true);
  });

  it('même jour : un événement du soir commencé rend passé celui de l’après-midi, pas l’inverse', async () => {
    const afternoon = { id: 'evPM', eventDate: '2026-10-13T00:00:00Z', sessions: [{ doorsOpening: '10:00' }] };
    const evening = { id: 'evEve', eventDate: '2026-10-13T00:00:00Z', sessions: [{ doorsOpening: '13:00' }] };
    const states = await run(
      fakePrisma({
        events: [afternoon, evening],
        windows: [
          { id: 'w1', eventId: 'evPM', status: 'open' },
          { id: 'w2', eventId: 'evEve', status: 'open' },
        ],
      }),
      ['evPM', 'evEve'],
    );
    // 13:00 Paris = 11:00 UTC <= NOW (12:00 UTC) : le soir a commencé.
    expect(states.get('evPM')).toBe(false);
    expect(states.get('evEve')).toBe(true);
  });
});
