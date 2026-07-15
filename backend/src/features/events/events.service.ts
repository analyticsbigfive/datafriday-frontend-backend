import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { CreateTeamDto } from './dto/create-team.dto';
import { UpdateTeamDto } from './dto/update-team.dto';

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(private prisma: PrismaService) {}

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

  private async findOwnedTeamOrThrow(id: string, tenantId: string) {
    const team = await this.prisma.team.findFirst({
      where: { id, tenantId },
    });

    if (!team) {
      throw new NotFoundException(`Team ${id} not found`);
    }

    return team;
  }

  /**
   * Champs équipe d'un event : valide que visitingTeamId appartient au tenant
   * (sinon référence cross-tenant possible) et dérive visitingTeamName côté
   * serveur dès que la FK est posée — le nom client n'est pris qu'en repli
   * sans FK. `visitingTeamId: null` désassigne (id + nom dénormalisé).
   */
  private async resolveEventTeamFields(
    dto: CreateEventDto | UpdateEventDto,
    tenantId: string,
  ): Promise<Record<string, string | null>> {
    const data: Record<string, string | null> = {};
    if (dto.homeTeamName !== undefined) {
      data.homeTeamName = dto.homeTeamName;
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
      data.visitingTeamName = dto.visitingTeamName;
    }
    return data;
  }

  async create(tenantId: string, dto: CreateEventDto) {
    this.logger.log(`Creating event "${dto.name}" for tenant ${tenantId}`);
    return this.prisma.event.create({
      data: {
        tenantId,
        name: dto.name,
        eventDate: new Date(dto.eventDate),
        spaceId: dto.spaceId,
        configurationId: dto.configurationId,
        eventTypeId: dto.eventTypeId,
        eventCategoryId: dto.eventCategoryId,
        eventSubcategoryId: dto.eventSubcategoryId,
        location: dto.location,
        spaceName: dto.spaceName,
        sessions: dto.sessions ? JSON.stringify(dto.sessions) : null,
        numberOfSessions: dto.numberOfSessions,
        hasOpeningAct: dto.hasOpeningAct,
        hasIntermission: dto.hasIntermission,
        status: dto.status || 'draft',
        ...(dto.eventStartDate !== undefined && { eventStartDate: new Date(dto.eventStartDate) }),
        ...(dto.eventEndDate !== undefined && { eventEndDate: new Date(dto.eventEndDate) }),
        ...(dto.eventEndTime !== undefined && { eventEndTime: dto.eventEndTime }),
        ...(dto.ticketsSold !== undefined && { ticketsSold: dto.ticketsSold }),
        ...(dto.ticketsScanned !== undefined && { ticketsScanned: dto.ticketsScanned }),
        ...(await this.resolveEventTeamFields(dto, tenantId)),
      },
      include: this.includeRelations,
    });
  }

  async findAll(tenantId: string, page = 1, limit = 50, spaceId?: string) {
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
    await this.findOne(id, tenantId);
    return this.prisma.event.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.eventDate !== undefined && { eventDate: new Date(dto.eventDate) }),
        ...(dto.spaceId !== undefined && { spaceId: dto.spaceId }),
        ...(dto.configurationId !== undefined && { configurationId: dto.configurationId }),
        ...(dto.eventTypeId !== undefined && { eventTypeId: dto.eventTypeId }),
        ...(dto.eventCategoryId !== undefined && { eventCategoryId: dto.eventCategoryId }),
        ...(dto.eventSubcategoryId !== undefined && { eventSubcategoryId: dto.eventSubcategoryId }),
        ...(dto.location !== undefined && { location: dto.location }),
        ...(dto.spaceName !== undefined && { spaceName: dto.spaceName }),
        ...(dto.sessions !== undefined && { sessions: dto.sessions ? JSON.stringify(dto.sessions) : null }),
        ...(dto.numberOfSessions !== undefined && { numberOfSessions: dto.numberOfSessions }),
        ...(dto.hasOpeningAct !== undefined && { hasOpeningAct: dto.hasOpeningAct }),
        ...(dto.hasIntermission !== undefined && { hasIntermission: dto.hasIntermission }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.eventStartDate !== undefined && { eventStartDate: new Date(dto.eventStartDate) }),
        ...(dto.eventEndDate !== undefined && { eventEndDate: new Date(dto.eventEndDate) }),
        ...(dto.eventEndTime !== undefined && { eventEndTime: dto.eventEndTime }),
        ...(dto.ticketsSold !== undefined && { ticketsSold: dto.ticketsSold }),
        ...(dto.ticketsScanned !== undefined && { ticketsScanned: dto.ticketsScanned }),
        ...(await this.resolveEventTeamFields(dto, tenantId)),
      },
      include: this.includeRelations,
    });
  }

  async remove(id: string, tenantId: string) {
    await this.findOne(id, tenantId);
    return this.prisma.event.delete({ where: { id } });
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
    return this.prisma.eventType.create({
      data: { name: data.name, tenantId },
    });
  }

  async updateEventType(tenantId: string, id: string, data: { name?: string }) {
    await this.findOwnedEventTypeOrThrow(id, tenantId);
    return this.prisma.eventType.update({ where: { id }, data: { name: data.name } });
  }

  async deleteEventType(tenantId: string, id: string) {
    await this.findOwnedEventTypeOrThrow(id, tenantId);
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
    return this.prisma.eventCategory.create({
      data: { name: data.name, eventTypeId: data.eventTypeId, hasHomeTeam: data.hasHomeTeam ?? false, tenantId },
    });
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

    return this.prisma.eventCategory.update({
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
  }

  async deleteEventCategory(tenantId: string, id: string) {
    await this.findOwnedEventCategoryOrThrow(id, tenantId);
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

    return this.prisma.eventSubcategory.create({
      data: { name: data.name, eventCategoryId, tenantId },
    });
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

    return this.prisma.eventSubcategory.update({
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

    const duplicate = await this.prisma.team.findFirst({
      where: {
        tenantId,
        name: { equals: dto.name, mode: 'insensitive' },
        eventCategoryId: dto.eventCategoryId ?? null,
        eventSubcategoryId: dto.eventSubcategoryId ?? null,
      },
    });
    if (duplicate) {
      throw new ConflictException(`Team "${dto.name}" already exists for this competition`);
    }

    return this.prisma.team.create({
      data: {
        tenantId,
        name: dto.name,
        eventCategoryId: dto.eventCategoryId ?? null,
        eventSubcategoryId: dto.eventSubcategoryId ?? null,
      },
    });
  }

  async updateTeam(tenantId: string, id: string, dto: UpdateTeamDto) {
    await this.findOwnedTeamOrThrow(id, tenantId);
    await this.assertAccessibleTeamScope(tenantId, dto);

    const team = await this.prisma.team.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.eventCategoryId !== undefined && { eventCategoryId: dto.eventCategoryId }),
        ...(dto.eventSubcategoryId !== undefined && { eventSubcategoryId: dto.eventSubcategoryId }),
      },
    });

    // Garde le nom dénormalisé des events en phase avec le renommage
    if (dto.name !== undefined) {
      await this.prisma.event.updateMany({
        where: { visitingTeamId: id },
        data: { visitingTeamName: team.name },
      });
    }

    return team;
  }

  async deleteTeam(tenantId: string, id: string) {
    await this.findOwnedTeamOrThrow(id, tenantId);
    // FK Event.visitingTeamId = ON DELETE SET NULL ; visitingTeamName est
    // volontairement conservé comme repli d'affichage sur les events passés
    return this.prisma.team.delete({ where: { id } });
  }
}
