import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { GuestPinUser } from '../../../core/auth/strategies/jwt-guest-pin.strategy';
import { PrismaService } from '../../../core/database/prisma.service';
import { isPosEventSellable } from '../../guest-pin-access/pos-period';
import { POS_ERROR_CODES, POS_PHASE } from '../pos.contracts';
import { posError } from './pos-sale-errors';

const EVENT_SELECT = {
  id: true,
  name: true,
  configurationId: true,
  eventDate: true,
  eventStartDate: true,
  eventEndDate: true,
  eventEndTime: true,
  sessions: true,
  space: { select: { timezone: true } },
} as const;

export interface PosSaleContext {
  event: { id: string; name: string; eventDate: Date; configurationId: string | null };
  elementName: string;
  settings: { promosEnabled: boolean; cancelEnabled: boolean; paymentMethodIds: string[]; lowStockUnits: number; tipsEnabled: boolean };
  /** Articles activés pour ce PdV dans la configuration de l'évènement (MenuAssignment élément x config). */
  assignedMenuItemIds: Set<string>;
  responsibleHrPersonId: string | null;
}

/** Réglages par défaut quand l'évènement n'a pas encore de ligne PosEventSetting (mêmes défauts que le schéma). */
export const POS_DEFAULT_SETTINGS = { promosEnabled: true, cancelEnabled: true, paymentMethodIds: [] as string[], lowStockUnits: 5, tipsEnabled: false };

/**
 * Périmètre d'une requête de caisse, tout vient du jeton invité : évènement vendable, PdV dans la
 * configuration, articles du PdV, réglages. `tenantId` toujours explicite (routes @Public, scoping CLS inactif).
 */
@Injectable()
export class PosSaleContextService {
  constructor(private readonly prisma: PrismaService) {}

  /** Refuse tout jeton qui n'est pas une session caisse (inventaire, ventilation). */
  assertPosGuest(guest: GuestPinUser): void {
    if (guest.phase !== POS_PHASE) {
      throw new ForbiddenException("Cette session n'ouvre pas la caisse.");
    }
  }

  /**
   * La caisse du PdV est toujours démarrée. La stratégie JWT le vérifie déjà à chaque requête ;
   * cette relecture ferme la fenêtre de course avec un ■ posé entre l'authentification et l'écriture.
   */
  async assertCashOpen(guest: GuestPinUser): Promise<void> {
    const open = await this.prisma.inventoryWindow.findFirst({
      where: { id: guest.windowId, tenantId: guest.tenantId, phase: POS_PHASE, status: 'open' },
      select: { id: true },
    });
    if (!open) throw posError(ForbiddenException, POS_ERROR_CODES.PDV_STOPPED, 'La caisse de ce point de vente est arrêtée.');
  }

  async load(guest: GuestPinUser): Promise<PosSaleContext> {
    this.assertPosGuest(guest);
    const event = await this.prisma.event.findFirst({
      where: { id: guest.eventId, tenantId: guest.tenantId, spaceId: guest.spaceId },
      select: EVENT_SELECT,
    });
    if (!event) throw new NotFoundException('Évènement introuvable');
    if (!isPosEventSellable(event, event.space?.timezone || 'Europe/Paris')) {
      throw posError(ForbiddenException, POS_ERROR_CODES.EVENT_NOT_SELLABLE, "Cet évènement est terminé : la caisse n'est plus disponible.");
    }
    if (!event.configurationId) {
      throw posError(BadRequestException, POS_ERROR_CODES.PDV_NOT_IN_EVENT_CONFIG, "Cet évènement n'a pas de configuration.");
    }

    const [element, setting, assignments, pdvSetting] = await Promise.all([
      this.prisma.spaceElement.findUnique({ where: { id: guest.elementId }, select: { name: true } }),
      this.prisma.posEventSetting.findFirst({
        where: { tenantId: guest.tenantId, eventId: event.id },
        select: { promosEnabled: true, cancelEnabled: true, paymentMethodIds: true, lowStockUnits: true, tipsEnabled: true },
      }),
      this.prisma.menuAssignment.findMany({
        where: {
          elementId: guest.elementId,
          configId: event.configurationId,
          enabled: true,
          menuItem: { tenantId: guest.tenantId, deletedAt: null },
        },
        select: { menuItemId: true },
      }),
      this.prisma.posPdvSetting.findFirst({
        where: { tenantId: guest.tenantId, eventId: event.id, elementId: guest.elementId },
        select: { responsibleHrPersonId: true },
      }),
    ]);
    if (!element) throw posError(BadRequestException, POS_ERROR_CODES.PDV_NOT_IN_EVENT_CONFIG, 'Point de vente introuvable.');

    return {
      event: { id: event.id, name: event.name, eventDate: event.eventDate, configurationId: event.configurationId },
      elementName: element.name,
      settings: setting ?? POS_DEFAULT_SETTINGS,
      assignedMenuItemIds: new Set(assignments.map((a) => a.menuItemId)),
      responsibleHrPersonId: pdvSetting?.responsibleHrPersonId ?? null,
    };
  }
}
