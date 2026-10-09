import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { StockMovementReason } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { StockMovementService } from './services/stock-movement.service';
import { StockReferentialService } from './services/stock-referential.service';

type SpaceScopedUser = { id: string; isSuperAdmin: boolean; isOwner: boolean; allSpacesAccess: boolean };

/** Nom normalisé (accents, casse, espaces), même règle que `normalizeStr` côté front. */
export function normalizeItemName(v: string | null | undefined): string {
  return String(v ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase();
}

/**
 * Dépôts « Ventilation » (chantier logistic_ventilation ; réponse #74 de Bertrand :
 * raison « Ventilation »). Lecture des dépôts d'un match, annulation par mouvement
 * inverse (décision #76) et correspondance entre une ligne de la feuille de
 * réarmement et l'article Logistic. L'écriture dans le registre reste dans
 * StockMovementService (`createMovement`, `writeReversal`).
 */
@Injectable()
export class VentilationDepositsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stockMovementService: StockMovementService,
    private readonly stockReferentialService: StockReferentialService,
  ) {}

  /**
   * Cumul des dépôts d'un match par élément × article (annulations comprises : un
   * mouvement inverse est négatif). Le front retranche ces quantités des lignes de la
   * feuille (`utils/restockDepositSheet.js`).
   */
  async sumByEvent(spaceId: string, eventId: string, tenantId: string) {
    if (!eventId) return [];
    const rows = await this.prisma.stockMovement.groupBy({
      by: ['elementId', 'itemKey'],
      where: { tenantId, spaceId, eventId, reason: StockMovementReason.VENTILATION },
      _sum: { packedDelta: true, looseDelta: true },
    });
    return rows.map((r) => ({
      elementId: r.elementId,
      itemKey: r.itemKey,
      packed: r._sum.packedDelta ?? 0,
      loose: r._sum.looseDelta ?? 0,
    }));
  }

  /**
   * Dépôts d'un match un par un (les plus récents d'abord), avec leur annulation :
   * liste « Déjà déposé ». Les mouvements inverses ne sont pas listés ; l'état
   * « annulé » est lu pour chaque dépôt affiché, sans dépendre du plafond de la liste.
   */
  async listByEvent(spaceId: string, eventId: string, tenantId: string) {
    if (!eventId) return [];
    const deposits = await this.prisma.stockMovement.findMany({
      where: { tenantId, spaceId, eventId, reason: StockMovementReason.VENTILATION, reversesMovementId: null },
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: {
        id: true,
        elementId: true,
        itemKey: true,
        packedDelta: true,
        looseDelta: true,
        note: true,
        createdBy: true,
        createdAt: true,
      },
    });
    if (!deposits.length) return [];
    const ids = deposits.map((d) => d.id);
    const elementIds = [...new Set(deposits.map((d) => d.elementId))];
    const [reversals, elements] = await Promise.all([
      this.prisma.stockMovement.findMany({ where: { tenantId, reversesMovementId: { in: ids } }, select: { reversesMovementId: true } }),
      this.prisma.spaceElement.findMany({ where: { id: { in: elementIds } }, select: { id: true, name: true } }),
    ]);
    const cancelled = new Set(reversals.map((r) => r.reversesMovementId));
    const nameById = new Map(elements.map((e) => [e.id, e.name]));
    return deposits.map((d) => ({
      id: d.id,
      elementId: d.elementId,
      elementName: nameById.get(d.elementId) ?? null,
      itemKey: d.itemKey,
      packed: d.packedDelta,
      loose: d.looseDelta,
      depositorName: d.note,
      createdBy: d.createdBy,
      createdAt: d.createdAt,
      cancelled: cancelled.has(d.id),
    }));
  }

  /**
   * Annule un dépôt par un mouvement inverse. `requireCreatedBy` : accès PIN, seuls
   * les dépôts de cet acteur (accès + appareil) ; `user` : utilisateur connecté,
   * contrôle d'accès à l'espace du dépôt.
   */
  async cancel(
    movementId: string,
    tenantId: string,
    actorId: string,
    options: { requireCreatedBy?: string; user?: SpaceScopedUser } = {},
  ) {
    const deposit = await this.prisma.stockMovement.findFirst({ where: { id: movementId, tenantId } });
    if (!deposit || deposit.reason !== StockMovementReason.VENTILATION || deposit.reversesMovementId) {
      throw new NotFoundException('Dépôt de ventilation introuvable');
    }
    if (options.requireCreatedBy && deposit.createdBy !== options.requireCreatedBy) {
      throw new ForbiddenException("Ce dépôt n'a pas été saisi depuis cet appareil");
    }
    return this.stockMovementService.writeReversal(deposit, actorId, options.user);
  }

  /**
   * Nom Logistic (itemKey) d'un article sur un élément depuis le nom d'une ligne de
   * réarmement : niveau existant d'abord, puis référentiel de l'élément ; repli sur
   * le nom fourni.
   */
  async resolveElementItemKey(spaceId: string, elementId: string, itemName: string, tenantId: string): Promise<string> {
    const wanted = normalizeItemName(itemName);
    if (!wanted) return itemName;
    const levels = await this.prisma.stockLevel.findMany({ where: { tenantId, elementId }, select: { itemKey: true } });
    const level = levels.find((l) => normalizeItemName(l.itemKey) === wanted);
    if (level) return level.itemKey;
    const [element] = await this.stockReferentialService.getElementItems(spaceId, tenantId, [elementId]);
    return element?.items.find((it) => normalizeItemName(it.name) === wanted)?.name ?? itemName;
  }

  /**
   * Taille de pack Logistic de chaque article des destinations données : niveau
   * existant d'abord (dernier mouvement), sinon référentiel, comme l'écran Logistique
   * (`unitsPerPackFor`). Sert à pré-remplir les packs du dépôt côté invité.
   */
  async packSizes(spaceId: string, tenantId: string, elementIds: string[]) {
    if (!elementIds.length) return [];
    const [levels, elements] = await Promise.all([
      this.prisma.stockLevel.findMany({
        where: { tenantId, elementId: { in: elementIds } },
        select: { elementId: true, itemKey: true, unitsPerPack: true },
      }),
      this.stockReferentialService.getElementItems(spaceId, tenantId, elementIds),
    ]);
    const out = new Map<string, { elementId: string; itemName: string; unitsPerPack: number | null }>();
    for (const el of elements) {
      for (const it of el.items) {
        out.set(`${el.elementId}::${normalizeItemName(it.name)}`, { elementId: el.elementId, itemName: it.name, unitsPerPack: it.unitsPerPack });
      }
    }
    for (const l of levels) {
      if (!l.unitsPerPack) continue;
      out.set(`${l.elementId}::${normalizeItemName(l.itemKey)}`, { elementId: l.elementId, itemName: l.itemKey, unitsPerPack: l.unitsPerPack });
    }
    return [...out.values()].filter((r) => r.unitsPerPack);
  }
}
