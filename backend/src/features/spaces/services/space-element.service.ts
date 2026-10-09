import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { SpaceAccessService } from '../../../core/auth/space-access.service';
import { CurrentUserData } from '../../../core/auth/decorators/current-user.decorator';
import { createSpaceElementWithUniqueSlug } from '../../../shared/utils/generate-space-element-slug';
import { SupabaseStorageService } from '../../../core/supabase/supabase-storage.service';
import { SpaceCacheService } from './space-cache.service';
import { SpaceZoneElementsService } from './space-zone-elements.service';
import { SpaceElementLayoutService } from './space-element-layout.service';

/**
 * Éléments d'espace (PdV, stockages...) : création rapide, rattachement aux étages, zones,
 * parvis et merch extérieur, mise à jour et suppression.
 */

/**
 * Éléments d'espace : création rapide (import Weezevent), mise à jour, options d'étage, suppression.
 */
@Injectable()
export class SpaceElementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly spaceAccess: SpaceAccessService,
    private readonly storage: SupabaseStorageService,
    private readonly spaceCacheService: SpaceCacheService,
    private readonly spaceZoneElementsService: SpaceZoneElementsService,
    private readonly spaceElementLayoutService: SpaceElementLayoutService,
  ) {}

  /**
   * Update a SpaceElement (shop) — name, image, type, shopTypes
   */
  async updateSpaceElement(elementId: string, tenantId: string, dto: { name?: string; image?: string; notes?: string; type?: string; shopTypes?: string[] }, user?: Pick<CurrentUserData, 'id' | 'isSuperAdmin' | 'isOwner' | 'allSpacesAccess'>) {
    // Verify the element belongs to this tenant via its floor or forecourt → config → space
    const element = await this.prisma.spaceElement.findFirst({
      where: { id: elementId },
      include: {
        floor: { include: { config: { include: { space: true } } } },
        forecourt: { include: { config: { include: { space: true } } } },
        externalMerch: { include: { config: { include: { space: true } } } },
        zone: { include: { space: true } }, // Builder v2
      },
    });

    if (!element) {
      throw new NotFoundException(`SpaceElement ${elementId} not found`);
    }

    const space = element.floor?.config?.space ?? element.forecourt?.config?.space ?? element.externalMerch?.config?.space ?? (element as any).zone?.space;
    if (!space || space.tenantId !== tenantId) {
      throw new ForbiddenException(`SpaceElement ${elementId} does not belong to tenant`);
    }
    await this.spaceAccess.assertCanAccessSpace(user, space.id);

    const image = dto.image !== undefined ? await this.storage.resolveImage(dto.image, 'space-elements') : undefined;
    const updated = await this.prisma.spaceElement.update({
      where: { id: elementId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(image !== undefined && { image }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...(dto.type !== undefined && { type: dto.type as any }),
        ...(dto.shopTypes !== undefined && { shopTypes: dto.shopTypes }),
      },
    });

    await this.spaceCacheService.invalidateSpaceCache(tenantId, space.id);
    return updated;
  }

  /**
   * Liste LÉGÈRE des zones/étages disponibles pour le dialogue « Assigner un étage »
   * (étape 2 Data Integration) — remplace la lecture de getConfiguration (fusion
   * complète) qui, en plus d'être lourde, faisait disparaître les zones VIDES.
   *
   * v2 D'ABORD : la table Zone (par espace) est la source de vérité — toutes les
   * zones sont retournées, y compris vides. Le bloc v1 (Floor relationnel + JSON
   * config.data) est legacy : il ne complète que les levels sans Zone v2 et
   * disparaîtra avec la fin de la migration.
   */
  async getFloorOptions(spaceId: string, tenantId: string, configId?: string) {
    const elementSelect = { id: true, name: true, x: true, y: true, width: true, depth: true } as const;
    const serializeJsonEl = (el: any) => ({
      id: el?.id ?? null, name: el?.name ?? '', x: el?.x ?? null, y: el?.y ?? null,
      width: el?.width ?? null, depth: el?.depth ?? null,
    });

    // Toutes les lectures sont indépendantes → UN aller-retour réseau (DB distante).
    const [space, zones, relFloors, legacyConfig] = await Promise.all([
      this.prisma.space.findFirst({ where: { id: spaceId, tenantId }, select: { id: true } }),
      // ── v2 (prioritaire) : toutes les zones de l'espace, même vides ──
      this.prisma.zone.findMany({
        where: { spaceId, space: { tenantId } },
        orderBy: { level: 'asc' },
        include: { elements: { select: elementSelect } },
      }),
      configId
        ? this.prisma.floor.findMany({
            where: { configId, config: { spaceId, space: { tenantId } } },
            include: { elements: { select: elementSelect } },
          })
        : Promise.resolve([]),
      configId
        ? this.prisma.config.findFirst({
            where: { id: configId, spaceId, space: { tenantId } },
            select: { data: true },
          })
        : Promise.resolve(null),
    ]);
    if (!space) throw new NotFoundException('Space not found or access denied');

    const floors: any[] = [];
    let forecourt: any = null;
    let externalMerch: any = null;
    for (const z of zones) {
      const entry = {
        id: z.id, name: z.name, level: z.level,
        width: z.width, length: z.length, height: z.height,
        elements: z.elements, source: 'v2',
      };
      if (z.kind === 'FLOOR') floors.push(entry);
      else if (z.kind === 'FORECOURT') forecourt = forecourt ?? entry;
      else externalMerch = externalMerch ?? entry;
    }

    // ── LEGACY v1 (à supprimer avec la migration) : Floor relationnel + JSON de la
    //    config (préchargés dans le batch pré-vol) — uniquement pour les levels/zones
    //    non couverts par une Zone v2. ──
    if (configId) {
      const jsonData = (legacyConfig?.data as any) || {};
      const v2Levels = new Set(floors.map((f) => f.level));
      const byLevel = new Map<number, any>();

      for (const jf of Array.isArray(jsonData.floors) ? jsonData.floors : []) {
        const lvl = typeof jf?.level === 'number' && !Number.isNaN(jf.level) ? jf.level : 0;
        if (v2Levels.has(lvl)) continue;
        let b = byLevel.get(lvl);
        if (!b) {
          b = {
            id: jf.id ?? null, name: jf.name ?? '', level: lvl,
            width: jf.width ?? 100, length: jf.length ?? 100, height: jf.height ?? 4,
            elements: [], source: 'v1',
          };
          byLevel.set(lvl, b);
        }
        for (const el of jf.elements || []) {
          if (el?.id && !b.elements.some((e: any) => e.id === el.id)) b.elements.push(serializeJsonEl(el));
        }
      }
      for (const rf of relFloors) {
        const lvl = rf.level ?? 0;
        if (v2Levels.has(lvl)) continue;
        let b = byLevel.get(lvl);
        if (!b) {
          b = {
            id: rf.id, name: rf.name, level: lvl,
            width: rf.width ?? 100, length: rf.length ?? 100, height: rf.height ?? 4,
            elements: [], source: 'v1',
          };
          byLevel.set(lvl, b);
        }
        for (const el of rf.elements) {
          if (!b.elements.some((e: any) => e.id === el.id)) b.elements.push(el);
        }
      }
      floors.push(...byLevel.values());

      if (!forecourt && jsonData.forecourt) {
        const fc = jsonData.forecourt;
        forecourt = {
          id: fc.id ?? null, name: fc.name ?? 'Parvis', level: 0,
          width: fc.width ?? 50, length: fc.length ?? 50, height: fc.height ?? 4,
          elements: (fc.elements || []).map(serializeJsonEl), source: 'v1',
        };
      }
      if (!externalMerch && jsonData.externalMerch) {
        const em = jsonData.externalMerch;
        externalMerch = {
          id: em.id ?? null, name: em.name ?? 'External', level: 0,
          width: em.width ?? 50, length: em.length ?? 50, height: em.height ?? 4,
          elements: (em.elements || []).map(serializeJsonEl), source: 'v1',
        };
      }
    }

    floors.sort((a, b) => a.level - b.level);
    return { managedByV2: zones.length > 0, floors, forecourt, externalMerch };
  }

  /**
   * Quick-create a SpaceElement (shop) for a space without needing the floor plan editor.
   * Le shop est créé dans la configuration UTILISATEUR de l'espace (étape 1 / 3D Builder),
   * résolue par `resolveTargetConfig` — plus de config auto-générée « Weezevent Import »
   * tant qu'une config utilisateur existe.
   */
  async quickCreateElement(spaceId: string, tenantId: string, dto: { name: string; type?: string }, user?: Pick<CurrentUserData, 'id' | 'isSuperAdmin' | 'isOwner' | 'allSpacesAccess'>) {
    // Lectures pré-vol INDÉPENDANTES → un seul aller-retour réseau (DB distante).
    const [space, config, prefetchedZone, count] = await Promise.all([
      this.prisma.space.findFirst({ where: { id: spaceId, tenantId } }),
      // Cible : la configuration utilisateur (étape 1 / 3D Builder), pas « Weezevent Import ».
      this.spaceElementLayoutService.resolveTargetConfig(spaceId, (dto as any).configId),
      this.prisma.zone.findFirst({ where: { spaceId, kind: 'FLOOR' as any, level: 0 } }),
      this.prisma.spaceElement.count({ where: { zone: { spaceId, kind: 'FLOOR' as any, level: 0 } } }),
    ]);
    if (!space) throw new NotFoundException('Space not found or access denied');
    await this.spaceAccess.assertCanAccessSpace(user, space.id);

    // v2 D'ABORD (bug étape 2 : bulk/quick-create invisibles dans builder2) : les
    // créations Data Integration atterrissent TOUJOURS en v2 — zone RDC créée au
    // besoin, adhésion à la config cible. Le chemin v1 n'accueille plus de nouveaux
    // éléments ici ; le builder v1 les AFFICHE via l'injection lecture de
    // getConfiguration (managedByBuilderV2).
      const zone = prefetchedZone ?? await this.spaceElementLayoutService.ensureZone(spaceId, 'FLOOR', 0, {
        name: 'RDC', width: 100, length: 100, height: 4,
      });
      const v2Type = this.spaceZoneElementsService.mapElementType(dto.type || 'shop');
      const v2Tags = this.spaceZoneElementsService.mapShopTypeTags(dto.type);
      const pos = this.spaceElementLayoutService.gridPosition(count, zone.width ?? 200);
      const created = await createSpaceElementWithUniqueSlug(this.prisma, dto.name, (slug) => ({
          zoneId: zone.id,
          slug,
          name: dto.name,
          type: v2Type,
          subtypes: v2Tags,
          shopTypes: v2Tags,
          x: pos.x,
          y: pos.y,
          width: 2,
          height: 2,
          depth: 2,
          height3d: 2,
          area: (dto as any).area ?? null,
          attributes: { originalType: dto.type || 'shop', importedFromWeezevent: true },
        } as any));
      await this.prisma.configurationElement.createMany({
        data: [{ configId: config.id, elementId: created.id }],
        skipDuplicates: true,
      });
      await this.spaceCacheService.invalidateSpaceCache(space.tenantId, spaceId);
      return {
        id: created.id,
        name: created.name,
        type: dto.type || 'shop',
        configName: config.name,
        areaName: zone.name,
      };
  }

  /**
   * Bulk « créer & mapper » de l'étape 2 Data Integration — remplace la boucle front
   * quick-element + location-shop unitaires (2 allers-retours HTTP par location).
   *
   * - item AVEC `elementId` : mapping seul vers l'élément existant (vérifié tenant, 1 requête
   *   pour tout le lot) — rien n'est créé.
   * - item SANS `elementId` : création d'un SpaceElement (mêmes règles que quickCreateElement :
   *   zone RDC niveau 0, 2×2×2 m, positions en grille) puis mapping.
   *
   * Config cible et zone RDC résolues UNE fois pour le lot ; créations puis upserts de
   * mappings chacun en une transaction (forme tableau → résultats dans l'ordre des items) ;
   * une seule invalidation de cache à la fin.
   */
  async bulkQuickCreateAndMap(
    spaceId: string,
    tenantId: string,
    dto: { configId?: string; items: Array<{ weezeventLocationId: string; name: string; type?: string; elementId?: string }> },
  ) {
    const toMap = dto.items.filter((i) => i.elementId);
    const toCreate = dto.items.filter((i) => !i.elementId);
    const errors: Array<{ weezeventLocationId: string; error: string }> = [];

    // 1. Lectures pré-vol INDÉPENDANTES → un seul aller-retour réseau (la DB distante
    //    coûte ~600 ms PAR requête en dev local ; ne jamais les enchaîner).
    const [space, foundExisting, resolvedConfig, prefetchedZone, baseCount] = await Promise.all([
      this.prisma.space.findFirst({ where: { id: spaceId, tenantId } }),
      // Cibles existantes : une seule requête de vérification d'appartenance tenant.
      toMap.length
        ? this.prisma.spaceElement.findMany({
            where: {
              id: { in: toMap.map((i) => i.elementId as string) },
              OR: [
                { floor: { config: { space: { tenantId } } } },
                { forecourt: { config: { space: { tenantId } } } },
                { externalMerch: { config: { space: { tenantId } } } },
                { zone: { space: { tenantId } } }, // Builder v2
              ],
            },
            select: { id: true, name: true },
          })
        : Promise.resolve([] as Array<{ id: string; name: string }>),
      toCreate.length ? this.spaceElementLayoutService.resolveTargetConfig(spaceId, dto.configId) : Promise.resolve(null),
      toCreate.length
        ? this.prisma.zone.findFirst({ where: { spaceId, kind: 'FLOOR' as any, level: 0 } })
        : Promise.resolve(null),
      toCreate.length
        ? this.prisma.spaceElement.count({ where: { zone: { spaceId, kind: 'FLOOR' as any, level: 0 } } })
        : Promise.resolve(0),
    ]);
    if (!space) throw new NotFoundException('Space not found or access denied');

    const existingById = new Map<string, { id: string; name: string }>();
    for (const e of foundExisting) existingById.set(e.id, e);

    // 2. Créations en lot dans la zone RDC de la config cible.
    const config: { id: string; name: string } | null = resolvedConfig;
    let zone: { id: string; name: string; level: number; width: number | null } | null = prefetchedZone;
    let created: Array<{ id: string; name: string }> = [];
    if (toCreate.length) {
      if (!zone) {
        zone = await this.spaceElementLayoutService.ensureZone(spaceId, 'FLOOR', 0, { name: 'RDC', width: 100, length: 100, height: 4 });
      }
      // Transaction interactive (pas un tableau d'opérations préparées) : le slug doit
      // être généré avec retry-si-collision (createSpaceElementWithUniqueSlug), donc
      // séquentiel dans le lot plutôt que parallélisé au niveau SQL.
      created = await this.prisma.$transaction(async (tx) => {
        const rows: Array<{ id: string; name: string }> = [];
        for (let idx = 0; idx < toCreate.length; idx++) {
          const item = toCreate[idx];
          const pos = this.spaceElementLayoutService.gridPosition(baseCount + idx, zone!.width ?? 200);
          const v2Tags = this.spaceZoneElementsService.mapShopTypeTags(item.type);
          // eslint-disable-next-line no-await-in-loop -- éléments créés un par un : chaque slug doit voir les précédents
          const row = await createSpaceElementWithUniqueSlug(
            tx,
            item.name,
            (slug) => ({
              zoneId: zone!.id,
              slug,
              name: item.name,
              type: this.spaceZoneElementsService.mapElementType(item.type || 'shop'),
              subtypes: v2Tags,
              shopTypes: v2Tags,
              x: pos.x,
              y: pos.y,
              width: 2,
              height: 2,
              depth: 2,
              height3d: 2,
              attributes: { originalType: item.type || 'shop', importedFromWeezevent: true },
            } as any),
            { select: { id: true, name: true } },
          );
          rows.push(row as { id: string; name: string });
        }
        return rows;
      }, { timeout: 30000 }); // séquentiel (retry slug) sur un lot potentiellement gros → délai du défaut (5s) trop court
    }

    // 3. Adhésions + upserts des mappings dans UNE transaction (un seul pipeline réseau).
    const pairs: Array<{ weezeventLocationId: string; elementId: string; elementName: string; created: boolean }> = [];
    for (const item of toMap) {
      const found = existingById.get(item.elementId as string);
      if (!found) {
        errors.push({ weezeventLocationId: item.weezeventLocationId, error: `SpaceElement ${item.elementId} not found` });
        continue;
      }
      pairs.push({ weezeventLocationId: item.weezeventLocationId, elementId: found.id, elementName: found.name, created: false });
    }
    toCreate.forEach((item, idx) => {
      pairs.push({ weezeventLocationId: item.weezeventLocationId, elementId: created[idx].id, elementName: created[idx].name, created: true });
    });
    const writes: any[] = [];
    if (created.length) {
      writes.push(
        this.prisma.configurationElement.createMany({
          data: created.map((e) => ({ configId: config!.id, elementId: e.id })),
          skipDuplicates: true,
        }),
      );
    }
    writes.push(
      ...pairs.map((p) =>
        this.prisma.locationShopMapping.upsert({
          where: { tenantId_salesLocationId: { tenantId, salesLocationId: p.weezeventLocationId } },
          create: { tenantId, salesLocationId: p.weezeventLocationId, spaceElementId: p.elementId },
          update: { spaceElementId: p.elementId },
        }),
      ),
    );
    if (writes.length) await this.prisma.$transaction(writes);

    await this.spaceCacheService.invalidateSpaceCache(space.tenantId, spaceId);

    return {
      total: dto.items.length,
      createdCount: created.length,
      mappedCount: pairs.length,
      failed: errors.length,
      errors,
      configName: config?.name ?? null,
      areaName: zone?.name ?? null,
      floorLevel: zone?.level ?? null,
      mapped: pairs.map((p) => ({
        weezeventLocationId: p.weezeventLocationId,
        elementId: p.elementId,
        elementName: p.elementName,
        created: p.created,
        configName: p.created ? config?.name ?? null : null,
        areaName: p.created ? zone?.name ?? null : null,
        floorLevel: p.created ? zone?.level ?? 0 : null,
      })),
    };
  }

  /**
   * Delete a SpaceElement (and its config.data JSON entry) if no
   * WeezeventLocationShopMapping still references it. Used when a Weezevent
   * shop mapping is removed in Data Integration so the corresponding 3D
   * builder element is removed too.
   */
  async deleteElementIfUnreferenced(elementId: string, tenantId: string): Promise<boolean> {
    const remainingMappings = await this.prisma.locationShopMapping.count({
      where: { spaceElementId: elementId },
    });
    if (remainingMappings > 0) return false;

    const element = await this.prisma.spaceElement.findFirst({
      where: { id: elementId },
      include: {
        floor: { include: { config: { include: { space: true } } } },
        forecourt: { include: { config: { include: { space: true } } } },
        externalMerch: { include: { config: { include: { space: true } } } },
        zone: { include: { space: true } }, // Builder v2
      },
    });
    if (!element) return false;

    const space = element.floor?.config?.space ?? element.forecourt?.config?.space ?? element.externalMerch?.config?.space ?? (element as any).zone?.space;
    if (!space || space.tenantId !== tenantId) return false;

    // Builder v2 : pas de JSON à nettoyer — suppression directe (cascade adhésions).
    if ((element as any).zoneId) {
      await this.prisma.spaceElement.delete({ where: { id: elementId } });
      await this.spaceCacheService.invalidateSpaceCache(tenantId, space.id);
      return true;
    }

    const config = element.floor?.config ?? element.forecourt?.config ?? element.externalMerch?.config;
    if (!config) return false;

    await this.prisma.spaceElement.delete({ where: { id: elementId } });

    // Remove the element from config.data JSON (floors[].elements / forecourt.elements)
    const freshConfig = await this.prisma.config.findFirst({ where: { id: config.id } });
    const currentData = (freshConfig?.data as any) || {};
    let changed = false;

    const jsonFloors: any[] = Array.isArray(currentData.floors) ? currentData.floors : [];
    for (const jf of jsonFloors) {
      if (Array.isArray(jf.elements)) {
        const before = jf.elements.length;
        jf.elements = jf.elements.filter((e: any) => e.id !== elementId);
        if (jf.elements.length !== before) changed = true;
      }
    }

    const jsonForecourt = currentData.forecourt;
    if (jsonForecourt && Array.isArray(jsonForecourt.elements)) {
      const before = jsonForecourt.elements.length;
      jsonForecourt.elements = jsonForecourt.elements.filter((e: any) => e.id !== elementId);
      if (jsonForecourt.elements.length !== before) changed = true;
    }

    const jsonExternalMerch = currentData.externalMerch;
    if (jsonExternalMerch && Array.isArray(jsonExternalMerch.elements)) {
      const before = jsonExternalMerch.elements.length;
      jsonExternalMerch.elements = jsonExternalMerch.elements.filter((e: any) => e.id !== elementId);
      if (jsonExternalMerch.elements.length !== before) changed = true;
    }

    if (changed) {
      await this.prisma.config.update({
        where: { id: config.id },
        data: { data: { ...currentData, floors: jsonFloors, forecourt: jsonForecourt ?? null, externalMerch: jsonExternalMerch ?? null }, version: { increment: 1 } },
      });
    }

    await this.spaceCacheService.invalidateSpaceCache(tenantId, space.id);
    return true;
  }
}
