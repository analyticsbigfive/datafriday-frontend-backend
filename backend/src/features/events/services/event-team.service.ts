import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { CreateTeamDto } from '../dto/create-team.dto';
import { UpdateTeamDto } from '../dto/update-team.dto';

/**
 * Équipes des événements : lecture, création, modification, suppression et résolution par nom.
 */
@Injectable()
export class EventTeamService {
  constructor(
    private prisma: PrismaService,
  ) {}

  async findOwnedTeamOrThrow(id: string, tenantId: string) {
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
  async resolveOrCreateTeamByName(
    tenantId: string,
    name: string,
    eventCategoryId?: string | null,
    eventSubcategoryId?: string | null,
  ) {
    const trimmed = name.trim();
    const key = `${tenantId}␟${eventCategoryId ?? ''}␟${eventSubcategoryId ?? ''}␟${trimmed.toLowerCase()}`;

    const inflight = EventTeamService.teamResolutionInFlight.get(key);
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
        EventTeamService.teamResolutionInFlight.delete(key);
      }
    })();

    EventTeamService.teamResolutionInFlight.set(key, resolution);
    return resolution;
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
