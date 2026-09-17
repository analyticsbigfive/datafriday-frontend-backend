import { StaffingService } from './staffing.service';
import {
  DEFAULT_OFFSET_CLOSE_MINUTES,
  DEFAULT_OFFSET_OPEN_MINUTES,
  StaffingCalculatorService,
} from './staffing-calculator.service';

/**
 * `getStaffing` : la fenêtre suggérée (portes − 2 h → fin + 1 h) suit les heures de
 * l'event, et les lignes ALGO non modifiées par l'utilisateur la suivent aussi (recalées
 * en base). Retour Bertrand 2026-09-17 : après avoir renseigné l'ouverture des portes
 * (15:15) sur un event qui n'en avait pas, les lignes restaient sur 00:00 → 01:50.
 */
describe('StaffingService.getStaffing : horaires suggérés et recalage des lignes ALGO', () => {
  const T = (iso: string) => new Date(iso);
  const stale = { start: T('2026-09-18T22:00:00.000Z'), end: T('2026-09-19T23:50:00.000Z') };

  const line = (overrides: Record<string, unknown>) => ({
    id: 'l1',
    eventId: 'ev',
    elementId: 'el1',
    roleId: 'r1',
    algoKey: 'CAISSIER',
    enabled: true,
    source: 'ALGO',
    userModified: false,
    supplierType: 'AGENCY',
    supplierId: null,
    personId: null,
    personLabel: null,
    hourlyRate: 19.5,
    startTime: stale.start,
    endTime: stale.end,
    role: { name: 'Caissier', algoKey: 'CAISSIER' },
    person: null,
    supplier: null,
    ...overrides,
  });

  function build(event: Record<string, unknown>, lines: any[]) {
    const prisma: any = {
      event: { findFirst: jest.fn().mockResolvedValue(event) },
      space: { findFirst: jest.fn().mockResolvedValue({ timezone: 'Europe/Paris' }) },
      eventStaffLine: {
        findMany: jest.fn().mockResolvedValue(lines),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      hrGoal: { findMany: jest.fn() },
      hrStaffRatio: { findMany: jest.fn() },
      spaceElement: { findMany: jest.fn() },
      elementPerformance: { findMany: jest.fn() },
      hrRole: { findFirst: jest.fn().mockResolvedValue(null) },
      // resolveSettings puis (elements, perfs) : les deux passent par $transaction([...]).
      $transaction: jest
        .fn()
        .mockResolvedValueOnce([[], []])
        .mockResolvedValueOnce([[{ id: 'el1', name: 'Buvette E', type: 'fnb_bar' }], []]),
    };
    const service = new StaffingService(prisma, new StaffingCalculatorService(), {
      hasFullAccess: () => true,
      getAccessibleSpaceIds: async () => 'ALL',
    } as any);
    return { prisma, service };
  }

  const baseEvent = {
    id: 'ev',
    tenantId: 't1',
    spaceId: 's1',
    configurationId: 'cfg',
    eventDate: T('2026-09-19T00:00:00.000Z'),
    eventStartDate: T('2026-09-19T00:00:00.000Z'),
    eventEndDate: T('2026-09-19T00:00:00.000Z'),
    eventEndTime: '22:50',
  };

  it('portes renseignées après coup : la fenêtre suit (15:15 − 2 h → 22:50 + 1 h) et la ligne ALGO est recalée en base', async () => {
    const event = { ...baseEvent, sessions: JSON.stringify([{ doorsOpening: '15:15', showTime: '17:15' }]) };
    const { prisma, service } = build(event, [line({})]);

    const out = await service.getStaffing('ev', 't1');

    // Heure d'été Paris (UTC+2) : 15:15 → 13:15Z ; − 2 h = 11:15Z. 22:50 → 20:50Z ; + 1 h = 21:50Z.
    expect(out.schedule.startTime).toEqual(T('2026-09-19T11:15:00.000Z'));
    expect(out.schedule.endTime).toEqual(T('2026-09-19T21:50:00.000Z'));
    expect(DEFAULT_OFFSET_OPEN_MINUTES).toBe(-120);
    expect(DEFAULT_OFFSET_CLOSE_MINUTES).toBe(60);
    expect(prisma.eventStaffLine.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['l1'] } },
      data: { startTime: T('2026-09-19T11:15:00.000Z'), endTime: T('2026-09-19T21:50:00.000Z') },
    });
    const l = out.elements[0].lines[0];
    expect(l.startTime).toEqual(T('2026-09-19T11:15:00.000Z'));
    expect(l.endTime).toEqual(T('2026-09-19T21:50:00.000Z'));
    // Coût recalculé sur la nouvelle amplitude (10 h 35 × 19,50).
    expect(l.totalCost).toBeCloseTo(19.5 * (10 + 35 / 60), 2);
  });

  it("une ligne userModified ou MANUAL garde ses horaires ; une ligne déjà alignée n'est pas réécrite", async () => {
    const event = { ...baseEvent, sessions: JSON.stringify([{ doorsOpening: '15:15' }]) };
    const aligned = { start: T('2026-09-19T11:15:00.000Z'), end: T('2026-09-19T21:50:00.000Z') };
    const { prisma, service } = build(event, [
      line({ id: 'u', userModified: true }),
      line({ id: 'm', source: 'MANUAL' }),
      line({ id: 'ok', startTime: aligned.start, endTime: aligned.end }),
    ]);

    const out = await service.getStaffing('ev', 't1');

    expect(prisma.eventStaffLine.updateMany).not.toHaveBeenCalled();
    const byId = Object.fromEntries(out.elements[0].lines.map((l: any) => [l.id, l]));
    expect(byId.u.startTime).toEqual(stale.start);
    expect(byId.m.startTime).toEqual(stale.start);
    expect(byId.ok.startTime).toEqual(aligned.start);
  });

  it("sans heure d'ouverture : repli sur le jour calendaire (comportement historique)", async () => {
    const event = { ...baseEvent, sessions: null, eventEndTime: null };
    const { service } = build(event, []);
    const out = await service.getStaffing('ev', 't1');
    // Jour à minuit UTC − 2 h, fin = portes + 6 h par défaut + 1 h.
    expect(out.schedule.startTime).toEqual(T('2026-09-18T22:00:00.000Z'));
    expect(out.schedule.endTime).toEqual(T('2026-09-19T07:00:00.000Z'));
  });
});
