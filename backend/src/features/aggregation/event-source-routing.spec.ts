import { protectedAggregateWhere } from './protected-aggregate-where';
import { routeJobSource, sourceDeleteWhere, windowOfDeclaredSource } from './event-source-routing';
import { DeclaredSalesSource } from '../event-sales-sources/event-sales-source.types';
import { EventWindow } from './event-aggregation.queries';

const range = { start: new Date('2026-09-11T22:00:00Z'), end: new Date('2026-09-12T21:50:00Z') };
const exact: EventWindow = { mode: 'exact', salesEventId: 'se-1' };
const integrationRange: EventWindow = { mode: 'integration-range', integrationId: 'int-W', ...range };
const dateRange: EventWindow = { mode: 'range', ...range };
const pos: DeclaredSalesSource = { eventId: 'e', integrationId: 'int-POS', salesEventId: 'se-pos', windowMode: 'sales-event-range', origin: 'pos' };

const route = (over: Partial<Parameters<typeof routeJobSource>[0]>) =>
  routeJobSource({ jobIntegrationId: undefined, declared: [], spaceIntegrationIds: ['int-W', 'int-POS'], derivedWindow: integrationRange, dateRange: () => range, ...over });

describe('protectedAggregateWhere (règle unique de suppression)', () => {
  it('sans autre source, rend le même objet : aucun changement pour les espaces existants', () => {
    const where = { tenantId: 't', spaceId: 's' };
    expect(protectedAggregateWhere(where, [])).toBe(where);
  });

  it('épargne les autres sources mais pas les lignes integrationId NULL, sans écraser un OR existant', () => {
    const where = { tenantId: 't', OR: [{ weezeventEventId: null }] };
    const out: any = protectedAggregateWhere(where, ['int-POS']);
    expect(out.OR).toEqual([{ weezeventEventId: null }]);
    expect(out.AND).toEqual([{ OR: [{ integrationId: null }, { integrationId: { notIn: ['int-POS'] } }] }]);
  });
});

describe('routeJobSource', () => {
  it('sans source déclarée : source dérivée, comportement historique (clause du job, repli complet)', () => {
    const d: any = route({ jobIntegrationId: 'int-W', derivedWindow: exact });
    expect(d.status).toBe('run');
    expect(d.plan).toMatchObject({ kind: 'derived', window: exact, clauseIntegrationId: 'int-W', fallbackIntegrationIds: ['int-W', 'int-POS'], otherSourceIntegrationIds: [], watermarkIntegrationId: null });
  });

  it('job de l\'intégration d\'une source déclarée : exécute cette source seule, fenêtre sales-event-range', () => {
    const d: any = route({ jobIntegrationId: 'int-POS', declared: [pos] });
    expect(d.plan.kind).toBe('explicit');
    expect(d.plan.window).toEqual({ mode: 'container-range', salesEventId: 'se-pos', ...range });
    expect(d.plan.clauseIntegrationId).toBe('int-POS');
    expect(d.plan.watermarkIntegrationId).toBe('int-POS');
  });

  it('job historique d\'un évènement mixte : dérivé + protection des intégrations déclarées', () => {
    const d: any = route({ jobIntegrationId: 'int-W', declared: [pos] });
    expect(d.plan).toMatchObject({ kind: 'derived', otherSourceIntegrationIds: ['int-POS'], clauseIntegrationId: 'int-W' });
  });

  it('repli ANY(...) du job sans intégration : sans les intégrations des sources déclarées', () => {
    const d: any = route({ declared: [pos], derivedWindow: dateRange });
    expect(d.plan.fallbackIntegrationIds).toEqual(['int-W']);
  });

  it('range sans source historique restante : no-source', () => {
    expect(route({ declared: [pos], derivedWindow: dateRange, spaceIntegrationIds: ['int-POS'] }).status).toBe('no-source');
  });

  it('SalesEvent ou intégration de la dérivation déjà déclarés : no-source (pas de double job)', () => {
    expect(route({ declared: [pos], derivedWindow: { mode: 'exact', salesEventId: 'se-pos' } }).status).toBe('no-source');
    expect(route({ declared: [{ ...pos, integrationId: 'int-W' }], derivedWindow: integrationRange }).status).toBe('no-source');
  });

  it('source déclarée inexploitable (mode inconnu) : no-source plutôt qu\'un SQL faux', () => {
    expect(route({ jobIntegrationId: 'int-POS', declared: [{ ...pos, windowMode: 'inconnu' }] }).status).toBe('no-source');
  });
});

describe('windowOfDeclaredSource', () => {
  it('traduit chaque windowMode vers une des 4 formes existantes de EventWindow', () => {
    expect(windowOfDeclaredSource({ ...pos, windowMode: 'sales-event' }, range)).toEqual({ mode: 'exact', salesEventId: 'se-pos' });
    expect(windowOfDeclaredSource({ ...pos, windowMode: 'integration-range' }, range)).toEqual({ mode: 'integration-range', integrationId: 'int-POS', ...range });
    expect(windowOfDeclaredSource({ ...pos, windowMode: 'date-range' }, range)).toEqual({ mode: 'range', ...range });
    expect(windowOfDeclaredSource({ ...pos, windowMode: 'sales-event-range', salesEventId: null }, range)).toBeNull();
  });
});

describe('sourceDeleteWhere', () => {
  const base = { tenantId: 't', spaceId: 's', weezeventEventId: 'e' };
  it('historique en integration-range, sans source déclarée : non scopé (BUG-376-02 conservé)', () => {
    const d: any = route({ jobIntegrationId: 'int-W' });
    expect(sourceDeleteWhere(d.plan, base, 'int-W')).toEqual(base);
  });
  it('historique hors integration-range avec intégration de job : scopé par le job', () => {
    const d: any = route({ jobIntegrationId: 'int-W', derivedWindow: exact });
    expect(sourceDeleteWhere(d.plan, base, 'int-W')).toEqual({ ...base, integrationId: 'int-W' });
  });
});
