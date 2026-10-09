import { StaffingService } from './staffing.service';
import {
  DEFAULT_OFFSET_CLOSE_MINUTES,
  DEFAULT_OFFSET_OPEN_MINUTES,
  StaffingCalculatorService,
} from './staffing-calculator.service';
import { spaceAccessStub } from '../../core/auth/space-access.testing';

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
        // update() renvoie l'args : le $transaction générique ci-dessous les collecte.
        update: jest.fn((args: any) => args),
      },
      hrGoal: { findMany: jest.fn() },
      hrStaffRatio: { findMany: jest.fn() },
      spaceElement: { findMany: jest.fn() },
      elementPerformance: { findMany: jest.fn() },
      hrRole: { findFirst: jest.fn().mockResolvedValue(null) },
      // $transaction([...]) sert trois lookups : settings (hrGoal/hrStaffRatio), recalage des
      // lignes (eventStaffLine.update), puis (spaceElement, elementPerformance). On les
      // distingue par le premier élément du tableau.
      $transaction: jest.fn(async (ops: any[]) => {
        if (ops.length && ops[0]?.where?.id && ops[0]?.data) {
          prisma._realigned = ops;
          return ops;
        }
        if (prisma._settingsServed) return [[{ id: 'el1', name: 'Buvette E', type: 'fnb_bar' }], []];
        prisma._settingsServed = true;
        return [[], []];
      }),
      _realigned: [] as any[],
      _settingsServed: false,
    };
    const service = new StaffingService(prisma, new StaffingCalculatorService(), spaceAccessStub());
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
    expect(prisma._realigned).toEqual([
      {
        where: { id: 'l1' },
        data: { startTime: T('2026-09-19T11:15:00.000Z'), endTime: T('2026-09-19T21:50:00.000Z') },
      },
    ]);
    const l = out.elements[0].lines[0];
    expect(l.startTime).toEqual(T('2026-09-19T11:15:00.000Z'));
    expect(l.endTime).toEqual(T('2026-09-19T21:50:00.000Z'));
    // Coût recalculé sur la nouvelle amplitude (10 h 35 × 19,50).
    expect(l.totalCost).toBeCloseTo(19.5 * (10 + 35 / 60), 2);
  });

  it("une ligne userModified ou MANUAL garde ses horaires tant qu'ils tiennent dans la fenêtre ; une ligne déjà alignée n'est pas réécrite", async () => {
    const event = { ...baseEvent, sessions: JSON.stringify([{ doorsOpening: '15:15' }]) };
    const aligned = { start: T('2026-09-19T11:15:00.000Z'), end: T('2026-09-19T21:50:00.000Z') };
    const inside = { start: T('2026-09-19T14:00:00.000Z'), end: T('2026-09-19T20:00:00.000Z') };
    const { prisma, service } = build(event, [
      line({ id: 'u', userModified: true, startTime: inside.start, endTime: inside.end }),
      line({ id: 'm', source: 'MANUAL', startTime: inside.start, endTime: inside.end }),
      line({ id: 'ok', startTime: aligned.start, endTime: aligned.end }),
    ]);

    const out = await service.getStaffing('ev', 't1');

    expect(prisma._realigned).toEqual([]);
    const byId = Object.fromEntries(out.elements[0].lines.map((l: any) => [l.id, l]));
    expect(byId.u.startTime).toEqual(inside.start);
    expect(byId.m.endTime).toEqual(inside.end);
    expect(byId.ok.startTime).toEqual(aligned.start);
  });

  it('une ligne modifiée à la main qui DÉBORDE de la fenêtre est ramenée dedans (curseur hors piste au chargement, retour Bertrand)', async () => {
    const event = { ...baseEvent, sessions: JSON.stringify([{ doorsOpening: '15:15' }]) };
    const { prisma, service } = build(event, [
      // Réglée quand la fenêtre allait de 00:00 à 01:50 : 07:30 → 00:45 Paris.
      line({ id: 'u', userModified: true, startTime: T('2026-09-19T05:30:00.000Z'), endTime: T('2026-09-19T22:45:00.000Z') }),
      // Entièrement hors fenêtre : repart sur la fenêtre.
      line({ id: 'x', source: 'MANUAL', startTime: T('2026-09-19T02:00:00.000Z'), endTime: T('2026-09-19T04:00:00.000Z') }),
    ]);

    const out = await service.getStaffing('ev', 't1');

    const byId = Object.fromEntries(out.elements[0].lines.map((l: any) => [l.id, l]));
    expect(byId.u.startTime).toEqual(T('2026-09-19T11:15:00.000Z')); // clampé au début de fenêtre
    expect(byId.u.endTime).toEqual(T('2026-09-19T21:50:00.000Z')); // clampé à la fin de fenêtre
    expect(byId.x.startTime).toEqual(T('2026-09-19T11:15:00.000Z'));
    expect(byId.x.endTime).toEqual(T('2026-09-19T21:50:00.000Z'));
    expect(prisma._realigned.map((o: any) => o.where.id).sort()).toEqual(['u', 'x']);
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

/**
 * BUG-391-02 : « Generate Staff » doit partir du CA prédit affiché à l'écran Event Predict.
 * Priorité : corps de la requête > version par défaut > ElementPerformance.revenue.
 * goalTpe = 1 000 € : 3 000 € donnent n = 3 (2 caissiers + 1 runner, sans responsable PDV).
 */
describe('StaffingService.generate : source du CA prédictif et avertissements', () => {
  const GOAL_TPE = 1000;

  const element = (id: string, perfRevenue: number | null) => ({
    id,
    name: id,
    type: 'shop',
    subtypes: [],
    attributes: {},
    width: null,
    performances: perfRevenue === null ? [] : [{ revenue: perfRevenue, transactionsPerMinute: 0 }],
    menuItemSalesInputs: [],
  });

  function build(opts: { elements: any[]; versionRecords?: any[] | null }) {
    const prisma: any = {
      event: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'ev',
          tenantId: 't1',
          spaceId: 's1',
          configurationId: 'cfg',
          eventDate: new Date('2026-09-19T00:00:00.000Z'),
          sessions: null,
        }),
      },
      space: { findFirst: jest.fn().mockResolvedValue({ timezone: 'Europe/Paris' }) },
      hrGoal: { findMany: jest.fn() },
      hrStaffRatio: { findMany: jest.fn() },
      hrRole: { findMany: jest.fn() },
      hrPerson: { findMany: jest.fn() },
      hrRoleSpaceDefault: { findMany: jest.fn() },
      hrSupplier: { findMany: jest.fn() },
      hrSinkingRule: { findMany: jest.fn() },
      hrRoleMenuItemRatio: { findMany: jest.fn() },
      eventPredictVersion: {
        findFirst: jest
          .fn()
          .mockResolvedValue(opts.versionRecords ? { predictedRecords: opts.versionRecords } : null),
      },
      spaceElement: { findMany: jest.fn().mockResolvedValue(opts.elements) },
      eventStaffLine: {
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn((args: any) => ({ op: 'deleteMany', args })),
        createMany: jest.fn((args: any) => ({ op: 'createMany', args })),
      },
      elementPerformance: { upsert: jest.fn((args: any) => ({ op: 'upsert', args })) },
      // 1er appel : settings RH ; 2e : référentiel RH ; ensuite : écritures par élément.
      $transaction: jest.fn(async (ops: any[]) => {
        prisma._txCalls += 1;
        if (prisma._txCalls === 1) {
          return [
            [{ allSpaces: true, spaces: [], goalPerTpe: GOAL_TPE }],
            [{ allSpaces: true, spaces: [], staffPerZoneManager: 10 }],
          ];
        }
        if (prisma._txCalls === 2) return [[], [], [], [], [], []];
        prisma._writes.push(...ops);
        return ops;
      }),
      _txCalls: 0,
      _writes: [] as any[],
    };
    const service = new StaffingService(prisma, new StaffingCalculatorService(), spaceAccessStub());
    // La relecture (getStaffing) n'est pas l'objet de ces tests : on renvoie les avertissements.
    jest
      .spyOn(service, 'getStaffing')
      .mockImplementation(async (_e: string, _t: string, warnings: any[] = []) => ({ warnings }) as any);
    const createdFor = (elementId: string) =>
      prisma._writes
        .filter((w: any) => w.op === 'createMany')
        .flatMap((w: any) => w.args.data)
        .filter((l: any) => l.elementId === elementId).length;
    return { prisma, service, createdFor };
  }

  it("le CA envoyé par l'écran est prioritaire sur la version par défaut", async () => {
    const { prisma, service, createdFor } = build({
      elements: [element('el1', 0)],
      versionRecords: [{ shopId: 'el1', totalRevenue: 9000 }],
    });
    await service.generate('ev', 't1', undefined, { el1: 3000 });
    expect(createdFor('el1')).toBe(3);
    expect(prisma.eventPredictVersion.findFirst).not.toHaveBeenCalled();
  });

  it.each([[undefined], [{}], [null]])('corps %p : repli sur la version par défaut (agrégée par shopId)', async (override) => {
    const { prisma, service, createdFor } = build({
      elements: [element('el1', 0)],
      versionRecords: [
        { shopId: 'el1', totalRevenue: 1500 },
        { shopId: 'el1', totalRevenue: 500 },
      ],
    });
    await service.generate('ev', 't1', undefined, override as any);
    expect(prisma.eventPredictVersion.findFirst).toHaveBeenCalled();
    expect(createdFor('el1')).toBe(2);
  });

  it('ni corps ni version : repli sur ElementPerformance.revenue', async () => {
    const { service, createdFor } = build({ elements: [element('el1', 4000)], versionRecords: null });
    await service.generate('ev', 't1');
    expect(createdFor('el1')).toBe(4);
  });

  it('valeurs invalides ignorées ; un corps sans valeur exploitable retombe sur la version', async () => {
    const { prisma, service, createdFor } = build({
      elements: [element('el1', 0)],
      versionRecords: [{ shopId: 'el1', totalRevenue: 2000 }],
    });
    await service.generate('ev', 't1', undefined, {
      el1: -500,
      el2: 'abc',
      el3: Infinity,
      el4: null,
      el5: true,
    } as any);
    expect(prisma.eventPredictVersion.findFirst).toHaveBeenCalled();
    expect(createdFor('el1')).toBe(2);
  });

  it('corps partiel : PDV absent du corps ou à valeur invalide retombe sur ElementPerformance, clé hors config jamais lue', async () => {
    const { prisma, service, createdFor } = build({
      elements: [element('el1', 0), element('el2', 2000)],
      versionRecords: [{ shopId: 'el2', totalRevenue: 9000 }],
    });
    await service.generate('ev', 't1', undefined, { el1: '3000', el2: -1, horsConfig: 50000 } as any);
    expect(prisma.eventPredictVersion.findFirst).not.toHaveBeenCalled();
    expect(createdFor('el1')).toBe(3);
    expect(createdFor('el2')).toBe(2);
    expect(createdFor('horsConfig')).toBe(0);
    expect(prisma.elementPerformance.upsert).toHaveBeenCalledTimes(2);
  });

  it('aucun CA prédit sur aucun PDV : avertissement AUCUNE_LIGNE_GENEREE', async () => {
    const { service } = build({ elements: [element('el1', 0), element('el2', null)], versionRecords: null });
    const out: any = await service.generate('ev', 't1');
    const codes = out.warnings.map((w: any) => w.code);
    expect(codes).toContain('AUCUNE_LIGNE_GENEREE');
    expect(codes).not.toContain('CA_SOUS_OBJECTIF_TPE');
  });

  it("du CA mais tous les PDV sous l'objectif TPE : avertissement CA_SOUS_OBJECTIF_TPE avec le CA max", async () => {
    const { service } = build({ elements: [element('el1', 0), element('el2', 0)], versionRecords: null });
    const out: any = await service.generate('ev', 't1', undefined, { el1: 420, el2: 999.6 });
    const w = out.warnings.find((x: any) => x.code === 'CA_SOUS_OBJECTIF_TPE');
    expect(w).toBeDefined();
    expect(w.message).toBe("Aucun PDV n'atteint l'objectif de 1 000 € par TPE (CA prédit max : 999,6 €).");
    expect(out.warnings.map((x: any) => x.code)).not.toContain('AUCUNE_LIGNE_GENEREE');
  });
});
