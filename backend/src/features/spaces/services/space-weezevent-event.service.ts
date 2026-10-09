import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { WeezeventClientService } from '../../weezevent/services/weezevent-client.service';
import { UpdateWeezeventEventMetadataDto } from '../dto/update-weezevent-event-metadata.dto';
import { SpaceCrudService } from './space-crud.service';

/**
 * Events Weezevent d'un espace : liste, intégrations, métadonnées, participants.
 */
@Injectable()
export class SpaceWeezeventEventService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly weezeventClient: WeezeventClientService,
    private readonly spaceCrudService: SpaceCrudService,
  ) {}

  /**
   * List all WeezeventEvents linked to a space (via integration scoped to tenant).
   * Returns event data with enrichment metadata (doorsOpening, showTime, category, etc.).
   */
  async getWeezeventEventsForSpace(spaceId: string, tenantId: string, integrationId?: string) {
    // Verify space belongs to tenant
    await this.spaceCrudService.findOne(spaceId, tenantId);

    let resolvedIntegrationId: string | undefined;

    if (integrationId) {
      // BUG-319-02 : integrationId fourni explicitement (wizard étape 4, StepProcessTimeline.vue)
      // — on vérifie que CETTE intégration est bien mappée à CET espace au lieu de piocher
      // arbitrairement le premier mapping de l'espace (findFirst sans orderBy ci-dessous), qui
      // pouvait renvoyer une AUTRE intégration quand l'espace en a plusieurs de mappées. Step 1
      // du wizard stocke integration.id directement dans salesLocationId
      // (createLocationSpaceMapping, mappings.service.ts) — comparaison directe.
      const link = await this.prisma.locationSpaceMapping.findFirst({
        where: { tenantId, spaceId, salesLocationId: integrationId },
      });
      if (!link) {
        return [];
      }
      resolvedIntegrationId = integrationId;
    } else {
      // Fallback legacy sans integrationId — comportement historique, correct seulement si
      // l'espace n'a qu'une seule intégration mappée (voir BUG-319-02 pour le cas à plusieurs).
      const locationMapping = await this.prisma.locationSpaceMapping.findFirst({
        where: { tenantId, spaceId },
        select: { salesLocationId: true },
      });

      if (!locationMapping) {
        return [];
      }

      const location = await this.prisma.salesLocation.findFirst({
        where: { id: locationMapping.salesLocationId, tenantId },
        select: { integrationId: true },
      });

      if (!location) {
        return [];
      }

      resolvedIntegrationId = location.integrationId;
    }

    const events = await this.prisma.salesEvent.findMany({
      where: { tenantId, integrationId: resolvedIntegrationId },
      select: {
        id: true,
        externalId: true,
        name: true,
        startDate: true,
        endDate: true,
        status: true,
        configurationId: true,
        metadata: true,
      },
      orderBy: { startDate: 'asc' },
    });

    return events.map((e) => ({
      id: e.id,
      weezeventId: e.externalId,
      name: e.name,
      startDate: e.startDate,
      endDate: e.endDate,
      status: e.status,
      configurationId: e.configurationId ?? null,
      doorsOpening:    (e.metadata as any)?.doorsOpening    ?? null,
      showTime:        (e.metadata as any)?.showTime        ?? null,
      category:        (e.metadata as any)?.category        ?? null,
      eventType:       (e.metadata as any)?.eventType       ?? null,
      team:            (e.metadata as any)?.team            ?? null,
      visitingTeam:    (e.metadata as any)?.visitingTeam    ?? null,
      hasIntermission: (e.metadata as any)?.hasIntermission ?? false,
      performer:       (e.metadata as any)?.performer       ?? null,
      openingAct:      (e.metadata as any)?.openingAct      ?? null,
      sponsor:         (e.metadata as any)?.sponsor         ?? null,
    }));
  }

  /**
   * BUG-369-02 (2026-08-25) : liste des intégrations rattachées à un espace — remplace le
   * dérivé côté front (`spaceIntegrations`, à partir des events déjà chargés, retiré le même
   * jour) qui ne révélait une intégration qu'une fois qu'un event lui était déjà tagué. Même
   * pattern que `getWeezeventEventsForSpace` : `locationSpaceMapping` peut avoir PLUSIEURS
   * lignes pour un même espace (BUG-136-01), pas de relation Prisma directe vers `Integration`
   * (`salesLocationId` est un `String` simple) — résolution en 2 requêtes.
   */
  async getSpaceIntegrations(spaceId: string, tenantId: string) {
    await this.spaceCrudService.findOne(spaceId, tenantId);

    const mappings = await this.prisma.locationSpaceMapping.findMany({
      where: { tenantId, spaceId },
      select: { salesLocationId: true },
    });
    const integrationIds = [...new Set(mappings.map((m) => m.salesLocationId).filter(Boolean))];
    if (!integrationIds.length) return [];

    const integrations = await this.prisma.integration.findMany({
      where: { id: { in: integrationIds }, tenantId },
      select: { id: true, name: true, provider: true },
      orderBy: { name: 'asc' },
    });
    return integrations;
  }

  /**
   * Update enrichment metadata for a single WeezeventEvent.
   * Only fields explicitly provided in the payload are updated (shallow merge).
   */
  async updateWeezeventEventMetadata(
    spaceId: string,
    eventId: string,
    payload: UpdateWeezeventEventMetadataDto,
    tenantId: string,
  ) {
    // Verify space belongs to tenant
    await this.spaceCrudService.findOne(spaceId, tenantId);

    const event = await this.prisma.salesEvent.findFirst({
      where: { id: eventId, tenantId },
      select: { id: true, metadata: true },
    });

    if (!event) {
      throw new NotFoundException(`WeezeventEvent ${eventId} not found`);
    }

    const existingMeta = (event.metadata as Record<string, unknown>) ?? {};
    const updatedMeta = { ...existingMeta, ...payload };

    const updated = await this.prisma.salesEvent.update({
      where: { id: eventId },
      data: { metadata: updatedMeta },
      select: {
        id: true,
        externalId: true,
        name: true,
        startDate: true,
        configurationId: true,
        metadata: true,
      },
    });

    return {
      id: updated.id,
      weezeventId: updated.externalId,
      name: updated.name,
      startDate: updated.startDate,
      configurationId: updated.configurationId ?? null,
      doorsOpening:    (updated.metadata as any)?.doorsOpening    ?? null,
      showTime:        (updated.metadata as any)?.showTime        ?? null,
      category:        (updated.metadata as any)?.category        ?? null,
      eventType:       (updated.metadata as any)?.eventType       ?? null,
      team:            (updated.metadata as any)?.team            ?? null,
      visitingTeam:    (updated.metadata as any)?.visitingTeam    ?? null,
      hasIntermission: (updated.metadata as any)?.hasIntermission ?? false,
      performer:       (updated.metadata as any)?.performer       ?? null,
      openingAct:      (updated.metadata as any)?.openingAct      ?? null,
      sponsor:         (updated.metadata as any)?.sponsor         ?? null,
    };
  }

  /**
   * Sync attendees for a single WeezeventEvent from the WeezPay API.
   * Paginates through GET /organizations/{org}/events/{eventId}/attendees,
   * upserts each record into WeezeventAttendee, and returns the total count.
   * ticketsScanned in getShopDetails() is computed from WeezeventAttendee rows
   * so it will reflect the updated count automatically.
   */
  async syncEventAttendees(
    spaceId: string,
    eventId: string,
    tenantId: string,
  ): Promise<{ synced: number }> {
    await this.spaceCrudService.findOne(spaceId, tenantId);

    const event = await this.prisma.salesEvent.findFirst({
      where: { id: eventId, tenantId },
      select: { id: true, externalId: true, integrationId: true },
    });
    if (!event) {
      throw new NotFoundException(`WeezeventEvent ${eventId} not found`);
    }

    const integration = await this.prisma.integration.findFirst({
      where: { id: event.integrationId, tenantId },
      select: { id: true, weezevent: { select: { organizationId: true } } },
    });
    if (!integration?.weezevent?.organizationId) {
      throw new NotFoundException('WeezeventIntegration organization ID not configured');
    }

    let page = 1;
    let hasMore = true;
    let synced = 0;

    while (hasMore) {
      const response = await this.weezeventClient.getAttendees(
        tenantId,
        event.integrationId,
        integration.weezevent.organizationId,
        event.externalId,
        { page, perPage: 100 },
      );

      for (const a of response.data) {
        const weezeventId = String(a.id ?? a.attendee_id ?? `${page}_${synced}`);
        await this.prisma.weezeventAttendee.upsert({
          where: {
            tenantId_integrationId_weezeventId: {
              tenantId,
              integrationId: event.integrationId,
              weezeventId,
            },
          },
          create: {
            weezeventId,
            tenantId,
            integrationId: event.integrationId,
            eventId: event.id,
            eventName: a.event_name ?? null,
            email:     a.email      ?? null,
            firstName: a.first_name ?? null,
            lastName:  a.last_name  ?? null,
            ticketType: typeof a.ticket_type === 'string' ? a.ticket_type : (a.ticket_type?.name ?? null),
            status:    a.status ?? 'registered',
            rawData:   a,
          },
          update: {
            status:    a.status ?? 'registered',
            email:     a.email      ?? null,
            firstName: a.first_name ?? null,
            lastName:  a.last_name  ?? null,
            ticketType: typeof a.ticket_type === 'string' ? a.ticket_type : (a.ticket_type?.name ?? null),
            rawData:   a,
            syncedAt:  new Date(),
          },
        });
        synced++;
      }

      hasMore = page < response.meta.total_pages;
      page++;
    }

    return { synced };
  }
}
