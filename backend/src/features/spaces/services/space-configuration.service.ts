import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { RedisService } from '../../../core/redis/redis.service';
import { SpaceAccessService } from '../../../core/auth/space-access.service';
import { CurrentUserData } from '../../../core/auth/decorators/current-user.decorator';
import { createSpaceElementWithUniqueSlug } from '../../../shared/utils/generate-space-element-slug';
import { SpaceCacheService } from './space-cache.service';
import { SpaceCrudService } from './space-crud.service';
import { SpaceZoneElementsService, toV1JsonElement } from './space-zone-elements.service';

/**
 * Configurations d'espace : lecture, sauvegarde et réconciliation JSON / tables (voir plan D4).
 */
@Injectable()
export class SpaceConfigurationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly spaceAccess: SpaceAccessService,
    private readonly spaceCacheService: SpaceCacheService,
    private readonly spaceCrudService: SpaceCrudService,
    private readonly spaceZoneElementsService: SpaceZoneElementsService,
  ) {}

  /**
   * Get configurations for a space (optimized - no double verification)
   */
  async getConfigurations(spaceId: string, tenantId: string) {
    // Cache court (30s) : chaque round-trip Postgres coûte ~1s de latence réseau
    // (mesuré) — la clé inclut tenantId, donc un hit ne peut provenir que du même
    // tenant qui l'a écrit (isolation préservée même en cas de hit).
    const cacheKey = this.spaceCacheService.SPACE_CONFIGS_CACHE_KEY(tenantId, spaceId);
    const cached = await this.redis.get<any>(cacheKey);
    if (cached) return cached;

    // Direct query with tenant verification in the join
    const configurations = await this.prisma.config.findMany({
      where: {
        spaceId,
        space: {
          tenantId, // Verify tenant access directly in query
        },
      },
      // Configs utilisateur (isSystem=false) d'abord, puis par ancienneté : la
      // config par défaut sélectionnée côté builder (configs[0]) est donc toujours
      // une config utilisateur, jamais l'import interne « Weezevent Import ».
      orderBy: [
        { isSystem: 'asc' },
        { createdAt: 'asc' },
      ],
      select: {
        id: true,
        name: true,
        capacity: true,
        isSystem: true,
        createdAt: true,
        updatedAt: true,
        // Don't include full data here - it's loaded separately when needed
        _count: {
          select: {
            floors: true,
            stations: true,
          },
        },
      },
    });

    await this.redis.set(cacheKey, configurations, { ttl: this.spaceCacheService.SPACE_CONFIGS_CACHE_TTL });
    return configurations;
  }

  /**
   * Create or update a configuration with normalized tables
   */
  /**
   * Reconcile un élément de plan (UPSERT par id) au lieu de delete+recreate.
   * Clé du fix « PDV démappés » : si le client renvoie `element.id`, la row est mise à jour EN
   * PLACE → `SpaceElement.id` reste IMMUABLE, donc `WeezeventLocationShopMapping.spaceElementId`
   * et les `MenuAssignment` restent valides. Sans id → vrai nouvel élément (create).
   * Les données filles (performance/staff/inventory) ne sont remplacées QUE si le payload les
   * fournit (sinon préservées — l'ancien delete+recreate les perdait silencieusement).
   */
  private async reconcileElement(
    tx: any,
    element: any,
    parent: { floorId?: string | null; forecourtId?: string | null },
    seenElementIds: Set<string>,
    existingElementIds: Set<string>,
    // Config du floor/forecourt en cours de save : scope des données filles
    // perf/staff/inventaire (tables scopées par config depuis 20260704190000).
    configId: string,
  ) {
    const originalType = element.type;
    const data: any = {
      floorId: parent.floorId ?? null,
      forecourtId: parent.forecourtId ?? null,
      externalMerchId: null,
      name: element.name || 'Element',
      type: this.spaceZoneElementsService.mapElementType(element.type),
      x: element.x || 0,
      y: element.y || 0,
      width: element.width || 80,
      height: element.height || 60,
      depth: element.depth || element.height || 60,
      height3d: element.height3d || 25,
      rotation: element.rotation || 0,
      image: element.image || null,
      notes: element.notes || null,
      capacity: element.capacity || null,
      cornerRadiusTL: element.cornerRadius?.topLeft || 0,
      cornerRadiusTR: element.cornerRadius?.topRight || 0,
      cornerRadiusBL: element.cornerRadius?.bottomLeft || 0,
      cornerRadiusBR: element.cornerRadius?.bottomRight || 0,
      shopTypes: element.shopType || [],
      storageTypes: element.storageType || [],
      hospitalityTypes: element.hospitalityType || [],
      accessTypes: element.accessType || [],
      entertainmentTypes: element.entertainmentType || [],
      entranceTypes: element.entranceType || [],
      kitchenTypes: element.kitchenType || [],
      tags: element.tags || [],
      attributes: { ...element.attributes, originalType },
    };

    // UPDATE en place UNIQUEMENT si l'id appartient déjà à CETTE config (id immuable → mappings
    // préservés). Un id absent (nouvel élément) ou étranger à la config → CREATE avec un id frais,
    // pour ne jamais déplacer par erreur l'élément d'une autre config (l'id client est ignoré).
    // Le slug (accès invité PIN) n'est généré qu'à la création — jamais recalculé sur un
    // renommage, un lien/QR déjà imprimé doit rester valable.
    const createdElement = element.id && existingElementIds.has(element.id)
      ? await tx.spaceElement.update({ where: { id: element.id }, data })
      : await createSpaceElementWithUniqueSlug(tx, data.name, (slug) => ({ ...data, slug }));
    element.id = createdElement.id;
    seenElementIds.add(createdElement.id);

    // Remplacements scopés à LA config sauvée : un élément v1 n'appartient qu'à une
    // config, mais le scope explicite évite d'écraser des lignes d'une autre config si
    // l'élément est un jour migré/partagé en v2.
    if (element.performance) {
      await tx.elementPerformance.deleteMany({ where: { elementId: createdElement.id, configId } });
      await tx.elementPerformance.create({
        data: {
          elementId: createdElement.id,
          configId,
          revenue: element.performance.revenue || 0,
          numberOfPOS: element.performance.numberOfPOS || 0,
          numberOfTransactions: element.performance.numberOfTransactions || 0,
          transactionsPerMinute: element.performance.transactionsPerMinute || 0,
          staffCost: element.performance.staffCost || 0,
          revenuePerEmployee: element.performance.revenuePerEmployee || 0,
        },
      });
    }

    if (Array.isArray(element.staffPositions) && element.staffPositions.length > 0) {
      await tx.elementStaff.deleteMany({ where: { elementId: createdElement.id, configId } });
      await tx.elementStaff.createMany({
        data: element.staffPositions.map((pos: any) => ({
          elementId: createdElement.id,
          configId,
          position: pos.position,
          count: pos.count || 1,
          hourlyRate: pos.hourlyRate || null,
        })),
      });
    }

    if (Array.isArray(element.inventoryItems) && element.inventoryItems.length > 0) {
      await tx.elementInventory.deleteMany({ where: { elementId: createdElement.id, configId } });
      await tx.elementInventory.createMany({
        data: element.inventoryItems.map((item: any) => ({
          elementId: createdElement.id,
          configId,
          name: item.name,
          quantity: item.quantity || 0,
          unit: item.unit || null,
          minStock: item.minStock || null,
          maxStock: item.maxStock || null,
          isCustom: item.isCustom !== false,
          menuItemId: item.menuItemId || null,
        })),
      });
    }

    return createdElement;
  }

  async saveConfiguration(dto: any, tenantId: string) {
    // Verify space exists and belongs to tenant
    await this.spaceCrudService.findOne(dto.spaceId, tenantId);

    if (dto.id) {
      // Check if config exists without throwing exception
      const existingConfig = await this.prisma.config.findFirst({
        where: {
          id: dto.id,
          space: {
            tenantId,
          },
        },
      });

      // If config exists, verify it belongs to the correct space
      if (existingConfig && existingConfig.spaceId !== dto.spaceId) {
        throw new ForbiddenException('Configuration does not belong to the provided space');
      }
    }

    // Extract floors and elements from data
    const floors = dto.data?.floors || [];
    const forecourt = dto.data?.forecourt || null;

    // ── Blindage cohabitation Builder v2 ──────────────────────────────────────
    // getConfiguration expose les éléments v2 en LECTURE : un save v1 peut donc les
    // recevoir dans son payload. On les retire (jamais créés/déplacés/écrasés par le
    // chemin v1) et on les protège plus bas du prune (jamais supprimés par un save v1).
    const v2Rows = await this.prisma.spaceElement.findMany({
      where: { zone: { spaceId: dto.spaceId } },
      select: { id: true },
    });
    const v2ManagedIds = new Set(v2Rows.map((r) => r.id));
    if (v2ManagedIds.size > 0) {
      const stripV2 = (els: any[]) =>
        (els || []).filter((el: any) => !(el?.id && v2ManagedIds.has(el.id)) && !el?.attributes?.managedByBuilderV2);
      for (const f of floors) {
        if (Array.isArray(f.elements)) f.elements = stripV2(f.elements);
      }
      if (forecourt && Array.isArray(forecourt.elements)) forecourt.elements = stripV2(forecourt.elements);
      if (dto.data?.externalMerch && Array.isArray(dto.data.externalMerch.elements)) {
        dto.data.externalMerch.elements = stripV2(dto.data.externalMerch.elements);
      }
    }

    // Use a transaction to ensure data consistency
    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Create or update the config
      let config;
      if (dto.id) {
        config = await tx.config.upsert({
          where: { id: dto.id },
          update: {
            name: dto.name,
            capacity: dto.capacity,
            data: dto.data,
            updatedAt: new Date(),
          },
          create: {
            id: dto.id,
            name: dto.name,
            spaceId: dto.spaceId,
            capacity: dto.capacity,
            data: dto.data,
          },
        });
      } else {
        config = await tx.config.create({
          data: {
            name: dto.name,
            spaceId: dto.spaceId,
            capacity: dto.capacity,
            data: dto.data,
          } as any,
        });
      }

      // 2a. Safety guard: preserve elements that have Weezevent mappings but are absent from
      // the incoming JSON (can happen with legacy data created before the JSON-sync fix).
      // We re-inject them into the floors payload so deleteMany + recreate keeps them intact.
      if (dto.id) {
        // Collect all element IDs already present in the incoming JSON payload
        const incomingElementIds = new Set<string>();
        for (const f of floors) {
          for (const el of f.elements || []) {
            if (el.id) incomingElementIds.add(el.id);
          }
        }
        for (const fce of forecourt?.elements || []) {
          if (fce.id) incomingElementIds.add(fce.id);
        }

        // Find existing elements in this config that have Weezevent mappings
        const existingFloors = await tx.floor.findMany({
          where: { configId: config.id },
          include: { elements: true },
        });
        const allExistingElements = existingFloors.flatMap((f: any) => f.elements);
        const existingIds = allExistingElements.map((e: any) => e.id);

        if (existingIds.length > 0) {
          const mappedElements = await tx.locationShopMapping.findMany({
            where: { spaceElementId: { in: existingIds } },
            select: { spaceElementId: true },
          });
          const mappedIds = new Set(mappedElements.map((m: any) => m.spaceElementId));

          // Elements that have mappings but are not in the incoming JSON
          const orphaned = allExistingElements.filter(
            (e: any) => mappedIds.has(e.id) && !incomingElementIds.has(e.id) && !v2ManagedIds.has(e.id),
          );

          if (orphaned.length > 0) {
            // Ré-injecter les éléments mappés absents du JSON pour ne pas les perdre au
            // delete+recreate — SANS jamais créer de floor « Import ». On les loge sur le
            // 1er floor existant du payload (RDC en priorité), sinon on crée un RDC neutre.
            let orphanFloor =
              floors.find((f: any) => f.level === 0) ?? floors[0];
            if (!orphanFloor) {
              orphanFloor = {
                name: 'RDC',
                level: 0,
                width: 100,
                height: 4,
                length: 100,
                elements: [],
                cornerRadius: { topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 },
                hole: { enabled: false, x: 0.5, y: 0.5, width: 10, length: 10, cornerRadius: { topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 } },
              };
              floors.push(orphanFloor);
            }
            if (!Array.isArray(orphanFloor.elements)) orphanFloor.elements = [];

            for (const el of orphaned) {
              orphanFloor.elements.push(toV1JsonElement(el, { width: 80, height: 60, depth: 60 }));
            }

            console.warn(
              `[saveConfiguration] Re-injected ${orphaned.length} Weezevent-mapped element(s) absent from JSON payload for config ${config.id}`,
            );
          }
        }
      }

      // 2b. Capture des MenuAssignment des éléments de cette config AVANT le delete
      // (cascade Floor → SpaceElement → MenuAssignment). Ils ne sont pas sérialisés dans
      // le JSON ; sans cette sauvegarde, delete+recreate les perdrait. Les ids d'éléments
      // étant préservés à la recréation (`...(element.id ? { id } : {})`), on peut les ré-insérer.
      const preservedAssignments = await tx.menuAssignment.findMany({
        where: {
          OR: [
            { element: { floor: { configId: config.id } } },
            { element: { forecourt: { configId: config.id } } },
          ],
        },
        select: { elementId: true, menuItemId: true, enabled: true, configId: true },
      });

      // 2c. RECONCILE (plus de delete+recreate). C'est LA correction du bug « PDV démappés » :
      // `SpaceElement.id` devient IMMUABLE, donc WeezeventLocationShopMapping.spaceElementId
      // (String SANS FK → dangling silencieux) et les MenuAssignment restent valides au lieu
      // d'être orphelinés à chaque sauvegarde. On charge l'état existant pour pruner après coup.
      const existingFloorsForReconcile = await tx.floor.findMany({
        where: { configId: config.id },
        include: { elements: { select: { id: true } } },
      });
      const existingForecourtsForReconcile = await tx.forecourt.findMany({
        where: { configId: config.id },
        include: { elements: { select: { id: true } } },
      });
      const existingElementIds: string[] = [
        ...existingFloorsForReconcile.flatMap((f: any) => f.elements.map((e: any) => e.id)),
        ...existingForecourtsForReconcile.flatMap((fc: any) => fc.elements.map((e: any) => e.id)),
      ];
      // Éléments protégés (porteurs d'un mapping Weezevent) : JAMAIS supprimés, même absents
      // du payload — sinon le mapping deviendrait orphelin.
      const protectedElementIds = new Set<string>(
        existingElementIds.length > 0
          ? (
              await tx.locationShopMapping.findMany({
                where: { spaceElementId: { in: existingElementIds } },
                select: { spaceElementId: true },
              })
            ).map((m: any) => m.spaceElementId)
          : [],
      );
      const existingElementIdSet = new Set<string>(existingElementIds);
      const seenFloorIds = new Set<string>();
      const seenForecourtIds = new Set<string>();
      const seenElementIds = new Set<string>();

      // 3. Reconcile floors + their elements (UPSERT en place — ids préservés)
      for (const floor of floors) {
        const floorData = {
          configId: config.id,
          name: floor.name,
          level: floor.level || 0,
          width: floor.width || 800,
          height: floor.height || 600,
          length: floor.length || 100,
          cornerRadius: floor.cornerRadius || null,
        };
        // Match par id (échoté par le client) → UPDATE ; sinon par niveau pour adopter la row
        // existante au lieu d'en créer une 2ᵉ au même level ; sinon CREATE.
        let dbFloor = floor.id
          ? existingFloorsForReconcile.find((f: any) => f.id === floor.id)
          : undefined;
        if (!dbFloor) {
          dbFloor = existingFloorsForReconcile.find(
            (f: any) => !seenFloorIds.has(f.id) && (f.level ?? 0) === (floor.level || 0),
          );
        }
        // CREATE : id généré par Prisma — on n'honore jamais un `floor.id` étranger à cette config
        // (sinon collision de PK lors d'une duplication d'espace qui réutilise les ids d'origine).
        // Si `floor.id` appartenait à la config, `dbFloor` l'aurait déjà matché → UPDATE.
        const createdFloor = dbFloor
          ? await tx.floor.update({ where: { id: dbFloor.id }, data: floorData as any })
          : await tx.floor.create({ data: floorData as any });
        // Keep the JSON floor id in sync with the relational row (getConfiguration dedup par level).
        floor.id = createdFloor.id;
        seenFloorIds.add(createdFloor.id);

        // Éléments indépendants entre eux → en parallèle (pipelinés sur la connexion de la
        // transaction), sinon la latence pooler (~200ms) est payée en série par élément.
        await Promise.all(
          (floor.elements || []).map((element: any) =>
            this.reconcileElement(tx, element, { floorId: createdFloor.id }, seenElementIds, existingElementIdSet, config.id),
          ),
        );
      }

      // 4. Reconcile forecourt (UPSERT en place — id préservé)
      if (forecourt) {
        const forecourtData = {
          configId: config.id,
          name: forecourt.name || 'Parvis',
          width: forecourt.width || 1000,
          length: forecourt.length || 500,
        };
        const dbForecourt = forecourt.id
          ? existingForecourtsForReconcile.find((fc: any) => fc.id === forecourt.id)
          : existingForecourtsForReconcile.find((fc: any) => !seenForecourtIds.has(fc.id));
        // CREATE : id généré (jamais d'id forecourt étranger — cf. note floors ci-dessus).
        const createdForecourt = dbForecourt
          ? await tx.forecourt.update({ where: { id: dbForecourt.id }, data: forecourtData as any })
          : await tx.forecourt.create({ data: forecourtData as any });
        forecourt.id = createdForecourt.id;
        seenForecourtIds.add(createdForecourt.id);

        // Reconcile forecourt elements (en parallèle — cf. note floors)
        await Promise.all(
          (forecourt.elements || []).map((element: any) =>
            this.reconcileElement(tx, element, { forecourtId: createdForecourt.id }, seenElementIds, existingElementIdSet, config.id),
          ),
        );
      }

      // 4b. PRUNE : supprimer les éléments réellement retirés du payload, en épargnant TOUJOURS
      // les éléments protégés (mapping Weezevent) — remplace le delete global d'avant tout en
      // garantissant qu'aucun mapping ne devient orphelin.
      const elementsToDelete = existingElementIds.filter(
        (id) => !seenElementIds.has(id) && !protectedElementIds.has(id) && !v2ManagedIds.has(id),
      );
      if (elementsToDelete.length > 0) {
        await tx.spaceElement.deleteMany({ where: { id: { in: elementsToDelete } } });
      }
      // Floors absents du payload : supprimés seulement s'ils ne retiennent aucun élément protégé.
      for (const f of existingFloorsForReconcile) {
        if (seenFloorIds.has(f.id)) continue;
        if (!f.elements.some((e: any) => protectedElementIds.has(e.id) || v2ManagedIds.has(e.id))) {
          await tx.floor.delete({ where: { id: f.id } });
        }
      }
      // Forecourts : ne pruner que si le payload gère le forecourt (forecourt non-null),
      // pour préserver le comportement « null = ne pas toucher au parvis existant ».
      if (forecourt) {
        for (const fc of existingForecourtsForReconcile) {
          if (seenForecourtIds.has(fc.id)) continue;
          if (!fc.elements.some((e: any) => protectedElementIds.has(e.id) || v2ManagedIds.has(e.id))) {
            await tx.forecourt.delete({ where: { id: fc.id } });
          }
        }
      }

      // 5. Restaurer les MenuAssignment capturés en 2b pour les éléments recréés
      // (ids préservés). Seuls ceux dont l'élément existe encore sont ré-insérés ;
      // skipDuplicates respecte la contrainte @@unique([elementId, menuItemId, configId]).
      if (preservedAssignments.length > 0) {
        const assignmentElementIds = [
          ...new Set(preservedAssignments.map((a) => a.elementId).filter((id): id is string => !!id)),
        ];
        const stillExisting = await tx.spaceElement.findMany({
          where: { id: { in: assignmentElementIds } },
          select: { id: true },
        });
        const existingIds = new Set(stillExisting.map((e) => e.id));
        const toRestore = preservedAssignments.filter((a) => a.elementId && existingIds.has(a.elementId));
        if (toRestore.length > 0) {
          await tx.menuAssignment.createMany({
            data: toRestore.map((a) => ({
              elementId: a.elementId!,
              menuItemId: a.menuItemId,
              enabled: a.enabled,
              configId: a.configId, // scope config préservé (v1 : config du floor/forecourt parent)
            })),
            skipDuplicates: true,
          });
        }
      }

      // 6. Persist the reconciled JSON: floor/element ids generated by Prisma above were
      // written back into `floors`/`forecourt`, so re-saving config.data keeps the JSON
      // blob and the relational rows on the SAME ids. Without this, a floor created
      // without an id (3D Builder) keeps id=null in JSON while its relational row gets a
      // cuid → getConfiguration would otherwise emit duplicate floors at the same level.
      const reconciledData = { ...(dto.data || {}), floors };
      if (forecourt !== null) reconciledData.forecourt = forecourt;
      await tx.config.update({ where: { id: config.id }, data: { data: reconciledData } });

      // Return the config WITH the reconciled data so the caller (3D Builder) can adopt
      // the real floor/element ids instead of keeping its temporary client-side ones.
      return { ...config, data: reconciledData };
    }, {
      // Le reconcile émet ~1 requête par élément ; via le pooler Supabase (~200ms RTT),
      // une grosse config dépasse le timeout par défaut de 5s → « Transaction not found ».
      timeout: 30_000,
      maxWait: 10_000,
    });

    // Le builder crée/déplace/supprime des SpaceElements — invalide le cache shops/configs
    // de cet espace (jusqu'ici absent : la 3D Builder pouvait laisser /space-menus figé
    // jusqu'à expiration du TTL).
    await this.spaceCacheService.invalidateSpaceCache(tenantId, dto.spaceId);
    return result;
  }

  /**
   * Get a single configuration by ID
   * Optimized: Uses JSON blob for fast display, normalized tables for queries
   */
  async getConfiguration(configId: string, tenantId: string, user?: Pick<CurrentUserData, 'id' | 'isSuperAdmin' | 'isOwner' | 'allSpacesAccess'>) {
    // Fast query - only get config with JSON data
    const config = await this.prisma.config.findFirst({
      where: {
        id: configId,
        space: {
          tenantId,
        },
      },
      select: {
        id: true,
        name: true,
        spaceId: true,
        capacity: true,
        isSystem: true,
        data: true,
        createdAt: true,
        updatedAt: true,
        space: {
          select: {
            id: true,
            name: true,
            tenantId: true,
          },
        },
      },
    });

    if (!config) {
      throw new NotFoundException(`Configuration with ID ${configId} not found`);
    }
    await this.spaceAccess.assertCanAccessSpace(user, config.spaceId);

    const jsonData = config.data as any;
    const rawJsonFloors: any[] = Array.isArray(jsonData?.floors) ? jsonData.floors : [];

    // Relational Floor/SpaceElement rows are the source of truth for elements created
    // outside the 3D Builder (Data Integration: quickCreateElement / assign-floor).
    const relationalFloors = await this.prisma.floor.findMany({
      where: { configId },
      include: { elements: true },
    });

    // ── Collapse floors by business key = `level` ───────────────────────────────
    // The Space Builder (front) dedupes floors by `level`; if this endpoint returns
    // two floors sharing the same level it silently keeps one and DROPS the other's
    // elements. That desync happens whenever a floor's id diverges between `config.data`
    // (JSON) and the relational `Floor` row — e.g. a 3D-Builder save that created the
    // floor without an id → generated cuid never written back to JSON, then Data
    // Integration adds shops under the relational id. To be robust to such data we merge
    // EVERYTHING into exactly one floor per level, combining all elements (deduped by id).
    const levelKey = (f: any): number =>
      typeof f?.level === 'number' && !Number.isNaN(f.level) ? f.level : 0;

    interface LevelBucket {
      base: any | null;             // geometry / hole / name (JSON when available)
      baseId?: string;              // a real floor id seen in the JSON for this level
      elements: Map<string, any>;   // element id → serialized element
      idlessElements: any[];        // JSON elements without an id (kept as-is)
      relFloors: { id: string; count: number }[];
    }
    const byLevel = new Map<number, LevelBucket>();
    const bucketFor = (lvl: number): LevelBucket => {
      let b = byLevel.get(lvl);
      if (!b) {
        b = { base: null, elements: new Map(), idlessElements: [], relFloors: [] };
        byLevel.set(lvl, b);
      }
      return b;
    };

    // 1. Seed from JSON floors (carry geometry + already-serialized elements).
    for (const jf of rawJsonFloors) {
      const b = bucketFor(levelKey(jf));
      if (!b.base) b.base = { ...jf, elements: [] };
      if (!b.baseId && jf.id) {
        b.baseId = jf.id;
        b.base = { ...b.base, ...jf, id: jf.id, elements: [] };
      }
      for (const el of jf.elements || []) {
        if (el?.id) {
          if (!b.elements.has(el.id)) b.elements.set(el.id, el);
        } else {
          b.idlessElements.push(el);
        }
      }
    }

    // 2. Merge relational floors + their elements.
    for (const relFloor of relationalFloors) {
      const b = bucketFor(relFloor.level ?? 0);
      b.relFloors.push({ id: relFloor.id, count: relFloor.elements.length });
      if (!b.base) {
        b.base = {
          id: relFloor.id,
          name: relFloor.name,
          level: relFloor.level ?? 0,
          width: relFloor.width ?? 800,
          height: relFloor.height ?? 600,
          length: relFloor.length ?? 100,
          elements: [],
          cornerRadius: { topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 },
          hole: { enabled: false, x: 0.5, y: 0.5, width: 10, length: 10, cornerRadius: { topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 } },
        };
      }

      // Inject any relational element not yet present (deduped by id across both sources)
      for (const el of relFloor.elements) {
        if (b.elements.has(el.id)) continue;
        const attrs = el.attributes as any;
        b.elements.set(el.id, {
          id: el.id,
          name: el.name,
          type: attrs?.originalType ?? this.spaceZoneElementsService.reverseMapElementType(el.type),
          x: el.x ?? 0,
          y: el.y ?? 0,
          width: el.width ?? 80,
          height: el.height ?? 60,
          depth: el.depth ?? 60,
          height3d: el.height3d ?? 25,
          rotation: el.rotation ?? 0,
          capacity: el.capacity ?? null,
          image: el.image ?? null,
          notes: el.notes ?? null,
          shopType: (el as any).shopTypes ?? [],
          storageType: (el as any).storageTypes ?? [],
          hospitalityType: (el as any).hospitalityTypes ?? [],
          accessType: (el as any).accessTypes ?? [],
          entertainmentType: (el as any).entertainmentTypes ?? [],
          entranceType: (el as any).entranceTypes ?? [],
          kitchenType: (el as any).kitchenTypes ?? [],
          attributes: attrs ?? {},
          cornerRadius: {
            topLeft: el.cornerRadiusTL ?? 0,
            topRight: el.cornerRadiusTR ?? 0,
            bottomLeft: el.cornerRadiusBL ?? 0,
            bottomRight: el.cornerRadiusBR ?? 0,
          },
        });
      }
    }

    // 3. Emit one floor per level. Canonical id = the relational floor that actually
    //    holds the most elements (so the next builder Save collapses the duplicate
    //    relational rows into it), else a real JSON id, else any relational id.
    const mergedFloors = [...byLevel.values()]
      .filter((b) => b.base)
      .map((b) => {
        const bestRel = [...b.relFloors].sort((a, c) => c.count - a.count)[0];
        const id =
          bestRel && bestRel.count > 0
            ? bestRel.id
            : b.baseId ?? bestRel?.id ?? b.base.id;
        return { ...b.base, id, elements: [...b.elements.values(), ...b.idlessElements] };
      });

    // Builder v2 : les éléments des Zones membres de cette config sont injectés en
    // LECTURE (EventPredict, StepMapShops, analyse…). saveConfiguration les re-filtre
    // du payload (managedByBuilderV2) — jamais modifiés par le chemin v1.
    const zoneElements = await this.spaceZoneElementsService.fetchZoneElementsForSpace(config.spaceId);
    const mergedData = this.spaceZoneElementsService.mergeZoneElementsIntoConfigData(
      {
        floors: mergedFloors,
        forecourt: jsonData?.forecourt || null,
        externalMerch: jsonData?.externalMerch || null,
      },
      zoneElements,
      configId,
    );

    return {
      id: config.id,
      name: config.name,
      spaceId: config.spaceId,
      capacity: config.capacity,
      isSystem: (config as any).isSystem ?? false,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
      space: config.space,
      data: mergedData,
    };
  }
}
