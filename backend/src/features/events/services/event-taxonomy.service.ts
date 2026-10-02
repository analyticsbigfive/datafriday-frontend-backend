import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';

/**
 * Typologie des événements : types, catégories et sous-catégories (lecture, création, modification, suppression).
 */
@Injectable()
export class EventTaxonomyService {
  constructor(
    private prisma: PrismaService,
  ) {}

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
  async findAccessibleEventTypeOrThrow(id: string, tenantId: string) {
    const eventType = await this.prisma.eventType.findFirst({
      where: { id, OR: [{ tenantId }, { tenantId: null }] },
    });
    if (!eventType) {
      throw new BadRequestException('eventTypeId must reference an accessible event type');
    }
    return eventType;
  }

  async findAccessibleEventCategoryOrThrow(id: string, tenantId: string) {
    const eventCategory = await this.prisma.eventCategory.findFirst({
      where: { id, OR: [{ tenantId }, { tenantId: null }] },
    });
    if (!eventCategory) {
      throw new BadRequestException('eventCategoryId must reference an accessible event category');
    }
    return eventCategory;
  }

  async findAccessibleEventSubcategoryOrThrow(id: string, tenantId: string) {
    const eventSubcategory = await this.prisma.eventSubcategory.findFirst({
      where: { id, OR: [{ tenantId }, { tenantId: null }] },
    });
    if (!eventSubcategory) {
      throw new BadRequestException('eventSubcategoryId must reference an accessible event subcategory');
    }
    return eventSubcategory;
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
}
