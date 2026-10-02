import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { AuditService } from '../../../core/audit/audit.service';
import { SpaceAccessService } from '../../../core/auth/space-access.service';
import { PreEventInventoryFlowService } from '../../inventory/pre-event-inventory-flow.service';
import { closeInventoryWindows } from '../../inventory/inventory-window-closure';
import { decryptPin, encryptPin } from '../guest-pin-crypto';
import { PRE_SALE_STOP_ACTOR } from '../pre-sale-stop';
import { CreateWindowDto, WindowTargetDto } from '../dto/create-window.dto';
import {
  INVENTORY_PHASES,
  InventoryWindowPhase,
  inventoryWindowPeriod,
  inventoryWindowPeriodState,
  periodRefusalMessage,
} from '../inventory-window-period';
import type { InventoryWindow } from '@prisma/client';
import type { CurrentUserData } from '../../../core/auth/decorators/current-user.decorator';
import { InventoryLogisticPushService } from '../../inventory/services/inventory-logistic-push.service';
import { GuestPinCredentialService } from './guest-pin-credential.service';

const PIN_GENERATION_MAX_RETRIES = 5;

/**
 * Fenêtres d'inventaire côté administration : périodes, ouverture, PIN, tableau de suivi, décisions sur les accès, clôture.
 */
@Injectable()
export class GuestPinWindowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly inventoryLogisticPushService: InventoryLogisticPushService,
    private readonly preEventFlow: PreEventInventoryFlowService,
    private readonly spaceAccess: SpaceAccessService,
    private readonly guestPinCredentialService: GuestPinCredentialService,
  ) {}

  private readonly logger = new Logger(GuestPinWindowService.name);

  // ── Directeur : gestion des fenêtres et des PIN ─────────────────────────────

  /**
   * Période de la fenêtre `phase` de cet event (cf. inventory-window-period.ts) et son
   * état à `now`. Lève 404 si l'event n'appartient pas à cet espace/tenant.
   */
  private async resolvePeriod(
    spaceId: string,
    eventId: string,
    tenantId: string,
    phase: InventoryWindowPhase,
    now: Date = new Date(),
  ) {
    const event = await this.preEventFlow.findEvent(spaceId, eventId, tenantId);
    if (!event) throw new NotFoundException('Événement introuvable pour cet espace');
    const period = inventoryWindowPeriod(event, phase, event.timezone);
    return { period, state: inventoryWindowPeriodState(period, now), timezone: event.timezone };
  }

  /** Périodes pre/post-event d'un event, pour que l'écran directeur affiche quand le
   *  PIN est générable (et désactive le bouton hors période) sans recalculer. */
  async getPeriods(spaceId: string, eventId: string, user: CurrentUserData) {
    await this.spaceAccess.assertCanAccessSpace(user, spaceId);
    const tenantId = user.tenantId!;
    const [pre, post] = await Promise.all([
      this.resolvePeriod(spaceId, eventId, tenantId, 'pre-event'),
      this.resolvePeriod(spaceId, eventId, tenantId, 'post-event'),
    ]);
    const view = (p: typeof pre, phase: InventoryWindowPhase) => ({
      opensAt: p.period.opensAt,
      closesAt: p.period.closesAt,
      state: p.state,
      message: p.state === 'open' ? null : periodRefusalMessage(phase, p.state, p.period, p.timezone),
    });
    return { 'pre-event': view(pre, 'pre-event'), 'post-event': view(post, 'post-event') };
  }

  async assertPeriodOpen(
    spaceId: string,
    eventId: string,
    tenantId: string,
    phase: InventoryWindowPhase,
  ): Promise<void> {
    const { period, state, timezone } = await this.resolvePeriod(spaceId, eventId, tenantId, phase);
    if (state !== 'open') {
      throw new BadRequestException(periodRefusalMessage(phase, state, period, timezone));
    }
  }

  async createOrReopenWindow(dto: CreateWindowDto, user: CurrentUserData) {
    await this.spaceAccess.assertCanAccessSpace(user, dto.spaceId);
    await this.assertPeriodOpen(dto.spaceId, dto.eventId, user.tenantId!, dto.phase);
    return this.openWindowRecord(dto, user.tenantId!, user.id);
  }

  /** Ouvre (ou rouvre) la fenêtre de cette phase pour cet event. */
  async openWindowRecord(dto: CreateWindowDto, tenantId: string, actorUserId: string) {

    // Une seule fenêtre ouverte par espace et par phase (index partiel
    // InventoryWindow_one_open_per_space_phase) : une fenêtre d'un AUTRE match restée
    // ouverte (cron arrêté, fenêtre antérieure à la clôture automatique) bloquait
    // silencieusement l'ouverture du match suivant (incident Jean Bouin 26/09). Elle
    // est hors période par construction : clôturée sans push Logistic, un vieux
    // comptage ne doit pas recaler le registre d'aujourd'hui.
    const stale = await this.prisma.inventoryWindow.findMany({
      where: {
        tenantId,
        spaceId: dto.spaceId,
        phase: dto.phase,
        status: 'open',
        eventId: { not: dto.eventId },
      },
    });
    for (const w of stale) {
      await this.closeWindowRecord(w, actorUserId, { pushToLogistic: false, reason: 'superseded' });
    }

    const window = await this.prisma.inventoryWindow.upsert({
      where: {
        uniq_inventory_window: {
          tenantId,
          spaceId: dto.spaceId,
          eventId: dto.eventId,
          phase: dto.phase,
        },
      },
      create: {
        tenantId,
        spaceId: dto.spaceId,
        eventId: dto.eventId,
        phase: dto.phase,
        showExpected: dto.showExpected ?? false,
        openedBy: actorUserId,
      },
      update: {
        status: 'open',
        showExpected: dto.showExpected ?? false,
        openedAt: new Date(),
        openedBy: actorUserId,
        closedAt: null,
        closedBy: null,
      },
    });

    if (!actorUserId.startsWith('system-')) {
      await this.audit.log({
        tenantId,
        userId: actorUserId,
        action: 'CREATE',
        entity: 'InventoryWindow',
        entityId: window.id,
        metadata: { spaceId: dto.spaceId, eventId: dto.eventId, phase: dto.phase },
      });
    }

    return window;
  }

  /**
   * Slug du lien QR code (/login/pin/:slug) de chaque stockage de l'espace : le plan
   * de configuration lu par l'inventaire ne le porte pas (seule la liste des PdV
   * l'expose). Toutes configurations confondues, comme « Voir tout l'inventaire ».
   */
  async getStorageSlugs(spaceId: string, user: CurrentUserData): Promise<Record<string, string>> {
    await this.spaceAccess.assertCanAccessSpace(user, spaceId);
    const inSpace = { spaceId, space: { tenantId: user.tenantId! } };
    const storages = await this.prisma.spaceElement.findMany({
      where: {
        type: 'storage',
        OR: [
          { floor: { config: inSpace } },
          { forecourt: { config: inSpace } },
          { externalMerch: { config: inSpace } },
          { zone: inSpace }, // Builder v2
        ],
      },
      select: { id: true, slug: true },
    });
    return Object.fromEntries(storages.map((s) => [s.id, s.slug]));
  }

  async getStatusBoard(spaceId: string, eventId: string, user: CurrentUserData) {
    await this.spaceAccess.assertCanAccessSpace(user, spaceId);
    const windows = await this.prisma.inventoryWindow.findMany({
      where: { tenantId: user.tenantId!, spaceId, eventId, phase: { in: INVENTORY_PHASES } },
      include: { guestAccesses: true },
      orderBy: { phase: 'asc' },
    });

    const elementIds = windows.flatMap((w) => w.guestAccesses.map((a) => a.elementId));
    const elements = elementIds.length
      ? await this.prisma.spaceElement.findMany({
          where: { id: { in: elementIds } },
          select: { id: true, name: true },
        })
      : [];
    const elementNameById = new Map(elements.map((e) => [e.id, e.name]));

    return windows.map((w) => ({
      id: w.id,
      phase: w.phase,
      status: w.status,
      showExpected: w.showExpected,
      openedAt: w.openedAt,
      closedAt: w.closedAt,
      // PIN désormais partagé par TOUS les PDV de la fenêtre — un seul flag/horodatage
      // au niveau fenêtre, plus par accès (cf. schema.prisma::InventoryWindow).
      hasPin: !!w.pinLookupHash,
      // PIN en clair pour le directeur (retrouvable sous "Régénérer le PIN",
      // critère d'acceptation 2026-09-14). null si la fenêtre date d'avant le
      // chiffrement réversible : il faudra le régénérer une fois.
      pin: w.pinLookupHash ? decryptPin(w.pinCiphertext, this.guestPinCredentialService.pinSecret()) : null,
      pinSetAt: w.pinSetAt,
      accesses: w.guestAccesses.map((a) => ({
        id: a.id,
        elementId: a.elementId,
        elementName: elementNameById.get(a.elementId) ?? null,
        status: a.status,
        lastLoginAt: a.lastLoginAt,
        // "Soumis" (J'ai terminé, signal seulement) / "Validé" (verrou réel,
        // posé par le directeur via validateAccess) — deux états distincts,
        // cf. commentaires sur GuestPinAccess.submittedAt/validatedAt (schema.prisma).
        submittedAt: a.submittedAt,
        validatedAt: a.validatedAt,
        reviewStatus: a.validatedAt ? 'validated' : a.submittedAt ? 'submitted' : 'in_progress',
        // Pourquoi ce PDV est arrêté : première vente (arrêt automatique du pre-event,
        // Bertrand 2026-10-07) ou action du directeur / fin de phase.
        revokedAt: a.status === 'revoked' ? a.revokedAt : null,
        stopReason: a.status !== 'revoked' ? null : a.revokedBy === PRE_SALE_STOP_ACTOR ? 'sale' : 'manual',
      })),
    }));
  }


  /**
   * Génère (ou régénère) LE PIN partagé de cette fenêtre — vaut pour TOUS les PDV,
   * pas un par PDV (décision produit 2026-09-08). Retourne le PIN EN CLAIR et le
   * conserve chiffré (pinCiphertext) pour que le directeur puisse le retrouver
   * après fermeture du popup (critère d'acceptation 2026-09-14) ; ne jamais le
   * journaliser. Régénérer invalide
   * IMMÉDIATEMENT l'ancien PIN pour tout le monde (comparaison stricte dans
   * `login`), sans toucher aux lignes GuestPinAccess existantes (statut/historique
   * par PDV conservés).
   */
  async setWindowPin(windowId: string, user: CurrentUserData) {
    const tenantId = user.tenantId!;
    const window = await this.prisma.inventoryWindow.findFirst({ where: { id: windowId, tenantId } });
    if (!window) throw new NotFoundException('Fenêtre introuvable');
    await this.spaceAccess.assertCanAccessSpace(user, window.spaceId);
    if (window.status !== 'open') {
      throw new BadRequestException('Fenêtre clôturée : impossible de générer un PIN.');
    }
    await this.assertPeriodOpen(
      window.spaceId,
      window.eventId,
      tenantId,
      window.phase as InventoryWindowPhase,
    );
    const pin = await this.assignPin(windowId, tenantId, user.id);
    return { windowId, pin };
  }

  /** Pose un nouveau PIN (unique sur toute la base) sur la fenêtre et le retourne en clair. */
  private async assignPin(windowId: string, tenantId: string, actorUserId: string): Promise<string> {
    for (let attempt = 0; attempt < PIN_GENERATION_MAX_RETRIES; attempt++) {
      const pin = this.guestPinCredentialService.generatePin();
      const pinLookupHash = this.guestPinCredentialService.hashPin(pin);
      try {
        await this.prisma.inventoryWindow.update({
          where: { id: windowId },
          data: {
            pinLookupHash,
            pinCiphertext: encryptPin(pin, this.guestPinCredentialService.pinSecret()),
            pinSetAt: new Date(),
            pinSetBy: actorUserId,
          },
        });

        // Acteur système (PIN préparé à l'avance) : AuditLog.userId est obligatoire.
        if (!actorUserId.startsWith('system-')) {
          await this.audit.log({
            tenantId,
            userId: actorUserId,
            action: 'UPDATE',
            entity: 'InventoryWindow',
            entityId: windowId,
            metadata: { action: 'set-pin' },
          });
        }

        return pin;
      } catch (error: any) {
        // Collision sur pinLookupHash (@unique) — une autre fenêtre a déjà ce PIN.
        if (error?.code === 'P2002' && attempt < PIN_GENERATION_MAX_RETRIES - 1) continue;
        throw error;
      }
    }
    throw new BadRequestException('Impossible de générer un PIN unique, réessayez');
  }

  /** PIN de la fenêtre, généré s'il n'existe pas encore (fenêtre antérieure au PIN
   *  conservé, ou PIN illisible faute de chiffrement réversible). */
  async ensurePin(window: InventoryWindow, actorUserId: string): Promise<void> {
    if (window.pinLookupHash && window.pinCiphertext) return;
    await this.assignPin(window.id, window.tenantId, actorUserId);
  }

  /**
   * Fenêtre PRÉPARÉE (document Bertrand 2026-10-06 : « générer automatiquement les codes
   * PIN pour tous les événements à l'avance ») : créée arrêtée, avec son PIN. Personne ne
   * se connecte tant que la phase n'est pas démarrée (sans ligne PDV, seule une fenêtre
   * ouverte laisse entrer). Sans effet si la fenêtre existe déjà.
   */
  async prepareWindow(
    target: WindowTargetDto,
    tenantId: string,
    actorId: string,
  ): Promise<'created' | 'exists'> {
    let window = await this.findWindow(target.spaceId, target.eventId, tenantId, target.phase);
    if (window?.pinLookupHash && window.pinCiphertext) return 'exists';
    if (!window) {
      const now = new Date();
      try {
        window = await this.prisma.inventoryWindow.create({
          data: {
            tenantId,
            spaceId: target.spaceId,
            eventId: target.eventId,
            phase: target.phase,
            status: 'closed',
            openedBy: actorId,
            closedAt: now,
            closedBy: actorId,
          },
        });
      } catch (error: any) {
        // Créée entre-temps (▶ d'un PDV, autre tick) : rien à faire.
        if (error?.code === 'P2002') return 'exists';
        throw error;
      }
    }
    await this.ensurePin(window, actorId);
    return 'created';
  }

  ensureWindowPin(window: InventoryWindow, actorUserId: string): Promise<void> {
    return this.ensurePin(window, actorUserId);
  }

  regenerateWindowPin(windowId: string, tenantId: string, actorUserId: string): Promise<string> {
    return this.assignPin(windowId, tenantId, actorUserId);
  }

  findWindow(spaceId: string, eventId: string, tenantId: string, phase: InventoryWindowPhase) {
    return this.prisma.inventoryWindow.findUnique({
      where: { uniq_inventory_window: { tenantId, spaceId, eventId, phase } },
    });
  }

  async revokeAccess(accessId: string, user: CurrentUserData) {
    const tenantId = user.tenantId!;
    const access = await this.prisma.guestPinAccess.findFirst({ where: { id: accessId, tenantId } });
    if (!access) throw new NotFoundException('Accès introuvable');
    await this.spaceAccess.assertCanAccessSpace(user, access.spaceId);

    await this.prisma.guestPinAccess.update({
      where: { id: accessId },
      data: {
        status: 'revoked',
        revokedAt: new Date(),
        revokedBy: user.id,
      },
    });

    await this.audit.log({
      tenantId,
      userId: user.id,
      action: 'DELETE',
      entity: 'GuestPinAccess',
      entityId: accessId,
      metadata: { action: 'revoke' },
    });
  }

  /**
   * Réactive un PDV précédemment révoqué — SANS toucher au PIN partagé de la
   * fenêtre (contrairement à l'ancien "régénérer le PIN" par PDV, qui n'existe
   * plus : le PIN est désormais commun, le régénérer affecterait tout le monde).
   */
  async reactivateAccess(accessId: string, user: CurrentUserData) {
    const tenantId = user.tenantId!;
    const access = await this.prisma.guestPinAccess.findFirst({ where: { id: accessId, tenantId } });
    if (!access) throw new NotFoundException('Accès introuvable');
    await this.spaceAccess.assertCanAccessSpace(user, access.spaceId);
    if (access.status === 'active') return { status: 'active' };

    await this.prisma.guestPinAccess.update({
      where: { id: accessId },
      data: { status: 'active', revokedAt: null, revokedBy: null },
    });

    await this.audit.log({
      tenantId,
      userId: user.id,
      action: 'UPDATE',
      entity: 'GuestPinAccess',
      entityId: accessId,
      metadata: { action: 'reactivate' },
    });

    return { status: 'active' };
  }

  /**
   * Le DIRECTEUR valide ce PDV après relecture — c'est CE moment, et lui seul, qui
   * verrouille l'écriture invité (cf. saveCount). Exige `submittedAt` posé (rien à
   * valider tant que le manager n'a pas dit "J'ai terminé") ; no-op si déjà validé.
   */
  async validateAccess(accessId: string, user: CurrentUserData) {
    const tenantId = user.tenantId!;
    const access = await this.prisma.guestPinAccess.findFirst({ where: { id: accessId, tenantId } });
    if (!access) throw new NotFoundException('Accès introuvable');
    await this.spaceAccess.assertCanAccessSpace(user, access.spaceId);
    if (access.validatedAt) return { validatedAt: access.validatedAt };
    if (!access.submittedAt) {
      throw new ForbiddenException("Ce PDV n'a pas encore été soumis par le manager (\"J'ai terminé\").");
    }

    const updated = await this.prisma.guestPinAccess.update({
      where: { id: accessId },
      data: { validatedAt: new Date(), validatedBy: user.id },
      select: { validatedAt: true },
    });

    await this.audit.log({
      tenantId,
      userId: user.id,
      action: 'UPDATE',
      entity: 'GuestPinAccess',
      entityId: accessId,
      metadata: { action: 'validate' },
    });

    return updated;
  }

  /**
   * Le directeur renvoie ce PDV pour correction : réouvre l'écriture (efface le
   * signal "J'ai terminé") — le PIN étant désormais partagé par toute la fenêtre,
   * il n'y a de toute façon plus de PIN individuel à régénérer.
   */
  async requestCorrection(accessId: string, user: CurrentUserData) {
    const tenantId = user.tenantId!;
    const access = await this.prisma.guestPinAccess.findFirst({ where: { id: accessId, tenantId } });
    if (!access) throw new NotFoundException('Accès introuvable');
    await this.spaceAccess.assertCanAccessSpace(user, access.spaceId);
    if (!access.submittedAt && !access.validatedAt) return { submittedAt: null };

    await this.prisma.guestPinAccess.update({
      where: { id: accessId },
      data: { submittedAt: null, validatedAt: null, validatedBy: null },
    });

    await this.audit.log({
      tenantId,
      userId: user.id,
      action: 'UPDATE',
      entity: 'GuestPinAccess',
      entityId: accessId,
      metadata: { action: 'request-correction' },
    });

    return { submittedAt: null };
  }

  async closeWindow(windowId: string, user: CurrentUserData) {
    const tenantId = user.tenantId!;
    const actorUserId = user.id;
    const window = await this.prisma.inventoryWindow.findFirst({ where: { id: windowId, tenantId } });
    if (!window) throw new NotFoundException('Fenêtre introuvable');
    await this.spaceAccess.assertCanAccessSpace(user, window.spaceId);
    if (window.status !== 'open') {
      throw new ForbiddenException('Fenêtre déjà clôturée');
    }
    const push = await this.closeWindowRecord(window, actorUserId, { pushToLogistic: true, reason: 'manual' });
    return { windowClosed: true, push };
  }

  /**
   * Clôture effective d'une fenêtre, partagée par le bouton directeur, l'ouverture d'un
   * autre match (fenêtre périmée) et le cron de fin de période
   * (InventoryWindowLifecycleCronService). `pushToLogistic: false` pour toute clôture
   * tardive : un comptage d'un match passé ne doit pas recaler le registre actuel.
   */
  async closeWindowRecord(
    window: InventoryWindow,
    actorId: string,
    options: {
      pushToLogistic: boolean;
      reason: 'manual' | 'manual-stop' | 'phase-switch' | 'superseded' | 'period-end' | 'delivery' | 'sale';
    },
  ): Promise<{ ok: boolean; reason?: string }> {
    const tenantId = window.tenantId;
    const windowId = window.id;

    // La clôture (= révocation de tous les accès invité de cette fenêtre, PIN conservé,
    // cf. closeInventoryWindows) est inconditionnelle : elle prend effet même si le
    // push logistique échoue ensuite (ex. "aucun item compté"). Ne jamais faire
    // dépendre la révocation du succès de la synchro. Le cron et un clic directeur
    // simultanés ne clôturent (et ne poussent) qu'une fois.
    const closed = await closeInventoryWindows(this.prisma, { id: windowId }, { closedAt: new Date(), closedBy: actorId });
    if (!closed.count) return { ok: false, reason: 'already-closed' };

    let pushResult: { ok: boolean; reason?: string } = { ok: false, reason: 'not-attempted' };
    if (options.pushToLogistic) {
      try {
        pushResult = await this.inventoryLogisticPushService.pushCurrentCountToLogistic(
          window.spaceId,
          window.eventId,
          tenantId,
          window.phase as 'pre-event' | 'post-event',
          actorId,
        );
        await this.prisma.inventoryWindow.update({
          where: { id: windowId },
          data: { pushedToLogisticAt: new Date() },
        });
      } catch (error: any) {
        this.logger.warn(
          `Fenêtre ${windowId} clôturée mais push logistique en échec : ${error?.message}`,
        );
        pushResult = { ok: false, reason: error?.message ?? 'push-failed' };
      }
    }

    // Acteur système (cron) : AuditLog.userId est obligatoire, l'écriture échouait à chaque
    // fermeture automatique. La trace reste sur la fenêtre (closedBy/closedAt) et dans les
    // logs du cron, comme pour la clôture « portes ouvertes » (runDoorsOpen).
    if (actorId.startsWith('system-')) return pushResult;
    await this.audit.log({
      tenantId,
      userId: actorId,
      action: 'UPDATE',
      entity: 'InventoryWindow',
      entityId: windowId,
      metadata: {
        action: options.pushToLogistic ? 'close-and-push-logistic' : 'close',
        reason: options.reason,
        actor: actorId,
        pushResult,
      },
    });

    return pushResult;
  }
}
