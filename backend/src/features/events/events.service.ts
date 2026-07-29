import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { CreateTeamDto } from './dto/create-team.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { EventWeezeventLinkService } from './services/event-weezevent-link.service';

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    private prisma: PrismaService,
    private readonly weezeventLinkService: EventWeezeventLinkService,
  ) {}

  private readonly includeRelations = {
    eventType: true,
    eventCategory: true,
    eventSubcategory: true,
    visitingTeam: true,
  };

  private async findOwnedEventTypeOrThrow(id: string, tenantId: string) {
    const eventType = await this.prisma.eventType.findFirst({
      where: { id, tenantId },
    });

    if (!eventType) {
      throw new NotFoundException(`Event type ${id} not found`);
    }

    return eventType;
  }

  private async findOwnedEventCategoryOrThrow(id: string, tenantId: string) {
    const eventCategory = await this.prisma.eventCategory.findFirst({
      where: { id, tenantId },
    });

    if (!eventCategory) {
      throw new NotFoundException(`Event category ${id} not found`);
    }

    return eventCategory;
  }

  private async findOwnedEventSubcategoryOrThrow(id: string, tenantId: string) {
    const eventSubcategory = await this.prisma.eventSubcategory.findFirst({
      where: { id, tenantId },
    });

    if (!eventSubcategory) {
      throw new NotFoundException(`Event subcategory ${id} not found`);
    }

    return eventSubcategory;
  }

  /**
   * Contrairement à findOwned*OrThrow (réservés à la modification/suppression
   * de la ligne de taxonomie elle-même, où un tenant ne doit jamais pouvoir
   * toucher une entrée globale), une RÉFÉRENCE depuis un Event peut légitimement
   * pointer vers une entrée globale (tenantId=null, socle partagé) — même règle
   * que createEventCategory/createEventSubcategory/assertAccessibleTeamScope.
   */
  private async findAccessibleEventTypeOrThrow(id: string, tenantId: string) {
    const eventType = await this.prisma.eventType.findFirst({
      where: { id, OR: [{ tenantId }, { tenantId: null }] },
    });
    if (!eventType) {
      throw new BadRequestException('eventTypeId must reference an accessible event type');
    }
    return eventType;
  }

  private async findAccessibleEventCategoryOrThrow(id: string, tenantId: string) {
    const eventCategory = await this.prisma.eventCategory.findFirst({
      where: { id, OR: [{ tenantId }, { tenantId: null }] },
    });
    if (!eventCategory) {
      throw new BadRequestException('eventCategoryId must reference an accessible event category');
    }
    return eventCategory;
  }

  private async findAccessibleEventSubcategoryOrThrow(id: string, tenantId: string) {
    const eventSubcategory = await this.prisma.eventSubcategory.findFirst({
      where: { id, OR: [{ tenantId }, { tenantId: null }] },
    });
    if (!eventSubcategory) {
      throw new BadRequestException('eventSubcategoryId must reference an accessible event subcategory');
    }
    return eventSubcategory;
  }

  private async findOwnedTeamOrThrow(id: string, tenantId: string) {
    const team = await this.prisma.team.findFirst({
      where: { id, tenantId },
    });

    if (!team) {
      throw new NotFoundException(`Team ${id} not found`);
    }

    return team;
  }

  /** Recherche insensible à la casse, scopée tenant + compétition — factorisé pour être
   *  partagé entre createTeam (échec si doublon) et resolveOrCreateTeamByName (réutilise). */
  private async findExistingTeam(
    tenantId: string,
    name: string,
    eventCategoryId?: string | null,
    eventSubcategoryId?: string | null,
  ) {
    return this.prisma.team.findFirst({
      where: {
        tenantId,
        name: { equals: name, mode: 'insensitive' },
        eventCategoryId: eventCategoryId ?? null,
        eventSubcategoryId: eventSubcategoryId ?? null,
      },
    });
  }

  /**
   * BUG-121 : verrou en mémoire par (tenant, compétition, nom normalisé), partagé par TOUTE
   * requête concurrente traitée par ce process — `EventsService` est un singleton Nest, une
   * seule instance sert tous les appels HTTP. Nécessaire car la contrainte DB `@@unique`
   * (BUG-70) ne protège PAS les équipes non scopées : Postgres traite NULL comme distinct de
   * NULL, donc deux équipes "Paris Basket Ball" avec eventCategoryId/eventSubcategoryId tous
   * deux NULL ne violent jamais la contrainte, même créées en parallèle. Constaté en réel : un
   * import CSV avec plusieurs lignes "Paris Basket Ball" (catégorie non mappée → scope NULL)
   * dans le même lot concurrent a créé deux équipes identiques à 1ms d'écart.
   */
  private static readonly teamResolutionInFlight = new Map<string, Promise<{ id: string; name: string }>>();

  /**
   * Résout une équipe par nom dans le catalogue Team (scopée compétition), la crée si elle
   * n'existe pas encore — contrairement à `createTeam` (action utilisateur explicite, échoue
   * en 409 sur doublon), celle-ci est silencieuse : utilisée quand le nom vient d'un champ
   * texte (import CSV, saisie manuelle) plutôt que d'un choix explicite dans le catalogue.
   */
  private async resolveOrCreateTeamByName(
    tenantId: string,
    name: string,
    eventCategoryId?: string | null,
    eventSubcategoryId?: string | null,
  ) {
    const trimmed = name.trim();
    const key = `${tenantId}␟${eventCategoryId ?? ''}␟${eventSubcategoryId ?? ''}␟${trimmed.toLowerCase()}`;

    const inflight = EventsService.teamResolutionInFlight.get(key);
    if (inflight) return inflight;

    const resolution = (async () => {
      try {
        const existing = await this.findExistingTeam(tenantId, trimmed, eventCategoryId, eventSubcategoryId);
        if (existing) return existing;
        try {
          return await this.prisma.team.create({
            data: {
              tenantId,
              name: trimmed,
              eventCategoryId: eventCategoryId ?? null,
              eventSubcategoryId: eventSubcategoryId ?? null,
            },
          });
        } catch (error) {
          // Filet de sécurité pour les créations concurrentes sur des process/instances
          // différents (le verrou ci-dessus ne couvre qu'un seul process) — inopérant pour un
          // scope NULL/NULL (BUG-70), mais bloque bien le cas scopé catégorie/sous-catégorie.
          if (error.code === 'P2002') {
            const raced = await this.findExistingTeam(tenantId, trimmed, eventCategoryId, eventSubcategoryId);
            if (raced) return raced;
          }
          throw error;
        }
      } finally {
        EventsService.teamResolutionInFlight.delete(key);
      }
    })();

    EventsService.teamResolutionInFlight.set(key, resolution);
    return resolution;
  }

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
        const team = await this.resolveOrCreateTeamByName(tenantId, trimmed, eventCategoryId, eventSubcategoryId);
        data.homeTeamName = team.name;
      }
    }

    if (dto.visitingTeamId !== undefined) {
      if (dto.visitingTeamId === null) {
        data.visitingTeamId = null;
        data.visitingTeamName = null;
      } else {
        const team = await this.findOwnedTeamOrThrow(dto.visitingTeamId, tenantId);
        data.visitingTeamId = team.id;
        data.visitingTeamName = team.name;
      }
    } else if (dto.visitingTeamName !== undefined) {
      const trimmed = (dto.visitingTeamName ?? '').trim();
      if (!trimmed) {
        data.visitingTeamName = null;
      } else {
        const team = await this.resolveOrCreateTeamByName(tenantId, trimmed, eventCategoryId, eventSubcategoryId);
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
    return data;
  }

  private async resolveEventTaxonomyFields(
    dto: CreateEventDto | UpdateEventDto,
    tenantId: string,
  ): Promise<Record<string, string | undefined>> {
    const data: Record<string, string | undefined> = {};
    if (dto.eventTypeId !== undefined) {
      await this.findAccessibleEventTypeOrThrow(dto.eventTypeId, tenantId);
      data.eventTypeId = dto.eventTypeId;
    }
    if (dto.eventCategoryId !== undefined) {
      await this.findAccessibleEventCategoryOrThrow(dto.eventCategoryId, tenantId);
      data.eventCategoryId = dto.eventCategoryId;
    }
    if (dto.eventSubcategoryId !== undefined) {
      await this.findAccessibleEventSubcategoryOrThrow(dto.eventSubcategoryId, tenantId);
      data.eventSubcategoryId = dto.eventSubcategoryId;
    }
    return data;
  }

  async create(tenantId: string, dto: CreateEventDto) {
    this.logger.log(`Creating event "${dto.name}" for tenant ${tenantId}`);
    let created;
    try {
      const eventDate = new Date(dto.eventDate);
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

  async findAll(tenantId: string, page = 1, limit = 50, spaceId?: string) {
    page = Math.max(1, page);
    limit = Math.min(200, Math.max(1, limit));
    const skip = (page - 1) * limit;
    const where = spaceId ? { tenantId, spaceId } : { tenantId };
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

  async findOne(id: string, tenantId: string) {
    const event = await this.prisma.event.findFirst({
      where: { id, tenantId },
      include: this.includeRelations,
    });
    if (!event) throw new NotFoundException(`Event ${id} not found`);
    return event;
  }

  async update(id: string, tenantId: string, dto: UpdateEventDto) {
    const existing = await this.findOne(id, tenantId);
    // BUG-021 : un changement de date invalide le lien auto/manuel existant (il a été
    // établi pour l'ancienne date) — repasse par relinkForTenantDate sur la nouvelle date
    // plutôt que de garder silencieusement une association qui ne correspond plus.
    const dateChanged =
      dto.eventDate !== undefined && new Date(dto.eventDate).getTime() !== existing.eventDate.getTime();

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
    return updated;
  }

  async remove(id: string, tenantId: string) {
    await this.findOne(id, tenantId);
    return this.prisma.event.delete({ where: { id } });
  }

  // ── BUG-021 : désambiguïsation manuelle Event <-> WeezeventEvent ──

  /**
   * Events non liés (`weezeventEventId` null) pour lesquels au moins un
   * WeezeventEvent existe le même jour calendaire — cas laissés de côté par
   * l'auto-link (EventWeezeventLinkService) faute d'appariement 1:1 univoque.
   * Retourne les candidats WeezeventEvent pour chaque event, à choisir manuellement.
   */
  async listAmbiguousWeezeventMatches(tenantId: string) {
    return this.prisma.$queryRaw<
      { eventId: string; eventName: string; eventDate: Date; candidates: unknown }[]
    >`
      SELECT
        e.id           AS "eventId",
        e.name         AS "eventName",
        e."eventDate"  AS "eventDate",
        (
          SELECT jsonb_agg(jsonb_build_object(
            'id',         we.id,
            'name',       we.name,
            'startDate',  we."startDate",
            'externalId', we."weezeventId"
          ) ORDER BY we."startDate")
          FROM "WeezeventEvent" we
          WHERE we."tenantId" = e."tenantId"
            AND we."startDate" IS NOT NULL
            AND DATE(we."startDate") = DATE(e."eventDate")
        ) AS candidates
      FROM "Event" e
      WHERE e."tenantId" = ${tenantId}
        AND e."weezeventEventId" IS NULL
        AND EXISTS (
          SELECT 1 FROM "WeezeventEvent" we
          WHERE we."tenantId" = e."tenantId"
            AND we."startDate" IS NOT NULL
            AND DATE(we."startDate") = DATE(e."eventDate")
        )
      ORDER BY e."eventDate" DESC
    `;
  }

  /**
   * Résolution manuelle d'un appariement Event <-> WeezeventEvent laissé ambigu.
   * `weezeventEventId: null` délie explicitement un event déjà lié.
   */
  async resolveWeezeventLink(id: string, tenantId: string, weezeventEventId: string | null) {
    await this.findOne(id, tenantId);

    if (weezeventEventId !== null) {
      const target = await this.prisma.salesEvent.findFirst({
        where: { id: weezeventEventId, tenantId },
        select: { id: true },
      });
      if (!target) {
        throw new BadRequestException(`WeezeventEvent ${weezeventEventId} not found for this tenant`);
      }
    }

    return this.prisma.event.update({
      where: { id },
      data: { weezeventEventId },
      include: this.includeRelations,
    });
  }

  // ── Event Types CRUD ──

  async getEventTypes(tenantId: string) {
    return this.prisma.eventType.findMany({
      where: { OR: [{ tenantId }, { tenantId: null }] },
      orderBy: { name: 'asc' },
      include: { categories: true },
    });
  }

  async createEventType(tenantId: string, data: { name: string }) {
    try {
      return await this.prisma.eventType.create({
        data: { name: data.name, tenantId },
      });
    } catch (error) {
      if (error.code === 'P2002') {
        throw new ConflictException(`Un type d'événement nommé « ${data.name} » existe déjà`);
      }
      throw error;
    }
  }

  async updateEventType(tenantId: string, id: string, data: { name?: string }) {
    await this.findOwnedEventTypeOrThrow(id, tenantId);
    try {
      return await this.prisma.eventType.update({ where: { id }, data: { name: data.name } });
    } catch (error) {
      if (error.code === 'P2002') {
        throw new ConflictException(`Un type d'événement nommé « ${data.name} » existe déjà`);
      }
      throw error;
    }
  }

  async deleteEventType(tenantId: string, id: string) {
    await this.findOwnedEventTypeOrThrow(id, tenantId);
    // BUG-75 : EventCategory.eventType est onDelete: Cascade — sans cette garde, supprimer un
    // EventType supprimait silencieusement en cascade toutes ses EventCategory (et par
    // transitivité leurs EventSubcategory), sans confirmation ni compte des entités affectées.
    const categoryCount = await this.prisma.eventCategory.count({ where: { eventTypeId: id } });
    if (categoryCount > 0) {
      throw new ConflictException(
        `Impossible de supprimer ce type : ${categoryCount} catégorie(s) en dépendent encore. Supprimez-les d'abord.`,
      );
    }
    return this.prisma.eventType.delete({ where: { id } });
  }

  // ── Event Categories CRUD ──

  async getEventCategories(tenantId: string) {
    return this.prisma.eventCategory.findMany({
      where: { OR: [{ tenantId }, { tenantId: null }] },
      orderBy: { name: 'asc' },
      include: { subcategories: true },
    });
  }

  async createEventCategory(tenantId: string, data: { name: string; eventTypeId: string; hasHomeTeam?: boolean }) {
    // BUG-77 : findOwnedEventTypeOrThrow (strict tenantId) rejetait les eventTypeId globaux
    // (tenantId=null), pourtant proposés par GET /event-types et acceptés par updateEventCategory
    // — même pattern "accessible" que Event.create()/update() pour cette même relation.
    await this.findAccessibleEventTypeOrThrow(data.eventTypeId, tenantId);
    try {
      return await this.prisma.eventCategory.create({
        data: { name: data.name, eventTypeId: data.eventTypeId, hasHomeTeam: data.hasHomeTeam ?? false, tenantId },
      });
    } catch (error) {
      if (error.code === 'P2002') {
        throw new ConflictException(`Une catégorie nommée « ${data.name} » existe déjà pour ce type`);
      }
      throw error;
    }
  }

  async updateEventCategory(tenantId: string, id: string, data: { name?: string; eventTypeId?: string; hasHomeTeam?: boolean }) {
    await this.findOwnedEventCategoryOrThrow(id, tenantId);

    if (data.eventTypeId !== undefined) {
      const eventType = await this.prisma.eventType.findFirst({
        where: {
          id: data.eventTypeId,
          OR: [{ tenantId }, { tenantId: null }],
        },
      });

      if (!eventType) {
        throw new BadRequestException({
          message: 'Validation failed',
          errors: [
            {
              property: 'eventTypeId',
              constraints: {
                exists: 'eventTypeId must reference an accessible event type',
              },
              messages: ['eventTypeId must reference an accessible event type'],
              value: data.eventTypeId,
            },
          ],
        });
      }
    }

    try {
      return await this.prisma.eventCategory.update({
        where: { id },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.eventTypeId !== undefined && {
            eventType: {
              connect: { id: data.eventTypeId },
            },
          }),
          ...(data.hasHomeTeam !== undefined && { hasHomeTeam: data.hasHomeTeam }),
        },
      });
    } catch (error) {
      if (error.code === 'P2002') {
        throw new ConflictException(`Une catégorie nommée « ${data.name} » existe déjà pour ce type`);
      }
      throw error;
    }
  }

  async deleteEventCategory(tenantId: string, id: string) {
    await this.findOwnedEventCategoryOrThrow(id, tenantId);
    // BUG-75 : même garde que deleteEventType, un niveau plus bas (EventSubcategory.eventCategory
    // est aussi onDelete: Cascade).
    const subcategoryCount = await this.prisma.eventSubcategory.count({ where: { eventCategoryId: id } });
    if (subcategoryCount > 0) {
      throw new ConflictException(
        `Impossible de supprimer cette catégorie : ${subcategoryCount} sous-catégorie(s) en dépendent encore. Supprimez-les d'abord.`,
      );
    }
    return this.prisma.eventCategory.delete({ where: { id } });
  }

  // ── Event Subcategories CRUD ──

  async getEventSubcategories(tenantId: string) {
    return this.prisma.eventSubcategory.findMany({
      where: { OR: [{ tenantId }, { tenantId: null }] },
      orderBy: { name: 'asc' },
    });
  }

  async createEventSubcategory(
    tenantId: string,
    data: { name: string; eventCategoryId?: string; categoryId?: string },
  ) {
    const eventCategoryId = data.eventCategoryId ?? data.categoryId;

    if (!eventCategoryId) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: [
          {
            property: 'eventCategoryId',
            constraints: {
              isNotEmpty: 'eventCategoryId should not be empty',
              isString: 'eventCategoryId must be a string',
            },
            messages: [
              'eventCategoryId should not be empty',
              'eventCategoryId must be a string',
            ],
            value: eventCategoryId,
          },
        ],
      });
    }

    const eventCategory = await this.prisma.eventCategory.findFirst({
      where: {
        id: eventCategoryId,
        OR: [{ tenantId }, { tenantId: null }],
      },
    });

    if (!eventCategory) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: [
          {
            property: 'eventCategoryId',
            constraints: {
              exists: 'eventCategoryId must reference an accessible event category',
            },
            messages: ['eventCategoryId must reference an accessible event category'],
            value: eventCategoryId,
          },
        ],
      });
    }

    try {
      return await this.prisma.eventSubcategory.create({
        data: { name: data.name, eventCategoryId, tenantId },
      });
    } catch (error) {
      if (error.code === 'P2002') {
        throw new ConflictException(`Une sous-catégorie nommée « ${data.name} » existe déjà pour cette catégorie`);
      }
      throw error;
    }
  }

  async updateEventSubcategory(
    tenantId: string,
    id: string,
    data: { name?: string; eventCategoryId?: string; categoryId?: string },
  ) {
    await this.findOwnedEventSubcategoryOrThrow(id, tenantId);

    const eventCategoryId = data.eventCategoryId ?? data.categoryId;

    if (eventCategoryId !== undefined) {
      const eventCategory = await this.prisma.eventCategory.findFirst({
        where: {
          id: eventCategoryId,
          OR: [{ tenantId }, { tenantId: null }],
        },
      });

      if (!eventCategory) {
        throw new BadRequestException({
          message: 'Validation failed',
          errors: [
            {
              property: 'eventCategoryId',
              constraints: {
                exists: 'eventCategoryId must reference an accessible event category',
              },
              messages: ['eventCategoryId must reference an accessible event category'],
              value: eventCategoryId,
            },
          ],
        });
      }
    }

    try {
      return await this.prisma.eventSubcategory.update({
        where: { id },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(eventCategoryId !== undefined && {
            eventCategory: {
              connect: { id: eventCategoryId },
            },
          }),
        },
      });
    } catch (error) {
      if (error.code === 'P2002') {
        throw new ConflictException(`Une sous-catégorie nommée « ${data.name} » existe déjà pour cette catégorie`);
      }
      throw error;
    }
  }

  async deleteEventSubcategory(tenantId: string, id: string) {
    await this.findOwnedEventSubcategoryOrThrow(id, tenantId);
    return this.prisma.eventSubcategory.delete({ where: { id } });
  }

  // ==================== TEAMS ====================

  /**
   * Valide le scoping compétition d'une team : category/subcategory doivent
   * être accessibles au tenant (possédées OU globales tenantId null, même
   * règle que createEventSubcategory) et cohérentes entre elles.
   */
  private async assertAccessibleTeamScope(
    tenantId: string,
    scope: { eventCategoryId?: string | null; eventSubcategoryId?: string | null },
  ) {
    if (scope.eventCategoryId) {
      const category = await this.prisma.eventCategory.findFirst({
        where: { id: scope.eventCategoryId, OR: [{ tenantId }, { tenantId: null }] },
      });
      if (!category) {
        throw new BadRequestException(
          'eventCategoryId must reference an accessible event category',
        );
      }
    }
    if (scope.eventSubcategoryId) {
      const subcategory = await this.prisma.eventSubcategory.findFirst({
        where: { id: scope.eventSubcategoryId, OR: [{ tenantId }, { tenantId: null }] },
      });
      if (!subcategory) {
        throw new BadRequestException(
          'eventSubcategoryId must reference an accessible event subcategory',
        );
      }
      if (scope.eventCategoryId && subcategory.eventCategoryId !== scope.eventCategoryId) {
        throw new BadRequestException(
          'eventSubcategoryId does not belong to the given eventCategoryId',
        );
      }
    }
  }

  async getTeams(tenantId: string, eventCategoryId?: string, eventSubcategoryId?: string) {
    const where: Record<string, unknown> = { tenantId };
    if (eventCategoryId || eventSubcategoryId) {
      // Équipes de la compétition demandée + équipes génériques (aucun scope)
      const scopes: Record<string, unknown>[] = [
        { eventCategoryId: null, eventSubcategoryId: null },
      ];
      if (eventSubcategoryId) {
        scopes.push({ eventSubcategoryId });
        if (eventCategoryId) {
          scopes.push({ eventCategoryId, eventSubcategoryId: null });
        }
      } else {
        scopes.push({ eventCategoryId });
      }
      where.OR = scopes;
    }
    return this.prisma.team.findMany({ where, orderBy: { name: 'asc' } });
  }

  async createTeam(tenantId: string, dto: CreateTeamDto) {
    await this.assertAccessibleTeamScope(tenantId, dto);

    const duplicate = await this.findExistingTeam(tenantId, dto.name, dto.eventCategoryId, dto.eventSubcategoryId);
    if (duplicate) {
      throw new ConflictException(`Team "${dto.name}" already exists for this competition`);
    }

    try {
      return await this.prisma.team.create({
        data: {
          tenantId,
          name: dto.name,
          eventCategoryId: dto.eventCategoryId ?? null,
          eventSubcategoryId: dto.eventSubcategoryId ?? null,
        },
      });
    } catch (error) {
      // BUG-70 : filet de sécurité pour la fenêtre de course du check ci-dessus (deux requêtes
      // concurrentes passant toutes les deux le findFirst avant que l'une des deux ne commit) —
      // sans ce catch, la contrainte @@unique ajoutée pour cette même fenêtre de course renvoyait
      // un 500 générique (message Prisma brut) au lieu du même 409 propre que le cas normal.
      if (error.code === 'P2002') {
        throw new ConflictException(`Team "${dto.name}" already exists for this competition`);
      }
      throw error;
    }
  }

  async updateTeam(tenantId: string, id: string, dto: UpdateTeamDto) {
    await this.findOwnedTeamOrThrow(id, tenantId);
    await this.assertAccessibleTeamScope(tenantId, dto);

    const updateData = {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.eventCategoryId !== undefined && { eventCategoryId: dto.eventCategoryId }),
      ...(dto.eventSubcategoryId !== undefined && { eventSubcategoryId: dto.eventSubcategoryId }),
    };

    // Renommage + repropagation du nom dénormalisé sur les events groupées dans
    // une transaction : sans ça, un échec entre les deux écritures laisserait
    // Event.visitingTeamName périmé indéfiniment (BUG-68).
    const [team] = await this.prisma.$transaction([
      this.prisma.team.update({ where: { id }, data: updateData }),
      ...(dto.name !== undefined
        ? [
            this.prisma.event.updateMany({
              where: { visitingTeamId: id },
              data: { visitingTeamName: dto.name },
            }),
          ]
        : []),
    ]);

    return team;
  }

  async deleteTeam(tenantId: string, id: string) {
    await this.findOwnedTeamOrThrow(id, tenantId);
    // FK Event.visitingTeamId = ON DELETE SET NULL ; visitingTeamName est
    // volontairement conservé comme repli d'affichage sur les events passés
    return this.prisma.team.delete({ where: { id } });
  }
}
