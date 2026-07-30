// Service Builder v2 — docs/REFONTE_3D_BUILDER_V2.md §2/§3.
// Principes appliqués ici :
//  - le relationnel (Zone / SpaceElement / ConfigurationElement) est l'UNIQUE source
//    de vérité — aucun JSON de config à synchroniser ;
//  - 1 geste = 1 petite mutation transactionnelle et idempotente ;
//  - les ids d'éléments sont éternels ; supprimer un élément UTILISÉ (mapping
//    Weezevent, menus) exige force=true après un 409 documenté — jamais de silence ;
//  - isolation multi-tenant par jointures (Zone/ConfigurationElement ne portent pas
//    de tenantId : hors du scope CLS automatique, comme Floor/SpaceElement en v1).
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { SpacesService } from '../spaces/spaces.service';
import { SupabaseStorageService } from '../../core/supabase/supabase-storage.service';
import { StaffingCalculatorService } from '../staffing/staffing-calculator.service';
import { detectFnbTags } from '../staffing/fnb-tags.util';
import { STAFFING_ELEMENT_TYPES } from '../staffing/staffing.service';
import {
  CreateZoneDto, UpdateZoneDto, CreateElementDto, UpdateElementDto,
  BatchElementsDto, DuplicateElementDto, PutPerformanceDto, PutStaffDto,
  PutInventoryDto, CreateConfigurationDto,
} from './dto/builder-v2.dto';

// Les 8 types d'outil du front + les valeurs enum déjà valides passent tels quels.
const TOOL_TYPE_MAP: Record<string, string> = {
  shop: 'shop', hospitality: 'hospitality', merchshop: 'merchshop', storage: 'storage',
  entrance: 'entrance', entertainment: 'entertainment', access: 'access', kitchen: 'kitchen',
  fnb_food: 'fnb_food', fnb_beverages: 'fnb_beverages', fnb_bar: 'fnb_bar',
  fnb_snack: 'fnb_snack', fnb_icecream: 'fnb_icecream', seating: 'seating', stage: 'stage',
  parking: 'parking', restroom: 'restroom', office: 'office', other: 'other',
};

@Injectable()
export class BuilderV2Service {
  constructor(
    private readonly prisma: PrismaService,
    private readonly spacesService: SpacesService,
    private readonly storage: SupabaseStorageService,
    private readonly staffingCalculator: StaffingCalculatorService,
  ) {}

  // ─── Garde-fous tenant (par jointure) ──────────────────────────────────────

  private async getSpaceOrThrow(spaceId: string, tenantId: string) {
    const space = await this.prisma.space.findFirst({
      where: { id: spaceId, tenantId },
      select: { id: true, name: true, maxCapacity: true, tenantId: true },
    });
    if (!space) throw new NotFoundException(`Space ${spaceId} not found`);
    return space;
  }

  private async getZoneOrThrow(zoneId: string, tenantId: string) {
    const zone = await this.prisma.zone.findFirst({
      where: { id: zoneId, space: { tenantId } },
      include: { space: { select: { id: true } } },
    });
    if (!zone) throw new NotFoundException(`Zone ${zoneId} not found`);
    return zone;
  }

  private async getElementOrThrow(elementId: string, tenantId: string) {
    const element = await this.prisma.spaceElement.findFirst({
      where: { id: elementId, zone: { space: { tenantId } } },
      include: { zone: { select: { id: true, spaceId: true } } },
    });
    if (!element) throw new NotFoundException(`Element ${elementId} not found`);
    return element;
  }

  private async getConfigOrThrow(configId: string, tenantId: string) {
    const config = await this.prisma.config.findFirst({
      where: { id: configId, space: { tenantId } },
      select: { id: true, name: true, spaceId: true, isSystem: true, capacity: true },
    });
    if (!config) throw new NotFoundException(`Configuration ${configId} not found`);
    return config;
  }

  private mapType(type: string): any {
    const key = String(type || '').toLowerCase().replace(/-/g, '_');
    return TOOL_TYPE_MAP[key] || TOOL_TYPE_MAP[String(type || '').toLowerCase()] || 'other';
  }

  private serializeElement(el: any) {
    return {
      id: el.id,
      zoneId: el.zoneId,
      name: el.name,
      type: el.type,
      subtypes: el.subtypes ?? [],
      x: el.x,
      y: el.y,
      width: el.width ?? 2,
      depth: el.depth ?? 2,
      height3d: el.height3d ?? 2,
      rotation: el.rotation ?? 0,
      cornerRadius: {
        topLeft: el.cornerRadiusTL ?? 0,
        topRight: el.cornerRadiusTR ?? 0,
        bottomLeft: el.cornerRadiusBL ?? 0,
        bottomRight: el.cornerRadiusBR ?? 0,
      },
      capacity: el.capacity ?? null,
      image: el.image ?? null,
      notes: el.notes ?? null,
      area: el.area ?? null,
      attributes: el.attributes ?? null,
      version: el.version ?? 0,
      // Perf/staff/inventaire scopés par CONFIG (une entrée par config adhérente ;
      // clé '' = lignes legacy d'un élément sans config). Le front (sections inspecteur)
      // lit la tranche de sa config active — remplace les anciens champs plats
      // performance/staff/inventory qui fuyaient entre configs.
      performanceByConfig: Object.fromEntries(
        (el.performances ?? []).map((p: any) => [
          p.configId ?? '',
          {
            revenue: p.revenue,
            numberOfPOS: p.numberOfPOS,
            numberOfTransactions: p.numberOfTransactions,
            transactionsPerMinute: p.transactionsPerMinute,
            staffCost: p.staffCost,
            revenuePerEmployee: p.revenuePerEmployee,
          },
        ]),
      ),
      staffByConfig: this.groupByConfig(el.staffPositions, (s: any) => ({
        id: s.id, position: s.position, count: s.count, hourlyRate: s.hourlyRate,
        roleId: s.roleId, source: s.source,
      })),
      inventoryByConfig: this.groupByConfig(el.inventoryItems, (i: any) => ({
        id: i.id, name: i.name, quantity: i.quantity, unit: i.unit,
        minStock: i.minStock, maxStock: i.maxStock, isCustom: i.isCustom, menuItemId: i.menuItemId,
      })),
    };
  }

  /** Groupe des lignes filles par configId ('' = legacy sans config) — contrat ByConfig du front. */
  private groupByConfig<T>(rows: any[] | undefined, map: (r: any) => T): Record<string, T[]> {
    const out: Record<string, T[]> = {};
    for (const r of rows ?? []) {
      const key = r.configId ?? '';
      (out[key] ??= []).push(map(r));
    }
    return out;
  }

  private elementInclude = {
    performances: true,
    staffPositions: true,
    inventoryItems: true,
  } as const;

  /**
   * capacity d'une config = Σ capacity de ses éléments membres (recalcul serveur, doc §2.2).
   * 1 SEUL statement SQL pour N configs — chaque round-trip pooler coûte ~200ms-1s (mesuré,
   * cf. getSpaceShops) : la boucle findMany+update par config explosait le budget < 1s.
   */
  private async recomputeConfigCapacities(configIds: string[]) {
    const unique = [...new Set(configIds.filter(Boolean))];
    if (unique.length === 0) return;
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "Config" c
      SET capacity = COALESCE((
        SELECT SUM(COALESCE(se.capacity, 0))::int
        FROM "ConfigurationElement" ce
        JOIN "SpaceElement" se ON se.id = ce."elementId"
        WHERE ce."configId" = c.id
      ), 0)
      WHERE c.id = ANY(${unique})
    `);
  }

  /**
   * Invalidation Redis NON bloquante : la cohérence des autres vues (Space Menu, wizard)
   * n'a pas à coûter sa latence à la réponse de mutation (budget < 300ms-1s).
   */
  private invalidate(tenantId: string, spaceId: string) {
    void this.spacesService
      .invalidateSpaceCache(tenantId, spaceId)
      .catch(() => undefined);
  }

  // ─── Bootstrap (§3.1) ───────────────────────────────────────────────────────

  /**
   * État complet en 1 SEUL round-trip SQL (CTE + json_agg — même patron éprouvé que
   * getSpaceShops). La version précédente enchaînait 4 allers-retours séquentiels ;
   * à ~200ms-1s de latence pooler par requête (mesuré), elle explosait le budget < 1s.
   */
  async getBuilderState(spaceId: string, tenantId: string) {
    const rows = await this.prisma.$queryRaw<Array<{ payload: any }>>(Prisma.sql`
      WITH sp AS (
        SELECT s.id, s.name, s."maxCapacity"
        FROM "Space" s
        WHERE s.id = ${spaceId} AND s."tenantId" = ${tenantId}
      ),
      zone_rows AS (
        SELECT
          z.id, z.kind::text AS kind, z.name, z.level, z.width, z.length, z.height,
          z.geometry, z."sortIndex",
          COALESCE((
            SELECT json_agg(json_build_object(
              'id', se.id,
              'zoneId', se."zoneId",
              'name', se.name,
              'type', se.type::text,
              'subtypes', se.subtypes,
              'x', se.x, 'y', se.y,
              'width', COALESCE(se.width, 2), 'depth', COALESCE(se.depth, 2),
              'height3d', COALESCE(se."height3d", 2), 'rotation', COALESCE(se.rotation, 0),
              'cornerRadius', json_build_object(
                'topLeft', COALESCE(se."cornerRadiusTL", 0), 'topRight', COALESCE(se."cornerRadiusTR", 0),
                'bottomLeft', COALESCE(se."cornerRadiusBL", 0), 'bottomRight', COALESCE(se."cornerRadiusBR", 0)
              ),
              'capacity', se.capacity, 'image', se.image, 'notes', se.notes, 'area', se.area,
              'attributes', se.attributes, 'version', se.version,
              -- Perf/staff/inventaire scopés par CONFIG (clé '' = legacy sans config) :
              -- une entrée par config adhérente, le front lit sa config active.
              'performanceByConfig', COALESCE((
                SELECT json_object_agg(COALESCE(ep."configId", ''), json_build_object(
                  'revenue', ep.revenue, 'numberOfPOS', ep."numberOfPOS",
                  'numberOfTransactions', ep."numberOfTransactions",
                  'transactionsPerMinute', ep."transactionsPerMinute",
                  'staffCost', ep."staffCost", 'revenuePerEmployee', ep."revenuePerEmployee"
                )) FROM "ElementPerformance" ep WHERE ep."elementId" = se.id
              ), '{}'::json),
              'staffByConfig', COALESCE((
                SELECT json_object_agg(g.cfg, g.rows) FROM (
                  SELECT COALESCE(st."configId", '') AS cfg,
                         json_agg(json_build_object('id', st.id, 'position', st.position, 'count', st.count, 'hourlyRate', st."hourlyRate", 'roleId', st."roleId", 'source', st.source)) AS rows
                  FROM "ElementStaff" st WHERE st."elementId" = se.id GROUP BY 1
                ) g
              ), '{}'::json),
              'inventoryByConfig', COALESCE((
                SELECT json_object_agg(g.cfg, g.rows) FROM (
                  SELECT COALESCE(inv."configId", '') AS cfg,
                         json_agg(json_build_object('id', inv.id, 'name', inv.name, 'quantity', inv.quantity, 'unit', inv.unit,
                           'minStock', inv."minStock", 'maxStock', inv."maxStock", 'isCustom', inv."isCustom", 'menuItemId', inv."menuItemId")) AS rows
                  FROM "ElementInventory" inv WHERE inv."elementId" = se.id GROUP BY 1
                ) g
              ), '{}'::json),
              'configIds', COALESCE((
                SELECT json_agg(ce."configId") FROM "ConfigurationElement" ce WHERE ce."elementId" = se.id
              ), '[]'::json),
              'weezeventMapped', EXISTS(
                SELECT 1 FROM "WeezeventLocationShopMapping" wm
                WHERE wm."spaceElementId" = se.id AND wm."tenantId" = ${tenantId}
              ),
              'weezeventLocationName', (
                SELECT wl.name
                FROM "WeezeventLocationShopMapping" wm
                JOIN "WeezeventLocation" wl
                  ON (wl.id = wm."weezeventLocationId" OR wl."weezeventId" = wm."weezeventLocationId")
                 AND wl."tenantId" = ${tenantId}
                WHERE wm."spaceElementId" = se.id AND wm."tenantId" = ${tenantId}
                LIMIT 1
              ),
              'menuItemsCount', (
                -- DISTINCT : depuis le scoping par config, un élément partagé porte une
                -- ligne PAR config — ce count GLOBAL sert aux dialogues de suppression
                -- (supprimer l'élément touche toutes les configs).
                SELECT COUNT(DISTINCT ma."menuItemId")::int FROM "MenuAssignment" ma
                WHERE ma."elementId" = se.id AND ma.enabled = true
              ),
              'menuCountsByConfig', COALESCE((
                -- Affichage : les badges du builder montrent le count de la CONFIG ACTIVE
                -- (un item vendu en config A seulement ne doit pas apparaître sous B).
                SELECT json_object_agg(mc."configId", mc.cnt) FROM (
                  SELECT ma."configId", COUNT(DISTINCT ma."menuItemId")::int AS cnt
                  FROM "MenuAssignment" ma
                  WHERE ma."elementId" = se.id AND ma.enabled = true AND ma."configId" IS NOT NULL
                  GROUP BY ma."configId"
                ) mc
              ), '{}'::json)
            ))
            FROM "SpaceElement" se WHERE se."zoneId" = z.id
          ), '[]'::json) AS elements
        FROM "Zone" z
        WHERE z."spaceId" = ${spaceId}
      ),
      cfg AS (
        SELECT c.id, c.name, c."isSystem", c.capacity, c."createdAt"
        FROM "Config" c
        WHERE c."spaceId" = ${spaceId}
        ORDER BY c."isSystem" ASC, c."createdAt" ASC
      )
      SELECT json_build_object(
        'space', (SELECT row_to_json(sp) FROM sp),
        'zones', COALESCE((SELECT json_agg(row_to_json(zr)) FROM zone_rows zr), '[]'::json),
        'configurations', COALESCE((SELECT json_agg(row_to_json(cfg)) FROM cfg), '[]'::json)
      ) AS payload
    `);

    const payload = rows[0]?.payload;
    if (!payload?.space) throw new NotFoundException(`Space ${spaceId} not found`);

    // Reshape : le front attend memberships[] et usage[] au niveau racine (contrat §3.1).
    const memberships: Array<{ elementId: string; configIds: string[] }> = [];
    const usage: Array<{
      elementId: string; weezeventMapped: boolean;
      weezeventLocationName: string | null; menuItemsCount: number;
      menuCountsByConfig: Record<string, number>;
    }> = [];
    const zones = (payload.zones || []).map((zone: any) => ({
      ...zone,
      elements: (zone.elements || []).map((el: any) => {
        const {
          configIds, weezeventMapped, weezeventLocationName, menuItemsCount,
          menuCountsByConfig, ...element
        } = el;
        memberships.push({ elementId: el.id, configIds: configIds || [] });
        usage.push({
          elementId: el.id,
          weezeventMapped: !!weezeventMapped,
          weezeventLocationName: weezeventLocationName ?? null,
          menuItemsCount: menuItemsCount || 0,
          menuCountsByConfig: menuCountsByConfig || {},
        });
        return element;
      }),
    }));

    return {
      space: {
        id: payload.space.id,
        name: payload.space.name,
        maxCapacity: payload.space.maxCapacity,
      },
      zones,
      configurations: payload.configurations || [],
      memberships,
      usage,
    };
  }

  // ─── Zones ──────────────────────────────────────────────────────────────────

  async createZone(spaceId: string, tenantId: string, dto: CreateZoneDto) {
    await this.getSpaceOrThrow(spaceId, tenantId);
    const level = dto.kind === 'FLOOR' ? dto.level ?? 0 : 0;

    const existing = await this.prisma.zone.findFirst({
      where: { spaceId, kind: dto.kind as any, level },
    });
    if (existing) {
      throw new ConflictException(
        dto.kind === 'FLOOR'
          ? `Un étage existe déjà au niveau ${level}`
          : 'Cette zone existe déjà pour cet espace',
      );
    }

    const zone = await this.prisma.zone.create({
      data: {
        spaceId,
        kind: dto.kind as any,
        name: dto.name,
        level,
        width: dto.width,
        length: dto.length,
        height: dto.height ?? (dto.kind === 'FLOOR' ? 4 : 0),
        geometry: dto.geometry ?? undefined,
        sortIndex: dto.sortIndex ?? 0,
      },
    });
    await this.invalidate(tenantId, spaceId);
    return zone;
  }

  async updateZone(zoneId: string, tenantId: string, dto: UpdateZoneDto) {
    const zone = await this.getZoneOrThrow(zoneId, tenantId);
    const updated = await this.prisma.zone.update({
      where: { id: zoneId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.level !== undefined && { level: dto.level }),
        ...(dto.width !== undefined && { width: dto.width }),
        ...(dto.length !== undefined && { length: dto.length }),
        ...(dto.height !== undefined && { height: dto.height }),
        ...(dto.geometry !== undefined && { geometry: dto.geometry }),
        ...(dto.sortIndex !== undefined && { sortIndex: dto.sortIndex }),
      },
    });
    await this.invalidate(tenantId, zone.spaceId);
    return updated;
  }

  async reorderZones(spaceId: string, tenantId: string, orderedIds: string[]) {
    await this.getSpaceOrThrow(spaceId, tenantId);
    await this.prisma.$transaction(
      orderedIds.map((id, index) =>
        this.prisma.zone.updateMany({ where: { id, spaceId }, data: { sortIndex: index } }),
      ),
    );
    await this.invalidate(tenantId, spaceId);
    return { ok: true };
  }

  /**
   * Duplication d'une zone FLOOR (parité v1 « Duplicate floor ») : clone la zone au
   * prochain niveau libre + tous ses éléments (avec leurs adhésions) en une transaction.
   * Les mappings Weezevent ne sont JAMAIS copiés.
   */
  async duplicateZone(zoneId: string, tenantId: string) {
    const source = await this.prisma.zone.findFirst({
      where: { id: zoneId, space: { tenantId } },
      include: { elements: { include: { configurationElements: true } } },
    });
    if (!source) throw new NotFoundException(`Zone ${zoneId} not found`);
    if (source.kind !== 'FLOOR') {
      throw new ConflictException('Seuls les étages peuvent être dupliqués (parvis/externe sont uniques)');
    }

    const floors = await this.prisma.zone.findMany({
      where: { spaceId: source.spaceId, kind: 'FLOOR' },
      select: { level: true },
    });
    const nextLevel = Math.max(...floors.map((f) => f.level)) + 1;

    const result = await this.prisma.$transaction(async (tx) => {
      const zone = await tx.zone.create({
        data: {
          spaceId: source.spaceId,
          kind: 'FLOOR',
          name: `${source.name} (Copy)`,
          level: nextLevel,
          width: source.width,
          length: source.length,
          height: source.height,
          geometry: source.geometry ?? undefined,
          sortIndex: source.sortIndex,
        },
      });

      const memberships: Array<{ elementId: string; configIds: string[] }> = [];
      const elements = await Promise.all(
        source.elements.map(async (el) => {
          const copy = await tx.spaceElement.create({
            data: {
              zoneId: zone.id,
              name: el.name,
              type: el.type,
              subtypes: el.subtypes,
              x: el.x,
              y: el.y,
              width: el.width ?? 2,
              depth: el.depth ?? 2,
              height3d: el.height3d ?? 2,
              rotation: el.rotation ?? 0,
              capacity: el.capacity,
              image: el.image,
              notes: el.notes,
              area: el.area,
              attributes: el.attributes ?? undefined,
              cornerRadiusTL: el.cornerRadiusTL ?? 0,
              cornerRadiusTR: el.cornerRadiusTR ?? 0,
              cornerRadiusBL: el.cornerRadiusBL ?? 0,
              cornerRadiusBR: el.cornerRadiusBR ?? 0,
            },
          });
          const configIds = el.configurationElements.map((m) => m.configId);
          if (configIds.length > 0) {
            await tx.configurationElement.createMany({
              data: configIds.map((configId) => ({ configId, elementId: copy.id })),
              skipDuplicates: true,
            });
          }
          memberships.push({ elementId: copy.id, configIds });
          return copy;
        }),
      );

      return { zone, elements, memberships };
    }, { timeout: 20_000 });

    const affectedConfigIds = result.memberships.flatMap((m) => m.configIds);
    await this.recomputeConfigCapacities(affectedConfigIds);
    this.invalidate(tenantId, source.spaceId);

    return {
      zone: {
        id: result.zone.id,
        kind: result.zone.kind,
        name: result.zone.name,
        level: result.zone.level,
        width: result.zone.width,
        length: result.zone.length,
        height: result.zone.height,
        geometry: result.zone.geometry,
        sortIndex: result.zone.sortIndex,
        elements: result.elements.map((el) => this.serializeElement(el)),
      },
      memberships: result.memberships,
    };
  }

  /**
   * Détail lisible d'éléments « utilisés » — alimente les 409 de deleteZone et
   * deleteConfiguration : l'utilisateur doit toujours savoir QUEL élément (et quel
   * shop Weezevent / menu) retient la suppression, sans aller regarder en base.
   */
  private async describeElements(elementIds: string[], tenantId: string) {
    if (elementIds.length === 0) return [];
    return this.prisma.$queryRaw<
      Array<{
        id: string; name: string; zoneName: string;
        weezeventMapped: boolean; weezeventLocationName: string | null; menuItemsCount: number;
      }>
    >`
      SELECT se.id, se.name, z.name AS "zoneName",
        EXISTS(
          SELECT 1 FROM "WeezeventLocationShopMapping" wm
          WHERE wm."spaceElementId" = se.id AND wm."tenantId" = ${tenantId}
        ) AS "weezeventMapped",
        (
          SELECT wl.name
          FROM "WeezeventLocationShopMapping" wm
          JOIN "WeezeventLocation" wl
            ON (wl.id = wm."weezeventLocationId" OR wl."weezeventId" = wm."weezeventLocationId")
           AND wl."tenantId" = ${tenantId}
          WHERE wm."spaceElementId" = se.id AND wm."tenantId" = ${tenantId}
          LIMIT 1
        ) AS "weezeventLocationName",
        (SELECT COUNT(DISTINCT ma."menuItemId")::int FROM "MenuAssignment" ma WHERE ma."elementId" = se.id) AS "menuItemsCount"
      FROM "SpaceElement" se
      JOIN "Zone" z ON z.id = se."zoneId"
      WHERE se.id IN (${Prisma.join(elementIds)})
      ORDER BY z.name, se.name
    `;
  }

  async deleteZone(zoneId: string, tenantId: string, force = false) {
    const zone = await this.getZoneOrThrow(zoneId, tenantId);

    const elements = await this.prisma.spaceElement.findMany({
      where: { zoneId },
      select: { id: true },
    });
    const elementIds = elements.map((e) => e.id);

    // Jamais de perte silencieuse : une zone retenant des éléments UTILISÉS → 409
    // détaillé (quel élément, quel shop). force=true après confirmation : la cascade
    // FK délie proprement mappings Weezevent et menus avec les éléments.
    if (elementIds.length > 0 && !force) {
      const described = await this.describeElements(elementIds, tenantId);
      const blockers = described.filter((d) => d.weezeventMapped || d.menuItemsCount > 0);
      if (blockers.length > 0) {
        throw new ConflictException({
          message: `Zone non supprimée : ${blockers.length} élément(s) utilisé(s) — confirmation requise (force=true)`,
          reasons: blockers.map((b) => {
            const uses = [
              ...(b.weezeventMapped
                ? [`shop Weezevent${b.weezeventLocationName ? ` « ${b.weezeventLocationName} »` : ''}`]
                : []),
              ...(b.menuItemsCount > 0 ? [`${b.menuItemsCount} menu item(s)`] : []),
            ];
            return `« ${b.name} » — ${uses.join(', ')}`;
          }),
          blockers,
        });
      }
    }

    const memberConfigIds = elementIds.length
      ? (
          await this.prisma.configurationElement.findMany({
            where: { elementId: { in: elementIds } },
            select: { configId: true },
          })
        ).map((m) => m.configId)
      : [];

    await this.prisma.zone.delete({ where: { id: zoneId } }); // cascade éléments + adhésions
    await this.recomputeConfigCapacities(memberConfigIds);
    await this.invalidate(tenantId, zone.spaceId);
    return { ok: true };
  }

  // ─── Éléments ───────────────────────────────────────────────────────────────

  async createElement(zoneId: string, tenantId: string, dto: CreateElementDto) {
    const zone = await this.getZoneOrThrow(zoneId, tenantId);

    // Les adhésions initiales doivent viser des configs du MÊME espace. Tolérant aux
    // ids périmés (config supprimée depuis un autre onglet / le builder v1) : on filtre
    // sur les configs encore valides ; 400 actionnable seulement si PLUS AUCUNE ne l'est.
    const requestedConfigIds = [...new Set(dto.configIds || [])];
    let configIds = requestedConfigIds;
    if (requestedConfigIds.length > 0) {
      const valid = await this.prisma.config.findMany({
        where: { id: { in: requestedConfigIds }, spaceId: zone.spaceId },
        select: { id: true },
      });
      configIds = valid.map((c) => c.id);
      if (configIds.length === 0) {
        throw new BadRequestException(
          'La configuration ciblée n\'existe plus pour cet espace (supprimée ?) — l\'état va être resynchronisé, réessayez.',
        );
      }
    }

    const image = (await this.storage.resolveImage(dto.image, 'space-elements')) ?? null;
    const element = await this.prisma.spaceElement.create({
      data: {
        zoneId,
        name: dto.name,
        type: this.mapType(dto.type),
        subtypes: dto.subtypes || [],
        x: dto.x,
        y: dto.y,
        width: dto.width,
        depth: dto.depth,
        height3d: dto.height3d ?? 2,
        rotation: dto.rotation ?? 0,
        capacity: dto.capacity ?? null,
        image,
        notes: dto.notes ?? null,
        area: dto.area ?? null,
        attributes: dto.attributes ?? undefined,
        cornerRadiusTL: dto.cornerRadius?.topLeft ?? 0,
        cornerRadiusTR: dto.cornerRadius?.topRight ?? 0,
        cornerRadiusBL: dto.cornerRadius?.bottomLeft ?? 0,
        cornerRadiusBR: dto.cornerRadius?.bottomRight ?? 0,
      },
      include: this.elementInclude,
    });

    if (configIds.length > 0) {
      await this.prisma.configurationElement.createMany({
        data: configIds.map((configId) => ({ configId, elementId: element.id })),
        skipDuplicates: true,
      });
      await this.recomputeConfigCapacities(configIds);
    }

    await this.invalidate(tenantId, zone.spaceId);
    return { element: this.serializeElement(element), configIds };
  }

  /**
   * PATCH partiel avec verrou optimiste PAR ÉLÉMENT : If-Match: <version> → 409 si la
   * version a changé (rayon du conflit = un élément, contre toute la config en v1).
   */
  async patchElement(elementId: string, tenantId: string, dto: UpdateElementDto, expectedVersion?: number) {
    // Regex-only cost when `image` isn't a fresh base64 upload — keeps this hot
    // autosave path fast; only a real re-upload pays the Storage round-trip.
    const image = dto.image !== undefined ? await this.storage.resolveImage(dto.image, 'space-elements') : undefined;
    const data: any = {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.subtypes !== undefined && { subtypes: dto.subtypes }),
      ...(dto.x !== undefined && { x: dto.x }),
      ...(dto.y !== undefined && { y: dto.y }),
      ...(dto.width !== undefined && { width: dto.width }),
      ...(dto.depth !== undefined && { depth: dto.depth }),
      ...(dto.height3d !== undefined && { height3d: dto.height3d }),
      ...(dto.rotation !== undefined && { rotation: dto.rotation }),
      ...(dto.capacity !== undefined && { capacity: dto.capacity }),
      ...(image !== undefined && { image }),
      ...(dto.notes !== undefined && { notes: dto.notes }),
      ...(dto.area !== undefined && { area: dto.area }),
      ...(dto.attributes !== undefined && { attributes: dto.attributes }),
      ...(dto.cornerRadius !== undefined && {
        cornerRadiusTL: dto.cornerRadius?.topLeft ?? 0,
        cornerRadiusTR: dto.cornerRadius?.topRight ?? 0,
        cornerRadiusBL: dto.cornerRadius?.bottomLeft ?? 0,
        cornerRadiusBR: dto.cornerRadius?.bottomRight ?? 0,
      }),
    };

    // Chemin chaud (autosave) : ownership tenant vérifié DANS l'update (1 RTT) au lieu
    // d'un SELECT préalable — budget < 300ms-1s par mutation.
    const result = await this.prisma.spaceElement.updateMany({
      where: {
        id: elementId,
        zone: { space: { tenantId } },
        ...(expectedVersion !== undefined ? { version: expectedVersion } : {}),
      },
      data: { ...data, version: { increment: 1 } },
    });
    if (result.count === 0) {
      // Chemin d'erreur (rare) : distinguer 404 de 409 coûte 1 requête de plus, acceptable ici.
      const exists = await this.prisma.spaceElement.findFirst({
        where: { id: elementId, zone: { space: { tenantId } } },
        select: { id: true },
      });
      if (!exists) throw new NotFoundException(`Element ${elementId} not found`);
      throw new ConflictException('Élément modifié ailleurs (version obsolète)');
    }

    const fresh = await this.prisma.spaceElement.findFirst({
      where: { id: elementId },
      include: { ...this.elementInclude, zone: { select: { spaceId: true } } },
    });

    if (dto.capacity !== undefined) {
      const memberships = await this.prisma.configurationElement.findMany({
        where: { elementId },
        select: { configId: true },
      });
      await this.recomputeConfigCapacities(memberships.map((m) => m.configId));
    }

    if (fresh?.zone?.spaceId) this.invalidate(tenantId, fresh.zone.spaceId);
    return this.serializeElement(fresh);
  }

  /** Fin de drag multi-éléments : une transaction, pas de verrou (dernier geste gagne). */
  async patchElementsBatch(tenantId: string, dto: BatchElementsDto) {
    const ids = dto.items.map((i) => i.id);
    const owned = await this.prisma.spaceElement.findMany({
      where: { id: { in: ids }, zone: { space: { tenantId } } },
      select: { id: true, zone: { select: { spaceId: true } } },
    });
    const ownedIds = new Set(owned.map((o) => o.id));

    await this.prisma.$transaction(
      dto.items
        .filter((item) => ownedIds.has(item.id))
        .map((item) =>
          this.prisma.spaceElement.update({
            where: { id: item.id },
            data: {
              ...(item.x !== undefined && { x: item.x }),
              ...(item.y !== undefined && { y: item.y }),
              ...(item.width !== undefined && { width: item.width }),
              ...(item.depth !== undefined && { depth: item.depth }),
              ...(item.rotation !== undefined && { rotation: item.rotation }),
              version: { increment: 1 },
            },
          }),
        ),
    );

    const spaceIds = [...new Set(owned.map((o) => o.zone!.spaceId))];
    await Promise.all(spaceIds.map((spaceId) => this.invalidate(tenantId, spaceId)));
    return { updated: [...ownedIds] };
  }

  /** Duplication SERVEUR : copie l'élément + ses adhésions + perf/staff/inventaire — PAS les mappings. */
  async duplicateElement(elementId: string, tenantId: string, dto: DuplicateElementDto) {
    const source = await this.prisma.spaceElement.findFirst({
      where: { id: elementId, zone: { space: { tenantId } } },
      include: { ...this.elementInclude, zone: { select: { spaceId: true } }, configurationElements: true },
    });
    if (!source) throw new NotFoundException(`Element ${elementId} not found`);

    const copy = await this.prisma.spaceElement.create({
      data: {
        zoneId: source.zoneId,
        name: `${source.name} (Copy)`,
        type: source.type,
        subtypes: source.subtypes,
        x: source.x + (dto.offsetX ?? 1),
        y: source.y + (dto.offsetY ?? 1),
        width: source.width ?? 2,
        depth: source.depth ?? 2,
        height3d: source.height3d ?? 2,
        rotation: source.rotation ?? 0,
        capacity: source.capacity,
        image: source.image,
        notes: source.notes,
        area: source.area,
        attributes: source.attributes ?? undefined,
        cornerRadiusTL: source.cornerRadiusTL ?? 0,
        cornerRadiusTR: source.cornerRadiusTR ?? 0,
        cornerRadiusBL: source.cornerRadiusBL ?? 0,
        cornerRadiusBR: source.cornerRadiusBR ?? 0,
        // Copie par CONFIG : chaque ligne garde son configId (la copie adhère aux mêmes
        // configs que la source, cf. createMany ConfigurationElement plus bas).
        performances: source.performances.length
          ? {
              createMany: {
                data: source.performances.map((p) => ({
                  configId: p.configId,
                  revenue: p.revenue,
                  numberOfPOS: p.numberOfPOS,
                  numberOfTransactions: p.numberOfTransactions,
                  transactionsPerMinute: p.transactionsPerMinute,
                  staffCost: p.staffCost,
                  revenuePerEmployee: p.revenuePerEmployee,
                })),
              },
            }
          : undefined,
        staffPositions: source.staffPositions.length
          ? {
              createMany: {
                data: source.staffPositions.map((s) => ({
                  configId: s.configId, position: s.position, count: s.count, hourlyRate: s.hourlyRate,
                  roleId: s.roleId, source: s.source,
                })),
              },
            }
          : undefined,
        inventoryItems: source.inventoryItems.length
          ? {
              createMany: {
                data: source.inventoryItems.map((i) => ({
                  configId: i.configId, name: i.name, quantity: i.quantity, unit: i.unit, minStock: i.minStock,
                  maxStock: i.maxStock, isCustom: i.isCustom, menuItemId: i.menuItemId,
                })),
              },
            }
          : undefined,
      },
      include: this.elementInclude,
    });

    const configIds = source.configurationElements.map((m) => m.configId);
    if (configIds.length > 0) {
      await this.prisma.configurationElement.createMany({
        data: configIds.map((configId) => ({ configId, elementId: copy.id })),
        skipDuplicates: true,
      });
      await this.recomputeConfigCapacities(configIds);
    }

    await this.invalidate(tenantId, source.zone!.spaceId);
    return { element: this.serializeElement(copy), configIds };
  }

  async deleteElement(elementId: string, tenantId: string, force: boolean) {
    const element = await this.getElementOrThrow(elementId, tenantId);

    const [mapping, distinctMenuItems] = await Promise.all([
      this.prisma.locationShopMapping.findFirst({
        where: { tenantId, spaceElementId: elementId },
        select: { salesLocationId: true },
      }),
      // distinct : une ligne par config depuis le scoping — le 409 annonce des ITEMS, pas des lignes
      this.prisma.menuAssignment.findMany({
        where: { elementId },
        distinct: ['menuItemId'],
        select: { menuItemId: true },
      }),
    ]);
    const menuCount = distinctMenuItems.length;

    if ((mapping || menuCount > 0) && !force) {
      throw new ConflictException({
        message: 'Élément utilisé — confirmation requise (force=true)',
        reasons: [
          ...(mapping ? ['Mapping Weezevent (Data Integration étape 2)'] : []),
          ...(menuCount > 0 ? [`${menuCount} assignation(s) de menu (Space Menu)`] : []),
        ],
      });
    }

    const memberships = await this.prisma.configurationElement.findMany({
      where: { elementId },
      select: { configId: true },
    });

    // FK cascade : mapping Weezevent, MenuAssignment, perf/staff/inventaire, adhésions.
    await this.prisma.spaceElement.delete({ where: { id: elementId } });
    await this.recomputeConfigCapacities(memberships.map((m) => m.configId));
    await this.invalidate(tenantId, element.zone!.spaceId);
    return { ok: true };
  }

  // ─── Sous-ressources d'élément ──────────────────────────────────────────────
  // Toutes scopées par CONFIG (même patron que MenuAssignment) : configId explicite
  // envoyé par le front (config active du builder) ; repli = 1re adhésion (ordre
  // createdAt, arbitraire) ; null = élément sans config (lignes legacy clé '').

  private async resolveElementConfigId(elementId: string, explicitConfigId?: string): Promise<string | null> {
    if (explicitConfigId) return explicitConfigId;
    const membership = await this.prisma.configurationElement.findFirst({
      where: { elementId },
      orderBy: { createdAt: 'asc' },
      select: { configId: true },
    });
    return membership?.configId ?? null;
  }

  async putPerformance(elementId: string, tenantId: string, dto: PutPerformanceDto, configId?: string) {
    const element = await this.getElementOrThrow(elementId, tenantId);
    const targetConfigId = await this.resolveElementConfigId(elementId, configId);
    const data = {
      revenue: dto.revenue ?? 0,
      numberOfPOS: dto.numberOfPOS ?? 0,
      numberOfTransactions: dto.numberOfTransactions ?? 0,
      transactionsPerMinute: dto.transactionsPerMinute ?? 0,
      staffCost: dto.staffCost ?? 0,
      revenuePerEmployee: dto.revenuePerEmployee ?? 0,
    };
    // Pas d'upsert Prisma sur (elementId, configId) : configId peut être null (élément
    // orphelin) et Prisma refuse les null dans une clé unique composée. find+update/create
    // — l'unicité DB (elementId, configId) protège contre les doublons non-null.
    const existing = await this.prisma.elementPerformance.findFirst({
      where: { elementId, configId: targetConfigId },
      select: { id: true },
    });
    const performance = existing
      ? await this.prisma.elementPerformance.update({ where: { id: existing.id }, data })
      : await this.prisma.elementPerformance.create({
          data: { elementId, configId: targetConfigId, ...data },
        });
    await this.invalidate(tenantId, element.zone!.spaceId);
    return performance;
  }

  async putStaff(elementId: string, tenantId: string, dto: PutStaffDto, configId?: string) {
    const element = await this.getElementOrThrow(elementId, tenantId);
    const targetConfigId = await this.resolveElementConfigId(elementId, configId);
    await this.prisma.$transaction([
      this.prisma.elementStaff.deleteMany({ where: { elementId, configId: targetConfigId } }),
      ...(dto.staff.length
        ? [
            this.prisma.elementStaff.createMany({
              data: dto.staff.map((s) => ({
                elementId, configId: targetConfigId,
                position: s.position, count: s.count, hourlyRate: s.hourlyRate ?? null,
                roleId: s.roleId ?? null, source: s.source ?? 'MANUAL',
              })),
            }),
          ]
        : []),
    ]);
    await this.invalidate(tenantId, element.zone!.spaceId);
    return this.prisma.elementStaff.findMany({ where: { elementId, configId: targetConfigId } });
  }

  /**
   * Postes obligatoires pour cet élément selon ses sous-types F&B (auto-remplissage
   * de la section Staff du Builder, 2026-07-30 — révisé le même jour suite retour
   * utilisateur). Un rôle tagué avec une catégorie F&B présente suffit — pas besoin
   * d'une règle Sinking en plus (`computeStaffSuggestions`, cf. commentaire). Les
   * règles Sinking avec condition d'équipement ne matchent jamais en pratique ici :
   * aucun champ du Builder ne renseigne encore les attributs (nbFriteuses…) sur
   * SpaceElement.attributes — limite assumée, cf. module doc.
   */
  async getStaffSuggestions(elementId: string, tenantId: string, configId?: string) {
    const element = await this.getElementOrThrow(elementId, tenantId);
    // Garde-fou (2026-07-30) : `temporary` existe aussi comme sous-type du tool
    // `merchshop` — sans ce filtre, un élément non-F&B tagué `temporary` matcherait
    // à tort un rôle RH catégorie TEMPORARY. Même périmètre que generate().
    if (!(STAFFING_ELEMENT_TYPES as readonly string[]).includes((element as any).type)) return [];
    const fnbTags = detectFnbTags((element as any).subtypes);
    if (fnbTags.size === 0) return [];
    const attrs = ((element as any).attributes ?? {}) as Record<string, any>;
    const [roles, rules] = await Promise.all([
      this.prisma.hrRole.findMany({ where: { tenantId } }),
      this.prisma.hrSinkingRule.findMany({ where: { tenantId } }),
    ]);
    return this.staffingCalculator.computeStaffSuggestions(fnbTags, attrs, roles as any, rules as any);
  }

  async putInventory(elementId: string, tenantId: string, dto: PutInventoryDto, configId?: string) {
    const element = await this.getElementOrThrow(elementId, tenantId);
    const targetConfigId = await this.resolveElementConfigId(elementId, configId);
    await this.prisma.$transaction([
      this.prisma.elementInventory.deleteMany({ where: { elementId, configId: targetConfigId } }),
      ...(dto.inventory.length
        ? [
            this.prisma.elementInventory.createMany({
              data: dto.inventory.map((i) => ({
                elementId, configId: targetConfigId,
                name: i.name, quantity: i.quantity, unit: i.unit ?? null,
                minStock: i.minStock ?? null, maxStock: i.maxStock ?? null,
                isCustom: i.isCustom ?? true, menuItemId: i.menuItemId ?? null,
              })),
            }),
          ]
        : []),
    ]);
    await this.invalidate(tenantId, element.zone!.spaceId);
    return this.prisma.elementInventory.findMany({ where: { elementId, configId: targetConfigId } });
  }

  // ─── Adhésions élément ↔ configuration ─────────────────────────────────────

  async addMembership(configId: string, elementId: string, tenantId: string) {
    const [config, element] = await Promise.all([
      this.getConfigOrThrow(configId, tenantId),
      this.getElementOrThrow(elementId, tenantId),
    ]);
    if (config.spaceId !== element.zone!.spaceId) {
      throw new BadRequestException('Élément et configuration n\'appartiennent pas au même espace');
    }
    // Idempotent : re-cocher une adhésion existante n'est pas une erreur.
    await this.prisma.configurationElement.createMany({
      data: [{ configId, elementId }],
      skipDuplicates: true,
    });
    await this.recomputeConfigCapacities([configId]);
    await this.invalidate(tenantId, config.spaceId);
    return { ok: true };
  }

  async removeMembership(configId: string, elementId: string, tenantId: string) {
    const config = await this.getConfigOrThrow(configId, tenantId);
    await this.getElementOrThrow(elementId, tenantId);

    // Invariant : un élément vit dans ≥ 1 configuration (doc §3.2) — sinon il serait
    // invisible partout. La dernière adhésion se retire en supprimant l'élément.
    const count = await this.prisma.configurationElement.count({ where: { elementId } });
    const exists = await this.prisma.configurationElement.findUnique({
      where: { configId_elementId: { configId, elementId } },
    });
    if (exists && count <= 1) {
      throw new ConflictException(
        'Dernière configuration de cet élément — supprimez l\'élément à la place.',
      );
    }

    await this.prisma.configurationElement.deleteMany({ where: { configId, elementId } });
    await this.recomputeConfigCapacities([configId]);
    await this.invalidate(tenantId, config.spaceId);
    return { ok: true };
  }

  // ─── Configurations ─────────────────────────────────────────────────────────

  async createConfiguration(spaceId: string, tenantId: string, dto: CreateConfigurationDto) {
    await this.getSpaceOrThrow(spaceId, tenantId);

    let sourceCapacity = 0;
    if (dto.cloneFromConfigId) {
      const source = await this.getConfigOrThrow(dto.cloneFromConfigId, tenantId);
      if (source.spaceId !== spaceId) {
        throw new BadRequestException('cloneFromConfigId appartient à un autre espace');
      }
      sourceCapacity = source.capacity || 0;
    }

    const config = await this.prisma.config.create({
      data: { name: dto.name, spaceId, capacity: sourceCapacity, isSystem: false },
      select: { id: true, name: true, isSystem: true, capacity: true, createdAt: true },
    });

    // Clone = copie des adhésions (1 requête) — la raison d'être du modèle v2 (doc §2.2).
    if (dto.cloneFromConfigId) {
      const sourceMemberships = await this.prisma.configurationElement.findMany({
        where: { configId: dto.cloneFromConfigId },
        select: { elementId: true },
      });
      if (sourceMemberships.length > 0) {
        await this.prisma.configurationElement.createMany({
          data: sourceMemberships.map((m) => ({ configId: config.id, elementId: m.elementId })),
          skipDuplicates: true,
        });
      }
    }

    await this.invalidate(tenantId, spaceId);
    return config;
  }

  /** Sémantique stricte : 404 si absente (plus jamais l'upsert-surprise de la v1). */
  async renameConfiguration(configId: string, tenantId: string, name: string) {
    const config = await this.getConfigOrThrow(configId, tenantId);
    const updated = await this.prisma.config.update({
      where: { id: configId },
      data: { name },
      select: { id: true, name: true, isSystem: true, capacity: true },
    });
    await this.invalidate(tenantId, config.spaceId);
    return updated;
  }

  async deleteConfiguration(
    configId: string,
    tenantId: string,
    opts: { orphanPolicy?: 'reassign' | 'delete'; reassignToConfigId?: string },
  ) {
    const config = await this.getConfigOrThrow(configId, tenantId);

    const [memberships, otherUserConfigs] = await Promise.all([
      this.prisma.configurationElement.findMany({
        where: { configId },
        select: { elementId: true },
      }),
      this.prisma.config.count({
        where: { spaceId: config.spaceId, isSystem: false, id: { not: configId } },
      }),
    ]);
    const elementIds = memberships.map((m) => m.elementId);

    // Orphelins = éléments dont la SEULE adhésion est cette config.
    let orphanIds: string[] = [];
    if (elementIds.length > 0) {
      const counts = await this.prisma.configurationElement.groupBy({
        by: ['elementId'],
        where: { elementId: { in: elementIds } },
        _count: { _all: true },
      });
      orphanIds = (counts as any[]).filter((c) => c._count._all === 1).map((c) => c.elementId);
    }

    if (orphanIds.length > 0 && !opts.orphanPolicy) {
      // 409 détaillé : nommer les orphelins (et leur shop Weezevent) pour que le
      // dialogue front propose un choix éclairé au lieu d'un refus opaque.
      const orphans = await this.describeElements(orphanIds, tenantId);
      throw new ConflictException({
        message: `${orphanIds.length} élément(s) n'appartiendraient plus à aucune configuration`,
        orphanCount: orphanIds.length,
        orphans,
      });
    }

    if (orphanIds.length > 0 && opts.orphanPolicy === 'reassign') {
      if (!opts.reassignToConfigId) {
        throw new BadRequestException('reassignToConfigId requis avec orphanPolicy=reassign');
      }
      const target = await this.getConfigOrThrow(opts.reassignToConfigId, tenantId);
      if (target.spaceId !== config.spaceId || target.id === configId) {
        throw new BadRequestException('Configuration de rattachement invalide');
      }
      await this.prisma.configurationElement.createMany({
        data: orphanIds.map((elementId) => ({ configId: target.id, elementId })),
        skipDuplicates: true,
      });
      await this.recomputeConfigCapacities([target.id]);
    }

    if (orphanIds.length > 0 && opts.orphanPolicy === 'delete') {
      // Choix explicite de l'utilisateur dans le dialog — cascade mappings/menus.
      await this.prisma.spaceElement.deleteMany({ where: { id: { in: orphanIds } } });
    }

    if (otherUserConfigs === 0) {
      // Dernière config utilisateur de l'espace : purge réelle. Sans ça, les éléments
      // sans adhésion restante (stragglers des suppressions v1 silencieuses comprises)
      // et les zones vides survivent en base et regonflent les comptages du wizard.
      // Le delete de la config cascade ses adhésions AVANT les deleteMany (même tx,
      // exécution séquentielle) ; les éléments membres d'une config système sont
      // préservés (filtre `none`), et leurs zones avec.
      await this.prisma.$transaction([
        this.prisma.config.delete({ where: { id: configId } }), // cascade adhésions
        this.prisma.spaceElement.deleteMany({
          where: { zone: { spaceId: config.spaceId }, configurationElements: { none: {} } },
        }),
        this.prisma.zone.deleteMany({
          where: { spaceId: config.spaceId, elements: { none: {} } },
        }),
      ]);
    } else {
      await this.prisma.config.delete({ where: { id: configId } }); // cascade adhésions
    }
    await this.invalidate(tenantId, config.spaceId);
    return { ok: true };
  }
}
