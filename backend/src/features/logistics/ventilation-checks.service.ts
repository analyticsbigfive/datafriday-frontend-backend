import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { uniqueIds } from './ventilation-deposits.service';

/** Valeur de `elementId` pour la coche de l'article entier (pas NULL : unique Postgres). */
export const ARTICLE_ELEMENT_ID = '';

export interface VentilationCheckInput {
  itemKey: string;
  elementId?: string;
  checked?: boolean;
  quantity?: number | null;
  comment?: string | null;
}

export interface VentilationCheckView {
  itemKey: string;
  elementId: string;
  checked: boolean;
  quantity: number | null;
  comment: string | null;
}

/** Clé d'une sélection de matchs : ids triés, sans doublon, joints par une virgule. */
export function eventKeyOf(eventIds: string[]): string {
  return uniqueIds(eventIds).sort().join(',');
}

/**
 * Validations de dépôt de la Ventilation (coches, quantité modifiée, commentaire),
 * persistées pour être partagées entre appareils (Logistique et accès PIN).
 */
@Injectable()
export class VentilationChecksService {
  constructor(private readonly prisma: PrismaService) {}

  async list(spaceId: string, tenantId: string, eventIds: string[]): Promise<VentilationCheckView[]> {
    const eventKey = eventKeyOf(eventIds);
    if (!eventKey) return [];
    const rows = await this.prisma.ventilationDepositCheck.findMany({ where: { tenantId, spaceId, eventKey } });
    return rows.map(toView);
  }

  /**
   * Crée ou met à jour une ligne. Champs absents = inchangés. Une coche de ligne qui
   * passe à false remet la coche de l'article à false dans la même transaction.
   */
  async upsert(
    spaceId: string,
    tenantId: string,
    eventIds: string[],
    dto: VentilationCheckInput,
    actor?: string | null,
  ): Promise<VentilationCheckView> {
    const eventKey = eventKeyOf(eventIds);
    const elementId = dto.elementId ?? ARTICLE_ELEMENT_ID;
    const itemKey = dto.itemKey;
    const changes: Prisma.VentilationDepositCheckUpdateInput = { updatedBy: actor ?? null };
    if (dto.checked !== undefined) changes.checked = dto.checked;
    if (dto.quantity !== undefined) changes.quantity = dto.quantity;
    const comment = dto.comment?.trim() ? dto.comment.trim() : null;
    if (dto.comment !== undefined) changes.comment = comment;

    const row = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.ventilationDepositCheck.upsert({
        where: { tenantId_spaceId_eventKey_itemKey_elementId: { tenantId, spaceId, eventKey, itemKey, elementId } },
        create: {
          tenantId,
          spaceId,
          eventKey,
          itemKey,
          elementId,
          checked: dto.checked ?? false,
          quantity: dto.quantity ?? null,
          comment,
          updatedBy: actor ?? null,
        },
        update: changes,
      });
      if (dto.checked === false && elementId !== ARTICLE_ELEMENT_ID) {
        await tx.ventilationDepositCheck.updateMany({
          where: { tenantId, spaceId, eventKey, itemKey, elementId: ARTICLE_ELEMENT_ID, checked: true },
          data: { checked: false, updatedBy: actor ?? null },
        });
      }
      return saved;
    });
    return toView(row);
  }
}

function toView(r: { itemKey: string; elementId: string; checked: boolean; quantity: Prisma.Decimal | null; comment: string | null }): VentilationCheckView {
  return {
    itemKey: r.itemKey,
    elementId: r.elementId,
    checked: r.checked,
    quantity: r.quantity == null ? null : Number(r.quantity),
    comment: r.comment,
  };
}
