import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';

export interface GuestPinJwtPayload {
  sub: string; // GuestPinAccess.id
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
  // "J'ai terminé" (gel) : lecture toujours permise, écriture à refuser côté service
  // si non-null. La fenêtre reste "open" — seul CET accès est gelé.
  submittedAt: Date | null;
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

    if (!access || access.status !== 'active' || access.window.status !== 'open') {
      throw new UnauthorizedException('Accès invité révoqué ou fenêtre clôturée');
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
    };
  }
}
