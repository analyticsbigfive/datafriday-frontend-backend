import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { CreateConfigurationDto } from '../dto/builder-v2.dto';
import { BuilderV2SupportService } from './builder-v2-support.service';

/** Profil minimal nécessaire pour scoper une requête par espace accessible. */
type SpaceScopedUser = { id: string; isSuperAdmin: boolean; isOwner: boolean; allSpacesAccess: boolean };

/**
 * Configurations d'un espace : adhésion des éléments, création (avec clonage), renommage, suppression.
 */
@Injectable()
export class BuilderV2ConfigurationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly builderV2SupportService: BuilderV2SupportService,
  ) {}

  // ─── Adhésions élément ↔ configuration ─────────────────────────────────────

  async addMembership(configId: string, elementId: string, tenantId: string, user?: SpaceScopedUser) {
    const [config, element] = await Promise.all([
      this.builderV2SupportService.getConfigOrThrow(configId, tenantId, user),
      this.builderV2SupportService.getElementOrThrow(elementId, tenantId, user),
    ]);
    if (config.spaceId !== element.zone!.spaceId) {
      throw new BadRequestException('Élément et configuration n\'appartiennent pas au même espace');
    }
    // Idempotent : re-cocher une adhésion existante n'est pas une erreur.
    await this.prisma.configurationElement.createMany({
      data: [{ configId, elementId }],
      skipDuplicates: true,
    });
    await this.builderV2SupportService.recomputeConfigCapacities(tenantId, [configId]);
    await this.builderV2SupportService.invalidate(tenantId, config.spaceId);
    return { ok: true };
  }

  async removeMembership(configId: string, elementId: string, tenantId: string, user?: SpaceScopedUser) {
    const config = await this.builderV2SupportService.getConfigOrThrow(configId, tenantId, user);
    await this.builderV2SupportService.getElementOrThrow(elementId, tenantId, user);

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
    await this.builderV2SupportService.recomputeConfigCapacities(tenantId, [configId]);
    await this.builderV2SupportService.invalidate(tenantId, config.spaceId);
    return { ok: true };
  }

  // ─── Configurations ─────────────────────────────────────────────────────────

  async createConfiguration(spaceId: string, tenantId: string, dto: CreateConfigurationDto, user?: SpaceScopedUser) {
    await this.builderV2SupportService.getSpaceOrThrow(spaceId, tenantId, user);

    let sourceCapacity = 0;
    if (dto.cloneFromConfigId) {
      const source = await this.builderV2SupportService.getConfigOrThrow(dto.cloneFromConfigId, tenantId, user);
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

      // Menus (Space Menu) des PdV : scopés par configuration (MenuAssignment.configId),
      // donc NON portés par les adhésions. Sans cette copie, une config clonée avait ses
      // PdV mais aucun article (Aix Arena 2026-09-23/24 : 10 configs vides, Event Predict
      // « No items available »). Copie à l'identique, cochés comme décochés.
      const sourceAssignments = await this.prisma.menuAssignment.findMany({
        where: { configId: dto.cloneFromConfigId, elementId: { not: null } },
        select: { elementId: true, menuItemId: true, enabled: true },
      });
      if (sourceAssignments.length > 0) {
        await this.prisma.menuAssignment.createMany({
          data: sourceAssignments.map((a) => ({
            configId: config.id,
            elementId: a.elementId,
            menuItemId: a.menuItemId,
            enabled: a.enabled,
          })),
          skipDuplicates: true,
        });
      }
    }

    await this.builderV2SupportService.invalidate(tenantId, spaceId);
    return config;
  }

  /** Sémantique stricte : 404 si absente (plus jamais l'upsert-surprise de la v1). */
  async renameConfiguration(configId: string, tenantId: string, name: string, user?: SpaceScopedUser) {
    const config = await this.builderV2SupportService.getConfigOrThrow(configId, tenantId, user);
    const updated = await this.prisma.config.update({
      where: { id: configId },
      data: { name },
      select: { id: true, name: true, isSystem: true, capacity: true },
    });
    await this.builderV2SupportService.invalidate(tenantId, config.spaceId);
    return updated;
  }

  async deleteConfiguration(
    configId: string,
    tenantId: string,
    opts: { orphanPolicy?: 'reassign' | 'delete'; reassignToConfigId?: string },
    user?: SpaceScopedUser,
  ) {
    const config = await this.builderV2SupportService.getConfigOrThrow(configId, tenantId, user);

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
      const orphans = await this.builderV2SupportService.describeElements(orphanIds, tenantId);
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
      const target = await this.builderV2SupportService.getConfigOrThrow(opts.reassignToConfigId, tenantId);
      if (target.spaceId !== config.spaceId || target.id === configId) {
        throw new BadRequestException('Configuration de rattachement invalide');
      }
      await this.prisma.configurationElement.createMany({
        data: orphanIds.map((elementId) => ({ configId: target.id, elementId })),
        skipDuplicates: true,
      });
      await this.builderV2SupportService.recomputeConfigCapacities(tenantId, [target.id]);
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
    await this.builderV2SupportService.invalidate(tenantId, config.spaceId);
    return { ok: true };
  }
}
