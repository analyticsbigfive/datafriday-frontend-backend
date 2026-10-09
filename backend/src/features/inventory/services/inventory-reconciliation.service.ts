import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { CreatePostEventReconciliationDto } from '../dto/create-post-event-reconciliation.dto';
import { SpaceAccessService } from '../../../core/auth/space-access.service';
import { InventoryBaselineService } from './inventory-baseline.service';
import { InventoryCountService } from './inventory-count.service';
import { InventoryLogisticPushService } from './inventory-logistic-push.service';
import { InventoryUnitResolverService } from './inventory-unit-resolver.service';
import { closeInventoryWindows } from '../inventory-window-closure';

/** Restreint un blob de comptages `{ elementId: { itemId: count } }` à certains PDV
 *  (undefined = tous). */
function pickElements<T>(
  blob: Record<string, T>,
  elementIds: string[] | undefined,
): Record<string, T> {
  if (!elementIds) return blob;
  const keep = new Set(elementIds);
  return Object.fromEntries(Object.entries(blob ?? {}).filter(([id]) => keep.has(id)));
}

/**
 * Réconciliations d'inventaire avant et après match : création, liste et suppression.
 */
@Injectable()
export class InventoryReconciliationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly spaceAccess: SpaceAccessService,
    private readonly inventoryBaselineService: InventoryBaselineService,
    private readonly inventoryCountService: InventoryCountService,
    private readonly inventoryLogisticPushService: InventoryLogisticPushService,
    private readonly inventoryUnitResolverService: InventoryUnitResolverService,
  ) {}

  private readonly logger = new Logger(InventoryReconciliationService.name);

  // ── Réconciliation post-événement (Post-event Inventory) ────────────────────
  // Documents d'écarts compté vs « ce qui devrait rester après les ventes »,
  // persistés dans StockReconciliation avec kind='post-event'. Distinct du reset
  // logistique (kind=null) : ne touche PAS aux StockLevel et ne déplace PAS
  // l'ancre des ventes dérivées (exclue par kind:null côté logistics.service).
  // Doc : frontend/docs/modules/10_POST_EVENT_INVENTORY.md §7.

  // ── POST /inventory/:spaceId/reconciliations ─────────────────────────────────
  /**
   * UNE feuille post-event par match (même système que le pre-event, demande Bertrand
   * 2026-09-29) : chaque génération remplace la précédente.
   *  - `draft` (PDV complet, recomptage) : feuille seule, Logistic et fenêtre PIN intacts ;
   *  - final (« Générer la réconciliation ») : pousse le comptage vers Logistic et clôt le
   *    post-event.
   * Les lignes restent construites côté écran (mêmes sources et mêmes calculs qu'avant).
   */
  async createPostEventReconciliation(
    spaceId: string,
    dto: CreatePostEventReconciliationDto,
    tenantId: string,
    userId?: string,
    options: { draft?: boolean; extraMeta?: Record<string, unknown> } = {},
  ) {
    const draft = !!options.draft;
    this.logger.log(
      `POST /inventory/${spaceId}/reconciliations eventId=${dto.eventId} lines=${dto.lines?.length ?? 0}`,
    );
    await this.spaceAccess.assertSpaceInTenant(spaceId, tenantId);
    // L'event doit appartenir au même tenant/space (pas de réconciliation
    // cross-space via un eventId arbitraire — même famille de failles que les
    // fiches cross-tenant du backend).
    const event = await this.prisma.event.findFirst({
      where: { id: dto.eventId, spaceId, tenantId },
      select: { id: true, name: true },
    });
    if (!event) throw new NotFoundException(`Event ${dto.eventId} not found in space ${spaceId}`);

    const created = await this.prisma.stockReconciliation.create({
      data: {
        tenantId,
        spaceId,
        eventId: event.id,
        // Nom dénormalisé : priorité au nom réel de l'event (source de vérité DB),
        // repli sur celui envoyé par le front (event supprimé entre-temps exclu
        // par le garde ci-dessus).
        eventName: event.name ?? dto.eventName ?? null,
        kind: 'post-event',
        lines: dto.lines as any,
        // Contexte de fabrication (BUG-238/241) : provenance du stock de départ
        // et ventes écartées faute de jointure. Sans ces marqueurs, un écart
        // fabriqué par une source manquante passe pour un manquant réel.
        meta: {
          baseline: {
            source: dto.preEventSource ?? 'none',
            // Stock de départ par PdV (BUG-378-02) : repli Logistic sur les PdV
            // sans comptage pré-event, et PdV restés sans aucun stock de départ.
            fallback: dto.baselineFallback ?? null,
            uncoveredElements: dto.baselineUncoveredElements ?? null,
          },
          salesUnjoined: dto.salesUnjoined ?? null,
          countedProgress: dto.countedProgress ?? null,
          // Q35 Option 1 : grain de la source « Vendu » ('consumption' = explosé
          // ingrédients, 'timeline' = brut article). null = document d'avant Q35.
          salesSource: dto.salesSource ?? null,
          // BUG-378-02 : provenance du prédit (version par défaut au grain
          // inventaire), prédictions non jointes et clés hors périmètre compté.
          // null = document antérieur (le front n'affiche alors aucun bandeau).
          predictedSource: dto.predictedSource ?? null,
          predictedUnjoined: dto.predictedUnjoined ?? null,
          perimeterExcluded: dto.perimeterExcluded ?? null,
          // Brouillon régénéré en cours de comptage : Logistic pas encore mis à jour.
          draft,
          ...(options.extraMeta ?? {}),
        },
        createdBy: userId ?? null,
      } as any,
    });

    // Remplace les feuilles post-event précédentes du match (après création : un échec
    // ne fait jamais perdre la dernière feuille).
    await this.prisma.stockReconciliation.deleteMany({
      where: { tenantId, spaceId, eventId: event.id, kind: 'post-event', id: { not: created.id } },
    });

    if (draft) return created;

    // Le comptage d'après-match devient la nouvelle référence du registre
    // Logistic (PDF 2026-08-21) — jusqu'ici le post-event ne touchait JAMAIS aux
    // StockLevel, et l'écart constaté était donc oublié par l'attendu du match
    // suivant.
    //
    // Source du comptage : la MÊME que le snapshot (canaux packed/loose bruts).
    // Les lignes du DTO ne portent qu'un total en unités (`countedUnits`) — s'en
    // servir obligerait à refabriquer une répartition packed/loose.
    const merged = await this.inventoryCountService.getBySpaceAndEvent(spaceId, event.id, tenantId, 'post-event');
    await this.inventoryLogisticPushService.pushCountToLogistic(
      spaceId,
      tenantId,
      'post-event',
      event,
      (merged?.inventoryCounts ?? {}) as Record<string, Record<string, any>>,
      userId,
    );

    // Fin du post-event (règle Bertrand 2026-09-29) : quand le responsable logistique ou
    // l'administrateur met à jour Logistic ET génère la réconciliation, c'est-à-dire ici
    // (la réconciliation vient de pousser le comptage). La fenêtre PIN invité est close,
    // les managers PDV n'écrivent plus. Écrit directement (GuestPinAccessModule dépend de
    // ce module, pas l'inverse), même forme que la clôture « portes ouvertes ».
    const closedAt = new Date();
    await closeInventoryWindows(
      this.prisma,
      { tenantId, spaceId, eventId: event.id, phase: 'post-event' },
      { closedAt, closedBy: userId ?? 'post-event-reconciliation', pushedToLogisticAt: closedAt },
    );

    return created;
  }

  // ── GET /inventory/:spaceId/reconciliations ──────────────────────────────────
  // Liste COMMUNE aux écrans Pre-event et Post-event Inventory (décision user
  // 2026-07-20) : documents des deux kinds, badge de type côté front. Lines
  // incluses : un space compte quelques documents, pas des milliers — la vue
  // réconciliation lit `lines` tel quel, aucun 2e fetch. Les resets logistiques
  // (kind null) restent EXCLUS (liste propre à la vue Logistic).
  // `canSeeExpected=false` (BUG-233) : les lignes des documents pre-event sont
  // EXPURGÉES de leurs attendus avant envoi — le document en base reste complet.
  async listInventoryReconciliations(spaceId: string, tenantId: string, canSeeExpected = true) {
    await this.spaceAccess.assertSpaceInTenant(spaceId, tenantId);
    const docs = await this.prisma.stockReconciliation.findMany({
      where: { tenantId, spaceId, kind: { in: ['post-event', 'pre-event'] } },
      orderBy: { createdAt: 'desc' },
      // Pas de `select` : la colonne `meta` (contexte de fabrication) doit
      // remonter avec le document, et l'énumérer explicitement casserait la
      // compilation tant que `prisma generate` n'a pas été rejoué après la
      // migration. Le document entier est de toute façon scopé au tenant.
    });
    return canSeeExpected ? docs : docs.map((d) => this.redactPreEventDoc(d));
  }

  // ── DELETE /inventory/:spaceId/reconciliations/:id ───────────────────────────
  // « Repartir de zéro » : supprimer le document puis recliquer « Générer la
  // réconciliation » (le document est une photo figée — pas d'édition, une
  // régénération). Périmètre STRICT kind pre/post-event : les resets logistiques
  // (kind null, ancre temporelle des ventes dérivées) sont hors d'atteinte.
  async deleteInventoryReconciliation(spaceId: string, id: string, tenantId: string) {
    await this.spaceAccess.assertSpaceInTenant(spaceId, tenantId);
    const doc = await this.prisma.stockReconciliation.findFirst({
      where: { id, tenantId, spaceId, kind: { in: ['post-event', 'pre-event'] } },
      select: { id: true },
    });
    if (!doc) throw new NotFoundException(`Reconciliation ${id} not found in space ${spaceId}`);
    await this.prisma.stockReconciliation.delete({ where: { id: doc.id } });
    return { id: doc.id, deleted: true };
  }

  /** BUG-233 — retire des lignes pre-event tout ce qui révèle l'attendu :
   *  `expectedPacked/Loose/Units` ET `deltaPacked/Loose/Units` (sinon
   *  reconstructible : expected = counted − delta). Les post-event (lignes
   *  fournies par le client, aucune donnée cachée) passent inchangés. */
  private redactPreEventDoc<T extends { kind?: string | null; lines?: any }>(doc: T): T {
    if (doc?.kind !== 'pre-event' || !Array.isArray(doc.lines)) return doc;
    return {
      ...doc,
      lines: doc.lines.map((l: any) => {
        if (l == null || typeof l !== 'object') return l;
        const {
          expectedPacked: _expectedPacked,
          expectedLoose: _expectedLoose,
          expectedUnits: _expectedUnits,
          deltaPacked: _deltaPacked,
          deltaLoose: _deltaLoose,
          deltaUnits: _deltaUnits,
          // `deltaVsPredicted` part aussi : counted − predicted redonnerait le
          // besoin prédit, qui relève de la même permission que l'attendu.
          // `predictedUnits` idem — c'est une donnée de pilotage, pas de comptage.
          predictedUnits: _predictedUnits,
          deltaVsPredicted: _deltaVsPredicted,
          ...rest
        } = l;
        return rest;
      }),
    };
  }


  // ── POST /inventory/:spaceId/pre-event-reconciliations ──────────────────────
  // Le BACKEND construit les lignes : le client (potentiellement sans la
  // permission « attendus ») ne les a jamais eues. Lignes en packed/loose BRUTS
  // (la conversion en unités × inventoryQuantityPackaged est un référentiel
  // front — l'affichage convertit, même approche que les lignes de reset).
  async createPreEventReconciliation(
    spaceId: string,
    eventId: string,
    tenantId: string,
    userId?: string,
    canSeeExpected = true,
    // Besoin prédit fourni par le client (scénario Event Predict par défaut) :
    // le serveur ne réimplémente pas la prédiction, il l'archive.
    predictedUnits?: Record<string, Record<string, number>> | null,
    // Contexte de génération automatique (PreEventInventoryFlowService :
    // trigger, feuille remplacée...) archivé dans `meta` à côté du reste.
    extraMeta: Record<string, unknown> = {},
    // Lignes de la feuille pre-event précédente du match : une ligne validée déjà
    // poussée vers Logistic et inchangée depuis est REPRISE telle quelle (attendu et
    // écart figés au moment du comptage). La recalculer relirait un attendu Logistic
    // qui contient déjà ce comptage, et l'écart retomberait à 0 à chaque régénération.
    previousLines: unknown = null,
    // PDV à pousser vers Logistic (undefined = tous, [] = aucun). Après l'ouverture des
    // portes, la mise à jour de Logistic est manuelle et par PDV (règle Bertrand 2026-09-29) :
    // la feuille reste régénérée pour tous, seul le PDV demandé part vers le registre.
    pushElementIds?: string[],
  ) {
    this.logger.log(`POST /inventory/${spaceId}/pre-event-reconciliations eventId=${eventId}`);
    await this.spaceAccess.assertSpaceInTenant(spaceId, tenantId);
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, spaceId, tenantId },
      select: { id: true, name: true },
    });
    if (!event) throw new NotFoundException(`Event ${eventId} not found in space ${spaceId}`);

    // Compté = fusion existante (InventoryCount prioritaire sur snapshot).
    // Cast : la branche snapshot renvoie un Json Prisma, mais son écriture ne
    // passe que par upsertInventory (blob objet) — jamais un scalaire.
    const merged = await this.inventoryCountService.getBySpaceAndEvent(spaceId, eventId, tenantId, 'pre-event');
    const countedBlob = (merged?.inventoryCounts ?? {}) as Record<string, Record<string, any>>;
    const pushState = await this.inventoryLogisticPushService.loadLogisticPushState(spaceId, eventId, tenantId);
    const previousByKey = new Map<string, Record<string, any>>();
    if (Array.isArray(previousLines)) {
      for (const l of previousLines as Array<Record<string, any>>) {
        if (l?.countedSource !== 'count') continue;
        if (typeof l?.elementId !== 'string' || typeof l?.itemKey !== 'string') continue;
        previousByKey.set(`${l.elementId}::${l.itemKey}`, l);
      }
    }

    // Attendus à l'instant de la sauvegarde — MÊME chemin que le GET
    // pre-event-baseline (PDF v3 2026-08-21 : Total Logistic) : hints à l'écran
    // et lignes de réconciliation ne peuvent pas diverger.
    const { expected, asOf, aliasGroups } = await this.inventoryBaselineService.computeLogisticExpected(spaceId, tenantId);

    // Union des clés attendu ∪ compté. L'attendu Logistic est exposé sous TOUS les ids
    // de catalogue du nom (MenuItem, MarketPrice, MenuComponent, cf. catalogIdsByNormName) :
    // pour un (élément × nom) donné, on garde les ids COMPTÉS s'il y en a, sinon le seul id
    // principal. Sans ce filtre, « Coca-Cola CAN 33cl » compté sous son id MarketPrice
    // sortait deux fois : la ligne comptée, et une ligne « (L) » sous l'id MenuItem.
    const keys = new Set<string>();
    for (const [shopId, byItem] of Object.entries(countedBlob)) {
      for (const itemId of Object.keys(byItem ?? {})) keys.add(`${shopId}::${itemId}`);
    }
    for (const [groupKey, ids] of aliasGroups) {
      const elementId = groupKey.split('::')[0];
      const counted = ids.filter((id) => countedBlob?.[elementId]?.[id] != null);
      if (counted.length) continue; // déjà dans keys via le blob compté
      keys.add(`${elementId}::${ids[0]}`);
    }

    // Dénormalisation noms (éléments + items) pour l'affichage/export. Identité article
    // résolue dans TOUS les catalogues (même chemin que le push Logistic) : une ligne
    // comptée sous un id MarketPrice ou MenuComponent n'est plus une « orpheline ».
    const elementIds = new Set<string>();
    const itemIds = new Set<string>();
    for (const k of keys) {
      const [el, item] = k.split('::');
      if (el) elementIds.add(el);
      if (item) itemIds.add(item);
    }
    const [elements, identities] = await Promise.all([
      elementIds.size
        ? this.prisma.spaceElement.findMany({
            where: { id: { in: [...elementIds] } },
            select: { id: true, name: true },
          })
        : [],
      this.inventoryUnitResolverService.resolveItemKeysByIds([...itemIds], tenantId),
    ]);
    const elementNameById = new Map<string, string>(
      (elements as Array<{ id: string; name: string }>).map((e) => [e.id, e.name]),
    );
    const itemNameById = new Map<string, string>(
      [...identities].map(([id, v]) => [id, v.name]),
    );

    const round2 = (n: number) => Math.round(n * 100) / 100;
    // Exclusion des lignes orphelines : comptages dont l'itemId/elementId ne résout plus aucun
    // article de catalogue / SpaceElement courant (catalogue ré-importé → anciens ids
    // supprimés). Sans nom récupérable en base, ces lignes s'affichaient « — » ; on les retire
    // du document plutôt que de les afficher sans nom. Filtre sur la PRÉSENCE de l'id dans la
    // map (`.has`), pas sur le nom : un article courant au nom légitimement vide reste conservé.
    const resolvableKeys = [...keys].filter((k) => {
      const [elementId, itemId] = k.split('::');
      return elementNameById.has(elementId) && itemNameById.has(itemId);
    });
    const orphanCount = keys.size - resolvableKeys.length;
    if (orphanCount > 0) {
      this.logger.warn(
        `pre-event reconciliation ${spaceId}/${eventId}: ${orphanCount} orphan line(s) excluded ` +
          `(itemId/elementId absent du catalogue courant)`,
      );
    }
    // Conditionnement de l'INVENTAIRE par article (BUG-239) : les lignes portent
    // désormais `unitsPerPack` + les totaux en unités, pour que la vue n'ait pas
    // à reconvertir avec un référentiel potentiellement différent de celui du
    // calcul.
    const invUppByItemId = await this.inventoryUnitResolverService.resolveInventoryUnitsPerPack([...itemIds], tenantId);
    const uppOf = (itemId: string) => {
      const v = Number(invUppByItemId.get(itemId));
      return v > 0 ? v : 1;
    };

    let carriedCount = 0;
    const lines = resolvableKeys.map((k) => {
      const [elementId, itemId] = k.split('::');
      const exp = expected.get(k) ?? null;
      const counted = countedBlob?.[elementId]?.[itemId] ?? null;
      // BUG-383-02 (critère Doors Open) : une ligne sans comptage VALIDÉ prend la valeur
      // actuelle de Logistic (écart 0) et est marquée `countedSource: 'logistic'`, affichée
      // « (L) ». Le document ne peut plus contredire le registre, qui garde lui aussi cette
      // valeur (le push ne concerne que les lignes validées). Une saisie non cochée
      // « compté » n'est pas un comptage. Sans état Logistic ni comptage : 0, `'none'`.
      const isValidated = counted?.isCounted === true;
      // Besoin prédit (Event Predict) : deuxième référence du document. L'attendu
      // Logistic dit « ce que la Logistique pense qu'il y a », celui-ci « ce que
      // le scénario demande d'avoir » — les deux écarts se lisent ensemble.
      const predictedRaw = predictedUnits?.[elementId]?.[itemId];
      const predicted = Number.isFinite(Number(predictedRaw)) ? round2(Number(predictedRaw)) : null;
      // Ligne validée, déjà poussée, inchangée depuis : reprise de la feuille précédente
      // (cf. `previousLines`). Seul le besoin prédit est rafraîchi s'il est fourni.
      const previous = previousByKey.get(k);
      if (isValidated && previous && !this.inventoryLogisticPushService.isPendingLogisticPush(pushState, elementId, itemId)) {
        carriedCount += 1;
        const prevCountedUnits = Number.isFinite(Number(previous.countedUnits))
          ? Number(previous.countedUnits)
          : null;
        const keptPredicted = predicted ?? (Number.isFinite(Number(previous.predictedUnits)) ? Number(previous.predictedUnits) : null);
        return {
          ...previous,
          predictedUnits: keptPredicted,
          deltaVsPredicted:
            keptPredicted == null || prevCountedUnits == null ? null : round2(prevCountedUnits - keptPredicted),
        };
      }
      const countedSource: 'count' | 'logistic' | 'none' = isValidated ? 'count' : exp ? 'logistic' : 'none';
      const countedPacked = isValidated ? Number(counted?.packedUnits) || 0 : exp ? exp.packed : 0;
      const countedLoose = round2(isValidated ? Number(counted?.looseUnits) || 0 : exp ? exp.loose : 0);
      // Conditionnement connu (> 1) uniquement : sinon on laisse la vue
      // convertir avec le référentiel affiché, comme avant (pas de « pack de 1 »
      // fabriqué qui écraserait un conditionnement réel côté écran).
      const q = uppOf(itemId);
      const unitsPerPack = q > 1 ? q : null;
      const countedUnits = unitsPerPack ? round2(countedPacked * unitsPerPack + countedLoose) : null;
      // Article absent du registre Logistic (jamais approvisionné) → attendu/écart
      // null (« — »), jamais 0 fabriqué (décision 2026-07-20, conservée avec la
      // source « état Logistic », décision JLH 2026-08-20).
      const expectedPacked = exp ? exp.packed : null;
      const expectedLoose = exp ? round2(exp.loose) : null;
      const expectedUnits =
        exp && unitsPerPack ? round2(exp.units ?? exp.packed * unitsPerPack + exp.loose) : null;
      return {
        elementId,
        elementName: elementNameById.get(elementId) ?? '',
        itemKey: itemId,
        itemName: itemNameById.get(itemId) ?? '',
        // Catalogue d'origine de l'id (menuItem | marketPrice | menuComponent | ingredient | packaging).
        itemKind: identities.get(itemId)?.kind ?? null,
        unitsPerPack,
        expectedPacked,
        expectedLoose,
        expectedUnits,
        countedPacked,
        countedLoose,
        countedUnits,
        countedSource,
        deltaPacked: expectedPacked == null ? null : countedPacked - expectedPacked,
        deltaLoose: expectedLoose == null ? null : round2(countedLoose - expectedLoose),
        deltaUnits:
          expectedUnits == null || countedUnits == null
            ? null
            : round2(countedUnits - expectedUnits),
        predictedUnits: predicted,
        deltaVsPredicted:
          predicted == null || countedUnits == null ? null : round2(countedUnits - predicted),
      };
    });

    const created = await this.prisma.stockReconciliation.create({
      data: {
        tenantId,
        spaceId,
        eventId: event.id,
        eventName: event.name ?? null,
        kind: 'pre-event',
        lines: lines as any,
        // Contexte de fabrication (BUG-235/238/241) : ce qui a été écarté du
        // document doit rester lisible sur l'archive.
        meta: {
          baseline: { source: 'logistic-live', asOf },
          orphanLinesExcluded: orphanCount,
          // Le document porte-t-il la comparaison au scénario ? Sans marqueur, une
          // colonne prédit vide se confond avec « rien n'était prédit ».
          predictedSource: predictedUnits ? 'event-predict-default-version' : 'none',
          // Lignes reprises de la feuille précédente (déjà poussées, inchangées).
          carriedLines: carriedCount,
          ...extraMeta,
        },
        createdBy: userId ?? null,
      } as any,
    });
    // Le comptage devient la nouvelle référence du registre Logistic (PDF
    // 2026-08-21). Après la création du document : un échec de recalage ne doit
    // jamais faire perdre la réconciliation. Push incrémental : seules les lignes
    // nouvelles ou modifiées depuis leur dernier push partent vers le registre.
    const push = await this.inventoryLogisticPushService.pushCountToLogistic(
      spaceId,
      tenantId,
      'pre-event',
      event,
      pickElements(countedBlob, pushElementIds),
      userId,
      pushState,
    );
    // Résultat du push archivé sur le document : ce qui est parti vers le registre à
    // cette génération (les lignes reprises l'étaient déjà), ou pourquoi rien n'est parti.
    const metaWithPush = {
      ...((created as any).meta ?? {}),
      logisticPush: { ok: push.ok, reason: push.reason ?? null, lineCount: push.lineCount ?? 0 },
    };
    await this.prisma.stockReconciliation.update({
      where: { id: created.id },
      data: { meta: metaWithPush as any },
    });
    (created as any).meta = metaWithPush;

    // BUG-233 : le document persisté est complet ; la RÉPONSE est expurgée pour
    // un appelant sans `front.fb.preInventoryExpected` (il a le droit de créer,
    // pas de voir les attendus).
    return canSeeExpected ? created : this.redactPreEventDoc(created as any);
  }
}
