import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { SupabaseStorageService } from '../../../core/supabase/supabase-storage.service';
import { createSpaceElementWithUniqueSlug } from '../../../shared/utils/generate-space-element-slug';
import { SpaceAccessService } from '../../../core/auth/space-access.service';
import { CreateElementDto, UpdateElementDto, BatchElementsDto, DuplicateElementDto } from '../dto/builder-v2.dto';
import { BuilderV2SupportService } from './builder-v2-support.service';

/** Profil minimal nécessaire pour scoper une requête par espace accessible. */
type SpaceScopedUser = { id: string; isSuperAdmin: boolean; isOwner: boolean; allSpacesAccess: boolean };

/**
 * Éléments d'une zone : création, modification unitaire ou par lot, duplication, suppression.
 */
@Injectable()
export class BuilderV2ElementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: SupabaseStorageService,
    private readonly spaceAccess: SpaceAccessService,
    private readonly builderV2SupportService: BuilderV2SupportService,
  ) {}

  // ─── Éléments ───────────────────────────────────────────────────────────────

  async createElement(zoneId: string, tenantId: string, dto: CreateElementDto, user?: SpaceScopedUser) {
    const zone = await this.builderV2SupportService.getZoneOrThrow(zoneId, tenantId, user);

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
    const mappedType = await this.builderV2SupportService.mapType(dto.type);
    const element = await createSpaceElementWithUniqueSlug(
      this.prisma,
      dto.name,
      (slug) => ({
        zoneId,
        slug,
        name: dto.name,
        type: mappedType,
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
      }),
      { include: this.builderV2SupportService.elementInclude },
    );

    if (configIds.length > 0) {
      await this.prisma.configurationElement.createMany({
        data: configIds.map((configId) => ({ configId, elementId: element.id })),
        skipDuplicates: true,
      });
      await this.builderV2SupportService.recomputeConfigCapacities(tenantId, configIds);
    }

    await this.builderV2SupportService.invalidate(tenantId, zone.spaceId);
    return { element: this.builderV2SupportService.serializeElement(element), configIds };
  }

  /**
   * PATCH partiel avec verrou optimiste PAR ÉLÉMENT : If-Match: <version> → 409 si la
   * version a changé (rayon du conflit = un élément, contre toute la config en v1).
   */
  async patchElement(elementId: string, tenantId: string, dto: UpdateElementDto, expectedVersion?: number, user?: SpaceScopedUser) {
    // Coût espace payé UNIQUEMENT pour un utilisateur restreint (accès complet/appel
    // interne sans user → aucun round-trip supplémentaire) : préserve le chemin chaud
    // décrit ci-dessous pour le cas courant, sans laisser un utilisateur restreint
    // modifier un élément d'un espace auquel il n'a pas droit.
    if (user && !this.spaceAccess.hasFullAccess(user)) {
      const owner = await this.prisma.spaceElement.findFirst({
        where: { id: elementId, zone: { space: { tenantId } } },
        select: { zone: { select: { spaceId: true } } },
      });
      if (!owner) throw new NotFoundException(`Element ${elementId} not found`);
      await this.spaceAccess.assertCanAccessSpace(user, owner.zone?.spaceId);
    }
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
      include: { ...this.builderV2SupportService.elementInclude, zone: { select: { spaceId: true } } },
    });

    if (dto.capacity !== undefined) {
      const memberships = await this.prisma.configurationElement.findMany({
        where: { elementId },
        select: { configId: true },
      });
      await this.builderV2SupportService.recomputeConfigCapacities(tenantId, memberships.map((m) => m.configId));
    }

    if (fresh?.zone?.spaceId) this.builderV2SupportService.invalidate(tenantId, fresh.zone.spaceId);
    return this.builderV2SupportService.serializeElement(fresh);
  }

  /** Fin de drag multi-éléments : une transaction, pas de verrou (dernier geste gagne). */
  async patchElementsBatch(tenantId: string, dto: BatchElementsDto, user?: SpaceScopedUser) {
    const ids = dto.items.map((i) => i.id);
    const owned = await this.prisma.spaceElement.findMany({
      where: { id: { in: ids }, zone: { space: { tenantId } } },
      select: { id: true, zone: { select: { spaceId: true } } },
    });
    // Même idiome que le filtre tenant ci-dessus : un élément d'un espace non accessible
    // à `user` est silencieusement exclu du batch plutôt que de faire échouer tout le drag.
    const accessible =
      user && !this.spaceAccess.hasFullAccess(user) ? await this.spaceAccess.getAccessibleSpaceIds(user) : 'ALL';
    const ownedIds = new Set(
      owned
        .filter((o) => accessible === 'ALL' || !o.zone?.spaceId || accessible.includes(o.zone.spaceId))
        .map((o) => o.id),
    );

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
    await Promise.all(spaceIds.map((spaceId) => this.builderV2SupportService.invalidate(tenantId, spaceId)));
    return { updated: [...ownedIds] };
  }

  /** Duplication SERVEUR : copie l'élément + ses adhésions + perf/staff/inventaire — PAS les mappings. */
  async duplicateElement(elementId: string, tenantId: string, dto: DuplicateElementDto, user?: SpaceScopedUser) {
    const source = await this.prisma.spaceElement.findFirst({
      where: { id: elementId, zone: { space: { tenantId } } },
      include: { ...this.builderV2SupportService.elementInclude, zone: { select: { spaceId: true } }, configurationElements: true },
    });
    if (!source) throw new NotFoundException(`Element ${elementId} not found`);
    await this.spaceAccess.assertCanAccessSpace(user, source.zone?.spaceId);

    const copyName = `${source.name} (Copy)`;
    const copy = await createSpaceElementWithUniqueSlug(this.prisma, copyName, (slug) => ({
        zoneId: source.zoneId,
        slug,
        name: copyName,
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
      }), { include: this.builderV2SupportService.elementInclude });

    const configIds = source.configurationElements.map((m) => m.configId);
    if (configIds.length > 0) {
      await this.prisma.configurationElement.createMany({
        data: configIds.map((configId) => ({ configId, elementId: copy.id })),
        skipDuplicates: true,
      });
      await this.builderV2SupportService.recomputeConfigCapacities(tenantId, configIds);
    }

    await this.builderV2SupportService.invalidate(tenantId, source.zone!.spaceId);
    return { element: this.builderV2SupportService.serializeElement(copy), configIds };
  }

  async deleteElement(elementId: string, tenantId: string, force: boolean, user?: SpaceScopedUser) {
    const element = await this.builderV2SupportService.getElementOrThrow(elementId, tenantId, user);

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
    await this.builderV2SupportService.recomputeConfigCapacities(tenantId, memberships.map((m) => m.configId));
    await this.builderV2SupportService.invalidate(tenantId, element.zone!.spaceId);
    return { ok: true };
  }
}
