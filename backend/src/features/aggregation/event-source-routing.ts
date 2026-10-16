import { DeclaredSalesSource, SALES_SOURCE_WINDOW_MODES } from '../event-sales-sources/event-sales-source.types';
import { EventWindow } from './event-aggregation.queries';
import { protectedAggregateWhere } from './protected-aggregate-where';

/**
 * Source retenue pour UN job sur UN évènement (ADR_MULTI_SOURCE 4.2). Le moteur de calcul est
 * unique : seule la fenêtre et le périmètre d'intégration changent, jamais le nom d'un logiciel.
 */
export interface JobSourcePlan {
  /** `derived` = source historique (champs de l'évènement) ; `explicit` = ligne EventSalesSource. */
  kind: 'derived' | 'explicit';
  window: EventWindow;
  /** Intégration passée à `buildIntegrationClause` (celle du job, ou celle de la source explicite). */
  clauseIntegrationId: string | undefined;
  /** Repli `ANY(...)` : intégrations mappées à l'espace, SANS celles des sources déclarées. */
  fallbackIntegrationIds: string[];
  /** Intégrations des AUTRES sources déclarées de l'évènement : lignes à ne jamais supprimer. */
  otherSourceIntegrationIds: string[];
  /** Intégration qui suffixe watermark et clé de reconstruction (sources déclarées non `auto`). */
  watermarkIntegrationId: string | null;
}

export type JobSourceDecision =
  | { status: 'run'; plan: JobSourcePlan }
  | { status: 'no-source'; reason: string };

export interface RoutingInput {
  jobIntegrationId: string | undefined;
  declared: ReadonlyArray<DeclaredSalesSource>;
  spaceIntegrationIds: ReadonlyArray<string>;
  /** Fenêtre de la source historique dérivée (`resolveEventWindow`, code inchangé). */
  derivedWindow: EventWindow;
  /** Fenêtre de dates de l'évènement, pour les sources explicites (appelée seulement si nécessaire). */
  dateRange: () => { start: Date; end: Date };
}

/** Fenêtre d'une source explicite, depuis son `windowMode` ; null si la ligne est inexploitable. */
export function windowOfDeclaredSource(source: DeclaredSalesSource, range: { start: Date; end: Date }): EventWindow | null {
  const { start, end } = range;
  switch (source.windowMode) {
    case SALES_SOURCE_WINDOW_MODES.SALES_EVENT:
      return source.salesEventId ? { mode: 'exact', salesEventId: source.salesEventId } : null;
    case SALES_SOURCE_WINDOW_MODES.SALES_EVENT_RANGE:
      return source.salesEventId ? { mode: 'container-range', salesEventId: source.salesEventId, start, end } : null;
    case SALES_SOURCE_WINDOW_MODES.INTEGRATION_RANGE:
      return { mode: 'integration-range', integrationId: source.integrationId, start, end };
    case SALES_SOURCE_WINDOW_MODES.DATE_RANGE:
      return { mode: 'range', start, end };
    default:
      return null;
  }
}

/**
 * Routage d'un job (clé = `integrationId` du job) :
 *  - l'intégration du job est une source déclarée de l'évènement : on exécute CETTE source seule ;
 *  - sinon on exécute la source historique dérivée, exactement comme avant (BUG-370-02), avec en
 *    plus la protection des lignes des sources déclarées.
 * Sans source déclarée (tous les évènements existants), la décision reproduit le code historique.
 */
export function routeJobSource(input: RoutingInput): JobSourceDecision {
  const { jobIntegrationId, declared, spaceIntegrationIds, derivedWindow } = input;

  if (!declared.length) {
    return {
      status: 'run',
      plan: {
        kind: 'derived',
        window: derivedWindow,
        clauseIntegrationId: jobIntegrationId,
        fallbackIntegrationIds: [...spaceIntegrationIds],
        otherSourceIntegrationIds: [],
        watermarkIntegrationId: null,
      },
    };
  }

  const own = jobIntegrationId ? declared.find((s) => s.integrationId === jobIntegrationId) : undefined;
  if (own) {
    const window = windowOfDeclaredSource(own, input.dateRange());
    if (!window) return { status: 'no-source', reason: `source ${own.integrationId} inexploitable (windowMode ${own.windowMode})` };
    return {
      status: 'run',
      plan: {
        kind: 'explicit',
        window,
        clauseIntegrationId: own.integrationId,
        fallbackIntegrationIds: [],
        otherSourceIntegrationIds: declared.filter((s) => s.integrationId !== own.integrationId).map((s) => s.integrationId),
        watermarkIntegrationId: own.origin === 'auto' ? null : own.integrationId,
      },
    };
  }

  // Source historique dérivée d'un évènement qui a aussi des sources déclarées.
  const declaredIntegrationIds = declared.map((s) => s.integrationId);
  const declaredSalesEventIds = new Set(declared.map((s) => s.salesEventId).filter((id): id is string => !!id));
  const fallbackIntegrationIds = spaceIntegrationIds.filter((id) => !declaredIntegrationIds.includes(id));

  if ((derivedWindow.mode === 'exact' || derivedWindow.mode === 'container-range') && declaredSalesEventIds.has(derivedWindow.salesEventId)) {
    return { status: 'no-source', reason: 'le SalesEvent lié est déjà une source déclarée' };
  }
  if (derivedWindow.mode === 'integration-range' && declaredIntegrationIds.includes(derivedWindow.integrationId)) {
    return { status: 'no-source', reason: `l'intégration ${derivedWindow.integrationId} est déjà une source déclarée` };
  }
  if (derivedWindow.mode === 'range' && !jobIntegrationId && fallbackIntegrationIds.length === 0) {
    return { status: 'no-source', reason: 'évènement sans source historique, uniquement des sources déclarées' };
  }

  return {
    status: 'run',
    plan: {
      kind: 'derived',
      window: derivedWindow,
      clauseIntegrationId: jobIntegrationId,
      fallbackIntegrationIds,
      otherSourceIntegrationIds: declaredIntegrationIds,
      watermarkIntegrationId: null,
    },
  };
}

/**
 * `where` des suppressions d'un job (règle unique, ADR 4.3). Une source déclarée supprime
 * exactement ses lignes (`integrationId = S`). La source historique garde le comportement actuel
 * (scopé par l'intégration du job sauf en `integration-range`, BUG-376-02) et épargne en plus les
 * lignes des sources déclarées, seulement s'il y en a.
 */
export function sourceDeleteWhere<T extends object>(plan: JobSourcePlan, base: T, jobIntegrationId: string | undefined): T {
  let scoped: T = base;
  if (plan.kind === 'explicit') scoped = { ...base, integrationId: plan.clauseIntegrationId };
  else if (plan.window.mode !== 'integration-range' && jobIntegrationId) scoped = { ...base, integrationId: jobIntegrationId };
  return protectedAggregateWhere(scoped, plan.otherSourceIntegrationIds);
}
