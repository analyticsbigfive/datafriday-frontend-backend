import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, StockMovementReason, StockTransferStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../core/database/prisma.service';
import { CreateMovementDto } from '../dto/logistics.dto';
import { LogisticsElementScopeService } from './logistics-element-scope.service';
import { RecipeExplosionService } from './recipe-explosion.service';
import { StockItemIdentityService } from './stock-item-identity.service';
import { SpaceScopedUser, ElementRef } from '../logistics.types';

/**
 * Mouvements de stock : entrées, sorties, transferts, annulation et historique.
 */
@Injectable()
export class StockMovementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logisticsElementScopeService: LogisticsElementScopeService,
    private readonly recipeExplosionService: RecipeExplosionService,
    private readonly stockItemIdentityService: StockItemIdentityService,
  ) {}

  // ─── POST /logistics/movements ───────────────────────────────────────────────

  async createMovement(dto: CreateMovementDto, tenantId: string, userId?: string) {
    if ((dto.packed ?? 0) === 0 && (dto.loose ?? 0) === 0) {
      throw new BadRequestException('Quantité nulle : packed ou loose doit être > 0');
    }
    const isTransfer = dto.reason === 'TRANSFER_SHOP' || dto.reason === 'TRANSFER_STORAGE';
    if (dto.reason === 'DELIVERY' && dto.direction !== 'add') {
      throw new BadRequestException('DELIVERY est réservé aux ajouts');
    }
    if (dto.reason === 'VENTILATION' && dto.direction !== 'add') {
      throw new BadRequestException('VENTILATION est réservé aux ajouts');
    }
    if (dto.reason === 'VENTILATION' && !dto.eventId) {
      throw new BadRequestException('eventId requis pour VENTILATION');
    }
    if (dto.reason === 'EXPIRY' && dto.direction !== 'remove') {
      throw new BadRequestException('EXPIRY est réservé aux suppressions');
    }
    // BUG-259-02 : un transfert s'émet désormais uniquement depuis la source qui le
    // déclare en le retirant ("Transfert vers un PDV/Storage", mode Supprimer) — la
    // contrepartie ne reçoit plus de crédit immédiat, elle confirme via
    // POST /logistics/movements/:id/confirm (cf. confirmTransfer).
    if (isTransfer && dto.direction !== 'remove') {
      throw new BadRequestException("Un transfert s'émet en suppression (contrepartie créditée à la confirmation)");
    }
    if (isTransfer && !dto.counterpartyElementId) {
      throw new BadRequestException('counterpartyElementId requis pour un transfert');
    }
    if (dto.reason === 'EXPIRY' && !dto.expiryDate) {
      throw new BadRequestException('expiryDate requise pour EXPIRY');
    }
    if (dto.reason === 'OTHER' && !dto.note?.trim()) {
      throw new BadRequestException('note requise pour OTHER');
    }
    if (isTransfer && dto.counterpartyElementId === dto.elementId) {
      throw new BadRequestException('Un élément ne peut pas transférer vers lui-même');
    }

    const element = await this.logisticsElementScopeService.getElementOrThrow(dto.elementId, tenantId);
    if (element.spaceId !== dto.spaceId) {
      throw new BadRequestException(`Element ${dto.elementId} n'appartient pas à l'espace ${dto.spaceId}`);
    }
    let counterparty: ElementRef | null = null;
    if (isTransfer) {
      counterparty = await this.logisticsElementScopeService.getElementOrThrow(dto.counterpartyElementId!, tenantId);
      if (counterparty.spaceId !== dto.spaceId) {
        throw new BadRequestException('La contrepartie du transfert doit appartenir au même espace');
      }
    }

    let unitsPerPack: number | null = null;
    if (dto.marketPriceId) {
      const mp = await this.prisma.marketPrice.findFirst({
        where: { id: dto.marketPriceId, tenantId, deletedAt: null },
        select: { packedUnits: true, itemName: true },
      });
      if (!mp) throw new NotFoundException(`Market price ${dto.marketPriceId} not found`);
      // BUG-049 : le marketPriceId fourni doit correspondre à la denrée (itemKey) du
      // mouvement — même résolution nom↔MarketPrice que resolveUnitsPerPackForItemKey
      // (itemName insensible à la casse/espaces), sinon un appel API direct pourrait
      // écraser unitsPerPack avec un pack size sans rapport avec l'itemKey (BUG-032).
      // Sauté quand ce marketPriceId est déjà celui enregistré sur le StockLevel visé :
      // le lien a été validé par nom lors de son établissement, et ne doit pas se
      // rompre si MarketPrice.itemName est renommé depuis (cf. suivi autocomplete).
      const existingLevel = await this.prisma.stockLevel.findUnique({
        where: { uniq_stock_level: { tenantId, elementId: element.id, itemKey: dto.itemKey } },
        select: { marketPriceId: true },
      });
      if (existingLevel?.marketPriceId !== dto.marketPriceId) {
        const itemKeyName = String(dto.itemKey ?? '').trim().toLowerCase();
        const mpItemName = String(mp.itemName ?? '').trim().toLowerCase();
        if (!mpItemName || mpItemName !== itemKeyName) {
          throw new BadRequestException(
            `Market price ${dto.marketPriceId} ne correspond pas à l'item ${dto.itemKey}`,
          );
        }
      }
      unitsPerPack = mp.packedUnits ?? null;
    } else {
      // Aucun marketPriceId (toujours le cas pour un produit fini/component, cf. BUG-032/049 :
      // itemRefsForMenuItem ne leur attache jamais de Market Price) → sans repli, unitsPerPack
      // ne serait JAMAIS résolu pour ces denrées et resterait null sur le StockLevel pour
      // toujours, empêchant la casse de pack (normalizeLevel) même quand le pack size est
      // parfaitement connu côté référentiel (MenuItem.inventoryNumberOfUnits /
      // MenuComponent.packedUnits) — un retrait de vrac pourtant valide serait rejeté à tort
      // (BUG-033/backend BUG-049).
      unitsPerPack = await this.stockItemIdentityService.resolveUnitsPerPackForItemKey(dto.itemKey, tenantId);
    }
    if (dto.menuItemId) {
      const mi = await this.prisma.menuItem.findFirst({
        where: { id: dto.menuItemId, tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!mi) throw new NotFoundException(`Menu item ${dto.menuItemId} not found`);
    }

    const sign = dto.direction === 'add' ? 1 : -1;
    const packedDelta = sign * dto.packed;
    const looseDelta = sign * dto.loose;
    const transferGroupId = counterparty ? randomUUID() : null;
    // ADR-0006 (chantier 377) : le front peut déjà fournir l'identité résolue (dto.itemKind +
    // dto.itemRefId) — préférée à la résolution serveur par nom quand présente. Aucun front
    // actuel ne l'envoie encore, donc ce chemin est inerte tant que le front n'a pas basculé ;
    // résolution serveur inchangée en repli, hors transaction (lecture seule).
    const itemIdentity =
      dto.itemKind && dto.itemRefId
        ? { itemKind: dto.itemKind, itemRefId: dto.itemRefId }
        : await this.stockItemIdentityService.resolveItemIdentityForKey(dto.itemKey, tenantId);
    const base = {
      tenantId,
      spaceId: dto.spaceId,
      itemKey: dto.itemKey,
      itemKind: itemIdentity?.itemKind ?? null,
      itemRefId: itemIdentity?.itemRefId ?? null,
      menuItemId: dto.menuItemId ?? null,
      marketPriceId: dto.marketPriceId ?? null,
      reason: dto.reason as StockMovementReason,
      transferGroupId,
      expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : null,
      note: dto.note?.trim() || null,
      // Seul un dépôt de ventilation porte le match : c'est ce qui permet de
      // retrancher ce qui a déjà été déposé de la feuille (VentilationDepositsService.sumByEvents).
      eventId: dto.reason === 'VENTILATION' ? dto.eventId! : null,
      createdBy: userId ?? null,
    };

    return this.prisma.$transaction(async (tx) => {
      const movement = await tx.stockMovement.create({
        data: {
          ...base,
          elementId: element.id,
          packedDelta,
          looseDelta,
          counterpartyElementId: counterparty?.id ?? null,
          // BUG-259-02 : la source d'un transfert débite immédiatement (comme avant)
          // mais reste PENDING — la contrepartie n'est ni créée ni créditée ici, elle
          // le sera à la confirmation (confirmTransfer), avec les quantités
          // éventuellement corrigées par le destinataire.
          status: counterparty ? StockTransferStatus.PENDING : null,
        },
      });
      const level = await this.stockItemIdentityService.applyLevelDelta(
        tx, tenantId, element, dto.itemKey, packedDelta, looseDelta, unitsPerPack, dto.marketPriceId ?? null, true,
        itemIdentity,
      );
      return { movement, level, counterpartyLevel: null as any };
    });
  }

  // ─── Brique du registre réutilisée par la ventilation (ventilation-deposits.service.ts) ──

  /**
   * Écrit le mouvement INVERSE d'un mouvement existant (même élément, article, raison
   * et match ; `reversesMovementId` = mouvement annulé) et retire son effet du niveau.
   * Le registre garde les deux lignes. `strict` : refusé si le stock ne contient plus
   * la quantité (déjà vendue ou déplacée), sinon registre et niveau divergeraient.
   * `reversesMovementId` est unique : une seconde annulation, même simultanée, échoue.
   */
  async writeReversal(
    original: {
      id: string;
      tenantId: string;
      spaceId: string;
      elementId: string;
      itemKey: string;
      itemKind: string | null;
      itemRefId: string | null;
      menuItemId: string | null;
      marketPriceId: string | null;
      packedDelta: number;
      looseDelta: number;
      reason: StockMovementReason;
      eventId: string | null;
      note: string | null;
    },
    actorId: string,
    user?: SpaceScopedUser,
  ) {
    const element = await this.logisticsElementScopeService.getElementOrThrow(original.elementId, original.tenantId, user);
    const itemIdentity =
      original.itemKind && original.itemRefId ? { itemKind: original.itemKind, itemRefId: original.itemRefId } : null;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const movement = await tx.stockMovement.create({
          data: {
            tenantId: original.tenantId,
            spaceId: original.spaceId,
            elementId: original.elementId,
            itemKey: original.itemKey,
            itemKind: original.itemKind,
            itemRefId: original.itemRefId,
            menuItemId: original.menuItemId,
            marketPriceId: original.marketPriceId,
            packedDelta: -original.packedDelta,
            looseDelta: -original.looseDelta,
            reason: original.reason,
            eventId: original.eventId,
            reversesMovementId: original.id,
            note: original.note,
            createdBy: actorId,
          },
        });
        const level = await this.stockItemIdentityService.applyLevelDelta(
          tx, original.tenantId, element, original.itemKey, -original.packedDelta, -original.looseDelta,
          null, original.marketPriceId, true, itemIdentity,
        );
        return { movement, level };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new BadRequestException('Ce mouvement est déjà annulé');
      }
      throw error;
    }
  }

  // ─── Annulation d'un mouvement encore PENDING (LogisticTasksService.undoPickup) ──

  /**
   * Annule un mouvement de transfert PAS ENCORE confirmé : réapplique le delta
   * inverse sur le StockLevel source (l'aller n'a jamais été confirmé, aucune
   * contrepartie n'existe, rien d'autre à défaire) puis supprime la ligne
   * StockMovement. Un mouvement déjà `CONFIRMED` refuse (confirmTransfer a déjà
   * crédité une contrepartie et clos la ligne, annuler à ce stade demanderait de
   * défaire aussi le crédit et la StockTransferLoss éventuelle, hors scope ici,
   * cf. LogisticTasksService.undoPickup qui n'appelle jamais ce chemin après drop()).
   */
  async reverseMovement(movementId: string, tenantId: string) {
    return this.prisma.$transaction(async (tx) => {
      const movement = await tx.stockMovement.findFirst({ where: { id: movementId, tenantId } });
      if (!movement) throw new NotFoundException(`Mouvement ${movementId} not found`);
      if (movement.status && movement.status !== StockTransferStatus.PENDING) {
        throw new BadRequestException(`Mouvement ${movementId} déjà confirmé, impossible à annuler`);
      }
      const element = await this.logisticsElementScopeService.getElementOrThrow(movement.elementId, tenantId);
      const itemIdentity =
        movement.itemKind && movement.itemRefId ? { itemKind: movement.itemKind, itemRefId: movement.itemRefId } : null;
      // Delta inverse : on redonne à la source ce que la sortie initiale lui avait
      // retiré. Toujours positif dans ce sens (une sortie ne peut jamais avoir été
      // négative), donc `strict` (garde-fou anti stock négatif) ne s'applique pas ici.
      await this.stockItemIdentityService.applyLevelDelta(
        tx, tenantId, element, movement.itemKey, -movement.packedDelta, -movement.looseDelta,
        null, movement.marketPriceId, false, itemIdentity,
      );
      await tx.stockMovement.delete({ where: { id: movement.id } });
    });
  }

  // ─── Confirmation d'un transfert (BUG-259-02) ─────────────────────────────────

  /**
   * Confirme un transfert émis (PENDING) : crédite la contrepartie des quantités
   * confirmées (par défaut celles déclarées à l'émission, ou modifiées par le
   * destinataire) et clôt la ligne source. Si les quantités confirmées sont
   * inférieures aux quantités déclarées, l'écart est journalisé dans
   * `StockTransferLoss`, section "Pertes" dédiée, distincte de Réconciliation.
   */
  async confirmTransfer(movementId: string, dto: { packed?: number; loose?: number }, tenantId: string, userId?: string) {
    const source = await this.prisma.stockMovement.findFirst({
      where: { id: movementId, tenantId },
    });
    if (!source) throw new NotFoundException(`Mouvement ${movementId} not found`);
    if (source.reason !== 'TRANSFER_SHOP' && source.reason !== 'TRANSFER_STORAGE') {
      throw new BadRequestException(`Le mouvement ${movementId} n'est pas un transfert`);
    }
    if (source.status !== StockTransferStatus.PENDING) {
      throw new BadRequestException(`Transfert ${movementId} déjà confirmé ou invalide`);
    }
    if (!source.counterpartyElementId) {
      throw new BadRequestException(`Transfert ${movementId} sans contrepartie`);
    }

    const counterparty = await this.logisticsElementScopeService.getElementOrThrow(source.counterpartyElementId, tenantId);
    const declaredPacked = Math.abs(source.packedDelta);
    const declaredLoose = Math.abs(source.looseDelta);
    const confirmedPacked = dto.packed != null ? Math.max(0, dto.packed) : declaredPacked;
    const confirmedLoose = dto.loose != null ? Math.max(0, dto.loose) : declaredLoose;
    if (confirmedPacked > declaredPacked || confirmedLoose > declaredLoose) {
      throw new BadRequestException('Les quantités confirmées ne peuvent pas dépasser les quantités déclarées');
    }

    let unitsPerPack: number | null = null;
    if (source.marketPriceId) {
      const mp = await this.prisma.marketPrice.findFirst({
        where: { id: source.marketPriceId, tenantId, deletedAt: null },
        select: { packedUnits: true },
      });
      unitsPerPack = mp?.packedUnits ?? null;
    } else {
      unitsPerPack = await this.stockItemIdentityService.resolveUnitsPerPackForItemKey(source.itemKey, tenantId);
    }

    const round2 = (n: number) => Math.round(n * 100) / 100;
    const missingPacked = declaredPacked - confirmedPacked;
    const missingLoose = round2(declaredLoose - confirmedLoose);
    const hasLoss = missingPacked > 0 || missingLoose > 0;

    // ADR-0006 (chantier 377) : le mouvement source porte déjà (itemKind, itemRefId) s'il a été
    // créé après le déploiement de la double-écriture — repli null sinon (mouvement historique),
    // jamais de résolution supplémentaire ici (identité déjà tranchée à l'émission du transfert).
    const itemIdentity =
      source.itemKind && source.itemRefId ? { itemKind: source.itemKind, itemRefId: source.itemRefId } : null;

    return this.prisma.$transaction(async (tx) => {
      await tx.stockMovement.create({
        data: {
          tenantId,
          spaceId: source.spaceId,
          elementId: counterparty.id,
          itemKey: source.itemKey,
          itemKind: itemIdentity?.itemKind ?? null,
          itemRefId: itemIdentity?.itemRefId ?? null,
          menuItemId: source.menuItemId,
          marketPriceId: source.marketPriceId,
          packedDelta: confirmedPacked,
          looseDelta: confirmedLoose,
          reason: source.reason,
          counterpartyElementId: source.elementId,
          transferGroupId: source.transferGroupId,
          status: StockTransferStatus.CONFIRMED,
          createdBy: userId ?? null,
        },
      });
      const counterpartyLevel = await this.stockItemIdentityService.applyLevelDelta(
        tx, tenantId, counterparty, source.itemKey, confirmedPacked, confirmedLoose, unitsPerPack, source.marketPriceId, true,
        itemIdentity,
      );
      await tx.stockMovement.update({
        where: { id: source.id },
        data: { status: StockTransferStatus.CONFIRMED, confirmedAt: new Date(), confirmedBy: userId ?? null },
      });

      let lossId: string | null = null;
      if (hasLoss) {
        const loss = await tx.stockTransferLoss.create({
          data: {
            tenantId,
            spaceId: source.spaceId,
            itemKey: source.itemKey,
            itemKind: itemIdentity?.itemKind ?? null,
            itemRefId: itemIdentity?.itemRefId ?? null,
            sourceElementId: source.elementId,
            destinationElementId: counterparty.id,
            unitsPerPack,
            declaredPacked,
            declaredLoose,
            receivedPacked: confirmedPacked,
            receivedLoose: confirmedLoose,
            lostPacked: missingPacked,
            lostLoose: missingLoose,
            transferMovementId: source.id,
            createdBy: userId ?? null,
          },
        });
        lossId = loss.id;
      }

      return { sourceMovementId: source.id, counterpartyLevel, missingPacked, missingLoose, lossId };
    });
  }

  /** Transferts émis vers `elementId` et en attente de confirmation (BUG-259-02). */
  /**
   * Transferts PENDING impliquant `elementId`, dans les deux sens : `incoming`
   * (émis par un autre élément, en attente que CET élément confirme, cf.
   * confirmTransfer) et `outgoing` (émis par CET élément, en attente que la
   * contrepartie confirme). `outgoing` répond à la demande d'Ulrich (2026-08-13) :
   * la source doit garder une trace visible d'un transfert tant qu'il n'est pas
   * validé côté destinataire, pas seulement dans Historique.
   */
  async getPendingTransfersForElement(elementId: string, tenantId: string) {
    const [incomingRows, outgoingRows] = await Promise.all([
      this.prisma.stockMovement.findMany({
        where: { tenantId, counterpartyElementId: elementId, status: StockTransferStatus.PENDING },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.stockMovement.findMany({
        where: { tenantId, elementId, status: StockTransferStatus.PENDING },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    if (!incomingRows.length && !outgoingRows.length) return { incoming: [], outgoing: [] };

    const counterpartyIds = [
      ...new Set([...incomingRows.map((r) => r.elementId), ...outgoingRows.map((r) => r.counterpartyElementId)]),
    ].filter((id): id is string => !!id);
    const counterparts = counterpartyIds.length
      ? await this.prisma.spaceElement.findMany({ where: { id: { in: counterpartyIds } }, select: { id: true, name: true } })
      : [];
    const nameById = new Map(counterparts.map((c) => [c.id, c.name]));

    return {
      incoming: incomingRows.map((r) => ({
        movementId: r.id,
        itemKey: r.itemKey,
        sourceElementId: r.elementId,
        sourceElementName: nameById.get(r.elementId) ?? r.elementId,
        declaredPacked: Math.abs(r.packedDelta),
        declaredLoose: Math.abs(r.looseDelta),
        createdAt: r.createdAt,
      })),
      outgoing: outgoingRows.map((r) => ({
        movementId: r.id,
        itemKey: r.itemKey,
        destinationElementId: r.counterpartyElementId,
        destinationElementName: r.counterpartyElementId ? (nameById.get(r.counterpartyElementId) ?? r.counterpartyElementId) : null,
        declaredPacked: Math.abs(r.packedDelta),
        declaredLoose: Math.abs(r.looseDelta),
        createdAt: r.createdAt,
      })),
    };
  }

  // ─── GET /logistics/element/:elementId/history ───────────────────────────────

  async getHistory(elementId: string, tenantId: string, limit = 50, cursor?: string, user?: SpaceScopedUser) {
    const element = await this.logisticsElementScopeService.getElementOrThrow(elementId, tenantId, user);
    const take = Math.min(Math.max(limit, 1), 200);

    const [movements, raw] = await Promise.all([
      this.prisma.stockMovement.findMany({
        where: { tenantId, elementId },
        // Tie-breaker id : les mouvements d'un reset partagent le même createdAt
        // (createMany) — sans lui la pagination cursor saute/duplique des lignes.
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: take + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      }),
      // Ventes agrégées par event (une ligne par event, toute la période)
      this.recipeExplosionService.deriveSalesRaw(tenantId, [elementId], null),
    ]);

    const hasMore = movements.length > take;
    const page = hasMore ? movements.slice(0, take) : movements;

    // Noms des contreparties pour l'affichage (« Transfert depuis/vers X »)
    const counterpartyIds = [...new Set(page.map((m) => m.counterpartyElementId).filter(Boolean))] as string[];
    const counterparts = counterpartyIds.length
      ? await this.prisma.spaceElement.findMany({
          where: { id: { in: counterpartyIds } },
          select: { id: true, name: true },
        })
      : [];
    const nameById = new Map(counterparts.map((c) => [c.id, c.name]));

    const salesByEvent = new Map<string, { eventId: string | null; eventName: string | null; soldUnits: number; lastAt: Date }>();
    for (const row of raw) {
      const key = row.eventId ?? '(none)';
      let agg = salesByEvent.get(key);
      if (!agg) {
        agg = { eventId: row.eventId, eventName: row.eventName, soldUnits: 0, lastAt: row.lastAt };
        salesByEvent.set(key, agg);
      }
      agg.soldUnits += row.qty;
      if (row.lastAt > agg.lastAt) agg.lastAt = row.lastAt;
      if (!agg.eventName && row.eventName) agg.eventName = row.eventName;
    }

    return {
      elementId: element.id,
      elementName: element.name,
      movements: page.map((m) => ({
        ...m,
        counterpartyName: m.counterpartyElementId ? (nameById.get(m.counterpartyElementId) ?? null) : null,
      })),
      nextCursor: hasMore ? page[page.length - 1].id : null,
      salesByEvent: [...salesByEvent.values()].sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime()),
    };
  }
}
