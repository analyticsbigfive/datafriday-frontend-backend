import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import type { PosAvailability } from '../pos.contracts';
import { classifyAvailability, PosAvailabilityOptions, remainingUnitsFor, resolveLowThreshold } from './pos-availability-rules';
import { PosRecipeRequirementsService } from './pos-recipe-requirements.service';
import { PosStockSnapshotService } from './pos-stock-snapshot.service';

export interface PosItemAvailability {
  availability: PosAvailability;
  remainingUnits: number | null;
}

/**
 * Disponibilité des articles d'un PdV (lot L5, interface 2 du PLAN §5 bis).
 *
 * Pour un PdV : stock courant par clé (cliché Logistic, une passe), besoin par unité vendue de
 * chaque article (une passe, recettes chargées par lots), puis inversion de la recette :
 * unités vendables = minimum, sur les composants suivis, de floor(stock / besoin).
 * 'out' à 0, 'low' sous le seuil (cf. pos-availability-rules.ts), null si aucun stock suivi.
 * Aucune requête par article.
 */
@Injectable()
export class PosAvailabilityService {
  constructor(
    private readonly stock: PosStockSnapshotService,
    private readonly requirements: PosRecipeRequirementsService,
    private readonly prisma: PrismaService,
  ) {}

  async computeForPdv(
    tenantId: string,
    spaceId: string,
    eventId: string,
    elementId: string,
    menuItemIds: string[],
    options?: PosAvailabilityOptions,
  ): Promise<Map<string, PosItemAvailability>> {
    const ids = [...new Set(menuItemIds)];
    const result = new Map<string, PosItemAvailability>();
    if (!ids.length) return result;
    const [stock, perUnit, setting] = await Promise.all([
      this.stock.forElement(tenantId, spaceId, elementId),
      this.requirements.perUnitByMenuItem(tenantId, ids),
      // Seuil réglé sur l'évènement (PosEventSetting.lowStockUnits), sauf si l'appelant l'impose.
      options?.lowThreshold == null
        ? this.prisma.posEventSetting.findFirst({ where: { tenantId, eventId }, select: { lowStockUnits: true } })
        : Promise.resolve(null),
    ]);
    const lowThreshold = resolveLowThreshold({ lowThreshold: options?.lowThreshold ?? setting?.lowStockUnits });
    for (const id of ids) {
      const remainingUnits = remainingUnitsFor(perUnit.get(id), stock);
      result.set(id, { availability: classifyAvailability(remainingUnits, lowThreshold), remainingUnits });
    }
    return result;
  }
}
