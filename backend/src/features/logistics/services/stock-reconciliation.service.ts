import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { StockMovementReason } from '@prisma/client';
import { PrismaService } from '../../../core/database/prisma.service';
import { SpaceAccessService } from '../../../core/auth/space-access.service';
import { InventoryResetDto } from '../dto/logistics.dto';
import { carryStockLevels, setCountedStockLevels } from '../logistics.queries';
import { canAdoptStockLevelByName } from '../stock-level-identity';
import { LogisticsElementScopeService } from './logistics-element-scope.service';
import { StockItemIdentityService } from './stock-item-identity.service';
import { StockLevelService } from './stock-level.service';
import { SpaceScopedUser } from '../logistics.types';

/**
 * Réconciliations de stock (recalage sur comptage) : création, liste, détail, export CSV.
 */
@Injectable()
export class StockReconciliationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly spaceAccess: SpaceAccessService,
    private readonly logisticsElementScopeService: LogisticsElementScopeService,
    private readonly stockItemIdentityService: StockItemIdentityService,
    private readonly stockLevelService: StockLevelService,
  ) {}

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
  async reset(
    spaceId: string,
    dto: InventoryResetDto,
    tenantId: string,
    userId?: string,
    /** Provenance du recalage, archivée sur le document (BUG-352-01). Un reset
     *  issu d'un comptage d'inventaire porte `{ source: 'inventory-count' }` :
     *  c'est ce marqueur qui dit aux écrans d'inventaire que le registre CONTIENT
     *  déjà ce comptage, et qu'il ne faut donc pas le rajouter à l'attendu. */
    meta?: Record<string, unknown> | null,
  ) {
    if (!dto.lines?.length) throw new BadRequestException('Aucune ligne à réconcilier');

    const stock = await this.stockLevelService.getStock(spaceId, tenantId);
    const levelByKey = new Map(stock.levels.map((l) => [`${l.elementId}::${l.itemKey}`, l]));
    const consumedByKey = new Map(stock.consumption.map((c) => [`${c.elementId}::${c.itemKey}`, c.quantity]));

    // Valide que tous les éléments visés appartiennent bien à l'espace
    const spaceElementIds = new Set(await this.logisticsElementScopeService.getSpaceElementIds(spaceId, tenantId));
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
      const next = this.stockItemIdentityService.normalizeLevel(level.packedUnits, level.looseUnits - consumed, level.unitsPerPack);
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
      const expected = this.stockItemIdentityService.normalizeLevel(
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

    // ADR-0006 (chantier 377) : résolution en lot (1 requête par table candidate, pas par ligne)
    // hors transaction — double-écriture, dégrade proprement (itemKind/itemRefId null) si un nom
    // ne résout pas, sans jamais bloquer le reset.
    const identities = await this.stockItemIdentityService.resolveItemIdentitiesForKeys(
      [...recoLines.map((l) => l.itemKey), ...carryLines.map((l) => l.itemKey)],
      tenantId,
    );
    // Le front peut déjà fournir l'identité par ligne (dto.lines[].itemKind/itemRefId) —
    // préférée à la résolution serveur par nom quand présente. Aucun front actuel ne l'envoie
    // encore (chemin inerte tant que le front n'a pas basculé). `carryLines` (dérivées côté
    // serveur, jamais du DTO) n'ont jamais d'identité client — repli serveur systématique.
    const clientIdentityByKey = new Map<string, { itemKind: string; itemRefId: string }>();
    for (const line of dto.lines) {
      if (line.itemKind && line.itemRefId) {
        clientIdentityByKey.set(String(line.itemKey ?? '').trim(), { itemKind: line.itemKind, itemRefId: line.itemRefId });
      }
    }
    const identityFor = (itemKey: string) => {
      const key = String(itemKey ?? '').trim();
      return clientIdentityByKey.get(key) ?? identities.get(key) ?? null;
    };

    return this.prisma.$transaction(
      async (tx) => {
        const reco = await tx.stockReconciliation.create({
          data: {
            tenantId,
            spaceId,
            eventId: dto.eventId ?? null,
            eventName: dto.eventName ?? null,
            lines: recoLines as any,
            ...(meta ? { meta: meta as any } : {}),
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
              itemKind: identityFor(line.itemKey)?.itemKind ?? null,
              itemRefId: identityFor(line.itemKey)?.itemRefId ?? null,
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
              itemKind: identityFor(line.itemKey)?.itemKind ?? null,
              itemRefId: identityFor(line.itemKey)?.itemRefId ?? null,
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
          await carryStockLevels(
            tx,
            tenantId,
            carryLines.map((l) => {
              const id = identityFor(l.itemKey);
              return { levelId: l.levelId, packed: l.newPacked, loose: l.newLoose, itemKind: id?.itemKind ?? null, itemRefId: id?.itemRefId ?? null };
            }),
          );
        }

        // Remplace les niveaux par les valeurs comptées (SET, pas d'incrément)
        // ADR-0006 (chantier 377, étape 5) : double lookup nom + itemRefId, même motif que
        // applyLevelDelta — sans le repli par id, une ligne comptée avec le nom COURANT d'un
        // article renommé depuis le dernier reset ne trouverait jamais la ligne existante
        // (encore sous l'ancien nom) et créerait une ligne StockLevel fantôme à partir de 0.
        const existingRows = await tx.stockLevel.findMany({
          where: { tenantId, spaceId, elementId: { in: [...new Set(recoLines.map((l) => l.elementId))] } },
          select: { id: true, elementId: true, itemKey: true, itemKind: true, itemRefId: true },
        });
        const existingByKey = new Map(existingRows.map((l) => [`${l.elementId}::${l.itemKey}`, l]));
        const existingByRefId = new Map(
          existingRows.filter((l) => l.itemRefId).map((l) => [`${l.elementId}::${l.itemRefId}`, l]),
        );
        // Même garde qu'applyLevelDelta : identité d'abord (précise), nom en repli SEULEMENT si
        // la ligne trouvée par nom n'est pas déjà rattachée à une AUTRE identité (vrai homonyme —
        // même nom, article différent) — sinon deux homonymes fusionneraient dans une seule ligne.
        // Une variante de prix (deux MarketPrice de même nom) est le même produit : adoptée, sinon
        // la création d'une seconde ligne de même nom violait uniq_stock_level et annulait tout
        // le reset (cf. canAdoptStockLevelByName).
        const resolveExistingId = (line: (typeof recoLines)[number]) => {
          const identity = identityFor(line.itemKey);
          if (identity) {
            const byRef = existingByRefId.get(`${line.elementId}::${identity.itemRefId}`);
            if (byRef) return byRef.id;
          }
          const byKey = existingByKey.get(`${line.elementId}::${line.itemKey}`);
          if (byKey && canAdoptStockLevelByName(byKey, identity)) return byKey.id;
          return undefined;
        };
        const toCreate = recoLines.filter((l) => !resolveExistingId(l));
        if (toCreate.length) {
          await tx.stockLevel.createMany({
            data: toCreate.map((l) => ({
              tenantId,
              spaceId,
              elementId: l.elementId,
              itemKey: l.itemKey,
              itemKind: identityFor(l.itemKey)?.itemKind ?? null,
              itemRefId: identityFor(l.itemKey)?.itemRefId ?? null,
              packedUnits: l.countedPacked,
              looseUnits: l.countedLoose,
              unitsPerPack: l.unitsPerPack,
            })),
          });
        }
        // Bulk UPDATE (une requête) — même optimisation que carryLines ci-dessus.
        // COALESCE préserve la sémantique « ne toucher unitsPerPack que si fourni ».
        const toUpdate = recoLines
          .map((l) => ({ id: resolveExistingId(l), l }))
          .filter((x): x is { id: string; l: (typeof recoLines)[number] } => !!x.id);
        if (toUpdate.length) {
          // Réaligne toujours sur le nom COURANT (no-op si trouvée par nom, auto-guérison si
          // trouvée par itemRefId après un renommage) : même motif qu'applyLevelDelta.
          await setCountedStockLevels(
            tx,
            tenantId,
            toUpdate.map(({ id, l }) => {
              const identity = identityFor(l.itemKey);
              return {
                levelId: id,
                packed: l.countedPacked,
                loose: l.countedLoose,
                unitsPerPack: l.unitsPerPack ?? null,
                itemKind: identity?.itemKind ?? null,
                itemRefId: identity?.itemRefId ?? null,
                itemKey: l.itemKey,
              };
            }),
          );
        }

        return { reconciliationId: reco.id, createdAt: reco.createdAt, lines: recoLines.length };
      },
      { timeout: 30000 },
    );
  }

  // ─── Réconciliations (listing + export) ──────────────────────────────────────

  async listReconciliations(spaceId: string, tenantId: string) {
    await this.spaceAccess.assertSpaceAccessible(spaceId, tenantId);
    const rows = await this.prisma.stockReconciliation.findMany({
      // kind:null : la vue Logistic ne liste que les archives de reset — les
      // documents 'post-event' ont leur propre liste côté Post-event Inventory
      // (GET /inventory/:spaceId/reconciliations). Les pertes de transfert
      // (BUG-259-02) vivent dans `StockTransferLoss`, section "Pertes" séparée,
      // cf. `getLosses`/`getLossesSummary` plus bas (retour en arrière du mélange
      // introduit puis annulé le 2026-08-13 : Réconciliation ≠ Pertes).
      where: { tenantId, spaceId, kind: null },
      orderBy: { createdAt: 'desc' },
      select: { id: true, eventId: true, eventName: true, createdAt: true, createdBy: true, lines: true, meta: true },
    });
    // Recalages issus des comptages d'inventaire (envoyés à la minute pendant le comptage,
    // document Bertrand 2026-10-06) : UNE ligne par match et par phase, la plus récente,
    // au lieu d'une par envoi. Lecture seule : aucun document n'est supprimé (le plus
    // récent reste l'ancre des ventes).
    const out: Array<Record<string, unknown>> = [];
    const groups = new Map<string, { row: Record<string, unknown>; keys: Set<string>; count: number }>();
    for (const r of rows) {
      const lines = (Array.isArray(r.lines) ? r.lines : []) as any[];
      const groupKey = inventoryCountGroupKey(r.meta, r.eventId);
      if (!groupKey) {
        out.push({ id: r.id, eventId: r.eventId, eventName: r.eventName, createdAt: r.createdAt, createdBy: r.createdBy, lineCount: lines.length });
        continue;
      }
      let group = groups.get(groupKey);
      if (!group) {
        const row = { id: r.id, eventId: r.eventId, eventName: r.eventName, createdAt: r.createdAt, createdBy: r.createdBy, lineCount: 0, groupedCount: 0 };
        group = { row, keys: new Set(), count: 0 };
        groups.set(groupKey, group);
        out.push(row);
      }
      group.count += 1;
      for (const l of lines) group.keys.add(`${l?.elementId}::${l?.itemKey}`);
      group.row.lineCount = group.keys.size;
      group.row.groupedCount = group.count;
    }
    return out;
  }

  async getReconciliation(id: string, tenantId: string, user?: SpaceScopedUser) {
    const reco = await this.prisma.stockReconciliation.findFirst({ where: { id, tenantId } });
    if (!reco) throw new NotFoundException(`Reconciliation ${id} not found`);
    await this.spaceAccess.assertCanAccessSpace(user, reco.spaceId);
    // Recalage issu d'un comptage : lignes de tous les envois du même match et de la même
    // phase, la plus récente l'emporte par article (cf. listReconciliations).
    const meta = (reco.meta ?? null) as Record<string, unknown> | null;
    if (reco.kind === null && inventoryCountGroupKey(meta, reco.eventId)) {
      const siblings = await this.prisma.stockReconciliation.findMany({
        where: {
          tenantId,
          spaceId: reco.spaceId,
          eventId: reco.eventId,
          kind: null,
          AND: [
            { meta: { path: ['source'], equals: 'inventory-count' } },
            { meta: { path: ['phase'], equals: meta!.phase as string } },
          ],
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true, lines: true },
      });
      const merged = new Map<string, unknown>();
      for (const sibling of siblings) {
        for (const l of (Array.isArray(sibling.lines) ? sibling.lines : []) as any[]) {
          const key = `${l?.elementId}::${l?.itemKey}`;
          if (!merged.has(key)) merged.set(key, l);
        }
      }
      return { ...reco, lines: [...merged.values()] as any, groupedIds: siblings.map((x) => x.id) };
    }
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
}

/** Clé de regroupement d'un recalage issu d'un comptage d'inventaire (event + phase),
 *  null pour tout autre document (reset manuel de l'écran Logistique). */
function inventoryCountGroupKey(meta: unknown, eventId: string | null): string | null {
  const m = (meta ?? null) as Record<string, unknown> | null;
  if (!m || m.source !== 'inventory-count' || typeof m.phase !== 'string' || !eventId) return null;
  return `${eventId}|${m.phase}`;
}
