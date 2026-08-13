import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Prisma, StockMovementReason, StockTransferStatus } from '@prisma/client';
import { Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../core/database/prisma.service';
import { QueueService } from '../../core/queue/queue.service';
import { QUEUES } from '../../core/queue/queue.constants';
import { MenuItemPricingService } from '../../shared/pricing/menu-item-pricing.service';
import { SpaceAccessService } from '../../core/auth/space-access.service';
import { CreateMovementDto, InventoryResetDto, SimulateSaleLineDto } from './dto/logistics.dto';
import { StartSimulationRunDto } from './dto/simulation-run.dto';

export interface SimulationTickJobData {
  runId: string;
}

/** Profil minimal nécessaire pour scoper une requête par espace accessible. */
type SpaceScopedUser = { id: string; isSuperAdmin: boolean; isOwner: boolean; allSpacesAccess: boolean };

type ElementRef = { id: string; name: string; spaceId: string };

type SalesRawRow = {
  elementId: string;
  menuItemId: string;
  eventId: string | null;
  eventName: string | null;
  qty: number;
  lastAt: Date;
};

/** Types de SpaceElement considérés comme un PDV (miroir SpacesService.getSpaceShops). */
const SHOP_TYPES = ['shop', 'fnb_food', 'fnb_beverages', 'fnb_bar', 'fnb_snack', 'fnb_icecream', 'merchshop'];

/** Nature de la ligne — sert le filtre front « Type de denrée ». */
type ItemKind = 'ingredient' | 'component' | 'packaging' | 'product';

type ItemRef = {
  key: string;
  id: string;
  kind: ItemKind;
  unit: string | null;
  marketPriceId: string | null;
  unitsPerPack: number | null;
  packagingType: string | null;
  picture: string | null;
};

type ElementItem = {
  name: string;
  id: string;
  kind: ItemKind;
  unit: string | null;
  marketPriceId: string | null;
  unitsPerPack: number | null;
  packagingType: string | null;
  picture: string | null;
  usedIn: Array<{ id: string; name: string }>;
};

type RecipeCtx = {
  comboByName: Map<string, any>;
  mpByName: Map<string, { id: string; itemName: string; packedUnits: number | null; inventoryPackaging: string | null }>;
  /** Component (MenuComponent) par id, recette complète — pour le dépliage récursif readyForSale=No. */
  componentById: Map<string, any>;
  /** Cache de dépliage recette, clé `${id}:${depth}` — même schéma que perUnitCache/
   * componentPerUnitCache dans explodeSalesToConsumption. Sans lui, un menu item/component
   * partagé par plusieurs plats ou plusieurs shops est ré-expansé depuis zéro à chaque
   * référence (coût combinatoire sur un catalogue à combos/composants imbriqués). */
  itemRefsCache: Map<string, ItemRef[]>;
  componentRefsCache: Map<string, ItemRef[]>;
};

/**
 * Logistic — stock temps réel par PDV/Storage.
 *
 * Modèle : ledger `StockMovement` (deltas signés, append-only) + état matérialisé
 * `StockLevel` (mouvements MANUELS uniquement). Les ventes ne sont PAS matérialisées :
 * elles sont dérivées read-time depuis les transactions Weezevent, bornées par la
 * dernière `StockReconciliation` (ancre posée par l'Inventory Reset).
 * Stock attendu affiché = StockLevel − consommation ventes, avec « casse de pack »
 * (loose négatif → emprunte des packs à hauteur de unitsPerPack).
 *
 * `itemKey` = nom du référentiel d'inventaire front (itemName market price pour un
 * menu item readyForSale à ingrédient unique, sinon nom d'ingrédient/composant ou de
 * menu item) — même convention que ElementInventory (persistance par nom).
 */
@Injectable()
export class LogisticsService {
  private readonly logger = new Logger(LogisticsService.name);

  constructor(
    private readonly prisma: PrismaService,
    // QueueService vient de QueueModule (@Global()) — pas besoin de l'importer dans
    // LogisticsModule. Volontairement pas AggregationService : LogisticsModule est
    // importé par SpacesModule, et AggregationModule → MappingsModule → SpacesModule
    // fermerait un cycle (même raison documentée dans
    // weezevent/services/webhook-event.handler.ts).
    private readonly queueService: QueueService,
    // Queue dédiée, enregistrée localement dans LogisticsModule (pas dans le QueueModule
    // global) — même pattern que AggregationModule pour AGGREGATION. Pilote le Job
    // Scheduler BullMQ (upsertJobScheduler/removeJobScheduler) des runs d'auto-simulation.
    @InjectQueue(QUEUES.SIMULATION) private readonly simulationQueue: Queue<SimulationTickJobData>,
    // Source de vérité prix (shared/pricing) : simulateSale doit facturer le prix
    // DataFriday de l'ESPACE courant (SpaceMenuItem.priceTtc → MenuItem.basePrice),
    // pas le prix du produit Weezevent mappé (cf. §ci-dessous, simulateSale).
    private readonly pricingService: MenuItemPricingService,
    private readonly spaceAccess: SpaceAccessService,
  ) {}

  /** Lève 403 si `user` n'a pas accès à cet espace (cf. SpaceAccessService). */
  private async assertSpaceAccess(spaceId: string | null | undefined, user?: SpaceScopedUser) {
    if (!user || !spaceId) return;
    if (this.spaceAccess.hasFullAccess(user)) return;
    const accessible = await this.spaceAccess.getAccessibleSpaceIds(user);
    if (accessible === 'ALL' || accessible.includes(spaceId)) return;
    throw new ForbiddenException("Vous n'avez pas accès à cet espace.");
  }

  // ─── Scoping / résolution d'éléments ─────────────────────────────────────────

  /** Fragment where : SpaceElement appartenant au tenant (v1 floor/forecourt/externalMerch + v2 zone). */
  private tenantElementWhere(tenantId: string) {
    return {
      OR: [
        { floor: { config: { space: { tenantId } } } },
        { forecourt: { config: { space: { tenantId } } } },
        { externalMerch: { config: { space: { tenantId } } } },
        { zone: { space: { tenantId } } },
      ],
    } as any;
  }

  private async getElementOrThrow(elementId: string, tenantId: string, user?: SpaceScopedUser): Promise<ElementRef> {
    const el = await this.prisma.spaceElement.findFirst({
      where: { id: elementId, ...this.tenantElementWhere(tenantId) },
      select: {
        id: true,
        name: true,
        floor: { select: { config: { select: { spaceId: true } } } },
        forecourt: { select: { config: { select: { spaceId: true } } } },
        externalMerch: { select: { config: { select: { spaceId: true } } } },
        zone: { select: { spaceId: true } },
      },
    } as any);
    if (!el) throw new NotFoundException(`Element ${elementId} not found`);
    const anyEl = el as any;
    const spaceId: string | null =
      anyEl.floor?.config?.spaceId ??
      anyEl.forecourt?.config?.spaceId ??
      anyEl.externalMerch?.config?.spaceId ??
      anyEl.zone?.spaceId ??
      null;
    if (!spaceId) throw new NotFoundException(`Element ${elementId} has no space`);
    await this.assertSpaceAccess(spaceId, user);
    return { id: anyEl.id, name: anyEl.name, spaceId };
  }

  /** Tous les éléments (PDV + storages) d'un espace du tenant. */
  private async getSpaceElementIds(spaceId: string, tenantId: string): Promise<string[]> {
    const rows = await this.prisma.spaceElement.findMany({
      where: {
        OR: [
          { floor: { config: { space: { id: spaceId, tenantId } } } },
          { forecourt: { config: { space: { id: spaceId, tenantId } } } },
          { externalMerch: { config: { space: { id: spaceId, tenantId } } } },
          { zone: { space: { id: spaceId, tenantId } } },
        ],
      } as any,
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  private async assertSpace(spaceId: string, tenantId: string, user?: SpaceScopedUser) {
    const space = await this.prisma.space.findFirst({
      where: { id: spaceId, tenantId },
      select: { id: true },
    });
    if (!space) throw new NotFoundException(`Space ${spaceId} not found`);
    await this.assertSpaceAccess(spaceId, user);
  }

  // ─── Casse de pack / normalisation ───────────────────────────────────────────

  /**
   * Normalise un niveau (packed, loose) : un vrac négatif emprunte des packs
   * (packed −1, loose += unitsPerPack) tant que possible, puis clamp ≥ 0.
   * Le vrac excédentaire n'est jamais re-packé (le vrac reste du vrac).
   */
  normalizeLevel(packed: number, loose: number, unitsPerPack?: number | null) {
    const upp = unitsPerPack && unitsPerPack > 0 ? unitsPerPack : null;
    if (upp && loose < -1e-9 && packed > 0) {
      const needed = Math.ceil((-loose - 1e-9) / upp);
      const borrowed = Math.min(packed, needed);
      packed -= borrowed;
      loose += borrowed * upp;
    }
    if (packed < 0) packed = 0;
    if (loose < -1e-9) loose = 0;
    return { packed, loose: Math.round(loose * 100) / 100 };
  }

  /**
   * Applique un delta signé sur le StockLevel d'un (élément × item), avec casse de
   * pack. `strict` (mouvements manuels) : refuse un delta qui rendrait le niveau
   * négatif — sinon le clamp à 0 désynchroniserait ledger et niveaux (un transfert
   * depuis un élément vide créerait du stock ex nihilo sur la destination).
   */
  private async applyLevelDelta(
    tx: Prisma.TransactionClient,
    tenantId: string,
    element: ElementRef,
    itemKey: string,
    packedDelta: number,
    looseDelta: number,
    unitsPerPack: number | null,
    marketPriceId: string | null,
    strict = false,
  ) {
    const existing = await tx.stockLevel.findUnique({
      where: { uniq_stock_level: { tenantId, elementId: element.id, itemKey } },
    });
    const upp = unitsPerPack ?? existing?.unitsPerPack ?? null;
    const rawPacked = (existing?.packedUnits ?? 0) + packedDelta;
    const rawLoose = (existing?.looseUnits ?? 0) + looseDelta;
    if (strict && (packedDelta < 0 || looseDelta < 0)) {
      const uppOrOne = upp && upp > 0 ? upp : null;
      const insufficient = uppOrOne
        ? rawPacked * uppOrOne + rawLoose < -1e-9 || rawPacked < 0
        : rawPacked < 0 || rawLoose < -1e-9;
      if (insufficient) {
        throw new BadRequestException(
          `Stock insuffisant sur « ${element.name} » pour « ${itemKey} » ` +
            `(disponible : ${existing?.packedUnits ?? 0} packs, ${existing?.looseUnits ?? 0} vrac)`,
        );
      }
    }
    const next = this.normalizeLevel(rawPacked, rawLoose, upp);
    if (existing) {
      return tx.stockLevel.update({
        where: { id: existing.id },
        data: {
          packedUnits: next.packed,
          looseUnits: next.loose,
          unitsPerPack: upp,
          marketPriceId: marketPriceId ?? existing.marketPriceId,
        },
      });
    }
    return tx.stockLevel.create({
      data: {
        tenantId,
        spaceId: element.spaceId,
        elementId: element.id,
        itemKey,
        packedUnits: next.packed,
        looseUnits: next.loose,
        unitsPerPack: upp,
        marketPriceId,
      },
    });
  }

  /**
   * Résout le pack size (unitsPerPack) d'une denrée par son `itemKey` (= nom du
   * référentiel), tous kinds confondus — miroir des sources utilisées par
   * `itemRefsForMenuItem` pour construire le référentiel `/stock` : MarketPrice
   * (ingredient), MenuComponent (component), MenuItem.inventoryNumberOfUnits
   * (product, readyForSale='Yes'). Sert de repli quand aucun `marketPriceId` n'est
   * fourni au mouvement — le seul cas où `createMovement` pouvait auparavant
   * apprendre `unitsPerPack` (BUG-033/049).
   */
  async resolveUnitsPerPackForItemKey(itemKey: string, tenantId: string): Promise<number | null> {
    const name = String(itemKey ?? '').trim();
    if (!name) return null;

    const mp = await this.prisma.marketPrice.findFirst({
      where: { tenantId, deletedAt: null, itemName: { equals: name, mode: 'insensitive' } },
      select: { packedUnits: true },
    });
    if (mp?.packedUnits) return mp.packedUnits;

    const comp = await this.prisma.menuComponent.findFirst({
      where: { tenantId, deletedAt: null, name: { equals: name, mode: 'insensitive' } },
      select: { packedUnits: true },
    });
    if (comp?.packedUnits) return comp.packedUnits;

    const mi = await this.prisma.menuItem.findFirst({
      where: { tenantId, deletedAt: null, name: { equals: name, mode: 'insensitive' } },
      select: { inventoryNumberOfUnits: true },
    });
    return mi?.inventoryNumberOfUnits ?? null;
  }

  // ─── POST /logistics/movements ───────────────────────────────────────────────

  async createMovement(dto: CreateMovementDto, tenantId: string, userId?: string) {
    if ((dto.packed ?? 0) === 0 && (dto.loose ?? 0) === 0) {
      throw new BadRequestException('Quantité nulle : packed ou loose doit être > 0');
    }
    const isTransfer = dto.reason === 'TRANSFER_SHOP' || dto.reason === 'TRANSFER_STORAGE';
    if (dto.reason === 'DELIVERY' && dto.direction !== 'add') {
      throw new BadRequestException('DELIVERY est réservé aux ajouts');
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

    const element = await this.getElementOrThrow(dto.elementId, tenantId);
    if (element.spaceId !== dto.spaceId) {
      throw new BadRequestException(`Element ${dto.elementId} n'appartient pas à l'espace ${dto.spaceId}`);
    }
    let counterparty: ElementRef | null = null;
    if (isTransfer) {
      counterparty = await this.getElementOrThrow(dto.counterpartyElementId!, tenantId);
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
      const itemKeyName = String(dto.itemKey ?? '').trim().toLowerCase();
      const mpItemName = String(mp.itemName ?? '').trim().toLowerCase();
      if (!mpItemName || mpItemName !== itemKeyName) {
        throw new BadRequestException(
          `Market price ${dto.marketPriceId} ne correspond pas à l'item ${dto.itemKey}`,
        );
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
      unitsPerPack = await this.resolveUnitsPerPackForItemKey(dto.itemKey, tenantId);
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
    const base = {
      tenantId,
      spaceId: dto.spaceId,
      itemKey: dto.itemKey,
      menuItemId: dto.menuItemId ?? null,
      marketPriceId: dto.marketPriceId ?? null,
      reason: dto.reason as StockMovementReason,
      transferGroupId,
      expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : null,
      note: dto.note?.trim() || null,
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
      const level = await this.applyLevelDelta(
        tx, tenantId, element, dto.itemKey, packedDelta, looseDelta, unitsPerPack, dto.marketPriceId ?? null, true,
      );
      return { movement, level, counterpartyLevel: null as any };
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

    const counterparty = await this.getElementOrThrow(source.counterpartyElementId, tenantId);
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
      unitsPerPack = await this.resolveUnitsPerPackForItemKey(source.itemKey, tenantId);
    }

    const round2 = (n: number) => Math.round(n * 100) / 100;
    const missingPacked = declaredPacked - confirmedPacked;
    const missingLoose = round2(declaredLoose - confirmedLoose);
    const hasLoss = missingPacked > 0 || missingLoose > 0;

    return this.prisma.$transaction(async (tx) => {
      await tx.stockMovement.create({
        data: {
          tenantId,
          spaceId: source.spaceId,
          elementId: counterparty.id,
          itemKey: source.itemKey,
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
      const counterpartyLevel = await this.applyLevelDelta(
        tx, tenantId, counterparty, source.itemKey, confirmedPacked, confirmedLoose, unitsPerPack, source.marketPriceId, true,
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

  // ─── Pertes de transfert (BUG-259-02) ─────────────────────────────────────────
  // Section "Pertes" dédiée (distincte de Réconciliation, qui modélise un écart de
  // COMPTAGE) : une ligne par transfert confirmé avec une quantité reçue inférieure
  // à la quantité déclarée à l'émission. `archivedAt` = "vidée" par un utilisateur,
  // jamais supprimée (piste d'audit), seulement masquée de la liste active.

  /** Résumé : nombre de pertes + quantités perdues (packs/vrac), actives par défaut. */
  async getLossesSummary(spaceId: string, tenantId: string, includeArchived = false) {
    await this.assertSpace(spaceId, tenantId);
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
    await this.assertSpace(spaceId, tenantId);
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
    await this.assertSpace(spaceId, tenantId);
    const res = await this.prisma.stockTransferLoss.updateMany({
      where: { tenantId, spaceId, archivedAt: null },
      data: { archivedAt: new Date(), archivedBy: userId ?? null },
    });
    return { archivedCount: res.count };
  }

  /** CSV de toutes les pertes (actives + archivées) d'un espace, pour "tout télécharger". */
  async exportLossesCsv(spaceId: string, tenantId: string) {
    await this.assertSpace(spaceId, tenantId);
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

  // ─── Référentiel des items par élément (PDV + Storage) ───────────────────────
  // Remplace l'ancien chemin front (useInventoryData + catalogues complets
  // ingredients/menu-items/market-prices) : le backend a déjà toutes les données
  // pour ne renvoyer QUE les denrées suivies par CET espace, nommées, sans dump
  // de catalogue tenant-wide.
  // readyForSale=Yes → toujours l'article lui-même (packedUnits/inventoryPackaging
  // propres si présents), SANS exception pour le cas mono-ingrédient (BUG-048 :
  // un item readyForSale=Yes n'est plus jamais fondu dans la Market Price de son
  // ingrédient — même règle appliquée à `explodeSalesToConsumption`/`perUnit`
  // (ventes) et à `buildConsolidatedInventory` côté front, les trois restent
  // alignés). readyForSale=No → explosion ingrédients + composants (combo déplié
  // par nom, profondeur ≤ 4) ; un composant qui n'est pas un combo est lui-même
  // déplié en ses propres ingrédients/sous-composants si son readyForSale est
  // "No" (sinon compté par son propre nom + son propre packaging).
  // Différence volontaire avec perUnit : le packaging (jamais consommé à la
  // vente) est ICI ajouté en lignes directes (non récursif), pour rester suivi
  // manuellement — miroir de buildConsolidatedInventory (front, non modifié).

  private recipeSelect() {
    return {
      id: true,
      name: true,
      picture: true,
      readyForSale: true,
      comboItem: true,
      numberOfPiecesRecipe: true,
      inventoryPackagingType: true,
      inventoryNumberOfUnits: true,
      inventoryUnit: true,
      ingredients: {
        select: {
          numberOfUnits: true,
          ingredient: {
            select: {
              id: true,
              name: true,
              recipeUnit: true,
              marketPrice: { select: { id: true, itemName: true, packedUnits: true, inventoryPackaging: true } },
            },
          },
        },
      },
      components: {
        select: {
          numberOfUnits: true,
          component: { select: this.componentSelect() },
        },
      },
      packagings: {
        select: {
          numberOfUnits: true,
          packaging: { select: { id: true, name: true, recipeUnit: true } },
        },
      },
    } as const;
  }

  /**
   * Recette complète d'un Component (MenuComponent), pour le dépliage récursif
   * readyForSale=No (ingrédients + sous-composants). `children` n'est chargé qu'à
   * un niveau : les petits-enfants sont résolus par élargissement itératif dans
   * `loadRecipeContext` (mêmes contraintes que le Prisma `select` statique pour les
   * combos menu item — pas de récursion arbitraire dans une seule requête).
   */
  private componentSelect() {
    return {
      id: true,
      name: true,
      unit: true,
      readyForSale: true,
      packedUnits: true,
      inventoryPackaging: true,
      numberOfUnitsRecipe: true,
      ingredients: {
        select: {
          quantity: true,
          ingredient: {
            select: {
              id: true,
              name: true,
              recipeUnit: true,
              marketPrice: { select: { id: true, itemName: true, packedUnits: true, inventoryPackaging: true } },
            },
          },
        },
      },
      children: {
        select: {
          quantity: true,
          child: { select: { id: true, name: true, unit: true } },
        },
      },
    } as const;
  }

  /** Config effective d'un élément (miroir SpaceMenusService.resolveShopConfigId). */
  private resolveElementConfigId(
    el: { floor?: any; forecourt?: any; externalMerch?: any; configurationElements?: any[] },
    explicitConfigId?: string | null,
  ): string | null {
    if (explicitConfigId) return explicitConfigId;
    const v1Config = el.floor?.config ?? el.forecourt?.config ?? el.externalMerch?.config;
    return v1Config?.id ?? el.configurationElements?.[0]?.configId ?? null;
  }

  /**
   * Charge les menu items (ids demandés + combos référencés par nom, profondeur ≤ 4)
   * avec leur recette complète, et résout les market prices par nom d'ingrédient
   * pour ceux sans lien direct — mêmes requêtes ciblées que explodeSalesToConsumption,
   * en PARALLÈLE (indépendant : pas de risque de désync des ventes, code dupliqué
   * à dessein pour ne jamais toucher au chemin ventes déjà validé en prod).
   */
  private async loadRecipeContext(seedItems: any[], tenantId: string): Promise<RecipeCtx> {
    if (!seedItems.length) {
      return { comboByName: new Map(), mpByName: new Map(), componentById: new Map(), itemRefsCache: new Map(), componentRefsCache: new Map() };
    }
    const select = this.recipeSelect();
    const comboByName = new Map<string, any>();
    let frontier = seedItems;
    for (let depth = 0; depth < 4 && frontier.length; depth++) {
      const wantedNames = new Set<string>();
      for (const item of frontier) {
        for (const line of item.components) {
          const name = line.component?.name?.trim();
          if (name && !comboByName.has(name.toLowerCase())) wantedNames.add(name);
        }
      }
      if (!wantedNames.size) break;
      const candidates = await this.prisma.menuItem.findMany({
        where: { tenantId, deletedAt: null, name: { in: [...wantedNames] } },
        select,
      });
      // BUG-002/Q18 (Bertrand, 2026-07-24) : comboItem='Yes' explose TOUJOURS en
      // ses constituants, indépendamment de son propre readyForSale — ne plus
      // exiger readyForSale='No' en plus de comboItem='Yes'.
      frontier = candidates.filter((c) => this.normYesNo(c.comboItem) === 'Yes');
      for (const c of frontier) comboByName.set(c.name.trim().toLowerCase(), c);
    }

    const unresolvedNames = new Set<string>();
    for (const item of [...seedItems, ...comboByName.values()]) {
      if (this.normYesNo(item.readyForSale) === 'Yes' && item.ingredients.length === 1) {
        const ing = item.ingredients[0].ingredient;
        if (ing?.name && !ing.marketPrice) unresolvedNames.add(ing.name.trim());
      }
    }
    const mpByName = new Map<string, { id: string; itemName: string; packedUnits: number | null; inventoryPackaging: string | null }>();
    if (unresolvedNames.size) {
      const rows = await this.prisma.marketPrice.findMany({
        where: { tenantId, deletedAt: null, itemName: { in: [...unresolvedNames] } },
        select: { id: true, itemName: true, packedUnits: true, inventoryPackaging: true },
      });
      for (const mp of rows) mpByName.set(mp.itemName.trim().toLowerCase(), mp);
    }

    // Components (readyForSale=No à déplier) : élargissement itératif du graphe
    // ComponentComponent PAR ID (relation réelle, contrairement au combo menu item
    // matché par nom) — profondeur bornée + Set visité, un cycle parent/enfant
    // n'est jamais garanti impossible en base.
    const componentById = new Map<string, any>();
    const componentIds = new Set<string>();
    for (const item of [...seedItems, ...comboByName.values()]) {
      for (const line of item.components ?? []) {
        const comp = line.component;
        if (comp?.id) {
          componentIds.add(comp.id);
          if (!componentById.has(comp.id)) componentById.set(comp.id, comp);
        }
      }
    }
    const visited = new Set<string>(componentIds);
    let componentFrontier = [...componentIds];
    for (let depth = 0; depth < 4 && componentFrontier.length; depth++) {
      const childIds = new Set<string>();
      for (const id of componentFrontier) {
        for (const line of componentById.get(id)?.children ?? []) {
          const childId = line.child?.id;
          if (childId && !visited.has(childId)) childIds.add(childId);
        }
      }
      if (!childIds.size) break;
      const rows = await this.prisma.menuComponent.findMany({
        where: { id: { in: [...childIds] }, tenantId, deletedAt: null },
        select: this.componentSelect(),
      });
      for (const c of rows) {
        componentById.set(c.id, c);
        visited.add(c.id);
      }
      componentFrontier = rows.map((c) => c.id);
    }

    return { comboByName, mpByName, componentById, itemRefsCache: new Map(), componentRefsCache: new Map() };
  }

  /** Lignes de stock (référentiel) contribuées par UN menu item, recette dépliée. */
  private itemRefsForMenuItem(item: any, ctx: RecipeCtx, depth = 0): ItemRef[] {
    const cacheKey = `${item.id}:${depth}`;
    const cached = ctx.itemRefsCache.get(cacheKey);
    if (cached) return cached;
    const refs: ItemRef[] = [];
    for (const line of item.packagings ?? []) {
      const pkg = line.packaging;
      const name = pkg?.name?.trim();
      if (!name) continue;
      refs.push({ key: name, id: pkg.id, kind: 'packaging', unit: pkg.recipeUnit ?? null, marketPriceId: null, unitsPerPack: null, packagingType: null, picture: null });
    }

    const isCombo = this.normYesNo(item.comboItem) === 'Yes';
    if (!isCombo && this.normYesNo(item.readyForSale) === 'Yes') {
      // readyForSale=Yes prime toujours sur lui-même, sans exception pour le cas
      // mono-ingrédient (BUG-048) : un item readyForSale=Yes n'est JAMAIS fondu
      // dans la Market Price de son ingrédient, même si sa recette n'en a qu'un
      // seul — il est compté comme son propre produit, avec son propre packaging
      // (inventoryPackagingType/inventoryNumberOfUnits/inventoryUnit). Exception :
      // comboItem='Yes' (BUG-002/Q18 Bertrand, 2026-07-24) explose TOUJOURS en ses
      // constituants, indépendamment de son propre readyForSale — cf. `isCombo` ci-dessus.
      const selfName = item.name?.trim();
      if (selfName) {
        refs.push({
          key: selfName, id: item.id, kind: 'product', unit: item.inventoryUnit ?? null, marketPriceId: null,
          unitsPerPack: item.inventoryNumberOfUnits ?? null, packagingType: item.inventoryPackagingType ?? null, picture: item.picture ?? null,
        });
      }
      ctx.itemRefsCache.set(cacheKey, refs);
      return refs;
    }

    // readyForSale = No (ou non défini), OU comboItem='Yes' (toujours exploser,
    // BUG-002/Q18) : ingrédients directs + composants (combo récursif par nom,
    // packaging déjà traité au-dessus, non récursif).
    let leafCount = 0;
    for (const line of item.ingredients ?? []) {
      const ing = line.ingredient;
      const name = ing?.name?.trim();
      if (!name) continue;
      const mp = ing.marketPrice ?? ctx.mpByName.get(name.toLowerCase());
      refs.push({
        key: name, id: mp?.id ?? ing.id, kind: 'ingredient', unit: ing.recipeUnit ?? null,
        marketPriceId: mp?.id ?? null, unitsPerPack: mp?.packedUnits ?? null, packagingType: mp?.inventoryPackaging ?? null, picture: null,
      });
      leafCount++;
    }
    for (const line of item.components ?? []) {
      const comp = line.component;
      const name = comp?.name?.trim();
      if (!name) continue;
      const combo = depth < 4 ? ctx.comboByName.get(name.toLowerCase()) : null;
      if (combo) {
        refs.push(...this.itemRefsForMenuItem(combo, ctx, depth + 1));
      } else {
        const fullComp = ctx.componentById.get(comp.id) ?? comp;
        refs.push(...this.componentRefsForComponent(fullComp, ctx));
      }
      leafCount++;
    }

    if (leafCount === 0 && !(item.packagings ?? []).length) {
      const selfName = item.name?.trim();
      if (selfName) {
        refs.push({
          key: selfName, id: item.id, kind: 'product', unit: item.inventoryUnit ?? null, marketPriceId: null,
          unitsPerPack: item.inventoryNumberOfUnits ?? null, packagingType: item.inventoryPackagingType ?? null, picture: item.picture ?? null,
        });
      }
    }
    ctx.itemRefsCache.set(cacheKey, refs);
    return refs;
  }

  /**
   * Ligne de stock représentant UN Component. Depuis la décision Q13
   * (QUESTIONS_A_BERTRAND.md, 2026-08-04 : "on ne décompose plus un composant, ni
   * au stock-up, ni à l'inventaire, ni au réarmement") un Component n'est plus
   * jamais exploré au-delà de lui-même — il est tracké/transféré tel quel, comme
   * l'Inventaire (`inventoryUtils.js`) et le Réarmement (`stockPlanning.js`) le font
   * déjà. BUG-260-02 (2026-08-13) : l'ancienne garde `readyForSale==='Yes'` ne se
   * déclenchait jamais en pratique (0 des 81 Component en base n'ont ce flag à
   * 'Yes' — il n'a de sens que pour un MenuItem, pas pour un sous-composant qui
   * n'est par construction jamais vendu directement) et explosait donc
   * systématiquement le composant en ses ingrédients bruts.
   */
  private componentRefsForComponent(comp: any, ctx: RecipeCtx, depth = 0, visited: Set<string> = new Set()): ItemRef[] {
    const name = comp?.name?.trim();
    if (!name) return [];
    const cacheKey = `${comp.id}:${depth}`;
    const cached = ctx.componentRefsCache.get(cacheKey);
    if (cached) return cached;
    const leaf: ItemRef[] = [{
      key: name, id: comp.id, kind: 'component', unit: comp.unit ?? null, marketPriceId: null,
      unitsPerPack: comp.packedUnits ?? null, packagingType: comp.inventoryPackaging ?? null, picture: null,
    }];
    ctx.componentRefsCache.set(cacheKey, leaf);
    return leaf;
  }

  /** Agrège les refs de plusieurs menu items en items de référentiel (1re valeur non nulle gagne). */
  private aggregateItems(
    menuItems: Array<{ id: string; name: string }>,
    byId: Map<string, any>,
    ctx: RecipeCtx,
  ): Map<string, ElementItem> {
    const map = new Map<string, ElementItem>();
    for (const mi of menuItems) {
      const full = byId.get(mi.id);
      if (!full) continue;
      for (const ref of this.itemRefsForMenuItem(full, ctx)) {
        let entry = map.get(ref.key);
        if (!entry) {
          entry = { name: ref.key, id: ref.id, kind: ref.kind, unit: ref.unit, marketPriceId: ref.marketPriceId, unitsPerPack: ref.unitsPerPack, packagingType: ref.packagingType, picture: ref.picture, usedIn: [] };
          map.set(ref.key, entry);
        }
        if (!entry.usedIn.some((u) => u.id === mi.id)) {
          entry.usedIn.push({ id: mi.id, name: mi.name });
        }
      }
    }
    return map;
  }

  /**
   * Éléments (PDV + Storage) de l'espace avec leur référentiel d'items. Storage =
   * union des items des shops liés (`attributes.selectedShops`), miroir exact du
   * comportement front actuel (buildStorageInventory ne fait pas de filtre par
   * sous-type de storage côté Logistic — non reproduit ici, à vérifier en test réel).
   */
  /** Fragment where : SpaceElement appartenant à CET espace (v1 floor/forecourt/externalMerch + v2 zone). */
  private spaceElementScopeWhere(spaceId: string, tenantId: string) {
    return {
      OR: [
        { floor: { config: { space: { id: spaceId, tenantId } } } },
        { forecourt: { config: { space: { id: spaceId, tenantId } } } },
        { externalMerch: { config: { space: { id: spaceId, tenantId } } } },
        { zone: { space: { id: spaceId, tenantId } } },
      ],
    } as any;
  }

  private async getSpaceElementsWithItems(spaceId: string, tenantId: string, configId?: string) {
    const rows = await this.prisma.spaceElement.findMany({
      where: this.spaceElementScopeWhere(spaceId, tenantId),
      select: {
        id: true,
        name: true,
        type: true,
        attributes: true,
        floor: { select: { config: { select: { id: true } } } },
        forecourt: { select: { config: { select: { id: true } } } },
        externalMerch: { select: { config: { select: { id: true } } } },
        configurationElements: { select: { configId: true }, orderBy: { createdAt: 'asc' }, take: 1 },
        menuAssignments: { select: { menuItemId: true, enabled: true, configId: true } },
      },
    } as any);

    const shops = (rows as any[]).filter((r) => SHOP_TYPES.includes(r.type));
    const storages = (rows as any[]).filter((r) => r.type === 'storage');

    // Enabled menuItemIds par shop, scopés à la config effective de CE shop.
    const enabledByShop = new Map<string, string[]>();
    const allMenuItemIds = new Set<string>();
    for (const shop of shops) {
      const effectiveConfigId = this.resolveElementConfigId(shop, configId);
      const ids = [
        ...new Set<string>(
          (shop.menuAssignments ?? [])
            .filter((a: any) => (a.configId ?? null) === effectiveConfigId && a.enabled)
            .map((a: any) => String(a.menuItemId)),
        ),
      ];
      enabledByShop.set(shop.id, ids);
      for (const id of ids) allMenuItemIds.add(id);
    }

    const byId = new Map<string, any>();
    if (allMenuItemIds.size) {
      const select = this.recipeSelect();
      const items = await this.prisma.menuItem.findMany({
        where: { id: { in: [...allMenuItemIds] }, tenantId, deletedAt: null },
        select,
      });
      for (const it of items) byId.set(it.id, it);
    }
    // Réutilise la requête menu items déjà faite ci-dessus (seedItems) — pas de 2e
    // findMany identique pour résoudre les combos/market-prices.
    const ctx = await this.loadRecipeContext([...byId.values()], tenantId);

    // Un PDV sans aucun menu item activé (config effective) n'est pas « configuré »
    // dans Space Menu — miroir de l'ancien gate front (isOpen || menuItemsCount > 0) :
    // ne pas l'afficher du tout (pas juste à 0 denrée).
    const configuredShops = shops.filter((shop) => (enabledByShop.get(shop.id) ?? []).length > 0);

    // Provider (Weezevent/Digifood) par PDV — dérivé de la même jointure que
    // simulateSale (LocationShopMapping → SalesLocation.provider). Purement
    // informatif (ex. badge dans le picker « simuler une vente ») : absent si le
    // PDV n'est pas encore mappé, sans impact sur le reste de la réponse.
    const providerByElementId = await this.getProviderByShopElementId(
      configuredShops.map((s) => s.id),
      tenantId,
    );

    const itemMapByShop = new Map<string, Map<string, ElementItem>>();
    const elements: Array<{ id: string; name: string; type: string; items: ElementItem[]; provider?: string | null }> = [];
    for (const shop of configuredShops) {
      const ids = enabledByShop.get(shop.id) ?? [];
      const menuItems = ids.map((id) => byId.get(id)).filter(Boolean).map((mi: any) => ({ id: mi.id, name: mi.name }));
      const map = this.aggregateItems(menuItems, byId, ctx);
      itemMapByShop.set(shop.id, map);
      elements.push({
        id: shop.id,
        name: shop.name,
        type: shop.type,
        items: [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr')),
        provider: providerByElementId.get(shop.id) ?? null,
      });
    }

    for (const storage of storages) {
      const selectedShopIds: string[] = Array.isArray((storage.attributes as any)?.selectedShops)
        ? (storage.attributes as any).selectedShops.map(String)
        : [];
      const merged = new Map<string, ElementItem>();
      for (const shopId of selectedShopIds) {
        const shopMap = itemMapByShop.get(shopId);
        if (!shopMap) continue;
        for (const [key, item] of shopMap) {
          let entry = merged.get(key);
          if (!entry) {
            entry = { ...item, usedIn: [...item.usedIn] };
            merged.set(key, entry);
          } else {
            for (const u of item.usedIn) {
              if (!entry.usedIn.some((x) => x.id === u.id)) entry.usedIn.push(u);
            }
          }
        }
      }
      elements.push({ id: storage.id, name: storage.name, type: storage.type, items: [...merged.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr')) });
    }

    return elements;
  }

  /**
   * Provider (Weezevent/Digifood) par PDV, dérivé de LocationShopMapping → SalesLocation
   * (même jointure que simulateSale/purgeSimulatedSales). Purement informatif — sert au
   * front à afficher un badge dans le picker « simuler une vente » ; absent (`null`) si le
   * PDV n'est pas encore mappé à une location réelle.
   */
  private async getProviderByShopElementId(elementIds: string[], tenantId: string) {
    const result = new Map<string, string | null>();
    if (!elementIds.length) return result;
    const mappings = await this.prisma.locationShopMapping.findMany({
      where: { tenantId, spaceElementId: { in: elementIds } },
      select: { spaceElementId: true, salesLocationId: true },
    });
    if (!mappings.length) return result;
    const salesLocationIds = [...new Set(mappings.map((m) => m.salesLocationId))];
    const locations = await this.prisma.salesLocation.findMany({
      where: { tenantId, OR: [{ id: { in: salesLocationIds } }, { externalId: { in: salesLocationIds } }] },
      select: { id: true, externalId: true, provider: true },
    });
    const locationByKey = new Map<string, (typeof locations)[number]>();
    for (const loc of locations) {
      locationByKey.set(loc.id, loc);
      locationByKey.set(loc.externalId, loc);
    }
    for (const m of mappings) {
      const loc = locationByKey.get(m.salesLocationId);
      if (loc) result.set(m.spaceElementId, loc.provider);
    }
    return result;
  }

  /**
   * PDV simulables (≥1 menu item vendable, à prix réel, ET mappé à une intégration réelle)
   * — miroir server-side de `LiveSaleSimulatorWidget.vue::menuItemsForShop`/`pickRandom`,
   * pour le tick d'auto-simulation (`SimulationRunProcessor`). Filtre par `provider != null`
   * en plus (contrairement au picker manuel front, qui laisse l'utilisateur choisir puis
   * échouer proprement côté `simulateSale`) : un tick automatique ne doit pas accumuler
   * des erreurs évitables sur des PDV jamais mappés.
   *
   * Écarte aussi les menu items dont le `SalesProduct` mappé n'a pas de `basePrice` réel
   * (retour utilisateur 2026-08-03) : sur ce tenant, la majorité des produits synchronisés
   * n'ont jamais eu de prix saisi côté Weezevent — un tirage purement aléatoire produisait
   * presque toujours des ventes à 0€, noyant les rares tirages à prix réel. Uniquement pour
   * l'auto-run ; le picker manuel du widget QA n'est pas concerné (utile pour tester la
   * déduction de stock indépendamment du prix).
   */
  async getSimulableShops(spaceId: string, tenantId: string, configId?: string) {
    const elements = await this.getSpaceElementsWithItems(spaceId, tenantId, configId);
    const shops = elements
      .filter((e) => e.type !== 'storage' && e.provider)
      .map((e) => {
        const ids = new Set<string>();
        for (const item of e.items) for (const u of item.usedIn) ids.add(u.id);
        return { id: e.id, name: e.name, menuItemIds: [...ids] };
      });

    const allMenuItemIds = [...new Set(shops.flatMap((s) => s.menuItemIds))];
    if (!allMenuItemIds.length) return shops;

    // Éligibilité "simulable" alignée sur simulateSale (même raison ci-dessous) : il
    // faut un mapping Weezevent (simulateSale a besoin d'un salesProductId pour la
    // ligne de vente), mais le PRIX qui détermine si l'item est simulable est
    // désormais le prix catalogue DataFriday de l'ESPACE courant (SpaceMenuItem.priceTtc
    // → MenuItem.basePrice), pas SalesProduct.basePrice — un menu item peut être mappé
    // à un produit Weezevent au prix incomplet alors que son prix catalogue est sain.
    const [mappings, menuItems, spaceMenuItems] = await Promise.all([
      this.prisma.productMapping.findMany({
        where: { tenantId, menuItemId: { in: allMenuItemIds } },
        select: { menuItemId: true },
      }),
      this.prisma.menuItem.findMany({
        where: { id: { in: allMenuItemIds }, tenantId, deletedAt: null },
        select: { id: true, basePrice: true },
      }),
      this.prisma.spaceMenuItem.findMany({ where: { spaceId, menuItemId: { in: allMenuItemIds } } }),
    ]);
    const mappedMenuItemIds = new Set(mappings.map((m) => m.menuItemId));
    const spaceOverrideById = new Map(spaceMenuItems.map((s) => [s.menuItemId, s]));
    const pricedMenuItemIds = new Set(
      menuItems
        .filter((mi) => mappedMenuItemIds.has(mi.id) && Number(spaceOverrideById.get(mi.id)?.priceTtc ?? mi.basePrice) > 0)
        .map((mi) => mi.id),
    );

    return shops.map((s) => ({ ...s, menuItemIds: s.menuItemIds.filter((id) => pricedMenuItemIds.has(id)) }));
  }

  /** Market prices candidats pour le dropdown du popup +/− (itemKey donné, sans le catalogue complet). */
  async getMarketPricesForItem(spaceId: string, tenantId: string, itemKey: string) {
    await this.assertSpace(spaceId, tenantId);
    const name = String(itemKey ?? '').trim();
    if (!name) return [];
    const rows = await this.prisma.marketPrice.findMany({
      where: {
        tenantId,
        deletedAt: null,
        OR: [{ itemName: { equals: name, mode: 'insensitive' } }, { itemName: { contains: name, mode: 'insensitive' } }],
      },
      select: {
        id: true,
        itemName: true,
        supplier: true,
        supplierItem: true,
        supplierRel: { select: { name: true } },
      },
      take: 20,
    });
    // Correspondance exacte d'abord (dropdown pré-trié comme avant, cf. LogisticMovementDialog).
    rows.sort((a, b) => {
      const aExact = a.itemName.trim().toLowerCase() === name.toLowerCase() ? 0 : 1;
      const bExact = b.itemName.trim().toLowerCase() === name.toLowerCase() ? 0 : 1;
      return aExact - bExact;
    });
    // Nom fournisseur : la relation supplierRel prime (source de vérité du module
    // Market Prices — cf. market-prices.service.ts), le champ texte `supplier` en repli.
    return rows.map((r) => ({
      id: r.id,
      itemName: r.itemName,
      supplierItem: r.supplierItem,
      supplier: r.supplierRel?.name ?? r.supplier ?? null,
    }));
  }

  // ─── GET /logistics/:spaceId/stock ───────────────────────────────────────────

  async getStock(spaceId: string, tenantId: string, configId?: string, eventId?: string) {
    const space = await this.prisma.space.findFirst({ where: { id: spaceId, tenantId }, select: { id: true, name: true } });
    if (!space) throw new NotFoundException(`Space ${spaceId} not found`);

    const [configurations, event, allLevels, lastReco, firstMovement, elementIds] = await Promise.all([
      // Config n'a pas de tenantId propre (scoping via spaceId, déjà vérifié tenant plus haut).
      this.prisma.config.findMany({ where: { spaceId }, select: { id: true, name: true }, orderBy: { createdAt: 'asc' } }),
      eventId ? this.prisma.event.findFirst({ where: { id: eventId, spaceId, tenantId }, select: { configurationId: true } }) : null,
      this.prisma.stockLevel.findMany({ where: { tenantId, spaceId } }),
      this.prisma.stockReconciliation.findFirst({
        // kind:null = resets logistiques UNIQUEMENT. Les documents 'post-event'
        // (Post-event Inventory) partagent la table mais ne matérialisent PAS les
        // ventes en mouvements SALE — les laisser déplacer l'ancre réinjecterait
        // les ventes antérieures en stock fantôme au prochain calcul dérivé.
        where: { tenantId, spaceId, kind: null },
        orderBy: { createdAt: 'desc' },
        select: { id: true, createdAt: true, eventId: true },
      }),
      this.prisma.stockMovement.findFirst({
        where: { tenantId, spaceId },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
      this.getSpaceElementIds(spaceId, tenantId),
    ]);

    // Priorité : configId explicite (deep-link ?configuration=) > config de l'event
    // (deep-link ?event=, comme Space Inventory) > 1re configuration de l'espace.
    const inConfigs = (id: string | null | undefined) => !!id && configurations.some((c) => c.id === id);
    const resolvedConfigId =
      (inConfigs(configId) ? configId : null) ??
      (inConfigs(event?.configurationId) ? event!.configurationId : null) ??
      configurations[0]?.id ??
      null;

    // Ancre de dérivation des ventes : dernière réconciliation, sinon premier
    // mouvement (= activation de la logistique sur l'espace). Sans ancre, pas de
    // ventes décomptées (aucun stock suivi de toute façon).
    const anchorAt = lastReco?.createdAt ?? firstMovement?.createdAt ?? null;

    // Référentiel (PDV + Storage) et consommation dérivée des ventes sont
    // indépendants (aucun ne dépend du résultat de l'autre) — en parallèle plutôt
    // qu'en série pour ne pas payer deux fois la latence réseau DB.
    const [elementsWithItems, consumption] = await Promise.all([
      this.getSpaceElementsWithItems(spaceId, tenantId, resolvedConfigId ?? undefined),
      anchorAt && elementIds.length
        ? this.deriveSalesRaw(tenantId, elementIds, anchorAt).then((raw) => this.explodeSalesToConsumption(raw, tenantId))
        : Promise.resolve([] as Array<{ elementId: string; itemKey: string; quantity: number }>),
    ]);

    // Niveaux pointant vers des SpaceElement disparus (le saveConfiguration v1 fait
    // du delete+recreate) : masqués — sinon la vue affiche des lignes fantômes que
    // le reset rejette ensuite (element hors espace).
    const currentIds = new Set(elementIds);
    const levels = allLevels.filter((l) => currentIds.has(l.elementId));

    // Un mouvement (ex. transfert) peut viser un élément qui ne vend pas cette
    // denrée sur son propre menu (référentiel vide pour cet itemKey) — le niveau
    // existe quand même en base. Sans ce filet, ce stock devient invisible côté
    // élément receveur/donneur (« le produit a disparu ») alors qu'il est bien là.
    // On complète chaque élément avec les niveaux orphelins, en ligne minimale.
    for (const el of elementsWithItems) {
      const known = new Set(el.items.map((it) => it.name));
      for (const level of levels) {
        if (level.elementId !== el.id || known.has(level.itemKey)) continue;
        el.items.push({
          name: level.itemKey,
          id: level.itemKey,
          kind: 'product',
          unit: null,
          marketPriceId: level.marketPriceId ?? null,
          unitsPerPack: level.unitsPerPack ?? null,
          packagingType: null,
          picture: null,
          usedIn: [],
        });
        known.add(level.itemKey);
      }
      el.items.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    }

    return {
      spaceId,
      space,
      configurations,
      resolvedConfigId,
      anchor: anchorAt ? { at: anchorAt, reconciliationId: lastReco?.id ?? null } : null,
      elements: elementsWithItems,
      levels,
      consumption,
    };
  }

  /**
   * Onglet Inventaire live du module Live (question #22 du tracker front, tranchée 2026-07-23) :
   * combinaison mouvements Restock (StockLevel) + décrément par vente en temps réel (consumption),
   * exactement le calcul de `getStock` — pas de source/formule neuve, juste reformaté en deux
   * arbres. Granularité : celle par défaut de `readyForSale` (comme le Réarmement), pas d'override.
   * Pas de configId/eventId : Live veut "maintenant", pas un instantané historique.
   *
   * Le "restant" (packedUnits/looseUnits moins consumedLoose) reste calculé côté front, comme pour
   * `getStock` (`store/modules/logistics.js`) — pas de formule dupliquée ici.
   */
  async getLiveInventory(spaceId: string, tenantId: string) {
    const { elements, levels, consumption } = await this.getStock(spaceId, tenantId);

    const levelByKey = new Map(levels.map((l) => [`${l.elementId}::${l.itemKey}`, l]));
    const consumedByKey = new Map(consumption.map((c) => [`${c.elementId}::${c.itemKey}`, c.quantity]));

    const shops = elements
      .filter((el) => SHOP_TYPES.includes(el.type))
      .map((el) => ({
        shopId: el.id,
        shopName: el.name,
        items: el.items.map((item) => {
          const level = levelByKey.get(`${el.id}::${item.name}`);
          return {
            itemKey: item.name,
            unit: item.unit ?? null,
            packedUnits: level?.packedUnits ?? 0,
            looseUnits: level?.looseUnits ?? 0,
            unitsPerPack: level?.unitsPerPack ?? item.unitsPerPack ?? null,
            marketPriceId: level?.marketPriceId ?? item.marketPriceId ?? null,
            consumedLoose: consumedByKey.get(`${el.id}::${item.name}`) ?? 0,
          };
        }),
      }));

    // Index inversé item → shops (11_LIVE.md §3.2) — n'existe nulle part ailleurs, seul vrai
    // travail neuf de ce chantier : les deux vues partagent la même donnée déjà assemblée ci-dessus.
    const itemsByKey = new Map<string, { itemKey: string; unit: string | null; shops: any[] }>();
    for (const shop of shops) {
      for (const item of shop.items) {
        let entry = itemsByKey.get(item.itemKey);
        if (!entry) {
          entry = { itemKey: item.itemKey, unit: item.unit, shops: [] };
          itemsByKey.set(item.itemKey, entry);
        }
        entry.shops.push({
          shopId: shop.shopId,
          shopName: shop.shopName,
          packedUnits: item.packedUnits,
          looseUnits: item.looseUnits,
          unitsPerPack: item.unitsPerPack,
          marketPriceId: item.marketPriceId,
          consumedLoose: item.consumedLoose,
        });
      }
    }

    return {
      shops,
      items: [...itemsByKey.values()].sort((a, b) => a.itemKey.localeCompare(b.itemKey, 'fr')),
    };
  }

  // ─── GET /logistics/element/:elementId/history ───────────────────────────────

  async getHistory(elementId: string, tenantId: string, limit = 50, cursor?: string, user?: SpaceScopedUser) {
    const element = await this.getElementOrThrow(elementId, tenantId, user);
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
      this.deriveSalesRaw(tenantId, [elementId], null),
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

  // ─── Dérivation des ventes (read-time) ───────────────────────────────────────

  /**
   * Quantités vendues par (élément, menu item, event) via les mappings Weezevent
   * (location → SpaceElement, produit → MenuItem), bornées par `since` (exclus).
   * - `status = 'V'` : seules les ventes validées (les W/C/R — attente/annulée/
   *   remboursée — ne consomment pas de stock), même filtre que les agrégats revenu.
   * - `deletedAt IS NULL` (BUG-110) : une transaction annulée après coup (webhook
   *   `delete`) ne doit pas non plus consommer de stock — même trou que BUG-108 sur
   *   `getEventTimelineBatch`, dupliqué ici car cette requête ne passe pas par la même
   *   jointure.
   * - Jointure location via WeezeventLocation avec OR (id interne OU weezeventId
   *   externe) : certains mappings historiques stockent l'id externe
   *   (même OR-join que builder-v2.service getSpaceShops).
   */
  private async deriveSalesRaw(tenantId: string, elementIds: string[], since: Date | null): Promise<SalesRawRow[]> {
    if (!elementIds.length) return [];
    const sinceFilter = since ? Prisma.sql`AND t."transactionDate" > ${since}` : Prisma.empty;
    const rows = await this.prisma.$queryRaw<SalesRawRow[]>(Prisma.sql`
      SELECT m."spaceElementId"          AS "elementId",
             pm."menuItemId"             AS "menuItemId",
             t."eventId"                 AS "eventId",
             MAX(t."eventName")          AS "eventName",
             SUM(ti."quantity")::float   AS "qty",
             MAX(t."transactionDate")    AS "lastAt"
      FROM "WeezeventTransactionItem" ti
      JOIN "WeezeventTransaction" t ON t."id" = ti."transactionId"
      JOIN "WeezeventLocation" wl ON wl."id" = t."locationId"
      JOIN "WeezeventLocationShopMapping" m
        ON m."tenantId" = t."tenantId"
        AND (m."weezeventLocationId" = wl."id" OR m."weezeventLocationId" = wl."weezeventId")
      JOIN "WeezeventProductMapping" pm
        ON pm."tenantId" = t."tenantId" AND pm."weezeventProductId" = ti."productId"
      WHERE t."tenantId" = ${tenantId}
        AND t."status" = 'V'
        AND t."deletedAt" IS NULL
        AND m."spaceElementId" IN (${Prisma.join(elementIds)})
        ${sinceFilter}
      GROUP BY 1, 2, 3
    `);
    return rows.map((r) => ({ ...r, qty: Number(r.qty ?? 0) }));
  }

  /** 'Yes'/'No' normalisé (mêmes règles que MenuItemsService.normYesNo). */
  private normYesNo(value: unknown): 'Yes' | 'No' | null {
    if (value === true) return 'Yes';
    if (value === false) return 'No';
    const s = String(value ?? '').trim().toLowerCase();
    if (s === 'yes' || s === 'true' || s === 'oui' || s === '1') return 'Yes';
    if (s === 'no' || s === 'false' || s === 'non' || s === '0') return 'No';
    return null;
  }

  /**
   * Explose les ventes en consommation par (élément × itemKey), en miroir du
   * référentiel front (buildConsolidatedInventory) :
   * - readyForSale=Yes → clé = nom du menu item ; 1 unité par vente. Sans exception
   *   pour le cas mono-ingrédient (BUG-048) : ne bascule plus jamais sur la Market
   *   Price de l'ingrédient, même à ingrédient unique.
   * - readyForSale=No → explosion de recette : ingrédients + composants
   *   (numberOfUnits / numberOfPiecesRecipe par unité vendue), packaging exclu ;
   *   un composant portant le nom d'un menu item combo (comboItem=Yes,
   *   readyForSale=No) est récursivement déplié (profondeur ≤ 4). Un composant qui
   *   n'est PAS un combo est lui-même déplié en ses propres ingrédients/sous-
   *   composants si son readyForSale est "No" (sinon compté par son propre nom,
   *   1 unité par vente) — profondeur ≤ 4 + cycle-guard par id (ComponentComponent
   *   est un vrai graphe, pas un matching par nom).
   */
  private async explodeSalesToConsumption(raw: SalesRawRow[], tenantId: string) {
    if (!raw.length) return [];
    // Component (MenuComponent) : recette pour le dépliage readyForSale=No — pas de
    // packaging ici (exclu à dessein de la consommation, cf. docstring de la
    // fonction), `children` chargé à un niveau (petits-enfants résolus par
    // élargissement itératif ci-dessous, même contrainte que les combos par nom).
    const componentSelect = {
      id: true,
      name: true,
      readyForSale: true,
      numberOfUnitsRecipe: true,
      ingredients: {
        select: {
          quantity: true,
          ingredient: { select: { name: true, marketPrice: { select: { itemName: true } } } },
        },
      },
      children: { select: { quantity: true, child: { select: { id: true, name: true } } } },
    } as const;
    const recipeSelect = {
      id: true,
      name: true,
      readyForSale: true,
      comboItem: true,
      numberOfPiecesRecipe: true,
      ingredients: {
        select: {
          numberOfUnits: true,
          ingredient: { select: { name: true } },
        },
      },
      components: { select: { numberOfUnits: true, component: { select: componentSelect } } },
    } as const;

    const menuItemIds = [...new Set(raw.map((r) => r.menuItemId))];
    const items = await this.prisma.menuItem.findMany({
      where: { id: { in: menuItemIds }, tenantId, deletedAt: null },
      select: recipeSelect,
    });
    const byId = new Map(items.map((i) => [i.id, i]));
    const comboByName = new Map<string, any>();

    // Charge itérativement les combos référencés par nom dans les composants
    // (le front matche component.name ↔ menuItem.name), profondeur bornée.
    let frontier = items;
    for (let depth = 0; depth < 4 && frontier.length; depth++) {
      const wantedNames = new Set<string>();
      for (const item of frontier) {
        for (const line of item.components) {
          const name = line.component?.name?.trim();
          if (name && !comboByName.has(name.toLowerCase())) wantedNames.add(name);
        }
      }
      if (!wantedNames.size) break;
      const candidates = await this.prisma.menuItem.findMany({
        where: { tenantId, deletedAt: null, name: { in: [...wantedNames] } },
        select: recipeSelect,
      });
      // BUG-002/Q18 (Bertrand, 2026-07-24) : comboItem='Yes' explose TOUJOURS en
      // ses constituants, indépendamment de son propre readyForSale — ne plus
      // exiger readyForSale='No' en plus de comboItem='Yes'.
      frontier = candidates.filter((c) => this.normYesNo(c.comboItem) === 'Yes');
      for (const c of frontier) comboByName.set(c.name.trim().toLowerCase(), c);
    }

    // Components (readyForSale=No à déplier) : élargissement itératif du graphe
    // ComponentComponent PAR ID — miroir du même bloc dans loadRecipeContext
    // (Path A), dupliqué à dessein (cf. docstring en tête de fonction).
    const componentById = new Map<string, any>();
    const componentIds = new Set<string>();
    for (const mi of [...items, ...comboByName.values()]) {
      for (const line of mi.components ?? []) {
        const comp = line.component;
        if (comp?.id) {
          componentIds.add(comp.id);
          if (!componentById.has(comp.id)) componentById.set(comp.id, comp);
        }
      }
    }
    const componentVisited = new Set<string>(componentIds);
    let componentFrontier = [...componentIds];
    for (let depth = 0; depth < 4 && componentFrontier.length; depth++) {
      const childIds = new Set<string>();
      for (const id of componentFrontier) {
        for (const line of componentById.get(id)?.children ?? []) {
          const childId = line.child?.id;
          if (childId && !componentVisited.has(childId)) childIds.add(childId);
        }
      }
      if (!childIds.size) break;
      const rows = await this.prisma.menuComponent.findMany({
        where: { id: { in: [...childIds] }, tenantId, deletedAt: null },
        select: componentSelect,
      });
      for (const c of rows) {
        componentById.set(c.id, c);
        componentVisited.add(c.id);
      }
      componentFrontier = rows.map((c) => c.id);
    }

    // BUG-260-02 (2026-08-13) : un Component compte pour 1 unité de lui-même,
    // jamais décomposé en ingrédients/sous-composants — même alignement que
    // componentRefsForComponent (Path A) sur la décision Q13 (QUESTIONS_A_BERTRAND.md,
    // 2026-08-04 : "on ne décompose plus un composant"). L'ancienne garde
    // readyForSale==='Yes' ne se déclenchait jamais en pratique (0 Component avec ce
    // flag en base) et explosait donc systématiquement en ingrédients bruts, en
    // désaccord avec le référentiel Path A une fois celui-ci corrigé.
    const componentPerUnitCache = new Map<string, Map<string, number>>();
    const perUnitForComponent = (comp: any): Map<string, number> => {
      const cached = componentPerUnitCache.get(comp.id);
      if (cached) return cached;
      const result = new Map<string, number>();
      const name = comp?.name?.trim();
      if (name) result.set(name, 1);
      componentPerUnitCache.set(comp.id, result);
      return result;
    };

    const perUnitCache = new Map<string, Map<string, number>>();
    const perUnit = (item: any, depth = 0): Map<string, number> => {
      // Le dépliage combo est gaté par depth → le cache doit l'inclure.
      const cacheKey = `${item.id}:${depth}`;
      const cached = perUnitCache.get(cacheKey);
      if (cached) return cached;
      const result = new Map<string, number>();
      const add = (key: string | null | undefined, qty: number) => {
        const k = key?.trim();
        if (!k || !Number.isFinite(qty) || qty <= 0) return;
        result.set(k, (result.get(k) ?? 0) + qty);
      };
      // BUG-002/Q18 (Bertrand, 2026-07-24) : comboItem='Yes' explose TOUJOURS en
      // ses constituants, indépendamment de son propre readyForSale.
      const isCombo = this.normYesNo(item.comboItem) === 'Yes';
      if (!isCombo && this.normYesNo(item.readyForSale) === 'Yes') {
        add(item.name, 1);
      } else {
        const pieces = Number(item.numberOfPiecesRecipe) > 0 ? Number(item.numberOfPiecesRecipe) : 1;
        for (const line of item.ingredients) {
          add(line.ingredient?.name, Number(line.numberOfUnits ?? 0) / pieces);
        }
        for (const line of item.components) {
          const qty = Number(line.numberOfUnits ?? 0) / pieces;
          const name = line.component?.name?.trim();
          const combo = name && depth < 4 ? comboByName.get(name.toLowerCase()) : null;
          const compId = line.component?.id;
          const fullComp = !combo && compId ? componentById.get(compId) : null;
          if (combo) {
            for (const [k, q] of perUnit(combo, depth + 1)) add(k, q * qty);
          } else if (fullComp) {
            for (const [k, q] of perUnitForComponent(fullComp)) add(k, q * qty);
          } else {
            add(name, qty);
          }
        }
      }
      perUnitCache.set(cacheKey, result);
      return result;
    };

    const consumption = new Map<string, { elementId: string; itemKey: string; quantity: number }>();
    for (const row of raw) {
      const item = byId.get(row.menuItemId);
      if (!item) continue; // menu item supprimé depuis
      for (const [itemKey, qtyPerUnit] of perUnit(item)) {
        const key = `${row.elementId}::${itemKey}`;
        let agg = consumption.get(key);
        if (!agg) {
          agg = { elementId: row.elementId, itemKey, quantity: 0 };
          consumption.set(key, agg);
        }
        agg.quantity += qtyPerUnit * row.qty;
      }
    }
    return [...consumption.values()].map((c) => ({ ...c, quantity: Math.round(c.quantity * 100) / 100 }));
  }

  /**
   * Consommation des ventes d'UN événement, explosée en ingrédients (Q35 — Option 1,
   * décision owner 2026-07-27) : la réconciliation post-event consomme ce résultat à
   * la place des ventes brutes au grain menu item (le « Vendu » d'une ligne comptée
   * au grain ingrédient n'est plus 0 → plus de manquant fantôme sur les produits
   * préparés). Réutilise `explodeSalesToConsumption` telle quelle — le jour où Q18
   * (explosion des combos) y atterrit, la réco en hérite sans modification.
   *
   * Sélection des transactions = MIROIR de `SpacesService.getEventTimelineBatch`
   * (fenêtre `eventDate → endDate+1j`, scope intégration, status='V', deletedAt NULL)
   * — dupliqué à dessein comme deriveSalesRaw ↔ loadRecipeContext ; toute clause
   * modifiée ici doit l'être là-bas, cf. spaces.service.ts:1225-1252. Différence
   * assumée avec `deriveSalesRaw` : pas d'ancre StockReconciliation (le périmètre
   * est l'événement, pas « depuis le dernier reset »).
   *
   * Jamais d'écarté silencieux (BUG-238) : PdV non mappé / hors espace et produit
   * sans mapping menu item sortent dans `unjoined` (noms + unités), pas du calcul.
   */
  async deriveEventConsumption(spaceId: string, eventId: string, tenantId: string) {
    await this.assertSpace(spaceId, tenantId);
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, spaceId, tenantId },
      select: { id: true, name: true, eventDate: true, eventEndDate: true },
    });
    if (!event) throw new NotFoundException(`Event ${eventId} not found in space ${spaceId}`);

    const windowStart = new Date(event.eventDate);
    const windowEnd = new Date(event.eventEndDate ?? event.eventDate);
    windowEnd.setDate(windowEnd.getDate() + 1);

    const [elementIds, locationMapping] = await Promise.all([
      this.getSpaceElementIds(spaceId, tenantId),
      this.prisma.locationSpaceMapping.findFirst({
        where: { tenantId, spaceId },
        select: { salesLocationId: true },
      }),
    ]);
    if (!elementIds.length) {
      return { eventId: event.id, eventName: event.name ?? null, lines: [], unjoined: null };
    }

    // Même précédence que le timeline : scope intégration si mappé, sinon mode
    // dégradé tenant-wide où seuls les PdV mappés à CET espace sont gardés (sans
    // ça, les ventes non mappées des autres espaces fuiraient dans la fenêtre).
    const integrationId = locationMapping?.salesLocationId ?? null;
    const integrationClause = integrationId
      ? Prisma.sql`AND t."integrationId" = ${integrationId}`
      : Prisma.empty;
    const shopScopeClause = integrationId
      ? Prisma.sql`(mem."spaceElementId" IS NULL OR mem."spaceElementId" IN (${Prisma.join(elementIds)}))`
      : Prisma.sql`mem."spaceElementId" IN (${Prisma.join(elementIds)})`;

    // Jointure mapping PdV en superset des deux conventions existantes
    // (timeline : mem sur t.locationId ; deriveSalesRaw : via WeezeventLocation
    // id OU weezeventId) — un mapping saisi sous l'une ou l'autre clé joint.
    const rows = await this.prisma.$queryRaw<
      Array<{
        elementId: string | null;
        menuItemId: string | null;
        locationName: string | null;
        productName: string | null;
        qty: number;
      }>
    >(Prisma.sql`
      SELECT mem."spaceElementId"                                   AS "elementId",
             pm."menuItemId"                                        AS "menuItemId",
             COALESCE(MAX(t."locationName"), MAX(t."locationId"))   AS "locationName",
             MAX(ti."productName")                                  AS "productName",
             SUM(ti."quantity")::float                              AS qty
      FROM "WeezeventTransaction" t
      INNER JOIN "WeezeventTransactionItem" ti ON ti."transactionId" = t.id
      LEFT JOIN "WeezeventLocation" wl ON wl."id" = t."locationId"
      LEFT JOIN "WeezeventLocationShopMapping" mem
        ON mem."tenantId" = t."tenantId"
       AND (mem."weezeventLocationId" = t."locationId" OR mem."weezeventLocationId" = wl."weezeventId")
      LEFT JOIN "WeezeventProductMapping" pm
        ON pm."tenantId" = t."tenantId" AND pm."weezeventProductId" = ti."productId"
      WHERE t."tenantId" = ${tenantId}
        AND t."transactionDate" >= ${windowStart}
        AND t."transactionDate" <  ${windowEnd}
        AND t."status" = 'V'
        AND t."deletedAt" IS NULL
        ${integrationClause}
        AND ${shopScopeClause}
      GROUP BY 1, 2, ti."productId"
    `);

    const elementIdSet = new Set(elementIds);
    const joinable: SalesRawRow[] = [];
    const unjoinedShops = new Set<string>();
    const unjoinedProducts = new Set<string>();
    let unjoinedUnits = 0;
    for (const r of rows) {
      const qty = Number(r.qty ?? 0);
      if (!qty) continue;
      if (r.elementId && elementIdSet.has(r.elementId) && r.menuItemId) {
        joinable.push({
          elementId: r.elementId,
          menuItemId: r.menuItemId,
          eventId: event.id,
          eventName: event.name ?? null,
          qty,
          lastAt: windowStart,
        });
        continue;
      }
      if (!r.elementId || !elementIdSet.has(r.elementId)) {
        if (r.locationName) unjoinedShops.add(String(r.locationName));
      } else if (r.productName) {
        unjoinedProducts.add(String(r.productName));
      }
      unjoinedUnits += qty;
    }

    const lines = await this.explodeSalesToConsumption(joinable, tenantId);
    return {
      eventId: event.id,
      eventName: event.name ?? null,
      lines,
      unjoined:
        unjoinedShops.size || unjoinedProducts.size
          ? {
              shopNames: [...unjoinedShops].slice(0, 50),
              productNames: [...unjoinedProducts].slice(0, 50),
              units: Math.round(unjoinedUnits * 100) / 100,
            }
          : null,
    };
  }

  // ─── Reset après inventaire + réconciliation ─────────────────────────────────

  /**
   * Fige les écarts attendu vs compté dans une StockReconciliation (nouvelle ancre
   * des ventes), pose un mouvement INVENTORY_RESET par ligne et remplace les
   * StockLevel par les valeurs comptées. Seules les lignes envoyées sont réconciliées ;
   * la consommation dérivée des niveaux NON couverts est MATÉRIALISÉE (mouvement SALE
   * + niveau décrémenté) avant de déplacer l'ancre — sinon un reset partiel
   * ré-injecterait leurs ventes en stock fantôme.
   * NB : l'attendu est calculé juste avant la transaction — un mouvement ou une vente
   * strictement concurrents au reset peuvent tomber dans la fenêtre (écart absorbé au
   * prochain inventaire).
   */
  async reset(spaceId: string, dto: InventoryResetDto, tenantId: string, userId?: string) {
    if (!dto.lines?.length) throw new BadRequestException('Aucune ligne à réconcilier');

    const stock = await this.getStock(spaceId, tenantId);
    const levelByKey = new Map(stock.levels.map((l) => [`${l.elementId}::${l.itemKey}`, l]));
    const consumedByKey = new Map(stock.consumption.map((c) => [`${c.elementId}::${c.itemKey}`, c.quantity]));

    // Valide que tous les éléments visés appartiennent bien à l'espace
    const spaceElementIds = new Set(await this.getSpaceElementIds(spaceId, tenantId));
    for (const line of dto.lines) {
      if (!spaceElementIds.has(line.elementId)) {
        throw new BadRequestException(`Element ${line.elementId} n'appartient pas à l'espace ${spaceId}`);
      }
    }

    // Dédup : deux lignes sur la même clé = la dernière gagne (évite le double
    // mouvement et la violation d'unicité au createMany des niveaux).
    const dedupedLines = [...new Map(dto.lines.map((l) => [`${l.elementId}::${l.itemKey}`, l])).values()];
    const dtoKeys = new Set(dedupedLines.map((l) => `${l.elementId}::${l.itemKey}`));

    // Niveaux existants NON couverts par le reset : leur consommation dérivée est
    // figée en mouvement SALE + décrément du niveau (l'ancre va bouger pour tout
    // l'espace). Les clés sans niveau (consommation seule) restent à 0/0 — rien à préserver.
    const carryLines: Array<{
      elementId: string; itemKey: string;
      deltaPacked: number; deltaLoose: number;
      newPacked: number; newLoose: number; levelId: string;
    }> = [];
    for (const level of stock.levels) {
      const key = `${level.elementId}::${level.itemKey}`;
      if (dtoKeys.has(key)) continue;
      const consumed = consumedByKey.get(key) ?? 0;
      if (!consumed) continue;
      const next = this.normalizeLevel(level.packedUnits, level.looseUnits - consumed, level.unitsPerPack);
      carryLines.push({
        elementId: level.elementId,
        itemKey: level.itemKey,
        deltaPacked: next.packed - level.packedUnits,
        deltaLoose: Math.round((next.loose - level.looseUnits) * 100) / 100,
        newPacked: next.packed,
        newLoose: next.loose,
        levelId: level.id,
      });
    }

    const round2 = (n: number) => Math.round(n * 100) / 100;
    const recoLines = dedupedLines.map((line) => {
      const key = `${line.elementId}::${line.itemKey}`;
      const level = levelByKey.get(key);
      const upp = line.unitsPerPack ?? level?.unitsPerPack ?? null;
      const expected = this.normalizeLevel(
        level?.packedUnits ?? 0,
        (level?.looseUnits ?? 0) - (consumedByKey.get(key) ?? 0),
        upp,
      );
      const deltaUnits = upp
        ? round2((line.countedPacked - expected.packed) * upp + (line.countedLoose - expected.loose))
        : null;
      return {
        elementId: line.elementId,
        itemKey: line.itemKey,
        unitsPerPack: upp,
        expectedPacked: expected.packed,
        expectedLoose: expected.loose,
        countedPacked: line.countedPacked,
        countedLoose: round2(line.countedLoose),
        deltaPacked: line.countedPacked - expected.packed,
        deltaLoose: round2(line.countedLoose - expected.loose),
        deltaUnits,
      };
    });

    return this.prisma.$transaction(
      async (tx) => {
        const reco = await tx.stockReconciliation.create({
          data: {
            tenantId,
            spaceId,
            eventId: dto.eventId ?? null,
            eventName: dto.eventName ?? null,
            lines: recoLines as any,
            createdBy: userId ?? null,
          },
        });

        await tx.stockMovement.createMany({
          data: [
            ...recoLines.map((line) => ({
              tenantId,
              spaceId,
              elementId: line.elementId,
              itemKey: line.itemKey,
              packedDelta: line.deltaPacked,
              looseDelta: line.deltaLoose,
              reason: StockMovementReason.INVENTORY_RESET,
              eventId: dto.eventId ?? null,
              note: reco.id,
              createdBy: userId ?? null,
            })),
            // Matérialisation des ventes des niveaux non couverts (cf. docstring)
            ...carryLines.map((line) => ({
              tenantId,
              spaceId,
              elementId: line.elementId,
              itemKey: line.itemKey,
              packedDelta: line.deltaPacked,
              looseDelta: line.deltaLoose,
              reason: StockMovementReason.SALE,
              eventId: dto.eventId ?? null,
              note: reco.id,
              createdBy: userId ?? null,
            })),
          ],
        });

        // Bulk UPDATE (une requête) au lieu d'un update par ligne : la boucle
        // séquentielle était le poste dominant du timeout 30s de la transaction
        // sur les gros espaces (cf. audit perf 2026-07-18).
        if (carryLines.length) {
          await tx.$executeRaw(Prisma.sql`
            UPDATE "StockLevel" AS sl
            SET "packedUnits" = v.packed, "looseUnits" = v.loose, "updatedAt" = NOW()
            FROM (VALUES ${Prisma.join(
              carryLines.map((l) =>
                Prisma.sql`(${l.levelId}, ${Math.trunc(l.newPacked)}::int, ${l.newLoose}::float8)`,
              ),
            )}) AS v(id, packed, loose)
            WHERE sl.id = v.id AND sl."tenantId" = ${tenantId}
          `);
        }

        // Remplace les niveaux par les valeurs comptées (SET, pas d'incrément)
        const existing = new Map(
          (
            await tx.stockLevel.findMany({
              where: { tenantId, spaceId, elementId: { in: [...new Set(recoLines.map((l) => l.elementId))] } },
              select: { id: true, elementId: true, itemKey: true },
            })
          ).map((l) => [`${l.elementId}::${l.itemKey}`, l.id]),
        );
        const toCreate = recoLines.filter((l) => !existing.has(`${l.elementId}::${l.itemKey}`));
        if (toCreate.length) {
          await tx.stockLevel.createMany({
            data: toCreate.map((l) => ({
              tenantId,
              spaceId,
              elementId: l.elementId,
              itemKey: l.itemKey,
              packedUnits: l.countedPacked,
              looseUnits: l.countedLoose,
              unitsPerPack: l.unitsPerPack,
            })),
          });
        }
        // Bulk UPDATE (une requête) — même optimisation que carryLines ci-dessus.
        // COALESCE préserve la sémantique « ne toucher unitsPerPack que si fourni ».
        const toUpdate = recoLines
          .map((l) => ({ id: existing.get(`${l.elementId}::${l.itemKey}`), l }))
          .filter((x): x is { id: string; l: (typeof recoLines)[number] } => !!x.id);
        if (toUpdate.length) {
          await tx.$executeRaw(Prisma.sql`
            UPDATE "StockLevel" AS sl
            SET "packedUnits" = v.packed,
                "looseUnits" = v.loose,
                "unitsPerPack" = COALESCE(v.upp, sl."unitsPerPack"),
                "updatedAt" = NOW()
            FROM (VALUES ${Prisma.join(
              toUpdate.map(({ id, l }) =>
                Prisma.sql`(${id}, ${Math.trunc(l.countedPacked)}::int, ${l.countedLoose}::float8, ${l.unitsPerPack ?? null}::float8)`,
              ),
            )}) AS v(id, packed, loose, upp)
            WHERE sl.id = v.id AND sl."tenantId" = ${tenantId}
          `);
        }

        return { reconciliationId: reco.id, createdAt: reco.createdAt, lines: recoLines.length };
      },
      { timeout: 30000 },
    );
  }

  // ─── Réconciliations (listing + export) ──────────────────────────────────────

  async listReconciliations(spaceId: string, tenantId: string) {
    await this.assertSpace(spaceId, tenantId);
    const rows = await this.prisma.stockReconciliation.findMany({
      // kind:null : la vue Logistic ne liste que les archives de reset — les
      // documents 'post-event' ont leur propre liste côté Post-event Inventory
      // (GET /inventory/:spaceId/reconciliations). Les pertes de transfert
      // (BUG-259-02) vivent dans `StockTransferLoss`, section "Pertes" séparée,
      // cf. `getLosses`/`getLossesSummary` plus bas (retour en arrière du mélange
      // introduit puis annulé le 2026-08-13 : Réconciliation ≠ Pertes).
      where: { tenantId, spaceId, kind: null },
      orderBy: { createdAt: 'desc' },
      select: { id: true, eventId: true, eventName: true, createdAt: true, createdBy: true, lines: true },
    });
    return rows.map((r) => ({
      id: r.id,
      eventId: r.eventId,
      eventName: r.eventName,
      createdAt: r.createdAt,
      createdBy: r.createdBy,
      lineCount: Array.isArray(r.lines) ? (r.lines as any[]).length : 0,
    }));
  }

  async getReconciliation(id: string, tenantId: string, user?: SpaceScopedUser) {
    const reco = await this.prisma.stockReconciliation.findFirst({ where: { id, tenantId } });
    if (!reco) throw new NotFoundException(`Reconciliation ${id} not found`);
    await this.assertSpaceAccess(reco.spaceId, user);
    return reco;
  }

  /** CSV des écarts d'une réconciliation (séparateur ';' — Excel FR). */
  async exportReconciliationCsv(id: string, tenantId: string, user?: SpaceScopedUser) {
    const reco = await this.getReconciliation(id, tenantId, user);
    const lines = (Array.isArray(reco.lines) ? reco.lines : []) as any[];

    const elementIds = [...new Set(lines.map((l) => l.elementId).filter(Boolean))];
    const elements = elementIds.length
      ? await this.prisma.spaceElement.findMany({
          where: { id: { in: elementIds } },
          select: { id: true, name: true },
        })
      : [];
    const nameById = new Map(elements.map((e) => [e.id, e.name]));

    const esc = (v: unknown) => {
      // Décimaux en virgule : un CSV ';' (convention fr) avec des nombres à
      // point est lu comme du texte par Excel FR.
      const s = typeof v === 'number' ? String(v).replace('.', ',') : String(v ?? '');
      return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = [
      'PDV/Storage', 'Item', 'Unites par pack',
      'Attendu (packs)', 'Attendu (vrac)', 'Compte (packs)', 'Compte (vrac)',
      'Ecart (packs)', 'Ecart (vrac)', 'Ecart (unites)',
    ];
    const rows = lines.map((l) =>
      [
        nameById.get(l.elementId) ?? l.elementId,
        l.itemKey,
        l.unitsPerPack ?? '',
        l.expectedPacked, l.expectedLoose, l.countedPacked, l.countedLoose,
        l.deltaPacked, l.deltaLoose, l.deltaUnits ?? '',
      ]
        .map(esc)
        .join(';'),
    );
    // BOM UTF-8 pour qu'Excel ouvre les accents correctement
    const csv = ['\uFEFF' + header.join(';'), ...rows].join('\n');
    return { reco, csv };
  }

  // \u2500\u2500\u2500 Simulation de vente (QA / tests logistique) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

  /**
   * Simule une vente Weezevent : cr\u00E9e une WeezeventTransaction + ses
   * WeezeventTransactionItem synth\u00E9tiques dans les m\u00EAmes tables que le pipeline
   * r\u00E9el (donc lues par getStock/deriveSalesRaw exactement comme une vraie vente),
   * marqu\u00E9es `metadata.isSimulated=true`. N\u00E9cessite que le PDV et chaque menu item
   * soient d\u00E9j\u00E0 mapp\u00E9s \u00E0 Weezevent (WeezeventLocationShopMapping /
   * WeezeventProductMapping) \u2014 sinon une vraie vente ne serait pas compt\u00E9e non
   * plus, donc rien \u00E0 simuler.
   * \u26A0\uFE0F Non filtr\u00E9e des autres endpoints (dashboards revenus/analytics) : purger
   * via purgeSimulatedSales une fois le test termin\u00E9.
   */
  async simulateSale(
    spaceId: string,
    elementId: string,
    lines: SimulateSaleLineDto[],
    tenantId: string,
    userId?: string,
    realMode = false,
    ensureLiveEvent = false,
    simulationRunId?: string,
  ) {
    if (!lines?.length) throw new BadRequestException('Aucune ligne \u00E0 simuler');
    const element = await this.getElementOrThrow(elementId, tenantId);
    if (element.spaceId !== spaceId) {
      throw new BadRequestException(`Element ${elementId} n'appartient pas \u00E0 l'espace ${spaceId}`);
    }

    const shopMapping = await this.prisma.locationShopMapping.findFirst({
      where: { tenantId, spaceElementId: elementId },
    });
    if (!shopMapping) {
      throw new BadRequestException(`"${element.name}" n'est rattach\u00E9 \u00E0 aucune location Weezevent \u2014 vente non simulable.`);
    }
    const location = await this.prisma.salesLocation.findFirst({
      where: { tenantId, OR: [{ id: shopMapping.salesLocationId }, { externalId: shopMapping.salesLocationId }] },
    });
    if (!location) {
      throw new BadRequestException(`Location Weezevent introuvable pour "${element.name}".`);
    }

    // Sans ça, la vente reste rattachée au SalesEvent déjà stocké sur la location — sur
    // un tenant de test, souvent un event réel synchronisé il y a des mois : rien ne
    // s'affiche jamais sous "Aujourd'hui" (toute la chaîne d'agrégation/affichage pivote
    // sur Event.eventDate, jamais sur SalesLocation.eventId directement). `ensureLiveEvent`
    // crée/réutilise un Event+SalesEvent datés aujourd'hui pour que le test soit visible.
    const salesEventId = ensureLiveEvent
      ? await this.ensureTodaySalesEvent(tenantId, location, spaceId, element)
      : location.eventId;

    const menuItemIds = [...new Set(lines.map((l) => l.menuItemId))];
    // ProductMapping reste n\u00E9cessaire pour attribuer la vente \u00E0 un produit Weezevent
    // (reporting/corr\u00E9lation), MAIS le PRIX factur\u00E9 vient d\u00E9sormais du catalogue
    // DataFriday de l'ESPACE courant (SpaceMenuItem.priceTtc \u2192 MenuItem.basePrice),
    // pas de SalesProduct.basePrice. Raison : un menu item peut \u00EAtre mapp\u00E9 \u00E0 PLUSIEURS
    // produits Weezevent (sch\u00E9ma : @@unique([salesProductId]) seulement, aucune
    // contrainte sur menuItemId) \u2014 un doublon de mapping vers un produit au prix
    // incomplet (basePrice null) rendait la vente simul\u00E9e silencieusement gratuite,
    // alors que le prix catalogue DataFriday, lui, est toujours la source unique et
    // fiable (menu-item-pricing.service.ts). Le prix de vente r\u00E9el (webhook Weezevent)
    // n'est PAS concern\u00E9 : il porte son propre prix, ind\u00E9pendant de cette r\u00E9solution.
    const [menuItems, spaceMenuItems, productMappings, tenantDefaultVatRate] = await Promise.all([
      this.prisma.menuItem.findMany({
        where: { id: { in: menuItemIds }, tenantId, deletedAt: null },
        select: { id: true, name: true, basePrice: true, vatRate: true },
      }),
      this.prisma.spaceMenuItem.findMany({ where: { spaceId, menuItemId: { in: menuItemIds } } }),
      this.prisma.productMapping.findMany({ where: { tenantId, menuItemId: { in: menuItemIds } } }),
      this.pricingService.getTenantDefaultVatRate(tenantId),
    ]);
    const menuItemById = new Map(menuItems.map((m) => [m.id, m]));
    const spaceOverrideById = new Map(spaceMenuItems.map((s) => [s.menuItemId, s]));
    const mappingByMenuItemId = new Map(productMappings.map((m) => [m.menuItemId, m]));
    const missing = menuItemIds.filter((id) => !mappingByMenuItemId.has(id));
    if (missing.length) {
      const names = missing.map((id) => menuItemById.get(id)?.name ?? id).join(', ');
      throw new BadRequestException(`Non mapp\u00E9 \u00E0 un produit Weezevent : ${names}. Vente non simulable pour ces menu items.`);
    }
    const productIds = [...new Set(productMappings.map((m) => m.salesProductId))];
    const products = await this.prisma.salesProduct.findMany({ where: { id: { in: productIds } } });
    const productById = new Map(products.map((p) => [p.id, p]));

    const transactionDate = new Date();
    const itemsData = lines.map((line) => {
      const menuItem = menuItemById.get(line.menuItemId);
      const mapping = mappingByMenuItemId.get(line.menuItemId)!;
      const product = productById.get(mapping.salesProductId);
      const spaceOverride = spaceOverrideById.get(line.menuItemId);
      const unitPrice = spaceOverride?.priceTtc ?? menuItem?.basePrice ?? new Prisma.Decimal(0);
      const vat = spaceOverride?.vatRate ?? menuItem?.vatRate ?? tenantDefaultVatRate ?? 0;
      return {
        menuItemId: line.menuItemId,
        productId: mapping.salesProductId,
        productName: menuItem?.name ?? product?.name ?? null,
        quantity: line.quantity,
        unitPrice,
        vat,
        rawData: { simulated: true },
      };
    });
    const amount = itemsData.reduce((sum, it) => sum + Number(it.unitPrice) * it.quantity, 0);

    // Calcule la consommation AVANT d'écrire quoi que ce soit : si le résultat ne
    // peut pas être correctement reflété sur le stock (pack size manquante/invalide
    // et vrac insuffisant pour absorber la vente), on refuse la vente plutôt que de
    // créer une transaction dont l'effet réel serait silencieusement clampé à 0
    // (cf. normalizeLevel) — un « succès » trompeur.
    const raw: SalesRawRow[] = lines.map((line) => ({
      elementId,
      menuItemId: line.menuItemId,
      eventId: salesEventId,
      eventName: null,
      qty: line.quantity,
      lastAt: transactionDate,
    }));
    const consumptionPreview = await this.explodeSalesToConsumption(raw, tenantId);
    const problems = await this.checkConsumptionFeasibility(tenantId, elementId, consumptionPreview);
    // Mode réel : se comporte comme le pipeline webhook, qui n'a jamais ce garde-fou —
    // la vente est enregistrée quoi qu'il arrive, quitte à ce que normalizeLevel clampe
    // silencieusement le stock mal configuré à 0 (comportement réel, pas un bug).
    if (!realMode && problems.length) {
      throw new BadRequestException(`Vente non simulable — configuration de stock incomplète : ${problems.join(' ; ')}`);
    }

    const transaction = await this.prisma.salesTransaction.create({
      data: {
        externalId: `SIM-${randomUUID()}`,
        tenantId,
        integrationId: location.integrationId,
        // Sans ce champ explicite, Prisma applique le défaut du schéma (WEEZEVENT)
        // même si `location` est en réalité une location Digifood — la transaction
        // simulée porterait alors un tag faux. `location.provider` est déjà fiable
        // (posé explicitement à l'ingestion réelle, cf. digifood-ingestion.service.ts).
        provider: location.provider,
        amount,
        status: 'V',
        transactionDate,
        eventId: salesEventId,
        locationId: location.id,
        locationName: location.name,
        metadata: {
          isSimulated: true,
          simulatedByUserId: userId ?? null,
          simulatedElementId: elementId,
          ...(simulationRunId ? { simulationRunId } : {}),
        },
        rawData: { simulated: true },
        items: {
          create: itemsData.map(({ menuItemId, ...data }) => data),
        },
      },
      include: { items: true },
    });

    // Best-effort, miroir du chemin webhook réel (WebhookEventHandler.triggerLiveAggregation) :
    // sans ça, une vente simulée n'avance jamais Shop Performance/POS Performance/Event
    // Revenue by Shop (alimentés par SpaceRevenueMinuteAgg, pas par la transaction brute),
    // sauf rattrapage par le cron 5 min ET seulement si un Event DataFriday est actif.
    // Ne doit jamais faire échouer simulateSale : la transaction est déjà committée.
    try {
      await this.triggerLiveAggregationForEvent(tenantId, location.integrationId, salesEventId);
    } catch (e: any) {
      this.logger.warn(`[simulateSale] agrégation live non déclenchée : ${e?.message}`);
    }

    return {
      transactionId: transaction.id,
      elementId,
      elementName: element.name,
      items: itemsData.map((it) => ({ menuItemId: it.menuItemId, productName: it.productName, quantity: it.quantity })),
      consumptionPreview,
    };
  }

  /**
   * Rattache une vente simulée à un Event/SalesEvent datés AUJOURD'HUI plutôt qu'au
   * `SalesEvent` déjà stocké sur `SalesLocation.eventId` (souvent un event réel synchronisé
   * il y a des mois sur un tenant de test). Toute la chaîne d'agrégation/affichage
   * (`getLiveStatus`, `triggerLiveAggregationForEvent`, `AggregationService`,
   * `getEventTimelineBatch`, et le getter front `filteredEvents`) pivote sur
   * `Event.eventDate` (DataFriday) — jamais sur `SalesLocation.eventId` directement. Sans
   * ce rattachement explicite, une vente simulée ne s'affiche jamais sous "Aujourd'hui".
   * Idempotent : réutilise l'Event/SalesEvent du jour s'il en existe déjà un pour cet
   * espace (pas de duplication à chaque vente simulée le même jour). Tagué
   * `metadata.isSimulated=true` côté SalesEvent et `isSimulated=true` + nom `[Simulé] ...`
   * côté Event, pour rester identifiable/purgeable (cf. purgeSimulatedSales) et pour être
   * exclu d'EventPredict / de l'écran Live (GET /events?excludeSimulated=true).
   */
  private async ensureTodaySalesEvent(
    tenantId: string,
    location: { integrationId: string },
    spaceId: string,
    element: { name: string },
  ): Promise<string> {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    const label = `[Simulé] ${element.name} — ${todayStart.toISOString().slice(0, 10)}`;

    // 1. Event DataFriday du jour déjà lié à un SalesEvent pour cet espace → réutiliser tel quel.
    const existingLinkedEvent = await this.prisma.event.findFirst({
      where: { tenantId, spaceId, eventDate: { gte: todayStart, lt: tomorrowStart }, weezeventEventId: { not: null } },
      select: { weezeventEventId: true },
    });
    if (existingLinkedEvent?.weezeventEventId) return existingLinkedEvent.weezeventEventId;

    // 2. SalesEvent du jour pour cette intégration → réutiliser, sinon créer.
    let salesEvent = await this.prisma.salesEvent.findFirst({
      where: { tenantId, integrationId: location.integrationId, startDate: { gte: todayStart, lt: tomorrowStart } },
      select: { id: true },
    });
    if (!salesEvent) {
      salesEvent = await this.prisma.salesEvent.create({
        data: {
          externalId: `SIM-EVT-${randomUUID()}`,
          tenantId,
          integrationId: location.integrationId,
          name: label,
          organizationId: 'simulated',
          startDate: now,
          metadata: { isSimulated: true },
          rawData: { simulated: true },
        },
        select: { id: true },
      });
    }

    // 3. Event DataFriday du jour pour cet espace → réutiliser (et lier si besoin), sinon créer.
    const existingEvent = await this.prisma.event.findFirst({
      where: { tenantId, spaceId, eventDate: { gte: todayStart, lt: tomorrowStart } },
      select: { id: true, weezeventEventId: true },
    });
    if (existingEvent) {
      if (!existingEvent.weezeventEventId) {
        await this.prisma.event.update({ where: { id: existingEvent.id }, data: { weezeventEventId: salesEvent.id } });
      }
    } else {
      // `isSimulated` UNIQUEMENT sur la branche de création : les branches de
      // réutilisation ci-dessus (et le retour anticipé §1) peuvent pointer sur un
      // VRAI event du jour — le flaguer le masquerait d'EventPredict/Live.
      await this.prisma.event.create({
        data: { name: label, eventDate: now, spaceId, tenantId, weezeventEventId: salesEvent.id, isSimulated: true },
      });
    }

    return salesEvent.id;
  }

  /**
   * Miroir de WebhookEventHandler.triggerLiveAggregation
   * (weezevent/services/webhook-event.handler.ts:179-215) — dupliqué plutôt que
   * partagé pour éviter un cycle de modules (LogisticsModule est importé par
   * SpacesModule, qui est dans la chaîne de dépendance d'AggregationModule via
   * MappingsModule → SpacesModule ; même raison documentée côté weezevent).
   * No-op silencieux si `weezeventEventId` est vide ou ne résout à aucun Event
   * DataFriday scopé à un space (BUG-021 disambiguation) — reflète fidèlement ce
   * qu'un vrai webhook ferait dans ce cas.
   */
  private async triggerLiveAggregationForEvent(
    tenantId: string,
    integrationId: string,
    weezeventEventId: string | null,
  ): Promise<void> {
    if (!weezeventEventId) return;
    const dfEvent = await this.prisma.event.findFirst({
      where: { tenantId, weezeventEventId, spaceId: { not: null } },
      select: { id: true, spaceId: true, eventDate: true },
    });
    if (!dfEvent?.spaceId) return;

    const jobLog = await this.prisma.aggregationJobLog.create({
      data: {
        tenantId,
        spaceId: dfEvent.spaceId,
        jobType: 'incremental',
        status: 'pending',
        fromDate: dfEvent.eventDate,
        toDate: dfEvent.eventDate,
        metadata: { eventIds: [dfEvent.id], trigger: 'simulate-sale' },
      },
    });
    await this.queueService.queueAggregationJob({
      type: 'process-events',
      tenantId,
      spaceId: dfEvent.spaceId,
      jobLogId: jobLog.id,
      eventIds: [dfEvent.id],
      integrationId,
    });
  }

  /**
   * Une ligne de consommation est « impossible à refléter » si elle ferait passer
   * le vrac sous 0 sans pouvoir emprunter un pack entier (unitsPerPack manquant/0
   * sur le StockLevel suivi, ou à défaut sur le Market Price du référentiel, ou
   * pas assez de packs en stock) — cf. `normalizeLevel` qui clampe alors
   * silencieusement à 0 sans que la vente soit réellement reflétée.
   */
  private async checkConsumptionFeasibility(
    tenantId: string,
    elementId: string,
    consumption: Array<{ itemKey: string; quantity: number }>,
  ): Promise<string[]> {
    if (!consumption.length) return [];
    const itemKeys = [...new Set(consumption.map((c) => c.itemKey))];
    const [levels, marketPrices] = await Promise.all([
      this.prisma.stockLevel.findMany({ where: { tenantId, elementId, itemKey: { in: itemKeys } } }),
      this.prisma.marketPrice.findMany({
        where: { tenantId, deletedAt: null, itemName: { in: itemKeys, mode: 'insensitive' } },
        select: { itemName: true, packedUnits: true },
      }),
    ]);
    const levelByKey = new Map(levels.map((l) => [l.itemKey, l]));
    const uppByName = new Map(marketPrices.map((m) => [m.itemName.trim().toLowerCase(), m.packedUnits]));

    const problems: string[] = [];
    for (const c of consumption) {
      const level = levelByKey.get(c.itemKey);
      const currentPacked = level?.packedUnits ?? 0;
      const currentLoose = level?.looseUnits ?? 0;
      const upp =
        level?.unitsPerPack && level.unitsPerPack > 0
          ? level.unitsPerPack
          : (uppByName.get(c.itemKey.trim().toLowerCase()) ?? null);
      const nextLoose = currentLoose - c.quantity;
      if (nextLoose < -1e-9) {
        const canBorrow = !!upp && upp > 0 && currentPacked >= Math.ceil((-nextLoose - 1e-9) / upp);
        if (!canBorrow) {
          problems.push(
            `"${c.itemKey}" (stock ${currentPacked} pack × ${upp ?? '?'} + ${currentLoose} vrac, insuffisant pour -${c.quantity} — taille de pack Market Price manquante ou invalide)`,
          );
        }
      }
    }
    return problems;
  }

  /**
   * Purge les ventes simul\u00E9es (`metadata.isSimulated=true`) d'un PDV \u2014 nettoyage
   * post-test. Cascade sur WeezeventTransactionItem (onDelete: Cascade).
   */
  async purgeSimulatedSales(spaceId: string, elementId: string, tenantId: string) {
    const element = await this.getElementOrThrow(elementId, tenantId);
    if (element.spaceId !== spaceId) {
      throw new BadRequestException(`Element ${elementId} n'appartient pas \u00E0 l'espace ${spaceId}`);
    }
    const shopMapping = await this.prisma.locationShopMapping.findFirst({
      where: { tenantId, spaceElementId: elementId },
    });
    if (!shopMapping) return { deletedCount: 0, deletedEventCount: 0 };
    const location = await this.prisma.salesLocation.findFirst({
      where: { tenantId, OR: [{ id: shopMapping.salesLocationId }, { externalId: shopMapping.salesLocationId }] },
      select: { id: true },
    });
    if (!location) return { deletedCount: 0, deletedEventCount: 0 };

    // Capture les SalesEvent concern\u00E9s AVANT suppression, pour pouvoir nettoyer ceux
    // cr\u00E9\u00E9s par ensureTodaySalesEvent qui ne servent plus \u00E0 rien apr\u00E8s ce purge.
    const toDelete = await this.prisma.salesTransaction.findMany({
      where: { tenantId, locationId: location.id, metadata: { path: ['isSimulated'], equals: true } },
      select: { eventId: true },
    });
    const candidateEventIds = [...new Set(toDelete.map((t) => t.eventId).filter((id): id is string => !!id))];

    const { count } = await this.prisma.salesTransaction.deleteMany({
      where: {
        tenantId,
        locationId: location.id,
        metadata: { path: ['isSimulated'], equals: true },
      },
    });

    const deletedEventCount = await this.cleanupOrphanedSimulatedSalesEvents(tenantId, candidateEventIds);
    return { deletedCount: count, deletedEventCount };
  }

  /**
   * Nettoie les SalesEvent cr\u00E9\u00E9s par `ensureTodaySalesEvent` (`metadata.isSimulated`) qui ne
   * sont plus r\u00E9f\u00E9renc\u00E9s par AUCUNE transaction (simul\u00E9e ou r\u00E9elle) apr\u00E8s une purge \u2014 jamais
   * un event r\u00E9el. Extrait de `purgeSimulatedSales` pour \u00EAtre partag\u00E9 avec `purgeSimulatedSalesByIds`.
   */
  private async cleanupOrphanedSimulatedSalesEvents(tenantId: string, candidateEventIds: string[]): Promise<number> {
    let deletedEventCount = 0;
    for (const salesEventId of candidateEventIds) {
      const salesEvent = await this.prisma.salesEvent.findUnique({
        where: { id: salesEventId },
        select: { id: true, metadata: true },
      });
      if (!(salesEvent?.metadata as any)?.isSimulated) continue;

      const remaining = await this.prisma.salesTransaction.count({ where: { tenantId, eventId: salesEventId } });
      if (remaining > 0) continue;

      const dfEvent = await this.prisma.event.findFirst({
        where: { tenantId, weezeventEventId: salesEventId },
        select: { id: true, spaceId: true },
      });
      if (dfEvent) {
        await this.prisma.spaceRevenueMinuteAgg.deleteMany({
          where: { tenantId, spaceId: dfEvent.spaceId ?? undefined, weezeventEventId: dfEvent.id },
        });
        await this.prisma.event.delete({ where: { id: dfEvent.id } });
      }
      await this.prisma.salesEvent.delete({ where: { id: salesEventId } });
      deletedEventCount++;
    }
    return deletedEventCount;
  }

  /**
   * Liste pagin\u00E9e (curseur) des ventes simul\u00E9es d'un espace, tous PDV confondus \u2014 QA
   * (11_LIVE.md, LiveSimulationHistoryDialog.vue). M\u00EAme cha\u00EEne de jointure que
   * `simulateSale`/`purgeSimulatedSales` (LocationShopMapping \u2192 SalesLocation), \u00E9largie \u00E0
   * TOUS les PDV de l'espace au lieu d'un seul.
   */
  async listSimulatedSales(spaceId: string, tenantId: string, limit = 50, cursor?: string) {
    await this.assertSpace(spaceId, tenantId);
    const elements = await this.prisma.spaceElement.findMany({
      where: { ...this.spaceElementScopeWhere(spaceId, tenantId), type: { in: SHOP_TYPES } } as any,
      select: { id: true, name: true },
    });
    if (!elements.length) return { items: [], nextCursor: null };
    const nameById = new Map(elements.map((e) => [e.id, e.name]));

    const mappings = await this.prisma.locationShopMapping.findMany({
      where: { tenantId, spaceElementId: { in: elements.map((e) => e.id) } },
      select: { salesLocationId: true },
    });
    if (!mappings.length) return { items: [], nextCursor: null };
    const salesLocationIds = [...new Set(mappings.map((m) => m.salesLocationId))];
    const locations = await this.prisma.salesLocation.findMany({
      where: { tenantId, OR: [{ id: { in: salesLocationIds } }, { externalId: { in: salesLocationIds } }] },
      select: { id: true },
    });
    if (!locations.length) return { items: [], nextCursor: null };
    const locationIds = locations.map((l) => l.id);

    const rows = await this.prisma.salesTransaction.findMany({
      where: { tenantId, locationId: { in: locationIds }, metadata: { path: ['isSimulated'], equals: true } },
      orderBy: { transactionDate: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { items: true },
    });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    return {
      items: page.map((t) => ({
        id: t.id,
        elementId: (t.metadata as any)?.simulatedElementId ?? null,
        elementName: nameById.get((t.metadata as any)?.simulatedElementId) ?? null,
        runId: (t.metadata as any)?.simulationRunId ?? null,
        amount: t.amount,
        transactionDate: t.transactionDate,
        items: t.items.map((i) => ({ productId: i.productId, productName: i.productName, quantity: i.quantity })),
      })),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }

  /**
   * Purge s\u00E9lective par ids de transaction (QA, history dialog) \u2014 contrairement \u00E0
   * `purgeSimulatedSales` (tout un PDV d'un coup), permet de ne retirer que les lignes
   * coch\u00E9es. V\u00E9rifie que chaque id appartient bien \u00E0 un PDV de CET espace/tenant avant
   * suppression \u2014 un id forg\u00E9 d'un autre espace/tenant ne peut rien purger.
   */
  async purgeSimulatedSalesByIds(spaceId: string, tenantId: string, transactionIds: string[]) {
    await this.assertSpace(spaceId, tenantId);
    if (!transactionIds?.length) return { deletedCount: 0, deletedEventCount: 0 };
    const elements = await this.prisma.spaceElement.findMany({
      where: { ...this.spaceElementScopeWhere(spaceId, tenantId), type: { in: SHOP_TYPES } } as any,
      select: { id: true },
    });
    const elementIds = new Set(elements.map((e) => e.id));
    const rows = await this.prisma.salesTransaction.findMany({
      where: { id: { in: transactionIds }, tenantId, metadata: { path: ['isSimulated'], equals: true } },
      select: { id: true, eventId: true, metadata: true },
    });
    const allowed = rows.filter((r) => elementIds.has((r.metadata as any)?.simulatedElementId));
    if (!allowed.length) return { deletedCount: 0, deletedEventCount: 0 };
    const candidateEventIds = [...new Set(allowed.map((r) => r.eventId).filter((id): id is string => !!id))];
    const { count } = await this.prisma.salesTransaction.deleteMany({ where: { id: { in: allowed.map((r) => r.id) } } });
    const deletedEventCount = await this.cleanupOrphanedSimulatedSalesEvents(tenantId, candidateEventIds);
    return { deletedCount: count, deletedEventCount };
  }

  // \u2500\u2500\u2500 Runs d'auto-simulation (QA, server-side, BullMQ Job Scheduler) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

  /** Idempotent : un run d\u00E9j\u00E0 actif pour cet espace est renvoy\u00E9 tel quel, pas de doublon. */
  async startSimulationRun(spaceId: string, tenantId: string, userId: string, dto: StartSimulationRunDto) {
    await this.assertSpace(spaceId, tenantId);
    const existing = await this.prisma.simulationRun.findFirst({ where: { tenantId, spaceId, status: 'active' } });
    if (existing) return existing;
    const run = await this.prisma.simulationRun.create({
      data: {
        tenantId,
        spaceId,
        intervalMs: dto.intervalMs,
        realMode: dto.realMode ?? true,
        configId: dto.configId ?? null,
        status: 'active',
        startedByUserId: userId,
      },
    });
    await this.simulationQueue.upsertJobScheduler(
      run.id,
      { every: dto.intervalMs },
      { name: 'simulation-tick', data: { runId: run.id } },
    );
    return run;
  }

  async stopSimulationRun(spaceId: string, runId: string, tenantId: string, userId: string) {
    await this.assertSpace(spaceId, tenantId);
    const run = await this.prisma.simulationRun.findFirst({ where: { id: runId, tenantId, spaceId } });
    if (!run) throw new NotFoundException(`Run ${runId} introuvable`);
    if (run.status === 'active') {
      await this.simulationQueue.removeJobScheduler(run.id).catch(() => {});
      await this.prisma.simulationRun.update({
        where: { id: run.id },
        data: { status: 'stopped', stoppedAt: new Date(), stoppedByUserId: userId },
      });
    }
    return this.prisma.simulationRun.findUnique({ where: { id: run.id } });
  }

  async getActiveSimulationRun(spaceId: string, tenantId: string) {
    await this.assertSpace(spaceId, tenantId);
    return this.prisma.simulationRun.findFirst({ where: { tenantId, spaceId, status: 'active' } });
  }

  async listSimulationRuns(spaceId: string, tenantId: string, limit = 20) {
    await this.assertSpace(spaceId, tenantId);
    return this.prisma.simulationRun.findMany({
      where: { tenantId, spaceId },
      orderBy: { startedAt: 'desc' },
      take: limit,
    });
  }
}
