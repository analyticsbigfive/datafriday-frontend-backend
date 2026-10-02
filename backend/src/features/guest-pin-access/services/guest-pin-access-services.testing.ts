import { GuestPinCountingService } from './guest-pin-counting.service';
import { GuestPinCredentialService } from './guest-pin-credential.service';
import { GuestPinPhaseService } from './guest-pin-phase.service';
import { GuestPinSessionService } from './guest-pin-session.service';
import { GuestPinWindowService } from './guest-pin-window.service';

/** Instancie les services du dossier pour les tests unitaires (dépendances externes fournies par le test). */
export function createGuestPinAccessServices(deps: { prisma?: any; inventoryCountService?: any; preEventFlow?: any; menuItemRecipeService?: any; marketPrices?: any; menuComponents?: any; spaceMenus?: any; storageTypes?: any; configService?: any; redis?: any; jwt?: any; audit?: any; inventoryLogisticPushService?: any; spaceAccess?: any; postEventDraft?: any }) {
  const guestPinCountingService = new GuestPinCountingService(deps.prisma, deps.inventoryCountService, deps.preEventFlow, deps.menuItemRecipeService, deps.marketPrices, deps.menuComponents, deps.spaceMenus, deps.storageTypes);
  const guestPinCredentialService = new GuestPinCredentialService(deps.prisma, deps.configService);
  const guestPinSessionService = new GuestPinSessionService(deps.prisma, deps.redis, deps.configService, deps.jwt, guestPinCredentialService);
  const guestPinWindowService = new GuestPinWindowService(deps.prisma, deps.audit, deps.inventoryLogisticPushService, deps.preEventFlow, deps.spaceAccess, guestPinCredentialService);
  const guestPinPhaseService = new GuestPinPhaseService(deps.prisma, deps.audit, deps.spaceAccess, deps.preEventFlow, deps.postEventDraft, deps.inventoryCountService, deps.inventoryLogisticPushService, guestPinWindowService);
  return { guestPinCountingService, guestPinCredentialService, guestPinSessionService, guestPinWindowService, guestPinPhaseService };
}
