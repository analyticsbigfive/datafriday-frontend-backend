import { Prisma } from '@prisma/client';

/**
 * Lecteurs BRUTS de transactions (Analyse : paniers de repli, bandeau « non mappé »),
 * ADR_MULTI_SOURCE 4.5 : les ventes d'une source DÉCLARÉE de l'évènement (caisse Data Friday,
 * 2e Weezevent...) portent un autre SalesEvent que le lien historique ; les deux prédicats de
 * rattachement (tag de conteneur, intégration de l'évènement) les écarteraient. Chaque fenêtre
 * reçoit donc la liste générique `extraSalesEventIds` de ses SalesEvent de sources déclarées.
 *
 * Tout est conditionné par `enabled` (au moins une fenêtre du lot a une source déclarée) : sinon
 * les fragments sont VIDES et le SQL est identique, au caractère près, à celui d'avant.
 */
export interface ExtraSourceWindow {
  id: string;
  windowStart: Date;
  windowEnd: Date;
  tagId: string | null;
  eventIntegrationId: string | null;
  /** SalesEvent des sources déclarées non `auto` ; absent (jamais []) sans source déclarée. */
  extraSalesEventIds?: string[];
}

export const hasExtraSources = (windows: ReadonlyArray<ExtraSourceWindow>): boolean =>
  windows.some((w) => !!w.extraSalesEventIds?.length);

/** Colonnes de la CTE `ev(...)` des lecteurs bruts. */
export function rawEvColumns(enabled: boolean): Prisma.Sql {
  return Prisma.raw(`"eventId", "windowStart", "windowEnd", "tagId", "eventIntegrationId"${enabled ? ', "extraSalesEventIds"' : ''}`);
}

/** Lignes VALUES de la CTE `ev`, avec la liste des SalesEvent de sources déclarées si `enabled`. */
export function rawEvValues(windows: ReadonlyArray<ExtraSourceWindow>, enabled: boolean): Prisma.Sql {
  return Prisma.join(
    windows.map((w) =>
      enabled
        ? Prisma.sql`(${w.id}::text, ${w.windowStart}::timestamp, ${w.windowEnd}::timestamp, ${w.tagId}::text, ${w.eventIntegrationId}::text, ${w.extraSalesEventIds ?? []}::text[])`
        : Prisma.sql`(${w.id}::text, ${w.windowStart}::timestamp, ${w.windowEnd}::timestamp, ${w.tagId}::text, ${w.eventIntegrationId}::text)`,
    ),
    ', ',
  );
}

/** `OR` d'un prédicat de rattachement : la transaction d'une source déclarée passe toujours. */
export function orDeclaredSource(enabled: boolean): Prisma.Sql {
  return enabled ? Prisma.raw(' OR t."eventId" = ANY(ev."extraSalesEventIds")') : Prisma.raw('');
}
