import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { SpaceCacheService } from './space-cache.service';
import { SpaceZoneElementsService, toV1JsonElement } from './space-zone-elements.service';
import { SpaceElementLayoutService } from './space-element-layout.service';

/**
 * Éléments d'espace (PdV, stockages...) : création rapide, rattachement aux étages, zones,
 * parvis et merch extérieur, mise à jour et suppression.
 */

/** Paramètres des deux conteneurs non-étage d'une configuration (v1) / zones (v2). */
const CONTAINERS = {
  forecourt: {
    other: 'externalMerch',
    fk: 'forecourtId',
    zoneKind: 'FORECOURT',
    v1Name: 'Parvis',
    label: 'Parvis',
    resultKind: 'forecourt',
    logLabel: 'assignElementsToForecourt',
  },
  externalMerch: {
    other: 'forecourt',
    fk: 'externalMerchId',
    zoneKind: 'EXTERNAL',
    v1Name: 'Espace Externe',
    label: 'Espace externe',
    resultKind: 'externalmerch',
    logLabel: 'assignElementsToExternalMerch',
  },
} as const;

/**
 * Rattachement d'éléments à un étage, au parvis ou à l'espace externe (v1 JSON et v2 zones).
 */
@Injectable()
export class SpaceElementPlacementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly spaceCacheService: SpaceCacheService,
    private readonly spaceZoneElementsService: SpaceZoneElementsService,
    private readonly spaceElementLayoutService: SpaceElementLayoutService,
  ) {}

  /**
   * Assign a list of SpaceElements to a given floor level (or to the forecourt/"Parvis")
   * within the same space. Le Floor/Forecourt est trouvé/créé dans la configuration cible
   * (`opts.configId`, sinon la config utilisateur principale via `resolveTargetConfig`).
   */
  async assignElementsToFloorLevel(
    spaceId: string,
    tenantId: string,
    elementIds: string[],
    level: number | 'forecourt' | 'externalmerch',
    opts: {
      configId?: string;
      width?: number;
      length?: number;
      height?: number;
      zoneName?: string;
      position?: { x: number; y: number };
      shopDimensions?: { width?: number; depth?: number; height?: number };
    } = {},
  ) {
    if (level === 'forecourt') {
      return this.assignElementsToContainer('forecourt', spaceId, tenantId, elementIds, opts);
    }
    if (level === 'externalmerch') {
      return this.assignElementsToContainer('externalMerch', spaceId, tenantId, elementIds, opts);
    }
    // Garde défensive : tout `level` non géré ci-dessus doit être un entier (RDC=0,
    // étages positifs, sous-sols négatifs). Le DTO valide déjà ce contrat — cette garde
    // évite un 500 Prisma (`level` Int) si l'endpoint est appelé hors validation.
    if (typeof level !== 'number' || !Number.isInteger(level)) {
      throw new BadRequestException(`level invalide: ${String(level)} (entier, 'forecourt' ou 'externalmerch' attendu)`);
    }

    // Resolve floor name from level
    let floorName: string;
    if (level === 0) floorName = 'RDC';
    else if (level < 0) floorName = `Sous-sol ${Math.abs(level)}`;
    else floorName = `Étage ${level}`;

    // Lectures pré-vol INDÉPENDANTES → un seul aller-retour réseau. En dev local la
    // DB (pooler Supabase eu-west-1) coûte ~600 ms PAR requête : les enchaîner
    // séquentiellement faisait exploser la latence de l'endpoint.
    const [space, config, zoneCount, prefetchedZone, verified] = await Promise.all([
      this.prisma.space.findFirst({ where: { id: spaceId, tenantId } }),
      // Cible : la config utilisateur (étape 1 / 3D Builder), pas « Weezevent Import ».
      this.spaceElementLayoutService.resolveTargetConfig(spaceId, opts.configId),
      // Espace géré en v2 → toute assignation ADOPTE l'élément en v2 (zone + adhésion).
      this.prisma.zone.count({ where: { spaceId } }),
      this.prisma.zone.findFirst({ where: { spaceId, kind: 'FLOOR' as any, level } }),
      // Vérification d'appartenance en UNE requête pour tout le lot (au lieu de N
      // findFirst à 4 includes imbriqués). L'ordre d'entrée est préservé : les
      // positions en rangée (opts.position) en dépendent.
      this.prisma.spaceElement.findMany({
        where: {
          id: { in: elementIds },
          OR: [
            { floor: { config: { space: { id: spaceId, tenantId } } } },
            { forecourt: { config: { space: { id: spaceId, tenantId } } } },
            { externalMerch: { config: { space: { id: spaceId, tenantId } } } },
            { zone: { space: { id: spaceId, tenantId } } }, // Builder v2
          ],
        },
        select: { id: true, zoneId: true, floorId: true },
      }),
    ]);
    if (!space) throw new NotFoundException('Space not found or access denied');
    const spaceHasZones = zoneCount > 0;
    if (spaceHasZones) {
      this.spaceElementLayoutService.logBuilderV2Switch('assignElementsToFloorLevel', spaceId, tenantId, zoneCount);
    }

    // Containers PARESSEUX : le Floor v1 n'est créé que si un élément v1 doit y aller
    // (ne pas polluer un espace géré en v2), la Zone v2 que si un élément v2 arrive.
    let floor: any = null;
    const ensureV1Floor = async () => {
      if (floor) return floor;
      floor = await this.prisma.floor.findFirst({ where: { configId: config.id, level } });
      if (!floor) {
        floor = await this.prisma.floor.create({
          data: {
            configId: config.id,
            name: floorName,
            level,
            width: opts.width ?? 200,
            height: opts.height ?? 4,
            length: opts.length ?? 200,
          },
        });
      }
      return floor;
    };
    let targetZone: any = prefetchedZone; // déjà lue dans le batch pré-vol
    const ensureTargetZone = async () => {
      if (targetZone) return targetZone;
      targetZone = await this.spaceElementLayoutService.ensureZone(spaceId, 'FLOOR', level, {
        name: floorName, width: opts.width, length: opts.length, height: opts.height,
      });
      return targetZone;
    };

    const verifiedById = new Map(verified.map((e) => [e.id, e]));
    const orderedElements = elementIds
      .map((id) => verifiedById.get(id))
      .filter((e): e is (typeof verified)[number] => !!e);

    const updated: string[] = [];
    const updatedV2: string[] = [];
    // Track which source floors lost elements (for JSON sync)
    const movedElements: Array<{ id: string; sourceFloorId: string | null }> = [];
    const zoneName = opts.zoneName?.trim() || null;

    if (orderedElements.length && spaceHasZones) {
      // ── v2 (PRIORITAIRE) : zone cible unique, puis TOUTES les écritures (renommage,
      //    updates avec géométrie du dialogue, adhésions) dans UNE transaction — un
      //    seul pipeline réseau au lieu de 3 allers-retours et plus. ──
      const zone = await ensureTargetZone();
      const writes: any[] = [];
      const zonePatch: any = this.spaceElementLayoutService.zoneDimensionsPatch(zone, opts);
      if (zoneName && zoneName !== zone.name) zonePatch.name = zoneName;
      if (Object.keys(zonePatch).length) {
        writes.push(this.prisma.zone.update({ where: { id: zone.id }, data: zonePatch }));
        Object.assign(zone, zonePatch);
      }
      writes.push(
        ...orderedElements.map((el, i) =>
          this.prisma.spaceElement.update({
            where: { id: el.id },
            data: {
              zoneId: zone.id,
              floorId: null,
              forecourtId: null,
              externalMerchId: null,
              ...this.spaceElementLayoutService.elementGeometryData(i, opts.position, opts.shopDimensions),
            },
          }),
        ),
      );
      writes.push(
        this.prisma.configurationElement.createMany({
          data: orderedElements.map((el) => ({ configId: config.id, elementId: el.id })),
          skipDuplicates: true,
        }),
      );
      await this.prisma.$transaction(writes);
      updatedV2.push(...orderedElements.map((el) => el.id));
    } else if (orderedElements.length) {
      // ── LEGACY v1 (à supprimer avec la fin de la migration v2) : Floor relationnel
      //    + sync JSON plus bas. Comportement historique conservé. ──
      for (const [i, element] of orderedElements.entries()) {
        await ensureV1Floor();
        movedElements.push({ id: element.id, sourceFloorId: element.floorId ?? null });

        await this.prisma.spaceElement.update({
          where: { id: element.id },
          data: {
            floorId: floor.id,
            forecourtId: null,
            externalMerchId: null,
            ...this.spaceElementLayoutService.elementGeometryData(i, opts.position, opts.shopDimensions),
          },
        });
        updated.push(element.id);
      }
      if (zoneName && floor && zoneName !== floor.name) {
        await this.prisma.floor.update({ where: { id: floor.id }, data: { name: zoneName } });
        floor.name = zoneName;
      }
    }

    // Sync config.data JSON: move elements from their source floor to the target floor
    if (updated.length > 0) {
      await this.spaceZoneElementsService.updateConfigDataOptimistic(config.id, async (currentData) => {
        const jsonFloors: any[] = Array.isArray(currentData.floors) ? [...currentData.floors] : [];

        // Remove moved elements from their source floors in the JSON
        const movedIds = new Set(updated);
        for (const jsonFloorEntry of jsonFloors) {
          if (Array.isArray(jsonFloorEntry.elements)) {
            jsonFloorEntry.elements = jsonFloorEntry.elements.filter((e: any) => !movedIds.has(e.id));
          }
        }

        // Ensure the target floor entry exists in JSON
        let targetJsonFloor = jsonFloors.find((f: any) => f.id === floor.id);
        if (!targetJsonFloor) {
          targetJsonFloor = {
            id: floor.id,
            name: floor.name,
            level: floor.level ?? level,
            width: floor.width ?? 200,
            height: floor.height ?? 4,
            length: floor.length ?? 200,
            elements: [],
            cornerRadius: { topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 },
            hole: { enabled: false, x: 0.5, y: 0.5, width: 10, length: 10, cornerRadius: { topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 } },
          };
          jsonFloors.push(targetJsonFloor);
        }
        if (!Array.isArray(targetJsonFloor.elements)) targetJsonFloor.elements = [];

        // Find element JSON entries from all floors (they were in JSON after quickCreateElement)
        const allElements: any[] = [];
        for (const jf of jsonFloors) {
          if (Array.isArray(jf.elements)) allElements.push(...jf.elements);
        }

        for (const movedEl of movedElements) {
          if (!updated.includes(movedEl.id)) continue;
          // Reuse the existing JSON representation if available, otherwise create a minimal stub
          const existing = allElements.find((e: any) => e.id === movedEl.id);
          if (existing && !targetJsonFloor.elements.find((e: any) => e.id === movedEl.id)) {
            targetJsonFloor.elements.push(existing);
          } else if (!existing) {
            const relElement = await this.prisma.spaceElement.findFirst({ where: { id: movedEl.id } });
            if (relElement) {
              targetJsonFloor.elements.push(toV1JsonElement(relElement));
            }
          }
        }

        // Nom + géométrie du dialogue répercutés dans le JSON v1 (remplace le
        // getConfiguration + updateConfiguration full-save que faisait le front).
        if (zoneName) targetJsonFloor.name = zoneName;
        if (opts.position || opts.shopDimensions) {
          const geomById = new Map(updated.map((id, i) => [id, this.spaceElementLayoutService.elementGeometryData(i, opts.position, opts.shopDimensions)]));
          for (const jsonEl of targetJsonFloor.elements) {
            const g = jsonEl?.id ? geomById.get(jsonEl.id) : undefined;
            if (!g) continue;
            if (g.x !== undefined) jsonEl.x = g.x;
            if (g.y !== undefined) jsonEl.y = g.y;
            if (g.width !== undefined) jsonEl.width = g.width;
            if (g.depth !== undefined) jsonEl.depth = g.depth;
            if (g.height !== undefined) jsonEl.height = g.height;
          }
        }

        // Remove empty source floors from JSON to keep it clean
        const cleanedJsonFloors = jsonFloors.filter(
          (f: any) => f.id === floor.id || (Array.isArray(f.elements) && f.elements.length > 0),
        );

        return { ...currentData, floors: cleanedJsonFloors };
      });

      await this.spaceCacheService.invalidateSpaceCache(tenantId, spaceId);
    } else if (updatedV2.length > 0) {
      await this.spaceCacheService.invalidateSpaceCache(tenantId, spaceId);
    }

    // Réponse en union discriminée (`kind`) cohérente entre floor / forecourt / externalmerch.
    // `builderVersion` (BUG-23) : champ additif indiquant le routage effectif de cet appel,
    // pour que le frontend/debug n'ait plus à le déduire silencieusement du payload.
    return {
      kind: 'floor' as const,
      floorId: floor?.id ?? targetZone?.id ?? null,
      floorName: zoneName ?? floorName,
      level,
      updatedElementIds: [...updated, ...updatedV2],
      builderVersion: spaceHasZones ? ('v2' as const) : ('v1' as const),
    };
  }

  /**
   * Assign a list of SpaceElements to the forecourt ("Parvis") of the element's
   * "Weezevent Import" config. Finds or creates the Forecourt if needed.
   */
  /**
   * Rattache des éléments au parvis (FORECOURT) ou à l'espace externe (EXTERNAL) de la
   * configuration utilisateur. Une seule implémentation pour les deux conteneurs : le JSON v1
   * est nettoyé de façon symétrique (un élément qui change de conteneur est retiré de l'autre).
   */
  private async assignElementsToContainer(
    container: 'forecourt' | 'externalMerch',
    spaceId: string,
    tenantId: string,
    elementIds: string[],
    opts: {
      configId?: string;
      width?: number;
      length?: number;
      zoneName?: string;
      position?: { x: number; y: number };
      shopDimensions?: { width?: number; depth?: number; height?: number };
    } = {},
  ) {
    const space = await this.prisma.space.findFirst({ where: { id: spaceId, tenantId } });
    if (!space) throw new NotFoundException('Space not found or access denied');

    // Cible : la config utilisateur (étape 1 / 3D Builder), pas « Weezevent Import ».
    const config = await this.spaceElementLayoutService.resolveTargetConfig(spaceId, opts.configId);
    const c = CONTAINERS[container];
    // Espace géré en v2 → toute assignation ADOPTE l'élément en v2 (zone + adhésion).
    const zoneCount = await this.prisma.zone.count({ where: { spaceId } });
    const spaceHasZones = zoneCount > 0;
    if (spaceHasZones) {
      this.spaceElementLayoutService.logBuilderV2Switch(c.logLabel, spaceId, tenantId, zoneCount);
    }

    // Containers PARESSEUX (cf. assignElementsToFloorLevel) : conteneur v1 / Zone v2.
    const delegate: any = container === 'forecourt' ? this.prisma.forecourt : this.prisma.externalMerch;
    let target: any = null;
    const ensureV1Container = async () => {
      if (target) return target;
      target = await delegate.findUnique({ where: { configId: config.id } });
      if (!target) {
        target = await delegate.create({
          data: { configId: config.id, name: c.v1Name, width: opts.width ?? 200, length: opts.length ?? 200 },
        });
      }
      return target;
    };
    let targetZone: any = null;
    const ensureTargetZone = async () => {
      if (targetZone) return targetZone;
      targetZone = await this.spaceElementLayoutService.ensureZone(spaceId, c.zoneKind, 0, {
        name: c.label, width: opts.width, length: opts.length,
      });
      return targetZone;
    };

    // Verify all elements belong to this tenant's space, then move them to the container
    const updated: string[] = [];
    const updatedV2: string[] = [];
    const movedElements: { id: string }[] = [];
    const zoneName = opts.zoneName?.trim() || null;
    let geomIndex = 0;

    for (const elementId of elementIds) {
      const element = await this.prisma.spaceElement.findFirst({
        where: { id: elementId },
        include: {
          floor: { include: { config: { include: { space: true } } } },
          forecourt: { include: { config: { include: { space: true } } } },
          externalMerch: { include: { config: { include: { space: true } } } },
          zone: { include: { space: true } }, // Builder v2
        },
      });
      if (!element) continue;
      const elemSpace = element.floor?.config?.space ?? element.forecourt?.config?.space ?? element.externalMerch?.config?.space ?? (element as any).zone?.space;
      if (!elemSpace || elemSpace.tenantId !== tenantId || elemSpace.id !== spaceId) continue;

      // Builder v2 : déplacement de zone + adhésion — pas de JSON.
      if (element.zoneId || spaceHasZones) {
        const zone = await ensureTargetZone();
        await this.prisma.spaceElement.update({
          where: { id: elementId },
          data: {
            zoneId: zone.id,
            floorId: null,
            forecourtId: null,
            externalMerchId: null,
            ...this.spaceElementLayoutService.elementGeometryData(geomIndex++, opts.position, opts.shopDimensions),
          },
        });
        await this.prisma.configurationElement.createMany({
          data: [{ configId: config.id, elementId }],
          skipDuplicates: true,
        });
        updatedV2.push(elementId);
        continue;
      }

      await ensureV1Container();
      movedElements.push({ id: element.id });

      await this.prisma.spaceElement.update({
        where: { id: elementId },
        data: {
          floorId: null,
          forecourtId: null,
          externalMerchId: null,
          [c.fk]: target.id,
          ...this.spaceElementLayoutService.elementGeometryData(geomIndex++, opts.position, opts.shopDimensions),
        },
      });
      updated.push(elementId);
    }

    // Nom + dimensions du dialogue appliqués à la zone cible v2 (hauteur exclue :
    // les zones non-FLOOR restent à 0 par convention) ; v1 legacy = nom seul
    // (le JSON est patché plus bas).
    if (targetZone) {
      const zonePatch: any = this.spaceElementLayoutService.zoneDimensionsPatch(targetZone, { width: opts.width, length: opts.length });
      if (zoneName && zoneName !== targetZone.name) zonePatch.name = zoneName;
      if (Object.keys(zonePatch).length) {
        await this.prisma.zone.update({ where: { id: targetZone.id }, data: zonePatch });
        Object.assign(targetZone, zonePatch);
      }
    }
    if (zoneName && target && zoneName !== target.name) {
      target = await delegate.update({ where: { id: target.id }, data: { name: zoneName } });
    }

    // Sync config.data JSON: move elements from their source floor(s) / other container to this one
    if (updated.length > 0) {
      await this.spaceZoneElementsService.updateConfigDataOptimistic(config.id, async (currentData) => {
      const jsonFloors: any[] = Array.isArray(currentData.floors) ? [...currentData.floors] : [];
      const movedIds = new Set(updated);

      // Collect existing JSON entries for moved elements (to preserve dimensions/types)
      const allElements: any[] = [];
      for (const jf of jsonFloors) {
        if (Array.isArray(jf.elements)) allElements.push(...jf.elements);
      }

      const jsonOther = currentData[c.other];
      if (Array.isArray(jsonOther?.elements)) allElements.push(...jsonOther.elements);

      // Remove moved elements from their source floors / other container in the JSON
      for (const jsonFloorEntry of jsonFloors) {
        if (Array.isArray(jsonFloorEntry.elements)) {
          jsonFloorEntry.elements = jsonFloorEntry.elements.filter((e: any) => !movedIds.has(e.id));
        }
      }
      const cleanedOther = jsonOther
        ? { ...jsonOther, elements: (jsonOther.elements || []).filter((e: any) => !movedIds.has(e.id)) }
        : jsonOther ?? null;

      // Ensure the container entry exists in JSON
      let jsonTarget = currentData[container];
      if (!jsonTarget) {
        jsonTarget = {
          id: target.id,
          name: target.name,
          width: target.width ?? 200,
          length: target.length ?? 200,
          elements: [],
          cornerRadius: { topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 },
        };
      }
      if (!Array.isArray(jsonTarget.elements)) jsonTarget.elements = [];

      for (const movedEl of movedElements) {
        if (jsonTarget.elements.find((e: any) => e.id === movedEl.id)) continue;
        const existing = allElements.find((e: any) => e.id === movedEl.id);
        if (existing) {
          jsonTarget.elements.push(existing);
        } else {
          const relElement = await this.prisma.spaceElement.findFirst({ where: { id: movedEl.id } });
          if (relElement) {
            jsonTarget.elements.push(toV1JsonElement(relElement));
          }
        }
      }

      // Nom + géométrie du dialogue répercutés dans le JSON v1.
      if (zoneName) jsonTarget.name = zoneName;
      if (opts.position || opts.shopDimensions) {
        const geomById = new Map(updated.map((id, i) => [id, this.spaceElementLayoutService.elementGeometryData(i, opts.position, opts.shopDimensions)]));
        for (const jsonEl of jsonTarget.elements) {
          const g = jsonEl?.id ? geomById.get(jsonEl.id) : undefined;
          if (!g) continue;
          if (g.x !== undefined) jsonEl.x = g.x;
          if (g.y !== undefined) jsonEl.y = g.y;
          if (g.width !== undefined) jsonEl.width = g.width;
          if (g.depth !== undefined) jsonEl.depth = g.depth;
          if (g.height !== undefined) jsonEl.height = g.height;
        }
      }

      // Remove now-empty source floors from JSON to keep it clean
      const cleanedJsonFloors = jsonFloors.filter(
        (f: any) => Array.isArray(f.elements) && f.elements.length > 0,
      );

        return { ...currentData, floors: cleanedJsonFloors, [c.other]: cleanedOther, [container]: jsonTarget };
      });

      await this.spaceCacheService.invalidateSpaceCache(tenantId, spaceId);
    }

    if (updated.length === 0 && updatedV2.length > 0) {
      await this.spaceCacheService.invalidateSpaceCache(tenantId, spaceId);
    }
    // `builderVersion` (BUG-23) : voir commentaire dans assignElementsToFloorLevel.
    return {
      kind: c.resultKind,
      [`${container}Id`]: target?.id ?? targetZone?.id ?? null,
      [`${container}Name`]: target?.name ?? targetZone?.name ?? c.label,
      level: null,
      updatedElementIds: [...updated, ...updatedV2],
      builderVersion: spaceHasZones ? ('v2' as const) : ('v1' as const),
    };
  }
}
