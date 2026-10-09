import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { SpaceAccessService } from '../../../core/auth/space-access.service';
import { describeElementsSql, recomputeConfigCapacitiesSql } from '../builder-v2.queries';
import { SpaceCacheService } from '../../spaces/services/space-cache.service';

/** Profil minimal nécessaire pour scoper une requête par espace accessible. */
type SpaceScopedUser = { id: string; isSuperAdmin: boolean; isOwner: boolean; allSpacesAccess: boolean };

// CFG-2 Étape 2 : les 8 départements canoniques sont désormais résolus dynamiquement contre la
// table `Department` (voir mapType() ci-dessous) — cette carte ne couvre plus QUE les 11 valeurs
// legacy qui ne sont pas (encore, cf. Étape 3) des lignes Department : les 5 sous-cas F&B
// aplatis pré-`subtypes[]` (fnb_food/fnb_beverages/fnb_bar/fnb_snack/fnb_icecream) et les 6
// valeurs apparemment mortes de l'ex-enum (seating/stage/parking/restroom/office/other — stage et
// parking sont en réalité des SOUS-types Builder aujourd'hui, pas des types racine ; vérifié
// sans référence vivante hors table de correspondance lors de l'audit CFG-2 Étape 0).
const TOOL_TYPE_MAP: Record<string, string> = {
  fnb_food: 'fnb_food', fnb_beverages: 'fnb_beverages', fnb_bar: 'fnb_bar',
  fnb_snack: 'fnb_snack', fnb_icecream: 'fnb_icecream', seating: 'seating', stage: 'stage',
  parking: 'parking', restroom: 'restroom', office: 'office', other: 'other',
};

/**
 * Socle du Builder v2 : chargements vérifiés (espace, zone, élément, configuration), sérialisation, capacités et invalidation du cache.
 */
@Injectable()
export class BuilderV2SupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly spaceCacheService: SpaceCacheService,
    private readonly spaceAccess: SpaceAccessService,
  ) {}

  // ─── Garde-fous tenant (par jointure) ──────────────────────────────────────

  async getSpaceOrThrow(spaceId: string, tenantId: string, user?: SpaceScopedUser) {
    const space = await this.prisma.space.findFirst({
      where: { id: spaceId, tenantId },
      select: { id: true, name: true, maxCapacity: true, tenantId: true },
    });
    if (!space) throw new NotFoundException(`Space ${spaceId} not found`);
    await this.spaceAccess.assertCanAccessSpace(user, space.id);
    return space;
  }

  async getZoneOrThrow(zoneId: string, tenantId: string, user?: SpaceScopedUser) {
    const zone = await this.prisma.zone.findFirst({
      where: { id: zoneId, space: { tenantId } },
      include: { space: { select: { id: true } } },
    });
    if (!zone) throw new NotFoundException(`Zone ${zoneId} not found`);
    await this.spaceAccess.assertCanAccessSpace(user, zone.spaceId);
    return zone;
  }

  async getElementOrThrow(elementId: string, tenantId: string, user?: SpaceScopedUser) {
    const element = await this.prisma.spaceElement.findFirst({
      where: { id: elementId, zone: { space: { tenantId } } },
      include: { zone: { select: { id: true, spaceId: true } } },
    });
    if (!element) throw new NotFoundException(`Element ${elementId} not found`);
    await this.spaceAccess.assertCanAccessSpace(user, element.zone?.spaceId);
    return element;
  }

  async getConfigOrThrow(configId: string, tenantId: string, user?: SpaceScopedUser) {
    const config = await this.prisma.config.findFirst({
      where: { id: configId, space: { tenantId } },
      select: { id: true, name: true, spaceId: true, isSystem: true, capacity: true },
    });
    if (!config) throw new NotFoundException(`Configuration ${configId} not found`);
    await this.spaceAccess.assertCanAccessSpace(user, config.spaceId);
    return config;
  }

  // CFG-2 Étape 2 : résout d'abord contre `Department` (les 8 codes historiques + tout
  // département créé par le super-admin, par code OU id — un client peut passer l'un ou
  // l'autre), puis retombe sur la carte legacy (11 valeurs hors périmètre Department, cf. plus
  // haut), puis 'other'. Devenue async (lookup DB) — seul appelant : createElement().
  async mapType(type: string): Promise<string> {
    const key = String(type || '').toLowerCase().replace(/-/g, '_');
    const dept = await this.prisma.department.findFirst({ where: { OR: [{ code: key }, { id: type }] } });
    if (dept) return dept.code ?? dept.id;
    return TOOL_TYPE_MAP[key] || TOOL_TYPE_MAP[String(type || '').toLowerCase()] || 'other';
  }

  serializeElement(el: any) {
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

  elementInclude = {
    performances: true,
    staffPositions: true,
    inventoryItems: true,
  } as const;

  /**
   * capacity d'une config = Σ capacity de ses éléments membres (recalcul serveur, doc §2.2).
   * 1 SEUL statement SQL pour N configs — chaque round-trip pooler coûte ~200ms-1s (mesuré,
   * cf. getSpaceShops) : la boucle findMany+update par config explosait le budget < 1s.
   */
  async recomputeConfigCapacities(tenantId: string, configIds: string[]) {
    const unique = [...new Set(configIds.filter(Boolean))];
    if (unique.length === 0) return;
    await recomputeConfigCapacitiesSql(this.prisma, tenantId, unique);
  }

  /**
   * Invalidation Redis NON bloquante : la cohérence des autres vues (Space Menu, wizard)
   * n'a pas à coûter sa latence à la réponse de mutation (budget < 300ms-1s).
   */
  invalidate(tenantId: string, spaceId: string) {
    void this.spaceCacheService
      .invalidateSpaceCache(tenantId, spaceId)
      .catch(() => undefined);
  }

  /**
   * Détail lisible d'éléments « utilisés » — alimente les 409 de deleteZone et
   * deleteConfiguration : l'utilisateur doit toujours savoir QUEL élément (et quel
   * shop Weezevent / menu) retient la suppression, sans aller regarder en base.
   */
  async describeElements(elementIds: string[], tenantId: string) {
    if (elementIds.length === 0) return [];
    return describeElementsSql(this.prisma, tenantId, elementIds);
  }

  // ─── Sous-ressources d'élément ──────────────────────────────────────────────
  // Toutes scopées par CONFIG (même patron que MenuAssignment) : configId explicite
  // envoyé par le front (config active du builder) ; repli = 1re adhésion (ordre
  // createdAt, arbitraire) ; null = élément sans config (lignes legacy clé '').

  async resolveElementConfigId(elementId: string, explicitConfigId?: string): Promise<string | null> {
    if (explicitConfigId) return explicitConfigId;
    const membership = await this.prisma.configurationElement.findFirst({
      where: { elementId },
      orderBy: { createdAt: 'asc' },
      select: { configId: true },
    });
    return membership?.configId ?? null;
  }
}
