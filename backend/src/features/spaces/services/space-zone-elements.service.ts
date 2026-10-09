import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';


/** Entrée JSON v1 (Config.data) d'un SpaceElement absent du JSON source. */
export function toV1JsonElement(
  relElement: any,
  defaults: { width: number; height: number; depth: number } = { width: 2, height: 2, depth: 2 },
) {
  const attrs = relElement.attributes as any;
  return {
    id: relElement.id,
    name: relElement.name,
    type: attrs?.originalType ?? 'shop',
    x: relElement.x ?? 0,
    y: relElement.y ?? 0,
    width: relElement.width ?? defaults.width,
    height: relElement.height ?? defaults.height,
    depth: relElement.depth ?? defaults.depth,
    shopType: relElement.shopTypes ?? [],
    storageType: relElement.storageTypes ?? [],
    hospitalityType: relElement.hospitalityTypes ?? [],
    accessType: relElement.accessTypes ?? [],
    entertainmentType: relElement.entertainmentTypes ?? [],
    entranceType: relElement.entranceTypes ?? [],
    kitchenType: relElement.kitchenTypes ?? [],
    attributes: attrs ?? {},
    cornerRadius: { topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 },
  };
}

/**
 * Conversions entre les éléments de zone (Builder v2) et le format de configuration v1,
 * mappage des types d'éléments, écriture optimiste de Config.data.
 */
@Injectable()
export class SpaceZoneElementsService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Map frontend element type to Prisma ElementType enum
   * Frontend uses composite types like 'fnb-food', 'merch-temporary'
   * We map to the closest enum value or 'other' as fallback
   */
  mapElementType(type: string): any {
    if (!type || typeof type !== 'string') return 'other';

    // Direct mappings
    const directMap: Record<string, string> = {
      'shop': 'shop',
      'storage': 'storage',
      'hospitality': 'hospitality',
      'access': 'access',
      'entertainment': 'entertainment',
      'entrance': 'entrance',
      'merchshop': 'merchshop',
      'kitchen': 'kitchen',
      'seating': 'seating',
      'stage': 'stage',
      'parking': 'parking',
      'restroom': 'restroom',
      'office': 'office',
      'other': 'other',
    };
    
    if (directMap[type]) return directMap[type];
    
    // F&B types
    if (type.startsWith('fnb-')) {
      const subType = type.replace('fnb-', '');
      const fnbMap: Record<string, string> = {
        'food': 'fnb_food',
        'beverages': 'fnb_beverages',
        'bar': 'fnb_bar',
        'snack': 'fnb_snack',
        'icecream': 'fnb_icecream',
        'beer': 'fnb_bar',
        'gppremium': 'fnb_food',
        'temporary': 'fnb_food',
        'drinkee': 'fnb_beverages',
      };
      return fnbMap[subType] || 'fnb_food';
    }
    
    // Merch types
    if (type.startsWith('merch-')) {
      return 'merchshop';
    }
    
    // Storage types
    if (type.startsWith('storage-')) {
      return 'storage';
    }
    
    // Hospitality types
    if (type.startsWith('hospitality-')) {
      return 'hospitality';
    }
    
    // Access types
    if (type.startsWith('access-')) {
      return 'access';
    }
    
    // Entertainment types  
    if (type.startsWith('entertainment-')) {
      return 'entertainment';
    }
    
    // Entrance types
    if (type.startsWith('entrance-')) {
      return 'entrance';
    }
    
    // Kitchen types
    if (type.startsWith('kitchen-')) {
      return 'kitchen';
    }
    
    return 'other';
  }

  /**
   * Map a frontend F&B sub-type (e.g. 'fnb-beverages') to the shopTypes tags
   * used by the 3D builder's shop type filter (food/beverages/beer/gppremium/temporary/drinkee).
   */
  mapShopTypeTags(type?: string): string[] {
    if (!type || !type.startsWith('fnb-')) return [];
    const subType = type.replace('fnb-', '');
    const tagMap: Record<string, string> = {
      food: 'food',
      beverages: 'beverages',
      bar: 'beer',
      snack: 'food',
      icecream: 'food',
      beer: 'beer',
      gppremium: 'gppremium',
      temporary: 'temporary',
      drinkee: 'drinkee',
    };
    const tag = tagMap[subType];
    return tag ? [tag] : [];
  }

  /**
   * Transform a floor element from DB to frontend format
   */
  private transformElement(element: any) {
    // Use originalType from attributes if available, otherwise reverse map from enum
    const attrs = element.attributes as any;
    const originalType = attrs?.originalType || this.reverseMapElementType(element.type);
    
    return {
      id: element.id,
      name: element.name,
      type: originalType, // Return original frontend type
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
      depth: element.depth,
      height3d: element.height3d,
      rotation: element.rotation,
      image: element.image,
      notes: element.notes,
      capacity: element.capacity,
      cornerRadius: {
        topLeft: element.cornerRadiusTL,
        topRight: element.cornerRadiusTR,
        bottomLeft: element.cornerRadiusBL,
        bottomRight: element.cornerRadiusBR,
      },
      shopType: element.shopTypes,
      storageType: element.storageTypes,
      hospitalityType: element.hospitalityTypes,
      accessType: element.accessTypes,
      entertainmentType: element.entertainmentTypes,
      entranceType: element.entranceTypes,
      kitchenType: element.kitchenTypes,
      tags: element.tags,
      attributes: element.attributes,
      // Light performance - only revenue for quick display
      performance: element.performance
        ? {
            revenue: element.performance.revenue,
            // Other fields loaded on-demand via getElementDetails
          }
        : null,
      // Staff and inventory loaded on-demand
      staffPositions: element.staffPositions?.map((s: any) => ({
        id: s.id,
        position: s.position,
        count: s.count,
        hourlyRate: s.hourlyRate,
      })) || [],
      inventoryItems: element.inventoryItems?.map((i: any) => ({
        id: i.id,
        name: i.name,
        quantity: i.quantity,
        unit: i.unit,
        minStock: i.minStock,
        maxStock: i.maxStock,
        isCustom: i.isCustom,
        menuItemId: i.menuItemId,
      })) || [],
    };
  }

  /**
   * Reverse map Prisma ElementType enum to frontend type
   */
  reverseMapElementType(type: string): string {
    const reverseMap: Record<string, string> = {
      'fnb_food': 'fnb-food',
      'fnb_beverages': 'fnb-beverages',
      'fnb_bar': 'fnb-bar',
      'fnb_snack': 'fnb-snack',
      'fnb_icecream': 'fnb-icecream',
      'shop': 'shop',
      'storage': 'storage',
      'hospitality': 'hospitality',
      'access': 'access',
      'entertainment': 'entertainment',
      'entrance': 'entrance',
      'merchshop': 'merchshop',
      'kitchen': 'kitchen',
      'seating': 'seating',
      'stage': 'stage',
      'parking': 'parking',
      'restroom': 'restroom',
      'office': 'office',
      'other': 'other',
    };
    return reverseMap[type] || type;
  }

  /**
   * Builder v2 → lecture v1 : sérialise un élément de Zone au format JSON v1
   * (consommé par EventPredict, SpacesPage, analyse store, StepMapShops…).
   * `managedByBuilderV2` le marque : saveConfiguration l'écarte de tout payload v1.
   */
  private serializeZoneElementForV1(el: any) {
    const attrs = (el.attributes as any) ?? {};
    return {
      id: el.id,
      name: el.name,
      type: attrs.originalType ?? this.reverseMapElementType(el.type),
      x: el.x ?? 0,
      y: el.y ?? 0,
      width: el.width ?? 2,
      height: el.height ?? el.depth ?? 2,
      depth: el.depth ?? 2,
      height3d: el.height3d ?? 2,
      rotation: el.rotation ?? 0,
      capacity: el.capacity ?? null,
      image: el.image ?? null,
      notes: el.notes ?? null,
      shopType: (el.subtypes?.length ? el.subtypes : el.shopTypes) ?? [],
      storageType: el.storageTypes ?? [],
      hospitalityType: el.hospitalityTypes ?? [],
      accessType: el.accessTypes ?? [],
      entertainmentType: el.entertainmentTypes ?? [],
      entranceType: el.entranceTypes ?? [],
      kitchenType: el.kitchenTypes ?? [],
      attributes: { ...attrs, area: el.area ?? attrs.area, managedByBuilderV2: true },
      configurationIds: (el.configurationElements ?? []).map((m: any) => m.configId),
      cornerRadius: {
        topLeft: el.cornerRadiusTL ?? 0,
        topRight: el.cornerRadiusTR ?? 0,
        bottomLeft: el.cornerRadiusBL ?? 0,
        bottomRight: el.cornerRadiusBR ?? 0,
      },
    };
  }

  /** Éléments v2 (zones) d'un espace, avec zone + adhésions — pour l'injection lecture v1. */
  async fetchZoneElementsForSpace(spaceId: string) {
    return this.prisma.spaceElement.findMany({
      where: { zone: { spaceId } },
      include: {
        zone: true,
        configurationElements: { select: { configId: true } },
      },
    });
  }

  /**
   * Injecte les éléments v2 membres de `configId` dans un `config.data` v1 (floors /
   * forecourt / externalMerch) — sans muter l'original, dédupliqué par id. Les floors
   * manquants au niveau d'une Zone sont synthétisés depuis la Zone.
   */
  mergeZoneElementsIntoConfigData(data: any, zoneElements: any[], configId: string) {
    const relevant = zoneElements.filter((el) =>
      (el.configurationElements ?? []).some((m: any) => m.configId === configId),
    );
    if (relevant.length === 0) return data;

    const out: any = { ...(data || {}) };
    const floors: any[] = Array.isArray(out.floors)
      ? out.floors.map((f: any) => ({ ...f, elements: [...(f.elements || [])] }))
      : [];
    let forecourt = out.forecourt ? { ...out.forecourt, elements: [...(out.forecourt.elements || [])] } : null;
    let externalMerch = out.externalMerch ? { ...out.externalMerch, elements: [...(out.externalMerch.elements || [])] } : null;

    const defaultHole = { enabled: false, x: 0.5, y: 0.5, width: 10, length: 10, cornerRadius: { topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 } };

    for (const el of relevant) {
      const zone = el.zone;
      if (!zone) continue;
      const serialized = this.serializeZoneElementForV1(el);

      if (zone.kind === 'FLOOR') {
        let floor = floors.find((f: any) => (f.level ?? 0) === (zone.level ?? 0));
        if (!floor) {
          floor = {
            id: zone.id,
            name: zone.name,
            level: zone.level ?? 0,
            width: zone.width ?? 100,
            height: zone.height ?? 4,
            length: zone.length ?? 100,
            elements: [],
            cornerRadius: (zone.geometry as any)?.cornerRadius ?? { topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 },
            hole: (zone.geometry as any)?.hole ?? defaultHole,
          };
          floors.push(floor);
        }
        if (!Array.isArray(floor.elements)) floor.elements = [];
        if (!floor.elements.some((e: any) => e?.id === el.id)) floor.elements.push(serialized);
      } else if (zone.kind === 'FORECOURT') {
        if (!forecourt) {
          forecourt = { id: zone.id, name: zone.name, width: zone.width ?? 50, length: zone.length ?? 50, elements: [], cornerRadius: { topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 } };
        }
        if (!forecourt.elements.some((e: any) => e?.id === el.id)) forecourt.elements.push(serialized);
      } else {
        if (!externalMerch) {
          externalMerch = { id: zone.id, name: zone.name, width: zone.width ?? 50, length: zone.length ?? 50, elements: [], cornerRadius: { topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 } };
        }
        if (!externalMerch.elements.some((e: any) => e?.id === el.id)) externalMerch.elements.push(serialized);
      }
    }

    out.floors = floors;
    out.forecourt = forecourt;
    out.externalMerch = externalMerch;
    return out;
  }

  /**
   * A21 — Read-modify-write de `config.data` avec verrou optimiste (champ `version`).
   * `mutate` reçoit le `data` JSON courant (relu à chaque tentative) et retourne le nouveau `data`.
   * L'écriture n'aboutit que si `version` n'a pas changé entre la lecture et l'écriture ;
   * sinon on relit et on ré-applique `mutate` (jusqu'à `maxRetries`). À la dernière tentative,
   * écriture inconditionnelle (last-write-wins) pour ne jamais perdre la mutation.
   */
  async updateConfigDataOptimistic(
    configId: string,
    mutate: (currentData: any) => any | Promise<any>,
    maxRetries = 3,
  ): Promise<void> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const fresh = await this.prisma.config.findFirst({
        where: { id: configId },
        select: { data: true, version: true },
      });
      if (!fresh) throw new NotFoundException(`Configuration ${configId} not found`);

      const newData = await mutate((fresh.data as any) || {});
      const isLastAttempt = attempt === maxRetries;

      const res = await this.prisma.config.updateMany({
        // Dernière tentative : on retombe sur un update inconditionnel (last-write-wins).
        where: isLastAttempt ? { id: configId } : { id: configId, version: fresh.version },
        data: { data: newData, version: { increment: 1 } },
      });
      if (res.count >= 1) return;
      // Conflit concurrent (version a changé) → on retente.
    }
  }
}
