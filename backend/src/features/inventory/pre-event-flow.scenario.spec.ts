import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { InventoryService } from './inventory.service';
import { PreEventInventoryFlowService } from './pre-event-inventory-flow.service';
import { InventoryLiveInitCronService } from './inventory-live-init.cron';

/**
 * Scénario de bout en bout du flux Pre-event Inventory (fix/pre-event-flow-robust),
 * avec les VRAIS services (InventoryService, PreEventInventoryFlowService,
 * InventoryLiveInitCronService) sur un Prisma en mémoire et une Logistique
 * simulée (niveaux + ventes). Ce que la checklist manuelle vérifierait :
 *
 *  A. PDV 1 complet → une feuille, écarts réels, seules ses lignes poussées ;
 *     PDV 2 complet → toujours une feuille, lignes PDV 1 reprises (écarts intacts),
 *     seules les lignes PDV 2 poussées ; ré-édition d'un article → lui seul repoussé,
 *     une vente survenue entre-temps sur un autre article n'est pas effacée.
 *  B. Ouverture des portes par le cron à l'heure réelle (sessions.doorsOpening,
 *     fuseau du space) : fenêtre PIN clôturée, feuille 'doors-open', rien de
 *     repoussé ; pendant 30 min : article compté figé (403), article non compté
 *     compté → régénéré au tick suivant, seul lui poussé ; après 30 min : 403.
 *  C. Rattrapage tardif : fenêtre clôturée, marqueur 'late', aucun reset.
 *  D. Event sans heure d'ouverture : ignoré par le cron, aucun verrou, passage
 *     manuel possible.
 *  E. Save manuel : même feuille unique, besoin prédit du client, rien repoussé.
 */

// ── Prisma en mémoire ─────────────────────────────────────────────────────────

type Row = Record<string, any>;

function matches(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  for (const [k, cond] of Object.entries(where)) {
    if (k === 'uniq_kv_store' || k === 'uniq_inventory_count') {
      if (!matches(row, cond)) return false;
      continue;
    }
    const v = row[k];
    if (cond === null) {
      if (v != null) return false;
    } else if (cond instanceof Date) {
      if (!(v instanceof Date) || v.getTime() !== cond.getTime()) return false;
    } else if (typeof cond === 'object') {
      if ('in' in cond && !cond.in.includes(v)) return false;
      if ('not' in cond) {
        if (cond.not === null ? v == null : v === cond.not) return false;
      }
      if ('lte' in cond && !(v <= cond.lte)) return false;
      if ('gte' in cond && !(v >= cond.gte)) return false;
    } else if (v !== cond) return false;
  }
  return true;
}

function sortBy(rows: Row[], orderBy: Row | undefined): Row[] {
  if (!orderBy) return rows;
  const [[field, dir]] = Object.entries(orderBy);
  return [...rows].sort((a, b) => {
    const x = a[field] instanceof Date ? a[field].getTime() : a[field];
    const y = b[field] instanceof Date ? b[field].getTime() : b[field];
    return (x < y ? -1 : x > y ? 1 : 0) * (dir === 'desc' ? -1 : 1);
  });
}

class Table {
  rows: Row[] = [];
  private seq = 0;
  constructor(
    private readonly name: string,
    private readonly db: FakePrisma,
  ) {}

  private withRelations(row: Row, include?: Row, select?: Row) {
    const out = { ...row };
    if (this.name === 'event' && (select?.space || include?.space)) {
      out.space = this.db.spaceRow;
    }
    return out;
  }
  findMany = async ({ where, orderBy, include, select }: Row = {}) =>
    sortBy(
      this.rows.filter((r) => matches(r, where)),
      orderBy,
    ).map((r) => this.withRelations(r, include, select));
  findFirst = async (args: Row = {}) => (await this.findMany(args))[0] ?? null;
  findUnique = async (args: Row = {}) => this.findFirst(args);
  create = async ({ data }: Row) => {
    if (
      this.name === 'kvStore' &&
      this.rows.some((r) => r.tenantId === data.tenantId && r.key === data.key)
    ) {
      throw Object.assign(new Error('Unique constraint'), { code: 'P2002' });
    }
    const now = new Date();
    const row = { id: `${this.name}-${++this.seq}`, createdAt: now, updatedAt: now, ...data };
    this.rows.push(row);
    return row;
  };
  update = async ({ where, data }: Row) => {
    const row = this.rows.find((r) => matches(r, where));
    if (!row) throw new Error(`${this.name}.update: not found`);
    Object.assign(row, data, { updatedAt: new Date() });
    return row;
  };
  updateMany = async ({ where, data }: Row) => {
    const hit = this.rows.filter((r) => matches(r, where));
    for (const r of hit) Object.assign(r, data);
    return { count: hit.length };
  };
  upsert = async ({ where, create, update }: Row) => {
    const row = this.rows.find((r) => matches(r, where));
    if (row) return this.update({ where, data: update });
    return this.create({ data: create });
  };
  delete = async ({ where }: Row) => {
    const idx = this.rows.findIndex((r) => matches(r, where));
    if (idx < 0) throw new Error(`${this.name}.delete: not found`);
    return this.rows.splice(idx, 1)[0];
  };
  deleteMany = async ({ where }: Row) => {
    const before = this.rows.length;
    this.rows = this.rows.filter((r) => !matches(r, where));
    return { count: before - this.rows.length };
  };
}

class FakePrisma {
  spaceRow = { id: 's1', tenantId: 't1', timezone: 'Europe/Paris' };
  space = new Table('space', this);
  event = new Table('event', this);
  inventoryCount = new Table('inventoryCount', this);
  inventorySnapshot = new Table('inventorySnapshot', this);
  stockReconciliation = new Table('stockReconciliation', this);
  kvStore = new Table('kvStore', this);
  inventoryWindow = new Table('inventoryWindow', this);
  spaceElement = new Table('spaceElement', this);
  menuItem = new Table('menuItem', this);
  marketPrice = new Table('marketPrice', this);
  menuComponent = new Table('menuComponent', this);
  ingredient = new Table('ingredient', this);
  packaging = new Table('packaging', this);

  /** markLogisticPushed : UPDATE ... SET "logisticPushedAt" = NOW() WHERE id IN (...) */
  $executeRaw = async (_strings: TemplateStringsArray, joined: Prisma.Sql) => {
    const ids: string[] = (joined as any).values;
    const now = new Date();
    for (const r of this.inventoryCount.rows) if (ids.includes(r.id)) r.logisticPushedAt = now;
    return ids.length;
  };
}

// ── Logistique simulée ────────────────────────────────────────────────────────

/** Niveaux en vrac (unitsPerPack inconnu côté registre), ventes décrémentées directement. */
class FakeLogistics {
  levels = new Map<string, { packed: number; loose: number }>();
  resets: Array<{ lines: any[]; meta: any; actor: string; at: Date }> = [];

  setLevel(elementId: string, itemKey: string, loose: number) {
    this.levels.set(`${elementId}::${itemKey}`, { packed: 0, loose });
  }
  sell(elementId: string, itemKey: string, units: number) {
    const l = this.levels.get(`${elementId}::${itemKey}`)!;
    l.loose -= units;
  }
  looseOf(elementId: string, itemKey: string) {
    return this.levels.get(`${elementId}::${itemKey}`)?.loose ?? null;
  }
  async getExpectedStockIndex() {
    const index = new Map<string, any>();
    for (const [k, l] of this.levels) {
      const [elementId, itemKey] = k.split('::');
      index.set(k, { elementId, itemKey, packed: l.packed, loose: l.loose, unitsPerPack: null });
    }
    return { index, asOf: new Date(), anchorAt: null };
  }
  async reset(_spaceId: string, dto: any, _tenantId: string, actor: string, meta: any) {
    this.resets.push({ lines: dto.lines, meta, actor, at: new Date() });
    for (const l of dto.lines) {
      this.levels.set(`${l.elementId}::${l.itemKey}`, {
        packed: l.countedPacked,
        loose: l.countedLoose,
      });
    }
    return { id: `reset-${this.resets.length}` };
  }
}

// ── Scénario ──────────────────────────────────────────────────────────────────

const T = (iso: string) => new Date(iso);
const at = (iso: string) => jest.setSystemTime(T(iso));

describe('Flux Pre-event Inventory, scénario de bout en bout', () => {
  let prisma: FakePrisma;
  let logistics: FakeLogistics;
  let inventory: InventoryService;
  let flow: PreEventInventoryFlowService;
  let cron: InventoryLiveInitCronService;

  const TENANT = 't1';
  const SPACE = 's1';
  const EVENT_A = 'evA';
  const ITEM = { cookie: 'mi-cookie', beer: 'mi-beer', water: 'mi-water' };
  const NAME = { cookie: 'Cookie', beer: 'Bière', water: 'Eau' };

  const count = (shopId: string, itemId: string, loose: number, isCounted = true) =>
    flow.saveCount(
      {
        spaceId: SPACE,
        eventId: EVENT_A,
        shopId,
        itemId,
        packedUnits: 0,
        looseUnits: loose,
        isCounted,
        phase: 'pre-event',
      } as any,
      TENANT,
      'staff-1',
    );

  const sheets = () => prisma.stockReconciliation.rows.filter((r) => r.kind === 'pre-event');
  const line = (sheet: Row, shopId: string, itemId: string) =>
    (sheet.lines as any[]).find((l) => l.elementId === shopId && l.itemKey === itemId);
  const lastReset = () => logistics.resets[logistics.resets.length - 1];
  const resetKeys = (r: { lines: any[] }) =>
    r.lines.map((l) => `${l.elementId}::${l.itemRefId}`).sort();
  const pushedAt = (shopId: string, itemId: string) =>
    prisma.inventoryCount.rows.find((r) => r.shopId === shopId && r.itemId === itemId)
      ?.logisticPushedAt ?? null;

  beforeAll(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
  });
  afterAll(() => jest.useRealTimers());

  beforeEach(() => {
    prisma = new FakePrisma();
    logistics = new FakeLogistics();
    inventory = new InventoryService(prisma as any, logistics as any);
    flow = new PreEventInventoryFlowService(prisma as any, inventory);
    cron = new InventoryLiveInitCronService(prisma as any, flow);
    delete process.env.INVENTORY_LIVE_INIT_CRON_ENABLED;
    cron.onModuleInit();

    prisma.space.rows.push(prisma.spaceRow);
    // Match du 19/09/2026, portes à 19:00 Paris (heure d'été) = 17:00Z.
    prisma.event.rows.push({
      id: EVENT_A,
      tenantId: TENANT,
      spaceId: SPACE,
      name: 'Match A',
      eventDate: T('2026-09-19T00:00:00.000Z'),
      eventStartDate: T('2026-09-19T00:00:00.000Z'),
      eventEndDate: T('2026-09-19T00:00:00.000Z'),
      eventEndTime: '23:00',
      sessions: JSON.stringify([{ doorsOpening: '19:00', showTime: '21:00' }]),
    });
    prisma.spaceElement.rows.push(
      { id: 'pdv1', name: 'Buvette Nord' },
      { id: 'pdv2', name: 'Buvette Sud' },
    );
    for (const k of Object.keys(ITEM) as Array<keyof typeof ITEM>) {
      prisma.menuItem.rows.push({
        id: ITEM[k],
        tenantId: TENANT,
        name: NAME[k],
        inventoryNumberOfUnits: 1,
      });
    }
    prisma.inventoryWindow.rows.push({
      id: 'win-1',
      tenantId: TENANT,
      spaceId: SPACE,
      eventId: EVENT_A,
      phase: 'pre-event',
      status: 'open',
      pinLookupHash: 'hash',
      pinCiphertext: 'cipher',
    });
    logistics.setLevel('pdv1', NAME.cookie, 10);
    logistics.setLevel('pdv1', NAME.beer, 20);
    logistics.setLevel('pdv2', NAME.cookie, 8);
    logistics.setLevel('pdv2', NAME.beer, 15);
    logistics.setLevel('pdv2', NAME.water, 30);
  });

  it('A + B + C : PDV complets, vente, ouverture des portes, fenêtre de 30 min, verrou, rattrapage tardif', async () => {
    // ── A1. PDV 1 complet (15:00Z, portes dans 2 h) ─────────────────────────
    at('2026-09-19T15:00:00.000Z');
    await count('pdv1', ITEM.cookie, 7);
    await count('pdv1', ITEM.beer, 20);
    let res = await flow.regenerate(SPACE, EVENT_A, TENANT, 'staff-1', 'pdv-complete', {
      elementId: 'pdv1',
    });
    expect(res.ok).toBe(true);

    expect(sheets()).toHaveLength(1);
    let sheet = sheets()[0];
    expect(sheet.meta.trigger).toBe('pdv-complete');
    expect(line(sheet, 'pdv1', ITEM.cookie)).toMatchObject({
      countedSource: 'count',
      expectedLoose: 10,
      countedLoose: 7,
      deltaLoose: -3,
    });
    expect(line(sheet, 'pdv1', ITEM.beer)).toMatchObject({ countedSource: 'count', deltaLoose: 0 });
    expect(line(sheet, 'pdv2', ITEM.cookie)).toMatchObject({
      countedSource: 'logistic',
      countedLoose: 8,
      deltaLoose: 0,
    });
    // Logistic : un seul reset, uniquement les lignes du PDV 1.
    expect(logistics.resets).toHaveLength(1);
    expect(resetKeys(lastReset())).toEqual([`pdv1::${ITEM.beer}`, `pdv1::${ITEM.cookie}`]);
    expect(lastReset().meta).toMatchObject({ source: 'inventory-count', phase: 'pre-event' });
    expect(logistics.looseOf('pdv1', NAME.cookie)).toBe(7);
    expect(logistics.looseOf('pdv2', NAME.cookie)).toBe(8);
    expect(pushedAt('pdv1', ITEM.cookie)).toBeInstanceOf(Date);
    expect(sheet.meta.logisticPush).toEqual({ ok: true, reason: null, lineCount: 2 });
    // Snapshot pre-event posé (cycle pre↔post, BUG-237).
    expect(prisma.inventorySnapshot.rows.filter((s) => s.kind === 'pre-event')).toHaveLength(1);

    // ── A2. PDV 2 complet (15:10Z) ──────────────────────────────────────────
    at('2026-09-19T15:10:00.000Z');
    await count('pdv2', ITEM.cookie, 5);
    await count('pdv2', ITEM.beer, 15);
    await count('pdv2', ITEM.water, 30);
    res = await flow.regenerate(SPACE, EVENT_A, TENANT, 'staff-1', 'pdv-complete', {
      elementId: 'pdv2',
    });
    expect(res.ok).toBe(true);

    expect(sheets()).toHaveLength(1); // l'ancienne feuille est remplacée
    sheet = sheets()[0];
    expect(sheet.meta.regeneratedFrom).toBeTruthy();
    // Lignes PDV 1 REPRISES : l'écart d'origine n'est pas retombé à 0 alors que
    // Logistic contient déjà le comptage (attendu = 7 désormais).
    expect(line(sheet, 'pdv1', ITEM.cookie)).toMatchObject({
      expectedLoose: 10,
      countedLoose: 7,
      deltaLoose: -3,
    });
    expect(sheet.meta.carriedLines).toBe(2);
    expect(line(sheet, 'pdv2', ITEM.cookie)).toMatchObject({
      countedSource: 'count',
      expectedLoose: 8,
      countedLoose: 5,
      deltaLoose: -3,
    });
    // Logistic : second reset avec uniquement PDV 2, aucune ligne PDV 1 (delta 0) réémise.
    expect(logistics.resets).toHaveLength(2);
    expect(resetKeys(lastReset())).toEqual([
      `pdv2::${ITEM.beer}`,
      `pdv2::${ITEM.cookie}`,
      `pdv2::${ITEM.water}`,
    ]);

    // ── A3. Vente sur PDV 1, ré-édition d'un seul article (15:20Z) ──────────
    logistics.sell('pdv1', NAME.cookie, 2); // 7 → 5, vendus avant match (hospitalité)
    at('2026-09-19T15:20:00.000Z');
    await count('pdv1', ITEM.beer, 18); // avant les portes : un article compté reste modifiable
    res = await flow.regenerate(SPACE, EVENT_A, TENANT, 'staff-1', 'pdv-complete', {
      elementId: 'pdv1',
    });
    expect(res.ok).toBe(true);
    sheet = sheets()[0];
    // Seule la bière repart ; le cookie garde sa ligne d'origine ET son niveau vendu.
    expect(logistics.resets).toHaveLength(3);
    expect(resetKeys(lastReset())).toEqual([`pdv1::${ITEM.beer}`]);
    expect(logistics.looseOf('pdv1', NAME.cookie)).toBe(5);
    expect(logistics.looseOf('pdv1', NAME.beer)).toBe(18);
    expect(line(sheet, 'pdv1', ITEM.cookie)).toMatchObject({ expectedLoose: 10, deltaLoose: -3 });
    expect(line(sheet, 'pdv1', ITEM.beer)).toMatchObject({
      expectedLoose: 20,
      countedLoose: 18,
      deltaLoose: -2,
    });
    expect(sheet.meta.carriedLines).toBe(4);

    // ── B1. Cron avant l'heure : rien (16:59Z) ──────────────────────────────
    at('2026-09-19T16:59:00.000Z');
    await cron.autoInitLiveStockForOpenEvents();
    expect(prisma.kvStore.rows.filter((r) => r.key.startsWith('live-pre-event-init'))).toHaveLength(
      0,
    );
    expect(prisma.inventoryWindow.rows[0].status).toBe('open');

    // ── B2. Cron à l'ouverture des portes (17:00:30Z = 19:00:30 Paris) ──────
    at('2026-09-19T17:00:30.000Z');
    await cron.autoInitLiveStockForOpenEvents();
    const marker = prisma.kvStore.rows.find(
      (r) => r.key === `live-pre-event-init:${SPACE}:${EVENT_A}`,
    );
    expect(marker).toBeTruthy();
    expect(marker!.value.result).toMatchObject({ ok: true });
    expect(prisma.inventoryWindow.rows[0]).toMatchObject({
      status: 'closed',
      closedBy: 'system-doors-open',
      pinLookupHash: null,
      pinCiphertext: null,
    });
    sheet = sheets()[0];
    expect(sheets()).toHaveLength(1);
    expect(sheet.meta.trigger).toBe('doors-open');
    // Rien de nouveau depuis A3 : aucun reset, les niveaux (ventes comprises) sont intacts.
    expect(logistics.resets).toHaveLength(3);
    expect(sheet.meta.logisticPush).toMatchObject({ ok: false, reason: 'nothing-new' });
    expect(logistics.looseOf('pdv1', NAME.cookie)).toBe(5);
    // Idempotent : second tick sans effet.
    await cron.autoInitLiveStockForOpenEvents();
    expect(sheets()).toHaveLength(1);
    expect(sheet.id).toBe(sheets()[0].id);

    // État exposé au front.
    const state = await flow.getWindowState(SPACE, EVENT_A, TENANT);
    expect(state).toMatchObject({ phase: 'editing', doorsOpenDone: true });
    expect(state.doorsOpenAt).toEqual(T('2026-09-19T17:00:00.000Z'));
    expect(state.editDeadline).toEqual(T('2026-09-19T17:30:00.000Z'));

    // ── B3. Pendant les 30 min (17:05Z) ────────────────────────────────────
    at('2026-09-19T17:05:00.000Z');
    // Article déjà compté : figé (y compris un "reset" en non compté).
    await expect(count('pdv1', ITEM.cookie, 9)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(count('pdv1', ITEM.cookie, 7, false)).rejects.toBeInstanceOf(ForbiddenException);
    // Article jamais compté (eau du PDV 1) : modifiable → marqueur dirty.
    logistics.setLevel('pdv1', NAME.water, 12);
    await count('pdv1', ITEM.water, 11);
    expect(
      prisma.kvStore.rows.some((r) => r.key === `pre-event-reco-dirty:${SPACE}:${EVENT_A}`),
    ).toBe(true);
    logistics.sell('pdv1', NAME.cookie, 1); // 5 → 4, début de match

    at('2026-09-19T17:06:00.000Z');
    await cron.autoInitLiveStockForOpenEvents();
    expect(prisma.kvStore.rows.some((r) => r.key.startsWith('pre-event-reco-dirty'))).toBe(false);
    sheet = sheets()[0];
    expect(sheets()).toHaveLength(1);
    expect(sheet.meta.trigger).toBe('post-doors-open-edit');
    expect(line(sheet, 'pdv1', ITEM.water)).toMatchObject({
      countedSource: 'count',
      expectedLoose: 12,
      countedLoose: 11,
      deltaLoose: -1,
    });
    expect(line(sheet, 'pdv1', ITEM.cookie)).toMatchObject({ deltaLoose: -3 }); // toujours l'écart d'origine
    expect(logistics.resets).toHaveLength(4);
    expect(resetKeys(lastReset())).toEqual([`pdv1::${ITEM.water}`]);
    expect(logistics.looseOf('pdv1', NAME.cookie)).toBe(4); // la vente du début de match n'est pas effacée

    // ── B4. Après 30 min (17:31Z) : verrou complet, cron silencieux ────────
    at('2026-09-19T17:31:00.000Z');
    await expect(count('pdv2', ITEM.water, 1, false)).rejects.toThrow(/verrouillé/);
    const before = {
      sheets: sheets().length,
      resets: logistics.resets.length,
      sheetId: sheets()[0].id,
    };
    await cron.autoInitLiveStockForOpenEvents();
    expect(sheets()[0].id).toBe(before.sheetId);
    expect(logistics.resets).toHaveLength(before.resets);
    expect((await flow.getWindowState(SPACE, EVENT_A, TENANT)).phase).toBe('locked');

    // ── C. Rattrapage tardif (cron arrêté, relancé à 19:00Z = 2 h après les portes)
    prisma.kvStore.rows = prisma.kvStore.rows.filter(
      (r) => !r.key.startsWith('live-pre-event-init'),
    );
    prisma.inventoryWindow.rows[0].status = 'open';
    at('2026-09-19T19:00:00.000Z');
    await cron.autoInitLiveStockForOpenEvents();
    const late = prisma.kvStore.rows.find(
      (r) => r.key === `live-pre-event-init:${SPACE}:${EVENT_A}`,
    );
    expect(late!.value.result).toMatchObject({ ok: false, reason: 'late' });
    expect(prisma.inventoryWindow.rows[0].status).toBe('closed');
    expect(logistics.resets).toHaveLength(before.resets);
    expect(sheets()[0].id).toBe(before.sheetId);
  });

  it("D : event sans heure d'ouverture, ignoré par le cron, jamais verrouillé, passage manuel", async () => {
    prisma.event.rows[0].sessions = null;
    prisma.event.rows[0].eventEndTime = null;

    // Le jour du match à 02:30 Paris (00:30Z) : l'ancien proxy aurait verrouillé ici.
    at('2026-09-19T00:30:00.000Z');
    await count('pdv1', ITEM.cookie, 7);
    await cron.autoInitLiveStockForOpenEvents();
    expect(prisma.kvStore.rows).toHaveLength(0);
    expect(prisma.inventoryWindow.rows[0].status).toBe('open');
    expect((await flow.getWindowState(SPACE, EVENT_A, TENANT)).phase).toBe('no-doors-open');

    // 22:00 Paris le soir du match : toujours modifiable, même un article déjà compté.
    at('2026-09-19T20:00:00.000Z');
    await count('pdv1', ITEM.cookie, 6);
    await cron.autoInitLiveStockForOpenEvents();
    expect(prisma.kvStore.rows).toHaveLength(0);

    // Passage manuel (bouton « Ouverture des portes »).
    const event = await flow.findEvent(SPACE, EVENT_A, TENANT);
    const res = await flow.runDoorsOpen(event!, 'user:staff-1');
    expect(res.ok).toBe(true);
    expect(prisma.inventoryWindow.rows[0]).toMatchObject({
      status: 'closed',
      closedBy: 'user:staff-1',
    });
    expect(sheets()).toHaveLength(1);
    expect(sheets()[0].meta.trigger).toBe('doors-open');
    expect(logistics.resets).toHaveLength(1);
    expect(logistics.looseOf('pdv1', NAME.cookie)).toBe(6);
    expect(await flow.getWindowState(SPACE, EVENT_A, TENANT)).toMatchObject({
      phase: 'no-doors-open',
      doorsOpenDone: true,
    });
    // Second appel : already-initialized, rien ne bouge.
    expect(await flow.runDoorsOpen(event!, 'user:staff-1')).toEqual({
      ok: false,
      reason: 'already-initialized',
    });
    expect(sheets()).toHaveLength(1);
  });

  it('E : Save manuel sur la même feuille unique, besoin prédit du client, rien repoussé si rien ne change', async () => {
    at('2026-09-19T15:00:00.000Z');
    await count('pdv1', ITEM.cookie, 7);
    await flow.regenerate(SPACE, EVENT_A, TENANT, 'staff-1', 'pdv-complete', { elementId: 'pdv1' });
    expect(logistics.resets).toHaveLength(1);

    const res = await flow.regenerate(
      SPACE,
      EVENT_A,
      TENANT,
      'staff-1',
      'manual',
      {},
      {
        predictedUnits: { pdv1: { [ITEM.cookie]: 12 } },
      },
    );
    expect(res.ok).toBe(true);
    expect(res.document).toBeTruthy();
    expect(sheets()).toHaveLength(1);
    const sheet = sheets()[0];
    expect(sheet.meta.trigger).toBe('manual');
    expect(sheet.meta.predictedSource).toBe('event-predict-default-version');
    // Ligne reprise (écart d'origine), besoin prédit rafraîchi (unités inconnues → deltaVsPredicted null).
    expect(line(sheet, 'pdv1', ITEM.cookie)).toMatchObject({ deltaLoose: -3, predictedUnits: 12 });
    expect(logistics.resets).toHaveLength(1);
    expect(sheet.meta.logisticPush).toMatchObject({ ok: false, reason: 'nothing-new' });

    // La feuille suivante (sans prédit client) reporte le prédit archivé.
    await count('pdv1', ITEM.beer, 19);
    await flow.regenerate(SPACE, EVENT_A, TENANT, 'staff-1', 'pdv-complete', { elementId: 'pdv1' });
    expect(line(sheets()[0], 'pdv1', ITEM.cookie)).toMatchObject({ predictedUnits: 12 });
    expect(logistics.resets).toHaveLength(2);
    expect(resetKeys(lastReset())).toEqual([`pdv1::${ITEM.beer}`]);
  });

  it('bouton « Update Logistic » : incrémental aussi, message explicite quand rien ne change', async () => {
    at('2026-09-19T15:00:00.000Z');
    await count('pdv1', ITEM.cookie, 7);
    const first = await inventory.pushCurrentCountToLogistic(
      SPACE,
      EVENT_A,
      TENANT,
      'pre-event',
      'staff-1',
    );
    expect(first).toMatchObject({ ok: true, lineCount: 1 });
    await expect(
      inventory.pushCurrentCountToLogistic(SPACE, EVENT_A, TENANT, 'pre-event', 'staff-1'),
    ).rejects.toThrow(/déjà à jour/);
    at('2026-09-19T15:01:00.000Z');
    await count('pdv1', ITEM.cookie, 8);
    const third = await inventory.pushCurrentCountToLogistic(
      SPACE,
      EVENT_A,
      TENANT,
      'pre-event',
      'staff-1',
    );
    expect(third).toMatchObject({ ok: true, lineCount: 1 });
    expect(logistics.looseOf('pdv1', NAME.cookie)).toBe(8);
  });
});
