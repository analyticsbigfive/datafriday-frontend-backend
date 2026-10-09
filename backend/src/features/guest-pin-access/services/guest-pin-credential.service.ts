import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, randomInt } from 'crypto';
import type { InventoryWindow } from '@prisma/client';
import { PrismaService } from '../../../core/database/prisma.service';
import { decryptPin } from '../guest-pin-crypto';

/**
 * Secrets et identifiants de l'accès invité : hachage du PIN et de l'appareil, clé de limitation, génération et lecture du PIN, PDV par slug.
 */
@Injectable()
export class GuestPinCredentialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  pinSecret(): string {
    return this.configService.getOrThrow<string>('GUEST_PIN_HMAC_SECRET');
  }

  hashPin(pin: string): string {
    return createHmac('sha256', this.pinSecret()).update(pin).digest('hex');
  }

  hashDeviceId(deviceId: string): string {
    return createHash('sha256').update(deviceId).digest('hex');
  }

  rateLimitKey(ip: string): string {
    return `guestpin:login-fail:${ip}`;
  }

  /** Select minimal pour résoudre le spaceId d'un SpaceElement (builder v1 : floor/
   *  forecourt/externalMerch ; builder v2 : zone) — copie volontaire de
   *  SpaceMenuScopeService.resolveShopSpaceId, même justification que
   *  resolveShopConfigId ci-dessous : ne pas toucher space-menus.service.ts pour un
   *  besoin invité. */
  private readonly elementSpaceSelect = {
    id: true,
    name: true,
    floor: { select: { config: { select: { spaceId: true } } } },
    forecourt: { select: { config: { select: { spaceId: true } } } },
    externalMerch: { select: { config: { select: { spaceId: true } } } },
    zone: { select: { spaceId: true } },
  } as const;

  /** Résout le PDV depuis le slug scanné + son spaceId — nécessaire pour trouver LA
   *  fenêtre ouverte de son espace (le PIN n'identifie plus le PDV, cf. login ci-dessous,
   *  seul le slug de l'URL le fait désormais). */
  async resolveElementBySlug(
    slug: string,
  ): Promise<{ id: string; name: string; spaceId: string | null } | null> {
    const element = await this.prisma.spaceElement.findUnique({
      where: { slug },
      select: this.elementSpaceSelect,
    });
    if (!element) return null;
    const el = element as any;
    const config = el.floor?.config ?? el.forecourt?.config ?? el.externalMerch?.config ?? null;
    const spaceId = config?.spaceId ?? el.zone?.spaceId ?? null;
    return { id: el.id, name: el.name, spaceId };
  }

  generatePin(): string {
    return String(randomInt(0, 1_000_000)).padStart(6, '0');
  }

  readWindowPin(window: Pick<InventoryWindow, 'pinLookupHash' | 'pinCiphertext'>): string | null {
    return window.pinLookupHash ? decryptPin(window.pinCiphertext, this.pinSecret()) : null;
  }
}
