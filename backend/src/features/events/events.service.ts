import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { EventWeezeventLinkService } from './services/event-weezevent-link.service';
import { SpaceAccessService } from '../../core/auth/space-access.service';
import { EventTaxonomyService } from './services/event-taxonomy.service';
import { EventTeamService } from './services/event-team.service';

/** Profil minimal nécessaire pour scoper une requête par espace accessible. */
type SpaceScopedUser = { id: string; isSuperAdmin: boolean; isOwner: boolean; allSpacesAccess: boolean };

const ASSERT_SPACE_ACCESS_MESSAGES = {
  none: "Cet événement n'est rattaché à aucun espace — réservé aux comptes à accès complet.",
  denied: "Vous n'avez pas accès à l'espace de cet événement.",
};

/**
 * Événements : création, lecture, modification, suppression et rattachement à un événement Weezevent.
 */
@Injectable()
export class EventsService {
  constructor(
    private prisma: PrismaService,
    private readonly weezeventLinkService: EventWeezeventLinkService,
    private spaceAccess: SpaceAccessService,
    private readonly eventTaxonomyService: EventTaxonomyService,
    private readonly eventTeamService: EventTeamService,
  ) {}

  private readonly logger = new Logger(EventsService.name);

  private readonly includeRelations = {
    eventType: true,
    eventCategory: true,
    eventSubcategory: true,
    visitingTeam: true,
    // BUG-368-02 (2026-08-25) : expose le nom du club/intégration réel (Integration.name),
    // affiché en badge dans le wizard (step 4) — un espace partagé par plusieurs intégrations
    // (ex. PFC/SFP sur Jean Bouin) n'avait jusqu'ici aucun repère fiable, seulement le nom
    // saisi manuellement sur l'event.
    integration: { select: { id: true, name: true } },
  };

  /**
   * BUG-34 : `Event.spaceId`/`configurationId` sont des String sans FK Prisma
   * (voir docs/bugs/34_event_spaceid_sans_fk.md) — contrairement à
   * eventTypeId/eventCategoryId/eventSubcategoryId (BUG-67), aucune vérification
   * d'appartenance tenant n'existait avant ce fix, ouvrant une référence
   * cross-tenant possible. `Space.tenantId` est obligatoire (pas de socle global
   * comme EventType/EventCategory) — même nullabilité que `Team`, d'où le même
   * helper "Owned" strict (et non "Accessible" avec `OR tenantId: null`).
   */
  private async findOwnedSpaceOrThrow(id: string, tenantId: string) {
    const space = await this.prisma.space.findFirst({
      where: { id, tenantId },
    });

    if (!space) {
      throw new NotFoundException(`Space ${id} not found`);
    }

    return space;
  }

  // BUG-368-02 : ownership check pour Event.integrationId, même patron que
  // findOwnedSpaceOrThrow/findOwnedConfigOrThrow.
  private async findOwnedIntegrationOrThrow(id: string, tenantId: string) {
    const integration = await this.prisma.integration.findFirst({
      where: { id, tenantId },
    });

    if (!integration) {
      throw new NotFoundException(`Integration ${id} not found`);
    }

    return integration;
  }

  /**
   * BUG-34 : `Config` (configuration d'espace) n'a pas de `tenantId` propre — son
   * appartenance tenant est portée par l'espace parent (`Config.spaceId` ->
   * `Space.tenantId`). Vérifie donc via la relation plutôt qu'un champ direct.
   */
  private async findOwnedConfigOrThrow(id: string, tenantId: string) {
    const config = await this.prisma.config.findFirst({
      where: { id, space: { tenantId } },
    });

    if (!config) {
      throw new NotFoundException(`Configuration ${id} not found`);
    }

    return config;
  }

  /**
   * Champs équipe d'un event : valide que visitingTeamId appartient au tenant (sinon référence
   * cross-tenant possible) et dérive visitingTeamName côté serveur dès que la FK est posée.
   * `visitingTeamId: null` désassigne (id + nom dénormalisé).
   *
   * Quand seul un NOM est fourni (homeTeamName toujours, visitingTeamName en repli sans FK —
   * cas de l'import CSV et de toute saisie texte libre) : résout-ou-crée l'équipe dans le
   * catalogue Team (scopée à la compétition résolue) plutôt que de stocker un texte jamais
   * relié — c'est ce qui permettait auparavant à Home/Visiting Team de rester introuvables
   * dans les selects du formulaire d'édition après un import (cf. BUG-253-02, initialement
   * corrigé côté frontend, déplacé ici pour éviter les allers-retours réseau en double).
   *
   * `scope` fournit la compétition de repli pour un PATCH qui ne retouche pas la taxonomie —
   * sans ça, changer juste le nom d'une équipe sur un event existant la recréerait sans scope
   * (null/null) au lieu de respecter la compétition déjà en place sur l'event.
   */
  private async resolveEventTeamFields(
    dto: CreateEventDto | UpdateEventDto,
    tenantId: string,
    scope: { eventCategoryId?: string | null; eventSubcategoryId?: string | null } = {},
  ): Promise<Record<string, string | null>> {
    const data: Record<string, string | null> = {};
    const eventCategoryId = dto.eventCategoryId !== undefined ? dto.eventCategoryId : scope.eventCategoryId;
    const eventSubcategoryId = dto.eventSubcategoryId !== undefined ? dto.eventSubcategoryId : scope.eventSubcategoryId;

    if (dto.homeTeamName !== undefined) {
      const trimmed = (dto.homeTeamName ?? '').trim();
      if (!trimmed) {
        data.homeTeamName = null;
      } else {
        const team = await this.eventTeamService.resolveOrCreateTeamByName(tenantId, trimmed, eventCategoryId, eventSubcategoryId);
        data.homeTeamName = team.name;
      }
    }

    if (dto.visitingTeamId !== undefined) {
      if (dto.visitingTeamId === null) {
        data.visitingTeamId = null;
        data.visitingTeamName = null;
      } else {
        const team = await this.eventTeamService.findOwnedTeamOrThrow(dto.visitingTeamId, tenantId);
        data.visitingTeamId = team.id;
        data.visitingTeamName = team.name;
      }
    } else if (dto.visitingTeamName !== undefined) {
      const trimmed = (dto.visitingTeamName ?? '').trim();
      if (!trimmed) {
        data.visitingTeamName = null;
      } else {
        const team = await this.eventTeamService.resolveOrCreateTeamByName(tenantId, trimmed, eventCategoryId, eventSubcategoryId);
        data.visitingTeamId = team.id;
        data.visitingTeamName = team.name;
      }
    }
    return data;
  }

  /**
   * BUG-34 : valide spaceId/configurationId (appartenance tenant) avant écriture —
   * même rôle que resolveEventTaxonomyFields/resolveEventTeamFields pour les autres
   * FK de Event. Ni l'un ni l'autre n'est nullable côté DTO (pas de désassignation
   * explicite `null` comme pour visitingTeamId), seul `undefined` (absent du payload
   * PATCH) doit sauter la vérification.
   */
  private async resolveEventSpaceFields(
    dto: CreateEventDto | UpdateEventDto,
    tenantId: string,
  ): Promise<Record<string, string | null>> {
    const data: Record<string, string | null> = {};
    if (dto.spaceId !== undefined) {
      if (dto.spaceId === null) {
        // Démapper (étape 4 Data Integration) : détache l'event du space sans le
        // supprimer. Emporte configurationId (n'a de sens que scopé à un space).
        data.spaceId = null;
        if (dto.configurationId === undefined) data.configurationId = null;
      } else {
        await this.findOwnedSpaceOrThrow(dto.spaceId, tenantId);
        data.spaceId = dto.spaceId;
      }
    }
    if (dto.configurationId !== undefined) {
      if (dto.configurationId === null) {
        data.configurationId = null;
      } else {
        await this.findOwnedConfigOrThrow(dto.configurationId, tenantId);
        data.configurationId = dto.configurationId;
      }
    }
    // BUG-368-02 : intégration explicite de l'event — voir resolveEventWindow
    // (aggregation.service.ts) pour son usage (mode `integration-range`, prioritaire).
    if (dto.integrationId !== undefined) {
      if (dto.integrationId === null) {
        data.integrationId = null;
      } else {
        await this.findOwnedIntegrationOrThrow(dto.integrationId, tenantId);
        data.integrationId = dto.integrationId;
      }
    }
    return data;
  }

  private async resolveEventTaxonomyFields(
    dto: CreateEventDto | UpdateEventDto,
    tenantId: string,
  ): Promise<Record<string, string | undefined>> {
    const data: Record<string, string | undefined> = {};
    if (dto.eventTypeId !== undefined) {
      await this.eventTaxonomyService.findAccessibleEventTypeOrThrow(dto.eventTypeId, tenantId);
      data.eventTypeId = dto.eventTypeId;
    }
    if (dto.eventCategoryId !== undefined) {
      await this.eventTaxonomyService.findAccessibleEventCategoryOrThrow(dto.eventCategoryId, tenantId);
      data.eventCategoryId = dto.eventCategoryId;
    }
    if (dto.eventSubcategoryId !== undefined) {
      await this.eventTaxonomyService.findAccessibleEventSubcategoryOrThrow(dto.eventSubcategoryId, tenantId);
      data.eventSubcategoryId = dto.eventSubcategoryId;
    }
    return data;
  }

  /**
   * BUG-145-01 (plan 25/08, étape 2.4) : garde de cohérence des dates. SFP-Montauban a pu
   * être saisi avec eventDate 2025-09-20 et eventEndDate 2025-09-06 (fin AVANT le début) —
   * fenêtre d'attribution invalide côté Analyse (0 € affiché) et agrégats posés sur un
   * autre jour que la date visible. Aucun contrôle croisé n'existait (validation de format
   * seule dans le DTO). Comparaison sur les valeurs EFFECTIVES : pour l'update partiel,
   * l'appelant fusionne le payload avec la ligne existante avant d'appeler cette garde.
   */
  private assertEventDatesCoherent(effective: {
    eventDate: Date;
    eventStartDate: Date | null;
    eventEndDate: Date | null;
  }) {
    const day = (d: Date) => d.toISOString().slice(0, 10);
    const { eventDate, eventStartDate, eventEndDate } = effective;
    if (eventEndDate && eventEndDate.getTime() < eventDate.getTime()) {
      throw new BadRequestException(
        `eventEndDate (${day(eventEndDate)}) cannot be earlier than eventDate (${day(eventDate)}).`,
      );
    }
    if (eventStartDate && eventEndDate && eventEndDate.getTime() < eventStartDate.getTime()) {
      throw new BadRequestException(
        `eventEndDate (${day(eventEndDate)}) cannot be earlier than eventStartDate (${day(eventStartDate)}).`,
      );
    }
  }

  async create(tenantId: string, dto: CreateEventDto) {
    this.logger.log(`Creating event "${dto.name}" for tenant ${tenantId}`);
    let created;
    try {
      const eventDate = new Date(dto.eventDate);
      this.assertEventDatesCoherent({
        eventDate,
        eventStartDate: dto.eventStartDate !== undefined ? new Date(dto.eventStartDate) : null,
        eventEndDate: dto.eventEndDate !== undefined ? new Date(dto.eventEndDate) : null,
      });
      created = await this.prisma.event.create({
        data: {
          tenantId,
          name: dto.name,
          eventDate,
          location: dto.location,
          spaceName: dto.spaceName,
          sessions: dto.sessions ? JSON.stringify(dto.sessions) : null,
          numberOfSessions: dto.numberOfSessions,
          hasOpeningAct: dto.hasOpeningAct,
          hasIntermission: dto.hasIntermission,
          performerName: dto.performerName,
          sponsor: dto.sponsor,
          openingActName: dto.openingActName,
          status: dto.status || 'draft',
          ...(dto.eventStartDate !== undefined && { eventStartDate: new Date(dto.eventStartDate) }),
          ...(dto.eventEndDate !== undefined && { eventEndDate: new Date(dto.eventEndDate) }),
          ...(dto.eventEndTime !== undefined && { eventEndTime: dto.eventEndTime }),
          ...(dto.ticketsSold !== undefined && { ticketsSold: dto.ticketsSold }),
          ...(dto.ticketsScanned !== undefined && { ticketsScanned: dto.ticketsScanned }),
          ...(dto.revenue !== undefined && { revenue: dto.revenue }),
          ...(dto.transactionCount !== undefined && { transactionCount: dto.transactionCount }),
          ...(dto.avgSpendPerTx !== undefined && { avgSpendPerTx: dto.avgSpendPerTx }),
          ...(dto.perCapita !== undefined && { perCapita: dto.perCapita }),
          ...(dto.numberOfTpe !== undefined && { numberOfTpe: dto.numberOfTpe }),
          ...(dto.numberOfCollaborators !== undefined && { numberOfCollaborators: dto.numberOfCollaborators }),
          ...(await this.resolveEventSpaceFields(dto, tenantId)),
          ...(await this.resolveEventTaxonomyFields(dto, tenantId)),
          ...(await this.resolveEventTeamFields(dto, tenantId)),
        },
        include: this.includeRelations,
      });
    } catch (error) {
      if (error.code === 'P2003') {
        const fieldName = error.meta?.field_name || 'unknown field';
        throw new BadRequestException(`Invalid ID provided. Foreign key constraint failed on: ${fieldName}.`);
      }
      throw error;
    }

    // BUG-021 : tente un rapprochement automatique avec un WeezeventEvent du même
    // jour (sans ambiguïté) — no-op silencieux si aucun candidat univoque.
    if (tenantId) {
      await this.weezeventLinkService.relinkForTenantDate(tenantId, created.eventDate);
    }
    return created;
  }

  /**
   * `excludeSimulated` : masque les événements créés par l'outil QA « simuler une vente »
   * (Event.isSimulated, cf. SalesSimulationService.ensureTodaySalesEvent). Opt-in et NON activé
   * par défaut : la liste Events doit continuer à les afficher pour qu'on puisse les
   * supprimer à la main. Les consommateurs qui ne veulent que des événements exploitables
   * (EventPredict, écran Live — tous deux servis par le chargement d'espace du front) le
   * passent explicitement.
   */
  async findAll(tenantId: string, page = 1, limit = 50, spaceId?: string, excludeSimulated = false, user?: SpaceScopedUser) {
    page = Math.max(1, page);
    limit = Math.min(200, Math.max(1, limit));
    const skip = (page - 1) * limit;
    // Sans spaceId explicite, un utilisateur restreint à certains espaces ne doit voir QUE
    // les événements qui y sont rattachés — un event sans spaceId est un artefact de
    // démappage/import Weezevent (spaceName peut rester un libellé figé trompeur), pas un
    // événement « global » : il reste réservé aux comptes à accès complet (cf. assertSpaceAccess).
    let spaceScope: Prisma.EventWhereInput = {};
    if (spaceId) {
      spaceScope = { spaceId };
    } else if (user && !this.spaceAccess.hasFullAccess(user)) {
      const accessible = await this.spaceAccess.getAccessibleSpaceIds(user);
      if (accessible !== 'ALL') {
        spaceScope = { spaceId: { in: accessible } };
      }
    }
    const where: Prisma.EventWhereInput = {
      tenantId,
      ...spaceScope,
      ...(excludeSimulated ? { isSimulated: false } : {}),
    };
    const [events, total] = await Promise.all([
      this.prisma.event.findMany({
        where,
        orderBy: { eventDate: 'desc' },
        include: this.includeRelations,
        skip,
        take: limit,
      }),
      this.prisma.event.count({ where }),
    ]);
    return {
      data: events,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string, tenantId: string, user?: SpaceScopedUser) {
    const event = await this.prisma.event.findFirst({
      where: { id, tenantId },
      include: this.includeRelations,
    });
    if (!event) throw new NotFoundException(`Event ${id} not found`);
    await this.spaceAccess.assertCanAccessAny(user, event.spaceId ? [event.spaceId] : [], ASSERT_SPACE_ACCESS_MESSAGES);
    return event;
  }

  async update(id: string, tenantId: string, dto: UpdateEventDto, user?: SpaceScopedUser) {
    const existing = await this.findOne(id, tenantId, user);
    // BUG-021 : un changement de date invalide le lien auto/manuel existant (il a été
    // établi pour l'ancienne date) — repasse par relinkForTenantDate sur la nouvelle date
    // plutôt que de garder silencieusement une association qui ne correspond plus.
    const dateChanged =
      dto.eventDate !== undefined && new Date(dto.eventDate).getTime() !== existing.eventDate.getTime();

    // Garde de cohérence sur les valeurs EFFECTIVES (payload partiel fusionné à
    // l'existant) — voir assertEventDatesCoherent. `null` explicite = champ effacé.
    // Seulement si le payload touche une date : une ligne DÉJÀ incohérente en base
    // (Montauban avant son correctif SQL) doit rester renommable/éditable par ailleurs.
    const touchesDates =
      dto.eventDate !== undefined || dto.eventStartDate !== undefined || dto.eventEndDate !== undefined;
    if (touchesDates) this.assertEventDatesCoherent({
      eventDate: dto.eventDate !== undefined ? new Date(dto.eventDate) : existing.eventDate,
      eventStartDate:
        dto.eventStartDate !== undefined
          ? (dto.eventStartDate === null ? null : new Date(dto.eventStartDate))
          : existing.eventStartDate,
      eventEndDate:
        dto.eventEndDate !== undefined
          ? (dto.eventEndDate === null ? null : new Date(dto.eventEndDate))
          : existing.eventEndDate,
    });

    let updated;
    try {
      updated = await this.prisma.event.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.eventDate !== undefined && { eventDate: new Date(dto.eventDate) }),
          ...(dateChanged && { weezeventEventId: null }),
          ...(dto.location !== undefined && { location: dto.location }),
          ...(dto.spaceName !== undefined && { spaceName: dto.spaceName }),
          ...(dto.sessions !== undefined && { sessions: dto.sessions ? JSON.stringify(dto.sessions) : null }),
          ...(dto.numberOfSessions !== undefined && { numberOfSessions: dto.numberOfSessions }),
          ...(dto.hasOpeningAct !== undefined && { hasOpeningAct: dto.hasOpeningAct }),
          ...(dto.hasIntermission !== undefined && { hasIntermission: dto.hasIntermission }),
          ...(dto.performerName !== undefined && { performerName: dto.performerName }),
          ...(dto.sponsor !== undefined && { sponsor: dto.sponsor }),
          ...(dto.openingActName !== undefined && { openingActName: dto.openingActName }),
          ...(dto.status !== undefined && { status: dto.status }),
          ...(dto.eventStartDate !== undefined && { eventStartDate: new Date(dto.eventStartDate) }),
          ...(dto.eventEndDate !== undefined && { eventEndDate: new Date(dto.eventEndDate) }),
          ...(dto.eventEndTime !== undefined && { eventEndTime: dto.eventEndTime }),
          ...(dto.ticketsSold !== undefined && { ticketsSold: dto.ticketsSold }),
          ...(dto.ticketsScanned !== undefined && { ticketsScanned: dto.ticketsScanned }),
          ...(dto.revenue !== undefined && { revenue: dto.revenue }),
          ...(dto.transactionCount !== undefined && { transactionCount: dto.transactionCount }),
          ...(dto.avgSpendPerTx !== undefined && { avgSpendPerTx: dto.avgSpendPerTx }),
          ...(dto.perCapita !== undefined && { perCapita: dto.perCapita }),
          ...(dto.numberOfTpe !== undefined && { numberOfTpe: dto.numberOfTpe }),
          ...(dto.numberOfCollaborators !== undefined && { numberOfCollaborators: dto.numberOfCollaborators }),
          ...(await this.resolveEventSpaceFields(dto, tenantId)),
          ...(await this.resolveEventTaxonomyFields(dto, tenantId)),
          ...(await this.resolveEventTeamFields(dto, tenantId, {
            eventCategoryId: existing.eventCategoryId,
            eventSubcategoryId: existing.eventSubcategoryId,
          })),
        },
        include: this.includeRelations,
      });
    } catch (error) {
      if (error.code === 'P2003') {
        const fieldName = error.meta?.field_name || 'unknown field';
        throw new BadRequestException(`Invalid ID provided. Foreign key constraint failed on: ${fieldName}.`);
      }
      throw error;
    }

    if (dateChanged && tenantId) {
      await this.weezeventLinkService.relinkForTenantDate(tenantId, updated.eventDate);
    }

    // Démapper (étape 4 Data Integration) : purge l'agrégation minute-par-minute laissée
    // orpheline par ce space/event — sinon elle ne sera plus jamais lue (l'event a quitté
    // la liste du space) mais reste en base jusqu'à une éventuelle synchronisation finale.
    if (dto.spaceId === null && existing.spaceId) {
      const orphanWhere = { tenantId, spaceId: existing.spaceId, weezeventEventId: id };
      await Promise.all([
        this.prisma.spaceRevenueMinuteAgg.deleteMany({ where: orphanWhere }),
        this.prisma.spaceRevenueMinuteItemAgg.deleteMany({ where: orphanWhere }),
        this.prisma.spaceBasketMinuteAgg.deleteMany({ where: orphanWhere }),
      ]);
    }

    return updated;
  }

  async remove(id: string, tenantId: string, user?: SpaceScopedUser) {
    await this.findOne(id, tenantId, user);
    return this.prisma.event.delete({ where: { id } });
  }

  // ── BUG-021 : désambiguïsation manuelle Event <-> WeezeventEvent ──

  // listAmbiguousWeezeventMatches (banner de résolution manuelle BUG-021, GET
  // /events/weezevent-ambiguous-matches) supprimée le 2026-08-25 : proposait des conteneurs de
  // saison/site comme candidats de résolution (cas réel observé, BUG-361-02) et jugée sans valeur
  // par l'utilisateur une fois ce cas corrigé. resolveWeezeventLink ci-dessous (endpoint PATCH)
  // reste utilisé par bulkCreateEvents (StepProcessTimeline.vue) pour le rattachement automatique.

  /**
   * Résolution manuelle d'un appariement Event <-> WeezeventEvent laissé ambigu.
   * `weezeventEventId: null` délie explicitement un event déjà lié — c'est le "Démapper" du step 4
   * (StepProcessTimeline.vue, `handleUnmapEvent`) : ne touche QUE le lien vers la donnée
   * Weezevent/Digifood, jamais `spaceId` (2026-08-25 — l'event reste un event DE l'espace, sa
   * date/son lieu ne changent pas ; retirer `spaceId` le faisait disparaître de la liste du
   * space, empêchant tout re-mapping ultérieur — confusion signalée par l'utilisateur).
   */
  async resolveWeezeventLink(id: string, tenantId: string, weezeventEventId: string | null, user?: SpaceScopedUser) {
    const existing = await this.findOne(id, tenantId, user);

    if (weezeventEventId !== null) {
      const target = await this.prisma.salesEvent.findFirst({
        where: { id: weezeventEventId, tenantId },
        select: { id: true },
      });
      if (!target) {
        throw new BadRequestException(`WeezeventEvent ${weezeventEventId} not found for this tenant`);
      }
    }

    const updated = await this.prisma.event.update({
      where: { id },
      data: { weezeventEventId },
      include: this.includeRelations,
    });

    // Garde `SalesEvent.metadata.dfEventId` (miroir écrit par bulkCreateEvents, lu par
    // loadWeezeventEvents pour réhydrater weezEventMappings côté front, BUG-331-02) synchronisé
    // avec `Event.weezeventEventId` — la vraie source de vérité — quel que soit l'appelant de CE
    // endpoint, pas seulement bulkCreateEvents qui l'écrit lui-même en plus à la création. Sans
    // ça, "Démapper" rompait le vrai lien mais laissait le miroir pointer sur cet Event : le
    // WeezeventEvent restait invisible pour "Créer et lier tout" indéfiniment (weezEventMappings
    // le montrait toujours "déjà lié"), même après un rechargement complet (2026-08-25).
    const oldLink = existing.weezeventEventId;
    if (oldLink && oldLink !== weezeventEventId) {
      await this.clearDfEventIdMirrorIfOwnedBy(oldLink, tenantId, id);
    }
    if (weezeventEventId) {
      await this.setDfEventIdMirror(weezeventEventId, tenantId, id);
    }

    // Le lien change (ou se vide) : les agrégats déjà calculés pour l'ANCIEN rattachement sont
    // périmés — même raisonnement que le nettoyage historique de update()/spaceId=null, étendu
    // ici aux DEUX tables (SpaceRevenueMinuteAgg pour le step 4, SpaceRevenueMinuteItemAgg pour
    // l'Analyse — la seconde n'était jamais purgée, cf. constat du 2026-08-25).
    if (existing.spaceId) {
      const deleteWhere = { tenantId, spaceId: existing.spaceId, weezeventEventId: id };
      await Promise.all([
        this.prisma.spaceRevenueMinuteAgg.deleteMany({ where: deleteWhere }),
        this.prisma.spaceRevenueMinuteItemAgg.deleteMany({ where: deleteWhere }),
        this.prisma.spaceBasketMinuteAgg.deleteMany({ where: deleteWhere }),
      ]);
    }

    return updated;
  }

  /** Efface le miroir dfEventId d'un SalesEvent — seulement s'il pointe encore vers `expectedDfEventId`
   *  (un autre Event a pu reprendre ce lien entre-temps, ne pas lui voler son miroir). */
  private async clearDfEventIdMirrorIfOwnedBy(salesEventId: string, tenantId: string, expectedDfEventId: string) {
    const se = await this.prisma.salesEvent.findFirst({ where: { id: salesEventId, tenantId }, select: { id: true, metadata: true } });
    if (!se) return;
    const meta = (se.metadata as Record<string, unknown>) ?? {};
    if (meta.dfEventId !== expectedDfEventId) return;
    await this.prisma.salesEvent.update({ where: { id: se.id }, data: { metadata: { ...meta, dfEventId: null } } });
  }

  /** Pose/écrase le miroir dfEventId d'un SalesEvent pour qu'il pointe vers `dfEventId`. */
  private async setDfEventIdMirror(salesEventId: string, tenantId: string, dfEventId: string) {
    const se = await this.prisma.salesEvent.findFirst({ where: { id: salesEventId, tenantId }, select: { id: true, metadata: true } });
    if (!se) return;
    const meta = (se.metadata as Record<string, unknown>) ?? {};
    await this.prisma.salesEvent.update({ where: { id: se.id }, data: { metadata: { ...meta, dfEventId } } });
  }
}
