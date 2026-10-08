import { BadRequestException } from '@nestjs/common';
import { KitchenType } from '@prisma/client';
import type { PrismaService } from '../../core/database/prisma.service';

/**
 * Cuisine d'un composant ou d'un menu item (demande Bertrand 2026-10-08) : « Cuisine
 * Locale » (kitchenType Local) ou une cuisine de Settings (kitchenId, kitchenType
 * Central). Renvoie les deux champs cohérents à écrire, ou {} si le DTO ne touche pas
 * à la cuisine. Une cuisine d'un autre client est refusée.
 */
export async function resolveKitchenFields(
  prisma: PrismaService,
  dto: { kitchenType?: KitchenType | null; kitchenId?: string | null },
  tenantId: string,
): Promise<{ kitchenType?: KitchenType | null; kitchenId?: string | null }> {
  if (dto.kitchenId) {
    const kitchen = await prisma.kitchen.findFirst({ where: { id: dto.kitchenId, tenantId }, select: { id: true } });
    if (!kitchen) throw new BadRequestException(`Kitchen ${dto.kitchenId} not found`);
    return { kitchenType: KitchenType.Central, kitchenId: kitchen.id };
  }
  if (dto.kitchenType === KitchenType.Local) return { kitchenType: KitchenType.Local, kitchenId: null };
  // Central sans cuisine n'a plus de sens (ancienne option « Cuisine Centrale ») : champ vidé.
  if (dto.kitchenId === null || dto.kitchenType === null || dto.kitchenType === KitchenType.Central) {
    return { kitchenType: null, kitchenId: null };
  }
  return {};
}
