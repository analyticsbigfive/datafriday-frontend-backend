import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { RedisService } from '../../../core/redis/redis.service';
import { SpaceAccessService } from '../../../core/auth/space-access.service';
import { CurrentUserData } from '../../../core/auth/decorators/current-user.decorator';
import { SpaceCacheService } from './space-cache.service';
import { SpaceZoneElementsService } from './space-zone-elements.service';

/**
 * Lecture des configurations d'un espace.
 */
@Injectable()
export class SpaceConfigurationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly spaceAccess: SpaceAccessService,
    private readonly spaceCacheService: SpaceCacheService,
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
