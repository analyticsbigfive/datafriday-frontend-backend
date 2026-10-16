import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../core/database/prisma.service';
import { PosClosing, PosSalesPage, PosSalesQuery, PosTransactionMetadata } from '../pos.contracts';
import { paymentsOf, POS_SALE_SELECT, toSaleRow } from './pos-sale-mapper';
import { lineTotal, round2, tipTotalOf, vatOf } from './pos-sale-rules';

/** Périmètre d'une lecture de ventes : tenant + espace + évènement, PdV optionnel (le jeton invité le fixe toujours). */
export interface PosSalesScope {
  tenantId: string;
  spaceId: string;
  eventId: string;
  elementId?: string;
}

export const POS_SALES_DEFAULT_LIMIT = 50;
export const POS_SALES_MAX_LIMIT = 200;

interface ScopeIds {
  salesEventIds: string[];
  locationIds?: string[];
}

/**
 * Historique et clôture des ventes de caisse (interface 3 du PLAN §5 bis), partagé par la caisse
 * invitée et l'écran staff (historique, export CSV).
 *
 * Lecture appuyée sur les index existants de WeezeventTransaction : (tenantId, eventId, status) pour
 * l'évènement et (tenantId, locationId, status, eventId) pour un PdV. Les filtres paiement, numéro et
 * vendeur portent sur `metadata` (JSON) et ne s'appliquent qu'aux lignes déjà bornées par ces index.
 * Les ventes annulées restent listées (`cancelled=true`) mais sortent des totaux et de la clôture.
 */
@Injectable()
export class PosSalesQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async list(scope: PosSalesScope, query: PosSalesQuery = {}): Promise<PosSalesPage> {
    const limit = Math.min(Math.max(Math.trunc(Number(query.limit)) || POS_SALES_DEFAULT_LIMIT, 1), POS_SALES_MAX_LIMIT);
    // Le PdV du scope (jeton invité) l'emporte toujours : un filtre de requête ne peut qu'affiner (staff), jamais élargir.
    const ids = await this.resolveScope(scope, scope.elementId ?? query.elementId);
    if (!ids) return { rows: [], nextCursor: null, totals: { tickets: 0, cancelled: 0, revenueTtc: 0, tipsTtc: 0 } };

    const base = this.baseWhere(scope.tenantId, ids, query);
    const cursor = decodeCursor(query.cursor);
    const pageWhere: Prisma.SalesTransactionWhereInput = cursor
      ? {
          AND: [
            base,
            { OR: [{ transactionDate: { lt: cursor.date } }, { transactionDate: cursor.date, id: { lt: cursor.id } }] },
          ],
        }
      : base;

    const [records, active, cancelled, tipped] = await Promise.all([
      this.prisma.salesTransaction.findMany({
        where: pageWhere,
        orderBy: [{ transactionDate: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        select: POS_SALE_SELECT,
      }),
      this.prisma.salesTransaction.aggregate({ where: { ...base, deletedAt: null }, _count: { _all: true }, _sum: { amount: true } }),
      this.prisma.salesTransaction.count({ where: { ...base, deletedAt: { not: null } } }),
      // Pourboires des tickets actifs : seuls les tickets qui en portent un sont lus (metadata seule).
      this.prisma.salesTransaction.findMany({
        where: { AND: [{ ...base, deletedAt: null }, { metadata: { path: ['tipTotal'], gt: 0 } }] },
        select: { metadata: true },
      }),
    ]);

    const hasMore = records.length > limit;
    const page = hasMore ? records.slice(0, limit) : records;
    const last = page[page.length - 1];
    return {
      rows: page.map(toSaleRow),
      nextCursor: hasMore && last ? encodeCursor(last.transactionDate, last.id) : null,
      totals: { tickets: active._count._all, cancelled, revenueTtc: round2(Number(active._sum.amount ?? 0)),
        tipsTtc: round2(tipped.reduce((sum, t) => sum + tipTotalOf(paymentsOf((t.metadata ?? {}) as Partial<PosTransactionMetadata>)), 0)),
      },
    };
  }

  /**
   * Récapitulatif de clôture d'un périmètre (en pratique un PdV) : tickets, annulés, encaissé par moyen
   * de paiement (copie figée nom + kind), TVA et CA. Calcul en mémoire sur les ventes actives du
   * périmètre, avec les mêmes arrondis que l'historique (totaux identiques à la ligne près).
   */
  async closing(scope: PosSalesScope): Promise<PosClosing> {
    const empty: PosClosing = { tickets: 0, cancelled: 0, byPaymentMethod: [], vatTotal: 0, revenueTtc: 0, tips: { totalTtc: 0, byVendor: [] } };
    const ids = await this.resolveScope(scope, scope.elementId);
    if (!ids) return empty;
    const base = this.baseWhere(scope.tenantId, ids, {});

    const [records, cancelled] = await Promise.all([
      this.prisma.salesTransaction.findMany({
        where: { ...base, deletedAt: null },
        select: { amount: true, metadata: true, items: { select: { quantity: true, unitPrice: true, vat: true } } },
      }),
      this.prisma.salesTransaction.count({ where: { ...base, deletedAt: { not: null } } }),
    ]);

    const byMethod = new Map<string, PosClosing['byPaymentMethod'][number]>();
    let vatTotal = 0;
    let revenue = 0;
    let tipsTotal = 0;
    const byVendor = new Map<string, { vendorName: string; tipTtc: number; tickets: number }>();
    for (const record of records) {
      revenue += Number(record.amount);
      for (const item of record.items) vatTotal += vatOf(lineTotal(Number(item.unitPrice), item.quantity), Number(item.vat));
      const meta = (record.metadata ?? {}) as Partial<PosTransactionMetadata>;
      const payments = paymentsOf(meta);
      for (const p of payments) {
        const current = byMethod.get(p.paymentMethodId);
        if (current) {
          current.amountTtc = round2(current.amountTtc + p.amountTtc);
          current.tipTtc = round2(current.tipTtc + p.tipTtc);
        } else {
          byMethod.set(p.paymentMethodId, { paymentMethodId: p.paymentMethodId, name: p.name, kind: p.kind, amountTtc: round2(p.amountTtc), tipTtc: round2(p.tipTtc) });
        }
      }
      // Pourboires par vendeur (redistribution) : seuls les tickets actifs qui en portent un.
      const tip = tipTotalOf(payments);
      if (tip > 0) {
        tipsTotal += tip;
        const name = meta.vendorName ?? '';
        const vendor = byVendor.get(name) ?? { vendorName: name, tipTtc: 0, tickets: 0 };
        vendor.tipTtc = round2(vendor.tipTtc + tip);
        vendor.tickets += 1;
        byVendor.set(name, vendor);
      }
    }
    return {
      tickets: records.length,
      cancelled,
      byPaymentMethod: [...byMethod.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr')),
      vatTotal: round2(vatTotal),
      revenueTtc: round2(revenue),
      tips: {
        totalTtc: round2(tipsTotal),
        byVendor: [...byVendor.values()].sort((a, b) => a.vendorName.localeCompare(b.vendorName, 'fr')),
      },
    };
  }

  /**
   * Numéro du prochain ticket d'un PdV pour un évènement (affiché en caisse, indicatif : le numéro
   * définitif est attribué à l'écriture). Compte toutes les ventes du PdV, annulées comprises.
   */
  async nextTicketNumber(scope: PosSalesScope & { elementId: string }): Promise<number> {
    const ids = await this.resolveScope(scope, scope.elementId);
    if (!ids) return 1;
    const written = await this.prisma.salesTransaction.count({ where: this.baseWhere(scope.tenantId, ids, {}) });
    return written + 1;
  }

  /** SalesEvent POS de l'évènement et SalesLocation POS du PdV ; null si le périmètre n'a encore aucune vente possible. */
  private async resolveScope(scope: PosSalesScope, elementId: string | undefined): Promise<ScopeIds | null> {
    const [events, locations] = await Promise.all([
      this.prisma.salesEvent.findMany({
        where: { tenantId: scope.tenantId, externalId: scope.eventId, integration: { provider: 'POS' } },
        select: { id: true },
      }),
      elementId
        ? this.prisma.salesLocation.findMany({
            where: { tenantId: scope.tenantId, externalId: elementId, integration: { provider: 'POS' } },
            select: { id: true },
          })
        : Promise.resolve(null),
    ]);
    if (events.length === 0) return null;
    if (locations && locations.length === 0) return null;
    return { salesEventIds: events.map((e) => e.id), locationIds: locations?.map((l) => l.id) };
  }

  private baseWhere(tenantId: string, ids: ScopeIds, query: PosSalesQuery): Prisma.SalesTransactionWhereInput {
    const and: Prisma.SalesTransactionWhereInput[] = [];
    if (query.paymentMethodId) {
      and.push({ metadata: { path: ['payments'], array_contains: [{ paymentMethodId: query.paymentMethodId }] } });
    }
    const search = query.search?.trim();
    if (search) and.push({ OR: searchFilters(search) });
    return {
      tenantId,
      status: 'V',
      provider: 'POS',
      eventId: { in: ids.salesEventIds },
      ...(ids.locationIds ? { locationId: { in: ids.locationIds } } : {}),
      ...(and.length ? { AND: and } : {}),
    };
  }
}

/**
 * Recherche « numéro de ticket ou vendeur ». Les filtres JSON de Prisma sont sensibles à la casse et
 * n'ont pas de mode insensible : on teste la saisie telle quelle, en minuscules, en majuscules et en
 * capitalisé, ce qui couvre les noms saisis en caisse (« marie », « Marie », « MARIE »).
 */
function searchFilters(search: string): Prisma.SalesTransactionWhereInput[] {
  const variants = new Set([
    search,
    search.toLowerCase(),
    search.toUpperCase(),
    search.charAt(0).toUpperCase() + search.slice(1).toLowerCase(),
  ]);
  const filters: Prisma.SalesTransactionWhereInput[] = [...variants].map((v) => ({
    metadata: { path: ['vendorName'], string_contains: v },
  }));
  if (/^\d{1,9}$/.test(search)) filters.push({ metadata: { path: ['ticketNumber'], equals: Number(search) } });
  return filters;
}

function encodeCursor(date: Date, id: string): string {
  return Buffer.from(`${date.toISOString()}|${id}`).toString('base64url');
}

function decodeCursor(cursor: string | undefined): { date: Date; id: string } | null {
  if (!cursor) return null;
  try {
    const [iso, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
    const date = new Date(iso);
    return id && !Number.isNaN(date.getTime()) ? { date, id } : null;
  } catch {
    return null;
  }
}
