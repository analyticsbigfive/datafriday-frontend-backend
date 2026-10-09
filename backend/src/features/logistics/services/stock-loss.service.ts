import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { SpaceAccessService } from '../../../core/auth/space-access.service';

/**
 * Pertes de transfert : synthèse, liste, archivage et export CSV.
 */
@Injectable()
export class StockLossService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly spaceAccess: SpaceAccessService,
  ) {}

  // ─── Pertes de transfert (BUG-259-02) ─────────────────────────────────────────
  // Section "Pertes" dédiée (distincte de Réconciliation, qui modélise un écart de
  // COMPTAGE) : une ligne par transfert confirmé avec une quantité reçue inférieure
  // à la quantité déclarée à l'émission. `archivedAt` = "vidée" par un utilisateur,
  // jamais supprimée (piste d'audit), seulement masquée de la liste active.

  /** Résumé : nombre de pertes + quantités perdues (packs/vrac), actives par défaut. */
  async getLossesSummary(spaceId: string, tenantId: string, includeArchived = false) {
    await this.spaceAccess.assertSpaceAccessible(spaceId, tenantId);
    const where = { tenantId, spaceId, ...(includeArchived ? {} : { archivedAt: null }) };
    const agg = await this.prisma.stockTransferLoss.aggregate({
      where,
      _count: { _all: true },
      _sum: { lostPacked: true, lostLoose: true },
    });
    return {
      count: agg._count._all,
      totalLostPacked: agg._sum.lostPacked ?? 0,
      totalLostLoose: Math.round((agg._sum.lostLoose ?? 0) * 100) / 100,
    };
  }

  /** Liste paginée (cursor, comme getHistory) des pertes, plus récentes d'abord. */
  async getLosses(spaceId: string, tenantId: string, limit = 50, cursor?: string, includeArchived = false) {
    await this.spaceAccess.assertSpaceAccessible(spaceId, tenantId);
    const take = Math.min(Math.max(limit, 1), 200);
    const where = { tenantId, spaceId, ...(includeArchived ? {} : { archivedAt: null }) };
    const rows = await this.prisma.stockTransferLoss.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;
    const elementIds = [...new Set(page.flatMap((r) => [r.sourceElementId, r.destinationElementId]))];
    const elements = elementIds.length
      ? await this.prisma.spaceElement.findMany({ where: { id: { in: elementIds } }, select: { id: true, name: true } })
      : [];
    const nameById = new Map(elements.map((e) => [e.id, e.name]));
    return {
      losses: page.map((r) => ({
        id: r.id,
        itemKey: r.itemKey,
        sourceElementId: r.sourceElementId,
        sourceElementName: nameById.get(r.sourceElementId) ?? r.sourceElementId,
        destinationElementId: r.destinationElementId,
        destinationElementName: nameById.get(r.destinationElementId) ?? r.destinationElementId,
        unitsPerPack: r.unitsPerPack,
        declaredPacked: r.declaredPacked,
        declaredLoose: r.declaredLoose,
        receivedPacked: r.receivedPacked,
        receivedLoose: r.receivedLoose,
        lostPacked: r.lostPacked,
        lostLoose: r.lostLoose,
        archivedAt: r.archivedAt,
        createdAt: r.createdAt,
      })),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }

  /** Archive ("vide") toutes les pertes actives, jamais supprimées, juste masquées par défaut. */
  async archiveLosses(spaceId: string, tenantId: string, userId?: string) {
    await this.spaceAccess.assertSpaceAccessible(spaceId, tenantId);
    const res = await this.prisma.stockTransferLoss.updateMany({
      where: { tenantId, spaceId, archivedAt: null },
      data: { archivedAt: new Date(), archivedBy: userId ?? null },
    });
    return { archivedCount: res.count };
  }

  /** CSV de toutes les pertes (actives + archivées) d'un espace, pour "tout télécharger". */
  async exportLossesCsv(spaceId: string, tenantId: string) {
    await this.spaceAccess.assertSpaceAccessible(spaceId, tenantId);
    const rows = await this.prisma.stockTransferLoss.findMany({
      where: { tenantId, spaceId },
      orderBy: { createdAt: 'desc' },
    });
    const elementIds = [...new Set(rows.flatMap((r) => [r.sourceElementId, r.destinationElementId]))];
    const elements = elementIds.length
      ? await this.prisma.spaceElement.findMany({ where: { id: { in: elementIds } }, select: { id: true, name: true } })
      : [];
    const nameById = new Map(elements.map((e) => [e.id, e.name]));
    const esc = (v: unknown) => {
      // Décimaux en virgule : convention CSV ';' fr (cf. exportReconciliationCsv).
      const s = typeof v === 'number' ? String(v).replace('.', ',') : String(v ?? '');
      return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = [
      'Date', 'Denrée', 'Source', 'Destination',
      'Déclaré (packs)', 'Déclaré (vrac)', 'Reçu (packs)', 'Reçu (vrac)',
      'Perdu (packs)', 'Perdu (vrac)', 'Archivée',
    ];
    const csvRows = rows.map((r) =>
      [
        r.createdAt.toISOString().slice(0, 10),
        r.itemKey,
        nameById.get(r.sourceElementId) ?? r.sourceElementId,
        nameById.get(r.destinationElementId) ?? r.destinationElementId,
        r.declaredPacked, r.declaredLoose, r.receivedPacked, r.receivedLoose,
        r.lostPacked, r.lostLoose,
        r.archivedAt ? 'oui' : 'non',
      ].map(esc).join(';'),
    );
    const bom = '﻿';
    return [bom + header.join(';'), ...csvRows].join('\n');
  }
}
