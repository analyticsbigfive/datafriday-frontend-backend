import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, createHmac, randomInt } from 'crypto';
import { PrismaService } from '../../core/database/prisma.service';
import { RedisService } from '../../core/redis/redis.service';
import { AuditService } from '../../core/audit/audit.service';
import { SpaceAccessService } from '../../core/auth/space-access.service';
import { InventoryService } from '../inventory/inventory.service';
import { SpaceMenusService } from '../space-menus/space-menus.service';
import { CreateWindowDto } from './dto/create-window.dto';
import { SaveGuestCountDto } from './dto/save-guest-count.dto';
import type { GuestPinUser } from '../../core/auth/strategies/jwt-guest-pin.strategy';
import type { CurrentUserData } from '../../core/auth/decorators/current-user.decorator';

const PIN_LOGIN_MAX_ATTEMPTS = 8;
const PIN_LOGIN_WINDOW_SECONDS = 15 * 60;
const PIN_GENERATION_MAX_RETRIES = 5;

export type GuestLoginResult =
  | {
      state: 'ok';
      token: string;
      phase: string;
      spaceId: string;
      spaceName: string | null;
      elementId: string;
      elementName: string | null;
      eventId: string;
    }
  // PIN syntaxiquement valide mais qui ne correspond à aucun accès actif — l'écran
  // "Code PIN incorrect" des maquettes (distinct de 'inactive' : ce dernier suppose
  // un PIN CORRECT dont la fenêtre est fermée, ex. lien réutilisé après l'événement).
  // Aussi renvoyé si le PIN est valide mais appartient à un AUTRE PDV que celui de
  // l'URL scannée (/login/pin/:slug/:phase) — jamais de redirection silencieuse vers
  // le "bon" PDV, ça ressemblerait à un bug plus qu'à une protection.
  | { state: 'not_found'; attemptsRemaining: number }
  | { state: 'inactive' }
  | { state: 'locked'; retryAfter: number };

export interface GuestPinPublicContext {
  elementName: string | null;
  /** Une fenêtre "open" a une ligne GuestPinAccess active pour ce PDV+phase. */
  active: boolean;
}

@Injectable()
export class GuestPinAccessService {
  private readonly logger = new Logger(GuestPinAccessService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
    private readonly inventoryService: InventoryService,
    private readonly spaceMenus: SpaceMenusService,
    private readonly spaceAccess: SpaceAccessService,
    private readonly configService: ConfigService,
    private readonly jwt: JwtService,
  ) {}

  /** STAFF/VIEWER limités à leurs espaces accordés (SpaceAccessGuard ne s'applique
   *  pas ici : les routes directeur n'exposent spaceId que sur certaines d'entre
   *  elles). Même règle que SpaceAccessGuard, appliquée manuellement. */
  private async assertSpaceAccess(user: CurrentUserData, spaceId: string): Promise<void> {
    const allowed = await this.spaceAccess.canAccessSpace(user, spaceId);
    if (!allowed) {
      throw new ForbiddenException("Vous n'avez pas accès à cet espace.");
    }
  }

  private hashPin(pin: string): string {
    const secret = this.configService.getOrThrow<string>('GUEST_PIN_HMAC_SECRET');
    return createHmac('sha256', secret).update(pin).digest('hex');
  }

  private hashDeviceId(deviceId: string): string {
    return createHash('sha256').update(deviceId).digest('hex');
  }

  private rateLimitKey(ip: string): string {
    return `guestpin:login-fail:${ip}`;
  }

  // ── Invité : contexte public (avant PIN) ────────────────────────────────────

  /**
   * Résout le PDV depuis l'URL scannée (/login/pin/:slug), SANS PIN : nom à afficher
   * avant saisie, et si une fenêtre (pré OU post, peu importe laquelle) est active
   * pour ce PDV (permet d'afficher "Accès inactif" immédiatement plutôt que d'attendre
   * une tentative de PIN). Ne révèle jamais le PIN ni son statut détaillé.
   *
   * UN SEUL lien par PDV (décision produit 2026-09-08, revenue sur le
   * "/login/pin/:slug/:phase" précédent) : le même QR sert avant ET après
   * l'événement — en pratique jamais les deux fenêtres ouvertes en même temps (le
   * directeur clôture le pré-event avant d'ouvrir le post-event), donc la phase se
   * déduit de LA fenêtre actuellement ouverte, pas de l'URL.
   */
  async getPublicContext(slug: string): Promise<GuestPinPublicContext> {
    const element = await this.prisma.spaceElement.findUnique({
      where: { slug },
      select: { id: true, name: true },
    });
    if (!element) return { elementName: null, active: false };

    const access = await this.prisma.guestPinAccess.findFirst({
      where: {
        elementId: element.id,
        status: 'active',
        window: { status: 'open' },
      },
      select: { id: true },
    });

    return { elementName: element.name, active: !!access };
  }

  // ── Invité : login ───────────────────────────────────────────────────────────

  async login(
    pin: string,
    deviceId: string | undefined,
    ip: string,
    slug: string,
  ): Promise<GuestLoginResult> {
    const rlKey = this.rateLimitKey(ip);
    const attempts = await this.redis.get<number>(rlKey);
    if ((attempts ?? 0) >= PIN_LOGIN_MAX_ATTEMPTS) {
      const retryAfter = await this.redis.ttl(rlKey);
      return { state: 'locked', retryAfter: Math.max(retryAfter, 1) };
    }

    const access = await this.prisma.guestPinAccess.findUnique({
      where: { pinLookupHash: this.hashPin(pin) },
      include: { window: true },
    });

    // Pas de ligne, OU PIN valide mais pour un AUTRE PDV que l'URL scannée : même
    // réponse ('not_found') dans les deux cas — jamais indiquer "ce PIN existe mais
    // pas ici", ça révélerait qu'un PIN valide circule ailleurs. La phase n'est PAS
    // vérifiée contre l'URL (il n'y en a plus) : le PIN appartient à UNE fenêtre
    // précise (pré ou post) de par sa création, c'est elle qui répond.
    const element = access ? await this.prisma.spaceElement.findUnique({
      where: { id: access.elementId },
      select: { slug: true, name: true },
    }) : null;
    if (!access || !element || element.slug !== slug) {
      const count = await this.registerLoginFailure(rlKey);
      return { state: 'not_found', attemptsRemaining: Math.max(PIN_LOGIN_MAX_ATTEMPTS - count, 0) };
    }

    if (access.status !== 'active' || access.window.status !== 'open') {
      return { state: 'inactive' };
    }

    const [space, event] = await Promise.all([
      this.prisma.space.findUnique({ where: { id: access.spaceId }, select: { name: true } }),
      this.prisma.event.findUnique({ where: { id: access.window.eventId }, select: { id: true } }),
    ]);

    // Décision produit 2026-09-08 : le PIN seul donne l'accès, pas de restriction à un
    // seul appareil. boundDeviceHash/boundAt sont écrasés à CHAQUE login réussi
    // ("dernière connexion vue"), diagnostic uniquement — jamais comparés/rejetés.
    const deviceHash = deviceId ? this.hashDeviceId(deviceId) : null;
    await this.prisma.guestPinAccess.update({
      where: { id: access.id },
      data: {
        boundDeviceHash: deviceHash,
        boundAt: new Date(),
        lastLoginAt: new Date(),
      },
    });

    const token = await this.jwt.signAsync(
      { sub: access.id },
      {
        secret: this.configService.getOrThrow<string>('GUEST_PIN_JWT_SECRET'),
        expiresIn: this.configService.get<string>('GUEST_PIN_JWT_TTL') || '1d',
      },
    );

    return {
      state: 'ok',
      token,
      phase: access.window.phase,
      spaceId: access.spaceId,
      spaceName: space?.name ?? null,
      elementId: access.elementId,
      elementName: element.name,
      eventId: event?.id ?? access.window.eventId,
    };
  }

  private async registerLoginFailure(rlKey: string): Promise<number> {
    const count = await this.redis.incr(rlKey);
    if (count === 1) {
      await this.redis.expire(rlKey, PIN_LOGIN_WINDOW_SECONDS);
    }
    return count;
  }

  // ── Invité : session / inventaire ───────────────────────────────────────────

  async getSession(user: GuestPinUser) {
    const [space, element] = await Promise.all([
      this.prisma.space.findUnique({ where: { id: user.spaceId }, select: { name: true } }),
      this.prisma.spaceElement.findUnique({ where: { id: user.elementId }, select: { name: true } }),
    ]);
    return {
      phase: user.phase,
      spaceId: user.spaceId,
      spaceName: space?.name ?? null,
      elementId: user.elementId,
      elementName: element?.name ?? null,
      eventId: user.eventId,
      showExpected: user.showExpected,
      submittedAt: user.submittedAt,
    };
  }

  /**
   * Catalogue du PDV (quels items compter) FUSIONNÉ avec les comptages déjà
   * sauvegardés — sans ce catalogue, un PDV sans aucun comptage existant
   * renverrait un blob vide et l'invité n'aurait rien à saisir. Réutilise
   * SpaceMenusService.getShopInventory (même source que l'écran staff), pas de
   * logique de résolution de catalogue dupliquée ici.
   */
  async getInventory(user: GuestPinUser) {
    const guestScopedUser = { id: 'guest-pin', isSuperAdmin: true, isOwner: false, allSpacesAccess: false };
    const [merged, catalog] = await Promise.all([
      this.inventoryService.getBySpaceAndEvent(
        user.spaceId,
        user.eventId,
        user.tenantId,
        user.phase as 'pre-event' | 'post-event',
      ),
      this.spaceMenus.getShopInventory(user.elementId, user.tenantId, undefined, guestScopedUser),
    ]);

    const blob = (merged?.inventoryCounts ?? {}) as Record<string, Record<string, any>>;
    const savedCounts = blob[user.elementId] ?? {};
    const catalogItems = (catalog as any)?.items ?? [];

    const items = catalogItems.map((item: any) => ({
      itemId: item.id,
      name: item.name,
      kind: item.kind,
      unit: item.unit ?? null,
      packedUnits: 0,
      looseUnits: 0,
      isCounted: false,
      storageLocation: null,
      countingStatus: 'pending',
      ...(savedCounts[item.id] ?? {}),
    }));

    return {
      elementId: user.elementId,
      elementName: (catalog as any)?.shopName ?? null,
      items,
    };
  }

  // Décision produit 2026-09-08 : toujours montré, pas d'option — `showExpected`
  // (InventoryWindow) n'est plus lu ici (le champ reste en base, juste plus vérifié).
  async getBaseline(user: GuestPinUser) {
    const baseline =
      user.phase === 'pre-event'
        ? await this.inventoryService.getPreEventBaseline(user.spaceId, user.eventId, user.tenantId)
        : await this.inventoryService.getPostEventBaseline(user.spaceId, user.eventId, user.tenantId);
    const expectedBlob = (baseline?.expected ?? {}) as Record<string, unknown>;
    return {
      ...baseline,
      expected: { [user.elementId]: expectedBlob[user.elementId] ?? {} },
    };
  }

  async saveCount(user: GuestPinUser, dto: SaveGuestCountDto) {
    if (user.submittedAt) {
      throw new ForbiddenException(
        'Comptage déjà envoyé ("J\'ai terminé") — lecture seule. Contacte le directeur de site pour corriger.',
      );
    }
    return this.inventoryService.saveInventoryCounts(
      {
        spaceId: user.spaceId,
        eventId: user.eventId,
        shopId: user.elementId,
        itemId: dto.itemId,
        packedUnits: dto.packedUnits,
        looseUnits: dto.looseUnits,
        isCounted: dto.isCounted,
        storageLocation: dto.storageLocation,
        countingStatus: dto.countingStatus,
      },
      user.tenantId,
      undefined,
    );
  }

  /**
   * "J'ai terminé" : gèle CET accès (lecture seule) sans toucher à la fenêtre ni aux
   * autres PDV — distinct de `closeWindow` (clôture globale par le directeur).
   * Idempotent (submittedAt déjà posé → no-op).
   */
  async submitCount(user: GuestPinUser) {
    if (user.submittedAt) return { submittedAt: user.submittedAt };
    const access = await this.prisma.guestPinAccess.update({
      where: { id: user.id },
      data: { submittedAt: new Date() },
      select: { submittedAt: true },
    });
    return access;
  }

  // ── Directeur : gestion des fenêtres et des PIN ─────────────────────────────

  async createOrReopenWindow(dto: CreateWindowDto, user: CurrentUserData) {
    await this.assertSpaceAccess(user, dto.spaceId);
    const tenantId = user.tenantId!;
    const actorUserId = user.id;
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

    await this.audit.log({
      tenantId,
      userId: actorUserId,
      action: 'CREATE',
      entity: 'InventoryWindow',
      entityId: window.id,
      metadata: { spaceId: dto.spaceId, eventId: dto.eventId, phase: dto.phase },
    });

    return window;
  }

  async getStatusBoard(spaceId: string, eventId: string, user: CurrentUserData) {
    await this.assertSpaceAccess(user, spaceId);
    const windows = await this.prisma.inventoryWindow.findMany({
      where: { tenantId: user.tenantId!, spaceId, eventId },
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
      accesses: w.guestAccesses.map((a) => ({
        id: a.id,
        elementId: a.elementId,
        elementName: elementNameById.get(a.elementId) ?? null,
        status: a.status,
        hasPin: !!a.pinLookupHash,
        lastLoginAt: a.lastLoginAt,
        // "Soumis · gelé" (J'ai terminé) — distinct de `status: 'revoked'`.
        submittedAt: a.submittedAt,
      })),
    }));
  }

  private generatePin(): string {
    return String(randomInt(0, 1_000_000)).padStart(6, '0');
  }

  /** Génère (ou régénère) un PIN pour un PDV. Retourne le PIN EN CLAIR — l'appelant
   *  (contrôleur) est responsable de ne jamais le journaliser ni le stocker ailleurs
   *  que dans la réponse HTTP one-shot. */
  async setPin(windowId: string, elementId: string, user: CurrentUserData) {
    const tenantId = user.tenantId!;
    const actorUserId = user.id;
    const window = await this.prisma.inventoryWindow.findFirst({ where: { id: windowId, tenantId } });
    if (!window) throw new NotFoundException('Fenêtre introuvable');
    await this.assertSpaceAccess(user, window.spaceId);

    for (let attempt = 0; attempt < PIN_GENERATION_MAX_RETRIES; attempt++) {
      const pin = this.generatePin();
      const pinLookupHash = this.hashPin(pin);
      try {
        const access = await this.prisma.guestPinAccess.upsert({
          where: { uniq_guest_pin_access_per_element: { windowId, elementId } },
          create: {
            tenantId,
            windowId,
            spaceId: window.spaceId,
            elementId,
            pinLookupHash,
            status: 'active',
            createdBy: actorUserId,
          },
          update: {
            pinLookupHash,
            status: 'active',
            failedAttempts: 0,
            lockedUntil: null,
            boundDeviceHash: null,
            boundAt: null,
            revokedAt: null,
            revokedBy: null,
            // Un nouveau PIN dégèle : "J'ai terminé" ne devrait pas survivre à un reset
            // explicite du directeur (support : "je me suis trompé, je recompte").
            submittedAt: null,
          },
        });

        await this.audit.log({
          tenantId,
          userId: actorUserId,
          action: 'UPDATE',
          entity: 'GuestPinAccess',
          entityId: access.id,
          metadata: { elementId, action: 'set-pin' },
        });

        return { accessId: access.id, elementId, pin };
      } catch (error: any) {
        // Collision sur pinLookupHash (@unique) — un autre PDV a déjà ce PIN actif.
        if (error?.code === 'P2002' && attempt < PIN_GENERATION_MAX_RETRIES - 1) continue;
        throw error;
      }
    }
    throw new BadRequestException('Impossible de générer un PIN unique, réessayez');
  }

  async resetPin(accessId: string, user: CurrentUserData) {
    const access = await this.prisma.guestPinAccess.findFirst({
      where: { id: accessId, tenantId: user.tenantId! },
    });
    if (!access) throw new NotFoundException('Accès introuvable');
    await this.assertSpaceAccess(user, access.spaceId);
    return this.setPin(access.windowId, access.elementId, user);
  }

  async revokeAccess(accessId: string, user: CurrentUserData) {
    const tenantId = user.tenantId!;
    const access = await this.prisma.guestPinAccess.findFirst({ where: { id: accessId, tenantId } });
    if (!access) throw new NotFoundException('Accès introuvable');
    await this.assertSpaceAccess(user, access.spaceId);

    await this.prisma.guestPinAccess.update({
      where: { id: accessId },
      data: {
        status: 'revoked',
        pinLookupHash: null,
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

  async closeWindow(windowId: string, user: CurrentUserData) {
    const tenantId = user.tenantId!;
    const actorUserId = user.id;
    const window = await this.prisma.inventoryWindow.findFirst({ where: { id: windowId, tenantId } });
    if (!window) throw new NotFoundException('Fenêtre introuvable');
    await this.assertSpaceAccess(user, window.spaceId);
    if (window.status !== 'open') {
      throw new ForbiddenException('Fenêtre déjà clôturée');
    }

    // La clôture (= révocation de tous les accès invité de cette fenêtre) est
    // inconditionnelle : elle prend effet même si le push logistique échoue
    // ensuite (ex. "aucun item compté"). Ne jamais faire dépendre la révocation
    // du succès de la synchro.
    await this.prisma.inventoryWindow.update({
      where: { id: windowId },
      data: { status: 'closed', closedAt: new Date(), closedBy: actorUserId },
    });

    let pushResult: { ok: boolean; reason?: string } = { ok: false, reason: 'not-attempted' };
    try {
      pushResult = await this.inventoryService.pushCurrentCountToLogistic(
        window.spaceId,
        window.eventId,
        tenantId,
        window.phase as 'pre-event' | 'post-event',
        actorUserId,
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

    await this.audit.log({
      tenantId,
      userId: actorUserId,
      action: 'UPDATE',
      entity: 'InventoryWindow',
      entityId: windowId,
      metadata: { action: 'close-and-push-logistic', pushResult },
    });

    return { windowClosed: true, push: pushResult };
  }
}
