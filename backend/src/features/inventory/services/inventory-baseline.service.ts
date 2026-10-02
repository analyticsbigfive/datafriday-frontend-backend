import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { StockMovementReason } from '@prisma/client';
import { PrismaService } from '../../../core/database/prisma.service';
import { SpaceAccessService } from '../../../core/auth/space-access.service';
import { StockItemIdentityService } from '../../logistics/services/stock-item-identity.service';
import { StockLevelService } from '../../logistics/services/stock-level.service';
import { InventoryUnitResolverService } from './inventory-unit-resolver.service';

/**
 * Références de réconciliation : stock attendu côté Logistic, mouvements de la fenêtre du match, inventaire d'avant match et consommation des ventes.
 */
@Injectable()
export class InventoryBaselineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stockItemIdentityService: StockItemIdentityService,
    private readonly stockLevelService: StockLevelService,
    private readonly spaceAccess: SpaceAccessService,
    private readonly inventoryUnitResolverService: InventoryUnitResolverService,
  ) {}

  private readonly logger = new Logger(InventoryBaselineService.name);

  // ── GET /inventory/:spaceId/event-consumption/:eventId ──────────────────────
  // Ventes de l'événement EXPLOSÉES en consommation d'ingrédients (Q35 Option 1) —
  // source « Vendu » de la réconciliation post-event. Délégué à LogisticsService
  // (propriétaire de la cascade d'explosion) ; exposé ici pour porter la
  // permission de l'écran inventaire (front.fb.spaceInventory), pas celle de la
  // Logistique.
  async getEventSalesConsumption(spaceId: string, eventId: string, tenantId: string) {
    return this.stockLevelService.deriveEventConsumption(spaceId, eventId, tenantId);
  }

  // ── GET /inventory/:spaceId/pre-event/:eventId ───────────────────────────────
  // Inventaire de référence AVANT l'événement (réconciliation POST-event).
  // Définition exacte depuis l'écran Pre-event Inventory (2026-07-20, Q19 résolue) :
  // le dernier snapshot kind='pre-event' du MÊME event — c'est littéralement le
  // comptage d'avant match. Repli LEGACY (snapshots sans kind) : le plus récent
  // strictement antérieur au JOUR de l'event. Renvoie null (200) si aucun — le
  // front laisse alors leftFromSales/missing à null (« — »), jamais 0.
  async getPreEventInventory(spaceId: string, eventId: string, tenantId: string) {
    await this.spaceAccess.assertSpaceInTenant(spaceId, tenantId);
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, spaceId, tenantId },
      select: { id: true, eventDate: true },
    });
    if (!event) throw new NotFoundException(`Event ${eventId} not found in space ${spaceId}`);

    // 1) Cycle fermé : comptage Pre-event Inventory de CET event.
    const preSnapshot = await this.prisma.inventorySnapshot.findFirst({
      where: { tenantId, spaceId, eventId, kind: 'pre-event' },
      orderBy: { createdAt: 'desc' },
    });
    if (preSnapshot) {
      return {
        id: preSnapshot.id,
        eventId: preSnapshot.eventId,
        createdAt: preSnapshot.createdAt,
        source: 'pre-event' as const,
        inventoryCounts: preSnapshot.inventoryCounts,
      };
    }

    // 2) Repli SCOPÉ (BUG-241) : le comptage post-event du match PRÉCÉDENT —
    // c'est la définition du cycle (§8.1), pas « le dernier snapshot du space ».
    // L'ancien repli (`createdAt < jour de l'event`, sans filtre eventId ni kind)
    // pouvait piocher le stock d'un tout autre match : bascule silencieuse
    // interdite par la règle « un match = un eventId » (§12.4).
    // ⚠️ Approximation assumée : les mouvements Logistic entre les deux matchs ne
    // sont PAS déduits — d'où `source` renvoyé au client, qui l'archive dans le
    // document (`meta.baseline.source`) et l'affiche.
    // `isSimulated: false` (décision JLH 2026-08-20) : les events créés par
    // l'outil QA « simuler une vente » ne participent pas au cycle d'inventaire —
    // sans ce filtre, un « [Simulé] ... » intercalé devant le dernier vrai match
    // capte le repli et le pré-remplissage tombe sur un event jamais compté.
    const previousEvent = await this.prisma.event.findFirst({
      where: { spaceId, tenantId, eventDate: { lt: event.eventDate }, isSimulated: false },
      orderBy: { eventDate: 'desc' },
      select: { id: true, name: true },
    });
    if (!previousEvent) return null;

    const snapshot = await this.prisma.inventorySnapshot.findFirst({
      where: { tenantId, spaceId, eventId: previousEvent.id, kind: 'post-event' },
      orderBy: { createdAt: 'desc' },
    });
    if (!snapshot) return null;
    return {
      id: snapshot.id,
      eventId: snapshot.eventId,
      createdAt: snapshot.createdAt,
      source: 'previous-post-event' as const,
      previousEvent,
      inventoryCounts: snapshot.inventoryCounts,
    };
  }

  /** Attendus des écrans Pre/Post-event Inventory = état Logistic « en l'état »
   *  (décision JLH 2026-08-20, remplace le rejeu snapshot + mouvements de
   *  BUG-232/239) : ce que l'écran Logistic affiche à l'instant du chargement —
   *  StockLevel − ventes dérivées depuis l'ancre logistique, casse de pack,
   *  clamp ≥ 0 (`LogisticsService.getExpectedStockIndex`, chemin partagé avec
   *  `getStock` : les deux écrans ne peuvent pas diverger).
   *
   *  Ici on ne fait que traduire ce registre (clé = NOM libre, unité = paquet
   *  LOGISTIQUE) vers le référentiel compté : jointure nom → menuItemId, puis
   *  re-découpage en packed/loose dans la taille de paquet de l'INVENTAIRE
   *  (BUG-239 : le hint doit légender le champ Packed de l'écran dans SA propre
   *  unité). `units`/`unitsPerPack` restent null quand le conditionnement
   *  d'inventaire est inconnu — pas de total fabriqué.
   *
   *  Chemin unique du GET pre-event-baseline, du GET post-event-baseline ET de
   *  la réconciliation pre-event : les trois ne peuvent pas diverger. */
  async computeLogisticExpected(spaceId: string, tenantId: string) {
    const { index, asOf } = await this.stockLevelService.getExpectedStockIndex(spaceId, tenantId);
    const expected = new Map<
      string,
      { packed: number; loose: number; units: number | null; unitsPerPack: number | null }
    >();
    if (!index.size) {
      return { expected, unjoinedItemKeys: [] as string[], asOf, aliasGroups: new Map<string, string[]>() };
    }

    const idsByNormName = await this.inventoryUnitResolverService.catalogIdsByNormName(tenantId);
    const unjoined = new Set<string>();
    const joined: Array<{
      elementId: string;
      itemId: string;
      packed: number;
      loose: number;
      logUpp: number | null;
    }> = [];
    // Un même niveau Logistic est exposé sous TOUS les ids de catalogue de son nom
    // (cf. catalogIdsByNormName) : l'écran et la feuille retrouvent l'attendu quel
    // que soit l'id sous lequel l'article est compté. `aliasGroups` (élément × nom →
    // ids) permet à la feuille de ne pas dupliquer une ligne « Logistic seule ».
    const aliasGroups = new Map<string, string[]>();
    for (const entry of index.values()) {
      const nk = this.inventoryUnitResolverService.normalizeName(entry.itemKey);
      const itemIds = idsByNormName.get(nk);
      if (!itemIds?.length) {
        unjoined.add(entry.itemKey);
        continue;
      }
      const groupKey = `${entry.elementId}::${nk}`;
      const group = aliasGroups.get(groupKey) ?? [];
      for (const itemId of itemIds) {
        if (!group.includes(itemId)) group.push(itemId);
        joined.push({
          elementId: entry.elementId,
          itemId,
          packed: entry.packed,
          loose: entry.loose,
          logUpp: entry.unitsPerPack && entry.unitsPerPack > 0 ? entry.unitsPerPack : null,
        });
      }
      aliasGroups.set(groupKey, group);
    }
    if (unjoined.size) {
      this.logger.warn(
        `Inventory expected: ${unjoined.size} itemKey(s) Logistic non joignable(s) au référentiel ` +
          `compté, niveaux ignorés : ${[...unjoined].join(', ')}`,
      );
    }

    const invUppByItemId = await this.inventoryUnitResolverService.resolveInventoryUnitsPerPack(
      joined.map((j) => j.itemId),
      tenantId,
    );
    const round2 = (n: number) => Math.round(n * 100) / 100;

    // Deux clés Logistic peuvent résoudre le même article (noms libres) : on
    // agrège par (élément × article) — en unités quand le conditionnement
    // d'inventaire est connu, par canaux packed/loose sinon (sémantique
    // Logistique historique, pas de conversion fabriquée).
    for (const j of joined) {
      const k = `${j.elementId}::${j.itemId}`;
      const invUpp = Number(invUppByItemId.get(j.itemId));
      const q = invUpp > 0 ? invUpp : 1;
      const cur = expected.get(k) ?? { packed: 0, loose: 0, units: null as number | null, unitsPerPack: null as number | null };
      if (q > 1) {
        // Le niveau a été tenu dans l'unité de la LOGISTIQUE ; les unités sont la
        // seule grandeur commune aux deux référentiels (BUG-239).
        const mUpp = j.logUpp ?? q;
        const units = round2((cur.units ?? cur.packed * q + cur.loose) + j.packed * mUpp + j.loose);
        const packed = Math.floor(units / q);
        expected.set(k, { packed, loose: round2(units - packed * q), units, unitsPerPack: q });
      } else {
        expected.set(k, {
          packed: cur.packed + j.packed,
          loose: round2(cur.loose + j.loose),
          units: null,
          unitsPerPack: null,
        });
      }
    }

    return { expected, unjoinedItemKeys: [...unjoined], asOf, aliasGroups };
  }

  /** Delta NET des mouvements Logistic de la fenêtre du match, en unités, par
   *  `elementId::menuItemId` — le terme « mouvements » des lignes de
   *  réconciliation post-event (`leftFromSales = pre-event − vendu + mouvements`,
   *  cf. utils/postEventReconciliation.js ; archivé par ligne, BUG-343-01/346-01).
   *  Indépendant de l'ATTENDU affiché (état Logistic, cf. computeLogisticExpected).
   *
   *  Fenêtre : du comptage pre-event de CE match (sinon eventDate) à
   *  eventEndDate + 1 j — miroir de deriveEventConsumption. `SALE` exclus :
   *  matérialisées par les resets, déjà comptées dans les ventes dérivées
   *  (décision 2026-07-30 #2). NON clampé : la réconciliation a besoin du
   *  mouvement réel du registre, pas d'un stock physique — le dériver d'une
   *  soustraction de stocks rendrait leur clamp. */
  async netMovementUnitsForEventWindow(
    spaceId: string,
    tenantId: string,
    event: { id: string; eventDate: Date; eventEndDate: Date | null },
  ) {
    const preSnapshot = await this.prisma.inventorySnapshot.findFirst({
      where: { tenantId, spaceId, eventId: event.id, kind: 'pre-event' },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    const from = preSnapshot?.createdAt ?? event.eventDate;
    const to = new Date(event.eventEndDate ?? event.eventDate);
    to.setDate(to.getDate() + 1);

    const net = new Map<string, number>();
    const unjoined = new Set<string>();
    if (!(from < to)) return { net, unjoinedItemKeys: [...unjoined] };

    const rows = await this.prisma.stockMovement.findMany({
      where: {
        tenantId,
        spaceId,
        createdAt: { gt: from, lt: to },
        // INVENTORY_RESET exclu : depuis le 2026-10-06 (D1), la Logistique est recalée
        // depuis le comptage post-event PENDANT le match ; ces recalages ne sont pas des
        // mouvements physiques (livraison, transfert, perte) et feraient du manquant un
        // « mouvement ».
        reason: { notIn: [StockMovementReason.SALE, StockMovementReason.INVENTORY_RESET] },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { elementId: true, itemKey: true, menuItemId: true, packedDelta: true, looseDelta: true },
    });
    if (!rows.length) return { net, unjoinedItemKeys: [...unjoined] };

    const idsByNormName = await this.inventoryUnitResolverService.catalogIdsByNormName(tenantId);
    // Un mouvement est exposé sous tous les ids de catalogue de son nom (même règle
    // que computeLogisticExpected) : la ligne post-event comptée sous un id MarketPrice
    // retrouve ses mouvements.
    const idsFor = (m: { menuItemId: string | null; itemKey: string }) => {
      const byName = idsByNormName.get(this.inventoryUnitResolverService.normalizeName(m.itemKey)) ?? [];
      return [...new Set([...(m.menuItemId ? [m.menuItemId] : []), ...byName])];
    };
    // unitsPerPack par itemKey — même chaîne de résolution que la Logistique
    // (MarketPrice → MenuComponent → MenuItem.inventoryNumberOfUnits), mémoïsée.
    const uppByNormKey = new Map<string, number | null>();
    for (const m of rows) {
      const nk = this.inventoryUnitResolverService.normalizeName(m.itemKey);
      if (!uppByNormKey.has(nk)) {
        uppByNormKey.set(nk, await this.stockItemIdentityService.resolveUnitsPerPackForItemKey(m.itemKey, tenantId));
      }
    }
    const itemIds = rows.flatMap((m) => idsFor(m));
    const invUppByItemId = await this.inventoryUnitResolverService.resolveInventoryUnitsPerPack(itemIds, tenantId);
    const round2 = (n: number) => Math.round(n * 100) / 100;

    for (const m of rows) {
      const ids = idsFor(m);
      if (!ids.length) {
        unjoined.add(m.itemKey);
        continue;
      }
      for (const itemId of ids) {
      const k = `${m.elementId}::${itemId}`;
      const invUpp = Number(invUppByItemId.get(itemId));
      // Conditionnement d'inventaire connu → delta en unités (paquet LOGISTIQUE
      // pour la conversion, BUG-239) ; inconnu → packed + loose, même convention
      // que la sortie `units` des attendus.
      const logUpp = uppByNormKey.get(this.inventoryUnitResolverService.normalizeName(m.itemKey));
      const delta =
        invUpp > 1
          ? (m.packedDelta ?? 0) * (logUpp && logUpp > 0 ? logUpp : invUpp) + (m.looseDelta ?? 0)
          : (m.packedDelta ?? 0) + (m.looseDelta ?? 0);
      net.set(k, round2((net.get(k) ?? 0) + delta));
      }
    }
    if (unjoined.size) {
      this.logger.warn(
        `Post-event movementUnits: ${unjoined.size} itemKey(s) non joignable(s) au référentiel, ` +
          `mouvements ignorés : ${[...unjoined].join(', ')}`,
      );
    }
    return { net, unjoinedItemKeys: [...unjoined] };
  }

  // ── GET /inventory/:spaceId/pre-event-baseline/:eventId ─────────────────────
  // GATING SERVEUR (front.fb.preInventoryExpected, décorateur méthode du
  // contrôleur) : un compteur sans le droit ne REÇOIT jamais les attendus — un
  // masquage client seul serait contournable et biaiserait le comptage.
  async getPreEventBaseline(spaceId: string, eventId: string, tenantId: string) {
    await this.spaceAccess.assertSpaceInTenant(spaceId, tenantId);
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, spaceId, tenantId },
      select: { id: true },
    });
    if (!event) throw new NotFoundException(`Event ${eventId} not found in space ${spaceId}`);

    const { expected, unjoinedItemKeys, asOf } = await this.computeLogisticExpected(spaceId, tenantId);
    const expectedBlob: Record<
      string,
      Record<string, { packed: number; loose: number; units: number | null; unitsPerPack: number | null }>
    > = {};
    for (const [k, v] of expected) {
      const [elementId, itemId] = k.split('::');
      // `units`/`unitsPerPack` (BUG-239) : le front affiche le hint dans l'unité
      // de son propre champ Packed sans avoir à redeviner le conditionnement.
      (expectedBlob[elementId] ??= {})[itemId] = {
        packed: v.packed,
        loose: v.loose,
        units: v.units,
        unitsPerPack: v.unitsPerPack,
      };
    }
    return {
      // PDF v3 (2026-08-21, dernière version — simplification owner après le
      // retour client) : « La quantité attendue sera toujours le Total sur la
      // logistique pour chaque élément. » Le registre est recalé automatiquement
      // depuis le comptage à la génération de chaque réconciliation
      // (pushCountToLogistic) : il contient donc toujours le dernier comptage.
      source: 'logistic-live',
      asOf,
      previousEvent: null,
      // Compat ancien front (gate `baseline?.baseline`) : objet vide truthy — la
      // donnée affichée vient exclusivement du blob `expected`.
      baseline: {},
      movements: [],
      expected: expectedBlob,
      unjoinedItemKeys,
    };
  }

  // ── GET /inventory/:spaceId/post-event-baseline/:eventId ────────────────────
  // Indice de référence du comptage POST-event, même gating serveur que le
  // pre-event (front.fb.preInventoryExpected, décorateur méthode du contrôleur).
  //
  // attendu = Total Logistic (PDF v3 du 2026-08-21 : « La quantité attendue sera
  // toujours le Total sur la logistique pour chaque élément »). Le registre est
  // recalé depuis le comptage à chaque génération de réconciliation
  // (pushCountToLogistic) et à l'ouverture des portes : il porte donc toujours
  // le dernier comptage physique.
  //
  // `movementUnits` reste calculé sur la FENÊTRE DU MATCH
  // (netMovementUnitsForEventWindow) : c'est le terme « mouvements » des lignes
  // de réconciliation post-event (BUG-343-01/346-01), pas l'attendu affiché.
  async getPostEventBaseline(spaceId: string, eventId: string, tenantId: string) {
    await this.spaceAccess.assertSpaceInTenant(spaceId, tenantId);
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, spaceId, tenantId },
      select: { id: true, name: true, eventDate: true, eventEndDate: true },
    });
    if (!event) throw new NotFoundException(`Event ${eventId} not found in space ${spaceId}`);

    // BUG-378-02 : l'attendu Logistic sert de stock de départ à la réconciliation
    // post-event quand un PdV n'a pas de comptage pré-event. Mais le registre est
    // RECALÉ depuis le comptage d'après-match à chaque génération de document
    // (`pushCountToLogistic`, marqueur BUG-352-01) : après ce recalage il porte
    // le comptage d'arrivée, et `attendu − compté` vaudrait 0 partout. On signale
    // donc au client si le registre contient déjà le comptage post-event de CET
    // event, pour qu'il n'en fasse pas un stock de départ.
    const [{ expected, unjoinedItemKeys, asOf }, movementNet, pushedFromThisEvent] = await Promise.all([
      this.computeLogisticExpected(spaceId, tenantId),
      this.netMovementUnitsForEventWindow(spaceId, tenantId, event),
      this.prisma.stockReconciliation.findFirst({
        where: {
          tenantId,
          spaceId,
          eventId: event.id,
          kind: null,
          AND: [
            { meta: { path: ['source'], equals: 'inventory-count' } },
            { meta: { path: ['phase'], equals: 'post-event' } },
          ],
        },
        select: { id: true },
      }),
    ]);

    const round2 = (n: number) => Math.round(n * 100) / 100;
    const expectedBlob: Record<string, Record<string, unknown>> = {};
    const expectedUnitsBlob: Record<string, Record<string, number>> = {};
    const movementUnitsBlob: Record<string, Record<string, number>> = {};
    const keys = new Set<string>([...expected.keys(), ...movementNet.net.keys()]);
    for (const k of keys) {
      const [elementId, itemId] = k.split('::');
      const v = expected.get(k) ?? { packed: 0, loose: 0, units: null, unitsPerPack: null };
      (expectedBlob[elementId] ??= {})[itemId] = v;
      // Indice du total : unités quand le conditionnement d'inventaire est connu,
      // packed + loose sinon (même convention que `units`). Ventes déjà déduites
      // — et clampées ≥ 0 — par l'état Logistic (c'est le chiffre de l'écran
      // Logistic, plus un indice signé).
      (expectedUnitsBlob[elementId] ??= {})[itemId] = v.units ?? round2(v.packed + v.loose);
      (movementUnitsBlob[elementId] ??= {})[itemId] = movementNet.net.get(k) ?? 0;
    }

    return {
      source: 'logistic-live',
      asOf,
      anchorEvent: null,
      // Compat ancien front (gate `baseline?.baseline`) : objet vide truthy — la
      // donnée affichée vient des blobs `expected`/`expectedUnits`.
      baseline: {},
      movements: [],
      expected: expectedBlob,
      expectedUnits: expectedUnitsBlob,
      movementUnits: movementUnitsBlob,
      // true = le registre a déjà été recalé depuis un comptage POST-event de cet
      // event : `expectedUnits` n'est plus un stock de départ exploitable.
      holdsPostEventCount: !!pushedFromThisEvent,
      salesUnjoined: null,
      unjoinedItemKeys: [...new Set([...unjoinedItemKeys, ...movementNet.unjoinedItemKeys])],
    };
  }
}
