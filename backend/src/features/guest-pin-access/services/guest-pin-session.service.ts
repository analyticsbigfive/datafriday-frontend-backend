import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../../core/database/prisma.service';
import { RedisService } from '../../../core/redis/redis.service';
import type { GuestPinUser } from '../../../core/auth/strategies/jwt-guest-pin.strategy';
import { INVENTORY_PHASES } from '../inventory-window-period';
import { GuestPinCredentialService } from './guest-pin-credential.service';

const PIN_LOGIN_MAX_ATTEMPTS = 8;
const PIN_LOGIN_WINDOW_SECONDS = 15 * 60;

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
  // PIN qui ne correspond pas au PIN partagé de la fenêtre ouverte pour ce PDV —
  // l'écran "Code PIN incorrect" des maquettes (distinct de 'inactive' : ce dernier
  // couvre l'absence de fenêtre ouverte/de PIN généré, PAS comparé, donc jamais
  // compté dans le rate-limit).
  | { state: 'not_found'; attemptsRemaining: number }
  | { state: 'inactive' }
  | { state: 'locked'; retryAfter: number };

export interface GuestPinPublicContext {
  elementName: string | null;
  /** Une fenêtre "open" a une ligne GuestPinAccess active pour ce PDV+phase. */
  active: boolean;
}

/**
 * Connexion invitée par PIN : contexte public du PDV, connexion avec limitation des essais, jeton, session.
 */
@Injectable()
export class GuestPinSessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly configService: ConfigService,
    private readonly jwt: JwtService,
    private readonly guestPinCredentialService: GuestPinCredentialService,
  ) {}

  // ── Invité : contexte public (avant PIN) ────────────────────────────────────

  /**
   * Résout le PDV depuis l'URL scannée (/login/pin/:slug), SANS PIN : nom à afficher
   * avant saisie, et si une fenêtre (pré OU post, peu importe laquelle) est active
   * pour ce PDV (permet d'afficher "Accès inactif" immédiatement plutôt que d'attendre
   * une tentative de PIN). Ne révèle jamais le PIN ni son statut détaillé.
   *
   * UN SEUL lien par PDV (décision produit 2026-09-08) : le même QR sert avant ET après
   * l'événement. Les fenêtres pre-event et post-event PEUVENT être ouvertes en même
   * temps (post-event ouvert avant que le cron Doors Open n'ait clôturé le pre-event,
   * ou test d'un post-event sur un autre match) : la phase n'est donc jamais déduite
   * ici, c'est le PIN saisi qui désigne la fenêtre (cf. `login`). Avant saisie, le
   * PDV est "actif" dès qu'au moins une fenêtre ouverte avec PIN ne l'a pas révoqué.
   */
  async getPublicContext(slug: string): Promise<GuestPinPublicContext> {
    const element = await this.guestPinCredentialService.resolveElementBySlug(slug);
    if (!element || !element.spaceId) return { elementName: element?.name ?? null, active: false };
    const active = await this.isElementReachable(element.spaceId, element.id);
    return { elementName: element.name, active };
  }

  /**
   * Ce PDV est-il joignable par PIN en ce moment ? Oui si une fenêtre AVEC PIN lui est
   * ouverte : soit la fenêtre est ouverte en masse et ce PDV n'y a pas été arrêté, soit
   * ce PDV y a été rouvert individuellement (fenêtre arrêtée, document Bertrand
   * 2026-10-06 pages 3 et 4 : « peuvent être rendus accessibles individuellement »).
   */
  private async isElementReachable(spaceId: string, elementId: string): Promise<boolean> {
    const windows = await this.prisma.inventoryWindow.findMany({
      where: { spaceId, pinLookupHash: { not: null }, phase: { in: INVENTORY_PHASES } },
      select: { id: true, status: true },
    });
    if (!windows.length) return false;
    const accesses = await this.prisma.guestPinAccess.findMany({
      where: { windowId: { in: windows.map((w) => w.id) }, elementId },
      select: { windowId: true, status: true },
    });
    const accessByWindow = new Map(accesses.map((a) => [a.windowId, a.status]));
    return windows.some((w) => {
      const status = accessByWindow.get(w.id);
      return status ? status === 'active' : w.status === 'open';
    });
  }

  // ── Invité : login ───────────────────────────────────────────────────────────

  /**
   * UN SEUL PIN pour TOUS les PDV d'une fenêtre (décision produit 2026-09-08, revenue
   * sur "un PIN par PDV") : le PIN ne fait plus qu'authentifier "cette personne
   * connaît le code de la fenêtre" — c'est le SLUG de l'URL scannée qui détermine
   * QUEL PDV elle obtient. La ligne GuestPinAccess (suivi par PDV) est désormais
   * auto-créée ici au premier login réussi, plus provisionnée à l'avance par le
   * directeur (il n'y a plus rien à "générer" par PDV).
   */
  async login(
    pin: string,
    deviceId: string | undefined,
    ip: string,
    slug: string,
  ): Promise<GuestLoginResult> {
    const rlKey = this.guestPinCredentialService.rateLimitKey(ip);
    const attempts = await this.redis.get<number>(rlKey);
    if ((attempts ?? 0) >= PIN_LOGIN_MAX_ATTEMPTS) {
      const retryAfter = await this.redis.ttl(rlKey);
      return { state: 'locked', retryAfter: Math.max(retryAfter, 1) };
    }

    const element = await this.guestPinCredentialService.resolveElementBySlug(slug);
    const armed = element?.spaceId ? await this.isElementReachable(element.spaceId, element.id) : false;

    // PDV inconnu, ou aucune fenêtre AVEC PIN ne lui est ouverte — même écran
    // "Accès inactif" (déjà annoncé par getPublicContext avant toute saisie). Pas de
    // compteur d'échec ici : rien à brute-forcer, aucun PIN n'est comparé.
    if (!element || !armed) {
      return { state: 'inactive' };
    }
    // `armed` n'est vrai que quand `element.spaceId` était non-null (ligne
    // ci-dessus) — TS ne le déduit pas à travers deux variables distinctes.
    const spaceId = element.spaceId as string;

    // C'est le PIN qui désigne la fenêtre (pinLookupHash est unique) : pre-event et
    // post-event ont chacune leur PIN. La fenêtre peut être arrêtée (le PIN est
    // conservé, document Bertrand 2026-10-06) : c'est alors la ligne du PDV qui dit
    // s'il a été rouvert individuellement.
    // QR d'un PDV/stockage : seules les fenêtres d'inventaire comptent (le PIN d'une
    // fenêtre de ventilation ne doit pas ouvrir de session de comptage).
    const window = await this.prisma.inventoryWindow.findFirst({
      where: { spaceId, pinLookupHash: this.guestPinCredentialService.hashPin(pin), phase: { in: INVENTORY_PHASES } },
    });
    if (!window) {
      const count = await this.registerLoginFailure(rlKey);
      return { state: 'not_found', attemptsRemaining: Math.max(PIN_LOGIN_MAX_ATTEMPTS - count, 0) };
    }

    let access = await this.prisma.guestPinAccess.findUnique({
      where: { uniq_guest_pin_access_per_element: { windowId: window.id, elementId: element.id } },
    });
    // Ce PDV précis a été arrêté (■ sur sa ligne, ou arrêt de toute la fenêtre) —
    // le PIN partagé reste valide pour les AUTRES PDV ouverts, mais pas pour celui-ci.
    if (access && access.status !== 'active') {
      return { state: 'inactive' };
    }
    // Pas de ligne : seul un accès ouvert en masse (fenêtre ouverte) laisse entrer.
    if (!access && window.status !== 'open') {
      return { state: 'inactive' };
    }
    if (!access) {
      access = await this.prisma.guestPinAccess.create({
        data: {
          tenantId: window.tenantId,
          windowId: window.id,
          spaceId,
          elementId: element.id,
          status: 'active',
        },
      });
    }

    const [space, eventRow] = await Promise.all([
      this.prisma.space.findUnique({ where: { id: spaceId }, select: { name: true } }),
      this.prisma.event.findUnique({ where: { id: window.eventId }, select: { id: true } }),
    ]);

    // Décision produit 2026-09-08 : le PIN seul donne l'accès, pas de restriction à un
    // seul appareil. boundDeviceHash/boundAt sont écrasés à CHAQUE login réussi
    // ("dernière connexion vue"), diagnostic uniquement — jamais comparés/rejetés.
    const deviceHash = deviceId ? this.guestPinCredentialService.hashDeviceId(deviceId) : null;
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
      phase: window.phase,
      spaceId,
      spaceName: space?.name ?? null,
      elementId: element.id,
      elementName: element.name,
      eventId: eventRow?.id ?? window.eventId,
    };
  }

  // ── Briques partagées avec l'accès Ventilation (ventilation-access.service.ts) ──
  // Même PIN, même anti brute force, même jeton : rien n'est dupliqué.

  /** Secondes avant nouvel essai si cette IP a épuisé ses tentatives, sinon null. */
  async pinLoginRetryAfter(ip: string): Promise<number | null> {
    const rlKey = this.guestPinCredentialService.rateLimitKey(ip);
    const attempts = await this.redis.get<number>(rlKey);
    if ((attempts ?? 0) < PIN_LOGIN_MAX_ATTEMPTS) return null;
    return Math.max(await this.redis.ttl(rlKey), 1);
  }

  /** Compte un échec de PIN pour cette IP ; renvoie les essais restants. */
  async recordPinLoginFailure(ip: string): Promise<number> {
    const count = await this.registerLoginFailure(this.guestPinCredentialService.rateLimitKey(ip));
    return Math.max(PIN_LOGIN_MAX_ATTEMPTS - count, 0);
  }

  findWindowByPin(spaceId: string, pin: string, phase: string) {
    return this.prisma.inventoryWindow.findFirst({ where: { spaceId, phase, pinLookupHash: this.guestPinCredentialService.hashPin(pin) } });
  }

  /** Dernière connexion vue (diagnostic, jamais un verrou) puis jeton invité signé. */
  async issueGuestToken(accessId: string, deviceId: string | undefined): Promise<string> {
    await this.prisma.guestPinAccess.update({
      where: { id: accessId },
      data: {
        boundDeviceHash: deviceId ? this.guestPinCredentialService.hashDeviceId(deviceId) : null,
        boundAt: new Date(),
        lastLoginAt: new Date(),
      },
    });
    return this.jwt.signAsync(
      { sub: accessId },
      {
        secret: this.configService.getOrThrow<string>('GUEST_PIN_JWT_SECRET'),
        expiresIn: this.configService.get<string>('GUEST_PIN_JWT_TTL') || '1d',
      },
    );
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
      validatedAt: user.validatedAt,
    };
  }
}
