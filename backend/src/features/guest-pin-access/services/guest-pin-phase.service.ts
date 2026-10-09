import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { AuditService } from '../../../core/audit/audit.service';
import { SpaceAccessService } from '../../../core/auth/space-access.service';
import { PreEventInventoryFlowService } from '../../inventory/pre-event-inventory-flow.service';
import { PostEventDraftService } from '../../inventory/post-event-draft.service';
import { revokeWindowAccesses } from '../../inventory/inventory-window-closure';
import { preSaleStopKey } from '../pre-sale-stop';
import { WindowElementDto, WindowTargetDto } from '../dto/create-window.dto';
import { InventoryWindowPhase } from '../inventory-window-period';
import type { InventoryWindow } from '@prisma/client';
import type { CurrentUserData } from '../../../core/auth/decorators/current-user.decorator';
import { InventoryCountService } from '../../inventory/services/inventory-count.service';
import { InventoryLogisticPushService } from '../../inventory/services/inventory-logistic-push.service';
import { GuestPinWindowService } from './guest-pin-window.service';

/**
 * Démarrage et arrêt d'une phase d'inventaire (bandeau) ou d'un PDV (ligne), manuels ou
 * automatiques, et figement des comptages en fin de phase.
 */
@Injectable()
export class GuestPinPhaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly spaceAccess: SpaceAccessService,
    private readonly preEventFlow: PreEventInventoryFlowService,
    private readonly postEventDraft: PostEventDraftService,
    private readonly inventoryCountService: InventoryCountService,
    private readonly inventoryLogisticPushService: InventoryLogisticPushService,
    private readonly guestPinWindowService: GuestPinWindowService,
  ) {}

  private readonly logger = new Logger(GuestPinPhaseService.name);

  // ── Bandeau et lignes PDV : Démarrage / Reprise et Arrêt ──────────────────────
  //
  // Document Bertrand « Pre et Post event Inventory cycle » (2026-10-06, pages 3 à 6).
  // Démarrer une phase arrête l'autre, pour tout l'espace (bandeau) ou pour un PDV
  // (ligne). L'Arrêt coupe l'accès par PIN sans pousser vers la Logistique.

  /** ▶ du bandeau : ouvre l'accès par PIN à tous les PDV pour cette phase. */
  async startWindow(dto: WindowTargetDto, user: CurrentUserData) {
    await this.spaceAccess.assertCanAccessSpace(user, dto.spaceId);
    const tenantId = user.tenantId!;
    await this.guestPinWindowService.assertPeriodOpen(dto.spaceId, dto.eventId, tenantId, dto.phase);
    await this.startPhase(dto, tenantId, user.id);
    return this.guestPinWindowService.getStatusBoard(dto.spaceId, dto.eventId, user);
  }

  /**
   * Démarre une phase pour tous les PDV : arrête l'autre phase de l'espace (sans push),
   * ouvre la fenêtre, rouvre les PDV arrêtés un par un, garantit le PIN. Partagé par le
   * bandeau et par les démarrages automatiques (InventoryCycleCronService), sans contrôle
   * de droits ni de période : c'est à l'appelant de les faire. `keepOtherPhase` : le
   * post-event démarré aux portes laisse le pre-event continuer pour les PDV qui n'ont pas
   * encore vendu (Bertrand 2026-10-07).
   */
  async startPhase(
    target: WindowTargetDto,
    tenantId: string,
    actorId: string,
    opts: { keepOtherPhase?: boolean } = {},
  ): Promise<InventoryWindow> {
    if (!opts.keepOtherPhase) await this.stopOtherPhase(target.spaceId, tenantId, target.phase, actorId);
    const window = await this.guestPinWindowService.openWindowRecord(target, tenantId, actorId);
    // Reprise : les PDV arrêtés un par un sont rouverts avec les autres.
    await this.prisma.guestPinAccess.updateMany({
      where: { windowId: window.id, status: { not: 'active' } },
      data: { status: 'active', revokedAt: null, revokedBy: null },
    });
    await this.guestPinWindowService.ensurePin(window, actorId);
    return window;
  }

  /** Arrête une phase pour tous les PDV, PIN conservé, sans push Logistic (bandeau et
   *  arrêts automatiques). Ferme aussi les PDV rouverts un par un. */
  async stopPhaseWindow(
    window: InventoryWindow,
    actorId: string,
    reason: 'manual-stop' | 'delivery' | 'sale',
  ): Promise<void> {
    if (window.status === 'open') {
      await this.guestPinWindowService.closeWindowRecord(window, actorId, { pushToLogistic: false, reason });
    } else {
      await revokeWindowAccesses(this.prisma, [window.id], actorId);
    }
    await this.freezePhase(window, actorId);
  }

  /**
   * Fin d'une phase (D15, document Bertrand 2026-10-06) : les derniers articles comptés
   * partent vers Logistic sans attendre le tick, et le snapshot de la phase est figé.
   * Pre : feuille régénérée (snapshot + Logistic, PreEventInventoryFlowService). Post :
   * Logistic puis snapshot post-event. Jamais bloquant : l'arrêt a déjà eu lieu.
   */
  private async freezePhase(window: InventoryWindow, actorId: string): Promise<void> {
    try {
      if (window.phase === 'pre-event') {
        await this.preEventFlow.regenerate(window.spaceId, window.eventId, window.tenantId, actorId, 'phase-stop');
      } else {
        await this.inventoryLogisticPushService.pushPendingCountToLogistic(
          window.spaceId,
          window.eventId,
          window.tenantId,
          'post-event',
          actorId,
        );
        await this.inventoryCountService.freezePostEventSnapshot(
          window.spaceId,
          window.eventId,
          window.tenantId,
          actorId.startsWith('system-') ? undefined : actorId,
        );
        // Réconciliation post-event à jour à l'arrêt : c'est le document final (D2).
        await this.postEventDraft.rebuild(window.spaceId, window.eventId, window.tenantId);
      }
    } catch (error) {
      this.logger.warn(`Fin de phase ${window.phase} (fenêtre ${window.id}) : figement en échec : ${(error as Error)?.message}`);
    }
  }

  /** ■ du bandeau : coupe l'accès par PIN de tous les PDV, PIN conservé. */
  async stopWindow(dto: WindowTargetDto, user: CurrentUserData) {
    await this.spaceAccess.assertCanAccessSpace(user, dto.spaceId);
    const tenantId = user.tenantId!;
    const window = await this.guestPinWindowService.findWindow(dto.spaceId, dto.eventId, tenantId, dto.phase);
    if (window) await this.stopPhaseWindow(window, user.id, 'manual-stop');
    return this.guestPinWindowService.getStatusBoard(dto.spaceId, dto.eventId, user);
  }

  /** ▶ d'une ligne PDV : ouvre l'accès par PIN à ce seul PDV, même fenêtre arrêtée. */
  async startElement(dto: WindowElementDto, user: CurrentUserData) {
    await this.spaceAccess.assertCanAccessSpace(user, dto.spaceId);
    const tenantId = user.tenantId!;
    await this.guestPinWindowService.assertPeriodOpen(dto.spaceId, dto.eventId, tenantId, dto.phase);

    let window = await this.guestPinWindowService.findWindow(dto.spaceId, dto.eventId, tenantId, dto.phase);
    if (!window) {
      // Aucune fenêtre encore : créée ARRÊTÉE, seul ce PDV sera ouvert.
      window = await this.prisma.inventoryWindow.create({
        data: {
          tenantId,
          spaceId: dto.spaceId,
          eventId: dto.eventId,
          phase: dto.phase,
          status: 'closed',
          openedBy: user.id,
          closedAt: new Date(),
          closedBy: user.id,
        },
      });
    }
    await this.guestPinWindowService.ensurePin(window, user.id);

    // Exclusivité par PDV : l'autre phase est arrêtée pour ce PDV.
    const otherPhase = dto.phase === 'pre-event' ? 'post-event' : 'pre-event';
    const others = await this.prisma.inventoryWindow.findMany({
      where: { tenantId, spaceId: dto.spaceId, phase: otherPhase },
      select: { id: true },
    });
    await Promise.all(
      others.map((other) => this.setElementAccess(other.id, tenantId, dto.spaceId, dto.elementId, 'revoked', user.id)),
    );
    await this.setElementAccess(window.id, tenantId, dto.spaceId, dto.elementId, 'active', user.id);
    if (dto.phase === 'pre-event') await this.markPreReopenedByHand(window, dto.elementId);
    await this.audit.log({
      tenantId,
      userId: user.id,
      action: 'UPDATE',
      entity: 'InventoryWindow',
      entityId: window.id,
      metadata: { action: 'start-element', elementId: dto.elementId },
    });
    return this.guestPinWindowService.getStatusBoard(dto.spaceId, dto.eventId, user);
  }

  /** ■ d'une ligne PDV : coupe l'accès par PIN de ce seul PDV. */
  async stopElement(dto: WindowElementDto, user: CurrentUserData) {
    await this.spaceAccess.assertCanAccessSpace(user, dto.spaceId);
    const tenantId = user.tenantId!;
    const window = await this.guestPinWindowService.findWindow(dto.spaceId, dto.eventId, tenantId, dto.phase);
    if (window) {
      if (dto.phase === 'pre-event') await this.stopPreElement(window, dto.elementId, user.id);
      else await this.setElementAccess(window.id, tenantId, dto.spaceId, dto.elementId, 'revoked', user.id);
      await this.audit.log({
        tenantId,
        userId: user.id,
        action: 'UPDATE',
        entity: 'InventoryWindow',
        entityId: window.id,
        metadata: { action: 'stop-element', elementId: dto.elementId },
      });
    }
    return this.guestPinWindowService.getStatusBoard(dto.spaceId, dto.eventId, user);
  }

  /**
   * Arrête le pre-event d'un seul PDV (■ du directeur, ou première vente). Si le post-event
   * du même match est ouvert (portes passées), le PDV y retrouve son accès : la réouverture
   * en pre-event le lui avait retiré (exclusivité par PDV, startElement).
   */
  async stopPreElement(window: InventoryWindow, elementId: string, actorId: string): Promise<void> {
    await this.setElementAccess(window.id, window.tenantId, window.spaceId, elementId, 'revoked', actorId);
    const post = await this.guestPinWindowService.findWindow(window.spaceId, window.eventId, window.tenantId, 'post-event');
    if (post?.status === 'open') {
      await this.setElementAccess(post.id, window.tenantId, window.spaceId, elementId, 'active', actorId);
    }
  }

  /** PDV rouvert à la main en pre-event : plus jamais coupé par ses ventes (pre-sale-stop.ts). */
  private async markPreReopenedByHand(window: InventoryWindow, elementId: string): Promise<void> {
    const key = preSaleStopKey(window.id, elementId);
    const value = { reopenedByHand: true, at: new Date().toISOString() };
    await this.prisma.kvStore.upsert({
      where: { uniq_kv_store: { tenantId: window.tenantId, key } },
      create: { tenantId: window.tenantId, key, value },
      update: { value },
    });
  }

  /** Arrête toute fenêtre de l'autre phase encore ouverte sur l'espace, sans push. */
  private async stopOtherPhase(spaceId: string, tenantId: string, phase: InventoryWindowPhase, actorId: string) {
    const otherPhase = phase === 'pre-event' ? 'post-event' : 'pre-event';
    const open = await this.prisma.inventoryWindow.findMany({
      where: { tenantId, spaceId, phase: otherPhase, status: 'open' },
    });
    // Au plus une fenêtre ouverte par espace et par phase (index partiel) : clôture puis figement, dans l'ordre.
    for (const w of open) {
      // eslint-disable-next-line no-await-in-loop -- voir ci-dessus
      await this.guestPinWindowService.closeWindowRecord(w, actorId, { pushToLogistic: false, reason: 'phase-switch' });
      // eslint-disable-next-line no-await-in-loop -- voir ci-dessus
      await this.freezePhase(w, actorId);
    }
  }

  /** Ligne d'accès d'un PDV sur une fenêtre, créée au besoin. */
  private async setElementAccess(
    windowId: string,
    tenantId: string,
    spaceId: string,
    elementId: string,
    status: 'active' | 'revoked',
    actorId: string,
  ) {
    const revoked = status === 'revoked';
    await this.prisma.guestPinAccess.upsert({
      where: { uniq_guest_pin_access_per_element: { windowId, elementId } },
      create: {
        tenantId,
        windowId,
        spaceId,
        elementId,
        status,
        createdBy: actorId,
        revokedAt: revoked ? new Date() : null,
        revokedBy: revoked ? actorId : null,
      },
      update: {
        status,
        revokedAt: revoked ? new Date() : null,
        revokedBy: revoked ? actorId : null,
      },
    });
  }
}
