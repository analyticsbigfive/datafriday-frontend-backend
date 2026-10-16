import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { DeclaredSalesSource, SALES_SOURCE_ORIGINS, SALES_SOURCE_WINDOW_MODES } from './event-sales-source.types';

/**
 * Liste des sources de ventes d'un évènement. Module feuille : Prisma seul, aucune dépendance
 * vers l'agrégation, le Live ou le POS (pas de cycle possible).
 *
 * Les sources historiques (Event.weezeventEventId / Event.integrationId) ne sont PAS stockées
 * ici : elles restent dérivées par l'agrégation (ADR 4.1). Ne sont lues que les lignes actives.
 */
@Injectable()
export class EventSalesSourceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Déclare (ou met à jour) la source POS d'un évènement. Idempotent : unicité
   * (eventId, integrationId), donc un second appel ne crée rien. Réactive une source retirée.
   * `windowMode` reste `sales-event-range` : les ventes POS portent le SalesEvent POS de
   * l'évènement et sont bornées par la fenêtre de l'évènement (Q-A : ventes d'avant le match hors CA).
   */
  async ensurePosSource(tenantId: string, eventId: string, integrationId: string, salesEventId: string): Promise<void> {
    await this.prisma.eventSalesSource.upsert({
      where: { eventId_integrationId: { eventId, integrationId } },
      create: {
        tenantId,
        eventId,
        integrationId,
        salesEventId,
        windowMode: SALES_SOURCE_WINDOW_MODES.SALES_EVENT_RANGE,
        origin: SALES_SOURCE_ORIGINS.POS,
        active: true,
      },
      update: { salesEventId, active: true },
    });
  }

  /** Sources actives déclarées pour des évènements, groupées par évènement. */
  async listActiveByEvent(tenantId: string, eventIds: ReadonlyArray<string>): Promise<Map<string, DeclaredSalesSource[]>> {
    const byEvent = new Map<string, DeclaredSalesSource[]>();
    if (!eventIds.length) return byEvent;
    const rows = await this.prisma.eventSalesSource.findMany({
      where: { tenantId, eventId: { in: [...eventIds] }, active: true },
      select: { eventId: true, integrationId: true, salesEventId: true, windowMode: true, origin: true },
      orderBy: { createdAt: 'asc' },
    });
    for (const row of rows) {
      const list = byEvent.get(row.eventId) ?? [];
      list.push(row);
      byEvent.set(row.eventId, list);
    }
    return byEvent;
  }

  /**
   * Sources actives d'évènements, sans filtre tenant : lecture transverse du worker Live (les
   * évènements en direct de tous les tenants). Les identifiants d'évènement sont des uuid uniques.
   */
  async listActiveForEvents(eventIds: ReadonlyArray<string>): Promise<Map<string, DeclaredSalesSource[]>> {
    const byEvent = new Map<string, DeclaredSalesSource[]>();
    if (!eventIds.length) return byEvent;
    const rows = await this.prisma.eventSalesSource.findMany({
      where: { eventId: { in: [...eventIds] }, active: true },
      select: { eventId: true, integrationId: true, salesEventId: true, windowMode: true, origin: true },
      orderBy: { createdAt: 'asc' },
    });
    for (const row of rows) byEvent.set(row.eventId, [...(byEvent.get(row.eventId) ?? []), row]);
    return byEvent;
  }

  /** Sources actives d'un seul évènement. */
  async listActive(tenantId: string, eventId: string): Promise<DeclaredSalesSource[]> {
    return (await this.listActiveByEvent(tenantId, [eventId])).get(eventId) ?? [];
  }

  /**
   * Intégrations (parmi `integrationIds`) déclarées comme source non `auto` d'au moins un évènement.
   * Sert à ne pas présenter comme intégration à configurer (wizard Data Integration) une
   * intégration qui n'existe que comme source de ventes d'un évènement (ADR 7.1, point 3).
   */
  async listDeclaredIntegrationIds(tenantId: string, integrationIds: ReadonlyArray<string>): Promise<Set<string>> {
    if (!integrationIds.length) return new Set();
    const rows = await this.prisma.eventSalesSource.findMany({
      where: { tenantId, active: true, origin: { not: SALES_SOURCE_ORIGINS.AUTO }, integrationId: { in: [...integrationIds] } },
      select: { integrationId: true },
      distinct: ['integrationId'],
    });
    return new Set(rows.map((r) => r.integrationId));
  }

  /**
   * SalesEvent déclarés comme source non `auto` pour le tenant : exclus de l'auto-lien et du
   * calcul des conteneurs de saison (ADR 4.1), sans test sur le nom d'un logiciel.
   */
  async listDeclaredSalesEventIds(tenantId: string): Promise<Set<string>> {
    const rows = await this.prisma.eventSalesSource.findMany({
      where: { tenantId, active: true, salesEventId: { not: null }, origin: { not: SALES_SOURCE_ORIGINS.AUTO } },
      select: { salesEventId: true },
    });
    return new Set(rows.map((r) => r.salesEventId as string));
  }
}
