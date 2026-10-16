import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';

export interface GuestPinJwtPayload {
  sub: string; // GuestPinAccess.id
  // Phase `pos` uniquement : nom du vendeur saisi à la connexion (plusieurs vendeurs
  // partagent la GuestPinAccess du PdV, le nom vit donc dans la session). Absent des
  // jetons inventaire et ventilation.
  vendorName?: string;
  iat?: number;
  exp?: number;
}

export interface GuestPinUser {
  id: string;
  type: 'guest-pin';
  tenantId: string;
  spaceId: string;
  elementId: string;
  windowId: string;
  eventId: string;
  phase: string;
  showExpected: boolean;
  // "J'ai terminé" : signal informatif (PDV prêt à vérifier), PAS un verrou — cf.
  // validatedAt ci-dessous, le seul champ qui bloque l'écriture côté service.
  submittedAt: Date | null;
  // Verrou réel (lecture seule), posé uniquement par le directeur (validateAccess).
  validatedAt: Date | null;
  // Phase `pos` : nom du vendeur de la session ; null pour toute autre phase.
  vendorName: string | null;
}

/**
 * Stratégie JWT pour les managers de PDV sans compte (accès invité par PIN).
 * Secret DÉDIÉ (GUEST_PIN_JWT_SECRET), distinct de JWT_SECRET (celui-ci vérifie
 * les tokens Supabase) — ne jamais réutiliser buildJwtVerifyOptions ici.
 *
 * Contrairement à jwt-onboarding (validation purement locale du payload), celle-ci
 * TAPE LA BASE à chaque requête : c'est ce qui permet la révocation immédiate d'un
 * accès (clôture de fenêtre, revoke ciblé) même si le JWT signé est encore valide.
 */
@Injectable()
export class JwtGuestPinStrategy extends PassportStrategy(Strategy, 'jwt-guest-pin') {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      algorithms: ['HS256'],
      secretOrKey: configService.getOrThrow<string>('GUEST_PIN_JWT_SECRET'),
    });
  }

  async validate(payload: GuestPinJwtPayload): Promise<GuestPinUser> {
    if (!payload.sub) {
      throw new UnauthorizedException('Invalid guest token payload');
    }

    const access = await this.prisma.guestPinAccess.findUnique({
      where: { id: payload.sub },
      include: { window: true },
    });

    // Seule la ligne du PDV fait foi : toute clôture de fenêtre la révoque
    // (closeInventoryWindows), et un PDV peut être rouvert individuellement alors
    // que sa fenêtre est arrêtée (document Bertrand 2026-10-06, pages 3 à 6).
    if (!access || access.status !== 'active') {
      throw new UnauthorizedException('Accès invité révoqué ou fenêtre clôturée');
    }

    // Caisse POS : une seule voie d'accès, la fenêtre du PdV ouverte. Contrairement à
    // l'inventaire, aucun PdV ne se rouvre seul sur une fenêtre arrêtée : ■ ferme la
    // fenêtre ET révoque l'accès, ce garde double la révocation (relue à chaque requête).
    const isPos = access.window.phase === 'pos';
    if (isPos && access.window.status !== 'open') {
      throw new UnauthorizedException('Caisse arrêtée');
    }

    return {
      id: access.id,
      type: 'guest-pin',
      tenantId: access.tenantId,
      spaceId: access.spaceId,
      elementId: access.elementId,
      windowId: access.windowId,
      eventId: access.window.eventId,
      phase: access.window.phase,
      showExpected: access.window.showExpected,
      submittedAt: access.submittedAt,
      validatedAt: access.validatedAt,
      vendorName: isPos && typeof payload.vendorName === 'string' && payload.vendorName.trim() ? payload.vendorName : null,
    };
  }
}
